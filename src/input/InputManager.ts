import type { InputState, InputBindings, TouchLayout } from './types';
import { loadBindings, saveBindings } from './bindings';
import { touchLayout } from './layout';

export interface RawKeyboardInput {
  throttle?: boolean;
  brake?: boolean;
  steerLeft?: boolean;
  steerRight?: boolean;
  horn?: boolean;
  camera?: boolean;
  phone?: boolean;
  map?: boolean;
  pause?: boolean;
  choice?: 0 | 1 | 2 | 3 | null;
}

export interface InputManagerOptions {
  useWindowListeners?: boolean;
  target?: Window | HTMLElement;
  bindings?: InputBindings;
}

export class InputManager {
  private bindings: InputBindings;
  private state: InputState;
  private rawKeyboard: RawKeyboardInput = {};
  private activeKeys = new Set<string>();

  // Touch state
  private touchSteer = 0; // -1..1
  private touchThrottle = 0; // 0..1
  private touchBrake = 0; // 0..1
  private touchSteerTouchId: number | null = null;
  private touchSteerStartX = 0;

  // Tilt state
  private tiltSteer = 0;

  // Analog smoothing for steer
  private currentSteer = 0;
  private readonly STEER_RAMP_TIME = 0.15; // 0.15s to reach full 1.0

  // Event listener teardown
  private teardownFns: Array<() => void> = [];

  constructor(options: InputManagerOptions = {}) {
    this.bindings = options.bindings ?? loadBindings();
    this.state = {
      throttle: 0,
      brake: 0,
      steer: 0,
      horn: false,
      camera: false,
      phone: false,
      map: false,
      pause: false,
      choice: null,
    };

    if (options.useWindowListeners !== false && typeof window !== 'undefined') {
      this.attachListeners(options.target ?? window);
    }
  }

  public getBindings(): InputBindings {
    return { ...this.bindings };
  }

  public setBindings(newBindings: InputBindings): void {
    this.bindings = newBindings;
    saveBindings(this.bindings);
  }

  public setRawKeyboardState(raw: Partial<RawKeyboardInput>): void {
    this.rawKeyboard = { ...this.rawKeyboard, ...raw };
  }

