import { BALANCE } from '../../config/balance';
import type { Rng } from '../../core/rng';

export interface UpgradeEffects {
  goodTires?: boolean;
  punctureReduction?: number;
  wetGripBonus?: number;
  engineTune?: boolean;
  fuelPerKmReduction?: number;
  brakeUpgrade?: boolean;
  stoppingDistanceReduction?: number;
  unlocksLuggage?: boolean;
  unlocksDeliveries?: boolean;
  ledHeadlight?: boolean;
  batteryDrainReduction?: number;
}

export interface UpgradeDef {
  id: string;
  category: 'mechanical' | 'cosmetic';
  nameKey: string;
  descKey: string;
  cost: number;
  icon?: string;
  color?: string;
  type?: string;
  effects?: UpgradeEffects;
}

export interface MaintenanceStatus {
  kmSinceOilChange: number;
  condition: number; // 0-100
  goodTires: boolean;
}

export function conditionWear(virtualKm: number): number {
  return Math.max(0, virtualKm) * BALANCE.WEAR.conditionPerKm;
}

export function isOilChangeDue(kmSinceLastChange: number): boolean {
  return kmSinceLastChange >= BALANCE.WEAR.oilEveryKm;
}

export function checkPuncture(
  virtualKm: number,
  surfaceCondition: number, // 0-1, 1 = perfect
  isFlooded: boolean,
  goodTires: boolean,
  rng: Rng
): boolean {
  let mult = 1.0;
  if (surfaceCondition < 0.5) {
    mult *= BALANCE.PUNCTURE.poorSurfaceMult;
  }
  if (isFlooded) {
    mult *= BALANCE.PUNCTURE.floodedMult;
  }
  if (goodTires) {
    mult *= BALANCE.PUNCTURE.goodTiresMult;
  }

  const pPerKm = BALANCE.PUNCTURE.basePerKm * mult;
  const pTotal = 1 - Math.exp(-pPerKm * Math.max(0, virtualKm));
  return rng.chance(pTotal);
}

export type RepairItem = 'engine' | 'tires' | 'brakes' | 'oil' | 'full';

export const BASE_REPAIR_COSTS: Record<RepairItem, number> = {
  engine: 400,
  tires: 250,
  brakes: 200,
  oil: BALANCE.WEAR.oilCost, // 350
  full: 1200,
};

/**
 * Calculates repair cost.
 * Cheaper at Kamal bhai with relationship >= 20: -20% discount.
 */
export function calculateRepairCost(
  item: RepairItem,
  atKamalBhai = false,
  kamalRelationship = 0
): number {
  const base = BASE_REPAIR_COSTS[item];
  if (atKamalBhai && kamalRelationship >= 20) {
    return Math.round(base * 0.8);
  }
  return base;
}

/**
 * Calculates upgrade cost.
 * Cheaper at Kamal bhai with relationship >= 20: -20% discount.
 */
export function calculateUpgradeCost(
  baseCost: number,
  atKamalBhai = false,
  kamalRelationship = 0
): number {
  if (atKamalBhai && kamalRelationship >= 20) {
    return Math.round(baseCost * 0.8);
  }
  return baseCost;
}

/**
 * Returns effective wet lateral grip.
 * Good tires upgrade raises wet grip (base 0.70 -> 0.88).
 */
export function effectiveWetGrip(baseWetGrip: number, goodTires: boolean): number {
  if (goodTires) {
    return Math.min(1.0, Math.round(baseWetGrip * 1.25 * 100) / 100);
  }
  return baseWetGrip;
}

/**
 * Returns effective fuel consumption multiplier per km.
 * Engine tune lowers fuel per km by 15%.
 */
export function effectiveFuelRateMultiplier(engineTune: boolean): number {
  if (engineTune) {
    return 1 - BALANCE.FUEL.engineTuneBonus; // 0.85 (-15%)
  }
  return 1.0;
}

