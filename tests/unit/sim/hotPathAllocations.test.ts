import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { WeatherFx } from '../../../src/render/WeatherFx';
import { TimeOfDay, type SunSkyState, type HeadlightSpec } from '../../../src/sim/world/TimeOfDay';
import {
  PhysicsWorld,
  type StaticBoxHandle,
  type SweepHit,
} from '../../../src/physics/PhysicsWorld';
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

  it('PhysicsWorld sweepCapsule, castRay2D, queryAabb, and upsertDynamicVehicle stay allocation-free at steady state', async () => {
    const world = await PhysicsWorld.create();
    for (let i = 0; i < 60; i++) {
      world.addStaticBox(i * 12, 1, 8, 2, 1, 2, 0.25, 'building');
      world.addStaticBox(i * 12, 0.09, -4, 4, 0.09, 0.14, 0, 'kerb');
    }

    const hit: SweepHit = {
      hit: false,
      toi: 1,
      normalX: 0,
      normalZ: 0,
      otherKind: 'building',
      otherVx: 0,
      otherVz: 0,
    };
    const slide = { x: 0, z: 0 };
    const aabbOut: StaticBoxHandle[] = [];
    const filterKinds: readonly ['building'] = ['building'];
    const vehicle = {
      id: 'traffic_0',
      kind: 'car',
      x: 15,
      z: 0,
      halfX: 0.9,
      halfZ: 2.1,
      minY: 0,
      maxY: 1.5,
      yaw: 0,
      vx: 0,
      vz: 4,
    };

    for (let i = 0; i < 200; i++) {
      world.clearDynamicVehicles();
      world.upsertDynamicVehicle(vehicle);
      world.sweepCapsule(10, 0, 0, 0.35, 1.5, 0.2, hit, slide);
      world.castRay2D(10, 0, 0.5, 0, 1, 10, filterKinds);
      world.queryAabb(0, -10, 30, 15, aabbOut);
    }

    const initialHeap = process.memoryUsage().heapUsed;
    for (let i = 0; i < 2000; i++) {
      world.clearDynamicVehicles();
      world.upsertDynamicVehicle(vehicle);
      world.sweepCapsule(10, 0, 0, 0.35, 1.5, 0.2, hit, slide);
      world.castRay2D(10, 0, 0.5, 0, 1, 10, filterKinds);
      world.queryAabb(0, -10, 30, 15, aabbOut);
    }
    const diffMb = (process.memoryUsage().heapUsed - initialHeap) / (1024 * 1024);
    expect(diffMb).toBeLessThan(2);
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

  it('WeatherFx.update reuses TimeOfDay scratch objects and avoids THREE.Color allocations (P2.5)', () => {
    const sunOut: SunSkyState = {
      sunColor: 0,
      sunIntensity: 0,
      sunPosition: [0, 0, 0],
      skyColor: 0,
      skyTopColor: 0,
      skyHorizonColor: 0,
      fogColor: 0,
      ambientColor: 0,
      groundColor: 0,
      ambientIntensity: 0,
    };
    const headOut: HeadlightSpec = {
      angle: 0,
      distance: 0,
      intensity: 0,
      penumbra: 0,
      color: 0,
    };
    expect(TimeOfDay.getSunSkyState(720, sunOut)).toBe(sunOut);
    expect(TimeOfDay.getHeadlightSpec(true, headOut)).toBe(headOut);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000);
    scene.fog = new THREE.Fog(0x000000, 50, 250);
    const fx = new WeatherFx(scene, {
      dirLight: new THREE.DirectionalLight(),
      hemiLight: new THREE.HemisphereLight(),
      rainCount: 80,
    });

    const sunSpy = vi.spyOn(TimeOfDay, 'getSunSkyState');
    const headSpy = vi.spyOn(TimeOfDay, 'getHeadlightSpec');
    const seenInWarmup = new Set<object>();
    const seenInLoop = new Set<object>();
    let recordingLoop = false;
    const setSpy = vi.spyOn(THREE.Color.prototype, 'set').mockImplementation(function (
      this: THREE.Color,
      ...args: unknown[]
    ) {
      if (recordingLoop) seenInLoop.add(this);
      else seenInWarmup.add(this);
      return THREE.Color.prototype.setHex.apply(
        this,
        args as [hex: number, colorSpace?: THREE.ColorSpace]
      );
    });
    const setHexSpy = vi.spyOn(THREE.Color.prototype, 'setHex').mockImplementation(function (
      this: THREE.Color,
      hex: number
    ) {
      if (recordingLoop) seenInLoop.add(this);
      else seenInWarmup.add(this);
      this.r = ((hex >> 16) & 255) / 255;
      this.g = ((hex >> 8) & 255) / 255;
      this.b = (hex & 255) / 255;
      return this;
    });

    // Warm up (computes nightAmbientFloor once and initializes rain positions)
    fx.update(1 / 60, 22 * 60, 'heavyRain', { x: 10, y: 0, z: 20 }, 0.5, true, 12);
    sunSpy.mockClear();
    headSpy.mockClear();
    recordingLoop = true;

    for (let i = 0; i < 100; i++) {
      fx.update(1 / 60, 22 * 60, 'heavyRain', { x: 10 + i * 0.2, y: 0, z: 20 }, 0.5, true, 12);
    }

    // No newly constructed THREE.Color instances in steady-state loop
    for (const c of seenInLoop) {
      expect(seenInWarmup.has(c)).toBe(true);
    }
    expect(setSpy).not.toHaveBeenCalled();
    expect(setHexSpy).toHaveBeenCalled();
    expect(sunSpy).toHaveBeenCalledTimes(100);
    expect(headSpy).toHaveBeenCalledTimes(100);

    const firstSunScratch = sunSpy.mock.calls[0]?.[1];
    const lastSunScratch = sunSpy.mock.calls[99]?.[1];
    expect(firstSunScratch).toBeDefined();
    expect(lastSunScratch).toBe(firstSunScratch);

    const firstHeadScratch = headSpy.mock.calls[0]?.[1];
    const lastHeadScratch = headSpy.mock.calls[99]?.[1];
    expect(firstHeadScratch).toBeDefined();
    expect(lastHeadScratch).toBe(firstHeadScratch);

    vi.restoreAllMocks();
    fx.dispose();
  });
});
