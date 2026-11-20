import type { GamepadBindings, InputBindings, KeyboardBindings } from './types';

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
    garage: ['KeyG'],
    journal: ['KeyJ'],
    uiSheet: ['KeyU'],
    karma: ['KeyK'],
    mute: ['KeyN'],
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

export type RebindableKeyboardAction = Exclude<
  keyof KeyboardBindings,
  'choice0' | 'choice1' | 'choice2' | 'choice3' | 'pause'
>;

export type RebindableGamepadAction =
  | 'throttleAxisOrButton'
  | 'brakeAxisOrButton'
  | 'hornButton'
  | 'cameraButton'
  | 'phoneButton'
  | 'mapButton'
  | 'pauseButton';

export const RESERVED_KEYBOARD_CODES = new Set([
  'Escape',
  'Enter',
  'NumpadEnter',
  'F5',
  'F11',
  'F12',
  'MetaLeft',
  'MetaRight',
  'ContextMenu',
  'ControlLeft',
  'ControlRight',
  'AltLeft',
  'AltRight',
  'ShiftLeft',
  'ShiftRight',
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Numpad1',
  'Numpad2',
  'Numpad3',
  'Numpad4',
]);

export type RebindResult =
  | { ok: true; bindings: InputBindings }
  | { ok: false; reason: 'reserved' | 'conflict'; conflictingAction?: string };

export function rebindKeyboardAction(
  bindings: InputBindings,
  action: RebindableKeyboardAction,
  code: string
): RebindResult {
  if (RESERVED_KEYBOARD_CODES.has(code)) {
    return { ok: false, reason: 'reserved' };
  }
  const kb = bindings.keyboard;
  for (const [key, codes] of Object.entries(kb) as Array<[keyof KeyboardBindings, string[]]>) {
    if (key === action) continue;
    if (codes.includes(code)) {
      return { ok: false, reason: 'conflict', conflictingAction: key };
    }
  }
  return {
    ok: true,
    bindings: {
      ...bindings,
      keyboard: {
        ...kb,
        [action]: [code],
      },
    },
  };
}

export function rebindGamepadAction(
  bindings: InputBindings,
  action: RebindableGamepadAction,
  buttonIndex: number
): RebindResult {
  const gp = bindings.gamepad;
  if (gp.choiceButtons.includes(buttonIndex)) {
    return { ok: false, reason: 'reserved' };
  }
  const checks: Array<[RebindableGamepadAction, number]> = [
    ['throttleAxisOrButton', gp.throttleAxisOrButton],
    ['brakeAxisOrButton', gp.brakeAxisOrButton],
    ['hornButton', gp.hornButton],
    ['cameraButton', gp.cameraButton],
    ['phoneButton', gp.phoneButton],
    ['mapButton', gp.mapButton],
    ['pauseButton', gp.pauseButton],
  ];
  for (const [key, val] of checks) {
    if (key === action) continue;
    if (val === buttonIndex) {
      return { ok: false, reason: 'conflict', conflictingAction: key };
    }
  }
  return {
    ok: true,
    bindings: {
      ...bindings,
      gamepad: {
        ...gp,
        [action]: buttonIndex,
      },
    },
  };
}

export function cloneDefaultBindings(): InputBindings {
  return {
    keyboard: {
      throttle: [...DEFAULT_BINDINGS.keyboard.throttle],
      brake: [...DEFAULT_BINDINGS.keyboard.brake],
      steerLeft: [...DEFAULT_BINDINGS.keyboard.steerLeft],
      steerRight: [...DEFAULT_BINDINGS.keyboard.steerRight],
      horn: [...DEFAULT_BINDINGS.keyboard.horn],
      camera: [...DEFAULT_BINDINGS.keyboard.camera],
      phone: [...DEFAULT_BINDINGS.keyboard.phone],
      map: [...DEFAULT_BINDINGS.keyboard.map],
      pause: [...DEFAULT_BINDINGS.keyboard.pause],
      choice0: [...DEFAULT_BINDINGS.keyboard.choice0],
      choice1: [...DEFAULT_BINDINGS.keyboard.choice1],
      choice2: [...DEFAULT_BINDINGS.keyboard.choice2],
      choice3: [...DEFAULT_BINDINGS.keyboard.choice3],
      garage: [...DEFAULT_BINDINGS.keyboard.garage],
      journal: [...DEFAULT_BINDINGS.keyboard.journal],
      uiSheet: [...DEFAULT_BINDINGS.keyboard.uiSheet],
      karma: [...DEFAULT_BINDINGS.keyboard.karma],
      mute: [...DEFAULT_BINDINGS.keyboard.mute],
    },
    gamepad: {
      ...DEFAULT_BINDINGS.gamepad,
      choiceButtons: [...DEFAULT_BINDINGS.gamepad.choiceButtons] as GamepadBindings['choiceButtons'],
    },
    tiltEnabled: DEFAULT_BINDINGS.tiltEnabled,
    tiltSensitivity: DEFAULT_BINDINGS.tiltSensitivity,
  };
}

export function loadBindings(storage?: Storage): InputBindings {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!s) return cloneDefaultBindings();
    const raw = s.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return cloneDefaultBindings();
    const parsed = JSON.parse(raw);
    return {
      keyboard: { ...cloneDefaultBindings().keyboard, ...parsed.keyboard },
      gamepad: { ...cloneDefaultBindings().gamepad, ...parsed.gamepad },
      tiltEnabled: parsed.tiltEnabled ?? DEFAULT_BINDINGS.tiltEnabled,
      tiltSensitivity: parsed.tiltSensitivity ?? DEFAULT_BINDINGS.tiltSensitivity,
    };
  } catch {
    return cloneDefaultBindings();
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
