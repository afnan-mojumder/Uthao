import { describe, it, expect } from 'vitest';
import { generateProfile, getArchetypeDefinition } from '../../../src/sim/passenger/profiles';
import { Rng } from '../../../src/core/rng';
import type { ArchetypeId } from '../../../src/core/types';
import { BALANCE } from '../../../src/config/balance';
import { offAppPayout, offAppNonPayChance, disputeChance, isDisputed } from '../../../src/sim/economy/offApp';
import enDialogue from '../../../data/dialogue/en/dialogue.json';
import bnDialogue from '../../../data/dialogue/bn/dialogue.json';

const NEW_ARCHETYPES: ArchetypeId[] = ['student', 'office', 'urgent', 'traveler', 'unreliable', 'family'];
const PHASES = ['greeting', 'offer', 'counter', 'accept', 'reject', 'small_talk', 'drop_off'] as const;

function linesFor(dict: Record<string, string>, arch: ArchetypeId, phase: string): number {
  const prefix = `dialogue.pool.${arch}.${phase}.`;
  return Object.keys(dict).filter((k) => k.startsWith(prefix)).length;
}

describe('T8.6 new archetypes', () => {
  it('each new archetype is defined and generates a profile of that archetype', () => {
    for (const a of NEW_ARCHETYPES) {
      expect(() => getArchetypeDefinition(a)).not.toThrow();
      expect(generateProfile(a, new Rng(1)).archetype).toBe(a);
    }
  });

  it('each new archetype has at least 15 lines in both languages, and every phase has one', () => {
    for (const a of NEW_ARCHETYPES) {
      for (const dict of [enDialogue as Record<string, string>, bnDialogue as Record<string, string>]) {
        let total = 0;
        for (const ph of PHASES) {
          const n = linesFor(dict, a, ph);
          expect(n, `${a}/${ph}`).toBeGreaterThanOrEqual(1);
          total += n;
        }
        expect(total, `${a} total lines`).toBeGreaterThanOrEqual(15);
      }
    }
  });
});

describe('T8.6 off-app trade-off', () => {
  it('non-payment chance rises as payment reliability falls, and is capped', () => {
    expect(offAppNonPayChance(1)).toBe(0);
    expect(offAppNonPayChance(0.5)).toBeGreaterThan(offAppNonPayChance(0.9));
    expect(offAppNonPayChance(0)).toBeLessThanOrEqual(BALANCE.OFF_APP.nonPayMaxChance);
  });

  it('a non-payment roll pays nothing and reports unpaid', () => {
    expect(offAppPayout(100, 0, 0)).toEqual({ paid: 0, unpaid: true });
    expect(offAppPayout(100, 1, 0.99)).toEqual({ paid: 100, unpaid: false });
  });

  it('off-app is a trade-off: mean net within 10% of app, worst case worse (200 seeds)', () => {
    const archetypes: ArchetypeId[] = ['bargainer', 'commuter', 'careful', 'regular', 'risky', ...NEW_ARCHETYPES];
    const app: number[] = [];
    const off: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const rng = new Rng(seed + 1);
      const profile = generateProfile(archetypes[seed % archetypes.length]!, rng);
      const fare = 80 + (seed % 7) * 10;
      app.push(fare - fare * BALANCE.COMMISSION_APP);
      off.push(offAppPayout(fare, profile.paymentReliability, rng.next()).paid);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(off)).toBeLessThanOrEqual(mean(app) * 1.1);
    expect(mean(off)).toBeGreaterThanOrEqual(mean(app) * 0.9);
    expect(Math.min(...off)).toBeLessThan(Math.min(...app));
  });
});

describe('T8.6 unreliable passengers dispute', () => {
  it('only unreliable passengers can dispute, and reliability lowers the chance', () => {
    expect(disputeChance('unreliable', 0.3)).toBeGreaterThan(0);
    expect(disputeChance('commuter', 0)).toBe(0);
    expect(disputeChance('unreliable', 0.3)).toBeGreaterThan(disputeChance('unreliable', 0.9));
  });

  it('a dispute roll below the chance is a dispute, and above it is not', () => {
    const chance = disputeChance('unreliable', 0.3);
    expect(isDisputed('unreliable', 0.3, chance / 2)).toBe(true);
    expect(isDisputed('unreliable', 0.3, 0.999)).toBe(false);
    expect(isDisputed('commuter', 0.3, 0)).toBe(false);
  });
});
