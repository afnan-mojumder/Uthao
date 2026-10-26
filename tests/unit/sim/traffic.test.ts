import { describe, it, expect } from 'vitest';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { buildLanes } from '../../../src/sim/road/lanes';
import {
  stepCarFollowing,
  DEFAULT_IDM_PARAMS,
} from '../../../src/sim/traffic/idm';
import {
  TrafficManager,
  getTimeOfDayTrafficMultiplier,
  isSpawnPositionAllowed,
  type CameraViewInfo,
} from '../../../src/sim/traffic/TrafficManager';
import { SignalController } from '../../../src/sim/traffic/signals';
import type { RoadNode, RoadSegment } from '../../../src/core/types';

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
});
