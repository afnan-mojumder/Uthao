import { describe, it, expect } from 'vitest';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { Rng } from '../../../src/core/rng';
import type { RoadNode, RoadSegment, RideRequest } from '../../../src/core/types';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { RideManager } from '../../../src/sim/ride/RideManager';
import { RequestGenerator } from '../../../src/sim/ride/RequestGenerator';
import { deriveRideView } from '../../../src/sim/ride/rideView';
import { nextInstruction, type NavInstruction } from '../../../src/sim/road/navigation';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { BALANCE } from '../../../src/config/balance';
import { SIM_DT } from '../../../src/config/constants';
import type { DistrictData } from '../../../src/sim/schemas';
import type { BikeInput } from '../../../src/physics/bikeModel';
import mirparaData from '../../../data/districts/mirpara.json';
import testloopData from '../../../data/districts/testloop.json';
import enHud from '../../../data/dialogue/en/hud.json';
import bnHud from '../../../data/dialogue/bn/hud.json';

const NEUTRAL: BikeInput = { throttle: 0, brake: 0, steer: 0 };

function seg(id: string, a: string, b: string, o: Partial<RoadSegment> = {}): RoadSegment {
  return {
    segmentId: id,
    startNodeId: a,
    endNodeId: b,
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
    ...o,
  };
}

function net(nodes: RoadNode[], segments: RoadSegment[]): RoadNetwork {
  return RoadNetwork.fromDistricts([
    { districtId: 'testloop', name: { bn: 'ক', en: 'T' }, nodes, segments, pois: [] } as unknown as DistrictData,
  ]);
}

const n = (nodeId: string, x: number, z: number, tags?: string[]): RoadNode => ({
  nodeId, x, z, kind: 'junction', tags,
});

// 2x3 grid, 100 m apart:  A B C (z=0)  /  D E F (z=100)
const GRID_NODES = [n('A', 0, 0), n('B', 100, 0), n('C', 200, 0), n('D', 0, 100), n('E', 100, 100), n('F', 200, 100)];
const GRID_SEGS = [
  seg('AB', 'A', 'B'), seg('BC', 'B', 'C'), seg('DE', 'D', 'E'), seg('EF', 'E', 'F'),
  seg('AD', 'A', 'D'), seg('BE', 'B', 'E'), seg('CF', 'C', 'F'),
];
const grid = () => net(GRID_NODES, GRID_SEGS);

function req(id: string, pickup: string, dest: string, extra: Partial<RideRequest> = {}): RideRequest {
  return {
    requestId: id, passengerId: 'p1', pickupNodeId: pickup, destinationNodeId: dest,
    initialFare: 120, estimatedDistance: 1, estimatedDuration: 3, requestedArrivalTime: null,
    bookingType: 'app', status: 'WaitingForPickup', surge: 1, ...extra,
  };
}

function rideAt(network: RoadNetwork, x: number, z: number) {
  const bus = new EventBus<GameEvents>();
  const rm = new RideManager({ roadNetwork: network, bus });
  rm.update({ x, z, speed: 0, heading: 0 }, 0.1);
  return rm;
}

