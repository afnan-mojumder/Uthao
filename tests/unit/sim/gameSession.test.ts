import { describe, it, expect, vi } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import { fuelUsed } from '../../../src/sim/economy/fuel';
import { SIM_DT } from '../../../src/config/constants';
import { TIME_SCALE } from '../../../src/core/clock';
import { angleDiff, clamp } from '../../../src/core/math';
import type { DistrictData } from '../../../src/sim/schemas';
import type { BikeInput, BikeState } from '../../../src/physics/bikeModel';
import type { RoadSegment } from '../../../src/core/types';
import testloopData from '../../../data/districts/testloop.json';

const NEUTRAL_INPUT: BikeInput = { throttle: 0, brake: 0, steer: 0 };
const MINUTES_PER_STEP = (SIM_DT * TIME_SCALE) / 60;

function makeSession(opts: { seed: number; autoRequests?: boolean }): GameSession {
  const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const gm = new GameManager({ seed: opts.seed, mode: 'career', data: {} });
  return new GameSession({ gm, road, autoRequests: opts.autoRequests });
}

async function makeSessionWithPhysics(opts: {
  seed: number;
  autoRequests?: boolean;
}): Promise<GameSession> {
  const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const gm = new GameManager({ seed: opts.seed, mode: 'career', data: {} });
  const physics = await PhysicsWorld.create();
  return new GameSession({ gm, road, physics, autoRequests: opts.autoRequests });
}

/** Smallest heading error against a road segment, counting either travel
 * direction along it as "aligned" since a bike can face either way on a road. */
function headingError(bike: BikeState, segment: RoadSegment, road: RoadNetwork): number {
  const start = road.getNode(segment.startNodeId)!;
  const end = road.getNode(segment.endNodeId)!;
  const segHeading = Math.atan2(end.x - start.x, end.z - start.z);
  const diff = Math.abs(angleDiff(bike.heading, segHeading));
  return Math.min(diff, Math.PI - diff);
}

/** Steers and throttles the session towards `target` for `seconds` of sim time. */
function driveInto(
  session: GameSession,
  target: { x: number; z: number },
  seconds: number
): void {
  const steps = Math.ceil(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) {
    const dx = target.x - session.bike.x;
    const dz = target.z - session.bike.z;
    const desiredHeading = Math.atan2(dx, dz);
    const steer = clamp(angleDiff(session.bike.heading, desiredHeading) * 2, -1, 1);
    session.step({ throttle: 1, brake: 0, steer }, SIM_DT);
  }
}

function stepMinutes(session: GameSession, minutes: number): void {
  const steps = Math.ceil(minutes / MINUTES_PER_STEP);
  for (let i = 0; i < steps; i++) {
    session.step(NEUTRAL_INPUT, SIM_DT);
  }
}

function run(seed: number) {
  const session = makeSession({ seed });
  stepMinutes(session, 30);
  return session.gm.snapshot();
}

describe('T7.2 GameSession real request loop', () => {
  it('offers real generated requests with no hardcoded ride', () => {
    const s = makeSession({ seed: 7 });
    stepMinutes(s, 30);
    expect(s.ride.getOfferedRequests().length).toBeGreaterThan(0);
    expect(
      s.ride.getOfferedRequests().some((r) => r.requestId === 'req_tutorial_01')
    ).toBe(false);
  });

  it('the same seed and inputs give identical snapshots', () => {
    expect(run(9).economy).toEqual(run(9).economy);
  });

  it('does not auto-offer requests when autoRequests is disabled', () => {
    const s = makeSession({ seed: 3, autoRequests: false });
    stepMinutes(s, 30);
    expect(s.ride.getOfferedRequests().length).toBe(0);
  });

  it('advances the clock and moves the bike each step', () => {
    const s = makeSession({ seed: 1 });
    const startMinutes = s.gm.clock.minutes;
    s.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    expect(s.gm.clock.minutes).toBeGreaterThan(startMinutes);
    expect(s.bike.speed).toBeGreaterThan(0);
  });
});

