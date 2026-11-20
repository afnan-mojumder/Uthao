import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { TrafficManager, type TrafficAgent } from '../../../src/sim/traffic/TrafficManager';
import { PedestrianManager, type PedestrianAgent } from '../../../src/sim/traffic/pedestrians';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import { AutopilotController } from '../../../src/debug/autopilot';
import { SIM_DT } from '../../../src/config/constants';
import { distance2d, angleDiff } from '../../../src/core/math';
import { nextInstruction } from '../../../src/sim/road/navigation';
import type { RoadNode, RoadSegment } from '../../../src/core/types';
import type { DistrictData, WorldData } from '../../../src/sim/schemas';

// T9.20: a signalled crossroads at (0,0) with 100 m arms. x is East, z is South.
function seg(id: string, a: string, b: string): RoadSegment {
  return {
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
    oneWay: false,
    divided: false,
    lanes: 2,
    roadType: 'main',
    floodSensitivity: 0,
    pickupPractical: true,
    district: 'mirpara',
    tags: [],
  };
}

function crossroads(opts: { signal?: boolean; crossing?: boolean } = {}): RoadNetwork {
  const nodes: RoadNode[] = [
    {
      nodeId: 'C',
      x: 0,
      z: 0,
      kind: 'junction',
      signal: opts.signal ?? false,
      tags: opts.crossing ? ['crossing'] : [],
    },
    { nodeId: 'W', x: -100, z: 0, kind: 'junction' },
    { nodeId: 'E', x: 100, z: 0, kind: 'junction' },
    { nodeId: 'N', x: 0, z: -100, kind: 'junction' },
    { nodeId: 'S', x: 0, z: 100, kind: 'junction' },
  ];
  return RoadNetwork.fromDistricts([
    {
      districtId: 'mirpara',
      name: { bn: 'x', en: 'x' },
      nodes,
      segments: [seg('WC', 'W', 'C'), seg('CE', 'C', 'E'), seg('NC', 'N', 'C'), seg('CS', 'C', 'S')],
      pois: [],
    },
  ]);
}

function addCar(tm: TrafficManager, id: string, laneId: string, dist: number, speed = 10): TrafficAgent {
  const lane = tm.laneGraph.lanes.get(laneId)!;
  const pos = tm.computeLanePosition(lane, dist);
  const agent: TrafficAgent = {
    id,
    kind: 'car',
    laneId,
    distAlongLane: dist,
    speed,
    x: pos.x,
    z: pos.z,
    heading: tm.computeLaneHeading(lane),
    length: 4.5,
    width: 1.8,
    desiredSpeed: 50 / 3.6,
    lod: 'near',
  };
  tm.agents.set(id, agent);
  return agent;
}

const STOP_LINE = 100 - 5; // lane length minus the stop-line setback

describe('T9.20 traffic reads signals', () => {
  it('stops one axis at the stop line on red and lets the other through on green', () => {
    const tm = new TrafficManager(crossroads({ signal: true }), 1);
    const ew = addCar(tm, 'ew', 'WC_fwd_0', 50);
    const ns = addCar(tm, 'ns', 'NC_fwd_0', 50);

    for (let i = 0; i < 20 * 20; i++) tm.update(0.05); // 20 s, still inside the first phase

    const waiting = [ew, ns].filter((a) => a.laneId === 'WC_fwd_0' || a.laneId === 'NC_fwd_0');
    expect(waiting).toHaveLength(1);
    const w = waiting[0]!;
    expect(w.speed).toBeLessThan(0.1);
    expect(w.distAlongLane + w.length / 2).toBeLessThanOrEqual(STOP_LINE);
    expect(w.distAlongLane + w.length / 2).toBeGreaterThan(STOP_LINE - 4);

    // Next phase: the waiting car gets green and goes.
    const waitingLane = w.laneId;
    for (let i = 0; i < 25 * 20; i++) tm.update(0.05);
    expect(w.laneId === waitingLane && w.speed < 0.1).toBe(false);
  });

  it('ignores signals at an unsignalled junction', () => {
    const tm = new TrafficManager(crossroads(), 1);
    const ew = addCar(tm, 'ew', 'WC_fwd_0', 50);
    const ns = addCar(tm, 'ns', 'NC_fwd_0', 50);
    for (let i = 0; i < 20 * 20; i++) tm.update(0.05);
    expect(ew.laneId).not.toBe('WC_fwd_0');
    expect(ns.laneId).not.toBe('NC_fwd_0');
  });
});

