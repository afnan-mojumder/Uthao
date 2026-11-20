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
import mirparaData from '../../../data/districts/mirpara.json';
import type { DistrictData } from '../../../src/sim/schemas';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { GameSession } from '../../../src/sim/GameSession';
import { SIM_DT } from '../../../src/config/constants';
import { garageSignal } from '../../../src/ui/store';
import { bindUi } from '../../../src/ui/bindings';
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

describe('P4.2 Kamal proximity, end-of-shift commute fuel, and live garageSignal sync', () => {
  it('moving bike to Kamal garage sets gm.atKamalBhai = true and applies his repair discount', () => {
    const mirpara = mirparaData as DistrictData;
    const road = RoadNetwork.fromDistricts([mirpara]);
    const gm = new GameManager({ seed: 55, mode: 'career', data: {} });
    gm.economyManager.cash = 2000;
    gm.economyManager.engineCondition = 50;
    gm.reputationSystem.changeRelationship('char_kamal', 25);

    const session = new GameSession({ gm, road, autoRequests: false });
    session.spawnAtHome();
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);

    // At home, not at Kamal's garage
    expect(gm.atKamalBhai).toBe(false);
    expect(gm.isNearKamalBhai()).toBe(false);

    // Move bike to Kamal Bhai's garage POI node (poi_mirpara_garage -> res_s1_0)
    const kamalPoi = mirpara.pois.find((p) => p.id === 'poi_mirpara_garage')!;
    const kamalNode = road.getNode(kamalPoi.nodeId)!;
    session.bike.x = kamalNode.x;
    session.bike.z = kamalNode.z;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);

    expect(gm.atKamalBhai).toBe(true);
    expect(gm.isNearKamalBhai()).toBe(true);
    expect(gm.playerNodeId).toBe(kamalPoi.nodeId);

    // 20% Kamal Bhai discount applies to repair (engine 400 -> 320)
    const cashBefore = gm.economyManager.cash;
    const repairRes = gm.dispatch({ type: 'repair', item: 'engine' });
    expect(repairRes.success).toBe(true);
    expect(cashBefore - gm.economyManager.cash).toBe(320);

    // Moving away clears atKamalBhai and removes discount
    const homeNode = road.getNode(gm.homeNodeId)!;
    session.bike.x = homeNode.x;
    session.bike.z = homeNode.z;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    expect(gm.atKamalBhai).toBe(false);
    expect(gm.isNearKamalBhai()).toBe(false);

    gm.economyManager.tiresCondition = 50;
    const cashBeforeTires = gm.economyManager.cash;
    gm.dispatch({ type: 'repair', item: 'tires' });
    expect(cashBeforeTires - gm.economyManager.cash).toBe(250); // full price away from Kamal
  });

  it('riding far from home sets playerDistFromHomeM and triggers end-of-shift commute fuel', () => {
    const mirpara = mirparaData as DistrictData;
    const road = RoadNetwork.fromDistricts([mirpara]);
    const gm = new GameManager({ seed: 56, mode: 'career', data: {} });
    gm.clock.minutes = 13 * 60;
    gm.economyManager.fuelLevel = 5.0;

    const session = new GameSession({ gm, road, autoRequests: false });
    session.spawnAtHome();

    // Place bike 1000 map m (= 3000 virtual m > 1500m threshold) away from home
    const homeNode = road.getNode(gm.homeNodeId)!;
    session.bike.x = homeNode.x + 1000;
    session.bike.z = homeNode.z;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);

    expect(gm.playerDistFromHomeM).toBeGreaterThan(1500);
    const fuelBeforeEnd = gm.economyManager.fuelLevel;

    const endRes = gm.dispatch({ type: 'endShift' });
    expect(endRes.success).toBe(true);
    expect(gm.economyManager.fuelLevel).toBeLessThan(fuelBeforeEnd);
    expect(gm.playerDistFromHomeM).toBe(0);
    expect(gm.playerNodeId).toBe(gm.homeNodeId);
  });

  it('garageSignal reflects live cash, savings, wear, owned upgrades, and atKamalBhai', () => {
    const mirpara = mirparaData as DistrictData;
    const road = RoadNetwork.fromDistricts([mirpara]);
    const gm = new GameManager({ seed: 57, mode: 'career', data: {} });
    gm.economyManager.cash = 1500;
    gm.economyManager.savings = 300;
    gm.economyManager.engineCondition = 80;

    const session = new GameSession({ gm, road, autoRequests: false });
    session.spawnAtHome();
    const unbindUi = bindUi(session);

    expect(garageSignal.value.cash).toBe(1500);
    expect(garageSignal.value.savings).toBe(300);
    expect(garageSignal.value.engineCondition).toBe(80);
    expect(garageSignal.value.ownedUpgrades).toEqual([]);
    expect(garageSignal.value.atKamalBhai).toBe(false);

    // Move to Kamal's garage
    const kamalPoi = mirpara.pois.find((p) => p.id === 'poi_mirpara_garage')!;
    const kamalNode = road.getNode(kamalPoi.nodeId)!;
    session.bike.x = kamalNode.x;
    session.bike.z = kamalNode.z;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    expect(garageSignal.value.atKamalBhai).toBe(true);

    // Deposit savings & buy upgrade
    gm.dispatch({ type: 'depositSavings', amount: 200 });
    expect(garageSignal.value.cash).toBe(1300);
    expect(garageSignal.value.savings).toBe(500);

    gm.dispatch({ type: 'buyUpgrade', upgradeId: 'upgrade_luggage_carrier' });
    expect(garageSignal.value.ownedUpgrades).toContain('upgrade_luggage_carrier');
    // Seeded char_kamal=25 (>= 20) grants Kamal's 20% discount at his garage: 600 -> 480 (1300 - 480 = 820)
    expect(garageSignal.value.cash).toBe(820);

    // Repair updates engineCondition
    gm.dispatch({ type: 'repair', item: 'engine' });
    expect(garageSignal.value.engineCondition).toBe(100);

    // Riding causes wear and updates live garageSignal
    gm.economyManager.fuelLevel = 5;
    for (let i = 0; i < 60 * 50; i++) {
      session.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    }
    expect(garageSignal.value.engineCondition).toBeLessThan(100);
    expect(garageSignal.value.kmSinceOilChange).toBeGreaterThan(0);

    unbindUi();
  });
});
