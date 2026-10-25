import { describe, it, expect } from 'vitest';
import {
  stepBike,
  type BikeSpec,
  createDefaultBikeSpec,
  createDefaultBikeState,
} from '../../../src/physics/bikeModel';

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
});
