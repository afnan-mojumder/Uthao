import type { InputState, InputBindings, Rect, TouchLayout } from './types';
import { loadBindings, saveBindings } from './bindings';
import { touchLayout } from './layout';
import {
  choiceSignal,
  contextLostSignal,
  dayEndSignal,
  endingSignal,
  garageSignal,
  journalSignal,
  karmaPanelSignal,
  loadingSignal,
  negotiationSignal,
  pausedSignal,
  phoneSignal,
  rotateOverlaySignal,
  saveSlotsSignal,
  screenSignal,
  settingsOpenSignal,
  tripSummarySignal,
  tutorialSignal,
  uiSheetSignal,
  unsupportedSignal,
} from '../ui/store';

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
  isModalOpen?: () => boolean;
}

const TRIGGER_DEADZONE = 0.08;
const GAMEPLAY_PREVENT_DEFAULT_CODES = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);
const UI_TARGET_SELECTOR =
  'button, input, select, textarea, a[href], [role="dialog"], [data-ui-control], [data-ui-interactive]';

function pointInRect(px: number, py: number, rect: Rect): boolean {
  return (
    px >= rect.x &&
    px <= rect.x + rect.width &&
    py >= rect.y &&
    py <= rect.y + rect.height
  );
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as HTMLElement;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.tagName === 'SELECT' ||
    Boolean(el.isContentEditable)
  );
}

function isUiTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).closest !== 'function') return false;
  return Boolean((target as HTMLElement).closest(UI_TARGET_SELECTOR));
}

function defaultIsModalOpen(): boolean {
  if (
    pausedSignal.value ||
    settingsOpenSignal.value ||
    loadingSignal.value.active ||
    contextLostSignal.value ||
    rotateOverlaySignal.value ||
    Boolean(unsupportedSignal.value) ||
    choiceSignal.value.active ||
    negotiationSignal.value.active ||
    dayEndSignal.value.active ||
    endingSignal.value.active ||
    garageSignal.value.open ||
    journalSignal.value ||
    karmaPanelSignal.value ||
    uiSheetSignal.value ||
    tripSummarySignal.value !== null ||
    (tutorialSignal.value.active && tutorialSignal.value.step !== 'riding') ||
    saveSlotsSignal.value.isOpen ||
    phoneSignal.value.open ||
    screenSignal.value === 'pause' ||
    screenSignal.value === 'map' ||
    screenSignal.value === 'garage'
  ) {
    return true;
  }
  if (typeof document !== 'undefined' && typeof document.querySelector === 'function') {
    return Boolean(
      document.querySelector('[role="dialog"], [data-testid="choice-card"], [data-testid="settings-screen"]')
    );
  }
  return false;
}

function readTrigger(btn: GamepadButton | undefined): number {
  if (!btn) return 0;
  const val = typeof btn.value === 'number' ? btn.value : 0;
  if (val >= TRIGGER_DEADZONE) return val;
  return btn.pressed ? 1 : 0;
}

function isLandscapeViewport(): boolean {
  if (typeof window === 'undefined') return true;
  if (typeof window.innerWidth === 'number' && typeof window.innerHeight === 'number') {
    return window.innerWidth >= window.innerHeight;
  }
  return true;
}

function isLandscapeSecondary(): boolean {
  if (typeof screen !== 'undefined' && screen.orientation && typeof screen.orientation.angle === 'number') {
    return screen.orientation.angle === 270 || screen.orientation.angle === -90;
  }
  if (typeof window !== 'undefined') {
    const orient = (window as unknown as { orientation?: number }).orientation;
    return orient === -90 || orient === 270;
  }
  return false;
}

