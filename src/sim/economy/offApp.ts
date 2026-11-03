import { BALANCE } from '../../config/balance';

/** T8.6: chance an off-app fare goes unpaid. Less reliable passengers stiff the rider more often. */
export function offAppNonPayChance(paymentReliability: number): number {
  const reliability = Math.min(1, Math.max(0, paymentReliability));
  return Math.min(BALANCE.OFF_APP.nonPayMaxChance, (1 - reliability) * BALANCE.OFF_APP.nonPayFactor);
}

/** T8.6: what an off-app ride actually pays. `roll` is a uniform 0..1 draw from the caller's seeded RNG. */
export function offAppPayout(
  fare: number,
  paymentReliability: number,
  roll: number
): { paid: number; unpaid: boolean } {
  const unpaid = roll < offAppNonPayChance(paymentReliability);
  return { paid: unpaid ? 0 : fare, unpaid };
}

/** T8.6: chance an `unreliable` passenger contests a finished ride. Other archetypes never dispute. */
export function disputeChance(archetype: string, paymentReliability: number): number {
  if (archetype !== 'unreliable') return 0;
  const reliability = Math.min(1, Math.max(0, paymentReliability));
  return Math.min(0.5, (1 - reliability) * 1.2); // ponytail: T8.6 placeholder, tune in T11.3.
}

export function isDisputed(archetype: string, paymentReliability: number, roll: number): boolean {
  return roll < disputeChance(archetype, paymentReliability);
}
