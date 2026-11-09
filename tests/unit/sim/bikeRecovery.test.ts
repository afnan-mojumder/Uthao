import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { SIM_DT } from '../../../src/config/constants';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

function makeSession(): GameSession {
  const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const gm = new GameManager({ seed: 5, mode: 'career', data: {} });
  const s = new GameSession({ gm, road, autoRequests: false });
  s.spawnAtHome();
  return s;
}

/** True when the bike's position lies within 1 m of a road segment. */
function onRoad(s: GameSession): boolean {
  return s.road.segmentAt(s.bike.x, s.bike.z, 1) !== null;
}

/** Moves the bike to the first 12 m offset from the road that really is off it. */
function pushOffRoad(s: GameSession): void {
  const x0 = s.bike.x;
  const z0 = s.bike.z;
  for (const [dx, dz] of [[12, 0], [-12, 0], [0, 12], [0, -12]] as const) {
    s.bike.x = x0 + dx;
    s.bike.z = z0 + dz;
    if (!onRoad(s)) return;
  }
  throw new Error('no off-road spot near home');
}

describe('bike recovery (audit H-5, H-8)', () => {
  it('recoverBike puts a bike that is off the road back on the nearest road, stopped', () => {
    // Arrange: the bike is pushed 4 m off the road, moving.
    const s = makeSession();
    pushOffRoad(s);
    s.bike.speed = 5;
    expect(onRoad(s)).toBe(false);

    // Act
    s.recoverBike();

    // Assert
    expect(onRoad(s)).toBe(true);
    expect(s.bike.speed).toBe(0);
  });

  it('a bike wedged with the throttle held is recovered automatically after about two seconds', () => {
    // Arrange: off the road and wedged: speed held at zero while the rider holds throttle.
    const s = makeSession();
    pushOffRoad(s);
    const throttleOn = { throttle: 1, brake: 0, steer: 0 };

    // Act: 1.5 s wedged is not yet long enough.
    for (let i = 0; i < 90; i++) {
      s.bike.speed = 0;
      s.step(throttleOn, SIM_DT);
    }
    expect(onRoad(s)).toBe(false);

    // Act: another 1 s passes the two-second wait.
    for (let i = 0; i < 60; i++) {
      s.bike.speed = 0;
      s.step(throttleOn, SIM_DT);
    }

    // Assert
    expect(onRoad(s)).toBe(true);
  });
});
