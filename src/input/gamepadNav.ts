// Pure gamepad helpers for menu navigation. No DOM access here, so the
// edge detection and focus geometry can be unit tested directly.

export type NavDir = 'up' | 'down' | 'left' | 'right';

/** Standard gamepad mapping: D-pad buttons 12 (up), 13 (down), 14 (left), 15 (right). */
const DPAD_BUTTONS: Array<[number, NavDir]> = [
  [12, 'up'],
  [13, 'down'],
  [14, 'left'],
  [15, 'right'],
];

const STICK_THRESHOLD = 0.6;
const INITIAL_REPEAT_DELAY_MS = 380;
const REPEAT_INTERVAL_MS = 120;

export interface PadSnapshot {
  /** Indexes of buttons that went down since the previous poll. */
  pressed: number[];
  /** A menu direction that just started or repeated (D-pad or left stick), or null. */
  dir: NavDir | null;
}

/** Turns held gamepad state into edges, with hold-repeat for navigation directions. */
export class GamepadEdges {
  private prevButtons = new Set<number>();
  private prevDir: NavDir | null = null;
  private holdStartMs = 0;
  private lastRepeatMs = 0;

  poll(pad: Gamepad | null, nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now()): PadSnapshot {
    if (!pad) {
      this.prevButtons.clear();
      this.prevDir = null;
      this.holdStartMs = 0;
      this.lastRepeatMs = 0;
      return { pressed: [], dir: null };
    }

    const down = new Set<number>();
    pad.buttons.forEach((b, i) => {
      if (b && (b.pressed || b.value > 0.5)) down.add(i);
    });
    const pressed: number[] = [];
    for (const i of down) {
      if (!this.prevButtons.has(i)) pressed.push(i);
    }
    this.prevButtons = down;

    let dir: NavDir | null = null;
    for (const [btn, d] of DPAD_BUTTONS) {
      if (pad.buttons[btn]?.pressed) {
        dir = d;
        break;
      }
    }
    if (!dir) {
      const x = pad.axes[0] ?? 0;
      const y = pad.axes[1] ?? 0;
      if (Math.abs(y) >= Math.abs(x) && Math.abs(y) > STICK_THRESHOLD) {
        dir = y < 0 ? 'up' : 'down';
      } else if (Math.abs(x) > STICK_THRESHOLD) {
        dir = x < 0 ? 'left' : 'right';
      }
    }

    let emittedDir: NavDir | null = null;
    if (dir === null) {
      this.holdStartMs = 0;
      this.lastRepeatMs = 0;
    } else if (dir !== this.prevDir) {
      emittedDir = dir;
      this.holdStartMs = nowMs;
      this.lastRepeatMs = nowMs;
    } else if (
      nowMs - this.holdStartMs >= INITIAL_REPEAT_DELAY_MS &&
      nowMs - this.lastRepeatMs >= REPEAT_INTERVAL_MS
    ) {
      emittedDir = dir;
      this.lastRepeatMs = nowMs;
    }
    this.prevDir = dir;

    return { pressed, dir: emittedDir };
  }
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Picks the candidate that sits in direction `dir` from `from`, favouring
 * the nearest one on the main axis and penalising sideways drift. Returns
 * the candidate index, or -1 when nothing lies that way.
 */
export function pickNeighbor(from: Box, candidates: Box[], dir: NavDir): number {
  const fx = from.x + from.w / 2;
  const fy = from.y + from.h / 2;
  let best = -1;
  let bestScore = Infinity;

  candidates.forEach((c, i) => {
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    const dx = cx - fx;
    const dy = cy - fy;
    const main = dir === 'left' ? -dx : dir === 'right' ? dx : dir === 'up' ? -dy : dy;
    if (main <= 1) return; // must lie strictly ahead
    const side = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
    const score = main + side * 2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });

  return best;
}
