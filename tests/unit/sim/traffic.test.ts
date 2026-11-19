import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { buildLanes } from '../../../src/sim/road/lanes';
import {
  stepCarFollowing,
  DEFAULT_IDM_PARAMS,
  VEHICLE_IDM_PARAMS,
} from '../../../src/sim/traffic/idm';
import {
  TrafficManager,
  getTimeOfDayTrafficMultiplier,
  isSpawnPositionAllowed,
  VEHICLE_CONFIGS,
  type CameraViewInfo,
  type TrafficAgent,
} from '../../../src/sim/traffic/TrafficManager';
import { SignalController } from '../../../src/sim/traffic/signals';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import { distance2d } from '../../../src/core/math';
import type { RoadNode, RoadSegment } from '../../../src/core/types';
import type { DistrictData, WorldData } from '../../../src/sim/schemas';

describe('Traffic System (T2.7)', () => {
  it('idm never overlaps leader', () => {
    // Follower moving fast behind a leader
    const follower = {
      pos: 0,
      speed: 15.0, // 54 km/h
      length: 4.5,
    };

    // Leader is 20m ahead, moving slower
    const leader = {
      pos: 20,
      speed: 8.0,
      length: 4.5,
    };

    const dt = 0.05;
    const speedLimit = 15.0;

    // Simulate for 300 steps (15 seconds)
    // At step 20, leader slams on the brakes to a full stop
    for (let step = 0; step < 300; step++) {
      if (step >= 20) {
        leader.speed = Math.max(0, leader.speed - 6.0 * dt);
      }
      leader.pos += leader.speed * dt;

      const res = stepCarFollowing(follower, leader, speedLimit, dt, DEFAULT_IDM_PARAMS);

      follower.pos = res.newPos;
      follower.speed = res.newSpeed;

      // Gap is leader rear - follower front
      const followerFront = follower.pos + follower.length / 2;
      const leaderRear = leader.pos - leader.length / 2;
      const actualGap = leaderRear - followerFront;

      // Follower must NEVER penetrate leader bumper
      expect(actualGap).toBeGreaterThanOrEqual(0.09);
      expect(res.gap).toBeGreaterThanOrEqual(0.09);
    }

    // Follower should safely stop behind the stationary leader
    expect(follower.speed).toBeCloseTo(0, 1);
    expect(leader.speed).toBe(0);
    const finalGap = leader.pos - leader.length / 2 - (follower.pos + follower.length / 2);
    expect(finalGap).toBeGreaterThanOrEqual(DEFAULT_IDM_PARAMS.s0 * 0.8);
  });

  it('vehicles drive on left', () => {
    // East-West road segment from (0, 0) to (100, 0)
    // Coordinate system: +x East, +z South
    // Start (0, 0) -> End (100, 0): Forward direction is East (+x).
    // In Bangladesh (drives on the left), left of East (+x) is North (-z).
    // Two-way road with 2 lanes (1 lane each direction)
    const nodes: RoadNode[] = [
      { nodeId: 'N_WEST', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N_EAST', x: 100, z: 0, kind: 'junction' },
    ];

    const segments: RoadSegment[] = [
      {
        segmentId: 'SEG_EW',
        startNodeId: 'N_WEST',
        endNodeId: 'N_EAST',
        width: 7.0, // 3.5m per lane
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

    const laneGraph = buildLanes(network);
    const lanes = Array.from(laneGraph.lanes.values());

    expect(lanes.length).toBe(2);

    const fwdLane = lanes.find((l) => l.direction === 'forward');
    const bwdLane = lanes.find((l) => l.direction === 'backward');

    expect(fwdLane).toBeDefined();
    expect(bwdLane).toBeDefined();

    // Forward lane goes West -> East.
    // In travel direction, Left is North (-z).
    // So all points on fwdLane must have z < 0!
    for (const p of fwdLane!.points) {
      expect(p.z).toBeLessThan(0);
    }
    expect(fwdLane!.leftOffsetM).toBeGreaterThan(0);

    // Backward lane goes East -> West.
    // In travel direction, Left is South (+z).
    // So all points on bwdLane must have z > 0!
    for (const p of bwdLane!.points) {
      expect(p.z).toBeGreaterThan(0);
    }
    expect(bwdLane!.leftOffsetM).toBeGreaterThan(0);
  });

  it('no spawn inside frustum within 80 m', () => {
    // Camera at (0, 0) facing East (+x, heading = PI / 2) with 70 degree FOV (1.22 rad)
    const camera: CameraViewInfo = {
      x: 0,
      z: 0,
      heading: Math.PI / 2, // Facing East (+x)
      fovRad: (70 * Math.PI) / 180,
    };

    // 1. Candidate directly in front of camera at 40m (inside frustum, < 80m) -> DISALLOWED
    const inFrontClose = { x: 40, z: 0 };
    expect(isSpawnPositionAllowed(inFrontClose, camera)).toBe(false);

    // 2. Candidate slightly off-center (20 deg) at 60m (inside frustum, < 80m) -> DISALLOWED
    const inConeClose = { x: 60 * Math.cos(0.2), z: 60 * Math.sin(0.2) };
    expect(isSpawnPositionAllowed(inConeClose, camera)).toBe(false);

    // 3. Candidate directly behind camera at 40m (outside frustum, < 80m) -> ALLOWED
    const behindClose = { x: -40, z: 0 };
    expect(isSpawnPositionAllowed(behindClose, camera)).toBe(true);

    // 4. Candidate far in front at 100m (inside frustum, but >= 80m) -> ALLOWED
    const inFrontFar = { x: 100, z: 0 };
    expect(isSpawnPositionAllowed(inFrontFar, camera)).toBe(true);
  });

  it('density follows rush-hour curve', () => {
    // 09:00 = minute 540 (morning rush)
    const morningRush = getTimeOfDayTrafficMultiplier(540);
    // 13:00 = minute 780 (midday)
    const midday = getTimeOfDayTrafficMultiplier(780);
    // 02:00 = minute 120 (late night)
    const lateNight = getTimeOfDayTrafficMultiplier(120);

    expect(morningRush).toBe(2.5);
    expect(midday).toBe(1.0);
    expect(lateNight).toBe(0.3);

    expect(morningRush).toBeGreaterThan(midday);
    expect(midday).toBeGreaterThan(lateNight);

    // Test traffic manager agent count matches density curve
    const nodes: RoadNode[] = [
      { nodeId: 'N1', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N2', x: 400, z: 0, kind: 'junction' },
      { nodeId: 'N3', x: 400, z: 400, kind: 'junction' },
      { nodeId: 'N4', x: 0, z: 400, kind: 'junction' },
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
      {
        segmentId: 'S2',
        startNodeId: 'N2',
        endNodeId: 'N3',
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

    const tmRush = new TrafficManager(network, 101);
    const camera: CameraViewInfo = { x: 200, z: -100, heading: 0, fovRad: 1.2 };

    tmRush.maintainDensity(camera, 540, 10);
    const countRush = tmRush.getAgents().length;

    const tmMid = new TrafficManager(network, 101);
    tmMid.maintainDensity(camera, 780, 10);
    const countMid = tmMid.getAgents().length;

    const tmNight = new TrafficManager(network, 101);
    tmNight.maintainDensity(camera, 120, 10);
    const countNight = tmNight.getAgents().length;

    expect(countRush).toBeGreaterThan(countMid);
    expect(countMid).toBeGreaterThan(countNight);
  });

  it('signal controller switches phases every 30s', () => {
    const node: RoadNode = { nodeId: 'S_NODE', x: 0, z: 0, kind: 'junction', signal: true };
    const sc = new SignalController([node], 30);

    // Initial phase 0: approach 0 is green, approach 1 is red
    expect(sc.getSignalStatus('S_NODE', 0)).toBe('green');
    expect(sc.getSignalStatus('S_NODE', 1)).toBe('red');

    // Advance 28 seconds (2s left in phase -> yellow on approach 0)
    sc.update(28);
    expect(sc.getSignalStatus('S_NODE', 0)).toBe('yellow');

    // Advance past 30 seconds -> Phase 1: approach 0 becomes red, approach 1 becomes green
    sc.update(3);
    expect(sc.getSignalStatus('S_NODE', 0)).toBe('red');
    expect(sc.getSignalStatus('S_NODE', 1)).toBe('green');
  });

  it('uses per-kind VEHICLE_IDM_PARAMS so nimble classes accelerate faster and heavy classes keep larger gaps', () => {
    for (const kind of Object.keys(VEHICLE_CONFIGS) as (keyof typeof VEHICLE_CONFIGS)[]) {
      expect(VEHICLE_IDM_PARAMS[kind]).toBeDefined();
    }
    expect(VEHICLE_IDM_PARAMS.motorcycle.a).toBeGreaterThan(VEHICLE_IDM_PARAMS.bus.a);
    expect(VEHICLE_IDM_PARAMS.bus.s0).toBeGreaterThan(VEHICLE_IDM_PARAMS.motorcycle.s0);
    expect(VEHICLE_IDM_PARAMS.truck.T).toBeGreaterThan(VEHICLE_IDM_PARAMS.cng.T);

    const nodes: RoadNode[] = [
      { nodeId: 'A', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'B', x: 300, z: 0, kind: 'junction' },
    ];
    const seg: RoadSegment = {
      segmentId: 'S',
      startNodeId: 'A',
      endNodeId: 'B',
      width: 10,
      surfaceCondition: 1,
      trafficDensity: 0.5,
      speedLimit: 60,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0,
      oneWay: true,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0,
      pickupPractical: true,
      district: 'testloop',
      tags: [],
    };
    const net = RoadNetwork.fromDistricts([
      { districtId: 'testloop', name: { bn: 'x', en: 'x' }, nodes, segments: [seg], pois: [] },
    ]);
    const tm = new TrafficManager(net, 1);
    const moto: TrafficAgent = {
      id: 'm',
      kind: 'motorcycle',
      laneId: 'S_fwd_0',
      distAlongLane: 10,
      speed: 0,
      x: 10,
      z: -2.5,
      heading: Math.PI / 2,
      length: VEHICLE_CONFIGS.motorcycle.length,
      width: VEHICLE_CONFIGS.motorcycle.width,
      desiredSpeed: 12,
      lod: 'near',
    };
    const bus: TrafficAgent = {
      id: 'b',
      kind: 'bus',
      laneId: 'S_fwd_1',
      distAlongLane: 10,
      speed: 0,
      x: 10,
      z: -7.5,
      heading: Math.PI / 2,
      length: VEHICLE_CONFIGS.bus.length,
      width: VEHICLE_CONFIGS.bus.width,
      desiredSpeed: 12,
      lod: 'near',
    };
    tm.agents.set('m', moto);
    tm.agents.set('b', bus);
    for (let i = 0; i < 40; i++) tm.update(0.05);
    expect(moto.speed).toBeGreaterThan(bus.speed + 1.0);
  });

  it('spawns inside 60m-350m ring on multi-district world and despawns beyond 450m', () => {
    const world = JSON.parse(fs.readFileSync(path.resolve('data/world.json'), 'utf-8')) as WorldData;
    const districtFiles = ['mirpara', 'fulgate', 'dhanbagh', 'mohakhal', 'gulbari', 'puranpara', 'motinagar'];
    const districts = districtFiles.map((id) =>
      JSON.parse(fs.readFileSync(path.resolve(`data/districts/${id}.json`), 'utf-8')) as DistrictData
    );
    const network = RoadNetwork.fromWorld(world, districts);
    const tm = new TrafficManager(network, 42);
    const mirparaNode = network.getNode('art_n_2')!;
    const cam: CameraViewInfo = { x: mirparaNode.x, z: mirparaNode.z, heading: Math.PI / 2, fovRad: 1.2 };

    for (let i = 0; i < 10; i++) {
      tm.maintainDensity(cam, 540, 24);
    }

    const agents = tm.getAgents();
    expect(agents.length).toBeGreaterThanOrEqual(40);
    let within200 = 0;
    for (const a of agents) {
      const d = distance2d(cam.x, cam.z, a.x, a.z);
      expect(d).toBeGreaterThanOrEqual(60);
      expect(d).toBeLessThanOrEqual(350);
      expect(isSpawnPositionAllowed({ x: a.x, z: a.z }, cam)).toBe(true);
      if (d <= 200) within200++;
    }
    expect(within200).toBeGreaterThanOrEqual(15);

    // Move camera > 500m away (e.g. far district) and verify > 450m agents despawn
    const farCam: CameraViewInfo = { x: mirparaNode.x + 2500, z: mirparaNode.z + 2500, heading: 0, fovRad: 1.2 };
    tm.maintainDensity(farCam, 540, 24);
    for (const a of tm.getAgents()) {
      expect(distance2d(farCam.x, farCam.z, a.x, a.z)).toBeLessThanOrEqual(450);
    }
  });

  it('checks nextLane rear clearance before transitioning so vehicles never teleport-fuse', () => {
    const nodes: RoadNode[] = [
      { nodeId: 'W', x: -100, z: 0, kind: 'junction' },
      { nodeId: 'C', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'E', x: 100, z: 0, kind: 'junction' },
    ];
    const mkSeg = (id: string, a: string, b: string): RoadSegment => ({
      segmentId: id,
      startNodeId: a,
      endNodeId: b,
      width: 7,
      surfaceCondition: 1,
      trafficDensity: 0.5,
      speedLimit: 50,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0,
      oneWay: true,
      divided: false,
      lanes: 1,
      roadType: 'main',
      floodSensitivity: 0,
      pickupPractical: true,
      district: 'testloop',
      tags: [],
    });
    const net = RoadNetwork.fromDistricts([
      { districtId: 'testloop', name: { bn: 'x', en: 'x' }, nodes, segments: [mkSeg('WC', 'W', 'C'), mkSeg('CE', 'C', 'E')], pois: [] },
    ]);
    const tm = new TrafficManager(net, 1);

    // Stopped bus right at the start of CE
    const bus: TrafficAgent = {
      id: 'stopped_bus',
      kind: 'bus',
      laneId: 'CE_fwd_0',
      distAlongLane: 4.5,
      speed: 0,
      x: 4.5,
      z: 0,
      heading: Math.PI / 2,
      length: 8.0,
      width: 2.4,
      desiredSpeed: 0,
      lod: 'near',
      isDwelling: true,
      dwellTimer: 10,
      lastDwellPoiId: 'hold',
    };
    const car: TrafficAgent = {
      id: 'approaching_car',
      kind: 'car',
      laneId: 'WC_fwd_0',
      distAlongLane: 85,
      speed: 12,
      x: -15,
      z: 0,
      heading: Math.PI / 2,
      length: 4.5,
      width: 1.8,
      desiredSpeed: 13,
      lod: 'near',
    };
    tm.agents.set(bus.id, bus);
    tm.agents.set(car.id, car);

    for (let i = 0; i < 100; i++) {
      tm.update(0.05);
      // Car must never overlap the stopped bus
      const centerDist = distance2d(car.x, car.z, bus.x, bus.z);
      expect(centerDist).toBeGreaterThan((car.length + bus.length) / 2 - 0.5);
    }
    expect(car.laneId).toBe('WC_fwd_0');
    expect(car.speed).toBeLessThan(0.5);
  });

  it('propagates interpolated y elevation onto flyover TrafficAgents and PhysicsWorld dynamic OBBs', async () => {
    const mohakhal = JSON.parse(fs.readFileSync(path.resolve('data/districts/mohakhal.json'), 'utf-8')) as DistrictData;
    const network = RoadNetwork.fromDistricts([mohakhal]);
    const physics = await PhysicsWorld.create();
    const gm = new GameManager({ seed: 11, mode: 'career', data: {} });
    const session = new GameSession({ gm, road: network, physics, autoRequests: false });

    const flyLanes = Array.from(session.traffic.laneGraph.lanes.values()).filter((l) => {
      const sn = network.getNode(l.startNodeId);
      const en = network.getNode(l.endNodeId);
      return (sn?.y ?? 0) >= 5.5 && (en?.y ?? 0) >= 5.5;
    });
    expect(flyLanes.length).toBeGreaterThan(0);
    const deckLane = flyLanes[0]!;
    const deckPos = session.traffic.computeLanePosition(deckLane, deckLane.lengthM * 0.5);

    session.traffic.agents.set('fly_car', {
      id: 'fly_car',
      kind: 'car',
      laneId: deckLane.laneId,
      distAlongLane: deckLane.lengthM * 0.5,
      speed: 0,
      x: deckPos.x,
      z: deckPos.z,
      heading: session.traffic.computeLaneHeading(deckLane),
      length: 4.5,
      width: 1.8,
      desiredSpeed: 0,
      lod: 'near',
    });

    // Place player bike directly underneath on ground level (y = 0)
    session.bike.x = deckPos.x;
    session.bike.z = deckPos.z;
    session.bike.y = 0;
    session.bike.speed = 5;

    const hits: unknown[] = [];
    gm.bus.on('bike/collision', (e) => hits.push(e));
    session.step({ throttle: 0.5, brake: 0, steer: 0 }, 1 / 60);

    const flyCar = session.traffic.agents.get('fly_car')!;
    expect(flyCar.y).toBeGreaterThanOrEqual(5.5);
    expect(hits).toHaveLength(0);
  });

  it('bus-stop detection is lane-direction-aware and brakes smoothly instead of snapping to 0', () => {
    const nodes: RoadNode[] = [
      { nodeId: 'N_START', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N_STOP', x: 80, z: 0, kind: 'junction' },
      { nodeId: 'N_END', x: 250, z: 0, kind: 'junction' },
      { nodeId: 'N_OPP_A', x: 250, z: 20, kind: 'junction' },
      { nodeId: 'N_OPP_B', x: 0, z: 20, kind: 'junction' },
    ];
    const mkSeg = (id: string, a: string, b: string): RoadSegment => ({
      segmentId: id,
      startNodeId: a,
      endNodeId: b,
      width: 8,
      surfaceCondition: 1,
      trafficDensity: 0.5,
      speedLimit: 50,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0,
      riskLevel: 0,
      oneWay: true,
      divided: false,
      lanes: 1,
      roadType: 'main',
      floodSensitivity: 0,
      pickupPractical: true,
      district: 'testloop',
      tags: [],
    });
    const net = RoadNetwork.fromDistricts([
      {
        districtId: 'testloop',
        name: { bn: 'x', en: 'x' },
        nodes,
        segments: [mkSeg('MAIN', 'N_START', 'N_END'), mkSeg('OPP', 'N_OPP_A', 'N_OPP_B')],
        pois: [{ id: 'stop_1', nodeId: 'N_STOP', kind: 'busStop', nameKey: 'stop' }],
      },
    ]);
    const tm = new TrafficManager(net, 1);

    // 1. Bus already past the stop at dist 120 must NOT race toward a stop behind it
    const pastBus: TrafficAgent = {
      id: 'past_bus',
      kind: 'bus',
      laneId: 'MAIN_fwd_0',
      distAlongLane: 120,
      speed: 10,
      x: 120,
      z: 0,
      heading: Math.PI / 2,
      length: 8,
      width: 2.4,
      desiredSpeed: 11,
      lod: 'near',
    };
    tm.agents.set('past_bus', pastBus);
    tm.update(0.1);
    expect(pastBus.isRacingToStop).toBe(false);
    expect(pastBus.isDwelling).toBeFalsy();

    // 2. Bus approaching from 60m slows smoothly into stop (no single-frame snap from >6 m/s to 0)
    const appBus: TrafficAgent = {
      id: 'app_bus',
      kind: 'bus',
      laneId: 'MAIN_fwd_0',
      distAlongLane: 55,
      speed: 11,
      x: 55,
      z: 0,
      heading: Math.PI / 2,
      length: 8,
      width: 2.4,
      desiredSpeed: 11,
      lod: 'near',
    };
    tm.agents.set('app_bus', appBus);

    let maxSingleStepDrop = 0;
    for (let i = 0; i < 120 && !appBus.isDwelling; i++) {
      const prevSpeed = appBus.speed;
      tm.update(0.05);
      const drop = prevSpeed - appBus.speed;
      if (drop > maxSingleStepDrop) maxSingleStepDrop = drop;
    }
    expect(appBus.isDwelling).toBe(true);
    expect(maxSingleStepDrop).toBeLessThan(3.0);
  });
});
