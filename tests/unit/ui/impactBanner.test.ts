import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { impactSignal, bindEventBusToStore } from '../../../src/ui/store';
import { EventBus } from '../../../src/core/events';
import type { GameEvents } from '../../../src/core/events';

describe('impact banner (audit H-4: wobble and crash must reach the rider)', () => {
  let bus: EventBus<GameEvents>;
  let unbind: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    bus = new EventBus<GameEvents>();
    unbind = bindEventBusToStore(bus);
    impactSignal.value = { kind: null, seq: 0 };
  });

  afterEach(() => {
    unbind();
    vi.useRealTimers();
  });

  it('a crash shows a crash banner', () => {
    bus.emit('bike/collision', { severity: 'crash', relSpeedKmh: 30, otherKind: 'static' });
    expect(impactSignal.value.kind).toBe('crash');
  });

  it('a wobble shows a wobble banner', () => {
    bus.emit('bike/wobble', {});
    expect(impactSignal.value.kind).toBe('wobble');
  });

  it('the banner clears itself after about a second', () => {
    bus.emit('bike/collision', { severity: 'bump', relSpeedKmh: 12 });
    vi.advanceTimersByTime(1300);
    expect(impactSignal.value.kind).toBeNull();
  });

  it('a repeat of the same impact still counts, so the banner re-shows', () => {
    bus.emit('bike/wobble', {});
    const first = impactSignal.value.seq;
    bus.emit('bike/wobble', {});
    expect(impactSignal.value.seq).toBe(first + 1);
  });
});