  /**
   * Updates analog smoothing and reads gamepads/touch devices.
   * dt is elapsed delta time in seconds.
   */
  public update(dt: number): void {
    // Determine raw digital/analog keyboard targets
    let kbThrottle = 0;
    let kbBrake = 0;
    let targetKbSteer = 0;
    let horn = Boolean(this.rawKeyboard.horn);
    let camera = Boolean(this.rawKeyboard.camera);
    let phone = Boolean(this.rawKeyboard.phone);
    let map = Boolean(this.rawKeyboard.map);
    let pause = Boolean(this.rawKeyboard.pause);
    let choice: 0 | 1 | 2 | 3 | null = this.rawKeyboard.choice ?? null;

    if (this.rawKeyboard.throttle) kbThrottle = 1.0;
    if (this.rawKeyboard.brake) kbBrake = 1.0;
    if (this.rawKeyboard.steerLeft) targetKbSteer -= 1.0;
    if (this.rawKeyboard.steerRight) targetKbSteer += 1.0;

    // Keys active from DOM keyboard events
    if (this.matchesAny(this.bindings.keyboard.throttle)) kbThrottle = 1.0;
    if (this.matchesAny(this.bindings.keyboard.brake)) kbBrake = 1.0;
    if (this.matchesAny(this.bindings.keyboard.steerLeft)) targetKbSteer -= 1.0;
    if (this.matchesAny(this.bindings.keyboard.steerRight)) targetKbSteer += 1.0;
    if (this.matchesAny(this.bindings.keyboard.horn)) horn = true;
    if (this.matchesAny(this.bindings.keyboard.camera)) camera = true;
    if (this.matchesAny(this.bindings.keyboard.phone)) phone = true;
    if (this.matchesAny(this.bindings.keyboard.map)) map = true;
    if (this.matchesAny(this.bindings.keyboard.pause)) pause = true;
    if (this.matchesAny(this.bindings.keyboard.choice0)) choice = 0;
    if (this.matchesAny(this.bindings.keyboard.choice1)) choice = 1;
    if (this.matchesAny(this.bindings.keyboard.choice2)) choice = 2;
    if (this.matchesAny(this.bindings.keyboard.choice3)) choice = 3;

    // Smooth keyboard steer towards target
    if (dt > 0) {
      const step = (1.0 / this.STEER_RAMP_TIME) * dt;
      if (this.currentSteer < targetKbSteer) {
        this.currentSteer = Math.min(targetKbSteer, this.currentSteer + step);
      } else if (this.currentSteer > targetKbSteer) {
        this.currentSteer = Math.max(targetKbSteer, this.currentSteer - step);
      }
    }

    // Poll Gamepad (if available)
    let gpThrottle = 0;
    let gpBrake = 0;
    let gpSteer = 0;
    const gp = this.getPrimaryGamepad();
    if (gp) {
      // RT throttle (trigger or button)
      const rtBtn = gp.buttons[this.bindings.gamepad.throttleAxisOrButton];
      if (rtBtn) gpThrottle = rtBtn.value ?? (rtBtn.pressed ? 1 : 0);

      // LT brake (trigger or button)
      const ltBtn = gp.buttons[this.bindings.gamepad.brakeAxisOrButton];
      if (ltBtn) gpBrake = ltBtn.value ?? (ltBtn.pressed ? 1 : 0);

      // Left stick steer (axis 0)
      const stick = gp.axes[this.bindings.gamepad.steerAxis] ?? 0;
      if (Math.abs(stick) > 0.08) {
        // Deadzone
        gpSteer = stick;
      }

      // Buttons
      if (gp.buttons[this.bindings.gamepad.hornButton]?.pressed) horn = true;
      if (gp.buttons[this.bindings.gamepad.cameraButton]?.pressed) camera = true;
      if (gp.buttons[this.bindings.gamepad.phoneButton]?.pressed) phone = true;
      if (gp.buttons[this.bindings.gamepad.mapButton]?.pressed) map = true;
      if (gp.buttons[this.bindings.gamepad.pauseButton]?.pressed) pause = true;

      // Choice buttons (A, B, X, Y)
      this.bindings.gamepad.choiceButtons.forEach((btnIndex, idx) => {
        if (gp.buttons[btnIndex]?.pressed) choice = idx as 0 | 1 | 2 | 3;
      });
    }

    // Combine throttle, brake, steer across Keyboard, Gamepad, Touch, and Tilt
    const finalThrottle = Math.max(kbThrottle, gpThrottle, this.touchThrottle);
    const finalBrake = Math.max(kbBrake, gpBrake, this.touchBrake);

    let finalSteer = this.currentSteer;
    if (Math.abs(gpSteer) > 0.01) finalSteer = gpSteer;
    if (Math.abs(this.touchSteer) > 0.01) finalSteer = this.touchSteer;
    if (this.bindings.tiltEnabled && Math.abs(this.tiltSteer) > 0.01) {
      finalSteer = this.tiltSteer * this.bindings.tiltSensitivity;
    }

    this.state = {
      throttle: Math.min(1.0, Math.max(0.0, finalThrottle)),
      brake: Math.min(1.0, Math.max(0.0, finalBrake)),
      steer: Math.min(1.0, Math.max(-1.0, finalSteer)),
      horn,
      camera,
      phone,
      map,
      pause,
      choice,
    };
  }

  public read(): InputState {
    return { ...this.state };
  }

