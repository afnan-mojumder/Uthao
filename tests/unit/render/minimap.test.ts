import { describe, it, expect } from 'vitest';
import { mapRotationFor, arrowRotationFor } from '../../../src/render/minimap';

// The bike moves along (sin heading, cos heading) in world x/z. Canvas y grows
// downward, and "up" on the map is (0, -1). The map must turn so that forward
// points up. Before the fix the map turned the wrong way and was 90 degrees off.
function rotate(v: [number, number], angle: number): [number, number] {
  const [x, y] = v;
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
}

describe('minimap turns the way the bike faces', () => {
  for (const heading of [0, 0.7, Math.PI / 2, 2.5, -1.2]) {
    it(`with the bike at heading ${heading.toFixed(2)}, the map shows forward as up`, () => {
      const forward: [number, number] = [Math.sin(heading), Math.cos(heading)];

      const onMap = rotate(forward, mapRotationFor(heading));

      expect(onMap[0]).toBeCloseTo(0, 9);
      expect(onMap[1]).toBeCloseTo(-1, 9);
    });

    it(`in north-up mode, the arrow points along the bike at heading ${heading.toFixed(2)}`, () => {
      const forward: [number, number] = [Math.sin(heading), Math.cos(heading)];

      const arrowTip = rotate([0, -1], arrowRotationFor(heading));

      expect(arrowTip[0]).toBeCloseTo(forward[0], 9);
      expect(arrowTip[1]).toBeCloseTo(forward[1], 9);
    });
  }
});
