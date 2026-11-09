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
});
