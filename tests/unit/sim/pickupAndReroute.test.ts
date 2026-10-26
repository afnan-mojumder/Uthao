import { describe, it, expect } from 'vitest';
import { EventBus, type GameEvents } from '../../../src/core/events';
import type { RoadNode, RoadSegment, RideRequest } from '../../../src/core/types';
import { RoutingGraph, pickupOptions } from '../../../src/sim/road/routing';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { RideManager } from '../../../src/sim/ride/RideManager';
import { receipt } from '../../../src/sim/economy/fuel';

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
      pickupNodeId: 'N1',
      destinationNodeId: 'N3',
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
});
