import type { BikeId } from '../core/types';
import { BALANCE } from '../config/balance';
import { clamp, degToRad, lerp, angleDiff } from '../core/math';

export interface BikeSpec {
  vmax: number; // m/s
  accel: number; // m/s²
  brakeDecelDry: number; // m/s²
  brakeDecelWet: number; // m/s²
  steerMaxDegAt0: number; // degrees
  steerMaxDegAtVmax: number; // degrees
  leanMaxDeg: number; // degrees
  dryLateralGrip: number;
  wetLateralGrip: number;
  passengerAccelMult: number;
  conditionPenaltyThreshold: number;
  conditionPenaltyMult: number;
  brakeUpgrade?: boolean;
}

export interface BikeState {
  x: number;
  z: number;
  heading: number; // radians (0 = +Z, +PI/2 = +X; positive delta turns left / screen-left)
  speed: number; // m/s
  lean: number; // radians (< 0 leans left, > 0 leans right)
  steer: number; // radians (< 0 steered left, > 0 steered right)
  gear: 1 | 2 | 3 | 4 | 5;
  rpmNorm: number;
  y: number;
  wobble?: boolean;
  crashed?: boolean;
  /** Seconds the brake has been held near standstill before engaging reverse. */
  reverseHoldS?: number;
}

export interface BikeInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1 (-1 = turn left / screen-left in chase cam, +1 = turn right / screen-right in chase cam)
}

export interface BikeEnvironment {
  wet: boolean;
  surface: number; // 0-1, 1 = perfect
  hasPassenger: boolean;
  conditionPct: number; // 0-100
  /** T8.3: empty tank, the bike can only be pushed. */
  fuelEmpty?: boolean;
  /** Optional speed cap (m/s) imposed by flooded standing water. */
  floodSpeedCapMs?: number;
}

export function createDefaultBikeSpec(): BikeSpec {
  return createBikeSpec('old100', false);
}

export function createBikeSpec(bikeId: BikeId = 'old100', brakeUpgrade: boolean = false): BikeSpec {
  const base = BALANCE.BIKE[bikeId] ?? BALANCE.BIKE.old100;
  return {
    ...base,
    brakeUpgrade,
  };
}

export function createDefaultBikeState(): BikeState {
  return {
    x: 0,
    z: 0,
    heading: 0,
    speed: 0,
    lean: 0,
    steer: 0,
    gear: 1,
    rpmNorm: 0.15,
    y: 0,
    wobble: false,
    crashed: false,
    reverseHoldS: 0,
  };
}

const WHEELBASE = 1.35; // metres
/** Reverse: requires near-standstill (< 0.15 m/s) and brake held for 0.25s; capped at walking pace. */
const REVERSE_ENTRY_MS = 0.15;
const REVERSE_HOLD_S = 0.25;
const REVERSE_MAX_MS = 1.5;
const REVERSE_ACCEL = 1.0;
/** Coast-down deceleration (m/s^2) with the throttle released and no brake. */
const COAST_DECEL = 2.0;
/** Brake inputs below this threshold are treated as trigger noise. */
const BRAKE_DEADZONE = 0.05;
/** Steering may ask for up to this multiple of the grip limit before it is clamped. */
const STEER_SLIDE_ALLOWANCE = 1.2;

const GEAR_UPSHIFT_RATIOS = [0, 0.2, 0.38, 0.58, 0.78, 1.01] as const;
const GEAR_DOWNSHIFT_RATIOS = [0, 0.0, 0.15, 0.32, 0.51, 0.7] as const;
const GEAR_MIN_RATIOS = [0, 0.0, 0.08, 0.2, 0.35, 0.52] as const;
const GEAR_MAX_RATIOS = [0, 0.2, 0.38, 0.58, 0.78, 1.0] as const;

