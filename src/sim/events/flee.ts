import { Rng } from '../../core/rng';
import { clamp } from '../../core/math';

export type CrimeOutcome = 'harmless' | 'suspicious' | 'dangerous';

export interface SegmentEncounterParams {
  riskLevel: number; // 0.0 - 1.0
  minute: number; // game minute (0 - 1440)
  visibility?: number; // 0.0 - 1.0, default 1.0
  storyMult?: number; // default 1.0
  isReckless?: boolean; // player behavior multiplier (1.3 if reckless)
}

/**
 * Returns time multiplier for crime encounter probability per GDD §6 / §8:
 * - lateNight: 23:00 - 05:00 -> 2.0
 * - night: 18:30 - 23:00 -> 1.5
 * - day: otherwise -> 1.0
 */
export function getTimeMultiplier(minute: number): number {
  const m = ((minute % 1440) + 1440) % 1440;
  // Late night: 23:00 (1380) to 05:00 (300)
  if (m >= 1380 || m < 300) {
    return 2.0;
  }
  // Night: 18:30 (1110) to 23:00 (1380)
  if (m >= 1110 && m < 1380) {
    return 1.5;
  }
  return 1.0;
}

/**
 * Calculates per-segment encounter probability per GDD §6:
 * P(encounter on segment per trip) =
 *   riskLevel * 0.02 * timeMult(night 1.5, lateNight 2) * (1 + 0.5 * (1 - visibility)) * storyMult * playerMult(reckless 1.3)
 */
export function calculateSegmentEncounterProbability(
  params: SegmentEncounterParams
): number {
  const risk = clamp(params.riskLevel, 0, 1);
  const timeMult = getTimeMultiplier(params.minute);
  const vis = clamp(params.visibility ?? 1.0, 0, 1);
  const visFactor = 1.0 + 0.5 * (1.0 - vis);
  const storyMult = params.storyMult ?? 1.0;
  const playerMult = params.isReckless ? 1.3 : 1.0;

  const prob = risk * 0.02 * timeMult * visFactor * storyMult * playerMult;
  return clamp(prob, 0, 1);
}

/**
 * Samples the encounter outcome per GDD §6:
 * outcome split: harmless 0.6 / suspicious 0.3 / dangerous 0.1
 */
export function sampleCrimeOutcome(rng: Rng): CrimeOutcome {
  const roll = rng.next();
  if (roll < 0.6) {
    return 'harmless';
  }
  if (roll < 0.9) {
    return 'suspicious';
  }
  return 'dangerous';
}

export interface FleeParams {
  speedKmh: number;
  bikeCondition: number; // 0 - 100
  rng?: Rng;
}

export interface FleeResult {
  success: boolean;
  probability: number;
}

/**
 * Resolves flee attempt per GDD §8 / T4.6:
 * if bike speed > 15 km/h and condition > 50, success 80%, else 40%;
 * failure -> forced comply
 */
export function resolveFlee(params: FleeParams): FleeResult {
  const highSpeed = params.speedKmh > 15;
  const goodCondition = params.bikeCondition > 50;

  const probability = highSpeed && goodCondition ? 0.8 : 0.4;
  const rng = params.rng ?? new Rng(1);
  const success = rng.next() < probability;

  return { success, probability };
}

export interface RobberyResult {
  cashLost: number;
  remainingCash: number;
  lostPhone: boolean;
}

/**
 * Resolves robbery compliance per GDD §8 / T4.6:
 * - Takes 40–70% cash-on-hand.
 * - NEVER touches savings or appBalance.
 * - May lose phone (e.g. 20% chance).
 */
export function resolveRobbery(
  cashOnHand: number,
  rng: Rng = new Rng(1)
): RobberyResult {
  const safeCash = Math.max(0, cashOnHand);
  const lossFraction = rng.range(0.4, 0.7);
  const cashLost = Math.min(safeCash, Math.round(safeCash * lossFraction));
  const remainingCash = safeCash - cashLost;
  const lostPhone = rng.chance(0.2);

  return {
    cashLost,
    remainingCash,
    lostPhone,
  };
}

/**
 * Evaluates whether a ride request exhibits suspicious cues per GDD §8:
 * - fare >= 1.6x fair fare
 * - pickup on a deadEnd alley after 21:00 (1260 min)
 * - destination change to a dark alley
 */
export function isSuspiciousRequest(params: {
  initialFare: number;
  fairFare: number;
  minute: number;
  roadType?: string;
  isDeadEnd?: boolean;
}): boolean {
  if (params.fairFare > 0 && params.initialFare >= 1.6 * params.fairFare) {
    return true;
  }
  const m = ((params.minute % 1440) + 1440) % 1440;
  if (m >= 1260 || m < 300) {
    if (params.isDeadEnd || params.roadType === 'alley') {
      return true;
    }
  }
  return false;
}
