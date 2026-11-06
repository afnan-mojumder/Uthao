import { describe, it, expect } from 'vitest';
import { GamepadEdges, pickNeighbor, type Box } from '../../../src/input/gamepadNav';

function pad(opts: { buttons?: number[]; dpad?: number[]; axes?: [number, number] } = {}): Gamepad {
  const buttons = Array.from({ length: 17 }, (_, i) => {
    const down = (opts.buttons ?? []).includes(i) || (opts.dpad ?? []).includes(i);
    return { pressed: down, value: down ? 1 : 0, touched: down };
  });
  return { buttons, axes: opts.axes ?? [0, 0] } as unknown as Gamepad;
}

describe('GamepadEdges', () => {
  it('reports a button once on press and never while it stays held', () => {
    // Arrange
    const edges = new GamepadEdges();

    // Act
    const first = edges.poll(pad({ buttons: [0] }));
    const held = edges.poll(pad({ buttons: [0] }));
    const released = edges.poll(pad());

    // Assert
    expect(first.pressed).toEqual([0]);
    expect(held.pressed).toEqual([]);
    expect(released.pressed).toEqual([]);
  });

  it('reports a D-pad direction once while it is held', () => {
    // Arrange
    const edges = new GamepadEdges();

    // Act
    const down = edges.poll(pad({ dpad: [13] }));
    const stillDown = edges.poll(pad({ dpad: [13] }));

    // Assert
    expect(down.dir).toBe('down');
    expect(stillDown.dir).toBeNull();
  });

  it('turns a left stick push into a direction and needs a return to centre', () => {
    // Arrange
    const edges = new GamepadEdges();

    // Act
    const up = edges.poll(pad({ axes: [0, -0.9] }));
    const holdUp = edges.poll(pad({ axes: [0, -0.9] }));
    const centre = edges.poll(pad({ axes: [0, 0] }));
    const upAgain = edges.poll(pad({ axes: [0, -0.9] }));

    // Assert
    expect(up.dir).toBe('up');
    expect(holdUp.dir).toBeNull();
    expect(centre.dir).toBeNull();
    expect(upAgain.dir).toBe('up');
  });

  it('ignores stick drift inside the deadzone', () => {
    // Arrange
    const edges = new GamepadEdges();

    // Act
    const drift = edges.poll(pad({ axes: [0.2, -0.3] }));

    // Assert
    expect(drift.dir).toBeNull();
  });

  it('clears held state when the pad disconnects', () => {
    // Arrange
    const edges = new GamepadEdges();
    edges.poll(pad({ buttons: [0] }));

    // Act
    edges.poll(null);
    const reconnected = edges.poll(pad({ buttons: [0] }));

    // Assert
    expect(reconnected.pressed).toEqual([0]);
  });
});

describe('pickNeighbor', () => {
  const box = (x: number, y: number): Box => ({ x, y, w: 100, h: 40 });

  it('moves to the nearest control in the pressed direction', () => {
    // Arrange: three buttons stacked vertically, focus on the top one
    const from = box(0, 0);
    const candidates = [box(0, 0), box(0, 60), box(0, 120)];

    // Act
    const down = pickNeighbor(from, candidates, 'down');

    // Assert
    expect(down).toBe(1);
  });

  it('prefers a control on the same row when moving sideways', () => {
    // Arrange: focus on the left of a row, one control far below-right
    const from = box(0, 0);
    const candidates = [box(120, 0), box(60, 200)];

    // Act
    const right = pickNeighbor(from, candidates, 'right');

    // Assert
    expect(right).toBe(0);
  });

  it('returns -1 when nothing lies in the pressed direction', () => {
    // Arrange: focus on the bottom button, nothing below it
    const from = box(0, 120);
    const candidates = [box(0, 0), box(0, 60)];

    // Act
    const down = pickNeighbor(from, candidates, 'down');

    // Assert
    expect(down).toBe(-1);
  });
});
