import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../../../src/core/events';

interface TestEvents extends Record<string, unknown> {
  'bike/crash': { speed: number };
  'clock/hour': { hour: number };
}

describe('EventBus', () => {
  it('eventbus delivers events to subscribers', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    bus.on('bike/crash', handler);
    bus.emit('bike/crash', { speed: 45 });
    expect(handler).toHaveBeenCalledWith({ speed: 45 });
  });

  it('eventbus unsubscribe stops delivery', () => {
    const bus = new EventBus<TestEvents>();
    const handler = vi.fn();
    const unsub = bus.on('clock/hour', handler);

    bus.emit('clock/hour', { hour: 8 });
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
    bus.emit('clock/hour', { hour: 9 });
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
