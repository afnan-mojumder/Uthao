import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { SaveSystem, MemoryStorageAdapter } from '../../../src/sim/save/SaveSystem';

describe('SaveSystem.latestSlot (Continue resumes the newest save)', () => {
  let gm: GameManager;
  let saveSystem: SaveSystem;

  beforeEach(() => {
    gm = new GameManager({ seed: 4242, mode: 'career', data: {} });
    saveSystem = new SaveSystem(new MemoryStorageAdapter());
  });

  it('returns null when no slot holds a save', () => {
    expect(saveSystem.hasAnySave()).toBe(false);
    expect(saveSystem.latestSlot()).toBeNull();
  });

  it('returns the slot written most recently, not the auto slot by default', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-11-09T10:00:00Z'));
      saveSystem.save(gm, 'auto');
      vi.setSystemTime(new Date('2026-11-09T11:00:00Z'));
      saveSystem.save(gm, 'slot2');
      expect(saveSystem.latestSlot()).toBe('slot2');
    } finally {
      vi.useRealTimers();
    }
  });

  it('quarantines version 99 and truncated version 1 slots and still resolves the newest valid slot', () => {
    const memory = saveSystem.storage as MemoryStorageAdapter;
    saveSystem.save(gm, 'slot1');
    memory.setItem(saveSystem.getSlotKey('slot2'), JSON.stringify({ version: 1, slot: 'slot2' }));
    memory.setItem(saveSystem.getSlotKey('slot3'), JSON.stringify({ version: 99, slot: 'slot3' }));

    expect(saveSystem.latestSlot()).toBe('slot1');
    expect(saveSystem.hasCorruptBackup('slot2')).toBe(true);
    expect(saveSystem.hasCorruptBackup('slot3')).toBe(true);
  });
});