export function requestTiltPermission(): Promise<boolean> {
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

export class InputManager {
  private bindings: InputBindings;
  private state: InputState;
  private rawKeyboard: RawKeyboardInput = {};
  private activeKeys = new Set<string>();
  /** Keys pressed since the last update, so a quick tap is not lost between frames (audit: tap of C dropped). */
  private tappedKeys = new Set<string>();
  private isModalOpenFn?: () => boolean;

  // Touch & pointer state
  private touchSteer = 0; // -1..1
  // Each pad tracks the fingers/pointers on it, so lifting or sliding off releases only that pad.
  private throttleTouchIds = new Set<number>();
  private brakeTouchIds = new Set<number>();
  private touchSteerTouchId: number | null = null;
  private touchSteerStartX = 0;
  private throttlePointerIds = new Set<number>();
  private brakePointerIds = new Set<number>();
  private steerPointerId: number | null = null;
  private steerPointerStartX = 0;

  // Tilt state
  private tiltSteer = 0;

  // Analog smoothing for steer
  private currentSteer = 0;
  private readonly STEER_RAMP_TIME = 0.15; // 0.15s to reach full 1.0

  // Event listener teardown
  private teardownFns: Array<() => void> = [];

  constructor(options: InputManagerOptions = {}) {
    this.bindings = options.bindings ?? loadBindings();
    this.isModalOpenFn = options.isModalOpen;
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

  public isTouchThrottleActive(): boolean {
    return this.throttleTouchIds.size > 0 || this.throttlePointerIds.size > 0;
  }

  public isTouchBrakeActive(): boolean {
    return this.brakeTouchIds.size > 0 || this.brakePointerIds.size > 0;
  }

  public getTouchSteer(): number {
    return this.touchSteer;
  }

  public getTouchVisualState(): { throttle: boolean; brake: boolean; steer: number } {
    return {
      throttle: this.isTouchThrottleActive(),
      brake: this.isTouchBrakeActive(),
      steer: this.getTouchSteer(),
    };
  }

  private isDrivingBlocked(): boolean {
    if (this.isModalOpenFn) return this.isModalOpenFn();
    return defaultIsModalOpen();
  }

  private clearTouchInputs(): void {
    this.throttleTouchIds.clear();
    this.brakeTouchIds.clear();
    this.throttlePointerIds.clear();
    this.brakePointerIds.clear();
    this.touchSteerTouchId = null;
    this.steerPointerId = null;
    this.touchSteer = 0;
  }

  private clearActiveInputs(): void {
    this.activeKeys.clear();
    this.tappedKeys.clear();
    this.rawKeyboard = {};
    this.clearTouchInputs();
    this.tiltSteer = 0;
    this.currentSteer = 0;
  }

  /**
   * Updates analog smoothing and reads gamepads/touch devices.
   * dt is elapsed delta time in seconds.
   */
  public update(dt: number): void {
    const blocked = this.isDrivingBlocked();

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

    if (!blocked) {
      if (this.rawKeyboard.throttle) kbThrottle = 1.0;
      if (this.rawKeyboard.brake) kbBrake = 1.0;
      if (this.rawKeyboard.steerLeft) targetKbSteer -= 1.0;
      if (this.rawKeyboard.steerRight) targetKbSteer += 1.0;

      // Keys active from DOM keyboard events
      if (this.matchesAny(this.bindings.keyboard.throttle)) kbThrottle = 1.0;
      if (this.matchesAny(this.bindings.keyboard.brake)) kbBrake = 1.0;
      if (this.matchesAny(this.bindings.keyboard.steerLeft)) targetKbSteer -= 1.0;
      if (this.matchesAny(this.bindings.keyboard.steerRight)) targetKbSteer += 1.0;
    }

    if (this.matchesPressed(this.bindings.keyboard.horn)) horn = !blocked && true;
    if (this.matchesPressed(this.bindings.keyboard.camera)) camera = !blocked && true;
    if (this.matchesPressed(this.bindings.keyboard.phone)) phone = true;
    if (this.matchesPressed(this.bindings.keyboard.map)) map = true;
    if (this.matchesPressed(this.bindings.keyboard.pause)) pause = true;
    if (this.matchesPressed(this.bindings.keyboard.choice0)) choice = 0;
    if (this.matchesPressed(this.bindings.keyboard.choice1)) choice = 1;
    if (this.matchesPressed(this.bindings.keyboard.choice2)) choice = 2;
    if (this.matchesPressed(this.bindings.keyboard.choice3)) choice = 3;
    this.tappedKeys.clear();

    if (blocked) {
      this.currentSteer = 0;
      this.clearTouchInputs();
    } else if (dt > 0) {
      // Smooth keyboard steer towards target (1.8x faster active counter-steer)
      const isCountering =
        targetKbSteer !== 0 &&
        this.currentSteer !== 0 &&
        Math.sign(targetKbSteer) !== Math.sign(this.currentSteer);
      const rate = (1.0 / this.STEER_RAMP_TIME) * (isCountering ? 1.8 : 1.0);
      const step = rate * dt;
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
      if (!blocked) {
        // RT throttle (trigger or button with < 0.08 analog deadzone)
        gpThrottle = readTrigger(gp.buttons[this.bindings.gamepad.throttleAxisOrButton]);

        // LT brake (trigger or button with < 0.08 analog deadzone)
        gpBrake = readTrigger(gp.buttons[this.bindings.gamepad.brakeAxisOrButton]);

        // Left stick steer (axis 0)
        const stick = gp.axes[this.bindings.gamepad.steerAxis] ?? 0;
        if (Math.abs(stick) > 0.08) {
          gpSteer = stick;
        }

        if (gp.buttons[this.bindings.gamepad.hornButton]?.pressed) horn = true;
        if (gp.buttons[this.bindings.gamepad.cameraButton]?.pressed) camera = true;
      }

      if (gp.buttons[this.bindings.gamepad.phoneButton]?.pressed) phone = true;
      if (gp.buttons[this.bindings.gamepad.mapButton]?.pressed) map = true;
      if (gp.buttons[this.bindings.gamepad.pauseButton]?.pressed) pause = true;

      // Choice buttons (A, B, X, Y)
      this.bindings.gamepad.choiceButtons.forEach((btnIndex, idx) => {
        if (gp.buttons[btnIndex]?.pressed) choice = idx as 0 | 1 | 2 | 3;
      });
    }

    if (blocked) {
      this.state = {
        throttle: 0,
        brake: 0,
        steer: 0,
        horn: false,
        camera: false,
        phone,
        map,
        pause,
        choice,
      };
      return;
    }

    // Combine throttle, brake, steer across Keyboard, Gamepad, Touch, and Tilt
    const touchThrottle = this.throttleTouchIds.size > 0 || this.throttlePointerIds.size > 0 ? 1 : 0;
    const touchBrake = this.brakeTouchIds.size > 0 || this.brakePointerIds.size > 0 ? 1 : 0;
    const finalThrottle = Math.max(kbThrottle, gpThrottle, touchThrottle);
    const finalBrake = Math.max(kbBrake, gpBrake, touchBrake);

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
    return requestTiltPermission();
  }

  public detach(): void {
    for (const teardown of this.teardownFns) {
      teardown();
    }
    this.teardownFns = [];
    this.clearActiveInputs();
  }

  /** True if any of `codes` is held now, or was pressed since the last update. */
  private matchesPressed(codes: string[]): boolean {
    return this.matchesAny(codes) || codes.some((c) => this.tappedKeys.has(c));
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

  private steerFromZonePosition(px: number, startX: number, zone: Rect, viewportW: number): number {
    if (this.bindings.touchSteerMode === 'buttons') {
      const midX = zone.x + zone.width / 2;
      return px < midX ? -1.0 : 1.0;
    }
    const deltaX = px - startX;
    const maxDrag = Math.max(1, Math.min(120, viewportW * 0.15));
    return Math.max(-1.0, Math.min(1.0, deltaX / maxDrag));
  }

  private attachListeners(target: Window | HTMLElement): void {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTextInputTarget(e.target)) return;
      if (!this.isDrivingBlocked() && GAMEPLAY_PREVENT_DEFAULT_CODES.has(e.code)) {
        e.preventDefault?.();
      }
      this.activeKeys.add(e.code);
      this.tappedKeys.add(e.code);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.activeKeys.delete(e.code);
    };

    // A key or touch released while another window/tab has focus never reaches us,
    // so forget everything held when focus leaves or the document becomes hidden.
    const onBlur = () => {
      this.clearActiveInputs();
    };

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        this.clearActiveInputs();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
      document.addEventListener('visibilitychange', onVisibilityChange);
    }

    this.teardownFns.push(() => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      if (typeof document !== 'undefined' && typeof document.removeEventListener === 'function') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
    });

    // Touch, pointer, and device orientation event listeners
    if (typeof window !== 'undefined') {
      const onTouchStart = (e: TouchEvent) => {
        if (this.isDrivingBlocked() || isUiTarget(e.target)) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const layout: TouchLayout = touchLayout(w, h);

        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (!t) continue;
          if (isUiTarget((t as unknown as { target?: EventTarget | null }).target ?? null)) continue;
          const px = t.clientX;
          const py = t.clientY;

          if (pointInRect(px, py, layout.steerZone)) {
            this.touchSteerTouchId = t.identifier;
            this.touchSteerStartX = px;
            if (this.bindings.touchSteerMode === 'buttons') {
              this.touchSteer = this.steerFromZonePosition(px, px, layout.steerZone, w);
            }
          }

          if (pointInRect(px, py, layout.throttlePad)) {
            this.throttleTouchIds.add(t.identifier);
          }

          if (pointInRect(px, py, layout.brakePad)) {
            this.brakeTouchIds.add(t.identifier);
          }
        }
      };

      const onTouchMove = (e: TouchEvent) => {
        if (this.isDrivingBlocked()) {
          this.clearTouchInputs();
          return;
        }
        const w = window.innerWidth;
        const h = window.innerHeight;
        const layout: TouchLayout = touchLayout(w, h);

        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (!t) continue;
          const px = t.clientX;
          const py = t.clientY;

          if (this.throttleTouchIds.has(t.identifier) && !pointInRect(px, py, layout.throttlePad)) {
            this.throttleTouchIds.delete(t.identifier);
          }
          if (this.brakeTouchIds.has(t.identifier) && !pointInRect(px, py, layout.brakePad)) {
            this.brakeTouchIds.delete(t.identifier);
          }

          if (t.identifier === this.touchSteerTouchId) {
            if (this.bindings.touchSteerMode === 'buttons' && !pointInRect(px, py, layout.steerZone)) {
              this.touchSteer = 0;
            } else {
              this.touchSteer = this.steerFromZonePosition(px, this.touchSteerStartX, layout.steerZone, w);
            }
          }
        }
      };

      const onTouchEnd = (e: TouchEvent) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (!t) continue;
          this.throttleTouchIds.delete(t.identifier);
          this.brakeTouchIds.delete(t.identifier);
          if (t.identifier === this.touchSteerTouchId) {
            this.touchSteerTouchId = null;
            this.touchSteer = 0;
          }
        }
        if (e.touches.length === 0) {
          this.throttleTouchIds.clear();
          this.brakeTouchIds.clear();
          this.touchSteerTouchId = null;
          this.touchSteer = 0;
        }
      };

      const onPointerDown = (e: PointerEvent) => {
        if (e.pointerType === 'mouse') return;
        if (this.isDrivingBlocked() || isUiTarget(e.target)) return;
        const w = window.innerWidth;
        const h = window.innerHeight;
        const layout: TouchLayout = touchLayout(w, h);
        const px = e.clientX;
        const py = e.clientY;

        if (pointInRect(px, py, layout.steerZone)) {
          this.steerPointerId = e.pointerId;
          this.steerPointerStartX = px;
          if (this.bindings.touchSteerMode === 'buttons') {
            this.touchSteer = this.steerFromZonePosition(px, px, layout.steerZone, w);
          }
        }
        if (pointInRect(px, py, layout.throttlePad)) {
          this.throttlePointerIds.add(e.pointerId);
        }
        if (pointInRect(px, py, layout.brakePad)) {
          this.brakePointerIds.add(e.pointerId);
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        if (e.pointerType === 'mouse') return;
        if (this.isDrivingBlocked()) {
          this.clearTouchInputs();
          return;
        }
        const w = window.innerWidth;
        const h = window.innerHeight;
        const layout: TouchLayout = touchLayout(w, h);
        const px = e.clientX;
        const py = e.clientY;

        if (this.throttlePointerIds.has(e.pointerId) && !pointInRect(px, py, layout.throttlePad)) {
          this.throttlePointerIds.delete(e.pointerId);
        }
        if (this.brakePointerIds.has(e.pointerId) && !pointInRect(px, py, layout.brakePad)) {
          this.brakePointerIds.delete(e.pointerId);
        }
        if (e.pointerId === this.steerPointerId) {
          if (this.bindings.touchSteerMode === 'buttons' && !pointInRect(px, py, layout.steerZone)) {
            this.touchSteer = 0;
          } else {
            this.touchSteer = this.steerFromZonePosition(px, this.steerPointerStartX, layout.steerZone, w);
          }
        }
      };

      const onPointerEnd = (e: PointerEvent) => {
        if (e.pointerType === 'mouse') return;
        this.throttlePointerIds.delete(e.pointerId);
        this.brakePointerIds.delete(e.pointerId);
        if (e.pointerId === this.steerPointerId) {
          this.steerPointerId = null;
          this.touchSteer = 0;
        }
      };

      const onDeviceOrientation = (e: DeviceOrientationEvent) => {
        if (!this.bindings.tiltEnabled) return;
        let tiltDeg: number | null = null;
        if (isLandscapeViewport() && typeof e.beta === 'number') {
          tiltDeg = isLandscapeSecondary() ? -e.beta : e.beta;
        } else if (typeof e.gamma === 'number') {
          tiltDeg = e.gamma;
        }
        if (tiltDeg === null) return;
        // Normalize ~30 degrees tilt to full lock
        this.tiltSteer = Math.max(-1.0, Math.min(1.0, tiltDeg / 30));
      };

      target.addEventListener('touchstart', onTouchStart as EventListener, { passive: true });
      target.addEventListener('touchmove', onTouchMove as EventListener, { passive: true });
      target.addEventListener('touchend', onTouchEnd as EventListener, { passive: true });
      target.addEventListener('touchcancel', onTouchEnd as EventListener, { passive: true });
      target.addEventListener('pointerdown', onPointerDown as EventListener, { passive: true });
      target.addEventListener('pointermove', onPointerMove as EventListener, { passive: true });
      target.addEventListener('pointerup', onPointerEnd as EventListener, { passive: true });
      target.addEventListener('pointercancel', onPointerEnd as EventListener, { passive: true });
      window.addEventListener('deviceorientation', onDeviceOrientation);

      this.teardownFns.push(() => {
        target.removeEventListener('touchstart', onTouchStart as EventListener);
        target.removeEventListener('touchmove', onTouchMove as EventListener);
        target.removeEventListener('touchend', onTouchEnd as EventListener);
        target.removeEventListener('touchcancel', onTouchEnd as EventListener);
        target.removeEventListener('pointerdown', onPointerDown as EventListener);
        target.removeEventListener('pointermove', onPointerMove as EventListener);
        target.removeEventListener('pointerup', onPointerEnd as EventListener);
        target.removeEventListener('pointercancel', onPointerEnd as EventListener);
        window.removeEventListener('deviceorientation', onDeviceOrientation);
      });
    }
  }
}
