import { describe, it, expect } from 'vitest';
import { mapLayout } from '../../../src/ui/map/mapLayout';

/** The chip row's height in CSS pixels, pinned here so the test does not follow the code. */
const CHIP_ROW_CSS_PX = 84;

describe('map layout keeps the district clear of the chip row (audit: marker hidden under chips)', () => {
  const width = 800;
  const height = 500;
  const bounds = { minX: -100, minZ: -100, spanX: 200, spanZ: 200 };

  function toScreen(x: number, z: number, dpr: number) {
    const { scale, offsetX, offsetZ } = mapLayout(width, height, dpr, bounds, 1);
    return { x: x * scale + offsetX, y: z * scale + offsetZ };
  }

  it('the northernmost point sits below the chip row at 1x and 2x', () => {
    for (const dpr of [1, 2]) {
      const top = toScreen(0, -100, dpr);
      expect(top.y).toBeGreaterThanOrEqual(CHIP_ROW_CSS_PX * dpr);
    }
  });

  it('every corner of the district stays on the canvas', () => {
    const dpr = 1;
    for (const [x, z] of [[-100, -100], [100, -100], [-100, 100], [100, 100]] as const) {
      const p = toScreen(x, z, dpr);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(width);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(height);
    }
  });
});
