import { describe, it, expect, vi } from 'vitest';
import { EventBus, type GameEvents } from '../../../src/core/events';
import {
  fuelUsed,
  fuelCost,
  receipt,
  EconomyManager,
  type TripSettlement,
} from '../../../src/sim/economy';
import { serialize, deserialize } from '../../../src/sim/save/SaveSystem';
import { BALANCE } from '../../../src/config/balance';
import { GameManager } from '../../../src/sim/GameManager';
import type { DaySummary, Transaction } from '../../../src/core/types';

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

  it('spendSavings deducts the given amount from savings', () => {
    const bus = new EventBus<GameEvents>();
    const econ = new EconomyManager(bus, { savings: 20000 });

    econ.spendSavings(15000);

    expect(econ.savings).toBe(5000);
  });

  describe('T7.5: effect bug fixes', () => {
    it('insurance counts once in dailyExpenses across a bike buy + endShift', () => {
      const gm = new GameManager({ seed: 3, mode: 'career', data: {} });
      gm.economyManager.cash = 100000;
      gm.clock.minutes = 12 * 60;

      const buy = gm.dispatch({ type: 'buyBike', bikeId: 'new150', useTradeIn: false });
      expect(buy.success).toBe(true);

      const expensesBeforeEndShift = gm.economyManager.dailyExpenses;

      const res = gm.dispatch({ type: 'endShift' });
      expect(res.success).toBe(true);
      const summary = res.data as DaySummary;

      // Insurance is 50/day for new150 (data/bikes.json). post() already
      // records it once; dailyExpenses must grow by exactly insurance +
      // living expenses, not twice over (the old bug: GameManager.endShift
      // also did `dailyExpenses += dailyInsuranceCost` after post() had
      // already added it, inflating the ledger every day).
      const insuranceCost = 50;
      const livingTotal = summary.livingExpenses!.total;
      expect(gm.economyManager.dailyExpenses).toBe(
        expensesBeforeEndShift + insuranceCost + livingTotal
      );
      expect(summary.expenses).toBe(gm.economyManager.dailyExpenses);
    });

    it('buying a bike with enough cash does not also go into debt', () => {
      const gm = new GameManager({ seed: 4, mode: 'career', data: {} });
      gm.economyManager.cash = 100000;
      const cashBefore = gm.economyManager.cash;

      const res = gm.dispatch({ type: 'buyBike', bikeId: 'new150', useTradeIn: false });
      expect(res.success).toBe(true);

      // new150 costs 45000 with no trade-in. Cash alone covers it, so debt
      // must stay 0 — the old bug deducted cash twice (once manually in
      // buyBike, once again via post()), driving cash negative and piling
      // the shortfall onto debt even though cash alone was enough.
      expect(gm.economyManager.cash).toBe(cashBefore - 45000);
      expect(gm.economyManager.debt).toBe(0);
    });
  });
});

describe('Exactly-once settlement and ledger (T8.2)', () => {
  const trip = (over: Partial<TripSettlement> = {}): TripSettlement => ({
    requestId: 'req_1_1',
    fare: 150,
    tip: 0,
    bonus: 0,
    bookingType: 'app',
    fuelLiters: 0.1,
    otherCosts: 0,
    penalties: 0,
    compensation: 0,
    durationMin: 10,
    distanceKm: 3,
    rating: 5,
    day: 2,
    minute: 480,
    consequences: [],
    ...over,
  });
  const sum = (txs: Transaction[]) => txs.reduce((a, t) => a + t.amount, 0);
  const make = () => new EconomyManager(new EventBus<GameEvents>(), { cash: 100 });

  it('net matches the formula', () => {
    const eco = make();
    const r = eco.settleTrip(
      trip({ fare: 150, tip: 10, bonus: 5, otherCosts: 4, penalties: 3, compensation: 2, fuelLiters: 0.1 })
    )!;
    expect(r.net).toBe(150 + 10 + 5 - r.commission - r.fuelCost - 4 - 3 - 2);
  });

  it('the ledger reconciles: net + fuelCost equals ledger sum for the request', () => {
    const eco = make();
    const r = eco.settleTrip(trip({ tip: 7, bonus: 3, otherCosts: 4, penalties: 2, compensation: 1, fuelLiters: 0.4 }))!;
    expect(r.fuelCost).toBeGreaterThan(0);
    expect(r.net + r.fuelCost).toBe(sum(eco.ledgerFor(r.requestId)));
    expect(eco.ledgerFor(r.requestId).some((t) => t.kind === 'fuel')).toBe(false); // fuel is never posted
    expect(eco.cash).toBe(100 + r.net + r.fuelCost);
  });

  it('settling twice pays once', () => {
    const eco = make();
    expect(eco.settleTrip(trip())).not.toBeNull();
    const c = eco.cash;
    const rows = eco.getLedger().length;
    expect(eco.settleTrip(trip())).toBeNull();
    expect(eco.cash).toBe(c);
    expect(eco.getLedger().length).toBe(rows);
  });

  it('a save taken after settle and reloaded still refuses a second settle', () => {
    const gm = new GameManager({ seed: 3, mode: 'career', data: {} });
    gm.requestSeq = 4;
    gm.economyManager.settleTrip(trip({ requestId: 'req_1_4' }));
    const cash = gm.economyManager.cash;
    const loaded = deserialize(JSON.parse(JSON.stringify(serialize(gm))));
    expect(loaded.economyManager.cash).toBe(cash);
    expect(loaded.economyManager.ledgerFor('req_1_4').length).toBeGreaterThan(0);
    expect(loaded.economyManager.settleTrip(trip({ requestId: 'req_1_4' }))).toBeNull();
    expect(loaded.economyManager.cash).toBe(cash);
    expect(loaded.requestSeq).toBe(4);
  });

  it('a pre-T8.2 save without ledger fields still loads', () => {
    const gm = new GameManager({ seed: 3, mode: 'career', data: {} });
    const save = JSON.parse(JSON.stringify(serialize(gm)));
    delete save.ledger;
    delete save.settledRequests;
    delete save.requestSeq;
    const loaded = deserialize(save);
    expect(loaded.economyManager.getLedger()).toHaveLength(0);
    expect(loaded.requestSeq).toBe(0);
  });
});
