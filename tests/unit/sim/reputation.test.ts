import { describe, it, expect } from 'vitest';
import {
  ReputationSystem,
  computeTripRating,
  computeTipChance,
} from '../../../src/sim/reputation/ReputationSystem';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { RequestGenerator } from '../../../src/sim/ride/RequestGenerator';
import { Rng } from '../../../src/core/rng';
import { GameManager } from '../../../src/sim/GameManager';
import { RideManager } from '../../../src/sim/ride/RideManager';
import { applyEffect, type EffectContext } from '../../../src/sim/events/effects';
import type { RideRequest } from '../../../src/core/types';

describe('ReputationSystem (T4.2)', () => {
  it('rating rolling window', () => {
    const rep = new ReputationSystem({ windowSize: 50 });

    // Initial rating with no rides
    expect(rep.getAppRating()).toBe(5.0);
    expect(rep.getRatingsHistory()).toEqual([]);

    // Record 50 perfect rides
    for (let i = 0; i < 50; i++) {
      rep.recordTripRating(5.0);
    }
    expect(rep.getAppRating()).toBe(5.0);
    expect(rep.getRatingsHistory().length).toBe(50);

    // 51st ride is a terrible crash (1.0)
    // The window evicts the first 5.0: 49 fives + 1 one = 246 / 50 = 4.92
    rep.recordTripRating(1.0);
    expect(rep.getRatingsHistory().length).toBe(50);
    expect(rep.getAppRating()).toBe(4.92);

    // Add 49 more 1.0 ratings -> window is now entirely 1.0 ratings
    for (let i = 0; i < 49; i++) {
      rep.recordTripRating(1.0);
    }
    expect(rep.getRatingsHistory().length).toBe(50);
    expect(rep.getAppRating()).toBe(1.0);

    // Add 50 ratings of 4.0 -> all 1.0s are pushed out
    for (let i = 0; i < 50; i++) {
      rep.recordTripRating(4.0);
    }
    expect(rep.getRatingsHistory().length).toBe(50);
    expect(rep.getAppRating()).toBe(4.0);
  });

  it('careful passenger penalises near miss double', () => {
    // 1 near miss:
    // Standard passenger: -0.3 penalty -> 4.7
    const standard1 = computeTripRating({ nearMisses: 1, isCareful: false });
    // Careful passenger: -0.3 * 2 = -0.6 penalty -> 4.4
    const careful1 = computeTripRating({ nearMisses: 1, isCareful: true });

    expect(standard1).toBe(4.7);
    expect(careful1).toBe(4.4);

    const standardPenalty1 = 5.0 - standard1;
    const carefulPenalty1 = 5.0 - careful1;
    expect(carefulPenalty1).toBeCloseTo(standardPenalty1 * 2, 5);

    // 2 near misses:
    // Standard: -0.6 -> 4.4
    // Careful: -1.2 -> 3.8
    const standard2 = computeTripRating({ nearMisses: 2, isCareful: false });
    const careful2 = computeTripRating({ nearMisses: 2, isCareful: true });

    expect(standard2).toBe(4.4);
    expect(careful2).toBe(3.8);

    const standardPenalty2 = 5.0 - standard2;
    const carefulPenalty2 = 5.0 - careful2;
    expect(carefulPenalty2).toBeCloseTo(standardPenalty2 * 2, 5);
  });

  it('low rating reduces request rate', () => {
    const highRep = new ReputationSystem();
    expect(highRep.getAppRating()).toBe(5.0);
    expect(highRep.getRequestRateMultiplier()).toBe(1.0);
    expect(highRep.isAppWarned()).toBe(false);
    expect(highRep.isAppSuspended()).toBe(false);

    // Create a low rating system with app rating = 3.8 (< 4.0 threshold)
    const lowRep = new ReputationSystem();
    for (let i = 0; i < 50; i++) {
      lowRep.recordTripRating(3.8);
    }
    expect(lowRep.getAppRating()).toBe(3.8);
    expect(lowRep.getRequestRateMultiplier()).toBe(0.7);

    // Create warning rating system with app rating = 3.4 (< 3.5 warning threshold)
    const warnRep = new ReputationSystem();
    for (let i = 0; i < 50; i++) {
      warnRep.recordTripRating(3.4);
    }
    expect(warnRep.getAppRating()).toBe(3.4);
    expect(warnRep.isAppWarned()).toBe(true);
    expect(warnRep.isAppSuspended()).toBe(false);

    // Create suspended rating system with app rating = 2.8 (< 3.0 suspension threshold)
    const suspendBus = new EventBus<GameEvents>();
    let suspendedFlagEmitted = false;
    suspendBus.on('story/flag', ({ key, value }) => {
      if (key === 'appSuspended' && value === true) {
        suspendedFlagEmitted = true;
      }
    });

    const suspendRep = new ReputationSystem({ bus: suspendBus });
    for (let i = 0; i < 50; i++) {
      suspendRep.recordTripRating(2.8);
    }
    expect(suspendRep.getAppRating()).toBe(2.8);
    expect(suspendRep.isAppSuspended()).toBe(true);
    expect(suspendedFlagEmitted).toBe(true);

    // Now test directly against RequestGenerator
    const testDistrict = {
      districtId: 'testloop' as const,
      name: { bn: 'টেস্ট', en: 'Test' },
      nodes: [
        { nodeId: 'N1', x: 0, z: 0, kind: 'junction' as const },
        { nodeId: 'N2', x: 100, z: 0, kind: 'junction' as const },
        { nodeId: 'N3', x: 200, z: 0, kind: 'junction' as const },
      ],
      segments: [
        {
          segmentId: 'S1',
          startNodeId: 'N1',
          endNodeId: 'N2',
          width: 10,
          surfaceCondition: 1.0,
          trafficDensity: 0.2,
          speedLimit: 40,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0.1,
          riskLevel: 0.1,
          oneWay: false,
          divided: false,
          lanes: 2,
          roadType: 'main' as const,
          floodSensitivity: 0.1,
          pickupPractical: true,
          district: 'testloop' as const,
          tags: [],
        },
        {
          segmentId: 'S2',
          startNodeId: 'N2',
          endNodeId: 'N3',
          width: 10,
          surfaceCondition: 1.0,
          trafficDensity: 0.2,
          speedLimit: 40,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0.1,
          riskLevel: 0.1,
          oneWay: false,
          divided: false,
          lanes: 2,
          roadType: 'main' as const,
          floodSensitivity: 0.1,
          pickupPractical: true,
          district: 'testloop' as const,
          tags: [],
        },
      ],
      pois: [],
    };
    const network = RoadNetwork.fromDistricts([testDistrict]);

    const seed = 98765;
    const normalGen = new RequestGenerator(network, new Rng(seed), {
      reputationSystem: highRep,
    });
    const lowGen = new RequestGenerator(network, new Rng(seed), {
      reputationSystem: lowRep,
    });

    let normalCount = 0;
    let lowCount = 0;

    // Simulate 300 game minutes counting app requests (recurring direct calls bypass the app rating multiplier)
    for (let m = 480; m < 780; m++) {
      normalCount += normalGen.tick(1, m, 'clear').filter((r) => r.bookingType === 'app').length;
      lowCount += lowGen.tick(1, m, 'clear').filter((r) => r.bookingType === 'app').length;
    }

    expect(lowCount).toBeLessThan(normalCount);
    // Low count is approximately 70% of normal count
    const ratio = lowCount / normalCount;
    expect(ratio).toBeGreaterThan(0.6);
    expect(ratio).toBeLessThan(0.8);
  });

  it('trip rating formula: bumps, crash, lateness, helpful choices, and clamping', () => {
    // Crash always gives 1.0
    expect(computeTripRating({ crashed: true })).toBe(1.0);
    expect(computeTripRating({ crashed: true, helpfulChoices: 5 })).toBe(1.0);

    // Bumps: -1.0 per bump
    expect(computeTripRating({ bumps: 1 })).toBe(4.0);
    expect(computeTripRating({ bumps: 2 })).toBe(3.0);

    // Urgent lateness: -0.5 per 5 game-min late
    expect(computeTripRating({ isUrgent: true, minutesLate: 5 })).toBe(4.5);
    expect(computeTripRating({ isUrgent: true, minutesLate: 10 })).toBe(4.0);

    // Non-urgent lateness: no penalty
    expect(computeTripRating({ isUrgent: false, minutesLate: 15 })).toBe(5.0);

    // Helpful choice: +0.3
    // Clamped to 5.0
    expect(computeTripRating({ helpfulChoices: 1 })).toBe(5.0);
    // Helpful choice recovers after a bump
    expect(computeTripRating({ bumps: 1, helpfulChoices: 1 })).toBe(4.3);

    // Lower bound clamping to 1.0
    expect(computeTripRating({ bumps: 10 })).toBe(1.0);
  });

  it('publicReputation clamping and mutations', () => {
    const rep = new ReputationSystem();
    expect(rep.getMeters().publicReputation).toBe(30);

    rep.applyMeter('publicReputation', 20, 'karma.local_trust');
    expect(rep.getMeters().publicReputation).toBe(50);

    rep.applyMeter('publicReputation', 100, 'karma.local_trust');
    expect(rep.getMeters().publicReputation).toBe(100); // capped at 100

    rep.applyMeter('publicReputation', -150, 'karma.local_trust');
    expect(rep.getMeters().publicReputation).toBe(0); // floored at 0
  });

  it('character relationships clamping and mutations', () => {
    const rep = new ReputationSystem();
    expect(rep.getRelationship('kamal')).toBe(0);

    rep.changeRelationship('kamal', 25);
    expect(rep.getRelationship('kamal')).toBe(25);

    rep.changeRelationship('kamal', 100);
    expect(rep.getRelationship('kamal')).toBe(100); // capped at 100

    rep.changeRelationship('kamal', -250);
    expect(rep.getRelationship('kamal')).toBe(-100); // floored at -100
  });

  it('safety record, risk score, and promises tracking', () => {
    const rep = new ReputationSystem();
    expect(rep.getSafetyRecord()).toEqual({
      nearMisses: 0,
      bumps: 0,
      crashes: 0,
      infractions: 0,
    });

    rep.recordNearMiss();
    rep.recordCollision('bump');
    rep.recordCollision('crash');
    rep.recordInfraction();

    expect(rep.getSafetyRecord()).toEqual({
      nearMisses: 1,
      bumps: 1,
      crashes: 1,
      infractions: 1,
    });

    expect(rep.getRiskScore()).toBe(0);
    rep.addRiskScore(3);
    expect(rep.getRiskScore()).toBe(3);

    expect(rep.getPromisesRecord()).toEqual({ kept: 0, broken: 0 });
    rep.recordPromiseKept();
    rep.recordPromiseBroken();
    expect(rep.getPromisesRecord()).toEqual({ kept: 1, broken: 1 });
  });

  it('event bus hooks and active trip lifecycle', () => {
    const bus = new EventBus<GameEvents>();
    const rep = new ReputationSystem({ bus });

    rep.startTrip({ requestId: 'trip_1', isCareful: true });
    expect(rep.getActiveTrip()?.isCareful).toBe(true);

    bus.emit('bike/nearMiss', { distanceM: 0.5, speedKmh: 25 });
    bus.emit('bike/collision', { severity: 'bump', relSpeedKmh: 12 });
    bus.emit('bike/infraction', { kind: 'wrongWay', segmentId: 'seg_1' });

    // Active trip has 1 near miss (careful = -0.6) and 1 bump (-1.0)
    // Rating = 5.0 - 0.6 - 1.0 = 3.4
    expect(rep.getActiveTripRating()).toBe(3.4);

    const finalRating = rep.completeActiveTrip();
    expect(finalRating).toBe(3.4);
    expect(rep.getActiveTrip()).toBeNull();
    expect(rep.getAppRating()).toBe(3.4);

    // Test reputation/changed event listening
    bus.emit('reputation/changed', {
      delta: {
        localTrust: 15,
        relationship: { characterId: 'nabila', delta: 10 },
        riskScore: 2,
        promisesKept: 1,
        promisesBroken: 1,
      },
    });

    expect(rep.getMeters().publicReputation).toBe(45); // 30 + 15
    expect(rep.getRelationship('nabila')).toBe(10);
    expect(rep.getRiskScore()).toBe(2);
    expect(rep.getPromisesRecord()).toEqual({ kept: 1, broken: 1 });
  });

  it('tip probability calculation per GDD §6', () => {
    // 5.0 -> 0.1 + 0.3 * 1.0 = 0.4 (40%)
    expect(computeTipChance(5.0)).toBeCloseTo(0.4, 5);
    // 4.0 -> 0.1 + 0.3 * 0 = 0.1 (10%)
    expect(computeTipChance(4.0)).toBeCloseTo(0.1, 5);
    // 3.0 -> clamped to 0
    expect(computeTipChance(3.0)).toBe(0);
  });
});

