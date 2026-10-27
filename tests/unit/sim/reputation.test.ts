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

    // Simulate 300 game minutes
    for (let m = 480; m < 780; m++) {
      normalCount += normalGen.tick(1, m, 'clear').length;
      lowCount += lowGen.tick(1, m, 'clear').length;
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

  it('localTrust clamping and mutations', () => {
    const rep = new ReputationSystem();
    expect(rep.getLocalTrust()).toBe(30);

    rep.changeLocalTrust(20);
    expect(rep.getLocalTrust()).toBe(50);

    rep.changeLocalTrust(100);
    expect(rep.getLocalTrust()).toBe(100); // capped at 100

    rep.changeLocalTrust(-150);
    expect(rep.getLocalTrust()).toBe(0); // floored at 0
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

    expect(rep.getLocalTrust()).toBe(45); // 30 + 15
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