describe('pickup validity (T8.4)', () => {
  it('all generated requests have reachable, motorcycle-accessible, practical pickups (500 seeds)', () => {
    const network = RoadNetwork.fromDistricts([mirparaData as DistrictData]);
    for (let seed = 0; seed < 500; seed++) {
      const gen = new RequestGenerator(network, new Rng(seed));
      const res = gen.sampleRequest(540, 'clear');
      expect(res, `seed ${seed}`).not.toBeNull();
      const { pickupNodeId, destinationNodeId } = res!.request;
      expect(network.getNode(pickupNodeId), `seed ${seed}`).toBeDefined();
      const incident = network
        .getAllSegments()
        .filter((s) => s.startNodeId === pickupNodeId || s.endNodeId === pickupNodeId);
      // Usable kerb: accessible, practical, and not mid-carriageway of a divided road.
      expect(
        incident.some((s) => s.motorcycleAccessible && s.pickupPractical && !s.divided),
        `seed ${seed} pickup ${pickupNodeId}`
      ).toBe(true);
      expect(network.route(destinationNodeId, pickupNodeId, { mode: 'motorcycle' }), `seed ${seed}`).not.toBeNull();
      expect(network.route(pickupNodeId, destinationNodeId, { mode: 'motorcycle' }), `seed ${seed}`).not.toBeNull();
    }
  });

  // Rider R, eastbound divided lane R->X->U, U-turn at U, westbound lane U->W->P (pickup).
  const divided = () =>
    net(
      [n('R', 0, 0), n('X', 60, 0, ['crossing']), { ...n('U', 400, 0), kind: 'uturn' as const }, n('W', 200, 20), n('P', 50, 20), n('Z', 0, 20), n('Q', 60, -20)],
      [
        seg('RX', 'R', 'X', { oneWay: true, divided: true }),
        seg('XU', 'X', 'U', { oneWay: true, divided: true }),
        seg('UW', 'U', 'W', { oneWay: true, divided: true }),
        seg('WP', 'W', 'P', { oneWay: true, divided: true }),
        seg('PZ', 'P', 'Z'),
        seg('XQ', 'X', 'Q'), // the crossing has a kerb on an ordinary side street
      ]
    );

  it('a pickup across a divided road offers a safe alternative', () => {
    const network = divided();
    const opts = network.pickupOptions({ pickupNodeId: 'P' }, 'R');
    expect(opts?.crossPoint?.nodeId).toBe('X');
    expect(opts!.crossPoint!.savesMin).toBeGreaterThan(0);
  });

  it('relocating changes the route, ETA and passenger mood; refused once onboard', () => {
    const network = divided();
    const rm = rideAt(network, 0, 0);
    rm.enableNegotiation = true;
    rm.offer(req('r1', 'P', 'Z'));
    expect(rm.accept('r1')).toBe(true);
    const before = rm.currentRoute!;
    expect(before.nodeIds[0]).toBe('R');
    expect(before.nodeIds[before.nodeIds.length - 1]).toBe('P');
    const moodBefore = rm.getPassengerMood();
    const fareBefore = rm.getActiveRequest()!.initialFare;

    const walkM = network.pickupOptions({ pickupNodeId: 'P' }, 'R')!.crossPoint!.walkM;
    expect(rm.relocatePickup('X', walkM)).toBe(true);
    expect(rm.getActiveRequest()!.pickupNodeId).toBe('X');
    expect(rm.currentRoute!.nodeIds[rm.currentRoute!.nodeIds.length - 1]).toBe('X');
    expect(rm.currentRoute!.etaMin).toBeLessThan(before.etaMin);
    expect(rm.getPassengerMood()).toBeLessThan(moodBefore);
    // Re-priced through negotiation: the fare follows the new trip, still in Negotiating.
    expect(rm.getTripState()).toBe('Negotiating');
    expect(rm.getActiveRequest()!.initialFare).not.toBe(fareBefore);

    expect(rm.relocatePickup('nope', 10)).toBe(false);
    // A lying walk distance is rejected, and nothing changes.
    expect(rm.relocatePickup('P', 1)).toBe(false);
    expect(rm.getActiveRequest()!.pickupNodeId).toBe('X');
    rm.agreeFare(rm.getActiveRequest()!.initialFare);
    rm.update({ x: 60, z: 0, speed: 0, heading: 0 }, 0.1);
    rm.update({ x: 60, z: 0, speed: 0, heading: 0 }, 0.1);
    expect(['PassengerOnboard', 'EnRouteToDestination']).toContain(rm.getTripState());
    expect(rm.relocatePickup('P', 22)).toBe(false);
  });
});

