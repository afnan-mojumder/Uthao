import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { SIM_DT } from '../../../src/config/constants';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

function makeSession(): GameSession {
  const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const gm = new GameManager({ seed: 3, mode: 'career', data: {} });
  return new GameSession({ gm, road, autoRequests: false });
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
});