describe('T7.3 real physics, road spawn and collisions', () => {
  it('spawns on a road, aligned to it', () => {
    const s = makeSession({ seed: 7, autoRequests: false });
    s.spawnAtHome();
    const segment = s.road.segmentAt(s.bike.x, s.bike.z);
    expect(segment).not.toBeNull();
    expect(headingError(s.bike, segment!, s.road)).toBeLessThan(0.1);
  });

  it('driving into a wall through MotorcycleController stops the bike and emits a collision', async () => {
    const s = await makeSessionWithPhysics({ seed: 1, autoRequests: false });
    const hits = vi.fn();
    s.gm.bus.on('bike/collision', hits);

    // Bike faces +Z from the origin; a wall spans x=-5..5 at z=6.
    s.bike.x = 0;
    s.bike.z = 0;
    s.bike.heading = 0;
    s.bike.speed = 0;
    s.physics!.addStaticBox(0, 0.5, 6, 5.0, 1.0, 0.2);

    driveInto(s, { x: 0, z: 6 }, 5);

    expect(hits).toHaveBeenCalled();
    expect(s.bike.speed).toBeLessThan(2);
  });

  it('touching a traffic agent emits a collision', () => {
    const s = makeSession({ seed: 5, autoRequests: false });
    s.bike.x = 0;
    s.bike.z = 0;
    s.bike.heading = 0;
    s.bike.speed = 0;

    const hits = vi.fn();
    s.gm.bus.on('bike/collision', hits);

    // Placed just ahead of the bike on a lane id that doesn't exist in this
    // network, so TrafficManager.update() leaves its position untouched.
    s.traffic.agents.set('test_agent', {
      id: 'test_agent',
      kind: 'car',
      laneId: 'no_such_lane',
      distAlongLane: 0,
      speed: 0,
      x: 0.5,
      z: 0.5,
      heading: 0,
      length: 4.5,
      width: 1.8,
      desiredSpeed: 0,
      lod: 'near',
    });

    s.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);

    expect(hits).toHaveBeenCalled();
    expect(hits.mock.calls[0]![0].otherKind).toBe('traffic');
  });
});

describe('newCareer resets settlement state (T8.2 fix)', () => {
  it('a second career can settle the tutorial ride again', () => {
    const s = makeSession({ seed: 5, autoRequests: false });
    const completed: unknown[] = [];
    s.gm.bus.on('ride/completed', (e) => completed.push(e));

    s.newCareer();
    const cash0 = s.gm.economyManager.cash;
    expect(s.settleTutorialRide(100)).not.toBeNull();
    expect(s.gm.economyManager.cash).toBeGreaterThan(cash0);
    expect(completed).toHaveLength(1);

    s.gm.requestSeq = 9;
    s.newCareer();
    expect(s.gm.economyManager.getLedger()).toHaveLength(0);
    expect(s.gm.economyManager.getSettledIds()).toHaveLength(0);
    expect(s.gm.requestSeq).toBe(0);

    const cash1 = s.gm.economyManager.cash;
    expect(s.settleTutorialRide(100)).not.toBeNull();
    expect(s.gm.economyManager.cash).toBeGreaterThan(cash1);
    expect(completed).toHaveLength(2);
  });

  it('an already-settled tutorial ride still announces completion without paying twice', () => {
    const s = makeSession({ seed: 5, autoRequests: false });
    s.newCareer();
    s.settleTutorialRide(100);
    const cash = s.gm.economyManager.cash;
    const completed: unknown[] = [];
    s.gm.bus.on('ride/completed', (e) => completed.push(e));
    expect(s.settleTutorialRide(100)).not.toBeNull();
    expect(s.gm.economyManager.cash).toBe(cash);
    expect(completed).toHaveLength(1);
  });
});

