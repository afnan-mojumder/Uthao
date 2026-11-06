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

export interface PadSnapshot {
  /** Indexes of buttons that went down since the previous poll. */
  pressed: number[];
  /** A menu direction that just started (D-pad or left stick), or null. */
  dir: NavDir | null;
}

/** Turns held gamepad state into edges, so a held button fires once. */
export class GamepadEdges {
  private prevButtons = new Set<number>();
  private prevDir: NavDir | null = null;

  poll(pad: Gamepad | null): PadSnapshot {
    if (!pad) {
      this.prevButtons.clear();
      this.prevDir = null;
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

    // A held direction fires once, like a button; the stick must return to
    // centre before it can fire again.
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
    const newDir = dir !== null && dir !== this.prevDir ? dir : null;
    this.prevDir = dir;

    return { pressed, dir: newDir };
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