describe('T9.20 traffic sees the bike', () => {
  it('brakes and stops behind a bike standing in its lane', () => {
    const tm = new TrafficManager(crossroads(), 1);
    const lane = tm.laneGraph.lanes.get('WC_fwd_0')!;
    const car = addCar(tm, 'car', 'WC_fwd_0', 10);
    const bikePos = tm.computeLanePosition(lane, 60);
    const bike = { x: bikePos.x, z: bikePos.z, speed: 0, heading: Math.PI / 2 };

    for (let i = 0; i < 15 * 20; i++) {
      tm.update(0.05, undefined, bike);
      expect(car.distAlongLane + car.length / 2).toBeLessThan(60 - 1);
    }
    expect(car.speed).toBeLessThan(0.1);
  });

  it('does not brake for a bike in the opposite lane', () => {
    const tm = new TrafficManager(crossroads(), 1);
    const opposite = tm.laneGraph.lanes.get('WC_bwd_0')!;
    const car = addCar(tm, 'car', 'WC_fwd_0', 10);
    const p = tm.computeLanePosition(opposite, 40); // 60 m along the forward lane
    const bike = { x: p.x, z: p.z, speed: 0, heading: -Math.PI / 2 };
    for (let i = 0; i < 6 * 20; i++) tm.update(0.05, undefined, bike);
    expect(car.distAlongLane).toBeGreaterThan(70);
  });

  it('stays deterministic for the same seed with a bike in play', () => {
    const run = () => {
      const tm = new TrafficManager(crossroads({ signal: true, crossing: true }), 99);
      const cam = { x: 0, z: 0, heading: 0, fovRad: 1.2 };
      const bike = { x: -30, z: -1.75, speed: 5, heading: Math.PI / 2 };
      for (let i = 0; i < 600; i++) {
        tm.maintainDensity(cam, 720, 8);
        tm.update(0.05, cam, bike);
      }
      return {
        cars: tm.getAgents().map((a) => [a.id, a.laneId, a.distAlongLane.toFixed(4)]),
        peds: tm.pedestrians.getPedestrians().map((p) => [p.id, p.state, p.x.toFixed(4)]),
      };
    };
    expect(run()).toEqual(run());
  });
});