describe('navigation and reroute (T8.4)', () => {
  it('relocating to a divided-road or inaccessible node is refused and changes nothing', () => {
    const network = net(
      [n('A', 0, 0), n('B', 100, 0), n('C', 200, 0), n('D', 100, 40), n('E', 130, 0)],
      [
        seg('AB', 'A', 'B'), seg('BC', 'B', 'C'),
        seg('BD', 'B', 'D', { divided: true }),
        seg('CE', 'C', 'E', { motorcycleAccessible: false }),
      ]
    );
    const rm = rideAt(network, 0, 0);
    rm.enableNegotiation = true;
    rm.offer(req('r1', 'C', 'A'));
    rm.accept('r1');
    const route = rm.currentRoute;
    const mood = rm.getPassengerMood();
    expect(rm.relocatePickup('D', 100)).toBe(false); // divided only
    expect(rm.relocatePickup('E', 70)).toBe(false); // inaccessible only
    expect(rm.getActiveRequest()!.pickupNodeId).toBe('C');
    expect(rm.currentRoute).toBe(route);
    expect(rm.getPassengerMood()).toBe(mood);
    expect(rm.relocatePickup('B', 100)).toBe(true); // legal
  });

  it('accept routes from the bike nearest node to the pickup, then pickup to destination', () => {
    const network = grid();
    const rm = rideAt(network, 5, 5);
    rm.offer(req('r1', 'C', 'F'));
    rm.accept('r1');
    expect(rm.currentRoute!.nodeIds[0]).toBe('A');
    expect(rm.currentRoute!.nodeIds.at(-1)).toBe('C');
    rm.update({ x: 200, z: 0, speed: 0, heading: 0 }, 0.1);
    expect(rm.getTripState()).toBe('EnRouteToDestination');
    expect(rm.currentRoute!.nodeIds[0]).toBe('C');
    expect(rm.currentRoute!.nodeIds.at(-1)).toBe('F');
  });

  it('nextInstruction turns left/right by the bike heading convention and arrives', () => {
    const network = grid();
    const route = network.route('A', 'F', { mode: 'motorcycle' })!; // A-B-C-F or similar, 3 legs
    const nodes = network.getNodesMap();
    const pose = { x: 0, z: 0, heading: Math.PI / 2 }; // facing +x, along A->B
    const i = nextInstruction(route, pose, nodes) as NavInstruction;
    expect(i).not.toBeNull();
    expect(i.distanceM).toBeCloseTo(100, 0);
    // A->B->C continues straight, then C->F turns toward +z: heading +x to +z is a RIGHT turn.
    const viaC = { ...route, nodeIds: ['A', 'B', 'C', 'F'], segmentIds: ['AB', 'BC', 'CF'] };
    expect(nextInstruction(viaC, { x: 0, z: 0, heading: Math.PI / 2 }, nodes)!.kind).toBe('straight');
    const second = nextInstruction(viaC, { x: 150, z: 0, heading: Math.PI / 2 }, nodes)!;
    expect(second.kind).toBe('right');
    expect(second.distanceM).toBeCloseTo(50, 0);
    expect(nextInstruction(viaC, { x: 200, z: 50, heading: 0 }, nodes)!.kind).toBe('arrive');
    expect(nextInstruction(viaC, { x: 0, z: 0, heading: -Math.PI / 2 }, nodes)!.kind).toBe('uturn');
    expect(nextInstruction(null, pose, nodes)).toBeNull();
  });

  it('a missed turn recalculates and the instruction never points at the old route', () => {
    const network = grid();
    const rm = rideAt(network, 0, 0);
    rm.offer(req('r1', 'C', 'F'));
    rm.accept('r1');
    const old = rm.currentRoute!;
    expect(old.nodeIds).toEqual(['A', 'B', 'C']);
    // The rider heads down to D instead (100 m off the route).
    let off = false;
    const seen: boolean[] = [];
    for (let k = 0; k < 6; k++) {
      rm.update({ x: 0, z: 100, speed: 5, heading: 0 }, 0.5);
      off = rm.isOffRoute({ x: 0, z: 100 });
      seen.push(off);
    }
    expect(seen.slice(0, 3)).toEqual([false, false, false]); // under 2 s
    expect(off).toBe(true);
    const fresh = rm.reroute({ x: 0, z: 100 })!;
    expect(fresh).not.toBeNull();
    expect(rm.currentRoute).toBe(fresh);
    expect(fresh.nodeIds[0]).toBe('D');
    expect(fresh.nodeIds.at(-1)).toBe('C');
    const ins = nextInstruction(rm.currentRoute, { x: 0, z: 100, heading: Math.PI / 2 }, network.getNodesMap())!;
    expect(ins.distanceM).toBeCloseTo(100, 0);
    expect(rm.isOffRoute({ x: 0, z: 100 })).toBe(false);
  });

  it('a blocked segment reroutes, or fails the trip clearly when no route remains', () => {
    const rm = rideAt(grid(), 0, 0);
    rm.offer(req('r1', 'C', 'F'));
    rm.accept('r1');
    const alt = rm.rerouteIfBlocked('BC');
    expect(alt).not.toBeNull();
    expect(alt!.segmentIds).not.toContain('BC');
    expect(rm.getTripState()).not.toBe('Failed');

    // A single road: nothing to fall back on.
    const line = net([n('A', 0, 0), n('B', 100, 0), n('C', 200, 0)], [seg('AB', 'A', 'B'), seg('BC', 'B', 'C')]);
    const rm2 = rideAt(line, 0, 0);
    rm2.offer(req('r2', 'C', 'A'));
    rm2.accept('r2');
    expect(rm2.rerouteIfBlocked('BC')).toBeNull();
    expect(rm2.getTripState()).toBe('Failed');
    expect(rm2.getActiveRequest()).toBeNull();
    const v = deriveRideView(rm2);
    expect(v.objectiveKey).toBe('objective.no_route');
    expect(v.navTargetNodeId).toBeNull();
    expect(v.instruction).toBeNull();
  });

  it('no instruction after completion or cancel', () => {
    const network = grid();
    const rm = rideAt(network, 0, 0);
    rm.offer(req('r1', 'B', 'C'));
    rm.accept('r1');
    rm.update({ x: 0, z: 0, speed: 0, heading: Math.PI / 2 }, 0.1);
    expect(deriveRideView(rm).instruction).not.toBeNull();
    rm.update({ x: 100, z: 0, speed: 0, heading: Math.PI / 2 }, 0.1);
    rm.update({ x: 200, z: 0, speed: 0, heading: Math.PI / 2 }, 0.1);
    expect(rm.getTripState()).toBe('Idle');
    expect(nextInstruction(rm.currentRoute, { x: 200, z: 0, heading: 0 }, network.getNodesMap())).toBeNull();
    const v = deriveRideView(rm);
    expect(v.instruction).toBeNull();
    expect(v.navTargetNodeId).toBeNull();

    rm.offer(req('r2', 'B', 'C'));
    rm.accept('r2');
    rm.cancel('r2', 'rider', 'test');
    expect(deriveRideView(rm).instruction).toBeNull();
  });

  it('nextInstruction and isOffRoute do not allocate per call (200k calls)', () => {
    const network = grid();
    const rm = rideAt(network, 0, 0);
    rm.offer(req('r1', 'C', 'F'));
    rm.accept('r1');
    const route = rm.currentRoute!;
    const nodes = network.getNodesMap();
    const pose = { x: 50, z: 3, heading: Math.PI / 2 };
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 200_000; i++) {
      nextInstruction(route, pose, nodes);
      rm.isOffRoute(pose);
    }
    expect((process.memoryUsage().heapUsed - before) / (1024 * 1024)).toBeLessThan(8);
  });

  it('isOffRoute is quiet with no route and uses sim time only', () => {
    const rm = rideAt(grid(), 0, 0);
    expect(rm.isOffRoute({ x: 999, z: 999 })).toBe(false);
  });
});

