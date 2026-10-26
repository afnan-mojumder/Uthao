import { BALANCE } from '../../config/balance';
import type { Rng } from '../../core/rng';

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
