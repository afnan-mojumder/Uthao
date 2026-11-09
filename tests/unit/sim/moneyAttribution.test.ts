import { describe, it, expect } from 'vitest';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import { tipAmountFor, settledFare } from '../../../src/sim/ride/RideManager';
import { BALANCE } from '../../../src/config/balance';

describe('tips are paid from the rating (audit: tips hard-coded to zero)', () => {
  it('a 5-star rider tips on a good share of trips, within the clamped amounts', () => {
    const ids = Array.from({ length: 300 }, (_, i) => `req_${i}`);
    const tips = ids.map((id) => tipAmountFor(id, 120, 5));
    const paying = tips.filter((t) => t > 0);

    // Chance at rating 5 is 0.4: expect roughly 120 of 300 to tip.
    expect(paying.length / ids.length).toBeGreaterThan(0.25);
    expect(paying.length / ids.length).toBeLessThan(0.55);
    for (const t of paying) {
      expect(t).toBeGreaterThanOrEqual(BALANCE.TIP.minAmount);
      expect(t).toBeLessThanOrEqual(BALANCE.TIP.maxAmount);
    }
  });

  it('a 1-star rider never tips', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `low_${i}`);
    expect(ids.every((id) => tipAmountFor(id, 120, 1) === 0)).toBe(true);
  });

  it('is replayable: the same request gives the same tip', () => {
    expect(tipAmountFor('req_fixed', 150, 5)).toBe(tipAmountFor('req_fixed', 150, 5));
  });
});

describe('disputed rides settle part of the fare (audit: dispute only changed the label)', () => {
  it('keeps the configured share of a disputed fare', () => {
    expect(settledFare(120, true)).toBe(Math.round(120 * BALANCE.DISPUTE.fareKept));
    expect(settledFare(120, true)).toBeLessThan(120);
  });

  it('settles an undisputed fare in full', () => {
    expect(settledFare(120, false)).toBe(120);
  });
});

describe('encounter money is event income, not trip income (audit)', () => {
  it('adds to cash without counting toward daily revenue', () => {
    const econ = new EconomyManager(new EventBus<GameEvents>(), { cash: 100 });
    const before = econ.dailyRevenue;

    econ.post({ id: 'tx_evt_1', day: 1, minute: 600, kind: 'event', amount: 120 });

    expect(econ.cash).toBe(220);
    expect(econ.dailyRevenue).toBe(before);
  });

  it('a trip fare still counts toward daily revenue', () => {
    const econ = new EconomyManager(new EventBus<GameEvents>(), { cash: 100 });
    const before = econ.dailyRevenue;

    econ.post({ id: 'tx_fare_1', day: 1, minute: 600, kind: 'fare', amount: 120 });

    expect(econ.dailyRevenue).toBe(before + 120);
  });
});