describe('T9.20 pedestrians react to vehicles, the bike and accidents', () => {
  function kerbPed(pm: PedestrianManager, over: Partial<PedestrianAgent> = {}): PedestrianAgent {
    const ped: PedestrianAgent = {
      id: 'p',
      x: 0,
      z: 0,
      heading: Math.PI / 2,
      speed: 1.3,
      state: 'sidewalk',
      segmentId: 'WC',
      distAlongSegment: 99.95,
      lateralOffset: 4.7,
      side: 'right',
      direction: 1,
      lod: 'near',
      ...over,
    };
    pm.pedestrians.set(ped.id, ped);
    return ped;
  }
  // Vehicle on the CS arm 15 m south of the crossing, driving north at 10 m/s.
  const vehicles = new Map([['v', { x: -1.75, z: 15, heading: Math.PI, speed: 10 }]]);

  it('starts crossing at the kerb when the road is clear', () => {
    const pm = new PedestrianManager(crossroads({ crossing: true }), 1);
    const ped = kerbPed(pm);
    pm.update(0.1);
    expect(ped.state).toBe('crossing');
  });

  it('waits at the kerb for an approaching vehicle', () => {
    const pm = new PedestrianManager(crossroads({ crossing: true }), 1);
    const ped = kerbPed(pm);
    for (let i = 0; i < 5; i++) pm.update(0.1, undefined, undefined, vehicles);
    expect(ped.state).toBe('sidewalk');
  });

  it('waits at the kerb for the approaching bike', () => {
    const pm = new PedestrianManager(crossroads({ crossing: true }), 1);
    const ped = kerbPed(pm);
    pm.update(0.1, { x: -1.75, z: 15, speed: 10, heading: Math.PI });
    expect(ped.state).toBe('sidewalk');
  });

  it('steps back to the kerb when a vehicle approaches early in a crossing', () => {
    const pm = new PedestrianManager(crossroads({ crossing: true }), 1);
    const ped = kerbPed(pm, {
      state: 'crossing',
      distAlongSegment: 100,
      crossingProgress: 0.2,
      crossingFromOffset: 4.7,
      crossingToOffset: -4.7,
    });
    pm.update(0.5, undefined, undefined, vehicles);
    expect(ped.crossingProgress!).toBeLessThan(0.2);
    for (let i = 0; i < 40; i++) pm.update(0.1, undefined, undefined, vehicles);
    expect(ped.state).toBe('sidewalk');
    expect(ped.lateralOffset).toBeCloseTo(4.7, 5);
  });

  it('ignores a vehicle driving away', () => {
    const pm = new PedestrianManager(crossroads({ crossing: true }), 1);
    const ped = kerbPed(pm);
    pm.update(0.1, undefined, undefined, new Map([['v', { x: -1.75, z: 15, heading: 0, speed: 10 }]]));
    expect(ped.state).toBe('crossing');
  });

  it('stops walking and stays off the road near an accident until it clears', () => {
    const pm = new PedestrianManager(crossroads({ crossing: true }), 1);
    const walker = kerbPed(pm, { id: 'w', distAlongSegment: 80 });
    const kerb = kerbPed(pm, { id: 'k' });
    pm.reportAccident(-10, 0, 5);

    pm.update(0.5);
    expect(walker.distAlongSegment).toBe(80);
    expect(kerb.state).toBe('sidewalk');

    for (let i = 0; i < 60; i++) pm.update(0.1);
    expect(walker.distAlongSegment).toBeGreaterThan(80);
  });
});

function obbOverlap2d(a: TrafficAgent, b: TrafficAgent): boolean {
  const ax = Math.sin(a.heading);
  const az = Math.cos(a.heading);
  const arx = az;
  const arz = -ax;
  const bx = Math.sin(b.heading);
  const bz = Math.cos(b.heading);
  const brx = bz;
  const brz = -bx;

  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const ahx = a.width * 0.5;
  const ahz = a.length * 0.5;
  const bhx = b.width * 0.5;
  const bhz = b.length * 0.5;

  const sep = (tx: number, tz: number) => {
    const dist = Math.abs(dx * tx + dz * tz);
    const rA = ahx * Math.abs(arx * tx + arz * tz) + ahz * Math.abs(ax * tx + az * tz);
    const rB = bhx * Math.abs(brx * tx + brz * tz) + bhz * Math.abs(bx * tx + bz * tz);
    return dist >= rA + rB - 0.05;
  };

  return !(sep(arx, arz) || sep(ax, az) || sep(brx, brz) || sep(bx, bz));
}

