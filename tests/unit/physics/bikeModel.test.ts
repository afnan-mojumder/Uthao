import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  stepBike,
  type BikeSpec,
  createBikeSpec,
  createDefaultBikeSpec,
  createDefaultBikeState,
} from '../../../src/physics/bikeModel';
import { WeatherSystem } from '../../../src/sim/world/WeatherSystem';
import type { BikeId, RoadSegment } from '../../../src/core/types';

describe('bikeModel (pure math)', () => {
  const dt = 1 / 60;

  it('reaches 11 m/s in 4±0.3 s from rest', () => {
    const spec = createDefaultBikeSpec();
    let state = createDefaultBikeState();
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 1.0, brake: 0, steer: 0 };

    let time = 0;
    while (state.speed < 11 && time < 10) {
      state = stepBike(state, input, spec, env, dt);
      time += dt;
    }

    expect(time).toBeGreaterThanOrEqual(3.7);
    expect(time).toBeLessThanOrEqual(4.3);
  });

  it('every bike stops 30-40% further on wet roads than dry (PLAYTEST band)', () => {
    const stopDistance = (bikeId: BikeId, wet: boolean): number => {
      const spec = createBikeSpec(bikeId);
      let state = { ...createDefaultBikeState(), speed: 11 };
      const env = { wet, surface: 1.0, hasPassenger: false, conditionPct: 100 };
      const input = { throttle: 0, brake: 1.0, steer: 0 };
      const startZ = state.z;
      while (state.speed > 0.001) state = stepBike(state, input, spec, env, dt);
      return Math.abs(state.z - startZ);
    };

    for (const bikeId of ['old100', 'used125', 'new150'] as const) {
      const ratio = stopDistance(bikeId, true) / stopDistance(bikeId, false);
      expect(ratio, bikeId).toBeGreaterThanOrEqual(1.3);
      expect(ratio, bikeId).toBeLessThanOrEqual(1.4);
    }
  });

  it('releasing the throttle slows the bike at ~2.0 m/s², with no brake', () => {
    const spec = createDefaultBikeSpec();
    let state = { ...createDefaultBikeState(), speed: 11 };
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const coast = { throttle: 0, brake: 0, steer: 0 };

    for (let i = 0; i < 60; i++) state = stepBike(state, coast, spec, env, dt);

    // COAST_DECEL = 2.0 m/s²: from 11 m/s to ~9.0 m/s after one second.
    expect(state.speed).toBeLessThan(9.3);
    expect(state.speed).toBeGreaterThan(8.7);
  });

  it('a full-lock turn at 40 km/h keeps most of its speed after one second (audit H-3)', () => {
    // Arrange: cruising at 40 km/h (11.1 m/s), dry, rider holds full lock.
    const spec = createDefaultBikeSpec();
    let state = { ...createDefaultBikeState(), speed: 40 / 3.6 };
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 0.5, brake: 0, steer: 1 };

    // Act
    for (let i = 0; i < 60; i++) state = stepBike(state, input, spec, env, dt);

    // Assert: the audit saw 40 km/h fall to about 19 km/h. Require at least 30 km/h.
    expect(state.speed * 3.6).toBeGreaterThanOrEqual(30);
  });

  it('never exceeds vmax', () => {
    const spec = createDefaultBikeSpec();
    let state = createDefaultBikeState();
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 1.0, brake: 0, steer: 0 };

    for (let t = 0; t < 20 / dt; t++) {
      state = stepBike(state, input, spec, env, dt);
    }

    expect(state.speed).toBeLessThanOrEqual(spec.vmax);
    expect(state.speed).toBeCloseTo(spec.vmax, 1);
  });

  it('dry stopping distance from 11 m/s ≈ 10.1 m ±10%', () => {
    const spec = createDefaultBikeSpec();
    let state = { ...createDefaultBikeState(), speed: 11 };
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 0, brake: 1.0, steer: 0 };

    const startZ = state.z;
    while (state.speed > 0.001) {
      state = stepBike(state, input, spec, env, dt);
    }
    const distance = Math.abs(state.z - startZ);

    expect(distance).toBeGreaterThanOrEqual(10.1 * 0.9);
    expect(distance).toBeLessThanOrEqual(10.1 * 1.1);
  });

  it('wet stopping distance longer than dry, brake upgrade shortens by ~20%', () => {
    const baseSpec = createDefaultBikeSpec();
    const upgradeSpec: BikeSpec = { ...baseSpec, brakeUpgrade: true };

    const runBraking = (spec: BikeSpec, wet: boolean): number => {
      let state = { ...createDefaultBikeState(), speed: 11 };
      const env = { wet, surface: 1.0, hasPassenger: false, conditionPct: 100 };
      const input = { throttle: 0, brake: 1.0, steer: 0 };
      const startZ = state.z;
      while (state.speed > 0.001) {
        state = stepBike(state, input, spec, env, dt);
      }
      return Math.abs(state.z - startZ);
    };

    const dryDist = runBraking(baseSpec, false);
    const wetDist = runBraking(baseSpec, true);
    const wetUpgradedDist = runBraking(upgradeSpec, true);

    expect(wetDist).toBeGreaterThan(dryDist);
    // Upgraded wet distance should be roughly 20% shorter than standard wet distance (ratio ~ 0.80 ±0.03)
    const ratio = wetUpgradedDist / wetDist;
    expect(ratio).toBeCloseTo(0.8, 1);
  });

  it('steer angle smaller at high speed', () => {
    const spec = createDefaultBikeSpec();
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };

    const stateLow = { ...createDefaultBikeState(), speed: 1 };
    const stateHigh = { ...createDefaultBikeState(), speed: 20 };

    const nextLow = stepBike(stateLow, { throttle: 0, brake: 0, steer: 1.0 }, spec, env, dt);
    const nextHigh = stepBike(stateHigh, { throttle: 0, brake: 0, steer: 1.0 }, spec, env, dt);

    expect(Math.abs(nextHigh.steer)).toBeLessThan(Math.abs(nextLow.steer));
  });

  it('condition < 40 reduces accel', () => {
    const spec = createDefaultBikeSpec();
    const input = { throttle: 1.0, brake: 0, steer: 0 };

    let stateGood = createDefaultBikeState();
    let stateWorn = createDefaultBikeState();

    const envGood = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const envWorn = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 30 };

    for (let i = 0; i < 60; i++) {
      stateGood = stepBike(stateGood, input, spec, envGood, dt);
      stateWorn = stepBike(stateWorn, input, spec, envWorn, dt);
    }

    expect(stateWorn.speed).toBeLessThan(stateGood.speed);
  });

  it('passenger reduces accel 10%', () => {
    const spec = createDefaultBikeSpec();
    const input = { throttle: 1.0, brake: 0, steer: 0 };

    let stateSolo = createDefaultBikeState();
    let statePass = createDefaultBikeState();

    const envSolo = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const envPass = { wet: false, surface: 1.0, hasPassenger: true, conditionPct: 100 };

    for (let i = 0; i < 60; i++) {
      stateSolo = stepBike(stateSolo, input, spec, envSolo, dt);
      statePass = stepBike(statePass, input, spec, envPass, dt);
    }

    expect(statePass.speed / stateSolo.speed).toBeCloseTo(0.9, 2);
  });

  it('steer = -1 turns screen-left and steer = +1 turns screen-right in Three.js chase camera', () => {
    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
    cam.position.set(0, 3, -5);
    cam.lookAt(0, 1, 2);
    cam.updateMatrixWorld();

    const spec = createDefaultBikeSpec();
    const dryEnv = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };

    let leftState = createDefaultBikeState();
    leftState.speed = 10;
    for (let i = 0; i < 30; i++) {
      leftState = stepBike(leftState, { throttle: 0.5, brake: 0, steer: -1 }, spec, dryEnv, 1 / 60);
    }
    const ndcLeft = new THREE.Vector3(leftState.x, 0, leftState.z).project(cam);
    expect(ndcLeft.x).toBeLessThan(-0.05);
    expect(leftState.lean).toBeLessThan(0);

    let rightState = createDefaultBikeState();
    rightState.speed = 10;
    for (let i = 0; i < 30; i++) {
      rightState = stepBike(rightState, { throttle: 0.5, brake: 0, steer: 1 }, spec, dryEnv, 1 / 60);
    }
    const ndcRight = new THREE.Vector3(rightState.x, 0, rightState.z).project(cam);
    expect(ndcRight.x).toBeGreaterThan(0.05);
    expect(rightState.lean).toBeGreaterThan(0);
  });

  it('gear shifts 1 -> 5 cleanly across acceleration, updates rpmNorm, and preserves y', () => {
    const spec = createDefaultBikeSpec();
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 1.0, brake: 0, steer: 0 };

    let state = createDefaultBikeState();
    expect(state.gear).toBe(1);
    expect(state.rpmNorm).toBeCloseTo(0.15, 5);
    expect(state.y).toBe(0);

    state = { ...state, y: 4.5 };
    const gearsSeen: number[] = [state.gear];
    let upshiftRpmDropObserved = false;

    for (let i = 0; i < 15 / dt; i++) {
      const prevGear = state.gear;
      const prevRpm = state.rpmNorm;
      state = stepBike(state, input, spec, env, dt);
      expect(state.y).toBe(4.5);
      expect(state.rpmNorm).toBeGreaterThanOrEqual(0.15);
      expect(state.rpmNorm).toBeLessThanOrEqual(1.0);
      if (state.gear !== prevGear) {
        expect(state.gear).toBeGreaterThan(prevGear);
        gearsSeen.push(state.gear);
        if (state.rpmNorm < prevRpm) upshiftRpmDropObserved = true;
      }
    }

    expect(gearsSeen).toEqual([1, 2, 3, 4, 5]);
    expect(upshiftRpmDropObserved).toBe(true);
  });

  it('speed-dependent torque curve pulls stronger at low speed than near vmax', () => {
    const spec = createDefaultBikeSpec();
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 1.0, brake: 0, steer: 0 };

    const lowStart = { ...createDefaultBikeState(), speed: 1.0 };
    const lowEnd = stepBike(lowStart, input, spec, env, dt);
    const lowAccel = (lowEnd.speed - lowStart.speed) / dt;

    const highStart = { ...createDefaultBikeState(), speed: spec.vmax * 0.9 };
    const highEnd = stepBike(highStart, input, spec, env, dt);
    const highAccel = (highEnd.speed - highStart.speed) / dt;

    expect(lowAccel).toBeGreaterThan(highAccel * 1.5);
  });

  it('ignores brake noise < 0.05 so slight trigger drift does not kill throttle', () => {
    const spec = createDefaultBikeSpec();
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };

    let noisyState = createDefaultBikeState();
    for (let i = 0; i < 60; i++) {
      noisyState = stepBike(noisyState, { throttle: 1.0, brake: 0.04, steer: 0 }, spec, env, dt);
    }
    expect(noisyState.speed).toBeGreaterThan(2.5);

    let brakedState = { ...createDefaultBikeState(), speed: 5.0 };
    brakedState = stepBike(brakedState, { throttle: 1.0, brake: 0.2, steer: 0 }, spec, env, dt);
    expect(brakedState.speed).toBeLessThan(5.0);
  });

  it('floodSpeedCapMs caps acceleration and bleeds down higher entry speed', () => {
    const spec = createDefaultBikeSpec();
    const floodCap = 10 / 3.6;
    const env = {
      wet: true,
      surface: 0.5,
      hasPassenger: false,
      conditionPct: 100,
      floodSpeedCapMs: floodCap,
    };

    let fromRest = createDefaultBikeState();
    for (let i = 0; i < 300; i++) {
      fromRest = stepBike(fromRest, { throttle: 1.0, brake: 0, steer: 0 }, spec, env, dt);
    }
    expect(fromRest.speed).toBeLessThanOrEqual(floodCap + 1e-6);
    expect(fromRest.speed).toBeCloseTo(floodCap, 2);

    let fromFast = { ...createDefaultBikeState(), speed: 15 };
    for (let i = 0; i < 240; i++) {
      fromFast = stepBike(fromFast, { throttle: 1.0, brake: 0, steer: 0 }, spec, env, dt);
    }
    expect(fromFast.speed).toBeCloseTo(floodCap, 2);
  });

  it('WeatherSystem wet surface avoids double-penalizing wetLateralGrip while flooding caps speed', () => {
    const ws = new WeatherSystem({ initialWeather: 'heavyRain' });
    const drySeg: RoadSegment = {
      segmentId: 'S_WET',
      startNodeId: 'N1',
      endNodeId: 'N2',
      width: 10,
      surfaceCondition: 1.0,
      trafficDensity: 0.2,
      speedLimit: 40,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.1,
      riskLevel: 0.1,
      oneWay: false,
      divided: false,
      lanes: 2,
      roadType: 'main',
      floodSensitivity: 0.9,
      pickupPractical: true,
      district: 'testloop',
      tags: [],
    };

    const wetEnv = ws.getBikeEnvironment(drySeg);
    expect(wetEnv.wet).toBe(true);
    expect(wetEnv.surface).toBe(1.0);

    ws.update(30, [drySeg]);
    const floodedEnv = ws.getBikeEnvironment(drySeg);
    expect(floodedEnv.surface).toBeCloseTo(0.5, 5);
    expect(floodedEnv.floodSpeedCapMs).toBeCloseTo(10 / 3.6, 5);
  });
});
