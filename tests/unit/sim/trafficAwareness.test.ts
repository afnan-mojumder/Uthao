import { describe, it, expect } from 'vitest';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { TrafficManager, type TrafficAgent } from '../../../src/sim/traffic/TrafficManager';
import { PedestrianManager, type PedestrianAgent } from '../../../src/sim/traffic/pedestrians';
import type { RoadNode, RoadSegment } from '../../../src/core/types';

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