describe('P3.2 Alive & Fair Traffic AI + Pedestrians', () => {
  it('oncoming vehicles brake/swerve rather than accelerating into a head-on player bike', () => {
    const tm = new TrafficManager(crossroads(), 1);
    const lane = tm.laneGraph.lanes.get('WC_fwd_0')!;
    const car = addCar(tm, 'car', 'WC_fwd_0', 10, 12);
    const bikePos = tm.computeLanePosition(lane, 55);
    // Player bike riding West (head-on against Eastbound WC_fwd_0) at 12 m/s
    const bike = { x: bikePos.x, z: bikePos.z, speed: 12, heading: -Math.PI / 2 };

    for (let i = 0; i < 40; i++) {
      tm.update(0.05, undefined, bike);
    }

    // Car must decelerate sharply (not accelerate!) and swerve laterally
    expect(car.speed).toBeLessThan(6.0);
    expect(Math.abs(car.lateralOffset ?? 0)).toBeGreaterThan(0.1);
    expect(car.distAlongLane + car.length / 2).toBeLessThan(55);
  });

  it('enforces unsignaled junction right-of-way via SignalController.canAcceptGap', () => {
    const tm = new TrafficManager(crossroads({ signal: false }), 1);
    const ew = addCar(tm, 'ew', 'WC_fwd_0', 65, 10);
    const ns = addCar(tm, 'ns', 'NC_fwd_0', 65, 10);

    let overlapDuringCross = false;
    for (let i = 0; i < 200; i++) {
      tm.update(0.05);
      if (obbOverlap2d(ew, ns)) overlapDuringCross = true;
    }

    expect(overlapDuringCross).toBe(false);
    expect(ew.laneId).not.toBe('WC_fwd_0');
    expect(ns.laneId).not.toBe('NC_fwd_0');
  });

  it('debounces horn (0.4s cooldown) and applies gentle lateral yield without freezing traffic or pedestrians', () => {
    const tm = new TrafficManager(crossroads({ crossing: true }), 1);
    const lane = tm.laneGraph.lanes.get('WC_fwd_0')!;
    const p = tm.computeLanePosition(lane, 40);
    const rickshaw: TrafficAgent = {
      id: 'rick',
      kind: 'rickshaw',
      laneId: 'WC_fwd_0',
      distAlongLane: 40,
      speed: 3.5,
      x: p.x,
      z: p.z,
      heading: tm.computeLaneHeading(lane),
      length: 2.2,
      width: 1.1,
      desiredSpeed: 3.5,
      lod: 'near',
    };
    tm.agents.set('rick', rickshaw);

    const crossingPed: PedestrianAgent = {
      id: 'cross_ped',
      x: -55,
      z: 0,
      heading: 0,
      speed: 1.3,
      state: 'crossing',
      segmentId: 'WC',
      distAlongSegment: 45,
      lateralOffset: 0,
      side: 'left',
      direction: 1,
      crossingProgress: 0.55,
      crossingFromOffset: -4.7,
      crossingToOffset: 4.7,
      lod: 'near',
    };
    tm.pedestrians.pedestrians.set('cross_ped', crossingPed);

    // Hold horn continuously for 1.0s (60 ticks at 1/60s)
    let triggeredCount = 0;
    for (let i = 0; i < 60; i++) {
      const res = tm.triggerHorn({ x: p.x - 5, z: p.z }, 15);
      if (res.rickshawsYielded > 0 || res.pedsYielded > 0) triggeredCount++;
      tm.update(1 / 60);
    }

    // 0.4s cooldown means at most 3 triggers in 1.0s (at t=0, 0.4, 0.8), NOT 60!
    expect(triggeredCount).toBeLessThanOrEqual(3);
    expect(triggeredCount).toBeGreaterThanOrEqual(2);

    // Rickshaw keeps moving & yielded laterally rather than freezing motionless
    expect(rickshaw.speed).toBeGreaterThan(1.5);
    expect(Math.abs(rickshaw.lateralOffset ?? 0)).toBeGreaterThan(0.2);

    // Crossing ped clears off the road rather than staying frozen in the middle
    expect(Math.abs(crossingPed.lateralOffset)).toBeGreaterThan(1.2);
  });

  it('pedestrians walk forward across crosswalks (no moonwalking) and scatter on nearby accidents', () => {
    const pm = new PedestrianManager(crossroads({ crossing: true }), 1);
    const ped: PedestrianAgent = {
      id: 'walk_fwd',
      x: 0,
      z: -4.7,
      heading: Math.PI / 2,
      speed: 1.3,
      state: 'sidewalk',
      segmentId: 'WC',
      distAlongSegment: 99.95,
      lateralOffset: -4.7,
      side: 'left',
      direction: 1,
      lod: 'near',
    };
    pm.pedestrians.set(ped.id, ped);

    // Walk across crosswalk and verify heading always aligns with actual displacement
    for (let i = 0; i < 30; i++) {
      const prevX = ped.x;
      const prevZ = ped.z;
      pm.update(0.1);
      if (ped.state === 'crossing') {
        const dx = ped.x - prevX;
        const dz = ped.z - prevZ;
        const moveLen = Math.hypot(dx, dz);
        if (moveLen > 0.01) {
          const hx = Math.sin(ped.heading);
          const hz = Math.cos(ped.heading);
          const forwardDot = (hx * dx + hz * dz) / moveLen;
          expect(forwardDot).toBeGreaterThan(0.95);
        }
      }
    }

    // Pedestrian crossing near an accident scatters off the road onto the sidewalk
    const roadPed: PedestrianAgent = {
      id: 'road_ped',
      x: -2,
      z: 0,
      heading: 0,
      speed: 1.3,
      state: 'crossing',
      segmentId: 'WC',
      distAlongSegment: 98,
      lateralOffset: 0.2,
      side: 'left',
      direction: 1,
      crossingProgress: 0.52,
      crossingFromOffset: -4.7,
      crossingToOffset: 4.7,
      lod: 'near',
    };
    pm.pedestrians.set(roadPed.id, roadPed);
    pm.reportAccident(-2, 0, 5);

    for (let i = 0; i < 30; i++) pm.update(0.1);
    expect(roadPed.state).toBe('sidewalk');
    expect(Math.abs(roadPed.lateralOffset)).toBeGreaterThanOrEqual(4.5);

    // GameSession crash collision automatically wires reportAccident() to pedestrians
    const gm = new GameManager({ seed: 5, mode: 'career', data: {} });
    const session = new GameSession({ gm, road: crossroads({ crossing: true }), autoRequests: false });
    session.bike.x = -2;
    session.bike.z = 0;
    const gsPed: PedestrianAgent = { ...roadPed, id: 'gs_road_ped', state: 'crossing', crossingProgress: 0.52, lateralOffset: 0.2 };
    session.traffic.pedestrians.pedestrians.set(gsPed.id, gsPed);
    gm.bus.emit('bike/collision', { severity: 'crash', relSpeedKmh: 40, otherKind: 'traffic' });
    for (let i = 0; i < 30; i++) session.traffic.pedestrians.update(0.1);
    expect(gsPed.state).toBe('sidewalk');
  });

  it('enforces agent.lod and ped.lod tick throttling (60Hz near / 20Hz mid / 5Hz far)', () => {
    const nodes: RoadNode[] = [
      { nodeId: 'A', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'B', x: 500, z: 0, kind: 'junction' },
    ];
    const abSeg: RoadSegment = { ...seg('AB', 'A', 'B'), oneWay: true, lanes: 1 };
    const net = RoadNetwork.fromDistricts([
      { districtId: 'mirpara', name: { bn: 'x', en: 'x' }, nodes, segments: [abSeg], pois: [] },
    ]);
    const tm = new TrafficManager(net, 1);
    const cam = { x: 0, z: 0, heading: 0, fovRad: 1.2 };

    const nearCar = addCar(tm, 'near', 'AB_fwd_0', 50, 10);
    const midCar = addCar(tm, 'mid', 'AB_fwd_0', 200, 10);
    const farCar = addCar(tm, 'far', 'AB_fwd_0', 360, 10);

    const nearPed: PedestrianAgent = {
      id: 'p_near',
      x: 50,
      z: 4.7,
      heading: Math.PI / 2,
      speed: 1.3,
      state: 'sidewalk',
      segmentId: 'AB',
      distAlongSegment: 50,
      lateralOffset: 4.7,
      side: 'right',
      direction: 1,
      lod: 'near',
    };
    const midPed: PedestrianAgent = { ...nearPed, id: 'p_mid', x: 200, distAlongSegment: 200, lod: 'mid' };
    const farPed: PedestrianAgent = { ...nearPed, id: 'p_far', x: 360, distAlongSegment: 360, lod: 'far' };
    tm.pedestrians.pedestrians.set('p_near', nearPed);
    tm.pedestrians.pedestrians.set('p_mid', midPed);
    tm.pedestrians.pedestrians.set('p_far', farPed);

    let nearCarMoves = 0;
    let midCarMoves = 0;
    let farCarMoves = 0;
    let nearPedMoves = 0;
    let midPedMoves = 0;
    let farPedMoves = 0;

    for (let i = 0; i < 60; i++) {
      const pn = nearCar.distAlongLane;
      const pm = midCar.distAlongLane;
      const pf = farCar.distAlongLane;
      const ppn = nearPed.distAlongSegment;
      const ppm = midPed.distAlongSegment;
      const ppf = farPed.distAlongSegment;

      tm.update(1 / 60, cam);

      if (nearCar.distAlongLane !== pn) nearCarMoves++;
      if (midCar.distAlongLane !== pm) midCarMoves++;
      if (farCar.distAlongLane !== pf) farCarMoves++;
      if (nearPed.distAlongSegment !== ppn) nearPedMoves++;
      if (midPed.distAlongSegment !== ppm) midPedMoves++;
      if (farPed.distAlongSegment !== ppf) farPedMoves++;
    }

    expect(nearCarMoves).toBe(60);
    expect(midCarMoves).toBeGreaterThanOrEqual(19);
    expect(midCarMoves).toBeLessThanOrEqual(21);
    expect(farCarMoves).toBeGreaterThanOrEqual(4);
    expect(farCarMoves).toBeLessThanOrEqual(6);

    expect(nearPedMoves).toBe(60);
    expect(midPedMoves).toBeGreaterThanOrEqual(19);
    expect(midPedMoves).toBeLessThanOrEqual(21);
    expect(farPedMoves).toBeGreaterThanOrEqual(4);
    expect(farPedMoves).toBeLessThanOrEqual(6);
  });

  it('spawns dense local traffic (15+ vehicles within 200m) during rush hour and never overlaps > 3s on lane transitions (10-min Phase 3 Exit Gate)', async () => {
    const world = JSON.parse(fs.readFileSync(path.resolve('data/world.json'), 'utf-8')) as WorldData;
    const districtFiles = ['mirpara', 'fulgate', 'dhanbagh', 'mohakhal', 'gulbari', 'puranpara', 'motinagar'];
    const districts = districtFiles.map((id) =>
      JSON.parse(fs.readFileSync(path.resolve(`data/districts/${id}.json`), 'utf-8')) as DistrictData
    );
    const road = RoadNetwork.fromWorld(world, districts);
    const physics = await PhysicsWorld.create();
    const gm = new GameManager({ seed: 77, mode: 'career', data: {} });
    // Evening rush hour (17:00 = 1020..1220 min across 600s real time at TIME_SCALE=20)
    gm.clock.minutes = 17 * 60;
    const session = new GameSession({ gm, road, physics, autoRequests: false });
    session.spawnAtHome();
    gm.economyManager.fuelLevel = 100;

    // Verify arterial straight-through route produces 0 phantom U-turn penalties
    const arterialRoute = road.route('art_n_0', 'fulgate_art_n_2', { mode: 'motorcycle' });
    expect(arterialRoute).not.toBeNull();
    expect(arterialRoute!.uTurns).toBe(0);

    const autopilot = new AutopilotController(road);
    autopilot.setEnabled(true);
    const waypoints = ['art_n_4', 'fulgate_art_n_2', 'mohakhal_fly_e', 'dhanbagh_art_n_2', 'art_n_0'];
    let wpIdx = 0;
    autopilot.setDestination(session.bike.x, session.bike.z, waypoints[wpIdx]!);

    const seenAgents = new Set<string>();
    let offRoadSpawns = 0;
    const overlapTimers = new Map<string, number>();
    let maxOverlapSec = 0;
    let phantomUturns = 0;
    let minWithin200AfterWarmup = Infinity;

    const totalTicks = 600 * 60; // 10 minutes simulated time at 60Hz
    const checkEvery = 6; // every 0.1s
    const checkDt = SIM_DT * checkEvery;

    for (let tick = 0; tick < totalTicks; tick++) {
      if (autopilot.isFinished()) {
        wpIdx = (wpIdx + 1) % waypoints.length;
        autopilot.setDestination(session.bike.x, session.bike.z, waypoints[wpIdx]!);
      }
      const input = autopilot.step(session.bike);
      session.step(input, SIM_DT);

      // Keep fuel topped up and stay in evening rush hour (17:00..19:30) during 10-min continuous drive
      if (tick % 600 === 0) {
        gm.economyManager.fuelLevel = 100;
        if (gm.clock.minutes >= 19 * 60 + 30) {
          gm.clock.minutes = 17 * 60;
        }
      }

      // Check new spawns are strictly on-road
      for (const a of session.traffic.agents.values()) {
        if (!seenAgents.has(a.id)) {
          seenAgents.add(a.id);
          const hit = road.segmentAtElevation(a.x, a.z, a.y ?? 0, 10);
          if (!hit.segment || !hit.segment.motorcycleAccessible || hit.distXZ > hit.segment.width / 2 + 1.5) {
            offRoadSpawns++;
          }
        }
      }

      if (tick % checkEvery === 0) {
        // Check active pairwise OBB overlaps
        const agents = Array.from(session.traffic.agents.values());
        const activePairs = new Set<string>();
        let within200 = 0;
        for (let i = 0; i < agents.length; i++) {
          const a = agents[i]!;
          if (distance2d(session.bike.x, session.bike.z, a.x, a.z) <= 200) within200++;
          for (let j = i + 1; j < agents.length; j++) {
            const b = agents[j]!;
            if (Math.abs((a.y ?? 0) - (b.y ?? 0)) > 2.5) continue;
            if (Math.abs(a.x - b.x) > 12 || Math.abs(a.z - b.z) > 12) continue;
            if (obbOverlap2d(a, b)) {
              const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
              activePairs.add(key);
              const nextT = (overlapTimers.get(key) ?? 0) + checkDt;
              overlapTimers.set(key, nextT);
              if (nextT > maxOverlapSec) maxOverlapSec = nextT;
            }
          }
        }
        for (const k of Array.from(overlapTimers.keys())) {
          if (!activePairs.has(k)) overlapTimers.delete(k);
        }

        if (tick >= 120) {
          if (within200 < minWithin200AfterWarmup) minWithin200AfterWarmup = within200;
        }

        // Check navigation along straight arterial leg never emits phantom uturn
        if (arterialRoute) {
          const a0 = road.getNode('art_n_0')!;
          const a1 = road.getNode('art_n_1')!;
          const straightHeading = Math.atan2(a1.x - a0.x, a1.z - a0.z);
          const instr = nextInstruction(
            arterialRoute,
            { x: (a0.x + a1.x) * 0.5, z: (a0.z + a1.z) * 0.5, heading: straightHeading },
            road.getNodesMap()
          );
          if (instr && instr.kind === 'uturn' && Math.abs(angleDiff(straightHeading, straightHeading)) < 0.1) {
            phantomUturns++;
          }
        }
      }
    }

    console.info(
      `[Phase 3 Exit Gate] 600s rush-hour: seenAgents=${seenAgents.size}, offRoadSpawns=${offRoadSpawns}, maxOverlapSec=${maxOverlapSec.toFixed(2)}s, phantomUturns=${phantomUturns}, minWithin200m=${minWithin200AfterWarmup}`
    );

    expect(seenAgents.size).toBeGreaterThan(50);
    expect(offRoadSpawns).toBe(0);
    expect(maxOverlapSec).toBeLessThanOrEqual(3.0);
    expect(phantomUturns).toBe(0);
    expect(minWithin200AfterWarmup).toBeGreaterThanOrEqual(15);
  }, 30000);
});