describe('dead phone and suspended app (T8.4, Review Focus #4)', () => {
  function liveSession(seed: number): GameSession {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: true });
    const node = road.getAllNodes()[0]!;
    session.bike.x = node.x;
    session.bike.z = node.z;
    return session;
  }

  function collect(session: GameSession, steps: number): RideRequest[] {
    const seen: RideRequest[] = [];
    session.gm.bus.on('ride/requested', ({ request }) => seen.push(request));
    for (let i = 0; i < steps; i++) {
      session.step(NEUTRAL, SIM_DT);
      // Keep the offer list from piling up so the shift keeps generating.
      for (const o of session.ride.getOfferedRequests()) {
        if (seen.length < 400) session.ride.cancel(o.requestId, 'system', 'test');
      }
    }
    return seen;
  }

  it('i18n: the new keys exist in bn and en', () => {
    const keys = [
      'objective.charge_phone', 'objective.app_suspended', 'objective.no_route',
      'nav.left', 'nav.right', 'nav.straight', 'nav.uturn', 'nav.arrive', 'hud.charge_phone',
    ];
    for (const k of keys) {
      expect((enHud as Record<string, string>)[k], `en ${k}`).toBeTruthy();
      expect((bnHud as Record<string, string>)[k], `bn ${k}`).toBeTruthy();
    }
  });

  it('dead phone: no app requests, objective says charge, street rides remain, charging restores app requests', () => {
    const session = liveSession(11);
    const { gm, ride } = session;
    gm.economyManager.phoneBattery = 0;
    gm.economy.phoneBattery = 0;
    expect(deriveRideView(ride).objectiveKey).toBe('objective.charge_phone');

    const seen = collect(session, 9000);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((r) => r.bookingType === 'app')).toHaveLength(0);
    const street = seen.find((r) => r.bookingType === 'street');
    expect(street, 'a street pickup is still offered').toBeDefined();

    // The street ride is rideable end to end.
    ride.offer(street!);
    expect(ride.accept(street!.requestId)).toBe(true);
    const p = session.road.getNode(street!.pickupNodeId)!;
    const d = session.road.getNode(street!.destinationNodeId)!;
    session.bike.x = p.x; session.bike.z = p.z; session.bike.speed = 0;
    session.step(NEUTRAL, SIM_DT);
    session.bike.x = d.x; session.bike.z = d.z; session.bike.speed = 0;
    session.step(NEUTRAL, SIM_DT);
    expect(ride.getTripState()).toBe('Idle');

    // Charging is a real command: at the home node, it costs time, restores the battery.
    const home = (session.road.getNode(gm.homeNodeId) ?? session.road.getAllNodes()[0])!;
    session.bike.x = home.x; session.bike.z = home.z;
    const t0 = gm.clock.minutes;
    expect(gm.dispatch({ type: 'chargePhone', location: 'home' }).success).toBe(true);
    expect(gm.economyManager.phoneBattery).toBe(100);
    expect(gm.clock.minutes).toBeGreaterThan(t0);
    expect(deriveRideView(ride).objectiveKey).not.toBe('objective.charge_phone');
    const after = collect(session, 9000);
    expect(after.some((r) => r.bookingType === 'app')).toBe(true);
  });

  it('chargePhone without a location is rejected and the battery is unchanged', () => {
    const session = liveSession(14);
    session.gm.economyManager.phoneBattery = 0;
    const r = session.gm.dispatch({ type: 'chargePhone', cost: 10 });
    expect(r.success).toBe(false);
    expect(session.gm.economyManager.phoneBattery).toBe(0);
    const bare = new GameManager({ seed: 1, mode: 'career', data: {} });
    bare.economyManager.phoneBattery = 0;
    expect(bare.dispatch({ type: 'chargePhone', location: 'home' }).success).toBe(false);
    expect(bare.economyManager.phoneBattery).toBe(0);
  });

  it('a valid charge costs the stated cash and advances time by the stated wait', () => {
    const session = liveSession(15);
    const { gm } = session;
    const home = (session.road.getNode(gm.homeNodeId) ?? session.road.getAllNodes()[0])!;
    session.bike.x = home.x;
    session.bike.z = home.z;
    gm.economyManager.phoneBattery = 5;
    const cash = gm.economyManager.cash;
    const t0 = gm.clock.minutes;
    expect(gm.dispatch({ type: 'chargePhone', location: 'home' }).success).toBe(true);
    expect(gm.clock.minutes - t0).toBeCloseTo(BALANCE.PHONE.chargeWaitMin.home, 0);
    expect(gm.economyManager.cash).toBe(cash);
    expect(gm.economyManager.phoneBattery).toBe(100);
  });

  it('charging far from any charge spot is refused', () => {
    const session = liveSession(12);
    session.bike.x = 9999;
    session.bike.z = 9999;
    session.gm.economyManager.phoneBattery = 0;
    expect(session.gm.dispatch({ type: 'chargePhone', location: 'home' }).success).toBe(false);
    expect(session.gm.economyManager.phoneBattery).toBe(0);
  });

  it('suspended app: objective explains, app requests stop, street rides remain, ends after the suspension', () => {
    const session = liveSession(13);
    const { gm, ride } = session;
    for (let i = 0; i < 3; i++) ride.addStrike(gm.clock.day);
    expect(ride.isAppSuspended(gm.clock.day)).toBe(true);
    expect(deriveRideView(ride).objectiveKey).toBe('objective.app_suspended');
    const seen = collect(session, 9000);
    expect(seen.filter((r) => r.bookingType === 'app')).toHaveLength(0);
    expect(seen.some((r) => r.bookingType === 'street')).toBe(true);
    gm.clock.day = ride.appSuspendedUntilDay;
    expect(deriveRideView(ride).objectiveKey).not.toBe('objective.app_suspended');
  });
});
