import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { SIM_DT } from '../../../src/config/constants';
import { TIME_SCALE } from '../../../src/core/clock';
import type { DistrictData } from '../../../src/sim/schemas';
import type { BikeInput } from '../../../src/physics/bikeModel';
import testloopData from '../../../data/districts/testloop.json';

const NEUTRAL_INPUT: BikeInput = { throttle: 0, brake: 0, steer: 0 };
const MINUTES_PER_STEP = (SIM_DT * TIME_SCALE) / 60;

function makeSession(opts: { seed: number; autoRequests?: boolean }): GameSession {
  const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const gm = new GameManager({ seed: opts.seed, mode: 'career', data: {} });
  return new GameSession({ gm, road, autoRequests: opts.autoRequests });
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
