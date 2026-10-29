export function hashSeed(...parts: (string | number)[]): number {
  let hash = 2166136261;
  for (const part of parts) {
    const str = String(part);
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
  }
  return hash >>> 0;
}

export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = (seed >>> 0) || 1;
  }

  /** Returns internal RNG state for save serialization */
  getState(): number {
    return this.s;
  }

  /** Restores internal RNG state from save serialization */
  setState(state: number): void {
    this.s = (state >>> 0) || 1;
  }

  /** Returns pseudo-random float in [0, 1) using Mulberry32 */
  next(): number {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(a: number, b: number): number {
    return a + this.next() * (b - a);
  }

  int(a: number, b: number): number {
    const min = Math.ceil(a);
    const max = Math.floor(b);
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(arr: T[]): T {
    if (arr.length === 0) {
      throw new Error('Cannot pick from empty array');
    }
    const idx = Math.floor(this.next() * arr.length);
    const item = arr[idx];
    if (item === undefined) {
      throw new Error('Index out of bounds');
    }
    return item;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  fork(label: string): Rng {
    const derived = hashSeed(this.s, label);
    return new Rng(derived);
  }
}
