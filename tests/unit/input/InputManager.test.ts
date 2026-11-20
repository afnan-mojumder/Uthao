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

    it('steer zone sits in bottom-left clear of top-left minimap', () => {
      const w = 1000;
      const h = 500;
      const layout = touchLayout(w, h);
      expect(layout.steerZone.x).toBeLessThan(50);
      expect(layout.steerZone.y).toBeGreaterThanOrEqual(h * 0.45);
      expect(layout.steerZone.x + layout.steerZone.width).toBeLessThanOrEqual(w * 0.35);
      expect(layout.steerZone.height).toBeGreaterThan(100);
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

describe('Canonical steer sign (-1 = left, +1 = right) across all input devices', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keyboard KeyA and ArrowLeft output -1; KeyD and ArrowRight output +1', () => {
    const handlers: Record<string, (e: KeyboardEvent) => void> = {};
    vi.stubGlobal('window', {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener: (type: string, fn: (e: KeyboardEvent) => void) => {
        handlers[type] = fn;
      },
      removeEventListener: () => {},
    });

    const input = new InputManager({ bindings: DEFAULT_BINDINGS });
    for (const code of ['KeyA', 'ArrowLeft']) {
      handlers.keydown!({ code } as KeyboardEvent);
      for (let i = 0; i < 20; i++) input.update(0.016);
      expect(input.read().steer, code).toBe(-1);
      handlers.keyup!({ code } as KeyboardEvent);
      for (let i = 0; i < 20; i++) input.update(0.016);
      expect(input.read().steer).toBe(0);
    }

    for (const code of ['KeyD', 'ArrowRight']) {
      handlers.keydown!({ code } as KeyboardEvent);
      for (let i = 0; i < 20; i++) input.update(0.016);
      expect(input.read().steer, code).toBe(1);
      handlers.keyup!({ code } as KeyboardEvent);
      for (let i = 0; i < 20; i++) input.update(0.016);
      expect(input.read().steer).toBe(0);
    }
  });

  it('touch drag left outputs -1 and touch drag right outputs +1', () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    vi.stubGlobal('window', {
      innerWidth: 1000,
      innerHeight: 500,
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        listeners[type] = fn;
      },
      removeEventListener: () => {},
    });

    const input = new InputManager({ bindings: DEFAULT_BINDINGS });
    listeners.touchstart!({
      changedTouches: [{ identifier: 1, clientX: 200, clientY: 250 }],
      touches: { length: 1 },
    });

    listeners.touchmove!({
      changedTouches: [{ identifier: 1, clientX: 50, clientY: 250 }],
    });
    input.update(0.016);
    expect(input.read().steer).toBe(-1);

    listeners.touchmove!({
      changedTouches: [{ identifier: 1, clientX: 350, clientY: 250 }],
    });
    input.update(0.016);
    expect(input.read().steer).toBe(1);

    listeners.touchend!({
      changedTouches: [{ identifier: 1, clientX: 350, clientY: 250 }],
      touches: { length: 0 },
    });
    input.update(0.016);
    expect(input.read().steer).toBe(0);
  });

  it('gamepad left stick X outputs -1 for left and +1 for right', () => {
    let axis0 = 0;
    vi.stubGlobal('navigator', {
      getGamepads: () => [
        {
          axes: [axis0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
        },
      ],
    });

    const input = new InputManager({ useWindowListeners: false, bindings: DEFAULT_BINDINGS });
    axis0 = -1;
    input.update(0.016);
    expect(input.read().steer).toBe(-1);

    axis0 = 1;
    input.update(0.016);
    expect(input.read().steer).toBe(1);
  });

  it('tilt controls output -1 for left tilt and +1 for right tilt', () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    vi.stubGlobal('window', {
      innerWidth: 1000,
      innerHeight: 500,
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        listeners[type] = fn;
      },
      removeEventListener: () => {},
    });

    const input = new InputManager({
      bindings: { ...DEFAULT_BINDINGS, tiltEnabled: true, tiltSensitivity: 1.0 },
    });
    listeners.deviceorientation!({ gamma: -30 });
    input.update(0.016);
    expect(input.read().steer).toBe(-1);

    listeners.deviceorientation!({ gamma: 30 });
    input.update(0.016);
    expect(input.read().steer).toBe(1);
  });

  it('landscape beta drives tilt steering properly while ignoring forward/back gamma', () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    vi.stubGlobal('window', {
      innerWidth: 915,
      innerHeight: 412,
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        listeners[type] = fn;
      },
      removeEventListener: () => {},
    });

    const input = new InputManager({
      bindings: { ...DEFAULT_BINDINGS, tiltEnabled: true, tiltSensitivity: 1.0 },
    });

    // In landscape, beta drives left/right tilt even if gamma has pitch noise
    listeners.deviceorientation!({ beta: -30, gamma: 20 });
    input.update(0.016);
    expect(input.read().steer).toBe(-1);

    listeners.deviceorientation!({ beta: 30, gamma: -20 });
    input.update(0.016);
    expect(input.read().steer).toBe(1);

    // Zero beta with non-zero gamma does not falsely steer in landscape
    listeners.deviceorientation!({ beta: 0, gamma: 25 });
    input.update(0.016);
    expect(input.read().steer).toBe(0);
  });
});

