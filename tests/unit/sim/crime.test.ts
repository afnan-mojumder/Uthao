import { describe, it, expect } from 'vitest';
import crimeEncounters from '../../../data/encounters/crime.json';
import mirparaData from '../../../data/districts/mirpara.json';
import {
  sampleCrimeOutcome,
  calculateSegmentEncounterProbability,
  resolveFlee,
  resolveRobbery,
  isSuspiciousRequest,
  getTimeMultiplier,
} from '../../../src/sim/events/flee';
import { evaluateCondition } from '../../../src/sim/events/conditions';
import { EventDirector } from '../../../src/sim/events/EventDirector';
import { GameManager } from '../../../src/sim/GameManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import { Rng } from '../../../src/core/rng';
import type { RoadSegment, PlayerEconomy } from '../../../src/core/types';
import type { EncounterContext } from '../../../src/sim/events/conditions';
import type { DistrictData, EncounterDef } from '../../../src/sim/schemas';

describe('Crime and Suspicious-Pickup System (T4.6)', () => {
  it('most risky-archetype rides are harmless (≥ 55% over 1k)', () => {
    const rng = new Rng(42);
    const n = 1000;
    let harmlessCount = 0;
    let suspiciousCount = 0;
    let dangerousCount = 0;

    for (let i = 0; i < n; i++) {
      const outcome = sampleCrimeOutcome(rng);
      if (outcome === 'harmless') harmlessCount++;
      else if (outcome === 'suspicious') suspiciousCount++;
      else if (outcome === 'dangerous') dangerousCount++;
    }

    const harmlessRatio = harmlessCount / n;
    // Expected split: 60% harmless, 30% suspicious, 10% dangerous
    expect(harmlessRatio).toBeGreaterThanOrEqual(0.55);
    expect(harmlessRatio).toBeCloseTo(0.6, 1);
    expect(suspiciousCount / n).toBeCloseTo(0.3, 1);
    expect(dangerousCount / n).toBeCloseTo(0.1, 1);
  });

  it('turn-around always offered before dangerous segment', () => {
    // 1. Check all static crime encounter definitions
    for (const enc of crimeEncounters) {
      const choiceIds = enc.choices.map((c) => c.id);
      expect(choiceIds).toContain('turn_around');

      // The game never offers a "fight" option
      for (const choice of enc.choices) {
        expect(choice.id.toLowerCase()).not.toContain('fight');
        expect(choice.labelKey.toLowerCase()).not.toContain('fight');
      }
    }

    // 2. Check dynamic segment crime evaluation via EventDirector
    const director = new EventDirector({
      definitions: crimeEncounters as unknown as EncounterDef[],
      seed: 12345,
    });

    const dangerousSegment: RoadSegment = {
      segmentId: 'alley_seg_99',
      startNodeId: 'N1',
      endNodeId: 'N2',
      width: 4,
      surfaceCondition: 0.5,
      trafficDensity: 0.1,
      speedLimit: 20,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.2,
      riskLevel: 0.9, // very dangerous segment
      oneWay: false,
      divided: false,
      lanes: 1,
      roadType: 'alley',
      floodSensitivity: 0.1,
      pickupPractical: true,
      district: 'puranpara',
      tags: ['alley', 'dark'],
    };

    const ctx: EncounterContext = {
      phase: 'onTrip',
      minute: 23 * 60 + 30, // 23:30 late night
      day: 3,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 800,
      speedKmh: 10,
      bikeCondition: 70,
      segment: dangerousSegment,
    };

    // 2. Check dynamic segment crime evaluation via EventDirector
    const deterministicRng = {
      chance: () => true,
      next: () => 0.95, // dangerous outcome (> 0.9)
      int: () => 1234,
      range: () => 0.5,
      pick: <T>(arr: T[]) => arr[0]!,
    } as unknown as Rng;

    const res = director.evaluateSegmentCrime(
      dangerousSegment,
      ctx,
      undefined,
      deterministicRng
    );

    expect(res.triggered).toBe(true);
    expect(res.outcome).toBe('dangerous');
    expect(res.instance).not.toBeNull();

    const choiceIds = res.instance!.choices.map((c) => c.id);
    expect(choiceIds).toContain('turn_around');
    expect(choiceIds).not.toContain('fight');
  });

  it('robbery never touches savings', () => {
    const initialEconomy: PlayerEconomy = {
      cash: 1000,
      dailyRevenue: 0,
      dailyExpenses: 0,
      fuelLevel: 5.0,
      motorcycleCondition: 80,
      appBalance: 15000,
      debt: 0,
      reputation: 5.0,
      savings: 25000,
      phoneBattery: 100,
    };

    const bus = new EventBus<GameEvents>();
    const economyManager = new EconomyManager(bus, initialEconomy);

    const rng = new Rng(777);
    const robbery = resolveRobbery(economyManager.cash, rng);

    // Loses 40-70% of cash-on-hand
    expect(robbery.cashLost).toBeGreaterThanOrEqual(1000 * 0.4);
    expect(robbery.cashLost).toBeLessThanOrEqual(1000 * 0.7);
    expect(robbery.remainingCash).toBe(1000 - robbery.cashLost);

    // Apply robbery loss through official economy transaction
    economyManager.post({
      id: 'tx_robbery_test',
      day: 1,
      minute: 1300,
      kind: 'robbery',
      amount: -robbery.cashLost,
    });

    // Cash decreased
    expect(economyManager.cash).toBe(robbery.remainingCash);

    // Savings and appBalance are strictly untouched
    expect(initialEconomy.savings).toBe(25000);
    expect(initialEconomy.appBalance).toBe(15000);
  });

  it('encounter rate scales with riskLevel × night', () => {
    // 1. Scaling with riskLevel at same time
    const dayMinute = 12 * 60; // 12:00 midday (timeMult = 1.0)
    const pLowRisk = calculateSegmentEncounterProbability({
      riskLevel: 0.2,
      minute: dayMinute,
    });
    const pHighRisk = calculateSegmentEncounterProbability({
      riskLevel: 0.8,
      minute: dayMinute,
    });

    // 0.8 / 0.2 = 4x
    expect(pHighRisk / pLowRisk).toBeCloseTo(4.0, 5);

    // 2. Scaling with time of day (day vs night vs lateNight)
    const nightMinute = 20 * 60; // 20:00 (timeMult = 1.5)
    const lateNightMinute = 2 * 60; // 02:00 (timeMult = 2.0)

    expect(getTimeMultiplier(dayMinute)).toBe(1.0);
    expect(getTimeMultiplier(nightMinute)).toBe(1.5);
    expect(getTimeMultiplier(lateNightMinute)).toBe(2.0);

    const pDay = calculateSegmentEncounterProbability({
      riskLevel: 0.5,
      minute: dayMinute,
    });
    const pNight = calculateSegmentEncounterProbability({
      riskLevel: 0.5,
      minute: nightMinute,
    });
    const pLateNight = calculateSegmentEncounterProbability({
      riskLevel: 0.5,
      minute: lateNightMinute,
    });

    expect(pNight / pDay).toBeCloseTo(1.5, 5);
    expect(pLateNight / pDay).toBeCloseTo(2.0, 5);

    // Combined scaling: riskLevel * night
    // risk 0.8 at late night vs risk 0.2 at day:
    // (0.8 * 2.0) / (0.2 * 1.0) = 1.6 / 0.2 = 8.0x
    const pCombined = calculateSegmentEncounterProbability({
      riskLevel: 0.8,
      minute: lateNightMinute,
    });
    expect(pCombined / pLowRisk).toBeCloseTo(8.0, 5);
  });

  it('flee resolution: speed > 15 km/h and condition > 50 gives 80% success, else 40%', () => {
    // Fast and good condition
    const resGood = resolveFlee({
      speedKmh: 25,
      bikeCondition: 80,
    });
    expect(resGood.probability).toBe(0.8);

    // Slow and good condition
    const resSlow = resolveFlee({
      speedKmh: 10,
      bikeCondition: 80,
    });
    expect(resSlow.probability).toBe(0.4);

    // Fast and poor condition
    const resPoor = resolveFlee({
      speedKmh: 25,
      bikeCondition: 30,
    });
    expect(resPoor.probability).toBe(0.4);

    // Statistical check over 1,000 trials
    const rng = new Rng(101);
    let successCountGood = 0;
    let successCountBad = 0;
    for (let i = 0; i < 1000; i++) {
      if (resolveFlee({ speedKmh: 20, bikeCondition: 70, rng }).success) {
        successCountGood++;
      }
      if (resolveFlee({ speedKmh: 5, bikeCondition: 40, rng }).success) {
        successCountBad++;
      }
    }
    expect(successCountGood / 1000).toBeCloseTo(0.8, 1);
    expect(successCountBad / 1000).toBeCloseTo(0.4, 1);
  });

  it('suspicious request cues detection per GDD §8', () => {
    // 1. Fare >= 1.6x fair fare
    expect(
      isSuspiciousRequest({
        initialFare: 160,
        fairFare: 100,
        minute: 12 * 60,
      })
    ).toBe(true);

    expect(
      isSuspiciousRequest({
        initialFare: 120,
        fairFare: 100,
        minute: 12 * 60,
      })
    ).toBe(false);

    // 2. Pickup on deadEnd alley after 21:00 (1260 min)
    expect(
      isSuspiciousRequest({
        initialFare: 80,
        fairFare: 80,
        minute: 22 * 60, // 22:00
        isDeadEnd: true,
      })
    ).toBe(true);

    expect(
      isSuspiciousRequest({
        initialFare: 80,
        fairFare: 80,
        minute: 22 * 60,
        roadType: 'alley',
      })
    ).toBe(true);

    // Same alley during midday (12:00) is not inherently suspicious
    expect(
      isSuspiciousRequest({
        initialFare: 80,
        fairFare: 80,
        minute: 12 * 60,
        roadType: 'alley',
      })
    ).toBe(false);
  });

  it('5000 ordinary Ch1 alley visits trigger 0 robberies', () => {
    const ch1Alleys = (mirparaData as DistrictData).segments.filter(
      (s) => s.roadType === 'alley'
    );
    expect(ch1Alleys.length).toBeGreaterThan(0);

    const director = new EventDirector({
      definitions: crimeEncounters as unknown as EncounterDef[],
      seed: 2026,
    });
    const rng = new Rng(99);

    let robberyCount = 0;
    for (let i = 0; i < 5000; i++) {
      const seg = ch1Alleys[i % ch1Alleys.length]!;
      const minute = 20 * 60 + (i % 240);
      const ctx: EncounterContext = {
        phase: i % 2 === 0 ? 'onTrip' : 'roaming',
        minute,
        day: 1 + Math.floor(i / 240),
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 600,
        speedKmh: 0,
        bikeCondition: 85,
        segment: seg,
      };
      const evalInst = director.evaluate(ctx);
      if (
        evalInst &&
        (evalInst.encounterId === 'enc_dark_alley_blockage' ||
          evalInst.encounterId === 'enc_robbery_attempt')
      ) {
        robberyCount++;
      }

      const segCrime = director.evaluateSegmentCrime(seg, ctx, undefined, rng);
      if (
        segCrime.instance &&
        (segCrime.instance.encounterId === 'enc_dark_alley_blockage' ||
          segCrime.instance.encounterId === 'enc_robbery_attempt')
      ) {
        robberyCount++;
      }
      director.activeEncounter = null;
      director.activeEncounterDef = null;
    }

    expect(robberyCount).toBe(0);
  });

  it('dark-alley robbery choices depend on hasEscapePath, witnesses, passengerTrust, and meterMax', () => {
    const darkSeg: RoadSegment = {
      segmentId: 'seg_dark_alley',
      startNodeId: 'N1',
      endNodeId: 'N2',
      width: 4,
      surfaceCondition: 0.5,
      trafficDensity: 0.1,
      speedLimit: 20,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0.9,
      oneWay: false,
      divided: false,
      lanes: 1,
      roadType: 'alley',
      floodSensitivity: 0.1,
      pickupPractical: true,
      district: 'puranpara',
      tags: ['alley', 'dark'],
    };

    const director = new EventDirector({
      definitions: crimeEncounters as unknown as EncounterDef[],
      seed: 42,
    });

    // Dead-end, no witnesses, low passenger trust -> no try_flee, no call_help, no protect
    const blockedInst = director.forceStart('enc_dark_alley_blockage', undefined, {
      phase: 'onTrip',
      minute: 22 * 60,
      day: 6,
      weather: 'clear',
      chapter: 3,
      flags: {},
      relationships: {},
      cash: 500,
      speedKmh: 0,
      bikeCondition: 80,
      segment: darkSeg,
      hasEscapePath: false,
      witnesses: 0,
      passenger: { id: 'p1', trust: 20, mood: 0.6 },
    });
    expect(blockedInst).not.toBeNull();
    const blockedIds = blockedInst!.choices.map((c) => c.id);
    expect(blockedIds).not.toContain('try_flee');
    expect(blockedIds).not.toContain('call_help');
    expect(blockedIds).not.toContain('protect');
    expect(blockedIds).toContain('comply');
    director.activeEncounter = null;
    director.activeEncounterDef = null;

    // Escape path + witnesses + high passenger trust -> all contextual options offered
    const openInst = director.forceStart('enc_dark_alley_blockage', undefined, {
      phase: 'onTrip',
      minute: 22 * 60,
      day: 6,
      weather: 'clear',
      chapter: 3,
      flags: {},
      relationships: {},
      cash: 500,
      speedKmh: 0,
      bikeCondition: 80,
      segment: darkSeg,
      hasEscapePath: true,
      witnesses: 3,
      passenger: { id: 'p1', trust: 70, mood: 0.8 },
    });
    expect(openInst).not.toBeNull();
    const openIds = openInst!.choices.map((c) => c.id);
    expect(openIds).toContain('try_flee');
    expect(openIds).toContain('call_help');
    expect(openIds).toContain('protect');

    // Condition helpers directly verify passengerTrustMin, witnessesMin, hasEscapePath, meterMax
    expect(
      evaluateCondition(
        {
          hasEscapePath: true,
          witnessesMin: 2,
          passengerTrustMin: 50,
          meterMax: { criminalExposure: 25 },
        } as never,
        {
          phase: 'onTrip',
          minute: 1300,
          day: 5,
          weather: 'clear',
          chapter: 3,
          flags: {},
          relationships: {},
          cash: 500,
          speedKmh: 0,
          bikeCondition: 80,
          hasEscapePath: true,
          witnesses: 2,
          meters: { criminalExposure: 20 },
          passenger: { id: 'p1', trust: 60, mood: 0.7 },
        } as never
      )
    ).toBe(true);

    expect(
      evaluateCondition(
        { meterMax: { criminalExposure: 10 } } as never,
        {
          phase: 'onTrip',
          minute: 1300,
          day: 5,
          weather: 'clear',
          chapter: 3,
          flags: {},
          relationships: {},
          cash: 500,
          speedKmh: 0,
          bikeCondition: 80,
          meters: { criminalExposure: 25 },
        } as never
      )
    ).toBe(false);
  });

  it('comply loses cash via robbery tx without reputation hit; protect rewards trust and reputation', () => {
    // 1. Comply
    const gmComply = new GameManager({
      seed: 31,
      mode: 'career',
      data: { encounters: crimeEncounters } as never,
    });
    gmComply.economyManager.cash = 1000;
    gmComply.economy.cash = 1000;
    gmComply.economyManager.savings = 5000;
    const txs: Array<{ kind: string; amount: number }> = [];
    gmComply.bus.on('economy/transaction', ({ tx }) => txs.push({ kind: tx.kind, amount: tx.amount }));

    const repBefore = gmComply.reputationSystem.getMeters().publicReputation;
    const integrityBefore = gmComply.reputationSystem.getMeters().riderIntegrity;
    const standingBefore = gmComply.reputationSystem.getMeters().platformStanding;
    const ratingBefore = gmComply.reputationSystem.getAppRating();

    const instComply = gmComply.eventDirector.forceStart('enc_dark_alley_blockage', gmComply.bus);
    expect(instComply).not.toBeNull();
    gmComply.dispatch({
      type: 'chooseEncounterOption',
      instanceId: instComply!.id,
      choiceId: 'comply',
    });

    expect(gmComply.economyManager.cash).toBeLessThan(1000);
    expect(gmComply.economyManager.cash).toBeGreaterThanOrEqual(300);
    expect(gmComply.economyManager.savings).toBe(5000);
    expect(txs.some((t) => t.kind === 'robbery' && t.amount < 0)).toBe(true);
    expect(gmComply.reputationSystem.getMeters().publicReputation).toBe(repBefore);
    expect(gmComply.reputationSystem.getMeters().riderIntegrity).toBe(integrityBefore);
    expect(gmComply.reputationSystem.getMeters().platformStanding).toBe(standingBefore);
    expect(gmComply.reputationSystem.getAppRating()).toBe(ratingBefore);

    // 2. Protect
    const gmProtect = new GameManager({
      seed: 32,
      mode: 'career',
      data: { encounters: crimeEncounters } as never,
    });
    const instProtect = gmProtect.eventDirector.forceStart('enc_dark_alley_blockage', gmProtect.bus, {
      phase: 'onTrip',
      minute: 22 * 60,
      day: 5,
      weather: 'clear',
      chapter: 3,
      flags: {},
      relationships: {},
      cash: 800,
      speedKmh: 0,
      bikeCondition: 80,
      hasEscapePath: true,
      witnesses: 0,
      passenger: { id: 'char_nabila', trust: 75, mood: 0.8 },
    } as never);
    expect(instProtect).not.toBeNull();
    const pub0 = gmProtect.reputationSystem.getMeters().publicReputation;
    const int0 = gmProtect.reputationSystem.getMeters().riderIntegrity;
    gmProtect.dispatch({
      type: 'chooseEncounterOption',
      instanceId: instProtect!.id,
      choiceId: 'protect',
    });
    expect(gmProtect.reputationSystem.getMeters().publicReputation).toBeGreaterThan(pub0);
    expect(gmProtect.reputationSystem.getMeters().riderIntegrity).toBeGreaterThan(int0);
  });
});
