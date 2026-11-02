import { BALANCE } from '../../config/balance';
import type { BookingType, TripReceipt } from '../../core/types';

export interface FuelOptions {
  model?: 'old100' | 'used125' | 'new150';
  engineTune?: boolean;
}

/**
 * Calculates liters of fuel consumed for a given trip or duration.
 * @param virtualKm Distance driven in virtual km
 * @param idleGameMin Time spent idling in traffic in game minutes
 * @param options Bike model or upgrade options
 */
export function fuelUsed(
  virtualKm: number,
  idleGameMin = 0,
  options?: FuelOptions
): number {
  const model = options?.model ?? 'old100';
  const kmPerL = BALANCE.FUEL.kmPerL[model] ?? BALANCE.FUEL.kmPerL.old100;

  const drivingLiters = Math.max(0, virtualKm) / kmPerL;
  const idleHours = Math.max(0, idleGameMin) / 60;
  const idleLiters = idleHours * BALANCE.FUEL.idleLPerGameHour;

  let total = drivingLiters + idleLiters;
  if (options?.engineTune) {
    total *= 1 - BALANCE.FUEL.engineTuneBonus;
  }

  return total;
}

export function fuelCost(fuelLiters: number, pricePerL = BALANCE.FUEL.pricePerL): number {
  return Math.round(fuelLiters * pricePerL);
}

export interface RideReceiptOptions {
  requestId: string;
  fare: number;
  tip?: number;
  bookingType?: BookingType;
  durationMin: number;
  distanceKm: number;
  idleMin?: number;
  rating?: number | null;
  consequences?: string[];
  otherCosts?: number;
  bonus?: number;
  penalties?: number;
  compensation?: number;
  /** Fuel burned over the trip. When omitted it is derived from distance and idle time. */
  fuelLiters?: number;
  spec?: FuelOptions;
}

/**
 * Computes official TripReceipt matching GDD §10:
 * Net earnings = fare + tip + bonus - commission - fuelCost - otherCosts - penalties - compensation
 * `fuelCost` is the value of fuel burned (non-cash; the tank is bought at the pump).
 */
export function receipt(ride: RideReceiptOptions): TripReceipt {
  const fare = Math.max(0, Math.round(ride.fare));
  const tip = Math.max(0, Math.round(ride.tip ?? 0));

  // Off-app and direct rides have 0% commission
  const commissionRate =
    ride.bookingType === 'offApp' || ride.bookingType === 'direct'
      ? 0
      : BALANCE.COMMISSION_APP;
  const commission = Math.round(fare * commissionRate);

  const liters = ride.fuelLiters ?? fuelUsed(ride.distanceKm, ride.idleMin ?? 0, ride.spec);
  const costOfFuel = fuelCost(liters);
  const otherCosts = Math.max(0, Math.round(ride.otherCosts ?? 0));
  const bonus = Math.max(0, Math.round(ride.bonus ?? 0));
  const penalties = Math.max(0, Math.round(ride.penalties ?? 0));
  const compensation = Math.max(0, Math.round(ride.compensation ?? 0));

  const net = fare + tip + bonus - commission - costOfFuel - otherCosts - penalties - compensation;

  return {
    requestId: ride.requestId,
    fare,
    tip,
    commission,
    fuelCost: costOfFuel,
    otherCosts,
    bonus,
    penalties,
    compensation,
    fuelLiters: liters,
    net,
    durationMin: ride.durationMin,
    distanceKm: ride.distanceKm,
    rating: ride.rating ?? 5,
    consequences: ride.consequences ?? [],
  };
}