describe('T8.3 live fuel, wear and recovery', () => {
  const FAR = { x: 9000, z: 9000 };
  const PUMP = { x: 100, z: 0 }; // testloop poi_fuel at node N2

  function sessionAt(opts: {
    cash?: number;
    fuelLevel?: number;
    condition?: number;
    at?: { x: number; z: number };
  }): GameSession {
    const s = makeSession({ seed: 3, autoRequests: false });
    const e = s.gm.economyManager;
    if (opts.cash !== undefined) e.cash = opts.cash;
    if (opts.fuelLevel !== undefined) e.fuelLevel = opts.fuelLevel;
    if (opts.condition !== undefined) {
      e.engineCondition = e.tiresCondition = e.brakesCondition = opts.condition;
      e.kmSinceOilChange = (100 - opts.condition) * 0.6;
      e.motorcycleCondition = e.getOverallCondition();
    }
    const at = opts.at ?? FAR;
    s.bike.x = at.x;
    s.bike.z = at.z;
    s.bike.heading = 0;
    return s;
  }

  function ride(s: GameSession, steps: number, input: BikeInput): number {
    const x0 = s.bike.x;
    const z0 = s.bike.z;
    for (let i = 0; i < steps; i++) s.step(input, SIM_DT);
    return Math.hypot(s.bike.x - x0, s.bike.z - z0);
  }

  /** Alternates 1 s of throttle with 1 s of braking: a stop-and-go jam. */
  function jam(s: GameSession, seconds: number): number {
    const x0 = s.bike.x;
    const z0 = s.bike.z;
    const per = Math.round(1 / SIM_DT);
    for (let i = 0; i < seconds; i++) {
      for (let j = 0; j < per; j++) s.step({ throttle: 0.6, brake: 0, steer: 0 }, SIM_DT);
      for (let j = 0; j < per; j++) s.step({ throttle: 0, brake: 1, steer: 0 }, SIM_DT);
    }
    return Math.hypot(s.bike.x - x0, s.bike.z - z0);
  }

  const burnedPerKm = (s: GameSession, startL: number, metres: number) =>
    (startL - s.gm.economyManager.fuelLevel) / ((metres * 3) / 1000);

  it('riding burns fuel by distance; a jam burns more per km than open road', () => {
    const open = sessionAt({ fuelLevel: 4 });
    const dOpen = ride(open, 60 * 20, { throttle: 1, brake: 0, steer: 0 });
    const burnedOpen = 4 - open.gm.economyManager.fuelLevel;
    expect(dOpen).toBeGreaterThan(50);
    expect(burnedOpen).toBeGreaterThan(0);

    const stuck = sessionAt({ fuelLevel: 4 });
    const dJam = jam(stuck, 20);
    expect(dJam).toBeGreaterThan(0);
    expect(burnedPerKm(stuck, 4, dJam)).toBeGreaterThan(burnedPerKm(open, 4, dOpen));
  });

  it('a standing bike with no ride and no throttle burns nothing', () => {
    const s = sessionAt({ fuelLevel: 4 });
    ride(s, 600, NEUTRAL_INPUT);
    expect(s.gm.economyManager.fuelLevel).toBe(4);
  });

  it('a passenger on board and worn condition both increase consumption', () => {
    const full = { throttle: 1, brake: 0, steer: 0 };
    const base = sessionAt({ fuelLevel: 4, condition: 100 });
    const dBase = ride(base, 900, full);

    // Passenger load, rough road and hard throttle are priced by fuelUsed itself.
    const per = (o: Parameters<typeof fuelUsed>[2]) => fuelUsed(10, 0, o);
    expect(per({ loadKg: 70 })).toBeGreaterThan(per({}));
    expect(per({ roughness: 1 })).toBeGreaterThan(per({}));
    expect(per({ throttleStress: 1 })).toBeGreaterThan(per({}));

    const worn = sessionAt({ fuelLevel: 4, condition: 50 });
    const dWorn = ride(worn, 900, full);
    expect(burnedPerKm(worn, 4, dWorn)).toBeGreaterThan(burnedPerKm(base, 4, dBase));
  });

  it('riding wears the bike per km', () => {
    const s = sessionAt({ fuelLevel: 4, condition: 100 });
    const before = s.gm.economyManager.engineCondition;
    ride(s, 60 * 30, { throttle: 1, brake: 0, steer: 0 });
    expect(s.gm.economyManager.engineCondition).toBeLessThan(before);
  });

  it('tripFuelLiters accumulates during a trip and feeds settleTrip', () => {
    const s = sessionAt({ fuelLevel: 4 });
    expect(s.tripFuelLiters).toBe(0);
    s.beginTripFuel();
    ride(s, 600, { throttle: 1, brake: 0, steer: 0 });
    expect(s.tripFuelLiters).toBeCloseTo(4 - s.gm.economyManager.fuelLevel, 8);
    expect(s.tripFuelLiters).toBeGreaterThan(0);
    s.beginTripFuel();
    expect(s.tripFuelLiters).toBe(0);
  });

  it('an empty tank cuts the bike to a push speed but it still moves', () => {
    const s = sessionAt({ fuelLevel: 0 });
    ride(s, 60 * 10, { throttle: 1, brake: 0, steer: 0 });
    expect(s.bike.speed).toBeGreaterThan(0.3);
    expect(s.bike.speed * 3.6).toBeLessThan(8);
    expect(s.gm.economyManager.fuelLevel).toBe(0);
  });

  it('buyFuel / refuelAtStation charge real money and never go negative', () => {
    const s = sessionAt({ cash: 1000, fuelLevel: 1, at: PUMP });
    const r = s.gm.dispatch({ type: 'refuelAtStation', liters: 2 });
    expect(r.success).toBe(true);
    expect(s.gm.economyManager.fuelLevel).toBeCloseTo(3, 5);
    expect(s.gm.economyManager.cash).toBe(1000 - Math.round(2 * 130));

    const poor = sessionAt({ cash: 130, fuelLevel: 0, at: PUMP });
    const r2 = poor.gm.dispatch({ type: 'buyFuel', liters: 5 });
    expect(r2.success).toBe(true);
    expect(poor.gm.economyManager.fuelLevel).toBeCloseTo(1, 5);
    expect(poor.gm.economyManager.cash).toBe(0);

    const broke = sessionAt({ cash: 0, fuelLevel: 0, at: PUMP });
    expect(broke.gm.dispatch({ type: 'buyFuel', liters: 5 }).success).toBe(false);
    expect(broke.gm.economyManager.fuelLevel).toBe(0);
    expect(broke.gm.economyManager.cash).toBe(0);
  });

  it('refuelAtStation requires being near a fuel station', () => {
    const s = sessionAt({ cash: 1000, fuelLevel: 1, at: FAR });
    expect(s.gm.dispatch({ type: 'refuelAtStation', liters: 2 }).success).toBe(false);
    expect(s.gm.economyManager.cash).toBe(1000);
    expect(s.nearFuelStation()).toBe(false);
  });

  it('empty tank with zero cash can still recover, at a real cost', () => {
    const s = sessionAt({ cash: 0, fuelLevel: 0 });
    const minutes0 = s.gm.clock.minutes;
    const debt0 = s.gm.economyManager.debt;
    expect(s.gm.dispatch({ type: 'callFuelRescue' }).success).toBe(true);
    expect(s.gm.economyManager.fuelLevel).toBeGreaterThan(0);
    expect(s.gm.economyManager.debt).toBeGreaterThan(debt0);
    expect(s.gm.economyManager.cash).toBe(0);
    expect(s.gm.clock.minutes).toBeGreaterThan(minutes0);
  });

  it('a rescue is refused while the tank is not low', () => {
    const s = sessionAt({ cash: 500, fuelLevel: 5 });
    expect(s.gm.dispatch({ type: 'callFuelRescue' }).success).toBe(false);
    expect(s.gm.economyManager.debt).toBe(0);
  });

  it('low condition warns before it breaks down, and a repair fixes it', () => {
    const events: string[] = [];
    const s = sessionAt({ cash: 5000, fuelLevel: 8, condition: 12 });
    s.gm.bus.on('bike/conditionWarning', () => events.push('warn'));
    s.gm.bus.on('bike/breakdown', () => events.push('breakdown'));
    for (let i = 0; i < 40 && !events.includes('breakdown'); i++) {
      ride(s, 60 * 10, { throttle: 1, brake: 0, steer: 0 });
    }
    expect(events[0]).toBe('warn');
    expect(events).toContain('breakdown');

    expect(s.gm.dispatch({ type: 'repair', item: 'full' }).success).toBe(true);
    expect(s.gm.economyManager.motorcycleCondition).toBeGreaterThan(90);
  });

  it('a healthy bike never breaks down', () => {
    const s = sessionAt({ fuelLevel: 8, condition: 100 });
    let broke = 0;
    s.gm.bus.on('bike/breakdown', () => broke++);
    ride(s, 60 * 60, { throttle: 1, brake: 0, steer: 0 });
    expect(broke).toBe(0);
  });
});

describe('T8.3 fix: rescue wait runs through the real clock path', () => {
  function rescueAt(minutes: number) {
    const s = makeSession({ seed: 3, autoRequests: false });
    s.gm.economyManager.fuelLevel = 0;
    s.gm.economyManager.cash = 0;
    s.gm.clock.minutes = minutes;
    return s;
  }

  it('mid-day: advances exactly the wait and fires the hour event once', () => {
    const s = rescueAt(10 * 60 + 50);
    const hours: number[] = [];
    s.gm.bus.on('clock/hour', (e) => hours.push(e.hour));
    s.gm.dispatch({ type: 'callFuelRescue' });
    expect(s.gm.clock.minutes).toBeCloseTo(10 * 60 + 70, 5);
    expect(hours).toEqual([11]);
  });

  it('near the end of the day: forced shift end runs once and the clock never overshoots', () => {
    const s = rescueAt(22 * 60 + 50);
    let ended = 0;
    s.gm.bus.on('day/ended', () => ended++);
    s.gm.dispatch({ type: 'callFuelRescue' });
    expect(ended).toBe(1);
    expect(s.gm.clock.minutes).toBeLessThan(1440);
  });
});
