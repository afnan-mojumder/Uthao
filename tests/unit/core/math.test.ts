import { describe, it, expect } from 'vitest';
import { clamp, lerp, angleDiff, degToRad, radToDeg, distance2d } from '../../../src/core/math';

describe('core math', () => {
  it('clamp restricts value to bounds', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('lerp interpolates between a and b', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('angle conversions match', () => {
    expect(degToRad(180)).toBeCloseTo(Math.PI);
    expect(radToDeg(Math.PI)).toBeCloseTo(180);
  });

  it('angleDiff calculates shortest signed difference', () => {
    expect(angleDiff(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
    expect(angleDiff(Math.PI / 2, 0)).toBeCloseTo(-Math.PI / 2);
  });

  it('distance2d calculates euclidean distance', () => {
    expect(distance2d(0, 0, 3, 4)).toBe(5);
  });
});
