import { describe, it, expect, beforeEach } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { MotorcycleMesh } from '../../../src/render/vehicles';
import { AudioManager } from '../../../src/audio/AudioManager';
import {
  getBikeDef,
  calculateTradeInValue,
  calculateNetBikePurchaseCost,
  bikeDefToSpec,
  getBikeFuelEfficiency,
} from '../../../src/sim/economy/bikes';
import { fuelUsed } from '../../../src/sim/economy/fuel';

describe('T5.6 Additional motorcycles', () => {
  let bus: EventBus<GameEvents>;
  let economy: EconomyManager;

  beforeEach(() => {
    bus = new EventBus<GameEvents>();
    economy = new EconomyManager(bus, {
      cash: 50000,
      savings: 10000,
      currentBikeId: 'old100',
      ownedBikes: ['old100'],
      motorcycleCondition: 80,
    });
  });

  it('bike swap updates BikeSpec and fuel model', () => {
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    expect(gm.economyManager.currentBikeId).toBe('old100');

    // Starting fuel efficiency and bike spec
    const oldDef = getBikeDef('old100');
    expect(oldDef.efficiencyKmPerL).toBe(40);
    expect(getBikeFuelEfficiency('old100')).toBe(40);
    expect(oldDef.vmax).toBe(22);

    // Initial fuel consumed over 10 km
    const fuelOld100 = fuelUsed(10, 0, { model: 'old100' });
    expect(fuelOld100).toBeCloseTo(0.25, 4); // 10 / 40 = 0.25L

    // Buy used125 with trade-in
    gm.economyManager.cash = 25000;
    const res = gm.dispatch({
      type: 'buyBike',
      bikeId: 'used125',
      useTradeIn: true,
    });

    expect(res.success).toBe(true);
    expect(gm.economyManager.currentBikeId).toBe('used125');

    // Verify updated fuel model
    const fuelUsed125 = fuelUsed(10, 0, { model: 'used125' });
    expect(fuelUsed125).toBeCloseTo(10 / 45, 4); // 45 km/L efficiency
    expect(fuelUsed125).toBeLessThan(fuelOld100);

    // Verify updated physics spec
    const used125Def = getBikeDef('used125');
    const used125Spec = bikeDefToSpec(used125Def);
    expect(used125Spec.vmax).toBe(25);
    expect(used125Spec.accel).toBe(3.3);
    expect(used125Spec.brakeDecelDry).toBe(6.8);

    // Buy new150
    gm.economyManager.cash = 45000;
    const res2 = gm.dispatch({
      type: 'buyBike',
      bikeId: 'new150',
      useTradeIn: true,
    });
    expect(res2.success).toBe(true);
    expect(gm.economyManager.currentBikeId).toBe('new150');

    const new150Def = getBikeDef('new150');
    const new150Spec = bikeDefToSpec(new150Def);
    expect(new150Spec.vmax).toBe(28);
    expect(new150Spec.accel).toBe(3.8);
    expect(new150Spec.brakeDecelDry).toBe(7.5);
    expect(new150Def.dailyInsuranceCost).toBe(50);
  });

  it('calculates trade-in value based on condition', () => {
    const old100Def = getBikeDef('old100');
    expect(old100Def.tradeInBase).toBe(6000);

    // At 100% condition: full trade-in value (6000)
    const tradeInMint = calculateTradeInValue(old100Def, 100);
    expect(tradeInMint).toBe(6000);

    // At 0% condition: minimum base factor (40% = 2400)
    const tradeInWreck = calculateTradeInValue(old100Def, 0);
    expect(tradeInWreck).toBe(2400);

    // At 80% condition: intermediate
    const tradeInGood = calculateTradeInValue(old100Def, 80);
    expect(tradeInGood).toBe(5280);
  });

  it('applies Kamal Bhai relationship discount to net bike purchase', () => {
    const used125Def = getBikeDef('used125');
    const old100Def = getBikeDef('old100');

    // Without discount
    const standardCost = calculateNetBikePurchaseCost(used125Def, old100Def, 100, false);
    expect(standardCost).toBe(20000 - 6000); // 14,000

    // With Kamal Bhai trust discount (5% off 20,000 = 19,000)
    const discountedCost = calculateNetBikePurchaseCost(used125Def, old100Def, 100, true);
    expect(discountedCost).toBe(19000 - 6000); // 13,000
    expect(discountedCost).toBeLessThan(standardCost);
  });

  it('prevents bike purchase if player cannot afford it', () => {
    economy.cash = 200;
    economy.savings = 500;

    const res = economy.buyBike('new150', true);
    expect(res.success).toBe(false);
    expect(res.reason).toBe('Insufficient funds');
    expect(economy.currentBikeId).toBe('old100');
  });

  it('charges daily insurance cost for new150 at end of shift', () => {
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    gm.clock.day = 2;
    gm.clock.minutes = 13 * 60; // 13:00

    // Switch to new150
    gm.economyManager.currentBikeId = 'new150';
    gm.economyManager.dailyExpenses = 0;

    gm.dispatch({ type: 'endShift' });
    // Should have deducted ৳50 insurance in daily expenses
    expect(gm.economyManager.dailyExpenses).toBeGreaterThanOrEqual(50);
  });

  it('switches between owned bikes without additional payment', () => {
    economy.ownedBikes = ['old100', 'used125'];
    economy.currentBikeId = 'old100';

    const res = economy.switchBike('used125');
    expect(res.success).toBe(true);
    expect(economy.currentBikeId).toBe('used125');

    const resSwitchBack = economy.switchBike('old100');
    expect(resSwitchBack.success).toBe(true);
    expect(economy.currentBikeId).toBe('old100');

    // Attempting to switch to unowned bike fails
    const resUnowned = economy.switchBike('new150');
    expect(resUnowned.success).toBe(false);
    expect(resUnowned.reason).toBe('Bike not owned');
  });

  it('procedural MotorcycleMesh adapts to variant changes', () => {
    const mesh = new MotorcycleMesh();
    expect(mesh.currentVariant).toBe('old100');

    mesh.setVariant('used125');
    expect(mesh.currentVariant).toBe('used125');

    mesh.setVariant('new150');
    expect(mesh.currentVariant).toBe('new150');
  });

  it('AudioManager updates engine pitch multiplier', () => {
    const audio = new AudioManager();
    audio.setEnginePitch(1.3);
    // Audio engine pitch updated without throwing
    expect(() => audio.updateEngine(20, 0.8)).not.toThrow();
  });
});