describe('T7.5: effect bug fixes', () => {
  function makeEffectCtx(gm: GameManager, rideManager?: RideManager): EffectContext {
    return {
      gameManager: gm,
      economyManager: gm.economyManager,
      rideManager,
      eventBus: gm.bus,
    };
  }

  it('a relationship effect changes the value once (single store)', () => {
    const gm = new GameManager({ seed: 1, mode: 'career', data: {} });
    const ctx = makeEffectCtx(gm);
    const start = gm.reputationSystem.getRelationship('char_kamal');

    applyEffect({ type: 'relationship', characterId: 'char_kamal', delta: 5 }, ctx);

    expect(gm.reputationSystem.getRelationship('char_kamal')).toBe(start + 5);
    // story.characterRelationships IS reputationSystem's own store — not a
    // second copy that can drift from it.
    expect(gm.story.characterRelationships['char_kamal']).toBe(start + 5);
  });

  it('a rating effect applies and is not reset by a later unrelated reputation/changed event', () => {
    const gm = new GameManager({ seed: 2, mode: 'career', data: {} });
    const ctx = makeEffectCtx(gm);
    const before = gm.reputationSystem.getAppRating();

    applyEffect({ type: 'rating', delta: -0.5 }, ctx);
    const afterRating = gm.economy.reputation;
    expect(afterRating).toBeCloseTo(before - 0.5, 5);

    // A later, unrelated relationship effect also emits reputation/changed.
    // The old bug: GameManager's listener resynced economy.reputation from
    // a stale reputationSystem rating every time *any* reputation/changed
    // event fired, clobbering the rating effect's own change.
    applyEffect({ type: 'relationship', characterId: 'char_kamal', delta: 5 }, ctx);
    expect(gm.economy.reputation).toBeCloseTo(afterRating, 5);
  });

  it('endTrip effect cancels the active trip, not just emits an event', () => {
    const testDistrict = {
      districtId: 'testloop' as const,
      name: { bn: 'টেস্ট', en: 'Test' },
      nodes: [
        { nodeId: 'N1', x: 0, z: 0, kind: 'junction' as const },
        { nodeId: 'N2', x: 100, z: 0, kind: 'junction' as const },
      ],
      segments: [
        {
          segmentId: 'S1',
          startNodeId: 'N1',
          endNodeId: 'N2',
          width: 10,
          surfaceCondition: 1.0,
          trafficDensity: 0.2,
          speedLimit: 40,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0.1,
          riskLevel: 0.1,
          oneWay: false,
          divided: false,
          lanes: 2,
          roadType: 'main' as const,
          floodSensitivity: 0.1,
          pickupPractical: true,
          district: 'testloop' as const,
          tags: [],
        },
      ],
      pois: [],
    };
    const network = RoadNetwork.fromDistricts([testDistrict]);

    const gm = new GameManager({ seed: 5, mode: 'career', data: {} });
    const rideManager = new RideManager({ roadNetwork: network, bus: gm.bus });
    gm.rideManager = rideManager;

    const request: RideRequest = {
      requestId: 'req_endtrip',
      passengerId: 'p_test',
      pickupNodeId: 'N1',
      destinationNodeId: 'N2',
      initialFare: 100,
      estimatedDistance: 0.1,
      estimatedDuration: 2,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1.0,
    };
    rideManager.offer(request);
    rideManager.accept(request.requestId);
    expect(rideManager.getActiveRequest()).not.toBeNull();

    const ctx = makeEffectCtx(gm, rideManager);
    applyEffect({ type: 'endTrip', paid: false }, ctx);

    expect(rideManager.getActiveRequest()).toBeNull();
  });

  it('injury no longer damages the bike unless target is bike', () => {
    const gm = new GameManager({ seed: 6, mode: 'career', data: {} });
    const ctx = makeEffectCtx(gm);
    const startCondition = gm.economyManager.motorcycleCondition;

    applyEffect({ type: 'injury', target: 'rider', severity: 50 }, ctx);
    expect(gm.economyManager.motorcycleCondition).toBe(startCondition);

    applyEffect({ type: 'injury', target: 'passenger', severity: 50 }, ctx);
    expect(gm.economyManager.motorcycleCondition).toBe(startCondition);

    applyEffect({ type: 'injury', target: 'bike', severity: 10 }, ctx);
    expect(gm.economyManager.motorcycleCondition).toBe(startCondition - 10);

    // Back-compat: no target at all still means 'bike'.
    applyEffect({ type: 'injury', severity: 5 }, ctx);
    expect(gm.economyManager.motorcycleCondition).toBe(startCondition - 15);
  });
});

