import { describe, it, expect, vi } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import { fuelUsed } from '../../../src/sim/economy/fuel';
import { SIM_DT } from '../../../src/config/constants';
import { TIME_SCALE } from '../../../src/core/clock';
import { Rng } from '../../../src/core/rng';
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

    // Drive into the wall until the first hit. Stop there: a bike held on the
    // throttle against the wall is later recovered (audit H-8), which is tested elsewhere.
    for (let i = 0; i < 600 && hits.mock.calls.length === 0; i++) {
      const desiredHeading = Math.atan2(0 - s.bike.x, 6 - s.bike.z);
      const steer = clamp(angleDiff(s.bike.heading, desiredHeading) * 2, -1, 1);
      s.step({ throttle: 1, brake: 0, steer }, SIM_DT);
    }

    expect(hits).toHaveBeenCalled();
    // Keep the throttle on against the wall for half a second (well inside the
    // recovery wait): the bike must stay stopped.
    for (let i = 0; i < 30; i++) {
      s.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    }
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

  it('newCareer resets upgrades, savings, debt, bike, and syncs bikeSpec cleanly via EconomyManager.resetCareer', () => {
    const s = makeSession({ seed: 6, autoRequests: false });
    s.gm.economyManager.cash = 9999;
    s.gm.economyManager.savings = 5000;
    s.gm.economyManager.debt = 400;
    s.gm.economyManager.ownedUpgrades.push('upgrade_good_tires', 'upgrade_engine_tune');
    s.gm.economyManager.currentBikeId = 'new150';
    s.syncBikeSpec();
    expect(s.ride.hasEngineTune).toBe(true);

    s.newCareer();

    expect(s.gm.economyManager.cash).toBe(600);
    expect(s.gm.economyManager.savings).toBe(0);
    expect(s.gm.economyManager.debt).toBe(0);
    expect(s.gm.economyManager.ownedUpgrades).toEqual([]);
    expect(s.gm.economyManager.currentBikeId).toBe('old100');
    expect(s.ride.hasEngineTune).toBe(false);
    expect(s.ride.activeBikeId).toBe('old100');
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

describe('P1.3 puncture cooldown across day boundaries and resets', () => {
  it('puncture late on Day 1 does not suppress a puncture on Day 2 after endShift + sleep', () => {
    const s = makeSession({ seed: 11, autoRequests: false });
    s.spawnAtHome();
    s.gm.economyManager.fuelLevel = s.gm.economyManager.maxFuelL();

    const punctureRng = (s as unknown as { punctureRng: Rng }).punctureRng;
    const chanceSpy = vi.spyOn(punctureRng, 'chance').mockReturnValue(true);

    let punctures = 0;
    s.gm.bus.on('bike/puncture', () => {
      punctures += 1;
    });

    // Day 1 evening at 20:00 (minutes = 1200)
    s.gm.clock.day = 1;
    s.gm.clock.minutes = 20 * 60;
    s.bike.speed = 15;
    s.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    expect(punctures).toBe(1);

    // Same evening (< 180 min later): cooldown suppresses another puncture
    s.bike.speed = 15;
    s.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    expect(punctures).toBe(1);

    // End Day 1 shift and sleep -> Day 2 at 07:00 (420 min); 660 elapsed minutes (> 180)
    expect(s.gm.dispatch({ type: 'endShift' }).success).toBe(true);
    expect(s.gm.dispatch({ type: 'sleep' }).success).toBe(true);
    expect(s.gm.clock.day).toBe(2);
    expect(s.gm.clock.minutes).toBe(7 * 60);

    s.bike.speed = 15;
    s.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    expect(punctures).toBe(2);

    // Restoring an earlier Day 1 snapshot or starting a new career clears puncture cooldown
    const day1Snap = makeSession({ seed: 11, autoRequests: false }).gm.snapshot();
    day1Snap.clock.day = 1;
    day1Snap.clock.minutes = 8 * 60;
    s.gm.applySnapshot(day1Snap);
    s.bike.speed = 15;
    s.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    expect(punctures).toBe(3);

    s.newCareer();
    s.bike.speed = 15;
    s.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    expect(punctures).toBe(4);

    chanceSpy.mockRestore();
  });
});

describe('P2.1 bike.y flyover elevation tracking', () => {
  it('bike.y smoothly rises onto an elevated flyover (y >= 5.5m) without snapping to ground lanes underneath', async () => {
    const flyDistrict: DistrictData = {
      districtId: 'mohakhal',
      name: { bn: 'মহাখাল', en: 'Mohakhal' },
      nodes: [
        { nodeId: 'ramp_start', x: 0, y: 0, z: 0, kind: 'junction' },
        { nodeId: 'fly_w', x: 100, y: 6.0, z: 0, kind: 'junction', tags: ['flyover'] },
        { nodeId: 'fly_e', x: 300, y: 6.0, z: 0, kind: 'junction', tags: ['flyover'] },
        { nodeId: 'under_n', x: 200, y: 0, z: -40, kind: 'junction' },
        { nodeId: 'under_s', x: 200, y: 0, z: 40, kind: 'junction' },
      ],
      segments: [
        {
          segmentId: 'seg_ramp',
          startNodeId: 'ramp_start',
          endNodeId: 'fly_w',
          width: 8,
          surfaceCondition: 0.95,
          trafficDensity: 0.3,
          speedLimit: 45,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0,
          riskLevel: 0.05,
          oneWay: true,
          divided: false,
          lanes: 1,
          roadType: 'flyover',
          floodSensitivity: 0,
          pickupPractical: false,
          district: 'mohakhal',
          tags: ['flyover', 'ramp'],
        },
        {
          segmentId: 'seg_deck',
          startNodeId: 'fly_w',
          endNodeId: 'fly_e',
          width: 10,
          surfaceCondition: 0.98,
          trafficDensity: 0.3,
          speedLimit: 60,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0,
          riskLevel: 0.05,
          oneWay: true,
          divided: false,
          lanes: 2,
          roadType: 'flyover',
          floodSensitivity: 0,
          pickupPractical: false,
          district: 'mohakhal',
          tags: ['flyover'],
        },
        {
          segmentId: 'seg_ground_cross',
          startNodeId: 'under_n',
          endNodeId: 'under_s',
          width: 10,
          surfaceCondition: 0.9,
          trafficDensity: 0.5,
          speedLimit: 40,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0.2,
          riskLevel: 0.1,
          oneWay: false,
          divided: false,
          lanes: 2,
          roadType: 'main',
          floodSensitivity: 0.1,
          pickupPractical: true,
          district: 'mohakhal',
          tags: [],
        },
      ],
      pois: [],
      lots: [],
    };

    const road = RoadNetwork.fromDistricts([flyDistrict]);
    const gm = new GameManager({ seed: 21, mode: 'career', data: {} });
    const physics = await PhysicsWorld.create();
    // Ground-level crossing kerb collider that sits at y = 0..0.18 across x=200, z=0
    physics.addStaticBox(200, 0.09, 0, 5, 0.09, 0.5, 0, 'kerb');

    const session = new GameSession({ gm, road, physics, autoRequests: false });
    session.bike.x = 5;
    session.bike.z = 0;
    session.bike.y = 0;
    session.bike.heading = Math.PI / 2; // heading +X

    const ys: number[] = [];
    for (let i = 0; i < 1800 && session.bike.x < 250; i++) {
      session.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
      ys.push(session.bike.y);
    }

    // Must rise smoothly up the ramp onto the elevated deck (y >= 5.5m)
    expect(session.bike.x).toBeGreaterThan(220);
    expect(session.bike.y).toBeGreaterThanOrEqual(5.5);
    expect(Math.max(...ys)).toBeCloseTo(6.0, 2);

    // Must never snap down to y = 0 while crossing over the ground street at x = 200
    const postDeckYs = ys.slice(Math.floor(ys.length * 0.7));
    expect(Math.min(...postDeckYs)).toBeGreaterThanOrEqual(5.5);
  });
});

describe('P4.4 Live EncounterContext in GameSession & day-rollover accident reset', () => {
  function makeLiveEncounterDistrict(): DistrictData {
    return {
      districtId: 'mirpara',
      name: { bn: 'মিরপাড়া', en: 'Mirpara' },
      nodes: [
        { nodeId: 'n_main_a', x: 0, z: 0, kind: 'junction' },
        { nodeId: 'n_main_b', x: 200, z: 0, kind: 'junction' },
        { nodeId: 'n_mkt', x: 400, z: 0, kind: 'junction' },
        { nodeId: 'n_alley', x: 600, z: 0, kind: 'junction' },
        { nodeId: 'n_dest', x: 800, z: 0, kind: 'junction' },
      ],
      segments: [
        {
          segmentId: 'seg_main',
          startNodeId: 'n_main_a',
          endNodeId: 'n_main_b',
          width: 10,
          surfaceCondition: 1,
          trafficDensity: 0.3,
          speedLimit: 40,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0.2,
          riskLevel: 0.1,
          oneWay: false,
          divided: false,
          lanes: 2,
          roadType: 'main',
          floodSensitivity: 0.1,
          pickupPractical: true,
          district: 'mirpara',
          tags: ['arterial'],
        },
        {
          segmentId: 'seg_market',
          startNodeId: 'n_main_b',
          endNodeId: 'n_mkt',
          width: 6,
          surfaceCondition: 0.8,
          trafficDensity: 0.5,
          speedLimit: 30,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0.5,
          riskLevel: 0.2,
          oneWay: false,
          divided: false,
          lanes: 1,
          roadType: 'market',
          floodSensitivity: 0.4,
          pickupPractical: true,
          district: 'mirpara',
          tags: ['market'],
        },
        {
          segmentId: 'seg_alley',
          startNodeId: 'n_mkt',
          endNodeId: 'n_alley',
          width: 4,
          surfaceCondition: 0.7,
          trafficDensity: 0.1,
          speedLimit: 20,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0.2,
          riskLevel: 0.8,
          oneWay: false,
          divided: false,
          lanes: 1,
          roadType: 'alley',
          floodSensitivity: 0.5,
          pickupPractical: true,
          district: 'mirpara',
          tags: ['alley'],
        },
        {
          segmentId: 'seg_dest',
          startNodeId: 'n_alley',
          endNodeId: 'n_dest',
          width: 8,
          surfaceCondition: 0.9,
          trafficDensity: 0.2,
          speedLimit: 35,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0.2,
          riskLevel: 0.1,
          oneWay: false,
          divided: false,
          lanes: 2,
          roadType: 'residential',
          floodSensitivity: 0.2,
          pickupPractical: true,
          district: 'mirpara',
          tags: [],
        },
      ],
      pois: [],
      lots: [],
    };
  }

  function advanceOneGameMinute(session: GameSession): void {
    const steps = Math.ceil(1 / MINUTES_PER_STEP) + 1;
    for (let i = 0; i < steps; i++) {
      session.step(NEUTRAL_INPUT, SIM_DT);
    }
  }

  it('triggers all 7 formerly-dead encounters from real GameSession context', () => {
    const road = RoadNetwork.fromDistricts([makeLiveEncounterDistrict()]);

    const triggerSingle = (
      encounterId: string,
      setup: (s: GameSession) => void,
      advanceSimSeconds = 4
    ) => {
      const gm = new GameManager({ seed: 17, mode: 'career', data: {} });
      // Isolate only the target encounter (filtering default definitions) so weighted peers don't mask it
      const targetDef = gm.eventDirector.definitions.find((d) => d.id === encounterId);
      expect(targetDef, `Definition ${encounterId} must exist`).toBeDefined();
      const isolatedGm = new GameManager({
        seed: 17,
        mode: 'career',
        data: { encounters: [targetDef!] },
      });
      isolatedGm.eventDirector.enabled = true;
      const s = new GameSession({ gm: isolatedGm, road, autoRequests: false, negotiation: false });

      const fired: string[] = [];
      isolatedGm.bus.on('encounter/started', ({ instance }) => fired.push(instance.encounterId));

      setup(s);

      const ticks = Math.ceil(advanceSimSeconds / SIM_DT);
      for (let i = 0; i < ticks && fired.length === 0; i++) {
        s.step(NEUTRAL_INPUT, SIM_DT);
      }
      expect(fired, `Expected ${encounterId} to trigger from live GameSession`).toContain(encounterId);
    };

    // 1. enc_police_signal_stop (triggered after a traffic infraction when slowed down)
    triggerSingle('enc_police_signal_stop', (s) => {
      s.gm.clock.minutes = 10 * 60;
      s.bike.x = 100;
      s.bike.z = 0;
      s.bike.speed = 60 / 3.6; // speeding on main road (limit 40) -> emits bike/infraction
      s.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
      s.bike.speed = 0;
    });

    // 2. enc_market_detour (onTrip, market tag, passengerLocalKnowledgeMin: 0.5)
    triggerSingle('enc_market_detour', (s) => {
      s.gm.clock.minutes = 11 * 60;
      const sample = s.requests.sampleRequest(s.gm.clock.minutes, 'clear', 'app')!;
      const profile = s.requests.getProfile(sample.request.passengerId)!;
      profile.localKnowledge = 0.8;
      sample.request.pickupNodeId = 'n_main_a';
      sample.request.destinationNodeId = 'n_dest';
      s.ride.offer(sample.request);
      s.ride.accept(sample.request.requestId);
      // Place at pickup to board passenger, then drive >= 30m along seg_market
      s.bike.x = 0;
      s.bike.z = 0;
      s.bike.speed = 0;
      s.step(NEUTRAL_INPUT, SIM_DT);
      s.bike.x = 240;
      s.bike.z = 0;
      s.bike.heading = Math.PI / 2;
      s.bike.speed = 12;
      for (let i = 0; i < 220; i++) {
        s.step({ throttle: 0.7, brake: 0, steer: 0 }, SIM_DT);
      }
      s.bike.speed = 0;
    });

    // 3. enc_alley_enter (atPickup, alley roadType)
    triggerSingle('enc_alley_enter', (s) => {
      s.gm.clock.minutes = 11 * 60;
      const sample = s.requests.sampleRequest(s.gm.clock.minutes, 'clear', 'app')!;
      sample.request.pickupNodeId = 'n_alley';
      sample.request.destinationNodeId = 'n_main_a';
      s.ride.offer(sample.request);
      s.ride.accept(sample.request.requestId);
      // Drive >= 15m along seg_alley into the 8m pickup radius of n_alley (x=600)
      s.bike.x = 575;
      s.bike.z = 0;
      s.bike.heading = Math.PI / 2;
      for (let i = 0; i < 300 && s.bike.x < 594; i++) {
        s.step({ throttle: 0.6, brake: 0, steer: 0 }, SIM_DT);
      }
      s.bike.speed = 0;
    });

    // 4. enc_no_change (dropOff, passengerPaymentReliabilityMax: 0.6)
    triggerSingle('enc_no_change', (s) => {
      s.gm.clock.minutes = 11 * 60;
      const sample = s.requests.sampleRequest(s.gm.clock.minutes, 'clear', 'app')!;
      const profile = s.requests.getProfile(sample.request.passengerId)!;
      profile.paymentReliability = 0.4;
      sample.request.pickupNodeId = 'n_main_a';
      sample.request.destinationNodeId = 'n_dest';
      s.ride.offer(sample.request);
      s.ride.accept(sample.request.requestId);
      s.bike.x = 0;
      s.bike.z = 0;
      s.bike.speed = 0;
      s.step(NEUTRAL_INPUT, SIM_DT); // board
      // Drive >= 15m into the 8m drop-off radius of n_dest (x=800)
      s.bike.x = 775;
      s.bike.z = 0;
      s.bike.heading = Math.PI / 2;
      for (let i = 0; i < 300 && s.bike.x < 794; i++) {
        s.step({ throttle: 0.6, brake: 0, steer: 0 }, SIM_DT);
      }
      s.bike.speed = 0;
    });

    // 5. enc_suspicious_pickup (atPickup, alley roadType)
    triggerSingle('enc_suspicious_pickup', (s) => {
      s.gm.clock.minutes = 11 * 60;
      const sample = s.requests.sampleRequest(s.gm.clock.minutes, 'clear', 'app')!;
      sample.request.pickupNodeId = 'n_alley';
      sample.request.destinationNodeId = 'n_main_a';
      s.ride.offer(sample.request);
      s.ride.accept(sample.request.requestId);
      // Drive >= 15m along seg_alley into the 8m pickup radius of n_alley (x=600)
      s.bike.x = 575;
      s.bike.z = 0;
      s.bike.heading = Math.PI / 2;
      for (let i = 0; i < 300 && s.bike.x < 594; i++) {
        s.step({ throttle: 0.6, brake: 0, steer: 0 }, SIM_DT);
      }
      s.bike.speed = 0;
    });

    // 6. enc_dark_alley_blockage (onTrip, alley roadType, hours [20, 5], respects >= 10s cue window)
    triggerSingle(
      'enc_dark_alley_blockage',
      (s) => {
        s.gm.clock.minutes = 21 * 60;
        const sample = s.requests.sampleRequest(s.gm.clock.minutes, 'clear', 'app')!;
        sample.request.pickupNodeId = 'n_main_a';
        sample.request.destinationNodeId = 'n_dest';
        s.ride.offer(sample.request);
        s.ride.accept(sample.request.requestId);
        s.bike.x = 0;
        s.bike.z = 0;
        s.bike.speed = 0;
        s.step(NEUTRAL_INPUT, SIM_DT); // board
        // Move to seg_alley (x=500, > 60m from n_dest=800)
        s.bike.x = 500;
        s.bike.z = 0;
        s.bike.speed = 0;
      },
      16
    );

    // 7. enc_puncture (real GameSession puncture roll triggers enc_puncture)
    const gm7 = new GameManager({ seed: 17, mode: 'career', data: {} });
    gm7.eventDirector.enabled = true;
    const s7 = new GameSession({ gm: gm7, road, autoRequests: false });
    const punctureRng = (s7 as unknown as { punctureRng: Rng }).punctureRng;
    const chanceSpy = vi.spyOn(punctureRng, 'chance').mockReturnValue(true);
    const fired7: string[] = [];
    gm7.bus.on('encounter/started', ({ instance }) => fired7.push(instance.encounterId));
    s7.bike.x = 50;
    s7.bike.z = 0;
    s7.bike.speed = 10;
    advanceOneGameMinute(s7);
    expect(fired7).toContain('enc_puncture');
    chanceSpy.mockRestore();
  });

  it('resets lastAccidentEncounterMin on day/started while keeping lastPunctureMin monotonic', () => {
    const s = makeSession({ seed: 11, autoRequests: false });
    s.spawnAtHome();
    s.gm.eventDirector.enabled = true;
    s.gm.economyManager.fuelLevel = s.gm.economyManager.maxFuelL();

    const started: string[] = [];
    s.gm.bus.on('encounter/started', ({ instance }) => started.push(instance.encounterId));

    // Day 1 late evening accident at 22:30 (1350 min)
    s.gm.clock.day = 1;
    s.gm.clock.minutes = 22 * 60 + 30;
    s.gm.bus.emit('bike/collision', { severity: 'crash', relSpeedKmh: 35, otherKind: 'traffic' });
    expect(started).toEqual(['enc_accident_aftermath']);

    // Resolve accident encounter
    s.gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: s.gm.eventDirector.activeEncounter!.id,
      choiceId: 'apologize_and_continue',
    });

    // End shift and sleep -> Day 2 at 07:00 (420 min < 1350 + 60 if not reset!)
    expect(s.gm.dispatch({ type: 'endShift' }).success).toBe(true);
    expect(s.gm.dispatch({ type: 'sleep' }).success).toBe(true);
    expect(s.gm.clock.day).toBe(2);
    expect(s.gm.clock.minutes).toBe(7 * 60);

    // Accident on Day 2 morning must NOT be suppressed by Day 1's 22:30 lastAccidentEncounterMin
    s.gm.bus.emit('bike/collision', { severity: 'crash', relSpeedKmh: 35, otherKind: 'traffic' });
    expect(started).toEqual(['enc_accident_aftermath', 'enc_accident_aftermath']);

    // Verify lastPunctureMin stays monotonic across midnight (e.g. 23:30 Day 1 -> 00:30 Day 2 is 60 min < 180 min)
    s.gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: s.gm.eventDirector.activeEncounter!.id,
      choiceId: 'apologize_and_continue',
    });
    const punctureRng = (s as unknown as { punctureRng: Rng }).punctureRng;
    const chanceSpy = vi.spyOn(punctureRng, 'chance').mockReturnValue(true);
    let punctures = 0;
    s.gm.bus.on('bike/puncture', () => punctures++);

    s.gm.clock.day = 2;
    s.gm.clock.minutes = 23 * 60 + 30;
    s.bike.speed = 15;
    s.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    expect(punctures).toBe(1);

    // Advance clock directly across midnight without day/started (60 min later -> still < 180 min monotonic)
    s.gm.clock.day = 3;
    s.gm.clock.minutes = 30;
    s.bike.speed = 15;
    s.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    expect(punctures).toBe(1);

    chanceSpy.mockRestore();
  });
});
