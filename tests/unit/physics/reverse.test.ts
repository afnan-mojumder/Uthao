import { describe, it, expect } from 'vitest';
import { stepBike, createDefaultBikeSpec, createDefaultBikeState } from '../../../src/physics/bikeModel';

describe('reverse (audit H-8: a wedged bike could not reverse)', () => {
  const dt = 1 / 60;
  const spec = createDefaultBikeSpec();
  const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };

  it('stopped with the brake held, the bike backs up, below walking pace', () => {
    let state = createDefaultBikeState();
    for (let i = 0; i < 60; i++) state = stepBike(state, { throttle: 0, brake: 1, steer: 0 }, spec, env, dt);
    expect(state.speed).toBeLessThan(0);
    expect(state.speed).toBeGreaterThanOrEqual(-1.5);
    // Heading 0 is +z, so backing up moves the bike toward -z.
    expect(state.z).toBeLessThan(0);
  });

  it('releasing the brake coasts the bike back to a stop', () => {
    let state = { ...createDefaultBikeState(), speed: -1.2 };
    for (let i = 0; i < 300; i++) state = stepBike(state, { throttle: 0, brake: 0, steer: 0 }, spec, env, dt);
    expect(state.speed).toBe(0);
  });

  it('braking from speed stops the bike before any reverse starts', () => {
    let state = { ...createDefaultBikeState(), speed: 11 };
    for (let i = 0; i < 600 && state.speed > 0.6; i++) {
      state = stepBike(state, { throttle: 0, brake: 1, steer: 0 }, spec, env, dt);
      expect(state.speed).toBeGreaterThanOrEqual(0);
    }
    expect(state.speed).toBeLessThanOrEqual(0.6);
  });

  it('requires |speed| < 0.15 and brake held for 0.25s before reversing', () => {
    let state = createDefaultBikeState();
    // Holding brake for 0.20s (12 frames) does not enter reverse yet
    for (let i = 0; i < 12; i++) {
      state = stepBike(state, { throttle: 0, brake: 1, steer: 0 }, spec, env, dt);
    }
    expect(state.speed).toBe(0);
    expect(state.z).toBe(0);

    // Holding past 0.25s (18 more frames -> 0.50s total) engages reverse
    for (let i = 0; i < 18; i++) {
      state = stepBike(state, { throttle: 0, brake: 1, steer: 0 }, spec, env, dt);
    }
    expect(state.speed).toBeLessThan(0);
    expect(state.z).toBeLessThan(0);

    // Braking from 0.4 m/s stops to 0 and still waits 0.25s before reversing
    let rolling = { ...createDefaultBikeState(), speed: 0.4 };
    for (let i = 0; i < 15; i++) {
      rolling = stepBike(rolling, { throttle: 0, brake: 1, steer: 0 }, spec, env, dt);
      expect(rolling.speed).toBeGreaterThanOrEqual(0);
    }
  });

  it('decelerates smoothly when brake is released while reversing (no 1-frame snap to 0)', () => {
    let state = { ...createDefaultBikeState(), speed: -1.2 };
    state = stepBike(state, { throttle: 0, brake: 0, steer: 0 }, spec, env, dt);
    expect(state.speed).toBeLessThan(-1.0);
    expect(state.speed).toBeGreaterThan(-1.2);

    for (let i = 0; i < 120; i++) {
      state = stepBike(state, { throttle: 0, brake: 0, steer: 0 }, spec, env, dt);
    }
    expect(state.speed).toBe(0);
  });
});
