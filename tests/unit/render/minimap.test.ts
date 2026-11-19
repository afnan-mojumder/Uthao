import { describe, it, expect } from 'vitest';
import {
  mapRotationFor,
  arrowRotationFor,
  northCompassAngleFor,
  Minimap,
} from '../../../src/render/minimap';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';

// The bike moves along (sin heading, cos heading) in world x/z. Canvas y grows
// downward, and "up" on the map is (0, -1). The map must turn so that forward
// points up. Before the fix the map turned the wrong way and was 90 degrees off.
function rotate(v: [number, number], angle: number): [number, number] {
  const [x, y] = v;
  return [x * Math.cos(angle) - y * Math.sin(angle), x * Math.sin(angle) + y * Math.cos(angle)];
}

describe('minimap turns the way the bike faces', () => {
  for (const heading of [0, 0.7, Math.PI / 2, Math.PI, 2.5, -1.2]) {
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

    it(`N compass marker points north in world-space when rotating at heading ${heading.toFixed(2)}`, () => {
      const worldNorthOnMap = rotate([0, -1], mapRotationFor(heading));
      const compassAngle = northCompassAngleFor(heading, true);
      const compassDir = rotate([0, -1], compassAngle);

      expect(compassDir[0]).toBeCloseTo(worldNorthOnMap[0], 9);
      expect(compassDir[1]).toBeCloseTo(worldNorthOnMap[1], 9);
      expect(northCompassAngleFor(heading, false)).toBe(0);
    });
  }

  it('draws N compass marker at the rotated world-north position in Minimap.update', () => {
    const calls: { text: string; x: number; y: number }[] = [];
    const mockCtx = {
      save: () => {},
      restore: () => {},
      clearRect: () => {},
      beginPath: () => {},
      arc: () => {},
      clip: () => {},
      fillRect: () => {},
      stroke: () => {},
      translate: () => {},
      rotate: () => {},
      moveTo: () => {},
      lineTo: () => {},
      closePath: () => {},
      fill: () => {},
      fillText: (text: string, x: number, y: number) => {
        calls.push({ text, x, y });
      },
    };
    const origDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document?: unknown }).document = {
      createElement: () => ({
        style: {},
        getContext: () => mockCtx,
      }),
    };
    try {
      const net = RoadNetwork.fromDistricts([]);
      const minimap = new Minimap(net, { size: 160, rotateWithPlayer: true });
      const center = 80;

      // Facing North (heading = PI, world North is -z): N must sit at top (80, < 80)
      calls.length = 0;
      minimap.update({ x: 0, z: 0, heading: Math.PI });
      const northCall = calls.find((c) => c.text === 'N')!;
      expect(northCall.x).toBeCloseTo(center, 5);
      expect(northCall.y).toBeLessThan(center);

      // Facing East (heading = PI/2, world +x): North (-z) is to the left (< 80, 80)
      calls.length = 0;
      minimap.update({ x: 0, z: 0, heading: Math.PI / 2 });
      const eastCall = calls.find((c) => c.text === 'N')!;
      expect(eastCall.x).toBeLessThan(center);
      expect(eastCall.y).toBeCloseTo(center, 5);
    } finally {
      if (origDoc === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = origDoc;
      }
    }
  });
});
