import type { Rect, TouchLayout } from './types';

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Returns the layout rectangles for touch controls.
 * - left 35% of the screen is a horizontal steer slider (relative drag)
 * - right-bottom has big throttle and brake pads
 * - top-right holds horn/phone/camera/pause icons
 */
export function touchLayout(w: number, h: number): TouchLayout {
  return {
    steerZone: {
      x: 0,
      y: 0,
      width: w * 0.35,
      height: h,
    },
    throttlePad: {
      x: w * 0.8,
      y: h * 0.65,
      width: w * 0.18,
      height: h * 0.3,
    },
    brakePad: {
      x: w * 0.6,
      y: h * 0.7,
      width: w * 0.18,
      height: h * 0.25,
    },
    iconsZone: {
      x: w * 0.65,
      y: h * 0.02,
      width: w * 0.33,
      height: h * 0.18,
    },
  };
}

/**
 * Returns the layout rectangle for the dialogue / decision choice-card area.
 * Placed in the center-left area safely between steering and vehicle controls.
 */
export function choiceCardRect(w: number, h: number): Rect {
  return {
    x: w * 0.37,
    y: h * 0.22,
    width: w * 0.21,
    height: h * 0.45,
  };
}
