import { describe, it, expect, vi } from 'vitest';
import { EventBus, type GameEvents } from '../../../src/core/events';
import {
  fuelUsed,
  fuelCost,
  receipt,
  EconomyManager,
} from '../../../src/sim/economy';
import { BALANCE } from '../../../src/config/balance';

describe('Economy and Fuel (T2.6)', () => {
  it('net formula matches GDD', () => {
    // Net earnings = fare + tip - commission - fuelCost - otherCosts
    const fare = 150;
    const tip = 30;
    const distanceKm = 5;
    const durationMin = 15;
    const otherCosts = 20;

    const r = receipt({
      requestId: 'req_123',
      fare,
      tip,
      distanceKm,
      durationMin,
      otherCosts,
      bookingType: 'app',
    });

    const expectedCommission = Math.round(fare * BALANCE.COMMISSION_APP);
    const expectedFuelLiters = fuelUsed(distanceKm, 0);
    const expectedFuelCost = fuelCost(expectedFuelLiters);
    const expectedNet = fare + tip - expectedCommission - expectedFuelCost - otherCosts;

    expect(r.commission).toBe(expectedCommission);
    expect(r.fuelCost).toBe(expectedFuelCost);
    expect(r.otherCosts).toBe(otherCosts);
    expect(r.net).toBe(expectedNet);
    expect(r.net).toBe(r.fare + r.tip - r.commission - r.fuelCost - r.otherCosts);
  });

  it('traffic idle increases fuel cost', () => {
    const distanceKm = 4.0;
    const noIdleFuel = fuelUsed(distanceKm, 0);
    const withIdleFuel = fuelUsed(distanceKm, 30); // 30 game min in traffic

    expect(withIdleFuel).toBeGreaterThan(noIdleFuel);

    const costNoIdle = fuelCost(noIdleFuel);
    const costWithIdle = fuelCost(withIdleFuel);
    expect(costWithIdle).toBeGreaterThan(costNoIdle);
  });

  it('cash never NaN; negative becomes debt', () => {
    const bus = new EventBus<GameEvents>();
    const econ = new EconomyManager(bus, { cash: 200, debt: 0 });

    // 1. Post invalid / NaN amount
    econ.post({
      id: 'tx_bad',
      day: 1,
      minute: 0,
      kind: 'repair',
      amount: NaN,
    });
    expect(Number.isFinite(econ.cash)).toBe(true);
    expect(Number.isNaN(econ.cash)).toBe(false);
    expect(econ.cash).toBe(200);

    // 2. Large expense that exceeds cash -> negative becomes debt
    econ.post({
      id: 'tx_repair',
      day: 1,
      minute: 0,
      kind: 'repair',
      amount: -500, // 200 - 500 = -300
    });

    expect(econ.cash).toBe(0);
    expect(econ.debt).toBe(300);
    expect(econ.dailyExpenses).toBe(500);

    // 3. Positive income adds to cash
    econ.post({
      id: 'tx_fare',
      day: 1,
      minute: 10,
      kind: 'fare',
      amount: 150,
    });
    expect(econ.cash).toBe(150);
    expect(econ.debt).toBe(300);
    expect(econ.dailyRevenue).toBe(150);
  });

  it('fuel empty event at 0 L', () => {
    const bus = new EventBus<GameEvents>();
    const onFuelEmpty = vi.fn();
    bus.on('bike/fuelEmpty', onFuelEmpty);

    const econ = new EconomyManager(bus, { fuelLevel: 0.5 });
    expect(econ.fuelLevel).toBe(0.5);

    // Consume partial fuel
    econ.consumeFuel(0.3);
    expect(econ.fuelLevel).toBeCloseTo(0.2, 5);
    expect(onFuelEmpty).not.toHaveBeenCalled();

    // Consume remaining fuel to 0
    econ.consumeFuel(0.2);
    expect(econ.fuelLevel).toBe(0);
    expect(onFuelEmpty).toHaveBeenCalledTimes(1);
  });

  it('off-app booking has zero commission', () => {
    const rApp = receipt({
      requestId: 'req_app',
      fare: 100,
      distanceKm: 2,
      durationMin: 5,
      bookingType: 'app',
    });
    expect(rApp.commission).toBe(15);

    const rOffApp = receipt({
      requestId: 'req_off',
      fare: 100,
      distanceKm: 2,
      durationMin: 5,
      bookingType: 'offApp',
    });
    expect(rOffApp.commission).toBe(0);
  });

  it('call friend for fuel adds 1L and costs ৳100', () => {
    const bus = new EventBus<GameEvents>();
    const econ = new EconomyManager(bus, { cash: 500, fuelLevel: 0 });

    const res = econ.callFriendForFuel(1, 100);
    expect(res.fuelAdded).toBe(1.0);
    expect(res.timeCostMin).toBe(20);
    expect(econ.fuelLevel).toBe(1.0);
    expect(econ.cash).toBe(400);
  });
});
