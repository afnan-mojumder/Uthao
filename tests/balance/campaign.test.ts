import { describe, it, expect } from 'vitest';
import {
  smartProStrategy,
  trustFocusedStrategy,
  recklessStrategy,
  offAppHeavyStrategy,
  runHeadlessCampaign,
  runHeadlessDay,
  createBalanceNetwork,
} from '../../src/sim/bot/strategies';
import { Rng } from '../../src/core/rng';

describe('Campaign Balance Pass (T6.2)', { timeout: 60000 }, () => {
  const network = createBalanceNetwork();
  const NUM_RUNS = 50;

  it('smartPro reaches savings >= 20,000 by Day 20 in >= 70% of runs', () => {
    let countAbove20k = 0;
    const savingsList: number[] = [];

    for (let seed = 1; seed <= NUM_RUNS; seed++) {
      const result = runHeadlessCampaign(smartProStrategy, network, seed, 20);
      savingsList.push(result.finalSavings);
      if (result.finalSavings >= 20000) {
        countAbove20k++;
      }
    }

    const rate = countAbove20k / NUM_RUNS;
    expect(rate).toBeGreaterThanOrEqual(0.7);
  });

  it('The trust-focused policy reaches Trusted Local in >= 60% of runs with savings < 15,000', () => {
    let countTrustedLocalWithLowSavings = 0;

    for (let seed = 1; seed <= NUM_RUNS; seed++) {
      const result = runHeadlessCampaign(trustFocusedStrategy, network, seed, 20);
      if (result.endingId === 'trusted_local' && result.finalSavings < 15000) {
        countTrustedLocalWithLowSavings++;
      }
    }

    const rate = countTrustedLocalWithLowSavings / NUM_RUNS;
    expect(rate).toBeGreaterThanOrEqual(0.6);
  });

  it('reckless has the highest crash/infraction count and its mean net <= smartPro * 1.15', () => {
    let recklessTotalCrashes = 0;
    let smartProTotalCrashes = 0;
    let recklessTotalNet = 0;
    let smartProTotalNet = 0;

    for (let seed = 1; seed <= NUM_RUNS; seed++) {
      const rec = runHeadlessCampaign(recklessStrategy, network, seed, 20);
      const pro = runHeadlessCampaign(smartProStrategy, network, seed, 20);

      recklessTotalCrashes += rec.totalCrashes + rec.totalInfractions;
      smartProTotalCrashes += pro.totalCrashes + pro.totalInfractions;

      const recNet = rec.dailyNets.reduce((sum, n) => sum + n, 0);
      const proNet = pro.dailyNets.reduce((sum, n) => sum + n, 0);

      recklessTotalNet += recNet;
      smartProTotalNet += proNet;
    }

    expect(recklessTotalCrashes).toBeGreaterThan(smartProTotalCrashes);

    const recklessMeanNet = recklessTotalNet / NUM_RUNS;
    const smartProMeanNet = smartProTotalNet / NUM_RUNS;
    expect(recklessMeanNet).toBeLessThanOrEqual(smartProMeanNet * 1.15);
  });

  it('off-app-heavy policy: mean net <= smartPro * 1.1 and suspension in >= 30% of runs', () => {
    let offAppTotalNet = 0;
    let smartProTotalNet = 0;
    let suspensionCount = 0;

    for (let seed = 1; seed <= NUM_RUNS; seed++) {
      const off = runHeadlessCampaign(offAppHeavyStrategy, network, seed, 20);
      const pro = runHeadlessCampaign(smartProStrategy, network, seed, 20);

      const offNet = off.dailyNets.reduce((sum, n) => sum + n, 0);
      const proNet = pro.dailyNets.reduce((sum, n) => sum + n, 0);

      offAppTotalNet += offNet;
      smartProTotalNet += proNet;

      if (off.wasSuspended) {
        suspensionCount++;
      }
    }

    const offAppMeanNet = offAppTotalNet / NUM_RUNS;
    const smartProMeanNet = smartProTotalNet / NUM_RUNS;

    expect(offAppMeanNet).toBeLessThanOrEqual(smartProMeanNet * 1.1);
    expect(suspensionCount / NUM_RUNS).toBeGreaterThanOrEqual(0.3);
  });

  it('From a bad day (net -500 tk) a recovery to positive weekly net is possible within 3 days in >= 80% of runs', () => {
    let recoverySuccessCount = 0;

    for (let seed = 1; seed <= NUM_RUNS; seed++) {
      const rng = new Rng(seed * 777);
      let cumulativeNet = -500; // Bad day start

      for (let day = 1; day <= 3; day++) {
        const dayRes = runHeadlessDay(smartProStrategy, network, day, 'clear', rng);
        cumulativeNet += dayRes.dailyNet;
      }

      if (cumulativeNet > 0) {
        recoverySuccessCount++;
      }
    }

    const recoveryRate = recoverySuccessCount / NUM_RUNS;
    expect(recoveryRate).toBeGreaterThanOrEqual(0.8);
  });

  it('Repairs average <= 12% of revenue for smartPro', () => {
    let totalRevenue = 0;
    let totalRepairs = 0;

    for (let seed = 1; seed <= NUM_RUNS; seed++) {
      const res = runHeadlessCampaign(smartProStrategy, network, seed, 20);
      totalRevenue += res.totalGrossRevenue;
      totalRepairs += res.totalRepairCost;
    }

    const repairPercent = totalRepairs / totalRevenue;
    expect(repairPercent).toBeLessThanOrEqual(0.12);
  });
});
