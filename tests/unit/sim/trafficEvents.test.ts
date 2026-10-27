import { describe, it, expect } from 'vitest';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import {
  TrafficManager,
  isTruckAllowedTime,
  VEHICLE_CONFIGS,
  type TrafficVehicleKind,
  type TrafficAgent,
} from '../../../src/sim/traffic/TrafficManager';
import { RoadEventManager } from '../../../src/sim/world/RoadEvents';
import type { RoadNode, RoadSegment } from '../../../src/core/types';
import { EventBus, type GameEvents } from '../../../src/core/events';

describe('Traffic Types and Road Events (T5.3)', () => {
  it('road event closes segment and routing avoids it', () => {
    // Network layout:
    // Direct path: N_START -> (SEG_DIRECT_1) -> N_MID -> (SEG_DIRECT_2) -> N_END
    // Detour path: N_START -> (SEG_DETOUR_1) -> N_ALT -> (SEG_DETOUR_2) -> N_END
    const nodes: RoadNode[] = [
      { nodeId: 'N_START', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N_MID', x: 100, z: 0, kind: 'junction' },
      { nodeId: 'N_END', x: 200, z: 0, kind: 'junction' },
      { nodeId: 'N_ALT', x: 100, z: 80, kind: 'junction' },
    ];

    const segments: RoadSegment[] = [
      {
        segmentId: 'SEG_DIRECT_1',
        startNodeId: 'N_START',
        endNodeId: 'N_MID',
        width: 8,
        surfaceCondition: 1,
        trafficDensity: 0.5,
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
      {
        segmentId: 'SEG_DIRECT_2',
        startNodeId: 'N_MID',
        endNodeId: 'N_END',
        width: 8,
        surfaceCondition: 1,
        trafficDensity: 0.5,
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
      {
        segmentId: 'SEG_DETOUR_1',
        startNodeId: 'N_START',
        endNodeId: 'N_ALT',
        width: 8,
        surfaceCondition: 1,
        trafficDensity: 0.5,
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
      {
        segmentId: 'SEG_DETOUR_2',
        startNodeId: 'N_ALT',
        endNodeId: 'N_END',
        width: 8,
        surfaceCondition: 1,
        trafficDensity: 0.5,
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
    ];

    const network = RoadNetwork.fromDistricts([
      {
        districtId: 'testloop',
        name: { bn: 'টেস্টলুপ', en: 'Test Loop' },
        nodes,
        segments,
        pois: [],
      },
    ]);

    const bus = new EventBus<GameEvents>();
    const roadEvents = new RoadEventManager({ bus, network });

    // 1. Initial route without closures: uses direct path [SEG_DIRECT_1, SEG_DIRECT_2]
    const initialRoute = network.route('N_START', 'N_END', {
      mode: 'motorcycle',
      roadEvents,
    });
    expect(initialRoute).not.toBeNull();
    expect(initialRoute!.segmentIds).toEqual(['SEG_DIRECT_1', 'SEG_DIRECT_2']);

    // 2. Road event closes SEG_DIRECT_1
    const event = roadEvents.closeSegment('SEG_DIRECT_1', 45, 'closure');
    expect(event.active).toBe(true);
    expect(roadEvents.getClosedSegmentIds()).toContain('SEG_DIRECT_1');

    // Routing must now avoid SEG_DIRECT_1 and take the detour path!
    const detourRoute = network.route('N_START', 'N_END', {
      mode: 'motorcycle',
      roadEvents,
    });
    expect(detourRoute).not.toBeNull();
    expect(detourRoute!.segmentIds).toEqual(['SEG_DETOUR_1', 'SEG_DETOUR_2']);
    expect(detourRoute!.segmentIds).not.toContain('SEG_DIRECT_1');

    // 3. Alternative check using avoid option explicitly
    const routeWithAvoid = network.route('N_START', 'N_END', {
      mode: 'motorcycle',
      avoid: roadEvents.getClosedSegmentIds(),
    });
    expect(routeWithAvoid).not.toBeNull();
    expect(routeWithAvoid!.segmentIds).toEqual(['SEG_DETOUR_1', 'SEG_DETOUR_2']);

    // 4. Close detour as well -> route becomes impossible
    roadEvents.closeSegment('SEG_DETOUR_1', 30, 'construction');
    const blockedRoute = network.route('N_START', 'N_END', {
      mode: 'motorcycle',
      roadEvents,
    });
    expect(blockedRoute).toBeNull();

    // 5. Reopen direct segment -> route becomes available again
    roadEvents.reopenSegment('SEG_DIRECT_1');
    expect(roadEvents.isSegmentClosed('SEG_DIRECT_1')).toBe(false);
    const restoredRoute = network.route('N_START', 'N_END', {
      mode: 'motorcycle',
      roadEvents,
    });
    expect(restoredRoute).not.toBeNull();
    expect(restoredRoute!.segmentIds).toEqual(['SEG_DIRECT_1', 'SEG_DIRECT_2']);
  });

  it('new actor types obey left-hand lanes', () => {
    // Two-way East-West road: (0, 0) to (100, 0)
    // Travel East (+x): Left is North (-z).
    // Travel West (-x): Left is South (+z).
    const nodes: RoadNode[] = [
      { nodeId: 'N_W', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N_E', x: 100, z: 0, kind: 'junction' },
    ];

    const segments: RoadSegment[] = [
      {
        segmentId: 'SEG_EW',
        startNodeId: 'N_W',
        endNodeId: 'N_E',
        width: 8,
        surfaceCondition: 1,
        trafficDensity: 0.5,
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
    ];

    const network = RoadNetwork.fromDistricts([
      {
        districtId: 'testloop',
        name: { bn: 'টেস্টলুপ', en: 'Test Loop' },
        nodes,
        segments,
        pois: [],
      },
    ]);

    const tm = new TrafficManager(network, 777);
    const lanes = Array.from(tm.laneGraph.lanes.values());
    const fwdLane = lanes.find((l) => l.direction === 'forward')!;
    const bwdLane = lanes.find((l) => l.direction === 'backward')!;

    expect(fwdLane).toBeDefined();
    expect(bwdLane).toBeDefined();

    const newActorTypes: TrafficVehicleKind[] = [
      'minibus',
      'delivery_van',
      'truck',
      'bicycle',
      'scooter',
      'ride_hailing_car',
      'vendor_cart',
    ];

    for (const kind of newActorTypes) {
      const cfg = VEHICLE_CONFIGS[kind];
      expect(cfg).toBeDefined();
      expect(cfg.length).toBeGreaterThan(0);
      expect(cfg.width).toBeGreaterThan(0);
      expect(cfg.desiredSpeedMs).toBeGreaterThan(0);

      // Forward travel (West -> East): left-hand traffic requires z < 0
      const posFwd = tm.computeLanePosition(fwdLane, 50, 0);
      expect(posFwd.z).toBeLessThan(0);

      // Backward travel (East -> West): left-hand traffic requires z > 0
      const posBwd = tm.computeLanePosition(bwdLane, 50, 0);
      expect(posBwd.z).toBeGreaterThan(0);
    }
  });

  it('trucks only spawn during night hours', () => {
    // Dhaka municipal rule: trucks night-only (21:00 to 06:00: 1260 to 360 min)
    expect(isTruckAllowedTime(720)).toBe(false); // 12:00 Midday -> disallowed
    expect(isTruckAllowedTime(540)).toBe(false); // 09:00 Morning rush -> disallowed
    expect(isTruckAllowedTime(1100)).toBe(false); // 18:20 Evening -> disallowed
    expect(isTruckAllowedTime(1320)).toBe(true); // 22:00 Night -> allowed
    expect(isTruckAllowedTime(120)).toBe(true); // 02:00 Night -> allowed
    expect(isTruckAllowedTime(300)).toBe(true); // 05:00 Night -> allowed

    const nodes: RoadNode[] = [
      { nodeId: 'N1', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N2', x: 200, z: 0, kind: 'junction' },
    ];
    const segments: RoadSegment[] = [
      {
        segmentId: 'S1',
        startNodeId: 'N1',
        endNodeId: 'N2',
        width: 14,
        surfaceCondition: 1,
        trafficDensity: 0.8,
        speedLimit: 50,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0,
        riskLevel: 0,
        oneWay: false,
        divided: true,
        lanes: 4,
        roadType: 'main',
        floodSensitivity: 0,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
    ];

    const network = RoadNetwork.fromDistricts([
      {
        districtId: 'testloop',
        name: { bn: 'টেস্টলুপ', en: 'Test Loop' },
        nodes,
        segments,
        pois: [],
      },
    ]);

    const tm = new TrafficManager(network, 42);

    // 1. Daytime sampling: 300 samples at 12:00 must produce zero trucks
    let daytimeTruckCount = 0;
    for (let i = 0; i < 300; i++) {
      const kind = tm.sampleVehicleKind({ minute: 720, roadType: 'main' });
      if (kind === 'truck') {
        daytimeTruckCount++;
      }
    }
    expect(daytimeTruckCount).toBe(0);

    // 2. Nighttime sampling: 300 samples at 02:00 must produce trucks
    let nighttimeTruckCount = 0;
    for (let i = 0; i < 300; i++) {
      const kind = tm.sampleVehicleKind({ minute: 120, roadType: 'main' });
      if (kind === 'truck') {
        nighttimeTruckCount++;
      }
    }
    expect(nighttimeTruckCount).toBeGreaterThan(15);
  });

  it('CNG weaving remains bounded within lane', () => {
    const nodes: RoadNode[] = [
      { nodeId: 'N1', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N2', x: 300, z: 0, kind: 'junction' },
    ];
    const segments: RoadSegment[] = [
      {
        segmentId: 'S1',
        startNodeId: 'N1',
        endNodeId: 'N2',
        width: 7,
        surfaceCondition: 1,
        trafficDensity: 0.5,
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
    ];

    const network = RoadNetwork.fromDistricts([
      {
        districtId: 'testloop',
        name: { bn: 'টেস্টলুপ', en: 'Test Loop' },
        nodes,
        segments,
        pois: [],
      },
    ]);

    const tm = new TrafficManager(network, 123);
    const lanes = Array.from(tm.laneGraph.lanes.values());
    const lane = lanes[0]!;

    const cngAgent: TrafficAgent = {
      id: 'cng_test',
      kind: 'cng',
      laneId: lane.laneId,
      distAlongLane: 20,
      speed: 10,
      x: 0,
      z: 0,
      heading: 0,
      length: 2.8,
      width: 1.3,
      desiredSpeed: 10,
      lod: 'near',
      weavePhase: 0,
      lateralOffset: 0,
    };

    tm.agents.set(cngAgent.id, cngAgent);

    let observedMinOffset = Infinity;
    let observedMaxOffset = -Infinity;

    // Simulate for 100 steps (5 seconds)
    const dt = 0.05;
    for (let step = 0; step < 100; step++) {
      tm.update(dt);
      const offset = cngAgent.lateralOffset ?? 0;

      // Must NEVER exceed bounded [-0.6, +0.6] m
      expect(offset).toBeGreaterThanOrEqual(-0.6);
      expect(offset).toBeLessThanOrEqual(0.6);

      if (offset < observedMinOffset) observedMinOffset = offset;
      if (offset > observedMaxOffset) observedMaxOffset = offset;
    }

    // Must actually weave (both negative and positive offsets observed)
    expect(observedMinOffset).toBeLessThan(-0.3);
    expect(observedMaxOffset).toBeGreaterThan(0.3);
  });

  it('bus accelerates when approaching bus stop with clear road', () => {
    const nodes: RoadNode[] = [
      { nodeId: 'N_START', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N_STOP', x: 80, z: 0, kind: 'junction' },
      { nodeId: 'N_END', x: 250, z: 0, kind: 'junction' },
    ];
    const segments: RoadSegment[] = [
      {
        segmentId: 'S_BUS',
        startNodeId: 'N_START',
        endNodeId: 'N_END',
        width: 10,
        surfaceCondition: 1,
        trafficDensity: 0.5,
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
    ];

    const network = RoadNetwork.fromDistricts([
      {
        districtId: 'testloop',
        name: { bn: 'টেস্টলুপ', en: 'Test Loop' },
        nodes,
        segments,
        pois: [
          {
            id: 'poi_stop_1',
            nodeId: 'N_STOP',
            kind: 'busStop',
            nameKey: 'bus_stop',
          },
        ],
      },
    ]);

    const tm = new TrafficManager(network, 999);
    const lanes = Array.from(tm.laneGraph.lanes.values());
    const fwdLane = lanes.find((l) => l.direction === 'forward')!;

    const baseDesiredSpeed = VEHICLE_CONFIGS['bus'].desiredSpeedMs;

    // Place bus 50m before the bus stop with clear road ahead
    const busAgent: TrafficAgent = {
      id: 'bus_racer',
      kind: 'bus',
      laneId: fwdLane.laneId,
      distAlongLane: 30, // Stop is around 80m
      speed: baseDesiredSpeed,
      x: 30,
      z: -2,
      heading: 0,
      length: 8.0,
      width: 2.4,
      desiredSpeed: baseDesiredSpeed,
      lod: 'near',
    };

    tm.agents.set(busAgent.id, busAgent);

    // Update traffic frame
    tm.update(0.1);

    // Bus should be racing to the stop!
    expect(busAgent.isRacingToStop).toBe(true);
    expect(busAgent.desiredSpeed).toBeGreaterThan(baseDesiredSpeed);

    // Move bus into dwell zone (< 8m from stop)
    busAgent.distAlongLane = 78;
    busAgent.x = 78;
    busAgent.z = -2;

    tm.update(0.1);

    // Bus should now dwell at the stop with speed 0
    expect(busAgent.isDwelling).toBe(true);
    expect(busAgent.speed).toBe(0);
    expect(busAgent.isRacingToStop).toBe(false);
  });

  it('road event lifecycle and speed caps', () => {
    const bus = new EventBus<GameEvents>();
    const roadEvents = new RoadEventManager({ bus });

    const receivedEvents: Array<{ id: string; active: boolean }> = [];
    bus.on('world/roadEvent', ({ event }) => {
      receivedEvents.push({ id: event.id, active: event.active });
    });

    // Schedule an event for minute 500 with duration 30 min
    roadEvents.scheduleEvent({
      id: 'sched_constr',
      kind: 'construction',
      segmentId: 'SEG_TEST',
      startMinute: 500,
      durationMinutes: 30,
      speedCapKmh: 20,
    });

    // At minute 490: not yet active
    roadEvents.tick(10, 490);
    expect(roadEvents.getActiveEvents().length).toBe(0);
    expect(roadEvents.getSpeedCap('SEG_TEST')).toBeUndefined();

    // At minute 500: becomes active and speed cap is applied
    roadEvents.tick(10, 500);
    expect(roadEvents.getActiveEvents().length).toBe(1);
    expect(roadEvents.getSpeedCap('SEG_TEST')).toBe(20);
    expect(receivedEvents.some((e) => e.id === 'sched_constr' && e.active)).toBe(true);

    // Advance 30 minutes: event expires and speed cap clears
    roadEvents.tick(30, 530);
    expect(roadEvents.getActiveEvents().length).toBe(0);
    expect(roadEvents.getSpeedCap('SEG_TEST')).toBeUndefined();
    expect(receivedEvents.some((e) => e.id === 'sched_constr' && !e.active)).toBe(true);
  });

  it('wrong-way rickshaws hug kerb on residential lanes', () => {
    const nodes: RoadNode[] = [
      { nodeId: 'N_RES_1', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N_RES_2', x: 100, z: 0, kind: 'junction' },
    ];
    const segments: RoadSegment[] = [
      {
        segmentId: 'SEG_RES',
        startNodeId: 'N_RES_1',
        endNodeId: 'N_RES_2',
        width: 6,
        surfaceCondition: 1,
        trafficDensity: 0.5,
        speedLimit: 30,
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
    ];

    const network = RoadNetwork.fromDistricts([
      {
        districtId: 'testloop',
        name: { bn: 'টেস্টলুপ', en: 'Test Loop' },
        nodes,
        segments,
        pois: [],
      },
    ]);

    const tm = new TrafficManager(network, 555);
    const lanes = Array.from(tm.laneGraph.lanes.values());
    const lane = lanes[0]!;

    const wrongWayRickshaw: TrafficAgent = {
      id: 'rickshaw_wrong',
      kind: 'rickshaw',
      laneId: lane.laneId,
      distAlongLane: 60,
      speed: 2.5,
      x: 60,
      z: 0,
      heading: 0,
      length: 2.2,
      width: 1.1,
      desiredSpeed: 2.5,
      lod: 'near',
      isWrongWay: true,
      lateralOffset: 0.4,
    };

    tm.agents.set(wrongWayRickshaw.id, wrongWayRickshaw);

    const normalHeading = tm.computeLaneHeading(lane);

    // Update for 1 second
    tm.update(1.0);

    // Traveled backwards along lane
    expect(wrongWayRickshaw.distAlongLane).toBeLessThan(60);
    // Heading faces oncoming traffic (approx normal + PI)
    const diff = Math.abs(wrongWayRickshaw.heading - (normalHeading + Math.PI));
    expect(diff).toBeLessThan(0.01);
  });

  it('spawns road workers on construction segments', () => {
    const nodes: RoadNode[] = [
      { nodeId: 'N1', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N2', x: 100, z: 0, kind: 'junction' },
    ];
    const segments: RoadSegment[] = [
      {
        segmentId: 'S_CONST',
        startNodeId: 'N1',
        endNodeId: 'N2',
        width: 8,
        surfaceCondition: 0.5,
        trafficDensity: 0.5,
        speedLimit: 40,
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
    ];

    const network = RoadNetwork.fromDistricts([
      {
        districtId: 'testloop',
        name: { bn: 'টেস্টলুপ', en: 'Test Loop' },
        nodes,
        segments,
        pois: [],
      },
    ]);

    const tm = new TrafficManager(network, 1001);
    const workers = tm.pedestrians.spawnRoadWorkers('S_CONST', 3);

    expect(workers.length).toBe(3);
    for (const w of workers) {
      expect(w.state).toBe('road_worker');
      expect(w.isRoadWorker).toBe(true);
      expect(w.segmentId).toBe('S_CONST');
    }
  });
});
