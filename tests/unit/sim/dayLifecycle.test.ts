import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import { RequestGenerator } from '../../../src/sim/ride/RequestGenerator';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { Rng } from '../../../src/core/rng';
import { BALANCE } from '../../../src/config/balance';
import { SIM_DT } from '../../../src/config/constants';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

describe('T4.1 Day lifecycle and living expenses', () => {
  it('expenses posted at day end', () => {
    const bus = new EventBus<GameEvents>();
    const econ = new EconomyManager(bus, { cash: 1000, debt: 0 });

    // Day 1 living expenses: Food (150) + Phone Data (30) = 180
    const day1Expenses = econ.postDailyLivingExpenses(1, 0);
    expect(day1Expenses.food).toBe(BALANCE.LIVING.foodPerDay);
    expect(day1Expenses.phoneData).toBe(BALANCE.LIVING.phoneDataPerDay);
    expect(day1Expenses.rent).toBe(0);
    expect(day1Expenses.family).toBe(0);
    expect(day1Expenses.total).toBe(180);
    expect(econ.cash).toBe(1000 - 180);
    expect(econ.dailyExpenses).toBe(180);

    // Day 3 living expenses: includes Family Payment (1200)
    const econDay3 = new EconomyManager(bus, { cash: 2000, debt: 0 });
    const day3Expenses = econDay3.postDailyLivingExpenses(3, 0);
    expect(day3Expenses.food).toBe(150);
    expect(day3Expenses.phoneData).toBe(30);
    expect(day3Expenses.family).toBe(BALANCE.LIVING.familyPaymentDay3);
    expect(day3Expenses.total).toBe(150 + 30 + 1200);
    expect(econDay3.cash).toBe(2000 - (150 + 30 + 1200));

    // Day 7 living expenses (rent due day): includes Rent (4000)
    const econDay7 = new EconomyManager(bus, { cash: 5000, debt: 0 });
    const day7Expenses = econDay7.postDailyLivingExpenses(7, 0);
    expect(day7Expenses.food).toBe(150);
    expect(day7Expenses.phoneData).toBe(30);
    expect(day7Expenses.rent).toBe(BALANCE.LIVING.rentAmount);
    expect(day7Expenses.total).toBe(150 + 30 + 4000);
    expect(econDay7.cash).toBe(5000 - (150 + 30 + 4000));
  });

  it('missed rent once → debt + flag, twice → story consequence flag', () => {
    const gm = new GameManager({ seed: 1234, mode: 'career', data: {} });
    // Advance to day 7 at 12:30 (750 minutes)
    gm.clock.day = 7;
    gm.clock.minutes = 12 * 60 + 30;
    // Set cash to 200 (cannot afford 4000 rent)
    gm.economyManager.cash = 200;

    // End shift on day 7: first missed rent
    const res1 = gm.dispatch({ type: 'endShift' });
    expect(res1.success).toBe(true);

    // Assert: rentDelayedOnce flag set, unpaid rent converted to debt
    expect(gm.story.branchFlags['rentDelayedOnce']).toBe(true);
    expect(gm.economyManager.debt).toBeGreaterThanOrEqual(3800); // 200 cash - (150+30+4000) = -3980 converted to debt
    expect(gm.reputationSystem.getRelationship('ma')).toBeLessThan(0); // relationship penalty

    // Advance to day 14 (next rent day)
    gm.dispatch({ type: 'sleep' });
    gm.clock.day = 14;
    gm.clock.minutes = 13 * 60;
    gm.economyManager.cash = 100;

    // End shift on day 14: second missed rent
    const res2 = gm.dispatch({ type: 'endShift' });
    expect(res2.success).toBe(true);

    // Assert: eviction warning story consequence flag set
    expect(gm.story.branchFlags['rentEvictionWarning']).toBe(true);
  });

  it('battery 0 blocks requests', () => {
    const network = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const rng = new Rng(42);
    const generator = new RequestGenerator(network, rng, {
      baseArrivalRatePerMinute: 2.0,
      phoneBattery: 100,
    });

    // With 100% battery, app requests are sampled normally
    const appSample = generator.sampleRequest(600, 'clear', 'app');
    expect(appSample).not.toBeNull();
    expect(appSample?.request.bookingType).toBe('app');

    // With 0% battery, app requests return null (dead phone)
    generator.setPhoneBattery(0);
    const deadSample = generator.sampleRequest(600, 'clear', 'app');
    expect(deadSample).toBeNull();

    // In tick(), zero app requests generated when battery is 0
    const tickRequests = generator.tick(10, 600, 'clear');
    expect(tickRequests.length).toBe(0);

    // Street hails can still be flagged down if player is nearby on street
    const streetHail = generator.sampleStreetHail({ x: 0, z: 0 }, 600, 'clear');
    expect(streetHail).not.toBeNull();
    expect(streetHail?.request.bookingType).toBe('street');
  });

  it('day schedule: starts at 07:00, cannot end before 12:00, forced at 23:00', () => {
    const gm = new GameManager({ seed: 555, mode: 'career', data: {} });

    // Starts at 07:00 (420 min)
    expect(gm.clock.day).toBe(1);
    expect(gm.clock.minutes).toBe(7 * 60);

    // Attempting endShift before 12:00 is rejected
    const earlyEnd = gm.dispatch({ type: 'endShift' });
    expect(earlyEnd.success).toBe(false);
    expect(earlyEnd.reason).toContain('12:00');

    // Advance to 12:00
    gm.clock.minutes = 12 * 60;
    const okEnd = gm.dispatch({ type: 'endShift' });
    expect(okEnd.success).toBe(true);

    // Sleep resets to next day 07:00
    gm.dispatch({ type: 'sleep' });
    expect(gm.clock.day).toBe(2);
    expect(gm.clock.minutes).toBe(7 * 60);

    // Advancing past 23:00 auto-forces shift end
    gm.clock.minutes = 23 * 60 + 1;
    gm.tick(SIM_DT);
    expect(gm.shiftEnded).toBe(true);
  });

  it('commute home: teleports and consumes fuel when > 1.5 km', () => {
    const gm = new GameManager({ seed: 999, mode: 'career', data: {} });
    gm.clock.minutes = 14 * 60;
    gm.economyManager.fuelLevel = 3.0;
    gm.playerDistFromHomeM = 3000; // 3.0 km away from home

    gm.dispatch({ type: 'endShift' });

    // Consumes fuel: 3 km / 40 km/L = 0.075 L fuel
    expect(gm.economyManager.fuelLevel).toBeCloseTo(3.0 - 0.075, 3);
    // Player distance reset to 0 (home)
    expect(gm.playerDistFromHomeM).toBe(0);
    expect(gm.playerNodeId).toBe('res_n2_0');
  });

  it('battery drainage while navigating and charging at tea stall', () => {
    const gm = new GameManager({ seed: 888, mode: 'career', data: {} });
    expect(gm.economyManager.phoneBattery).toBe(100);

    // Start navigating: 3% per game hour
    gm.isNavigating = true;
    // Advance 2 game hours (120 game minutes)
    // 120 game min at TIME_SCALE 20 is 120 * 60 / 20 = 360 real seconds
    const dt = 360;
    gm.tick(dt);

    // Drained ~6% (3% per hour * 2 hours)
    expect(gm.economyManager.phoneBattery).toBeCloseTo(94, 0);

    // Charge phone at tea stall: costs ৳10, restores to 100%
    const initialCash = gm.economyManager.cash;
    gm.dispatch({ type: 'chargePhone', cost: 10 });
    expect(gm.economyManager.phoneBattery).toBe(100);
    expect(gm.economyManager.cash).toBe(initialCash - 10);
  });

  it('bad day recovery: advances from Mintu and Ma increase cash and debt', () => {
    const gm = new GameManager({ seed: 777, mode: 'career', data: {} });
    const initialCash = gm.economyManager.cash;
    const initialDebt = gm.economyManager.debt;

    gm.dispatch({ type: 'askAdvance', from: 'mintu', amount: 500 });
    expect(gm.economyManager.cash).toBe(initialCash + 500);
    expect(gm.economyManager.debt).toBe(initialDebt + 500);

    gm.dispatch({ type: 'askAdvance', from: 'ma', amount: 500 });
    expect(gm.economyManager.cash).toBe(initialCash + 1000);
    expect(gm.economyManager.debt).toBe(initialDebt + 1000);
  });
});
