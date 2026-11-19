import { BALANCE } from '../../config/balance';
import { clamp } from '../../core/math';
import type { TrafficVehicleKind } from './TrafficManager';

export interface IDMParameters {
  a: number; // Maximum acceleration (m/s^2)
  b: number; // Comfortable deceleration (m/s^2)
  s0: number; // Minimum safe gap (m)
  T: number; // Safe time headway (s)
  delta: number; // Acceleration exponent
}

export interface CarFollowingResult {
  newPos: number;
  newSpeed: number;
  gap: number;
}

export const DEFAULT_IDM_PARAMS: IDMParameters = {
  a: BALANCE.TRAFFIC.idm.a,
  b: BALANCE.TRAFFIC.idm.b,
  s0: BALANCE.TRAFFIC.idm.s0,
  T: BALANCE.TRAFFIC.idm.T,
  delta: BALANCE.TRAFFIC.idm.delta,
};

/** Tailored IDM parameters per Dhaka vehicle class (nimble two/three-wheelers vs heavy buses/trucks). */
export const VEHICLE_IDM_PARAMS: Record<TrafficVehicleKind, IDMParameters> = {
  car: { a: 1.8, b: 2.6, s0: 2.0, T: 1.2, delta: 4.0 },
  ride_hailing_car: { a: 1.9, b: 2.6, s0: 1.9, T: 1.15, delta: 4.0 },
  bus: { a: 0.9, b: 1.8, s0: 2.8, T: 1.6, delta: 4.0 },
  minibus: { a: 1.3, b: 2.2, s0: 2.2, T: 1.3, delta: 4.0 },
  truck: { a: 0.75, b: 1.6, s0: 3.2, T: 1.8, delta: 4.0 },
  delivery_van: { a: 1.2, b: 2.1, s0: 2.4, T: 1.4, delta: 4.0 },
  cng: { a: 2.1, b: 2.8, s0: 1.4, T: 0.95, delta: 4.0 },
  motorcycle: { a: 2.6, b: 3.5, s0: 1.2, T: 0.85, delta: 4.0 },
  scooter: { a: 2.2, b: 3.0, s0: 1.3, T: 0.95, delta: 4.0 },
  rickshaw: { a: 0.9, b: 2.2, s0: 1.2, T: 1.0, delta: 4.0 },
  bicycle: { a: 1.1, b: 2.4, s0: 1.1, T: 0.9, delta: 4.0 },
  vendor_cart: { a: 0.5, b: 1.8, s0: 1.3, T: 1.1, delta: 4.0 },
};

export function getIdmParams(kind: TrafficVehicleKind): IDMParameters {
  return VEHICLE_IDM_PARAMS[kind] ?? DEFAULT_IDM_PARAMS;
}

/**
 * Calculates acceleration using the Intelligent Driver Model (IDM).
 * @param v Current vehicle speed (m/s)
 * @param v0 Desired speed / target speed limit (m/s)
 * @param s Distance to leader bumper (m). Use Infinity if no leader.
 * @param deltaV Relative speed (v - v_lead) (m/s). Positive when closing in on leader.
 * @param params IDM parameters
 */
export function calcIDMAcceleration(
  v: number,
  v0: number,
  s: number,
  deltaV: number,
  params: IDMParameters = DEFAULT_IDM_PARAMS
): number {
  const safeV = Math.max(0, v);
  const safeV0 = Math.max(0.1, v0);

  // Free road acceleration term
  const freeTerm = 1 - Math.pow(safeV / safeV0, params.delta);

  // Interaction term
  let interactionTerm = 0;
  if (Number.isFinite(s)) {
    const sStar =
      params.s0 +
      Math.max(
        0,
        safeV * params.T +
          (safeV * deltaV) / (2 * Math.sqrt(Math.max(0.01, params.a * params.b)))
      );
    const effectiveS = Math.max(0.1, s);
    interactionTerm = Math.pow(sStar / effectiveS, 2);
  }

  const rawAccel = params.a * (freeTerm - interactionTerm);
  // Cap extreme braking to realistic physics (e.g. -12 m/s^2)
  return clamp(rawAccel, -12, params.a);
}

/**
 * Advances a follower vehicle along a line behind a leader using IDM.
 * Strictly guarantees that follower never overlaps the leader (s >= 0.1).
 */
export function stepCarFollowing(
  follower: { pos: number; speed: number; length: number },
  leader: { pos: number; speed: number; length: number } | null,
  speedLimit: number,
  dt: number,
  params: IDMParameters = DEFAULT_IDM_PARAMS,
  out?: CarFollowingResult
): CarFollowingResult {
  let s = Infinity;
  let deltaV = 0;

  if (leader) {
    // Gap bumper to bumper: leader rear - follower front
    const leaderRear = leader.pos - leader.length / 2;
    const followerFront = follower.pos + follower.length / 2;
    s = leaderRear - followerFront;
    deltaV = follower.speed - leader.speed;
  }

  const accel = calcIDMAcceleration(follower.speed, speedLimit, s, deltaV, params);
  let newSpeed = Math.max(0, follower.speed + accel * dt);
  let moveDist = ((follower.speed + newSpeed) / 2) * dt;

  // Collision prevention clamp: follower front must NEVER pass leader rear
  if (leader) {
    const maxAllowedFront = leader.pos - leader.length / 2 - 0.1;
    const proposedFront = follower.pos + follower.length / 2 + moveDist;
    if (proposedFront > maxAllowedFront) {
      moveDist = Math.max(0, maxAllowedFront - (follower.pos + follower.length / 2));
      newSpeed = Math.max(0, Math.min(newSpeed, Math.max(0, leader.speed)));
    }
  }

  const newPos = follower.pos + moveDist;
  const finalGap = leader
    ? leader.pos - leader.length / 2 - (newPos + follower.length / 2)
    : Infinity;
  const clampedGap = Math.max(0.1, finalGap);

  if (out) {
    out.newPos = newPos;
    out.newSpeed = newSpeed;
    out.gap = clampedGap;
    return out;
  }

  return {
    newPos,
    newSpeed,
    gap: clampedGap,
  };
}