describe('P4.3: 8 bounded attributed karma meters, relationship seeding, single-writer & suspension expiry', () => {
  it('initializes all 6 bounded meters at documented defaults, clamps to [0, 100], logs applied delta in 200-entry ring newest-first, and ignores non-finite/zero deltas', () => {
    const bus = new EventBus<GameEvents>();
    const karmaEvents: unknown[] = [];
    bus.on('karma/changed', ({ event }) => karmaEvents.push(event));

    const clock = { day: 2, minutes: 515 };
    const rep = new ReputationSystem({ bus, clock });

    expect(rep.getMeters()).toEqual({
      riderIntegrity: 50,
      publicReputation: 30,
      platformStanding: 80,
      criminalExposure: 0,
      evidenceExposure: 0,
      safetyRecord: 70,
    });

    // Clamps upper bound and logs applied = clampedNew - prev (not raw delta)
    rep.applyMeter('evidenceExposure', 500, 'karma.test_upper', 'char_morshed');
    expect(rep.getMeters().evidenceExposure).toBe(100);
    const upperEv = rep.getKarmaLog(1)[0]!;
    expect(upperEv.meter).toBe('evidenceExposure');
    expect(upperEv.delta).toBe(500);
    expect(upperEv.applied).toBe(100);
    expect(upperEv.reasonKey).toBe('karma.test_upper');
    expect(upperEv.subjectId).toBe('char_morshed');
    expect(upperEv.day).toBe(2);
    expect(upperEv.minute).toBe(515);
    expect(karmaEvents).toHaveLength(1);

    // Clamps lower bound and logs applied = -80
    rep.applyMeter('platformStanding', -500, 'karma.test_lower');
    expect(rep.getMeters().platformStanding).toBe(0);
    expect(rep.getKarmaLog(1)[0]!.applied).toBe(-80);
    expect(rep.getKarmaLog(1)[0]!.delta).toBe(-500);

    // Non-finite and zero deltas do not corrupt or log
    rep.applyMeter('riderIntegrity', Number.NaN, 'karma.nan');
    rep.applyMeter('riderIntegrity', Number.POSITIVE_INFINITY, 'karma.inf');
    rep.applyMeter('riderIntegrity', Number.NEGATIVE_INFINITY, 'karma.ninf');
    rep.applyMeter('riderIntegrity', 0, 'karma.zero');
    expect(rep.getMeters().riderIntegrity).toBe(50);
    expect(rep.getKarmaLog()).toHaveLength(2);

    // 200-entry ring buffer evicts oldest and preserves newest-first order
    for (let i = 1; i <= 205; i++) {
      rep.applyMeter('riderIntegrity', i % 2 === 0 ? 1 : -1, `karma.ring_${i}`);
    }
    const log = rep.getKarmaLog();
    expect(log).toHaveLength(200);
    expect(log[0]!.reasonKey).toBe('karma.ring_205');
    expect(log[199]!.reasonKey).toBe('karma.ring_6');
    expect(rep.getKarmaLog(3).map((e) => e.reasonKey)).toEqual([
      'karma.ring_205',
      'karma.ring_204',
      'karma.ring_203',
    ]);
  });

  it('collisions, infractions, and safe trips move safetyRecord through applyMeter', () => {
    const bus = new EventBus<GameEvents>();
    const rep = new ReputationSystem({ bus });

    rep.startTrip({ requestId: 'req_safe_1' });
    bus.emit('bike/nearMiss', { distanceM: 0.5, speedKmh: 30 });
    expect(rep.getMeters().safetyRecord).toBe(69);
    expect(rep.getKarmaLog(1)[0]!.reasonKey).toBe('karma.near_miss');

    bus.emit('bike/collision', { severity: 'bump', relSpeedKmh: 12 });
    expect(rep.getMeters().safetyRecord).toBe(64);
    expect(rep.getKarmaLog(1)[0]!.reasonKey).toBe('karma.collision_bump');

    bus.emit('bike/infraction', { kind: 'redLight', segmentId: 'seg_1' });
    expect(rep.getMeters().safetyRecord).toBe(56);
    expect(rep.getKarmaLog(1)[0]!.reasonKey).toBe('karma.infraction');

    bus.emit('bike/collision', { severity: 'crash', relSpeedKmh: 45 });
    expect(rep.getMeters().safetyRecord).toBe(41);
    expect(rep.getKarmaLog(1)[0]!.reasonKey).toBe('karma.collision_crash');

    // Clean trip raises safetyRecord via applyMeter
    rep.startTrip({ requestId: 'req_safe_2' });
    rep.completeActiveTrip();
    expect(rep.getMeters().safetyRecord).toBeGreaterThan(41);
    expect(rep.getKarmaLog(1)[0]!.reasonKey).toBe('karma.safe_trip');
  });

  it('tracks passengerTrust [0..100] with recurring character defaults and canonical passenger IDs', () => {
    const rep = new ReputationSystem();
    expect(rep.getPassengerTrust('p_random_unseen')).toBe(50);
    expect(rep.getPassengerTrust('char_nabila')).toBe(70);
    expect(rep.getPassengerTrust('pass_char_nabila')).toBe(70);

    rep.changePassengerTrust('pass_char_nabila', -25);
    expect(rep.getPassengerTrust('char_nabila')).toBe(45);
    expect(rep.getPassengerTrust('pass_char_nabila')).toBe(45);

    rep.changePassengerTrust('p_random_unseen', 200);
    expect(rep.getPassengerTrust('p_random_unseen')).toBe(100);
    rep.changePassengerTrust('p_random_unseen', -200);
    expect(rep.getPassengerTrust('p_random_unseen')).toBe(0);
  });

  it('seeds story.characterRelationships on boot and resets cleanly on resetCareerState from data/characters.json', () => {
    const gm = new GameManager({ seed: 77, mode: 'career', data: {} });
    expect(gm.story.characterRelationships['char_ma']).toBe(80);
    expect(gm.story.characterRelationships['char_mintu']).toBe(35);
    expect(gm.story.characterRelationships['char_kamal']).toBe(25);
    expect(gm.story.characterRelationships['char_nabila']).toBe(10);
    expect(gm.story.characterRelationships['char_jamil']).toBe(0);

    expect(gm.reputationSystem.getRelationship('char_ma')).toBe(80);
    expect(gm.reputationSystem.getRelationship('char_mintu')).toBe(35);
    expect(gm.reputationSystem.getRelationship('char_kamal')).toBe(25);

    // Mutate state and verify resetCareerState restores defaults and clears karmaLog
    gm.reputationSystem.changeRelationship('char_ma', -50);
    gm.reputationSystem.applyMeter('criminalExposure', 40, 'karma.test');
    gm.reputationSystem.changePassengerTrust('char_nabila', -40);
    gm.resetCareerState();

    expect(gm.story.characterRelationships['char_ma']).toBe(80);
    expect(gm.reputationSystem.getRelationship('char_ma')).toBe(80);
    expect(gm.reputationSystem.getMeters()).toEqual({
      riderIntegrity: 50,
      publicReputation: 30,
      platformStanding: 80,
      criminalExposure: 0,
      evidenceExposure: 0,
      safetyRecord: 70,
    });
    expect(gm.reputationSystem.getKarmaLog()).toHaveLength(0);
    expect(gm.reputationSystem.getPassengerTrust('char_nabila')).toBe(70);
  });

  it('suspends app on low platformStanding (< 20) OR rating < 3.0 AND 3 off-app strikes, and expires cleanly after 2 days', () => {
    // 1. Low platformStanding (< 20)
    const gm1 = new GameManager({ seed: 11, mode: 'career', data: {} });
    gm1.reputationSystem.applyMeter('platformStanding', -65, 'karma.complaint'); // 80 -> 15
    expect(gm1.reputationSystem.getMeters().platformStanding).toBe(15);
    expect(gm1.reputationSystem.isAppSuspended(1)).toBe(true);
    expect(gm1.story.branchFlags['appSuspended']).toBe(true);
    expect(gm1.reputationSystem.isAppSuspended(2)).toBe(true);

    // Advance Day 1 -> Day 2 -> Day 3 via endShift + sleep
    gm1.clock.minutes = 13 * 60;
    gm1.dispatch({ type: 'endShift' });
    gm1.dispatch({ type: 'sleep' });
    expect(gm1.clock.day).toBe(2);
    expect(gm1.reputationSystem.isAppSuspended(2)).toBe(true);
    expect(gm1.story.branchFlags['appSuspended']).toBe(true);

    gm1.clock.minutes = 13 * 60;
    gm1.dispatch({ type: 'endShift' });
    gm1.dispatch({ type: 'sleep' });
    expect(gm1.clock.day).toBe(3);
    expect(gm1.reputationSystem.isAppSuspended(3)).toBe(false);
    expect(gm1.story.branchFlags['appSuspended']).toBe(false);
    expect(gm1.reputationSystem.getMeters().platformStanding).toBeGreaterThanOrEqual(20);

    // 2. Low rating (< 3.0)
    const gm2 = new GameManager({ seed: 12, mode: 'career', data: {} });
    for (let i = 0; i < 5; i++) gm2.reputationSystem.recordTripRating(2.0);
    expect(gm2.reputationSystem.isAppSuspended(1)).toBe(true);
    expect(gm2.story.branchFlags['appSuspended']).toBe(true);

    gm2.clock.minutes = 13 * 60;
    gm2.dispatch({ type: 'endShift' });
    gm2.dispatch({ type: 'sleep' });
    expect(gm2.reputationSystem.isAppSuspended(2)).toBe(true);

    gm2.clock.minutes = 13 * 60;
    gm2.dispatch({ type: 'endShift' });
    gm2.dispatch({ type: 'sleep' });
    expect(gm2.clock.day).toBe(3);
    expect(gm2.reputationSystem.isAppSuspended(3)).toBe(false);
    expect(gm2.story.branchFlags['appSuspended']).toBe(false);
    // Completing a good ride on Day 3 does NOT immediately re-suspend
    gm2.reputationSystem.recordTripRating(5.0);
    expect(gm2.reputationSystem.isAppSuspended(3)).toBe(false);

    // 3. 3 off-app strikes reset strike counter & clear flag after 2 days
    const gm3 = new GameManager({ seed: 13, mode: 'career', data: {} });
    const rideMgr = new RideManager({
      roadNetwork: RoadNetwork.fromDistricts([
        {
          districtId: 'testloop',
          name: { bn: 'টেস্ট', en: 'Test' },
          nodes: [
            { nodeId: 'A', x: 0, z: 0, kind: 'junction' },
            { nodeId: 'B', x: 50, z: 0, kind: 'junction' },
          ],
          segments: [
            {
              segmentId: 'S1',
              startNodeId: 'A',
              endNodeId: 'B',
              width: 8,
              surfaceCondition: 1,
              trafficDensity: 0.2,
              speedLimit: 40,
              turnRestrictions: [],
              motorcycleAccessible: true,
              pedestrianDensity: 0.1,
              riskLevel: 0.1,
              oneWay: false,
              divided: false,
              lanes: 2,
              roadType: 'main',
              floodSensitivity: 0,
              pickupPractical: true,
              district: 'testloop',
              tags: [],
            },
          ],
          pois: [],
        },
      ]),
      bus: gm3.bus,
      reputation: gm3.reputationSystem,
      clock: gm3.clock,
    });
    rideMgr.addStrike(1);
    rideMgr.addStrike(1);
    const s3 = rideMgr.addStrike(1);
    expect(s3.strikes).toBe(3);
    expect(s3.suspended).toBe(true);
    expect(rideMgr.isAppSuspended(1)).toBe(true);
    expect(gm3.story.branchFlags['appSuspended']).toBe(true);

    gm3.clock.minutes = 13 * 60;
    gm3.dispatch({ type: 'endShift' });
    gm3.dispatch({ type: 'sleep' });
    expect(rideMgr.isAppSuspended(2)).toBe(true);

    gm3.clock.minutes = 13 * 60;
    gm3.dispatch({ type: 'endShift' });
    gm3.dispatch({ type: 'sleep' });
    expect(gm3.clock.day).toBe(3);
    expect(rideMgr.isAppSuspended(3)).toBe(false);
    expect(gm3.story.branchFlags['appSuspended']).toBe(false);
    expect(rideMgr.offAppStrikes).toBe(0);
    // Next strike starts fresh at 1 (no immediate re-suspension)
    const nextStrike = rideMgr.addStrike(3);
    expect(nextStrike.strikes).toBe(1);
    expect(nextStrike.suspended).toBe(false);
  });

  it('snapshot and applySnapshot preserve meters, karmaLog, passengerTrust, promises, and characterRelationships', () => {
    const gm = new GameManager({ seed: 91, mode: 'career', data: {} });
    gm.reputationSystem.applyMeter('riderIntegrity', -18, 'karma.mislead_distance', 'char_nabila');
    gm.reputationSystem.applyMeter('criminalExposure', 12, 'karma.phone_kept');
    gm.reputationSystem.changePassengerTrust('char_nabila', -15);
    gm.reputationSystem.changeRelationship('char_kamal', 15);
    gm.reputationSystem.recordPromiseKept();

    const snap = gm.snapshot();
    const gm2 = new GameManager({ seed: 91, mode: 'career', data: {} });
    gm2.applySnapshot(snap);

    expect(gm2.reputationSystem.getMeters()).toEqual(gm.reputationSystem.getMeters());
    expect(gm2.reputationSystem.getKarmaLog()).toEqual(gm.reputationSystem.getKarmaLog());
    expect(gm2.reputationSystem.getPassengerTrust('char_nabila')).toBe(
      gm.reputationSystem.getPassengerTrust('char_nabila')
    );
    expect(gm2.reputationSystem.getRelationship('char_kamal')).toBe(40);
    expect(gm2.story.characterRelationships['char_kamal']).toBe(40);
    expect(gm2.reputationSystem.getPromisesRecord()).toEqual({ kept: 1, broken: 0 });
  });

  it('blocks recurring regular requests when passengerTrust drops below 25', () => {
    const rep = new ReputationSystem();
    rep.setRelationship('char_nabila', 30); // passes relationship >= 15 gate
    const network = RoadNetwork.fromDistricts([
      {
        districtId: 'testloop',
        name: { bn: 'টেস্ট', en: 'Test' },
        nodes: [
          { nodeId: 'N1', x: 0, z: 0, kind: 'junction' },
          { nodeId: 'N2', x: 100, z: 0, kind: 'junction' },
        ],
        segments: [
          {
            segmentId: 'S1',
            startNodeId: 'N1',
            endNodeId: 'N2',
            width: 8,
            surfaceCondition: 1,
            trafficDensity: 0.2,
            speedLimit: 40,
            turnRestrictions: [],
            motorcycleAccessible: true,
            pedestrianDensity: 0.1,
            riskLevel: 0.1,
            oneWay: false,
            divided: false,
            lanes: 2,
            roadType: 'main',
            floodSensitivity: 0,
            pickupPractical: true,
            district: 'testloop',
            tags: [],
          },
        ],
        pois: [],
      },
    ]);
    const gen = new RequestGenerator(network, new Rng(5), { reputationSystem: rep });

    expect(gen.canEmitRecurringRequest('char_nabila')).toBe(true);
    rep.setPassengerTrust('char_nabila', 24);
    expect(gen.canEmitRecurringRequest('char_nabila')).toBe(false);
    rep.setPassengerTrust('char_nabila', 25);
    expect(gen.canEmitRecurringRequest('char_nabila')).toBe(true);
  });

  it('street and offApp rides do not drop app rating or suspend the app account', () => {
    const bus = new EventBus<GameEvents>();
    const rep = new ReputationSystem({ bus });

    rep.startTrip({ requestId: 'req_street_late', bookingType: 'street', isUrgent: true });
    rep.recordLateness(120);
    rep.completeActiveTrip();

    expect(rep.getAppRating()).toBe(5.0);
    expect(rep.getRatingsHistory()).toHaveLength(0);
    expect(rep.isAppSuspended(1)).toBe(false);

    rep.startTrip({ requestId: 'req_offapp_bump', bookingType: 'offApp' });
    rep.recordCollision('crash');
    rep.completeActiveTrip();

    expect(rep.getAppRating()).toBe(5.0);
    expect(rep.isAppSuspended(1)).toBe(false);
    expect(rep.getMeters().safetyRecord).toBe(57); // 70 + 2 (safe first ride) - 15 (crash)
  });

  it('adjustRating dropping below 3.0 triggers a 2-day suspension that expires cleanly on day + 2', () => {
    const gm = new GameManager({ seed: 101, mode: 'career', data: {} });
    gm.reputationSystem.recordTripRating(3.1);
    expect(gm.reputationSystem.isAppSuspended(1)).toBe(false);

    // Complaint penalty nudges rating from 3.1 to 2.8 (< 3.0)
    gm.reputationSystem.adjustRating(-0.3);
    expect(gm.reputationSystem.getAppRating()).toBe(2.8);
    expect(gm.reputationSystem.isAppSuspended(1)).toBe(true);
    expect(gm.story.branchFlags['appSuspended']).toBe(true);
    expect(gm.reputationSystem.getAppSuspendedUntilDay()).toBe(3);

    // Advances cleanly to Day 3 and expires
    gm.clock.minutes = 13 * 60;
    gm.dispatch({ type: 'endShift' });
    gm.dispatch({ type: 'sleep' });
    expect(gm.reputationSystem.isAppSuspended(2)).toBe(true);

    gm.clock.minutes = 13 * 60;
    gm.dispatch({ type: 'endShift' });
    gm.dispatch({ type: 'sleep' });
    expect(gm.clock.day).toBe(3);
    expect(gm.reputationSystem.isAppSuspended(3)).toBe(false);
    expect(gm.story.branchFlags['appSuspended']).toBe(false);

    // Positive nudge below 3.0 does not immediately re-suspend, while a new negative penalty does
    gm.reputationSystem.adjustRating(0.1);
    expect(gm.reputationSystem.isAppSuspended(3)).toBe(false);
    gm.reputationSystem.adjustRating(-0.2);
    expect(gm.reputationSystem.isAppSuspended(3)).toBe(true);
  });

  it('applySnapshot resets dirty prior state when P4.3 fields are omitted and keeps seeded relationships on {}', () => {
    const gm = new GameManager({ seed: 102, mode: 'career', data: {} });

    // Dirty every P4.3 field on prior career
    gm.reputationSystem.applyMeter('riderIntegrity', -40, 'karma.dirty');
    gm.reputationSystem.applyMeter('criminalExposure', 65, 'karma.dirty');
    gm.reputationSystem.applyMeter('platformStanding', -70, 'karma.dirty'); // suspends app
    gm.reputationSystem.addOffAppStrike(1);
    gm.reputationSystem.addOffAppStrike(1);
    gm.reputationSystem.changePassengerTrust('char_nabila', -50);
    gm.reputationSystem.setRelationship('char_ma', -25);
    gm.reputationSystem.recordPromiseKept();

    expect(gm.reputationSystem.getKarmaLog().length).toBeGreaterThan(0);
    expect(gm.reputationSystem.getOffAppStrikes()).toBe(2);
    expect(gm.reputationSystem.isAppSuspended(1)).toBe(true);

    // Restore minimal/legacy snapshot missing new P4.3 fields and passing empty {} relationships
    const legacySnap = gm.snapshot();
    legacySnap.reputation = {
      rating: 4.5,
      localTrust: 42,
      safetyRecord: { nearMisses: 1, bumps: 0, crashes: 0, infractions: 0 },
      riskScore: 3,
      promises: { kept: 0, broken: 0 },
    };
    legacySnap.story.characterRelationships = {};

    gm.applySnapshot(legacySnap);

    // Omitted P4.3 fields must NOT bleed through from prior state
    expect(gm.reputationSystem.getMeters()).toEqual({
      riderIntegrity: 50,
      publicReputation: 42,
      platformStanding: 80,
      criminalExposure: 0,
      evidenceExposure: 0,
      safetyRecord: 70,
    });
    expect(gm.reputationSystem.getKarmaLog()).toHaveLength(0);
    expect(gm.reputationSystem.getOffAppStrikes()).toBe(0);
    expect(gm.reputationSystem.getAppSuspendedUntilDay()).toBe(0);
    expect(gm.reputationSystem.isAppSuspended(1)).toBe(false);
    expect(gm.reputationSystem.isAppWarned()).toBe(false);
    expect(gm.reputationSystem.getPassengerTrust('char_nabila')).toBe(70);
    expect(gm.reputationSystem.getPromisesRecord()).toEqual({ kept: 0, broken: 0 });
    expect(gm.economy.reputation).toBe(4.5);

    // Legacy empty {} relationships preserve canonical seeded defaults
    expect(gm.reputationSystem.getRelationship('char_ma')).toBe(80);
    expect(gm.reputationSystem.getRelationship('char_mintu')).toBe(35);
    expect(gm.reputationSystem.getRelationship('char_kamal')).toBe(25);
    expect(gm.story.characterRelationships['char_ma']).toBe(80);
  });

  it('setPassengerTrust and setRelationship ignore non-finite values', () => {
    const rep = new ReputationSystem();
    const nabilaTrust0 = rep.getPassengerTrust('char_nabila');
    const maRel0 = rep.getRelationship('char_ma');

    rep.setPassengerTrust('char_nabila', Number.NaN);
    rep.setPassengerTrust('char_nabila', Number.POSITIVE_INFINITY);
    rep.setRelationship('char_ma', Number.NaN);
    rep.setRelationship('char_ma', Number.NEGATIVE_INFINITY);

    expect(rep.getPassengerTrust('char_nabila')).toBe(nabilaTrust0);
    expect(rep.getRelationship('char_ma')).toBe(maRel0);
  });
});
