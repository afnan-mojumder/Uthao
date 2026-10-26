import { BALANCE } from '../../config/balance';
import { clamp } from '../../core/math';

export interface IDMParameters {
  a: number; // Maximum acceleration (m/s^2)
  b: number; // Comfortable deceleration (m/s^2)
  s0: number; // Minimum safe gap (m)
  T: number; // Safe time headway (s)
  delta: number; // Acceleration exponent
}

export const DEFAULT_IDM_PARAMS: IDMParameters = {
  a: BALANCE.TRAFFIC.idm.a,
  b: BALANCE.TRAFFIC.idm.b,
  s0: BALANCE.TRAFFIC.idm.s0,
  T: BALANCE.TRAFFIC.idm.T,
  delta: BALANCE.TRAFFIC.idm.delta,
};

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
  params: IDMParameters = DEFAULT_IDM_PARAMS
): { newPos: number; newSpeed: number; gap: number } {
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
      newSpeed = Math.min(newSpeed, leader.speed);
    }
  }

  const newPos = follower.pos + moveDist;
  const finalGap = leader
    ? leader.pos - leader.length / 2 - (newPos + follower.length / 2)
    : Infinity;

  return {
    newPos,
    newSpeed,
    gap: Math.max(0.1, finalGap),
  };
}
