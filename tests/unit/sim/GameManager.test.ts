import { describe, it, expect } from 'vitest';
import { GameManager, runFrame } from '../../../src/sim/GameManager';
import { SIM_DT } from '../../../src/config/constants';
import type { Command } from '../../../src/core/commands';

describe('GameManager', () => {
  it('same seed + same command log ⇒ identical snapshot after 10k ticks', () => {
    const seed = 987654;
    const gm1 = new GameManager({ seed, mode: 'career', data: {} });
    const gm2 = new GameManager({ seed, mode: 'career', data: {} });

    const commandSchedule: { tick: number; cmd: Command }[] = [
      { tick: 100, cmd: { type: 'pause' } },
      { tick: 200, cmd: { type: 'resume' } },
      { tick: 500, cmd: { type: 'buyFuel', liters: 2 } },
      { tick: 1000, cmd: { type: 'setWaypoint', nodeId: 'node_test_1' } },
      { tick: 2500, cmd: { type: 'pause' } },
      { tick: 2600, cmd: { type: 'resume' } },
    ];

    for (let t = 0; t < 10000; t++) {
      for (const scheduled of commandSchedule) {
        if (scheduled.tick === t) {
          gm1.dispatch(scheduled.cmd);
          gm2.dispatch(scheduled.cmd);
        }
      }
      gm1.tick(SIM_DT);
      gm2.tick(SIM_DT);
    }

    const snap1 = gm1.snapshot();
    const snap2 = gm2.snapshot();

    expect(snap1).toEqual(snap2);
  });

  it('runFrame never runs >5 steps', () => {
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    // Provide a huge realDt (e.g. 2.0s, which clamps to 0.25s = 15 steps if unconstrained)
    const steps = runFrame(gm, 2.0);
    expect(steps).toBeLessThanOrEqual(5);
    expect(steps).toBe(5);
  });

  it('paused gm does not advance clock', () => {
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    const initialMinutes = gm.clock.minutes;

    gm.dispatch({ type: 'pause' });
    expect(gm.paused).toBe(true);

    for (let i = 0; i < 60; i++) {
      gm.tick(SIM_DT);
    }
    expect(gm.clock.minutes).toBe(initialMinutes);

    gm.dispatch({ type: 'resume' });
    expect(gm.paused).toBe(false);

    gm.tick(SIM_DT);
    expect(gm.clock.minutes).toBeGreaterThan(initialMinutes);
  });
});
