import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { Rng } from '../../../src/core/rng';
import { BALANCE } from '../../../src/config/balance';
import { fuelUsed } from '../../../src/sim/economy/fuel';
import {
  checkPuncture,
  calculateRepairCost,
  calculateUpgradeCost,
  effectiveWetGrip,
  effectiveFuelRateMultiplier,
  type UpgradeDef,
} from '../../../src/sim/economy/maintenance';
import defaultUpgrades from '../../../data/upgrades.json';
import fs from 'node:fs';
import path from 'node:path';

describe('T4.4 Bike upgrades, repairs, garage screen', () => {
  it('tires upgrade halves puncture chance and raises wet grip', () => {
    const rng1 = new Rng(12345);
    const rng2 = new Rng(12345);

    // Over 10,000 samples, compare standard tires vs good tires
    let puncturesStandard = 0;
    let puncturesGood = 0;
    const testVirtualKm = 5.0;
    const surfaceCondition = 0.8;
    const isFlooded = false;

    for (let i = 0; i < 10000; i++) {
      if (checkPuncture(testVirtualKm, surfaceCondition, isFlooded, false, rng1)) {
        puncturesStandard++;
      }
      if (checkPuncture(testVirtualKm, surfaceCondition, isFlooded, true, rng2)) {
        puncturesGood++;
      }
    }

    // Ratio of punctures with good tires should be approx 0.5 (halved)
    const ratio = puncturesGood / puncturesStandard;
    expect(ratio).toBeGreaterThan(0.4);
    expect(ratio).toBeLessThan(0.6);

    // Verify wet grip improvement
    const baseWetGrip = BALANCE.BIKE.old100.wetLateralGrip; // 0.7
    const upgradedWetGrip = effectiveWetGrip(baseWetGrip, true);
    expect(upgradedWetGrip).toBeGreaterThan(baseWetGrip);
    expect(upgradedWetGrip).toBeCloseTo(0.88, 2);
  });

  it('engine tune lowers fuel per km 15%', () => {
    const distanceKm = 10.0;
    const standardFuel = fuelUsed(distanceKm, 0, { engineTune: false });
    const tunedFuel = fuelUsed(distanceKm, 0, { engineTune: true });

    // Tuned fuel must be exactly 15% less than standard fuel
    const savingsRatio = (standardFuel - tunedFuel) / standardFuel;
    expect(savingsRatio).toBeCloseTo(0.15, 4);

    // Check rate multiplier
    expect(effectiveFuelRateMultiplier(false)).toBe(1.0);
    expect(effectiveFuelRateMultiplier(true)).toBe(0.85);
  });

  it('no mission requires upgrade', () => {
    const missionsDir = path.resolve('data/missions');
    if (fs.existsSync(missionsDir)) {
      const files = fs.readdirSync(missionsDir).filter((f) => f.endsWith('.json'));
      for (const file of files) {
        const filePath = path.join(missionsDir, file);
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        const missions = Array.isArray(raw) ? raw : [raw];
        for (const m of missions) {
          expect(m?.prerequisites?.requiresUpgrade).toBeFalsy();
          expect(m?.requiresUpgrade).toBeFalsy();
          if (Array.isArray(m?.objectives)) {
            for (const obj of m.objectives) {
              expect(obj?.type).not.toBe('requireUpgrade');
            }
          }
        }
      }
    }
  });

  it('cheaper at Kamal bhai with relationship >= 20: -20%', () => {
    // Unfamiliar garage or low relationship: standard price
    const standardEngineRepair = calculateRepairCost('engine', false, 0);
    expect(standardEngineRepair).toBe(400);

    const standardUpgrade = calculateUpgradeCost(1000, false, 0);
    expect(standardUpgrade).toBe(1000);

    // At Kamal bhai with relationship < 20: still standard price
    expect(calculateRepairCost('engine', true, 15)).toBe(400);
    expect(calculateUpgradeCost(1000, true, 15)).toBe(1000);

    // At Kamal bhai with relationship >= 20: 20% discount applies
    const discountedEngineRepair = calculateRepairCost('engine', true, 20);
    expect(discountedEngineRepair).toBe(320); // 400 * 0.8 = 320

    const discountedUpgrade = calculateUpgradeCost(1000, true, 25);
    expect(discountedUpgrade).toBe(800); // 1000 * 0.8 = 800

    const discountedFullService = calculateRepairCost('full', true, 30);
    expect(discountedFullService).toBe(960); // 1200 * 0.8 = 960
  });

  it('gameManager repairs and buys upgrades via dispatch', () => {
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    gm.economyManager.cash = 2500;
    gm.economyManager.engineCondition = 50;

    // Dispatch repair
    const repairRes = gm.dispatch({ type: 'repair', item: 'engine' });
    expect(repairRes.success).toBe(true);
    expect(gm.economyManager.engineCondition).toBe(100);

    // Dispatch upgrade purchase
    const upgRes = gm.dispatch({ type: 'buyUpgrade', upgradeId: 'upgrade_good_tires' });
    expect(upgRes.success).toBe(true);
    expect(gm.economyManager.hasUpgrade('upgrade_good_tires')).toBe(true);

    // Duplicate purchase rejected
    const dupRes = gm.dispatch({ type: 'buyUpgrade', upgradeId: 'upgrade_good_tires' });
    expect(dupRes.success).toBe(false);
  });

  it('luggage carrier unlocks luggage passengers and deliveries', () => {
    const bus = new EventBus<GameEvents>();
    const econ = new EconomyManager(bus, { cash: 1000 });
    const luggageUpg = (defaultUpgrades as UpgradeDef[]).find((u) => u.id === 'upgrade_luggage_carrier')!;

    expect(econ.hasUpgrade('upgrade_luggage_carrier')).toBe(false);
    expect(luggageUpg.effects?.unlocksLuggage).toBe(true);
    expect(luggageUpg.effects?.unlocksDeliveries).toBe(true);

    const res = econ.buyUpgrade(luggageUpg);
    expect(res.success).toBe(true);
    expect(econ.hasUpgrade('upgrade_luggage_carrier')).toBe(true);
  });
});
