import { describe, it, expect } from 'vitest';
import { SaveSystem, MemoryStorageAdapter } from '../../../src/sim/save/SaveSystem';
import { GameManager } from '../../../src/sim/GameManager';
import { SIM_DT } from '../../../src/config/constants';

function newGame(): GameManager {
  return new GameManager({ seed: 11, mode: 'career', data: {} as never });
}

/** The in-game load path (bindings.ts): load the slot, then apply it to the live game. */
function loadInto(live: GameManager, system: SaveSystem): void {
  const res = system.loadGame('auto');
  if (!res.success) throw new Error('load failed');
  live.applySnapshot(res.gm.snapshot(), res.save.rngState);
}

describe('day-end autosave (H-12)', () => {
  it('loading a day-end autosave and sleeping does not charge living expenses again', () => {
    // Arrange: the shift ends at 23:00 and the day-end autosave is written
    const gm = newGame();
    const system = new SaveSystem(new MemoryStorageAdapter());
    system.bindAutosave(gm);
    gm.clock.day = 2;
    gm.clock.minutes = 23 * 60;
    gm.dispatch({ type: 'endShift' });
    const cashAfterDayEnd = gm.economyManager.cash;

    // Act: a new session loads the autosave, time passes, and the player sleeps
    const live = newGame();
    loadInto(live, system);
    for (let i = 0; i < 60; i++) live.tick(SIM_DT, 0);
    live.dispatch({ type: 'sleep' });

    // Assert
    expect(live.economyManager.cash).toBe(cashAfterDayEnd);
    expect(live.clock.day).toBe(3);
  });

  it('a loaded day-end save can still delay the rent posted that day', () => {
    // Arrange: rent day, shift ended, autosaved
    const gm = newGame();
    const system = new SaveSystem(new MemoryStorageAdapter());
    system.bindAutosave(gm);
    gm.clock.day = 7;
    gm.clock.minutes = 13 * 60;
    gm.economyManager.cash = 10000;
    gm.dispatch({ type: 'endShift' });

    // Act
    const live = newGame();
    loadInto(live, system);
    const res = live.dispatch({ type: 'delayRent' });

    // Assert
    expect(res.success).toBe(true);
  });
});

describe('sleep', () => {
  it('refuses to sleep while the shift is still running', () => {
    // Arrange
    const gm = newGame();
    gm.clock.minutes = 13 * 60;
    const cash = gm.economyManager.cash;

    // Act
    const res = gm.dispatch({ type: 'sleep' });

    // Assert
    expect(res.success).toBe(false);
    expect(res.reason).toBe('End the shift before sleeping');
    expect(gm.clock.day).toBe(1);
    expect(gm.economyManager.cash).toBe(cash);
  });

  it('autosaves the new morning after sleeping', () => {
    // Arrange
    const gm = newGame();
    const system = new SaveSystem(new MemoryStorageAdapter());
    system.bindAutosave(gm);
    gm.clock.minutes = 13 * 60;
    gm.dispatch({ type: 'endShift' });

    // Act
    gm.dispatch({ type: 'sleep' });

    // Assert: the autosave is the new day, not last night
    const res = system.load('auto');
    expect(res.success && res.save.clock.day).toBe(2);
    expect(res.success && res.save.clock.minutes).toBe(7 * 60);
  });
});

describe('ratings history save (Low)', () => {
  it('a reloaded career keeps its trip ratings', () => {
    // Arrange
    const gm = newGame();
    gm.reputationSystem.recordTripRating(3);
    gm.reputationSystem.recordTripRating(4);
    const system = new SaveSystem(new MemoryStorageAdapter());
    system.save(gm, 'auto');

    // Act
    const live = newGame();
    loadInto(live, system);

    // Assert
    expect(live.reputationSystem.getRatingsHistory()).toEqual([3, 4]);
    expect(live.reputationSystem.getAppRating()).toBe(gm.reputationSystem.getAppRating());
  });
});
