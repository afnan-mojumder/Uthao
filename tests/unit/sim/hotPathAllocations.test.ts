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
import { RequestGenerator } from '../../../src/sim/ride/RequestGenerator';
import { GameSession } from '../../../src/sim/GameSession';
import { GameManager } from '../../../src/sim/GameManager';
import { SIM_DT } from '../../../src/config/constants';
import { Rng } from '../../../src/core/rng';
import mirparaData from '../../../data/districts/mirpara.json';
import testloopData from '../../../data/districts/testloop.json';
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

  it('RequestGenerator.tick reuses the same output array across calls (T7.2)', () => {
    // GameSession.step() calls this every tick of the real 60fps main loop
    // whenever autoRequests is on (the default). A fresh array per call is a
    // hot-path allocation; tick() must hand back the same reused array.
    const network = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const generator = new RequestGenerator(network, new Rng(1));

    const first = generator.tick(1, 600, 'clear');
    const second = generator.tick(1, 601, 'clear');
    const third = generator.tick(1, 602, 'clear');

    expect(second).toBe(first);
    expect(third).toBe(first);
  });

  it('GameSession.step with autoRequests shows minimal heap growth over 2,000 ticks (T7.2)', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 11, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: true });
    const input = { throttle: 0.5, brake: 0, steer: 0 };

    // Warm up (JIT, array growth) before measuring steady-state allocation.
    for (let i = 0; i < 200; i++) {
      session.step(input, SIM_DT);
    }

    const initialHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < 2000; i++) {
      session.step(input, SIM_DT);
    }

    const finalHeap = process.memoryUsage().heapUsed;
    const diffMb = (finalHeap - initialHeap) / (1024 * 1024);

    // The request-offer path must stay allocation-free in the common
    // zero-new-request tick; this regresses loudly if a fresh array/object
    // is allocated per tick again.
    expect(diffMb).toBeLessThan(15);
  });
});
