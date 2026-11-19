import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import { SIM_DT } from '../../../src/config/constants';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

function makeDividedDistrict(): DistrictData {
  return {
    districtId: 'mirpara',
    name: { en: 'Divided Test', bn: 'Divided Test' },
    nodes: [
      { nodeId: 'n_start', x: 0, z: 0, kind: 'junction', tags: [] },
      { nodeId: 'n_end', x: 200, z: 0, kind: 'junction', tags: [] },
    ],
    segments: [
      {
        segmentId: 'seg_divided',
        startNodeId: 'n_start',
        endNodeId: 'n_end',
        width: 12,
        surfaceCondition: 0.95,
        trafficDensity: 0.3,
        speedLimit: 50,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.2,
        riskLevel: 0.1,
        oneWay: false,
        divided: true,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'mirpara',
        tags: ['arterial'],
      },
    ],
    pois: [],
  };
}

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

  it('recoverBike on a divided arterial places the bike inside the nearest clear carriageway lane (never on a median collider) and does not re-wedge', async () => {
    const district = makeDividedDistrict();
    const road = RoadNetwork.fromDistricts([district]);
    const physics = await PhysicsWorld.create();
    // Add the raised median collider along centerline z = 0 (matching CityBuilder) and kerbs at +-7
    physics.addStaticBox(100, 0.11, 0, 0.45, 0.11, 100, Math.PI / 2, 'median');
    physics.addStaticBox(100, 0.09, -7.14, 0.14, 0.09, 100, Math.PI / 2, 'kerb');
    physics.addStaticBox(100, 0.09, 7.14, 0.14, 0.09, 100, Math.PI / 2, 'kerb');

    const gm = new GameManager({ seed: 7, mode: 'career', data: {} });
    const s = new GameSession({ gm, road, physics, autoRequests: false });

    // Place the bike near the negative-Z side of the median (z = -0.3) and recover
    s.bike.x = 50;
    s.bike.z = -0.3;
    s.recoverBike();

    // Must be offset cleanly off the median (median half-width 0.45m + bike radius 0.35m = 0.80m)
    // onto the nearest carriageway lane (z < -0.80 and z > -6.5)
    expect(Math.abs(s.bike.z)).toBeGreaterThan(1.0);
    expect(Math.abs(s.bike.z)).toBeLessThan(6.5);
    expect(s.bike.z).toBeLessThan(0);

    // Must not re-wedge when accelerating forward for 3 seconds
    for (let i = 0; i < 180; i++) {
      s.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    }
    expect(s.bike.speed).toBeGreaterThan(5);
    expect(s.bike.x).toBeGreaterThan(55);
    expect(s.bike.crashed).toBe(false);
    expect(Math.abs(s.bike.z)).toBeGreaterThan(1.0);
    expect(Math.abs(s.bike.z)).toBeLessThan(6.5);
  });

  it('emits bike/speedBump once per crossing over a speed_bump tagged segment', () => {
    const district = makeDividedDistrict();
    district.segments[0]!.divided = false;
    district.segments[0]!.tags = ['speed_bump'];
    const road = RoadNetwork.fromDistricts([district]);
    const gm = new GameManager({ seed: 11, mode: 'career', data: {} });
    const s = new GameSession({ gm, road, autoRequests: false });

    let bumps = 0;
    gm.bus.on('bike/speedBump', () => {
      bumps++;
    });

    // Place bike just before midpoint (100, 0) moving East along +X
    s.bike.x = 95;
    s.bike.z = 0;
    s.bike.heading = Math.PI / 2;
    s.bike.speed = 8;
    for (let i = 0; i < 120; i++) {
      s.step({ throttle: 0.6, brake: 0, steer: 0 }, SIM_DT);
    }
    expect(bumps).toBe(1);
  });

  it('supports manual { type: "recoverBike" } command via GameManager.dispatch', async () => {
    const district = makeDividedDistrict();
    const road = RoadNetwork.fromDistricts([district]);
    const physics = await PhysicsWorld.create();
    physics.addStaticBox(100, 0.11, 0, 0.45, 0.11, 100, Math.PI / 2, 'median');

    const gm = new GameManager({ seed: 9, mode: 'career', data: {} });
    const s = new GameSession({ gm, road, physics, autoRequests: false });

    // Move bike far off-road and crashed
    s.bike.x = 80;
    s.bike.z = 25;
    s.bike.crashed = true;
    s.bike.speed = 4;

    const res = gm.dispatch({ type: 'recoverBike' });
    expect(res.success).toBe(true);
    expect(s.bike.speed).toBe(0);
    expect(s.bike.crashed).toBe(false);
    expect(Math.abs(s.bike.z)).toBeGreaterThan(1.0);
    expect(Math.abs(s.bike.z)).toBeLessThan(6.5);
  });
});
