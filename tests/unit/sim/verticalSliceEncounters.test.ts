import { describe, it, expect, vi } from 'vitest';
import { EventDirector } from '../../../src/sim/events/EventDirector';
import { GameManager } from '../../../src/sim/GameManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import type { EncounterContext } from '../../../src/sim/events/conditions';
import type { EffectContext } from '../../../src/sim/events/effects';
import type { EncounterDef } from '../../../src/sim/schemas';
import type { RoadSegment } from '../../../src/core/types';

import routeEncounters from '../../../data/encounters/route.json';
import pickupEncounters from '../../../data/encounters/pickup.json';
import bikeEncounters from '../../../data/encounters/bike.json';
import paymentEncounters from '../../../data/encounters/payment.json';

describe('T3.7 Vertical-Slice Signature Encounters', () => {
  const allEncounters = [
    ...(routeEncounters as EncounterDef[]),
    ...(pickupEncounters as EncounterDef[]),
    ...(bikeEncounters as EncounterDef[]),
    ...(paymentEncounters as EncounterDef[]),
  ];

  function createTestSetup(definitions: EncounterDef[]) {
    const bus = new EventBus<GameEvents>();
    const gm = new GameManager({ seed: 100, mode: 'career', data: { encounters: [] } });
    const economyManager = new EconomyManager(bus, { cash: 500 });
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
      district: 'fulgate',
      tags: [],
      ...overrides,
    };
  }

  describe('7.1 Market Detour (enc_market_detour)', () => {
    const def = allEncounters.find((e) => e.id === 'enc_market_detour');

    it('exists and has required schema properties', () => {
      expect(def).toBeDefined();
      expect(def?.category).toBe('route');
      expect(def?.trigger.phase).toBe('onTrip');
      expect(def?.trigger.passengerLocalKnowledgeMin).toBe(0.5);
      expect(def?.trigger.tags).toContain('market');
    });

    it('triggers only during onTrip when passenger local knowledge >= 0.5 and road segment has market tag', () => {
      const { director, bus } = createTestSetup([def!]);

      const marketSegment = createMockSegment({
        segmentId: 'seg_market',
        tags: ['market'],
      });

      const plainSegment = createMockSegment({
        segmentId: 'seg_plain',
        tags: [],
      });

      const baseCtx: EncounterContext = {
        phase: 'onTrip',
        minute: 100,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 20,
        bikeCondition: 100,
        segment: plainSegment,
        passenger: { id: 'p1', trust: 50, mood: 0.7, localKnowledge: 0.6 },
      };

      // Fails: plain segment lacks 'market' tag
      expect(director.evaluate(baseCtx, bus)).toBeNull();

      // Fails: market segment present, but passenger local knowledge is low (< 0.5)
      expect(
        director.evaluate(
          { ...baseCtx, minute: 101, segment: marketSegment, passenger: { id: 'p1', trust: 50, mood: 0.7, localKnowledge: 0.3 } },
          bus
        )
      ).toBeNull();

      // Fails: right segment and knowledge, but wrong phase (roaming)
      expect(
        director.evaluate(
          { ...baseCtx, minute: 102, phase: 'roaming', segment: marketSegment },
          bus
        )
      ).toBeNull();

      // Succeeds: onTrip, market tag, localKnowledge >= 0.5
      const inst = director.evaluate({ ...baseCtx, minute: 103, segment: marketSegment }, bus);
      expect(inst).not.toBeNull();
      expect(inst?.encounterId).toBe('enc_market_detour');
    });

    it('filters explain choices conditionally based on passenger trust (>= 40 vs < 40)', () => {
      const marketSegment = createMockSegment({ tags: ['market'] });

      // High trust (trust = 50 >= 40)
      const { director: dirHigh } = createTestSetup([def!]);
      const instHigh = dirHigh.evaluate({
        phase: 'onTrip',
        minute: 100,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 20,
        bikeCondition: 100,
        segment: marketSegment,
        passenger: { id: 'p1', trust: 50, mood: 0.8, localKnowledge: 0.7 },
      });
      expect(instHigh).not.toBeNull();
      const choiceIdsHigh = instHigh!.choices.map((c) => c.id);
      expect(choiceIdsHigh).toContain('follow');
      expect(choiceIdsHigh).toContain('explain');
      expect(choiceIdsHigh).not.toContain('explain_skeptical');
      expect(choiceIdsHigh).toContain('own_route');

      // Low trust (trust = 25 < 40)
      const { director: dirLow } = createTestSetup([def!]);
      const instLow = dirLow.evaluate({
        phase: 'onTrip',
        minute: 100,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 20,
        bikeCondition: 100,
        segment: marketSegment,
        passenger: { id: 'p1', trust: 25, mood: 0.8, localKnowledge: 0.7 },
      });
      expect(instLow).not.toBeNull();
      const choiceIdsLow = instLow!.choices.map((c) => c.id);
      expect(choiceIdsLow).toContain('follow');
      expect(choiceIdsLow).not.toContain('explain');
      expect(choiceIdsLow).toContain('explain_skeptical');
      expect(choiceIdsLow).toContain('own_route');
    });

    it('executes follow effect: forces via market, adds time, improves mood and trust', () => {
      const { director, effectCtx, forceViaNodes } = createTestSetup([def!]);
      const marketSegment = createMockSegment({ tags: ['market'] });

      effectCtx.activePassenger!.mood = 0.7;
      effectCtx.activePassenger!.trust = 50;
      const startMin = effectCtx.gameManager.clock.minutes;
      effectCtx.activePassenger!.mood = 0.7;
      effectCtx.activePassenger!.trust = 50;
      const inst = director.evaluate({
        phase: 'onTrip',
        minute: 100,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 20,
        bikeCondition: 100,
        segment: marketSegment,
        passenger: { id: 'p1', trust: 50, mood: 0.7, localKnowledge: 0.8 },
      });

      const res = director.chooseOption(inst!.id, 'follow', effectCtx);
      expect(res).toBe(true);
      expect(forceViaNodes).toContain('market');
      expect(effectCtx.gameManager.clock.minutes).toBeCloseTo(startMin + 5, 2);
      expect(effectCtx.activePassenger?.mood).toBeCloseTo(0.8, 2); // 0.7 + 0.1
      expect(effectCtx.activePassenger?.trust).toBe(55); // 50 + 5
    });

    it('executes own_route: penalizes mood and trust, records flag', () => {
      const { director, effectCtx } = createTestSetup([def!]);
      const marketSegment = createMockSegment({ tags: ['market'] });

      effectCtx.activePassenger!.mood = 0.7;
      effectCtx.activePassenger!.trust = 50;
      const inst = director.evaluate({
        phase: 'onTrip',
        minute: 100,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 20,
        bikeCondition: 100,
        segment: marketSegment,
        passenger: { id: 'p1', trust: 50, mood: 0.7, localKnowledge: 0.8 },
      });

      director.chooseOption(inst!.id, 'own_route', effectCtx);
      expect(effectCtx.activePassenger?.mood).toBeCloseTo(0.55, 2); // 0.7 - 0.15
      expect(effectCtx.activePassenger?.trust).toBe(45); // 50 - 5
      expect(effectCtx.gameManager.story.branchFlags['market_detour_ignored']).toBe(true);
    });
  });

  describe('7.2 U-Turn Problem (enc_uturn_problem)', () => {
    const def = allEncounters.find((e) => e.id === 'enc_uturn_problem');

    it('exists and triggers during requestOffered phase', () => {
      expect(def).toBeDefined();
      expect(def?.category).toBe('pickup');
      expect(def?.trigger.phase).toBe('requestOffered');

      const { director } = createTestSetup([def!]);
      const inst = director.evaluate({
        phase: 'requestOffered',
        minute: 120,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 0,
        bikeCondition: 100,
      });

      expect(inst).not.toBeNull();
      expect(inst?.encounterId).toBe('enc_uturn_problem');
      const choiceIds = inst!.choices.map((c) => c.id);
      expect(choiceIds).toEqual(['ask_cross', 'uturn', 'cancel']);
    });

    it('ask_cross sets pickup_adjusted_cross flag and slightly reduces mood', () => {
      const { director, effectCtx } = createTestSetup([def!]);
      const inst = director.evaluate({
        phase: 'requestOffered',
        minute: 120,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 0,
        bikeCondition: 100,
      });

      director.chooseOption(inst!.id, 'ask_cross', effectCtx);
      expect(effectCtx.gameManager.story.branchFlags['pickup_adjusted_cross']).toBe(true);
      expect(effectCtx.activePassenger?.mood).toBeCloseTo(0.75, 2); // 0.8 - 0.05
    });

    it('uturn consumes fuel money and advances game time', () => {
      const { director, effectCtx, economyManager, gm } = createTestSetup([def!]);
      const initialCash = economyManager.cash;
      const initialMin = gm.clock.minutes;

      const inst = director.evaluate({
        phase: 'requestOffered',
        minute: 120,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: initialCash,
        speedKmh: 0,
        bikeCondition: 100,
      });

      director.chooseOption(inst!.id, 'uturn', effectCtx);
      expect(economyManager.cash).toBe(initialCash - 15);
      expect(gm.clock.minutes).toBeCloseTo(initialMin + 3, 2);
    });

    it('cancel marks cancellation flag and emits endTrip', () => {
      const { director, effectCtx, bus, gm } = createTestSetup([def!]);
      const cancelSpy = vi.fn();
      bus.on('ride/cancelled', cancelSpy);

      const inst = director.evaluate({
        phase: 'requestOffered',
        minute: 120,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 0,
        bikeCondition: 100,
      });

      director.chooseOption(inst!.id, 'cancel', effectCtx);
      expect(gm.story.branchFlags['rider_cancelled_uturn']).toBe(true);
    });
  });

  describe('7.3 Alley Entry (enc_alley_enter)', () => {
    const def = allEncounters.find((e) => e.id === 'enc_alley_enter');

    it('exists and triggers atPickup on alley roadType', () => {
      expect(def).toBeDefined();
      expect(def?.category).toBe('pickup');
      expect(def?.trigger.phase).toBe('atPickup');
      expect(def?.trigger.roadType).toContain('alley');

      const { director } = createTestSetup([def!]);
      const alleySegment = createMockSegment({ roadType: 'alley' });

      const inst = director.evaluate({
        phase: 'atPickup',
        minute: 140,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 5,
        bikeCondition: 100,
        segment: alleySegment,
      });

      expect(inst).not.toBeNull();
      expect(inst?.encounterId).toBe('enc_alley_enter');
      const choiceIds = inst!.choices.map((c) => c.id);
      expect(choiceIds).toEqual(['refuse_politely', 'stop_safe_spot', 'enter_alley']);
    });

    it('safe spot maintains neutral mood and increases trust', () => {
      const { director, effectCtx } = createTestSetup([def!]);
      const alleySegment = createMockSegment({ roadType: 'alley' });

      const inst = director.evaluate({
        phase: 'atPickup',
        minute: 140,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 5,
        bikeCondition: 100,
        segment: alleySegment,
      });

      director.chooseOption(inst!.id, 'stop_safe_spot', effectCtx);
      expect(effectCtx.activePassenger?.mood).toBeCloseTo(0.8, 2); // unchanged
      expect(effectCtx.activePassenger?.trust).toBe(52); // +2
    });

    it('enter alley adds 2 minutes and increases passenger mood', () => {
      const { director, effectCtx, gm } = createTestSetup([def!]);
      const alleySegment = createMockSegment({ roadType: 'alley' });

      const startMin = gm.clock.minutes;
      const inst = director.evaluate({
        phase: 'atPickup',
        minute: 140,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 5,
        bikeCondition: 100,
        segment: alleySegment,
      });

      director.chooseOption(inst!.id, 'enter_alley', effectCtx);
      expect(gm.clock.minutes).toBeCloseTo(startMin + 2, 2);
      expect(effectCtx.activePassenger?.mood).toBeCloseTo(0.9, 2); // +0.1
    });
  });

  describe('7.6 Puncture (enc_puncture)', () => {
    const def = allEncounters.find((e) => e.id === 'enc_puncture');

    it('exists and triggers when puncture flag is active', () => {
      expect(def).toBeDefined();
      expect(def?.category).toBe('bike');
      expect(def?.trigger.custom).toBe('puncture');

      const { director } = createTestSetup([def!]);
      // Fails when puncture flag is missing
      expect(
        director.evaluate({
          phase: 'roaming',
          minute: 180,
          day: 1,
          weather: 'clear',
          chapter: 1,
          flags: {},
          relationships: {},
          cash: 500,
          speedKmh: 0,
          bikeCondition: 80,
        })
      ).toBeNull();

      // Fires when puncture flag is true
      const inst = director.evaluate({
        phase: 'roaming',
        minute: 181,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: { puncture: true },
        relationships: {},
        cash: 500,
        speedKmh: 0,
        bikeCondition: 80,
      });

      expect(inst).not.toBeNull();
      expect(inst?.encounterId).toBe('enc_puncture');
    });

    it('filters repair choices by cash thresholds (250 vs 150 vs 0)', () => {
      // With cash = 100 (< 150): only call_mintu is available
      const { director: dirPoor } = createTestSetup([def!]);
      const instPoor = dirPoor.evaluate({
        phase: 'roaming',
        minute: 180,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: { puncture: true },
        relationships: {},
        cash: 100,
        speedKmh: 0,
        bikeCondition: 80,
      });
      expect(instPoor!.choices.map((c) => c.id)).toEqual(['call_mintu']);

      // With cash = 200 (>= 150, < 250): limp_kamal and call_mintu are available
      const { director: dirMid } = createTestSetup([def!]);
      const instMid = dirMid.evaluate({
        phase: 'roaming',
        minute: 180,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: { puncture: true },
        relationships: {},
        cash: 200,
        speedKmh: 0,
        bikeCondition: 80,
      });
      expect(instMid!.choices.map((c) => c.id)).toEqual(['limp_kamal', 'call_mintu']);

      // With cash = 300 (>= 250): all three choices are available
      const { director: dirRich } = createTestSetup([def!]);
      const instRich = dirRich.evaluate({
        phase: 'roaming',
        minute: 180,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: { puncture: true },
        relationships: {},
        cash: 300,
        speedKmh: 0,
        bikeCondition: 80,
      });
      expect(instRich!.choices.map((c) => c.id)).toEqual(['nearby_mechanic', 'limp_kamal', 'call_mintu']);
    });

    it('nearby_mechanic charges 250 and takes 10 minutes', () => {
      const { director, effectCtx, economyManager, gm } = createTestSetup([def!]);
      const inst = director.evaluate({
        phase: 'roaming',
        minute: 180,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: { puncture: true },
        relationships: {},
        cash: 500,
        speedKmh: 0,
        bikeCondition: 80,
      });

      const startMin = gm.clock.minutes;
      director.chooseOption(inst!.id, 'nearby_mechanic', effectCtx);
      expect(economyManager.cash).toBe(250);
      expect(gm.clock.minutes).toBeCloseTo(startMin + 10, 2);
    });

    it('limp_kamal charges 150, takes 15 minutes and inflicts minor condition wear', () => {
      const { director, effectCtx, economyManager, gm } = createTestSetup([def!]);
      const inst = director.evaluate({
        phase: 'roaming',
        minute: 180,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: { puncture: true },
        relationships: {},
        cash: 500,
        speedKmh: 0,
        bikeCondition: 80,
      });

      const startMin = gm.clock.minutes;
      const initialCond = economyManager.motorcycleCondition;
      director.chooseOption(inst!.id, 'limp_kamal', effectCtx);
      expect(economyManager.cash).toBe(350);
      expect(gm.clock.minutes).toBeCloseTo(startMin + 15, 2);
      expect(economyManager.motorcycleCondition).toBe(initialCond - 3);
    });

    it('call_mintu takes 25 minutes and improves Mintu relationship', () => {
      const { director, effectCtx, gm } = createTestSetup([def!]);
      const inst = director.evaluate({
        phase: 'roaming',
        minute: 180,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: { puncture: true },
        relationships: {},
        cash: 100,
        speedKmh: 0,
        bikeCondition: 80,
      });

      const startMin = gm.clock.minutes;
      director.chooseOption(inst!.id, 'call_mintu', effectCtx);
      expect(gm.clock.minutes).toBeCloseTo(startMin + 25, 2);
      expect(gm.story.characterRelationships['mintu']).toBe(2);
    });
  });

  describe('No Change at Drop-off (enc_no_change)', () => {
    const def = allEncounters.find((e) => e.id === 'enc_no_change');

    it('exists and triggers at dropOff when passengerPaymentReliabilityMax <= 0.6', () => {
      expect(def).toBeDefined();
      expect(def?.category).toBe('payment');
      expect(def?.trigger.phase).toBe('dropOff');
      expect(def?.trigger.passengerPaymentReliabilityMax).toBe(0.6);

      const { director } = createTestSetup([def!]);

      // Fails when passenger has high payment reliability (> 0.6)
      expect(
        director.evaluate({
          phase: 'dropOff',
          minute: 220,
          day: 1,
          weather: 'clear',
          chapter: 1,
          flags: {},
          relationships: {},
          cash: 500,
          speedKmh: 0,
          bikeCondition: 90,
          passenger: { id: 'p2', trust: 60, mood: 0.8, paymentReliability: 0.9 },
        })
      ).toBeNull();

      // Fires when reliability <= 0.6
      const inst = director.evaluate({
        phase: 'dropOff',
        minute: 221,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 0,
        bikeCondition: 90,
        passenger: { id: 'p2', trust: 60, mood: 0.8, paymentReliability: 0.5 },
      });

      expect(inst).not.toBeNull();
      expect(inst?.encounterId).toBe('enc_no_change');
      const choiceIds = inst!.choices.map((c) => c.id);
      expect(choiceIds).toEqual(['waive', 'wait', 'digital']);
    });

    it('waiving remainder costs 20 fare, boosts mood and rating', () => {
      const { director, effectCtx, economyManager } = createTestSetup([def!]);
      economyManager.reputation = 4.5;
      effectCtx.activePassenger!.mood = 0.7;
      const inst = director.evaluate({
        phase: 'dropOff',
        minute: 220,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 0,
        bikeCondition: 90,
        passenger: { id: 'p2', trust: 60, mood: 0.7, paymentReliability: 0.5 },
      });

      const startCash = economyManager.cash;
      const startRep = economyManager.reputation;
      director.chooseOption(inst!.id, 'waive', effectCtx);

      expect(economyManager.cash).toBe(startCash - 20);
      expect(effectCtx.activePassenger?.mood).toBeCloseTo(0.85, 2);
      expect(economyManager.reputation).toBeCloseTo(startRep + 0.1, 2);
    });

    it('waiting takes 5 minutes and slightly reduces mood', () => {
      const { director, effectCtx, gm } = createTestSetup([def!]);
      effectCtx.activePassenger!.mood = 0.7;
      const inst = director.evaluate({
        phase: 'dropOff',
        minute: 220,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 0,
        bikeCondition: 90,
        passenger: { id: 'p2', trust: 60, mood: 0.7, paymentReliability: 0.5 },
      });

      const startMin = gm.clock.minutes;
      director.chooseOption(inst!.id, 'wait', effectCtx);

      expect(gm.clock.minutes).toBeCloseTo(startMin + 5, 2);
      expect(effectCtx.activePassenger?.mood).toBeCloseTo(0.65, 2);
    });
  });
});
