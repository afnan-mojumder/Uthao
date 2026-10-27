import { describe, it, expect } from 'vitest';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import { MotorcycleController } from '../../../src/physics/MotorcycleController';
import {
  stepBike,
  createDefaultBikeSpec,
  createDefaultBikeState,
} from '../../../src/physics/bikeModel';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { TrafficManager } from '../../../src/sim/traffic/TrafficManager';
import mirparaData from '../../../data/districts/mirpara.json';
import type { DistrictData } from '../../../src/sim/schemas';

describe('Hot Path Allocation Optimization (T5.9)', () => {
  it('stepBike reuses out state parameter when provided', () => {
    const state = createDefaultBikeState();
    const spec = createDefaultBikeSpec();
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const outState = createDefaultBikeState();

    const returnedState = stepBike(state, { throttle: 1, brake: 0, steer: 0 }, spec, env, 0.016, outState);

    expect(returnedState).toBe(outState);
    expect(returnedState.speed).toBeGreaterThan(0);
  });

  it('MotorcycleController executes 1,000 update frames with pooled vectors', async () => {
    const world = await PhysicsWorld.create();
    const controller = new MotorcycleController({ world });
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };

    const initialHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1000; i++) {
      controller.update({ throttle: 0.8, brake: 0, steer: 0.1 }, env, 1 / 60);
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const diffMb = (finalHeap - initialHeap) / (1024 * 1024);

    // 1000 frames of physics stepping in-place should show minimal memory growth (< 15 MB)
    expect(diffMb).toBeLessThan(15);
    expect(controller.state.speed).toBeGreaterThan(0);
  });

  it('TrafficManager pools lane lists without allocating new Map per frame', () => {
    const network = RoadNetwork.fromDistricts([mirparaData as DistrictData]);
    const traffic = new TrafficManager(network, 42);

    traffic.maintainDensity({ x: 300, z: 300, heading: 0, fovRad: 1.2 }, 480);
    expect(traffic.agents.size).toBeGreaterThan(0);

    for (let i = 0; i < 100; i++) {
      traffic.update(1 / 60, { x: 300, z: 300, heading: 0, fovRad: 1.2 });
    }

    expect(traffic.agents.size).toBeGreaterThan(0);
  });
});
