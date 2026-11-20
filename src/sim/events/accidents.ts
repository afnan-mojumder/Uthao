import type { GameEvents } from '../../core/events';
import { clamp } from '../../core/math';

export type BikeCollisionEvent = GameEvents['bike/collision'];

export interface AccidentContext {
  id?: string;
  bikeSpeedKmh: number;
  otherSpeedKmh?: number;
  hasPassenger: boolean;
  wet: boolean;
  bikeCondition: number; // 0..100
  pedestrianDensity?: number; // 0..1
  witnesses?: number;
  speeding?: boolean;
  wrongWay?: boolean;
}

export interface AccidentReport {
  id: string;
  severity: 'minor' | 'moderate' | 'serious';
  riderInjury: 0 | 1 | 2;
  passengerInjury: 0 | 1 | 2;
  bikeDamage: number;
  otherParty: boolean;
  responsibility: number; // 0..1
  witnesses: number;
  wet: boolean;
}

/**
 * Assesses collision severity, rider/passenger injury, bike damage, and fair
 * responsibility per MASTER §13 so stopped/low-fault riders are not blamed
 * arbitrarily when NPC traffic hits them.
 */
export function assessAccident(
  ev: BikeCollisionEvent,
  ctx: AccidentContext
): AccidentReport {
  const otherParty = Boolean(ev.otherParty ?? ev.otherKind === 'traffic');
  const wet = Boolean(ctx.wet);
  const witnesses =
    ctx.witnesses !== undefined
      ? Math.max(0, Math.round(ctx.witnesses))
      : Math.round(clamp(ctx.pedestrianDensity ?? 0.3, 0, 1) * 5);

  const relSpeed = Math.max(0, ev.relSpeedKmh);
  const bikeSpeed = Math.max(0, ev.bikeSpeedKmh ?? ctx.bikeSpeedKmh);
  const otherSpeed = Math.max(
    0,
    ev.otherSpeedKmh ?? ctx.otherSpeedKmh ?? (otherParty ? Math.max(0, relSpeed - bikeSpeed) : 0)
  );

  let severity: AccidentReport['severity'];
  let riderInjury: 0 | 1 | 2;
  let passengerInjury: 0 | 1 | 2;
  let bikeDamage: number;

  if (ev.severity === 'scuff' || (ev.severity === 'bump' && relSpeed < 20)) {
    severity = 'minor';
    riderInjury = 0;
    passengerInjury = 0;
    bikeDamage = ev.severity === 'scuff' ? 2 : Math.round(clamp(relSpeed * 0.4, 3, 10));
  } else if (
    ev.severity === 'bump' ||
    (ev.severity === 'crash' && relSpeed < 40 && !(wet && relSpeed >= 32))
  ) {
    severity = 'moderate';
    riderInjury = 1;
    passengerInjury = ctx.hasPassenger ? 1 : 0;
    bikeDamage = Math.round(clamp(relSpeed * 0.5, 10, 25));
  } else {
    severity = 'serious';
    riderInjury = relSpeed >= 45 || (wet && relSpeed >= 36) ? 2 : 1;
    passengerInjury = ctx.hasPassenger ? (relSpeed >= 40 ? 2 : 1) : 0;
    bikeDamage = Math.round(clamp(relSpeed * 0.75, 25, 55));
  }

  let responsibility: number;
  if (otherParty) {
    if (bikeSpeed <= 2 && !ctx.wrongWay) {
      // NPC drove into a stopped bike: very low player fault.
      responsibility = 0.1;
    } else {
      const baseShare = bikeSpeed / Math.max(1, bikeSpeed + otherSpeed);
      let adj = baseShare;
      if (ctx.speeding) adj += 0.2;
      if (ctx.wrongWay) adj += 0.2;
      if (wet) adj -= 0.1;
      responsibility = Math.round(clamp(adj, 0.1, 1.0) * 100) / 100;
    }
  } else {
    let staticFault = 0.85;
    if (wet) staticFault -= 0.1;
    if (ctx.bikeCondition < 30) staticFault -= 0.1;
    if (ctx.speeding) staticFault += 0.1;
    responsibility = Math.round(clamp(staticFault, 0.5, 1.0) * 100) / 100;
  }

  return {
    id:
      ctx.id ??
      `acc_${severity}_${otherParty ? 'traffic' : 'static'}_${Math.round(relSpeed)}`,
    severity,
    riderInjury,
    passengerInjury,
    bikeDamage,
    otherParty,
    responsibility,
    witnesses,
    wet,
  };
}
