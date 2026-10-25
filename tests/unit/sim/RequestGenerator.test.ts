import { describe, it, expect } from 'vitest';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { RequestGenerator } from '../../../src/sim/ride/RequestGenerator';
import { Rng } from '../../../src/core/rng';
import { generateProfile, getArchetypeDefinition } from '../../../src/sim/passenger/profiles';
import type { ArchetypeId } from '../../../src/core/types';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

describe('RequestGenerator', () => {
  const roadNetwork = RoadNetwork.fromDistricts([testloopData as DistrictData]);

  it('generator never emits unroutable request (10k samples)', () => {
    const rng = new Rng(12345);
    const generator = new RequestGenerator(roadNetwork, rng);

    for (let i = 0; i < 10000; i++) {
      const res = generator.sampleRequest(540, 'clear');
      expect(res).not.toBeNull();
      if (!res) continue;

      const { request } = res;
      expect(request.pickupNodeId).not.toBe(request.destinationNodeId);

      const route = roadNetwork.route(
        request.pickupNodeId,
        request.destinationNodeId,
        { mode: 'motorcycle' }
      );

      expect(route).not.toBeNull();
      expect(route!.nodeIds.length).toBeGreaterThanOrEqual(2);
      expect(route!.nodeIds[0]).toBe(request.pickupNodeId);
      expect(route!.nodeIds[route!.nodeIds.length - 1]).toBe(
        request.destinationNodeId
      );
    }
  });

  it('rush hour produces more requests than midday (seeded)', () => {
    const seed = 999;
    const rngRush = new Rng(seed);
    const generatorRush = new RequestGenerator(roadNetwork, rngRush, {
      baseArrivalRatePerMinute: 0.5,
    });

    const rngMidday = new Rng(seed);
    const generatorMidday = new RequestGenerator(roadNetwork, rngMidday, {
      baseArrivalRatePerMinute: 0.5,
    });

    let rushRequestsCount = 0;
    let middayRequestsCount = 0;
    const ticks = 120; // 2 hours of simulated 1-minute steps
    const dtMin = 1.0;

    for (let t = 0; t < ticks; t++) {
      // 9:00 AM (540 min)
      const reqsRush = generatorRush.tick(dtMin, 540 + t, 'clear');
      rushRequestsCount += reqsRush.length;

      // 1:00 PM (780 min)
      const reqsMidday = generatorMidday.tick(dtMin, 780 + t, 'clear');
      middayRequestsCount += reqsMidday.length;
    }

    console.log(
      `Rush hour requests: ${rushRequestsCount}, Midday requests: ${middayRequestsCount}`
    );
    expect(rushRequestsCount).toBeGreaterThan(middayRequestsCount);
    // Demand multiplier is 2.5 vs 1.0, so rush should be roughly ~2.5x midday
    expect(rushRequestsCount).toBeGreaterThan(middayRequestsCount * 1.5);
  });

  it('generateProfile samples within archetypes.json ranges', () => {
    const rng = new Rng(42);
    const archetypes: ArchetypeId[] = [
      'bargainer',
      'commuter',
      'careful',
      'regular',
      'risky',
    ];

    for (const arch of archetypes) {
      const def = getArchetypeDefinition(arch);

      for (let i = 0; i < 50; i++) {
        const p = generateProfile(arch, rng);
        expect(p.archetype).toBe(arch);
        expect(p.budget).toBeGreaterThanOrEqual(def.budgetFactor[0]);
        expect(p.budget).toBeLessThanOrEqual(def.budgetFactor[1]);

        expect(p.patience).toBeGreaterThanOrEqual(def.patience[0]);
        expect(p.patience).toBeLessThanOrEqual(def.patience[1]);

        expect(p.urgency).toBeGreaterThanOrEqual(def.urgency[0]);
        expect(p.urgency).toBeLessThanOrEqual(def.urgency[1]);

        expect(p.bargainingTendency).toBeGreaterThanOrEqual(
          def.bargainingTendency[0]
        );
        expect(p.bargainingTendency).toBeLessThanOrEqual(
          def.bargainingTendency[1]
        );

        expect(p.safetySensitivity).toBeGreaterThanOrEqual(
          def.safetySensitivity[0]
        );
        expect(p.safetySensitivity).toBeLessThanOrEqual(
          def.safetySensitivity[1]
        );

        expect(p.trustInRider).toBeGreaterThanOrEqual(def.trustInRider[0]);
        expect(p.trustInRider).toBeLessThanOrEqual(def.trustInRider[1]);

        expect(p.localKnowledge).toBeGreaterThanOrEqual(def.localKnowledge[0]);
        expect(p.localKnowledge).toBeLessThanOrEqual(def.localKnowledge[1]);

        expect(p.paymentReliability).toBeGreaterThanOrEqual(
          def.paymentReliability[0]
        );
        expect(p.paymentReliability).toBeLessThanOrEqual(
          def.paymentReliability[1]
        );

        expect(p.personalBias).toBeGreaterThanOrEqual(-0.1);
        expect(p.personalBias).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it('street hail produces nearby pickup within 40m of player', () => {
    const rng = new Rng(777);
    const generator = new RequestGenerator(roadNetwork, rng);

    // Player at (5, 5), close to N1 (0, 0)
    const playerPose = { x: 5, z: 5 };
    const hail = generator.sampleStreetHail(playerPose, 540, 'clear');

    expect(hail).not.toBeNull();
    if (hail) {
      expect(hail.request.bookingType).toBe('street');
      const pickupNode = roadNetwork.getNode(hail.request.pickupNodeId);
      expect(pickupNode).toBeDefined();
      const dist = Math.hypot(
        playerPose.x - pickupNode!.x,
        playerPose.z - pickupNode!.z
      );
      expect(dist).toBeLessThanOrEqual(40);
    }
  });
});
