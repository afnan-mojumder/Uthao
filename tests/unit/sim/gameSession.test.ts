import { describe, it, expect, vi } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
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