  public requestTiltPermission(): Promise<boolean> {
    if (
      typeof DeviceOrientationEvent !== 'undefined' &&
      typeof (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> })
        .requestPermission === 'function'
    ) {
      return (DeviceOrientationEvent as unknown as { requestPermission: () => Promise<string> })
        .requestPermission()
        .then((perm) => perm === 'granted')
        .catch(() => false);
    }
    return Promise.resolve(true);
  }

  public detach(): void {
    for (const teardown of this.teardownFns) {
      teardown();
    }
    this.teardownFns = [];
    this.activeKeys.clear();
  }

  private matchesAny(codes: string[]): boolean {
    for (const code of codes) {
      if (this.activeKeys.has(code)) return true;
    }
    return false;
  }

  private getPrimaryGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') {
      return null;
    }
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const pad = pads[i];
      if (pad) return pad;
    }
    return null;
  }

  private attachListeners(target: Window | HTMLElement): void {
    const onKeyDown = (e: KeyboardEvent) => {
      this.activeKeys.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.activeKeys.delete(e.code);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);

    this.teardownFns.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });

    // Touch event listeners
    if (typeof window !== 'undefined') {
      const onTouchStart = (e: TouchEvent) => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const layout: TouchLayout = touchLayout(w, h);

        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (!t) continue;
          const px = t.clientX;
          const py = t.clientY;

          // Steer drag zone (left 35%)
          if (px <= layout.steerZone.width) {
            this.touchSteerTouchId = t.identifier;
            this.touchSteerStartX = px;
          }

          // Throttle pad
          if (
            px >= layout.throttlePad.x &&
            px <= layout.throttlePad.x + layout.throttlePad.width &&
            py >= layout.throttlePad.y &&
            py <= layout.throttlePad.y + layout.throttlePad.height
          ) {
            this.touchThrottle = 1.0;
          }

          // Brake pad
          if (
            px >= layout.brakePad.x &&
            px <= layout.brakePad.x + layout.brakePad.width &&
            py >= layout.brakePad.y &&
            py <= layout.brakePad.y + layout.brakePad.height
          ) {
            this.touchBrake = 1.0;
          }
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        const w = window.innerWidth;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (!t) continue;
          if (t.identifier === this.touchSteerTouchId) {
            const deltaX = t.clientX - this.touchSteerStartX;
            // Drag distance across ~100px gives full steer
            const maxDrag = Math.min(120, w * 0.15);
            this.touchSteer = Math.max(-1.0, Math.min(1.0, deltaX / maxDrag));
          }
        }
      };

      const onTouchEnd = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (!t) continue;
          if (t.identifier === this.touchSteerTouchId) {
            this.touchSteerTouchId = null;
            this.touchSteer = 0;
          }
        }
        if (e.touches.length === 0) {
          this.touchThrottle = 0;
          this.touchBrake = 0;
          this.touchSteer = 0;
        }
      };

      const onDeviceOrientation = (e: DeviceOrientationEvent) => {
        if (!this.bindings.tiltEnabled || e.gamma === null) return;
        // Gamma is left-to-right tilt in degrees (-90..90)
        // Normalize ~30 degrees tilt to full lock
        const steer = Math.max(-1.0, Math.min(1.0, e.gamma / 30));
        this.tiltSteer = steer;
      };

      target.addEventListener('touchstart', onTouchStart as EventListener, { passive: true });
      target.addEventListener('touchmove', onTouchMove as EventListener, { passive: true });
      target.addEventListener('touchend', onTouchEnd as EventListener, { passive: true });
      target.addEventListener('touchcancel', onTouchEnd as EventListener, { passive: true });
      window.addEventListener('deviceorientation', onDeviceOrientation);

      this.teardownFns.push(() => {
        target.removeEventListener('touchstart', onTouchStart as EventListener);
        target.removeEventListener('touchmove', onTouchMove as EventListener);
        target.removeEventListener('touchend', onTouchEnd as EventListener);
        target.removeEventListener('touchcancel', onTouchEnd as EventListener);
        window.removeEventListener('deviceorientation', onDeviceOrientation);
      });
    }
  }
}