export function stepBike(
  state: BikeState,
  input: BikeInput,
  spec: BikeSpec,
  env: BikeEnvironment,
  dt: number,
  out?: BikeState
): BikeState {
  const cleanThrottle = clamp(input.throttle, 0, 1);
  const rawBrake = clamp(input.brake, 0, 1);
  const cleanBrake = rawBrake < BRAKE_DEADZONE ? 0 : rawBrake;

  // Speed-dependent torque curve: strong low-end pull, tapering smoothly toward vmax.
  const fwdRatio = clamp(Math.max(0, state.speed) / spec.vmax, 0, 1);
  const torqueMult = 1.1 - 0.15 * fwdRatio - 0.55 * fwdRatio * fwdRatio;

  let effectiveAccel = spec.accel * torqueMult * cleanThrottle;
  let vmax = spec.vmax;
  if (env.conditionPct < spec.conditionPenaltyThreshold) {
    effectiveAccel *= spec.conditionPenaltyMult;
    vmax *= BALANCE.WEAR.wornVmaxMult;
  }
  if (env.fuelEmpty) {
    vmax = BALANCE.FUEL.pushSpeedMs;
    effectiveAccel = Math.min(effectiveAccel, BALANCE.FUEL.pushAccel * cleanThrottle);
  }
  if (env.hasPassenger) {
    effectiveAccel *= spec.passengerAccelMult;
  }
  if (env.floodSpeedCapMs !== undefined) {
    vmax = Math.min(vmax, Math.max(0, env.floodSpeedCapMs));
  }

  let baseBrake = env.wet ? spec.brakeDecelWet : spec.brakeDecelDry;
  if (spec.brakeUpgrade) {
    baseBrake /= 0.8; // -20% stopping distance
  }
  const effectiveBrake = baseBrake * cleanBrake;

  // Speed update
  const prevHold = state.reverseHoldS ?? 0;
  let newReverseHoldS = 0;
  let newSpeed = state.speed;

  if (effectiveBrake > 0) {
    if (cleanThrottle <= 0) {
      if (state.speed < 0) {
        newReverseHoldS = REVERSE_HOLD_S;
        newSpeed = Math.max(-REVERSE_MAX_MS, newSpeed - REVERSE_ACCEL * dt);
      } else if (Math.abs(state.speed) < REVERSE_ENTRY_MS) {
        newReverseHoldS = Math.min(REVERSE_HOLD_S, prevHold + dt);
        if (prevHold >= REVERSE_HOLD_S - 1e-6) {
          newSpeed = Math.max(-REVERSE_MAX_MS, newSpeed - REVERSE_ACCEL * dt);
        } else {
          newSpeed = Math.max(0, newSpeed - effectiveBrake * dt);
        }
      } else {
        newSpeed = Math.max(0, newSpeed - effectiveBrake * dt);
      }
    } else if (state.speed < 0) {
      newSpeed = Math.min(0, newSpeed + effectiveBrake * dt);
    } else {
      newSpeed = Math.max(0, newSpeed - effectiveBrake * dt);
    }
  } else if (effectiveAccel > 0 && newSpeed < vmax) {
    newSpeed = Math.min(vmax, newSpeed + effectiveAccel * dt);
  } else if (cleanThrottle <= 0) {
    // Off the throttle the bike coasts down smoothly: rolling resistance and engine drag.
    if (newSpeed > 0) {
      newSpeed = Math.max(0, newSpeed - COAST_DECEL * dt);
    } else if (newSpeed < 0) {
      newSpeed = Math.min(0, newSpeed + COAST_DECEL * dt);
    }
  }
  if (newSpeed > vmax) {
    // Throttle cut, worn, or flood drag: bleed speed down to the cap instead of snapping.
    newSpeed = Math.max(vmax, newSpeed - 4.0 * dt);
  }

  // 5-speed automatic shift schedule + normalized engine RPM
  let newGear: 1 | 2 | 3 | 4 | 5 = state.gear ?? 1;
  let newRpmNorm: number;
  if (newSpeed <= 0) {
    newGear = 1;
    newRpmNorm = clamp(0.15 + (Math.abs(newSpeed) / REVERSE_MAX_MS) * 0.2, 0.15, 1.0);
  } else {
    const ratio = clamp(newSpeed / spec.vmax, 0, 1);
    while (newGear < 5 && ratio >= GEAR_UPSHIFT_RATIOS[newGear]) {
      newGear = (newGear + 1) as 1 | 2 | 3 | 4 | 5;
    }
    while (newGear > 1 && ratio < GEAR_DOWNSHIFT_RATIOS[newGear]) {
      newGear = (newGear - 1) as 1 | 2 | 3 | 4 | 5;
    }
    const minR = GEAR_MIN_RATIOS[newGear];
    const maxR = GEAR_MAX_RATIOS[newGear];
    const band = clamp((ratio - minR) / (maxR - minR), 0, 1);
    newRpmNorm = clamp(0.15 + band * 0.8 + cleanThrottle * 0.05, 0.15, 1.0);
  }

  // Speed-scaled steering angle
  const speedRatio = clamp(newSpeed / spec.vmax, 0, 1);
  const maxSteerDeg = lerp(spec.steerMaxDegAt0, spec.steerMaxDegAtVmax, speedRatio);
  const targetSteerRad = clamp(input.steer, -1, 1) * degToRad(maxSteerDeg);
  const newSteer = lerp(state.steer, targetSteerRad, clamp(dt * 20, 0, 1));

  // Lateral grip budget. The tyres can give this much sideways force, plus a
  // small slide allowance at the limit (which shows as wobble). Steer beyond
  // that is clamped, so a hard turn bends the path rather than bleeding speed
  // (audit H-3). Steering alone never crashes the bike; collisions do.
  const grip = env.wet ? spec.wetLateralGrip : spec.dryLateralGrip;
  const gripLimit = 9.81 * grip * clamp(env.surface, 0.1, 1.0);
  const absSpeed = Math.abs(newSpeed);
  const maxYawRate =
    absSpeed > 0.5 ? (gripLimit * STEER_SLIDE_ALLOWANCE) / absSpeed : Infinity;

  // Yaw rate from kinematic bicycle model, within the grip budget.
  // Heading increases toward +X (screen-left when facing +Z), so steer < 0 (left) produces yawRate > 0.
  const rawYawRate = -(newSpeed * Math.tan(newSteer)) / WHEELBASE;
  const yawRate = clamp(rawYawRate, -maxYawRate, maxYawRate);
  const newHeading = angleDiff(0, state.heading + yawRate * dt);

  // Lateral acceleration against the grip budget
  const aLat = Math.abs(newSpeed * yawRate);
  const gripRatio = gripLimit > 0 ? aLat / gripLimit : 0;

  const wobble = gripRatio > 1.0;
  const crashed = false;

  // Lean angle derived from lateral acceleration (capped at leanMaxDeg):
  // lean > 0 leans right (yawRate < 0 when moving forward), lean < 0 leans left.
  const maxLean = degToRad(spec.leanMaxDeg);
  const targetLean = clamp(Math.atan2(-newSpeed * yawRate, 9.81), -maxLean, maxLean);
  const newLean = lerp(state.lean, targetLean, clamp(dt * 12, 0, 1));

  // Position integration
  const avgSpeed = (state.speed + newSpeed) / 2;
  const newX = state.x + Math.sin(newHeading) * avgSpeed * dt;
  const newZ = state.z + Math.cos(newHeading) * avgSpeed * dt;

  if (out) {
    out.x = newX;
    out.z = newZ;
    out.heading = newHeading;
    out.speed = newSpeed;
    out.lean = newLean;
    out.steer = newSteer;
    out.gear = newGear;
    out.rpmNorm = newRpmNorm;
    out.y = state.y;
    out.wobble = wobble;
    out.crashed = crashed;
    out.reverseHoldS = newReverseHoldS;
    return out;
  }

  return {
    x: newX,
    z: newZ,
    heading: newHeading,
    speed: newSpeed,
    lean: newLean,
    steer: newSteer,
    gear: newGear,
    rpmNorm: newRpmNorm,
    y: state.y,
    wobble,
    crashed,
    reverseHoldS: newReverseHoldS,
  };
}
