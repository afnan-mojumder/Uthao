import type { InputBindings } from './types';

export const SETTINGS_STORAGE_KEY = 'uthao_input_bindings';

export const DEFAULT_BINDINGS: InputBindings = {
  keyboard: {
    throttle: ['KeyW', 'ArrowUp'],
    brake: ['KeyS', 'ArrowDown', 'Space'],
    steerLeft: ['KeyA', 'ArrowLeft'],
    steerRight: ['KeyD', 'ArrowRight'],
    horn: ['KeyH'],
    camera: ['KeyC'],
    phone: ['Tab'],
    map: ['KeyM'],
    pause: ['Escape'],
    choice0: ['Digit1', 'Numpad1'],
    choice1: ['Digit2', 'Numpad2'],
    choice2: ['Digit3', 'Numpad3'],
    choice3: ['Digit4', 'Numpad4'],
  },
  gamepad: {
    throttleAxisOrButton: 7, // RT
    brakeAxisOrButton: 6, // LT
    steerAxis: 0, // Left Stick X
    hornButton: 10, // R3 / Thumbstick
    cameraButton: 8, // Select / View
    phoneButton: 4, // LB
    mapButton: 5, // RB
    pauseButton: 9, // Start
    choiceButtons: [0, 1, 2, 3], // A, B, X, Y
  },
  tiltEnabled: false,
  tiltSensitivity: 1.0,
};

export function loadBindings(storage?: Storage): InputBindings {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return { ...DEFAULT_BINDINGS };
    const raw = s.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BINDINGS };
    const parsed = JSON.parse(raw);
    return {
      keyboard: { ...DEFAULT_BINDINGS.keyboard, ...parsed.keyboard },
      gamepad: { ...DEFAULT_BINDINGS.gamepad, ...parsed.gamepad },
      tiltEnabled: parsed.tiltEnabled ?? DEFAULT_BINDINGS.tiltEnabled,
      tiltSensitivity: parsed.tiltSensitivity ?? DEFAULT_BINDINGS.tiltSensitivity,
    };
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

export function saveBindings(bindings: InputBindings, storage?: Storage): void {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return;
    s.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // Gracefully ignore storage quota / permissions errors
  }
}
