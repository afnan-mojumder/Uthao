import { describe, it, expect, vi } from 'vitest';
import { SaveSlots } from '../../../src/ui/menus/SaveSlots';
import { SaveSystem, MemoryStorageAdapter } from '../../../src/sim/save/SaveSystem';
import { GameManager } from '../../../src/sim/GameManager';

describe('SaveSlots Component (T4.9)', () => {
  it('returns null when closed', () => {
    const memory = new MemoryStorageAdapter();
    const system = new SaveSystem(memory);
    const vnode = SaveSlots({
      isOpen: false,
      mode: 'save',
      onClose: vi.fn(),
      onSelectSlot: vi.fn(),
      saveSystem: system,
    });

    expect(vnode).toBeNull();
  });

  it('renders SaveSlots vnode when open in save mode', () => {
    const memory = new MemoryStorageAdapter();
    const system = new SaveSystem(memory);

    const vnode = SaveSlots({
      isOpen: true,
      mode: 'save',
      onClose: vi.fn(),
      onSelectSlot: vi.fn(),
      saveSystem: system,
    });

    expect(vnode).not.toBeNull();
    expect(vnode?.props['data-testid']).toBe('save-slots-modal');
  });

  it('renders SaveSlots vnode in load mode with saved game', () => {
    const memory = new MemoryStorageAdapter();
    const system = new SaveSystem(memory);
    const gm = new GameManager({ seed: 101, mode: 'career', data: {} });
    gm.clock.day = 4;
    system.save(gm, 'slot1');

    const vnode = SaveSlots({
      isOpen: true,
      mode: 'load',
      onClose: vi.fn(),
      onSelectSlot: vi.fn(),
      saveSystem: system,
    });

    expect(vnode).not.toBeNull();
    expect(vnode?.props['data-testid']).toBe('save-slots-modal');
  });
});
