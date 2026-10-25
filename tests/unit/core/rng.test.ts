import { describe, it, expect } from 'vitest';
import { Rng, hashSeed } from '../../../src/core/rng';

describe('Rng', () => {
  it('rng is deterministic for a seed', () => {
    const rng1 = new Rng(42);
    const rng2 = new Rng(42);
    const seq1 = Array.from({ length: 5 }, () => rng1.next());
    const seq2 = Array.from({ length: 5 }, () => rng2.next());
    expect(seq1).toEqual(seq2);
  });

  it('fork labels diverge', () => {
    const root = new Rng(100);
    const forkA = root.fork('route');
    const forkB = root.fork('passenger');
    expect(forkA.next()).not.toEqual(forkB.next());
  });

  it('int stays in bounds over 10k draws', () => {
    const rng = new Rng(12345);
    const min = 5;
    const max = 15;
    for (let i = 0; i < 10000; i++) {
      const val = rng.int(min, max);
      expect(val).toBeGreaterThanOrEqual(min);
      expect(val).toBeLessThanOrEqual(max);
      expect(Number.isInteger(val)).toBe(true);
    }
  });

  it('hashSeed produces consistent 32-bit unsigned integer', () => {
    const h1 = hashSeed('seed', 42, 'test');
    const h2 = hashSeed('seed', 42, 'test');
    expect(h1).toBe(h2);
    expect(h1).toBeGreaterThanOrEqual(0);
  });

  it('pick selects element from array', () => {
    const rng = new Rng(99);
    const arr = ['a', 'b', 'c'];
    expect(arr).toContain(rng.pick(arr));
  });

  it('chance respects probability', () => {
    const rng = new Rng(77);
    expect(rng.chance(1)).toBe(true);
    expect(rng.chance(0)).toBe(false);
  });
});
