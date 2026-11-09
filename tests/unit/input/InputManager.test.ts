import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  InputManager,
  touchLayout,
  choiceCardRect,
  rectsIntersect,
  DEFAULT_BINDINGS,
  loadBindings,
  saveBindings,
  type InputBindings,
} from '../../../src/input';

describe('T1.4 Input System', () => {
  describe('Touch layout geometry', () => {
    it('touch zones do not overlap choice-card area', () => {
      const screenSizes = [
        { w: 1920, h: 1080 },
        { w: 1280, h: 720 },
        { w: 844, h: 390 }, // iPhone landscape
        { w: 2400, h: 1080 }, // Android landscape
      ];

      for (const { w, h } of screenSizes) {
        const layout = touchLayout(w, h);
        const card = choiceCardRect(w, h);

        expect(rectsIntersect(layout.steerZone, card)).toBe(false);
        expect(rectsIntersect(layout.throttlePad, card)).toBe(false);
        expect(rectsIntersect(layout.brakePad, card)).toBe(false);
        expect(rectsIntersect(layout.iconsZone, card)).toBe(false);
      }
    });

    it('steer zone spans left 35% of screen', () => {
      const w = 1000;
      const h = 500;
      const layout = touchLayout(w, h);
      expect(layout.steerZone.x).toBe(0);
      expect(layout.steerZone.width).toBe(350);
      expect(layout.steerZone.height).toBe(500);
    });
  });

  describe('Bindings persistence & settings JSON', () => {
    let mockStorage: Record<string, string>;

    beforeEach(() => {
      mockStorage = {};
      const storageShim = {
        getItem: (k: string) => mockStorage[k] ?? null,
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
        removeItem: (k: string) => {
          delete mockStorage[k];
        },
        clear: () => {
          mockStorage = {};
        },
      };
      // Polyfill localStorage if running in node environment
      if (typeof globalThis.localStorage === 'undefined') {
        Object.defineProperty(globalThis, 'localStorage', {
          value: storageShim,
          configurable: true,
          writable: true,
        });
      }
    });

    it('bindings round-trip through settings JSON', () => {
      const customBindings: InputBindings = {
        ...DEFAULT_BINDINGS,
        keyboard: {
          ...DEFAULT_BINDINGS.keyboard,
          throttle: ['KeyE'],
          horn: ['KeyB'],
        },
      };

      saveBindings(customBindings);
      const loaded = loadBindings();
      expect(loaded).toEqual(customBindings);
    });

    it('handles localStorage failure gracefully (try/catch fallback)', () => {
      const brokenStorage = {
        getItem: () => {
          throw new Error('Quota exceeded or security error');
        },
        setItem: () => {
          throw new Error('Storage denied');
        },
      };

      const result = loadBindings(brokenStorage as unknown as Storage);
      expect(result).toEqual(DEFAULT_BINDINGS);

      expect(() => {
        saveBindings(DEFAULT_BINDINGS, brokenStorage as unknown as Storage);
      }).not.toThrow();
    });
  });

  describe('Analog smoothing & input read', () => {
    it('keyboard steer analog smoothing reaches 1 within 0.15 s', () => {
      const input = new InputManager({ useWindowListeners: false });

      // Simulate pressing steer right
      input.setRawKeyboardState({ steerRight: true });

      // Before any time elapsed
      input.update(0);
      expect(input.read().steer).toBe(0);

      // Halfway (0.075s)
      input.update(0.075);
      expect(input.read().steer).toBeCloseTo(0.5, 2);

      // Reaching 0.15s
      input.update(0.075);
      expect(input.read().steer).toBe(1.0);
    });

    it('analog steer returns smoothly to 0 within 0.15 s when released', () => {
      const input = new InputManager({ useWindowListeners: false });
      input.setRawKeyboardState({ steerRight: true });
      input.update(0.15);
      expect(input.read().steer).toBe(1.0);

      input.setRawKeyboardState({ steerRight: false });
      input.update(0.075);
      expect(input.read().steer).toBeCloseTo(0.5, 2);

      input.update(0.075);
      expect(input.read().steer).toBe(0.0);
    });

    it('reads all standard keyboard actions properly', () => {
      const input = new InputManager({ useWindowListeners: false });

      input.setRawKeyboardState({
        throttle: true,
        brake: true,
        horn: true,
        camera: true,
        phone: true,
        map: true,
        pause: true,
        choice: 2,
      });
      input.update(0.016);

      const state = input.read();
      expect(state.throttle).toBe(1.0);
      expect(state.brake).toBe(1.0);
      expect(state.horn).toBe(true);
      expect(state.camera).toBe(true);
      expect(state.phone).toBe(true);
      expect(state.map).toBe(true);
      expect(state.pause).toBe(true);
      expect(state.choice).toBe(2);
    });
  });
  describe('Touch pads release per finger (H-16)', () => {
    type Listener = (e: unknown) => void;
    let listeners: Record<string, Listener>;
    const W = 1000;
    const H = 500;
    const fire = (type: string, changed: Array<{ id: number; x: number; y: number }>, stillDown: number) =>
      listeners[type]!({
        changedTouches: changed.map((c) => ({ identifier: c.id, clientX: c.x, clientY: c.y })),
        touches: { length: stillDown },
      });

    beforeEach(() => {
      listeners = {};
      vi.stubGlobal('window', {
        innerWidth: W,
        innerHeight: H,
        addEventListener: (type: string, fn: Listener) => {
          listeners[type] = fn;
        },
        removeEventListener: () => {},
      });
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('lifting the throttle finger releases throttle while steer is still held', () => {
      const input = new InputManager({ bindings: DEFAULT_BINDINGS });
      const pad = touchLayout(W, H).throttlePad;
      fire('touchstart', [{ id: 1, x: 50, y: 250 }], 1); // steer finger
      fire('touchstart', [{ id: 2, x: pad.x + 5, y: pad.y + 5 }], 2); // throttle finger
      input.update(0.016);
      expect(input.read().throttle).toBe(1);

      fire('touchend', [{ id: 2, x: pad.x + 5, y: pad.y + 5 }], 1);
      input.update(0.016);
      expect(input.read().throttle).toBe(0);
    });

    it('a cancelled brake touch releases brake, the throttle finger keeps throttle', () => {
      const input = new InputManager({ bindings: DEFAULT_BINDINGS });
      const layout = touchLayout(W, H);
      fire('touchstart', [{ id: 1, x: 50, y: 250 }], 1);
      fire('touchstart', [{ id: 2, x: layout.throttlePad.x + 5, y: layout.throttlePad.y + 5 }], 2);
      fire('touchstart', [{ id: 3, x: layout.brakePad.x + 5, y: layout.brakePad.y + 5 }], 3);
      input.update(0.016);
      expect(input.read().brake).toBe(1);

      fire('touchcancel', [{ id: 3, x: 0, y: 0 }], 2);
      input.update(0.016);
      expect(input.read().brake).toBe(0);
      expect(input.read().throttle).toBe(1);
    });
  });
});

describe('quick key taps are not lost between frames (audit: tap of C dropped)', () => {
  it('a camera tap that starts and ends between two updates still toggles the camera', () => {
    const handlers: Record<string, (e: KeyboardEvent) => void> = {};
    const fakeWindow = {
      addEventListener: (type: string, fn: (e: KeyboardEvent) => void) => {
        handlers[type] = fn;
      },
      removeEventListener: () => {},
    };
    const g = globalThis as unknown as { window?: unknown };
    const previous = g.window;
    g.window = fakeWindow;
    try {
      const input = new InputManager();
      // Press and release C with no update in between.
      handlers.keydown!({ code: 'KeyC' } as KeyboardEvent);
      handlers.keyup!({ code: 'KeyC' } as KeyboardEvent);
      input.update(1 / 60);
      expect(input.read().camera).toBe(true);
      // Nothing pressed since: the tap is consumed.
      input.update(1 / 60);
      expect(input.read().camera).toBe(false);
    } finally {
      g.window = previous;
    }
  });
});
