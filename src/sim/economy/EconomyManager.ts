import type { EventBus } from '../../core/events';
import type { GameEvents } from '../../core/events';
import type { PlayerEconomy, Transaction } from '../../core/types';
import { BALANCE } from '../../config/balance';
import {
  type RepairItem,
  type UpgradeDef,
  calculateRepairCost,
  calculateUpgradeCost,
} from './maintenance';

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
  rentMissedCount: number = 0;
  engineCondition: number = 85;
  tiresCondition: number = 80;
  brakesCondition: number = 85;
  kmSinceOilChange: number = 15;
  ownedUpgrades: string[] = [];
  installedCosmetics: { paint?: string; seatCover?: string } = {};

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
    this.engineCondition = initial?.engineCondition ?? 85;
    this.tiresCondition = initial?.tiresCondition ?? 80;
    this.brakesCondition = initial?.brakesCondition ?? 85;
    this.kmSinceOilChange = initial?.kmSinceOilChange ?? 15;
    this.ownedUpgrades = initial?.ownedUpgrades ? [...initial.ownedUpgrades] : [];
    this.installedCosmetics = initial?.installedCosmetics ? { ...initial.installedCosmetics } : {};
    this.motorcycleCondition = this.getOverallCondition();

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

  drainBattery(percent: number): void {
    if (!Number.isFinite(percent) || percent <= 0) return;
    this.phoneBattery = Math.max(0, this.phoneBattery - percent);
  }

  chargeBattery(amount: number = 100, cost: number = 10, day = 1, minute = 0): void {
    this.phoneBattery = Math.min(100, Math.max(0, this.phoneBattery + amount));
    if (cost > 0) {
      this.post({
        id: `tx_charge_${day}_${minute}_${++this.txSeq}`,
        day,
        minute,
        kind: 'phoneData',
        amount: -cost,
      });
    }
  }

  isPhoneDead(): boolean {
    return this.phoneBattery <= 0;
  }

  postDailyLivingExpenses(
    day: number,
    minute = 0,
    options?: { delayRent?: boolean }
  ): {
    food: number;
    phoneData: number;
    rent: number;
    family: number;
    total: number;
    rentDelayed?: boolean;
    evictionWarning?: boolean;
  } {
    const food = BALANCE.LIVING.foodPerDay;
    const phoneData = BALANCE.LIVING.phoneDataPerDay;
    let rent = 0;
    let family = 0;
    let rentDelayed = false;
    let evictionWarning = false;

    // 1. Food
    this.post({
      id: `tx_food_${day}_${minute}_${++this.txSeq}`,
      day,
      minute,
      kind: 'food',
      amount: -food,
    });

    // 2. Phone data
    this.post({
      id: `tx_data_${day}_${minute}_${++this.txSeq}`,
      day,
      minute,
      kind: 'phoneData',
      amount: -phoneData,
    });

    // 3. Family payment (e.g. Day 3)
    if (day === 3 && BALANCE.LIVING.familyPaymentDay3 > 0) {
      family = BALANCE.LIVING.familyPaymentDay3;
      this.post({
        id: `tx_family_${day}_${minute}_${++this.txSeq}`,
        day,
        minute,
        kind: 'family',
        amount: -family,
      });
    }

    // 4. Rent (on rent days: 7, 14, 20)
    if (BALANCE.LIVING.rentDueDays.includes(day)) {
      const rentAmount = BALANCE.LIVING.rentAmount;
      rent = rentAmount;

      if (options?.delayRent || this.cash < rentAmount) {
        this.rentMissedCount++;
        if (this.rentMissedCount === 1) {
          rentDelayed = true;
        } else if (this.rentMissedCount >= 2) {
          evictionWarning = true;
        }
      }

      this.post({
        id: `tx_rent_${day}_${minute}_${++this.txSeq}`,
        day,
        minute,
        kind: 'rent',
        amount: -rentAmount,
      });
    }

    const total = food + phoneData + rent + family;
    return {
      food,
      phoneData,
      rent,
      family,
      total,
      rentDelayed,
      evictionWarning,
    };
  }

  askAdvance(
    from: 'mintu' | 'ma',
    amount: number,
    day = 1,
    minute = 0
  ): void {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.cash += amount;
    this.debt += amount;
    this.bus.emit('economy/transaction', {
      tx: {
        id: `tx_advance_${from}_${day}_${minute}_${++this.txSeq}`,
        day,
        minute,
        kind: 'family',
        amount,
      },
    });
  }

  getOverallCondition(): number {
    const oilFreshness = Math.max(
      0,
      100 - (this.kmSinceOilChange / BALANCE.WEAR.oilEveryKm) * 100
    );
    return Math.round(
      (this.engineCondition +
        this.tiresCondition +
        this.brakesCondition +
        oilFreshness) /
        4
    );
  }

  hasUpgrade(upgradeId: string): boolean {
    return this.ownedUpgrades.includes(upgradeId);
  }

  repair(
    item: RepairItem,
    atKamalBhai = false,
    kamalRelationship = 0,
    day = 1,
    minute = 0
  ): { success: boolean; cost: number; reason?: string } {
    const cost = calculateRepairCost(item, atKamalBhai, kamalRelationship);
    if (this.cash < cost) {
      return { success: false, cost, reason: 'Insufficient funds' };
    }

    this.post({
      id: `tx_repair_${item}_${day}_${minute}_${++this.txSeq}`,
      day,
      minute,
      kind: 'repair',
      amount: -cost,
    });

    switch (item) {
      case 'engine':
        this.engineCondition = 100;
        break;
      case 'tires':
        this.tiresCondition = 100;
        break;
      case 'brakes':
        this.brakesCondition = 100;
        break;
      case 'oil':
        this.kmSinceOilChange = 0;
        break;
      case 'full':
        this.engineCondition = 100;
        this.tiresCondition = 100;
        this.brakesCondition = 100;
        this.kmSinceOilChange = 0;
        break;
    }
    this.motorcycleCondition = this.getOverallCondition();
    return { success: true, cost };
  }

  buyUpgrade(
    upgrade: UpgradeDef,
    atKamalBhai = false,
    kamalRelationship = 0,
    day = 1,
    minute = 0
  ): { success: boolean; cost: number; reason?: string } {
    if (this.ownedUpgrades.includes(upgrade.id)) {
      return { success: false, cost: 0, reason: 'Already owned' };
    }

    const cost = calculateUpgradeCost(upgrade.cost, atKamalBhai, kamalRelationship);
    if (this.cash < cost) {
      return { success: false, cost, reason: 'Insufficient funds' };
    }

    this.post({
      id: `tx_upgrade_${upgrade.id}_${day}_${minute}_${++this.txSeq}`,
      day,
      minute,
      kind: 'upgrade',
      amount: -cost,
    });

    this.ownedUpgrades.push(upgrade.id);

    if (upgrade.category === 'cosmetic') {
      if (upgrade.color) {
        this.installedCosmetics.paint = upgrade.color;
      }
      if (upgrade.type) {
        this.installedCosmetics.seatCover = upgrade.type;
      }
    }

    return { success: true, cost };
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
      engineCondition: Math.round(this.engineCondition),
      tiresCondition: Math.round(this.tiresCondition),
      brakesCondition: Math.round(this.brakesCondition),
      kmSinceOilChange: Math.round(this.kmSinceOilChange),
      ownedUpgrades: [...this.ownedUpgrades],
      installedCosmetics: { ...this.installedCosmetics },
    };
  }

  restoreState(econ: Partial<PlayerEconomy>): void {
    if (econ.cash !== undefined) this.cash = econ.cash;
    if (econ.savings !== undefined) this.savings = econ.savings;
    if (econ.debt !== undefined) this.debt = econ.debt;
    if (econ.dailyRevenue !== undefined) this.dailyRevenue = econ.dailyRevenue;
    if (econ.dailyExpenses !== undefined) this.dailyExpenses = econ.dailyExpenses;
    if (econ.fuelLevel !== undefined) this.fuelLevel = econ.fuelLevel;
    if (econ.engineCondition !== undefined) this.engineCondition = econ.engineCondition;
    if (econ.tiresCondition !== undefined) this.tiresCondition = econ.tiresCondition;
    if (econ.brakesCondition !== undefined) this.brakesCondition = econ.brakesCondition;
    if (econ.kmSinceOilChange !== undefined) this.kmSinceOilChange = econ.kmSinceOilChange;
    if (econ.appBalance !== undefined) this.appBalance = econ.appBalance;
    if (econ.reputation !== undefined) this.reputation = econ.reputation;
    if (econ.phoneBattery !== undefined) this.phoneBattery = econ.phoneBattery;
    if (econ.ownedUpgrades) this.ownedUpgrades = [...econ.ownedUpgrades];
    if (econ.installedCosmetics) this.installedCosmetics = { ...econ.installedCosmetics };
    if (econ.motorcycleCondition !== undefined) {
      this.motorcycleCondition = econ.motorcycleCondition;
    } else {
      this.motorcycleCondition = this.getOverallCondition();
    }
  }
}
