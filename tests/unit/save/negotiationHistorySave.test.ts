import { describe, it, expect } from 'vitest';
import { serialize, deserialize } from '../../../src/sim/save/SaveSystem';
import { GameManager } from '../../../src/sim/GameManager';

// Negotiation history drives how passengers haggle. It must survive a save and
// load, or the same career negotiates differently after a reload.
describe('negotiation history survives a save', () => {
  it('a reloaded career keeps the negotiation history it was saved with', () => {
    // Arrange: a career with some accepted fares behind it
    const gm = new GameManager({ seed: 4, mode: 'career', data: {} as never });
    gm.negotiationHistory = 7;

    // Act: save to storage and load it back (JSON, as the browser stores it)
    const stored = JSON.parse(JSON.stringify(serialize(gm, 'auto')));
    const loaded = deserialize(stored);

    // Assert
    expect(loaded.negotiationHistory).toBe(7);
  });

  it('loading a save closes any stale open negotiation modal via state/restored', async () => {
    const { bindEventBusToStore, negotiationSignal } = await import('../../../src/ui/store');
    const gm = new GameManager({ seed: 4, mode: 'career', data: {} as never });
    gm.negotiationHistory = 3;
    const saved = JSON.parse(JSON.stringify(serialize(gm, 'auto')));

    const live = new GameManager({ seed: 4, mode: 'career', data: {} as never });
    const unbind = bindEventBusToStore(live.bus);
    negotiationSignal.value = {
      active: true,
      session: { status: 'active' } as never,
      lastResult: null,
    };

    try {
      const loaded = deserialize(saved);
      live.applySnapshot(loaded.snapshot(), saved.rngState);
      expect(negotiationSignal.value.active).toBe(false);
      expect(live.negotiationHistory).toBe(3);
    } finally {
      unbind();
    }
  });
});
