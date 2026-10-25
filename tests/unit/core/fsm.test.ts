import { describe, it, expect } from 'vitest';
import { createFsm } from '../../../src/core/fsm';

type State = 'idle' | 'running' | 'paused';
type Event = 'start' | 'pause' | 'resume' | 'stop';

describe('createFsm', () => {
  const table: Record<State, Partial<Record<Event, State>>> = {
    idle: { start: 'running' },
    running: { pause: 'paused', stop: 'idle' },
    paused: { resume: 'running', stop: 'idle' },
  };

  it('can check legal transitions with can()', () => {
    const fsm = createFsm<State, Event>(table, 'idle');
    expect(fsm.can('start')).toBe(true);
    expect(fsm.can('pause')).toBe(false);
  });

  it('transitions state on legal send()', () => {
    const fsm = createFsm<State, Event>(table, 'idle');
    expect(fsm.send('start')).toBe('running');
    expect(fsm.state).toBe('running');
  });

  it('fsm rejects illegal transition (throws in dev)', () => {
    const fsm = createFsm<State, Event>(table, 'idle');
    expect(() => fsm.send('pause')).toThrow();
    expect(fsm.state).toBe('idle');
  });
});
