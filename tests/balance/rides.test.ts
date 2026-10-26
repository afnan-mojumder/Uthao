import { describe, it, expect } from 'vitest';
import type { ReasonCode } from '../../src/core/types';
import { Rng } from '../../src/core/rng';
import { BALANCE } from '../../src/config/balance';
import {
  smartProStrategy,
  alwaysMaxCounterStrategy,
  recklessStrategy,
  acceptAllStrategy,
  estimateExpectedNet,
  simulateRides,
  runHeadlessDay,
  createBalanceNetwork,
} from '../../src/sim/bot/strategies';

describe('Balance Tests v1 (T2.9)', () => {
  const network = createBalanceNetwork();

  it('outcome variety: 200 rides with smartPro has std-dev > 15% of mean and >= 3 ReasonCodes', () => {
    const rides = simulateRides(smartProStrategy, network, 200, 12345);
    expect(rides.length).toBe(200);

    const nets = rides.map((r) => r.net);
    const mean = nets.reduce((sum, n) => sum + n, 0) / nets.length;
    const variance =
      nets.reduce((sum, n) => sum + (n - mean) ** 2, 0) / nets.length;
    const stdDev = Math.sqrt(variance);

    const distinctReasonCodes = new Set<ReasonCode>();
    for (const r of rides) {
      for (const rc of r.reasonCodes) {
        distinctReasonCodes.add(rc);
      }
    }

    // std-dev of net per ride > 15% of mean
    expect(mean).toBeGreaterThan(0);
    expect(stdDev).toBeGreaterThan(0.15 * mean);

    // >= 3 distinct ReasonCodes seen
    expect(distinctReasonCodes.size).toBeGreaterThanOrEqual(3);
  });

  it('declining is sometimes right: requests exist where expected net < 0 (long jam + low offer)', () => {
    // Passenger offers low fare (e.g. 50 tk minimum fare), but travel is through heavy traffic
    // causing an extended jam (e.g. 60 min duration with 50 min idle)
    const lowOffer = 50;
    const virtualKm = 3.0;
    const longJamDurationMin = 60;
    const idleMin = 50;

    const net = estimateExpectedNet(lowOffer, virtualKm, longJamDurationMin, {
      idleMin,
      commissionRate: BALANCE.COMMISSION_APP,
      includeWear: true,
    });

    // Gross fare: 50
    // App Commission (15%): 7.5
    // Fuel: driving (3/40 = 0.075L) + idle (50/60 * 0.3L = 0.25L) = 0.325L * 130 = 42.25 => 42
    // Wear: 3km * (350 / 60) = 17.5 => 18
    // Total costs: 7.5 + 42 + 18 = 67.5
    // Net: 50 - 67.5 = -17.5 < 0
    expect(net).toBeLessThan(0);
  });

  it('no dominant greedy strategy: alwaysMaxCounter daily net < smartPro daily net', () => {
    // Simulate 10 days for each strategy
    const numDays = 10;
    let smartProTotalNet = 0;
    let maxCounterTotalNet = 0;

    for (let day = 1; day <= numDays; day++) {
      const rng1 = new Rng(1000 + day);
      const rng2 = new Rng(1000 + day);

      const resSmart = runHeadlessDay(smartProStrategy, network, day, 'clear', rng1);
      const resMax = runHeadlessDay(alwaysMaxCounterStrategy, network, day, 'clear', rng2);

      smartProTotalNet += resSmart.dailyNet;
      maxCounterTotalNet += resMax.dailyNet;
    }

    const smartMeanDailyNet = smartProTotalNet / numDays;
    const maxCounterMeanDailyNet = maxCounterTotalNet / numDays;

    // alwaysMaxCounter causes passengers to walk away, resulting in much lower daily net
    expect(maxCounterMeanDailyNet).toBeLessThan(smartMeanDailyNet);
  });

  it('reckless not optimal: reckless mean daily net <= smartPro', () => {
    // Simulate 15 days for each strategy
    const numDays = 15;
    let smartTotalNet = 0;
    let recklessTotalNet = 0;

    for (let day = 1; day <= numDays; day++) {
      const rng1 = new Rng(2000 + day);
      const rng2 = new Rng(2000 + day);

      const resSmart = runHeadlessDay(smartProStrategy, network, day, 'clear', rng1);
      const resReckless = runHeadlessDay(recklessStrategy, network, day, 'clear', rng2);

      smartTotalNet += resSmart.dailyNet;
      recklessTotalNet += resReckless.dailyNet;
    }

    const smartMeanDailyNet = smartTotalNet / numDays;
    const recklessMeanDailyNet = recklessTotalNet / numDays;

    // Reckless driving incurs crashes, repairs, and lost tips/ratings, making it <= smartPro
    expect(recklessMeanDailyNet).toBeLessThanOrEqual(smartMeanDailyNet);
  });

  it('acceptAll completes rides but earns less than smartPro due to low negotiated fares', () => {
    const numDays = 10;
    let smartTotalNet = 0;
    let acceptAllTotalNet = 0;

    for (let day = 1; day <= numDays; day++) {
      const rng1 = new Rng(3000 + day);
      const rng2 = new Rng(3000 + day);

      const resSmart = runHeadlessDay(smartProStrategy, network, day, 'clear', rng1);
      const resAccept = runHeadlessDay(acceptAllStrategy, network, day, 'clear', rng2);

      smartTotalNet += resSmart.dailyNet;
      acceptAllTotalNet += resAccept.dailyNet;
    }

    expect(acceptAllTotalNet / numDays).toBeLessThanOrEqual(smartTotalNet / numDays);
  });
});
