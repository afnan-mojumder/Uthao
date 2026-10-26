import type { EventBus } from '../../core/events';
import type { GameEvents } from '../../core/events';
import type { PlayerEconomy, Transaction } from '../../core/types';
import { BALANCE } from '../../config/balance';

export class EconomyManager {
  private readonly bus: EventBus<GameEvents>;
  private txSeq = 0;
  cash: number;
  debt: number;
  dailyRevenue: number;
  dailyExpenses: number;
  fuelLevel: number;
  motorcycleCondition: number;
  appBalance: number;
  savings: number;
  reputation: number;
  phoneBattery: number;

  constructor(
    bus: EventBus<GameEvents>,
    initial?: Partial<PlayerEconomy>
  ) {
    this.bus = bus;
    this.cash = initial?.cash ?? BALANCE.LIVING.startCash;
    this.debt = initial?.debt ?? 0;
    this.dailyRevenue = initial?.dailyRevenue ?? 0;
    this.dailyExpenses = initial?.dailyExpenses ?? 0;
    this.fuelLevel = initial?.fuelLevel ?? BALANCE.FUEL.startL;
    this.motorcycleCondition = initial?.motorcycleCondition ?? 100;
    this.appBalance = initial?.appBalance ?? 0;
    this.savings = initial?.savings ?? 0;
    this.reputation = initial?.reputation ?? 5.0;
    this.phoneBattery = initial?.phoneBattery ?? 100;

    // Normalize any invalid initial state
    if (!Number.isFinite(this.cash)) this.cash = 0;
    if (this.cash < 0) {
      this.debt += Math.abs(this.cash);
      this.cash = 0;
    }
  }

  /**
   * Posts a transaction. The only mutator of player money.
   * Cash is never NaN. Any negative cash balance immediately converts to debt.
   */
  post(tx: Transaction): void {
    const rawAmount = tx.amount;
    const safeAmount = Number.isFinite(rawAmount) ? rawAmount : 0;

    if (safeAmount > 0) {
      this.cash += safeAmount;
      this.dailyRevenue += safeAmount;
    } else if (safeAmount < 0) {
      this.dailyExpenses += Math.abs(safeAmount);
      this.cash += safeAmount;
      if (this.cash < 0) {
        this.debt += Math.abs(this.cash);
        this.cash = 0;
      }
    }

    // Safety guarantee: cash never NaN
    if (!Number.isFinite(this.cash)) {
      this.cash = 0;
    }
    if (!Number.isFinite(this.debt)) {
      this.debt = 0;
    }

    this.bus.emit('economy/transaction', { tx });
  }

  /**
   * Consumes fuel and emits 'bike/fuelEmpty' when tank reaches 0 L.
   */
  consumeFuel(liters: number): void {
    if (!Number.isFinite(liters) || liters <= 0) return;

    const prev = this.fuelLevel;
    this.fuelLevel = Math.max(0, this.fuelLevel - liters);

    if (this.fuelLevel === 0 && prev > 0) {
      this.bus.emit('bike/fuelEmpty', {});
    }
  }

  refuel(liters: number, pricePerL = BALANCE.FUEL.pricePerL, day = 1, minute = 0): number {
    const space = Math.max(0, BALANCE.FUEL.tankL - this.fuelLevel);
    const added = Math.min(space, Math.max(0, liters));
    if (added <= 0) return 0;

    const cost = Math.round(added * pricePerL);
    this.fuelLevel += added;
    this.post({
      id: `tx_refuel_${day}_${minute}_${++this.txSeq}`,
      day,
      minute,
      kind: 'fuel',
      amount: -cost,
    });
    return added;
  }

  callFriendForFuel(day = 1, minute = 0): { fuelAdded: number; timeCostMin: number } {
    this.post({
      id: `tx_friend_${day}_${minute}_${++this.txSeq}`,
      day,
      minute,
      kind: 'family',
      amount: -100,
    });
    this.fuelLevel = Math.min(BALANCE.FUEL.tankL, this.fuelLevel + 1.0);
    return { fuelAdded: 1.0, timeCostMin: 20 };
  }

  resetDaily(): void {
    this.dailyRevenue = 0;
    this.dailyExpenses = 0;
  }

  getSnapshot(): PlayerEconomy {
    return {
      cash: this.cash,
      debt: this.debt,
      dailyRevenue: this.dailyRevenue,
      dailyExpenses: this.dailyExpenses,
      fuelLevel: Math.round(this.fuelLevel * 100) / 100,
      motorcycleCondition: Math.round(this.motorcycleCondition),
      appBalance: this.appBalance,
      savings: this.savings,
      reputation: this.reputation,
      phoneBattery: Math.round(this.phoneBattery),
    };
  }
}
