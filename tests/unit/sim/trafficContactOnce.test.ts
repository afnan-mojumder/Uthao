import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import { SIM_DT } from '../../../src/config/constants';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

function makeSession(): GameSession {
  const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const gm = new GameManager({ seed: 3, mode: 'career', data: {} });
  return new GameSession({ gm, road, autoRequests: false });
}

async function makePhysicsSession(): Promise<GameSession> {
  const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const gm = new GameManager({ seed: 3, mode: 'career', data: {} });
  const physics = await PhysicsWorld.create();
  return new GameSession({ gm, road, physics, autoRequests: false });
}

describe('traffic contact is reported once per contact (audit: one hit counted as many crashes)', () => {
  it('a bike that stays inside a stopped vehicle reports one collision, not one per tick', () => {
    // Arrange: a stopped car sits on top of the bike.
    const s = makeSession();
    const events: string[] = [];
    s.gm.bus.on('bike/collision', () => events.push('hit'));
    s.traffic.agents.set('car_on_top', {
      id: 'car_on_top',
      kind: 'car',
      x: s.bike.x,
      z: s.bike.z,
      length: 4,
      width: 1.8,
      speed: 0,
    } as never);

    // Act: many ticks while still overlapping.
    for (let i = 0; i < 30; i++) s.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);

    // Assert
    expect(events).toHaveLength(1);
  });

  it('with PhysicsWorld: feeds nearby traffic OBBs, resolves head-on crash once without phase-through, and throttles near-misses', async () => {
    const s = await makePhysicsSession();
    s.bike.x = 0;
    s.bike.z = 0;
    s.bike.heading = 0;
    s.bike.speed = 40 / 3.6;

    const collisions: Array<{ severity: string; relSpeedKmh: number; otherKind?: string }> = [];
    s.gm.bus.on('bike/collision', (e) => collisions.push(e));

    // Oncoming bus directly ahead within 80m, on a non-existent lane so its pose stays controlled
    const bus = {
      id: 'oncoming_bus',
      kind: 'bus' as const,
      laneId: 'test_manual_lane',
      distAlongLane: 0,
      speed: 40 / 3.6,
      x: 0,
      z: 5.5,
      heading: Math.PI,
      length: 8.0,
      width: 2.4,
      desiredSpeed: 40 / 3.6,
      lod: 'near' as const,
    };
    s.traffic.agents.set(bus.id, bus);

    // Distant vehicle > 80m away must not block or collide at origin
    s.traffic.agents.set('far_car', {
      id: 'far_car',
      kind: 'car',
      laneId: 'test_manual_lane',
      distAlongLane: 0,
      speed: 0,
      x: 0,
      z: 100,
      heading: 0,
      length: 4.5,
      width: 1.8,
      desiredSpeed: 0,
      lod: 'far',
    });

    for (let i = 0; i < 20; i++) {
      bus.z -= bus.speed * SIM_DT;
      s.step({ throttle: 0.5, brake: 0, steer: 0 }, SIM_DT);
    }

    expect(collisions).toHaveLength(1);
    expect(collisions[0]!.severity).toBe('crash');
    expect(collisions[0]!.otherKind).toBe('traffic');
    expect(collisions[0]!.relSpeedKmh).toBeGreaterThanOrEqual(75);
    const overlapsBus =
      Math.abs(s.bike.x - bus.x) < bus.width / 2 + 0.34 &&
      Math.abs(s.bike.z - bus.z) < bus.length / 2 + 0.34;
    expect(overlapsBus).toBe(false);

    // Now test near-miss throttling against traffic
    const s2 = await makePhysicsSession();
    s2.bike.x = 0;
    s2.bike.z = 0;
    s2.bike.heading = 0;
    s2.bike.speed = 30 / 3.6;
    const nearMisses: number[] = [];
    s2.gm.bus.on('bike/nearMiss', (e) => nearMisses.push(e.distanceM));

    s2.traffic.agents.set('parked_side', {
      id: 'parked_side',
      kind: 'car',
      laneId: 'test_manual_lane',
      distAlongLane: 0,
      speed: 0,
      x: 1.65, // 1.65 - 0.9 halfX - 0.35 radius = 0.40m clearance
      z: 4,
      heading: 0,
      length: 16,
      width: 1.8,
      desiredSpeed: 0,
      lod: 'near',
    });

    for (let i = 0; i < 60; i++) {
      s2.step({ throttle: 0.8, brake: 0, steer: 0 }, SIM_DT);
    }
    expect(nearMisses.length).toBeGreaterThanOrEqual(1);
    expect(nearMisses.length).toBeLessThanOrEqual(2);
  });
});
