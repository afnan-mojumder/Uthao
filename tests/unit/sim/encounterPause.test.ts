import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { SIM_DT } from '../../../src/config/constants';

// Runs the sim at a fixed bike speed until an ambient encounter starts.
function runUntilEncounter(gm: GameManager, speedKmh: number, maxTicks: number): boolean {
  let started = false;
  gm.bus.on('encounter/started', () => {
    started = true;
  });
  for (let i = 0; i < maxTicks && !started; i++) {
    gm.tick(SIM_DT, speedKmh);
  }
  return started;
}

describe('ambient encounters and the driving keys (bug: keys froze after the tutorial)', () => {
  it('a moving bike is never frozen by an ambient encounter card', () => {
    // Arrange
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    gm.eventDirector.enabled = true;

    // Act: ride at 30 km/h for long enough that several ambient encounters would have fired
    const started = runUntilEncounter(gm, 30, 20000);

    // Assert: no card while moving, and the sim is never paused by one
    expect(started).toBe(false);
    expect(gm.paused).toBe(false);
  });

  it('a stopped bike can get a card, and the sim keeps running behind it', () => {
    // Arrange
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    gm.eventDirector.enabled = true;

    // Act
    const started = runUntilEncounter(gm, 0, 200000);
    const ticksAtCard = gm.ticks;
    for (let i = 0; i < 60; i++) gm.tick(SIM_DT, 0);

    // Assert: a card appeared, the game did not pause, and time kept moving
    expect(started).toBe(true);
    expect(gm.paused).toBe(false);
    expect(gm.ticks).toBeGreaterThan(ticksAtCard);
  });
});
