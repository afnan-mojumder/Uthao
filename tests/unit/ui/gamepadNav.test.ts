import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const effectQueue: Array<() => void | (() => void)> = [];
let stateValues: unknown[] = [];
let stateIndex = 0;

vi.mock('preact/hooks', () => ({
  useState: <T>(init: T | (() => T)) => {
    const idx = stateIndex++;
    if (!(idx in stateValues)) {
      stateValues[idx] = typeof init === 'function' ? (init as () => T)() : init;
    }
    const setState = (next: T | ((prev: T) => T)) => {
      stateValues[idx] =
        typeof next === 'function' ? (next as (prev: T) => T)(stateValues[idx] as T) : next;
    };
    return [stateValues[idx] as T, setState];
  },
  useRef: <T>(init: T) => ({ current: init }),
  useEffect: (fn: () => void | (() => void)) => {
    effectQueue.push(fn);
  },
}));

import { uiModalOpen, startGamepadNav } from '../../../src/ui/gamepadNav';
import { App } from '../../../src/ui/App';
import {
  choiceSignal,
  contextLostSignal,
  dayEndSignal,
  endingSignal,
  garageSignal,
  journalSignal,
  loadingSignal,
  negotiationSignal,
  pausedSignal,
  phoneSignal,
  rotateOverlaySignal,
  saveSlotsSignal,
  screenSignal,
  settingsSignal,
  DEFAULT_SETTINGS,
  saveSettings,
  tripSummarySignal,
  tutorialSignal,
  unsupportedSignal,
  setChoiceDispatcher,
} from '../../../src/ui/store';

function resetAllSignals(): void {
  screenSignal.value = 'game';
  pausedSignal.value = false;
  loadingSignal.value = false;
  contextLostSignal.value = false;
  rotateOverlaySignal.value = false;
  unsupportedSignal.value = null;
  choiceSignal.value = { active: false, prompt: '', options: [], instanceId: undefined };
  negotiationSignal.value = { active: false, session: null, lastResult: null };
  dayEndSignal.value = { active: false, summary: null };
  endingSignal.value = { active: false, result: null, choices: undefined };
  garageSignal.value = { ...garageSignal.value, open: false };
  journalSignal.value = false;
  tripSummarySignal.value = null;
  tutorialSignal.value = { active: false, step: 'idle' };
  saveSlotsSignal.value = { isOpen: false, mode: 'save' };
  phoneSignal.value = { ...phoneSignal.value, open: false };
  saveSettings({ ...DEFAULT_SETTINGS, muted: false });
}

function makeFakeWindow() {
  const listeners = new Map<string, Set<(e: KeyboardEvent) => void>>();
  const dispatched: Array<{ type: string; key?: string; code?: string }> = [];

  const fakeWindow = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: (type: string, fn: (e: KeyboardEvent) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (e: KeyboardEvent) => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (ev: { type: string; key?: string; code?: string }) => {
      dispatched.push(ev);
      for (const fn of listeners.get(ev.type) ?? []) {
        fn(ev as unknown as KeyboardEvent);
      }
      return true;
    },
  };

  const fireKey = (code: string, key = code) => {
    let defaultPrevented = false;
    const ev = {
      type: 'keydown',
      code,
      key,
      target: null,
      preventDefault: () => {
        defaultPrevented = true;
      },
    };
    for (const fn of listeners.get('keydown') ?? []) {
      fn(ev as unknown as KeyboardEvent);
    }
    return { defaultPrevented };
  };

  return { fakeWindow, dispatched, fireKey };
}

