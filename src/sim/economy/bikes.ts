import defaultBikes from '../../../data/bikes.json';
import type { BikeId } from '../../core/types';
import type { BikeDef } from '../schemas';
import type { BikeSpec } from '../../physics/bikeModel';
import { BALANCE } from '../../config/balance';

export const BIKES: BikeDef[] = defaultBikes as BikeDef[];

export function getBikeDef(id: BikeId): BikeDef {
  const bike = BIKES.find((b) => b.id === id);
  if (!bike) {
    return BIKES[0]!;
  }
  return bike;
}

/**
 * Calculates trade-in credit for the rider's current motorcycle.
 * Scale: between 40% (broken condition) and 100% (mint condition) of the bike's tradeInBase value.
 */
export function calculateTradeInValue(currentBikeDef: BikeDef, currentCondition: number): number {
  const clampedCond = Math.max(0, Math.min(100, currentCondition));
  const conditionFactor = 0.4 + (clampedCond / 100) * 0.6;
  return Math.round(currentBikeDef.tradeInBase * conditionFactor);
}

/**
 * Calculates the net cost required to buy a new motorcycle with trade-in.
 * If Kamal Bhai relationship is >= 20, awards a 5% dealership discount on the bike price.
 */
export function calculateNetBikePurchaseCost(
  targetBikeDef: BikeDef,
  currentBikeDef: BikeDef,
  currentCondition: number,
  hasKamalDiscount: boolean = false
): number {
  const tradeIn = calculateTradeInValue(currentBikeDef, currentCondition);
  let basePrice = targetBikeDef.price;
  if (hasKamalDiscount) {
    basePrice = Math.round(basePrice * 0.95);
  }
  return Math.max(0, basePrice - tradeIn);
}

/**
 * Converts a BikeDef into a physics BikeSpec, applying any active mechanical upgrades.
 */
export function bikeDefToSpec(bikeDef: BikeDef, brakeUpgrade: boolean = false): BikeSpec {
  const base = BALANCE.BIKE[bikeDef.id] ?? BALANCE.BIKE.old100;
  return {
    ...base,
    vmax: bikeDef.vmax,
    accel: bikeDef.accel,
    brakeDecelDry: bikeDef.brakeDecelDry,
    brakeDecelWet: bikeDef.brakeDecelWet,
    brakeUpgrade,
  };
}

/**
 * Returns fuel efficiency in km/L for a given bike model.
 */
export function getBikeFuelEfficiency(bikeId: BikeId): number {
  return BALANCE.FUEL.kmPerL[bikeId] ?? 40;
}