describe('P6.4 Input ergonomics, latch safety, deadzones, and modal isolation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sliding thumb off Throttle via touchmove, pointermove, or pointercancel does not leave throttle latched', () => {
    const listeners: Record<string, (e: unknown) => void> = {};
    const W = 915;
    const H = 412;
    vi.stubGlobal('window', {
      innerWidth: W,
      innerHeight: H,
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        listeners[type] = fn;
      },
      removeEventListener: () => {},
    });

    const input = new InputManager({ bindings: DEFAULT_BINDINGS });
    const pad = touchLayout(W, H).throttlePad;

    // 1. Touch slide off throttle pad
    listeners.touchstart!({
      changedTouches: [{ identifier: 2, clientX: pad.x + 10, clientY: pad.y + 10 }],
      touches: { length: 1 },
    });
    input.update(0.016);
    expect(input.read().throttle).toBe(1);

    listeners.touchmove!({
      changedTouches: [{ identifier: 2, clientX: 10, clientY: 10 }],
      touches: { length: 1 },
    });
    input.update(0.016);
    expect(input.read().throttle).toBe(0);

    // 2. Pointer slide off throttle pad
    listeners.pointerdown!({
      pointerId: 11,
      pointerType: 'touch',
      clientX: pad.x + 10,
      clientY: pad.y + 10,
      target: null,
    });
    input.update(0.016);
    expect(input.read().throttle).toBe(1);

    listeners.pointermove!({
      pointerId: 11,
      pointerType: 'touch',
      clientX: 50,
      clientY: 50,
    });
    input.update(0.016);
    expect(input.read().throttle).toBe(0);

    // 3. pointercancel clears throttle
    listeners.pointerdown!({
      pointerId: 12,
      pointerType: 'touch',
      clientX: pad.x + 10,
      clientY: pad.y + 10,
      target: null,
    });
    input.update(0.016);
    expect(input.read().throttle).toBe(1);

    listeners.pointercancel!({
      pointerId: 12,
      pointerType: 'touch',
    });
    input.update(0.016);
    expect(input.read().throttle).toBe(0);
  });

  it('window blur and document visibilitychange clear active touches and pressed driving keys', () => {
    const winListeners: Record<string, (e: unknown) => void> = {};
    const docListeners: Record<string, (e: unknown) => void> = {};
    const W = 915;
    const H = 412;
    vi.stubGlobal('window', {
      innerWidth: W,
      innerHeight: H,
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        winListeners[type] = fn;
      },
      removeEventListener: () => {},
    });
    const fakeDoc = {
      hidden: false,
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        docListeners[type] = fn;
      },
      removeEventListener: () => {},
    };
    vi.stubGlobal('document', fakeDoc);

    const input = new InputManager({ bindings: DEFAULT_BINDINGS });
    const pad = touchLayout(W, H).throttlePad;

    // Press W + touch throttle
    winListeners.keydown!({ code: 'KeyW', target: null });
    winListeners.touchstart!({
      changedTouches: [{ identifier: 1, clientX: pad.x + 10, clientY: pad.y + 10 }],
      touches: { length: 1 },
    });
    input.update(0.016);
    expect(input.read().throttle).toBe(1);

    // Window blur clears both keys and touches
    winListeners.blur!({});
    input.update(0.016);
    expect(input.read().throttle).toBe(0);

    // Re-press key + touch, then hide document
    winListeners.keydown!({ code: 'KeyS', target: null });
    winListeners.touchstart!({
      changedTouches: [{ identifier: 2, clientX: pad.x + 10, clientY: pad.y + 10 }],
      touches: { length: 1 },
    });
    input.update(0.016);
    expect(input.read().throttle).toBe(1);
    expect(input.read().brake).toBe(1);

    fakeDoc.hidden = true;
    docListeners.visibilitychange!({});
    input.update(0.016);
    expect(input.read().throttle).toBe(0);
    expect(input.read().brake).toBe(0);
  });

  it('gamepad analog trigger < 0.08 deadzone suppresses drift and does not kill keyboard/digital throttle', () => {
    vi.stubGlobal('navigator', {
      getGamepads: () => [
        {
          axes: [0, 0, 0, 0],
          buttons: Array.from({ length: 17 }, (_, i) => {
            if (i === 7) return { pressed: false, value: 0.04 }; // RT noise < 0.08
            if (i === 6) return { pressed: false, value: 0.05 }; // LT noise < 0.08
            return { pressed: false, value: 0 };
          }),
        },
      ],
    });

    const input = new InputManager({ useWindowListeners: false, bindings: DEFAULT_BINDINGS });
    input.update(0.016);
    expect(input.read().throttle).toBe(0);
    expect(input.read().brake).toBe(0);

    // Keyboard throttle remains 1.0 despite RT deadzone noise
    input.setRawKeyboardState({ throttle: true });
    input.update(0.016);
    expect(input.read().throttle).toBe(1);
    expect(input.read().brake).toBe(0);
  });

  it('tapping UI controls (button, input, [role="dialog"], [data-ui-control], [data-ui-interactive]) never triggers canvas throttle/steer', () => {
    const winListeners: Record<string, (e: unknown) => void> = {};
    const W = 915;
    const H = 412;
    vi.stubGlobal('window', {
      innerWidth: W,
      innerHeight: H,
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        winListeners[type] = fn;
      },
      removeEventListener: () => {},
    });

    const input = new InputManager({ bindings: DEFAULT_BINDINGS });
    const layout = touchLayout(W, H);
    const selectors = ['button', 'input', '[role="dialog"]', '[data-ui-control]', '[data-ui-interactive]'];

    for (const sel of selectors) {
      const target = {
        closest: (query: string) => (query.includes(sel) ? {} : null),
      };
      winListeners.touchstart!({
        target,
        changedTouches: [
          { identifier: 5, clientX: layout.throttlePad.x + 10, clientY: layout.throttlePad.y + 10, target },
          { identifier: 6, clientX: layout.steerZone.x + 10, clientY: layout.steerZone.y + 10, target },
        ],
        touches: { length: 2 },
      });
      winListeners.touchmove!({
        target,
        changedTouches: [{ identifier: 6, clientX: layout.steerZone.x + 100, clientY: layout.steerZone.y + 10, target }],
        touches: { length: 2 },
      });
      input.update(0.016);
      expect(input.read().throttle, sel).toBe(0);
      expect(input.read().steer, sel).toBe(0);
    }
  });

  it('active blocking modals suppress driving inputs and active gameplay calls preventDefault on Space/Arrows without blocking text inputs', () => {
    const winListeners: Record<string, (e: unknown) => void> = {};
    vi.stubGlobal('window', {
      innerWidth: 1280,
      innerHeight: 720,
      addEventListener: (type: string, fn: (e: unknown) => void) => {
        winListeners[type] = fn;
      },
      removeEventListener: () => {},
    });

    let modalOpen = false;
    const input = new InputManager({
      bindings: DEFAULT_BINDINGS,
      isModalOpen: () => modalOpen,
    });

    // 1. Active gameplay calls preventDefault on Space & Arrows
    for (const code of ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
      let prevented = false;
      winListeners.keydown!({
        code,
        target: null,
        preventDefault: () => {
          prevented = true;
        },
      });
      winListeners.keyup!({ code });
      expect(prevented, code).toBe(true);
    }

    // Driving works when modal is closed
    winListeners.keydown!({ code: 'KeyW', target: null, preventDefault: () => {} });
    winListeners.keydown!({ code: 'KeyD', target: null, preventDefault: () => {} });
    input.update(0.2);
    expect(input.read().throttle).toBe(1);
    expect(input.read().steer).toBe(1);

    // 2. Text inputs are NOT blocked and do NOT trigger driving or preventDefault
    winListeners.keyup!({ code: 'KeyW' });
    winListeners.keyup!({ code: 'KeyD' });
    input.update(0.2);
    let textPrevented = false;
    winListeners.keydown!({
      code: 'Space',
      target: { tagName: 'INPUT', isContentEditable: false },
      preventDefault: () => {
        textPrevented = true;
      },
    });
    input.update(0.016);
    expect(textPrevented).toBe(false);
    expect(input.read().brake).toBe(0);

    // 3. Active blocking modal suppresses driving inputs and skips Space/Arrow preventDefault
    modalOpen = true;
    let modalSpacePrevented = false;
    winListeners.keydown!({
      code: 'Space',
      target: null,
      preventDefault: () => {
        modalSpacePrevented = true;
      },
    });
    winListeners.keydown!({ code: 'KeyW', target: null, preventDefault: () => {} });
    input.update(0.016);
    expect(modalSpacePrevented).toBe(false);
    expect(input.read().throttle).toBe(0);
    expect(input.read().brake).toBe(0);
    expect(input.read().steer).toBe(0);
  });
});
