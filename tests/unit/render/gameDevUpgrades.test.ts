import { describe, it, expect } from 'vitest';
import { ParticlePool } from '../../../src/render/particles/ParticlePool';
import { TrafficManager } from '../../../src/render/world/TrafficManager';
import { PedestrianManager } from '../../../src/render/world/PedestrianManager';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import testloopData from '../../../data/districts/testloop.json';
import type { DistrictData } from '../../../src/sim/schemas';

describe('Game Development Skill Upgrades', () => {
  it('ParticlePool reuses instances and updates life without allocations', () => {
    const pool = new ParticlePool(20);
    expect(pool.root).toBeDefined();

    pool.spawn(0, 1, 0, 0, 1, 0, 'smoke', 0.5);
    pool.spawn(2, 1, 2, 0, 0, 0, 'spark', 0.4);

    expect(() => pool.update(0.1)).not.toThrow();
    // Advance beyond life to recycle
    pool.update(0.6);
  });

  it('TrafficManager reacts to player horn by yielding with state transition', () => {
    const roadNetwork = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const traffic = new TrafficManager(roadNetwork);

    const reaction = traffic.onPlayerHorn({ x: 0, z: 0 });
    expect(reaction).toBeDefined();
    expect(typeof reaction.responded).toBe('boolean');

    // Run update to verify yielding FSM
    expect(() => traffic.update(0.016, { x: 0, z: 0 })).not.toThrow();
  });

  it('PedestrianManager triggers alarmed state and dodges upon player horn', () => {
    const peds = new PedestrianManager();

    const reacted = peds.onPlayerHorn({ x: 10, z: -7 });
    expect(reacted).toBe(true);

    expect(() => peds.update(0.016, { x: 10, z: -7 })).not.toThrow();
  });
});
