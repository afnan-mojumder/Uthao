import { describe, it, expect } from 'vitest';
import { SaveSystem, MemoryStorageAdapter } from '../../../src/sim/save/SaveSystem';
import { GameManager } from '../../../src/sim/GameManager';

// A browser store that refuses every write, as on a full quota or in some private
// windows. It is not memory-only, like the real localStorage adapter.
class RefusingStorage extends MemoryStorageAdapter {
  isMemoryOnly = false;
  setItem(): void {
    throw new Error('QuotaExceededError');
  }
}

function newGame(): GameManager {
  return new GameManager({ seed: 9, mode: 'career', data: {} as never });
}

describe('save integrity', () => {
  it('a save the browser refuses is reported as failed, not as saved', () => {
    // Arrange
    const system = new SaveSystem(new RefusingStorage());

    // Act
    const result = system.save(newGame(), 'slot1');

    // Assert: the player is told the game is not on disk
    expect(result.success).toBe(false);
  });

  it('a hidden tab does not autosave over the career from the title screen', () => {
    // Arrange: the title screen, where the game is a blank state
    const storage = new MemoryStorageAdapter();
    const system = new SaveSystem(storage);
    const target = new EventTarget() as EventTarget & { visibilityState: string };
    target.visibilityState = 'hidden';
    system.bindAutosave(newGame(), target as never, () => false);

    // Act
    target.dispatchEvent(new Event('visibilitychange'));

    // Assert
    expect(storage.getItem('uthao.save.auto')).toBeNull();
  });

  it('a hidden tab autosaves once a career is under way', () => {
    // Arrange
    const storage = new MemoryStorageAdapter();
    const system = new SaveSystem(storage);
    const target = new EventTarget() as EventTarget & { visibilityState: string };
    target.visibilityState = 'hidden';
    system.bindAutosave(newGame(), target as never, () => true);

    // Act
    target.dispatchEvent(new Event('visibilitychange'));

    // Assert
    expect(storage.getItem('uthao.save.auto')).not.toBeNull();
  });
});