describe('uiModalOpen & system overlay guards', () => {
  beforeEach(() => {
    resetAllSignals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    effectQueue.length = 0;
    stateValues = [];
    stateIndex = 0;
  });

  it('returns false during active game when no overlay or modal is open', () => {
    expect(uiModalOpen(false)).toBe(false);
    expect(uiModalOpen(false, { ignoreTutorial: true })).toBe(false);
  });

  it.each([
    ['loadingSignal', () => { loadingSignal.value = true; }],
    ['contextLostSignal', () => { contextLostSignal.value = true; }],
    ['rotateOverlaySignal', () => { rotateOverlaySignal.value = true; }],
    ['unsupportedSignal', () => { unsupportedSignal.value = 'WebGL2 required'; }],
  ])('treats %s as blocking in uiModalOpen() even with ignoreTutorial: true', (_name, activate) => {
    activate();
    expect(uiModalOpen(false)).toBe(true);
    expect(uiModalOpen(false, { ignoreTutorial: true })).toBe(true);
  });

  it('blocks gamepad button dispatch and choice selection when a system overlay is active', () => {
    const { fakeWindow, dispatched } = makeFakeWindow();
    const onChoice = vi.fn();
    setChoiceDispatcher(onChoice);

    const pad = {
      id: 'fake-pad',
      index: 0,
      connected: true,
      mapping: 'standard',
      timestamp: 0,
      axes: [0, 0, 0, 0],
      buttons: Array.from({ length: 17 }, (_, i) => ({
        pressed: i === 0 || i === 1 || i === 4 || i === 5 || i === 9,
        touched: false,
        value: 0,
      })),
    } as unknown as Gamepad;

    const ticks: Array<() => void> = [];
    vi.stubGlobal('window', fakeWindow);
    vi.stubGlobal('navigator', { getGamepads: () => [pad] });
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => {
      ticks.push(cb);
      return ticks.length;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    vi.stubGlobal('KeyboardEvent', class {
      type: string;
      key: string;
      code: string;
      constructor(type: string, init: { key: string; code: string }) {
        this.type = type;
        this.key = init.key;
        this.code = init.code;
      }
    });

    rotateOverlaySignal.value = true;
    choiceSignal.value = {
      active: true,
      prompt: 'test',
      options: [{ id: 'opt1', text: 'One' }, { id: 'opt2', text: 'Two' }],
      instanceId: 'inst_1',
    };

    const stop = startGamepadNav(() => false);
    ticks[0]?.();
    stop();

    expect(ticks.length).toBeGreaterThan(0);
    expect(onChoice).not.toHaveBeenCalled();
    expect(dispatched).toEqual([]);
  });

  describe('App keyboard hotkeys and Escape guards', () => {
    let fireKey: (code: string, key?: string) => { defaultPrevented: boolean };
    let cleanups: Array<() => void>;

    beforeEach(() => {
      effectQueue.length = 0;
      stateValues = [];
      stateIndex = 0;
      cleanups = [];

      const win = makeFakeWindow();
      fireKey = win.fireKey;
      vi.stubGlobal('window', win.fakeWindow);

      App();
      for (const fn of effectQueue) {
        const cleanup = fn();
        if (typeof cleanup === 'function') cleanups.push(cleanup);
      }
      // App mount checks orientation against innerWidth/innerHeight; ensure clean starting state.
      resetAllSignals();
    });

    afterEach(() => {
      for (const fn of cleanups) fn();
    });

    it.each([
      ['loadingSignal', () => { loadingSignal.value = true; }],
      ['contextLostSignal', () => { contextLostSignal.value = true; }],
      ['rotateOverlaySignal', () => { rotateOverlaySignal.value = true; }],
      ['unsupportedSignal', () => { unsupportedSignal.value = 'WebGL2 unsupported'; }],
    ])('blocks G, J, M, N, Tab, and Escape behind %s in game', (_name, activate) => {
      activate();

      fireKey('Tab', 'Tab');
      expect(phoneSignal.value.open).toBe(false);

      fireKey('KeyG', 'g');
      expect(garageSignal.value.open).toBe(false);

      fireKey('KeyJ', 'j');
      expect(journalSignal.value).toBe(false);

      fireKey('KeyM', 'm');
      expect(screenSignal.value).toBe('game');

      fireKey('KeyN', 'n');
      expect(settingsSignal.value.muted).toBe(false);

      fireKey('Escape', 'Escape');
      expect(screenSignal.value).toBe('game');
      expect(pausedSignal.value).toBe(false);
    });

    it.each([
      ['loadingSignal', () => { loadingSignal.value = true; }],
      ['contextLostSignal', () => { contextLostSignal.value = true; }],
      ['rotateOverlaySignal', () => { rotateOverlaySignal.value = true; }],
      ['unsupportedSignal', () => { unsupportedSignal.value = 'WebGL2 unsupported'; }],
    ])('blocks closing open Garage, Journal, Map, SaveSlots, or Pause behind %s', (_name, activate) => {
      garageSignal.value = { ...garageSignal.value, open: true };
      journalSignal.value = true;
      saveSlotsSignal.value = { isOpen: true, mode: 'save' };
      activate();

      fireKey('KeyG', 'g');
      fireKey('KeyJ', 'j');
      fireKey('Escape', 'Escape');

      expect(garageSignal.value.open).toBe(true);
      expect(journalSignal.value).toBe(true);
      expect(saveSlotsSignal.value.isOpen).toBe(true);

      saveSlotsSignal.value = { isOpen: false, mode: 'save' };
      garageSignal.value = { ...garageSignal.value, open: false };
      journalSignal.value = false;
      screenSignal.value = 'map';
      fireKey('KeyM', 'm');
      fireKey('Escape', 'Escape');
      expect(screenSignal.value).toBe('map');

      screenSignal.value = 'pause';
      pausedSignal.value = true;
      fireKey('Escape', 'Escape');
      expect(screenSignal.value).toBe('pause');
      expect(pausedSignal.value).toBe(true);
    });

    it.each([
      [
        'endingSignal',
        () => {
          endingSignal.value = { active: true, result: {} as never, choices: [] };
        },
      ],
      [
        'dayEndSignal',
        () => {
          dayEndSignal.value = { active: true, summary: {} as never };
        },
      ],
      [
        'tripSummarySignal',
        () => {
          tripSummarySignal.value = {
            requestId: 'req_1',
            fare: 100,
            tip: 0,
            commission: 15,
            fuelCost: 10,
            otherCosts: 0,
            bonus: 0,
            penalties: 0,
            compensation: 0,
            fuelLiters: 0.1,
            net: 75,
            durationMin: 8,
            distanceKm: 2,
            rating: 5,
            consequences: [],
          };
        },
      ],
      [
        'choiceSignal',
        () => {
          choiceSignal.value = {
            active: true,
            prompt: 'enc.prompt',
            options: [{ id: '1', text: 'Opt 1' }],
            instanceId: 'inst_1',
          };
        },
      ],
      [
        'negotiationSignal',
        () => {
          negotiationSignal.value = {
            active: true,
            session: {} as never,
            lastResult: null,
          };
        },
      ],
    ])('prevents Escape from opening Pause in game while non-dismissible %s is active', (_name, activate) => {
      activate();

      fireKey('Escape', 'Escape');

      expect(screenSignal.value).toBe('game');
      expect(pausedSignal.value).toBe(false);
    });

    it('still allows Escape to open and close Pause when no system overlay or non-dismissible modal is active', () => {
      fireKey('Escape', 'Escape');
      expect(screenSignal.value).toBe('pause');
      expect(pausedSignal.value).toBe(true);

      fireKey('Escape', 'Escape');
      expect(screenSignal.value).toBe('game');
      expect(pausedSignal.value).toBe(false);
    });
  });
});
