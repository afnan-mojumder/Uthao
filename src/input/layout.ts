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
 * - bottom-left is a compact steering pad clear of top-left minimap & choice card
 * - bottom-right has brake and throttle pedals clear of the speedometer/fuel pod
 * - top-center-right holds the compact 44px action strip clear of earnings & clock
 */
export function touchLayout(w: number, h: number): TouchLayout {
  return {
    steerZone: {
      x: w * 0.02,
      y: h * 0.5,
      width: w * 0.24,
      height: h * 0.46,
    },
    throttlePad: {
      x: w * 0.86,
      y: h * 0.6,
      width: w * 0.12,
      height: h * 0.36,
    },
    brakePad: {
      x: w * 0.74,
      y: h * 0.66,
      width: w * 0.11,
      height: h * 0.3,
    },
    iconsZone: {
      x: w * 0.17,
      y: h * 0.02,
      width: w * 0.59,
      height: h * 0.14,
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
