export interface InputState {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1 (negative left, positive right)
  horn: boolean;
  camera: boolean;
  phone: boolean;
  map: boolean;
  pause: boolean;
  choice: 0 | 1 | 2 | 3 | null;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TouchLayout {
  steerZone: Rect;
  throttlePad: Rect;
  brakePad: Rect;
  iconsZone: Rect;
}

export interface KeyboardBindings {
  throttle: string[];
  brake: string[];
  steerLeft: string[];
  steerRight: string[];
  horn: string[];
  camera: string[];
  phone: string[];
  map: string[];
  pause: string[];
  choice0: string[];
  choice1: string[];
  choice2: string[];
  choice3: string[];
}

export interface GamepadBindings {
  throttleAxisOrButton: number; // RT = 7
  brakeAxisOrButton: number; // LT = 6
  steerAxis: number; // Left Stick X = 0
  hornButton: number;
  cameraButton: number;
  phoneButton: number;
  mapButton: number;
  pauseButton: number;
  choiceButtons: [number, number, number, number]; // [A=0, B=1, X=2, Y=3]
}

export interface InputBindings {
  keyboard: KeyboardBindings;
  gamepad: GamepadBindings;
  tiltEnabled: boolean;
  tiltSensitivity: number;
}
