import { describe, it, expect } from 'vitest';
import { EventBus, type GameEvents } from '../../../src/core/events';
import type { RoadNode, RoadSegment, RideRequest } from '../../../src/core/types';
import type { DistrictData } from '../../../src/sim/schemas';
import { RoutingGraph, pickupOptions } from '../../../src/sim/road/routing';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { RideManager } from '../../../src/sim/ride/RideManager';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { receipt } from '../../../src/sim/economy/fuel';
import { SIM_DT } from '../../../src/config/constants';
import testloopData from '../../../data/districts/testloop.json';

describe('Detours, Crossings, and Off-App (T2.5)', () => {
  it('cross point only at crossing nodes', () => {
    // Setup a divided road scenario:
    // N1 (rider) -> N2 (U-turn far away at x=400) -> N3 (other side) -> N4 (pickup at x=50, z=20)
    // N5 is a crossing footbridge at x=60, z=0 with tags: ['crossing']
    // N6 is a regular junction at x=70, z=0 without crossing tag
    const nodes: RoadNode[] = [
      { nodeId: 'N1', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N2', x: 400, z: 0, kind: 'uturn' },
      { nodeId: 'N3', x: 200, z: 20, kind: 'junction' },
      { nodeId: 'N4', x: 50, z: 20, kind: 'junction' },
      { nodeId: 'N5', x: 60, z: 0, kind: 'junction', tags: ['crossing'] },
      { nodeId: 'N6', x: 70, z: 0, kind: 'junction' }, // no crossing tag
      { nodeId: 'N7', x: 60, z: -20, kind: 'junction' },
    ];

    const segments: RoadSegment[] = [
      // Eastbound lane
      {
        segmentId: 'S1_2',
        startNodeId: 'N1',
        endNodeId: 'N5',
        width: 7,
        surfaceCondition: 1,
        trafficDensity: 0.2,
        speedLimit: 50,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0,
        oneWay: true,
        divided: true,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      {
        segmentId: 'S5_6',
        startNodeId: 'N5',
        endNodeId: 'N6',
        width: 7,
        surfaceCondition: 1,
        trafficDensity: 0.2,
        speedLimit: 50,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0,
        oneWay: true,
        divided: true,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      {
        segmentId: 'S6_2',
        startNodeId: 'N6',
        endNodeId: 'N2',
        width: 7,
        surfaceCondition: 1,
        trafficDensity: 0.2,
        speedLimit: 50,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0,
        oneWay: true,
        divided: true,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      // U-turn
      {
        segmentId: 'S2_3',
        startNodeId: 'N2',
        endNodeId: 'N3',
        width: 7,
        surfaceCondition: 1,
        trafficDensity: 0.2,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0,
        oneWay: true,
        divided: true,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      // Westbound lane to pickup
      {
        segmentId: 'S3_4',
        startNodeId: 'N3',
        endNodeId: 'N4',
        width: 7,
        surfaceCondition: 1,
        trafficDensity: 0.2,
        speedLimit: 50,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0,
        oneWay: true,
        divided: true,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      // Side street kerb at N5 so N5 is a pickup-eligible node
      {
        segmentId: 'S5_7',
        startNodeId: 'N5',
        endNodeId: 'N7',
        width: 7,
        surfaceCondition: 1,
        trafficDensity: 0.1,
        speedLimit: 30,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.2,
        riskLevel: 0,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'residential',
        floodSensitivity: 0,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      // Pedestrian footbridge connecting N4 and N5
      {
        segmentId: 'S4_5_FB',
        startNodeId: 'N4',
        endNodeId: 'N5',
        width: 4,
        surfaceCondition: 1,
        trafficDensity: 0,
        speedLimit: 10,
        turnRestrictions: [],
        motorcycleAccessible: false,
        pedestrianDensity: 0.6,
        riskLevel: 0,
        oneWay: false,
        divided: false,
        lanes: 1,
        roadType: 'main',
        floodSensitivity: 0,
        pickupPractical: false,
        district: 'testloop',
        tags: ['crossing', 'footbridge'],
      },
    ];

    const graph = new RoutingGraph(nodes, segments);
    const req = { pickupNodeId: 'N4' };

    const opts = pickupOptions(req, 'N1', graph);
    expect(opts).not.toBeNull();
    expect(opts?.direct).toBeDefined();

    // Direct route requires driving all the way to N2 (400m) and coming back to N4
    expect(opts?.crossPoint).toBeDefined();
    if (opts?.crossPoint) {
      // Must be N5 because N5 has tags: ['crossing'], and never N6
      expect(opts.crossPoint.nodeId).toBe('N5');
      const crossNode = graph.getNodesMap().get(opts.crossPoint.nodeId);
      expect(crossNode?.tags).toContain('crossing');
      expect(opts.crossPoint.savesMin).toBeGreaterThan(0);
    }
  });

  it('off-app has zero commission', () => {
    const appReceipt = receipt({
      requestId: 'req_app_test',
      fare: 200,
      distanceKm: 4,
      durationMin: 12,
      bookingType: 'app',
    });
    expect(appReceipt.commission).toBe(30);

    const offAppReceipt = receipt({
      requestId: 'req_offapp_test',
      fare: 200,
      distanceKm: 4,
      durationMin: 12,
      bookingType: 'offApp',
    });
    expect(offAppReceipt.commission).toBe(0);
    expect(offAppReceipt.net).toBe(offAppReceipt.fare - offAppReceipt.fuelCost);
  });

  it('3 strikes suspends app requests for 2 days', () => {
    const bus = new EventBus<GameEvents>();
    const network = RoadNetwork.fromDistricts([
      {
        districtId: 'testloop',
        name: { bn: 'টেস্টলুপ', en: 'Test Loop' },
        nodes: [
          { nodeId: 'N1', x: 0, z: 0, kind: 'junction' },
          { nodeId: 'N2', x: 100, z: 0, kind: 'junction' },
        ],
        segments: [
          {
            segmentId: 'S1',
            startNodeId: 'N1',
            endNodeId: 'N2',
            width: 7,
            surfaceCondition: 1,
            trafficDensity: 0.1,
            speedLimit: 50,
            turnRestrictions: [],
            motorcycleAccessible: true,
            pedestrianDensity: 0,
            riskLevel: 0,
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

    const rm = new RideManager({ roadNetwork: network, bus });
    const flags: Record<string, unknown> = {};
    bus.on('story/flag', ({ key, value }) => {
      flags[key] = value;
    });

    const currentDay = 1;

    // First strike on day 1
    const s1 = rm.addStrike(currentDay);
    expect(s1.strikes).toBe(1);
    expect(s1.suspended).toBe(false);
    expect(rm.isAppSuspended(currentDay)).toBe(false);

    // Second strike
    const s2 = rm.addStrike(currentDay);
    expect(s2.strikes).toBe(2);
    expect(s2.suspended).toBe(false);
    expect(rm.isAppSuspended(currentDay)).toBe(false);

    // Third strike -> 3 strikes suspends app for 2 days (until day 1 + 2 = day 3)
    const s3 = rm.addStrike(currentDay);
    expect(s3.strikes).toBe(3);
    expect(s3.suspended).toBe(true);

    expect(flags['appSuspended']).toBe(true);
    expect(flags['appSuspendedUntilDay']).toBe(3);

    // Day 1: suspended
    expect(rm.isAppSuspended(1)).toBe(true);
    // Day 2: suspended
    expect(rm.isAppSuspended(2)).toBe(true);
    // Day 3: suspension ended
    expect(rm.isAppSuspended(3)).toBe(false);
  });

  it('mid-trip closure reroutes', () => {
    // Network with two routes from N1 to N3:
    // Main path: N1 -> S_main -> N2 -> S_dest -> N3
    // Detour path: N1 -> S_alt1 -> N4 -> S_alt2 -> N3
    const network = RoadNetwork.fromDistricts([
      {
        districtId: 'testloop',
        name: { bn: 'টেস্টলুপ', en: 'Test Loop' },
        nodes: [
          { nodeId: 'N1', x: 0, z: 0, kind: 'junction' },
          { nodeId: 'N2', x: 50, z: 0, kind: 'junction' },
          { nodeId: 'N3', x: 100, z: 0, kind: 'junction' },
          { nodeId: 'N4', x: 50, z: 30, kind: 'junction' },
        ],
        segments: [
          {
            segmentId: 'S_main',
            startNodeId: 'N1',
            endNodeId: 'N2',
            width: 7,
            surfaceCondition: 1,
            trafficDensity: 0.1,
            speedLimit: 60,
            turnRestrictions: [],
            motorcycleAccessible: true,
            pedestrianDensity: 0,
            riskLevel: 0,
            oneWay: false,
            divided: false,
            lanes: 2,
            roadType: 'main',
            floodSensitivity: 0,
            pickupPractical: true,
            district: 'testloop',
            tags: [],
          },
          {
            segmentId: 'S_dest',
            startNodeId: 'N2',
            endNodeId: 'N3',
            width: 7,
            surfaceCondition: 1,
            trafficDensity: 0.1,
            speedLimit: 60,
            turnRestrictions: [],
            motorcycleAccessible: true,
            pedestrianDensity: 0,
            riskLevel: 0,
            oneWay: false,
            divided: false,
            lanes: 2,
            roadType: 'main',
            floodSensitivity: 0,
            pickupPractical: true,
            district: 'testloop',
            tags: [],
          },
          {
            segmentId: 'S_alt1',
            startNodeId: 'N1',
            endNodeId: 'N4',
            width: 7,
            surfaceCondition: 1,
            trafficDensity: 0.1,
            speedLimit: 40,
            turnRestrictions: [],
            motorcycleAccessible: true,
            pedestrianDensity: 0,
            riskLevel: 0,
            oneWay: false,
            divided: false,
            lanes: 2,
            roadType: 'residential',
            floodSensitivity: 0,
            pickupPractical: true,
            district: 'testloop',
            tags: [],
          },
          {
            segmentId: 'S_alt2',
            startNodeId: 'N4',
            endNodeId: 'N3',
            width: 7,
            surfaceCondition: 1,
            trafficDensity: 0.1,
            speedLimit: 40,
            turnRestrictions: [],
            motorcycleAccessible: true,
            pedestrianDensity: 0,
            riskLevel: 0,
            oneWay: false,
            divided: false,
            lanes: 2,
            roadType: 'residential',
            floodSensitivity: 0,
            pickupPractical: true,
            district: 'testloop',
            tags: [],
          },
        ],
        pois: [],
      },
    ]);

    const bus = new EventBus<GameEvents>();
    const rm = new RideManager({ roadNetwork: network, bus });

    const req: RideRequest = {
      requestId: 'req_reroute',
      passengerId: 'p1',
      // T8.4: accept routes from the rider (N1) to the pickup first, so the pickup is N3.
      pickupNodeId: 'N3',
      destinationNodeId: 'N1',
      initialFare: 100,
      estimatedDistance: 1,
      estimatedDuration: 3,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1.0,
    };

    rm.offer(req);
    rm.accept(req.requestId, 'N1');

    expect(rm.currentRoute).toBeDefined();
    expect(rm.currentRoute?.segmentIds).toContain('S_main');

    // S_main is blocked by a breakdown/closure!
    const newRoute = rm.rerouteIfBlocked('S_main', 'N1');

    expect(newRoute).not.toBeNull();
    expect(newRoute?.segmentIds).not.toContain('S_main');
    expect(newRoute?.segmentIds).toContain('S_alt1');
    expect(newRoute?.segmentIds).toContain('S_alt2');
    expect(rm.currentRoute?.segmentIds).toEqual(newRoute?.segmentIds);
  });

  it('pickupOptions validates isPickupNode and network walk connectivity', () => {
    const mkSeg = (
      segmentId: string,
      startNodeId: string,
      endNodeId: string,
      extra: Partial<RoadSegment> = {}
    ): RoadSegment => ({
      segmentId,
      startNodeId,
      endNodeId,
      width: 7,
      surfaceCondition: 1,
      trafficDensity: 0.2,
      speedLimit: 50,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.1,
      riskLevel: 0,
      oneWay: true,
      divided: true,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0,
      pickupPractical: true,
      district: 'testloop',
      tags: [],
      ...extra,
    });

    // Case 1: X_bad is a crossing node within 25m of P and walk-connected,
    // but ONLY touches divided/inaccessible segments (isPickupNode === false).
    const nodes: RoadNode[] = [
      { nodeId: 'R', x: -200, z: 0, kind: 'junction' },
      { nodeId: 'X_disconnected', x: 40, z: 0, kind: 'junction', tags: ['crossing'] },
      { nodeId: 'X_bad', x: 60, z: 0, kind: 'junction', tags: ['crossing'] },
      { nodeId: 'U', x: 500, z: 0, kind: 'uturn' },
      { nodeId: 'W', x: 200, z: 20, kind: 'junction' },
      { nodeId: 'P', x: 50, z: 20, kind: 'junction' },
      { nodeId: 'K', x: 40, z: -20, kind: 'junction' },
    ];
    const segments: RoadSegment[] = [
      mkSeg('R_Xd', 'R', 'X_disconnected'),
      mkSeg('R_Xb', 'R', 'X_bad'),
      mkSeg('Xb_U', 'X_bad', 'U'),
      mkSeg('U_W', 'U', 'W'),
      mkSeg('W_P', 'W', 'P'),
      // Kerb at X_disconnected (so it IS a pickup node), but NO walk connection from P to X_disconnected within maxWalkM
      mkSeg('Xd_K', 'X_disconnected', 'K', { oneWay: false, divided: false }),
      // Footbridge from P to X_bad, while X_bad only touches divided/footbridge (NOT a pickup node)
      mkSeg('P_Xb_fb', 'P', 'X_bad', {
        oneWay: false,
        divided: false,
        motorcycleAccessible: false,
        pickupPractical: false,
        tags: ['crossing', 'footbridge'],
      }),
    ];

    const graph = new RoutingGraph(nodes, segments);
    const opts = pickupOptions({ pickupNodeId: 'P' }, 'R', graph, { maxWalkM: 300 });
    expect(opts).not.toBeNull();
    // Neither X_bad (not a pickup node) nor X_disconnected (no walk path from P) should be offered!
    expect(opts?.crossPoint).toBeUndefined();
  });
});

describe('P4.1 street commission, off-app RNG independence & alley relocation', () => {
  it('street hails take 0% commission even when phone is dead or app is suspended', () => {
    const streetReceipt = receipt({
      requestId: 'req_street_test',
      fare: 200,
      distanceKm: 4,
      durationMin: 12,
      bookingType: 'street',
    });
    expect(streetReceipt.commission).toBe(0);
    expect(streetReceipt.net).toBe(streetReceipt.fare - streetReceipt.fuelCost);

    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 13, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false, negotiation: false });
    gm.economyManager.phoneBattery = 0;
    gm.economy.phoneBattery = 0;
    session.ride.appSuspendedUntilDay = 99;

    const nodes = road.getAllNodes();
    const pickup = nodes[0]!;
    const dest = nodes[1]!;
    const cash0 = gm.economyManager.cash;
    const req: RideRequest = {
      requestId: 'req_street_dead_phone',
      passengerId: 'p_street',
      pickupNodeId: pickup.nodeId,
      destinationNodeId: dest.nodeId,
      initialFare: 150,
      estimatedDistance: 0.5,
      estimatedDuration: 3,
      requestedArrivalTime: null,
      bookingType: 'street',
      status: 'WaitingForPickup',
      surge: 1,
    };

    let completedCommission = -1;
    gm.bus.on('ride/completed', (e) => {
      completedCommission = e.receipt.commission;
    });

    session.ride.offer(req);
    expect(session.ride.accept(req.requestId)).toBe(true);
    session.bike.x = pickup.x;
    session.bike.z = pickup.z;
    session.bike.speed = 0;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    session.bike.x = dest.x;
    session.bike.z = dest.z;
    session.bike.speed = 0;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);

    expect(completedCommission).toBe(0);
    expect(gm.economyManager.ledgerFor(req.requestId).some((t) => t.kind === 'commission')).toBe(false);
    expect(gm.economyManager.cash).toBeGreaterThanOrEqual(cash0 + 150);
  });

  it('sequential off-app rides within the same hour roll independent detection RNGs', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    // Search for a seed whose plain `gm.rng.fork('offApp')` would have triggered strike 1 immediately
    let hittingSeed = -1;
    for (let s = 1; s < 500; s++) {
      const gmProbe = new GameManager({ seed: s, mode: 'career', data: {} });
      if (gmProbe.rng.fork('offApp').chance(0.03)) {
        hittingSeed = s;
        break;
      }
    }
    expect(hittingSeed).toBeGreaterThan(0);

    // Also test a broad run of sequential markOffApp calls within the same hour:
    // with independent per-roll forks, not all rolls are identical (if roll 1 detects, rolls 1..30 don't ALL detect).
    const nodes = road.getAllNodes();
    const gm = new GameManager({ seed: hittingSeed, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false, negotiation: false });
    let detectedCount = 0;
    const prevStrikes = { n: 0 };

    for (let i = 0; i < 30; i++) {
      const req: RideRequest = {
        requestId: `req_off_${i}`,
        passengerId: `p_off_${i}`,
        pickupNodeId: nodes[0]!.nodeId,
        destinationNodeId: nodes[1]!.nodeId,
        initialFare: 100,
        estimatedDistance: 0.5,
        estimatedDuration: 3,
        requestedArrivalTime: null,
        bookingType: 'app',
        status: 'WaitingForPickup',
        surge: 1,
      };
      session.ride.offer(req);
      session.ride.accept(req.requestId);
      session.markOffApp();
      if (session.ride.offAppStrikes > prevStrikes.n) {
        detectedCount++;
        prevStrikes.n = session.ride.offAppStrikes;
      }
      session.ride.cancel(req.requestId, 'rider', 'test');
    }

    // With 30 independent 3% rolls, we should not hit 30/30 or 0/30 regardless of seed;
    // specifically with independent forks, sequential calls never repeat the exact same roll 30 times.
    expect(detectedCount).toBeLessThan(10);
  });

  it('alleyChoice and relocateAlley move an alley destination to the alley entrance and reprice', () => {
    const mkSeg = (
      segmentId: string,
      startNodeId: string,
      endNodeId: string,
      extra: Partial<RoadSegment> = {}
    ): RoadSegment => ({
      segmentId,
      startNodeId,
      endNodeId,
      width: 8,
      surfaceCondition: 1,
      trafficDensity: 0.2,
      speedLimit: 40,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.2,
      riskLevel: 0.1,
      oneWay: false,
      divided: false,
      lanes: 2,
      roadType: 'residential',
      floodSensitivity: 0,
      pickupPractical: true,
      district: 'testloop',
      tags: [],
      ...extra,
    });

    const alleyDistrict: DistrictData = {
      districtId: 'testloop',
      name: { bn: 'টেস্ট', en: 'Test' },
      nodes: [
        { nodeId: 'M1', x: 0, z: 0, kind: 'junction' },
        { nodeId: 'M2', x: 100, z: 0, kind: 'junction' },
        { nodeId: 'A1', x: 140, z: 0, kind: 'junction' },
      ],
      segments: [
        mkSeg('S_main', 'M1', 'M2', { roadType: 'main' }),
        mkSeg('S_alley', 'M2', 'A1', { roadType: 'alley', width: 3.5, speedLimit: 15, tags: ['alley'] }),
      ],
      pois: [],
    };
    const road = RoadNetwork.fromDistricts([alleyDistrict]);
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false, negotiation: true });

    const req: RideRequest = {
      requestId: 'req_alley_1',
      passengerId: 'p_alley',
      pickupNodeId: 'M1',
      destinationNodeId: 'A1',
      initialFare: 80,
      estimatedDistance: 0.42,
      estimatedDuration: 2,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    };

    session.ride.offer(req);
    session.ride.accept(req.requestId);
    const alley = session.alleyChoice();
    expect(alley).not.toBeNull();
    expect(alley?.nodeId).toBe('M2');
    expect(alley?.target).toBe('destination');
    expect(alley?.walkM).toBeGreaterThan(0);

    const moved = session.ride.relocateAlley(alley!.nodeId, alley!.walkM, alley!.target);
    expect(moved).toBe(true);
    expect(session.ride.getActiveRequest()?.destinationNodeId).toBe('M2');
  });
});
