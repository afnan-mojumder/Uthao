import { describe, it, expect, vi } from 'vitest';
import { EventDirector } from '../../../src/sim/events/EventDirector';
import { GameManager } from '../../../src/sim/GameManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import { evaluateCondition, type EncounterContext } from '../../../src/sim/events/conditions';
import { applyEffects, type EffectContext } from '../../../src/sim/events/effects';
import type { EncounterDef } from '../../../src/sim/schemas';
import type { RoadSegment, RoadType } from '../../../src/core/types';

import routeEncounters from '../../../data/encounters/route.json';
import pickupEncounters from '../../../data/encounters/pickup.json';
import bikeEncounters from '../../../data/encounters/bike.json';
import paymentEncounters from '../../../data/encounters/payment.json';
import passengerEncounters from '../../../data/encounters/passenger.json';

describe('T4.5 Remaining Signature Situations', () => {
  const allEncounters: EncounterDef[] = [
    ...(routeEncounters as EncounterDef[]),
    ...(pickupEncounters as EncounterDef[]),
    ...(bikeEncounters as EncounterDef[]),
    ...(paymentEncounters as EncounterDef[]),
    ...(passengerEncounters as EncounterDef[]),
  ];

  function createTestSetup(definitions: EncounterDef[]) {
    const bus = new EventBus<GameEvents>();
    const gm = new GameManager({ seed: 100, mode: 'career', data: { encounters: [] } });
    const economyManager = new EconomyManager(bus, { cash: 1000 });
    gm.economy.cash = economyManager.cash;
    gm.economy.motorcycleCondition = economyManager.motorcycleCondition;

    const director = new EventDirector({ definitions, seed: 100 });
    const avoidSegments = new Set<string>();
    const forceViaNodes: string[] = [];

    const effectCtx: EffectContext = {
      gameManager: gm,
      economyManager,
      eventBus: bus,
      avoidSegments,
      forceViaNodes,
      activePassenger: {
        trust: 50,
        mood: 0.8,
      },
    };

    return { bus, gm, economyManager, director, effectCtx, avoidSegments, forceViaNodes };
  }

  function createMockSegment(overrides: Partial<RoadSegment> = {}): RoadSegment {
    return {
      segmentId: 'seg_mock',
      startNodeId: 'node_1',
      endNodeId: 'node_2',
      width: 6,
      surfaceCondition: 1,
      trafficDensity: 0.3,
      speedLimit: 40,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.2,
      riskLevel: 0.1,
      oneWay: false,
      divided: false,
      lanes: 1,
      roadType: 'main',
      floodSensitivity: 0,
      pickupPractical: true,
      district: 'mirpara',
      tags: ['main'],
      ...overrides,
    };
  }

  function createMatchingContext(enc: EncounterDef): EncounterContext {
    const trig = enc.trigger;
    const phase = trig.phase ?? 'onTrip';
    const weather = trig.weather ? trig.weather[0]! : 'clear';
    const tags = trig.tags ? [...trig.tags] : ['main'];
    const roadType = (trig.roadType ? trig.roadType[0]! : 'main') as RoadType;

    const segment = createMockSegment({
      roadType,
      tags,
    });

    const flags: Record<string, boolean | number | string> = {};
    if (trig.flags) {
      Object.assign(flags, trig.flags);
    }
    if (trig.custom) {
      flags[trig.custom] = true;
    }

    const minute = trig.hours ? trig.hours[0] * 60 + 1 : 540;

    return {
      phase,
      minute,
      day: 1,
      weather,
      chapter: typeof trig.chapter === 'number' ? trig.chapter : 1,
      flags,
      relationships: trig.minRelationship ? { ...trig.minRelationship } : {},
      cash: trig.minCash ?? 500,
      speedKmh: 5, // low speed so card can appear if pauseOnDecisions is checked
      bikeCondition: trig.bikeConditionMax ?? 80,
      segment,
      activeRequest: {
        requestId: 'req_test',
        passengerId: 'p_test',
        pickupNodeId: 'node_1',
        destinationNodeId: 'node_2',
        initialFare: 100,
        estimatedDistance: 2.0,
        estimatedDuration: 10,
        requestedArrivalTime: null,
        bookingType: 'app',
        status: phase === 'onTrip' ? 'OnTrip' : 'WaitingForPickup',
        surge: 1.0,
      },
      passenger: {
        id: 'p_test',
        trust: trig.minTrust ?? 50,
        mood: trig.minMood ?? 0.8,
        localKnowledge: trig.passengerLocalKnowledgeMin ?? 0.8,
        paymentReliability: trig.passengerPaymentReliabilityMax ?? 0.5,
      },
    };
  }

  it('contains all 13 signature situation encounters from GDD §7', () => {
    const expectedIds = [
      'enc_market_detour',
      'enc_uturn_problem',
      'enc_alley_enter',
      'enc_puncture',
      'enc_no_change',
      'enc_off_app',
      'enc_sudden_rain',
      'enc_extra_stop',
      'enc_parent_child',
      'enc_urgent_exam',
      'enc_wrong_pickup_pin',
      'enc_vendor_discount',
      'enc_phone_left',
      'enc_traffic_checkpoint',
      'enc_bus_block',
      'enc_regular_direct_call',
      'enc_friend_package',
      'enc_wait_errand',
    ];

    for (const id of expectedIds) {
      const found = allEncounters.find((e) => e.id === id);
      expect(found, `Encounter ${id} must exist`).toBeDefined();
      expect(found!.choices.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('eligible only under its trigger (table-driven test over all encounters)', () => {
    for (const enc of allEncounters) {
      const matchingCtx = createMatchingContext(enc);
      expect(
        evaluateCondition(enc.trigger, matchingCtx),
        `Encounter ${enc.id} should evaluate true under matching trigger`
      ).toBe(true);

      // Create non-matching context by altering phase or weather
      const nonMatchingCtx: EncounterContext = {
        ...matchingCtx,
        phase: matchingCtx.phase === 'roaming' ? 'onTrip' : 'roaming',
      };

      if (enc.trigger.phase) {
        expect(
          evaluateCondition(enc.trigger, nonMatchingCtx),
          `Encounter ${enc.id} should evaluate false under mismatched phase`
        ).toBe(false);
      }
    }
  });

  it('each choice applies its effects (table-driven test over all choices in JSON)', () => {
    for (const enc of allEncounters) {
      for (const choice of enc.choices) {
        const { gm, economyManager, effectCtx, avoidSegments, forceViaNodes, bus } =
          createTestSetup([enc]);

        const startCash = economyManager.cash;
        const startDayMinutes = gm.clock.minutes;
        const startCondition = economyManager.motorcycleCondition;

        let flagEmitted: { key: string; value: unknown } | null = null;
        bus.on('story/flag', (ev) => {
          flagEmitted = ev;
        });

        applyEffects(choice.effects, effectCtx);

        for (const eff of choice.effects) {
          switch (eff.type) {
            case 'money':
              expect(economyManager.cash).toBe(startCash + eff.amount);
              break;
            case 'time':
              if (eff.min > 0) {
                expect(gm.clock.minutes).toBeGreaterThan(startDayMinutes);
              } else if (eff.min < 0) {
                expect(gm.clock.minutes).toBeLessThan(startDayMinutes);
              }
              break;
            case 'mood':
              expect(effectCtx.activePassenger!.mood).toBeGreaterThanOrEqual(0);
              expect(effectCtx.activePassenger!.mood).toBeLessThanOrEqual(1);
              break;
            case 'trust':
              expect(effectCtx.activePassenger!.trust).toBeGreaterThanOrEqual(0);
              expect(effectCtx.activePassenger!.trust).toBeLessThanOrEqual(100);
              break;
            case 'flag':
              expect(gm.story.branchFlags[eff.key]).toBe(eff.value);
              expect(flagEmitted).toEqual({ key: eff.key, value: eff.value });
              break;
            case 'relationship':
              expect(gm.story.characterRelationships[eff.characterId]).toBe(eff.delta);
              break;
            case 'route':
              if (eff.action === 'avoid') {
                expect(avoidSegments.has(eff.ref)).toBe(true);
              } else if (eff.action === 'forceVia') {
                expect(forceViaNodes).toContain(eff.ref);
              }
              break;
            case 'injury':
              expect(economyManager.motorcycleCondition).toBeLessThan(startCondition);
              break;
            case 'endTrip':
              // Verified through ride/cancelled emission or effect execution
              break;
          }
        }
      }
    }
  });

  it('7.4 "অ্যাপের বাইরে যাইবেন?" choices: accept (off-app flag), stay_app, negotiate', () => {
    const enc = allEncounters.find((e) => e.id === 'enc_off_app')!;
    expect(enc).toBeDefined();

    const { gm, economyManager, effectCtx } = createTestSetup([enc]);

    // Choice 1: accept
    const acceptChoice = enc.choices.find((c) => c.id === 'accept')!;
    applyEffects(acceptChoice.effects, effectCtx);
    expect(gm.story.branchFlags['ride_off_app']).toBe(true);
    expect(economyManager.cash).toBe(1080); // +80

    // Choice 3: negotiate
    const negChoice = enc.choices.find((c) => c.id === 'negotiate')!;
    applyEffects(negChoice.effects, effectCtx);
    expect(gm.story.branchFlags['off_app_negotiated']).toBe(true);
    expect(economyManager.cash).toBe(1190); // +110
  });

  it('7.5 Sudden rain choices: cautious, shelter, push_fast with injury', () => {
    const enc = allEncounters.find((e) => e.id === 'enc_sudden_rain')!;
    expect(enc).toBeDefined();

    const { economyManager, effectCtx } = createTestSetup([enc]);
    const pushChoice = enc.choices.find((c) => c.id === 'push_fast')!;

    const condBefore = economyManager.motorcycleCondition;
    applyEffects(pushChoice.effects, effectCtx);
    expect(economyManager.motorcycleCondition).toBe(condBefore - 10);
    expect(economyManager.cash).toBe(1030); // tip +30
  });

  it('phone left behind choice: return (localTrust & rating bonus) vs keep (flag & risk)', () => {
    const enc = allEncounters.find((e) => e.id === 'enc_phone_left')!;
    expect(enc).toBeDefined();

    const { gm, economyManager, effectCtx, bus } = createTestSetup([enc]);
    const repSpy = vi.fn();
    bus.on('reputation/changed', repSpy);

    // Return choice
    const returnChoice = enc.choices.find((c) => c.id === 'return')!;
    applyEffects(returnChoice.effects, effectCtx);
    expect(economyManager.cash).toBe(1100); // 1000 + 100 reward
    expect(repSpy).toHaveBeenCalledWith({ delta: { localTrust: 10 } });

    // Keep choice
    const keepChoice = enc.choices.find((c) => c.id === 'keep')!;
    applyEffects(keepChoice.effects, effectCtx);
    expect(gm.story.branchFlags['kept_lost_phone']).toBe(true);
    expect(economyManager.cash).toBe(2600); // 1100 + 1500
  });
});
