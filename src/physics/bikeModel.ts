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
  heading: number; // radians
  speed: number; // m/s
  lean: number; // radians
  steer: number; // radians
  wobble?: boolean;
  crashed?: boolean;
}

export interface BikeInput {
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
}

export interface BikeEnvironment {
  wet: boolean;
  surface: number; // 0-1, 1 = perfect
  hasPassenger: boolean;
  conditionPct: number; // 0-100
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
    wobble: false,
    crashed: false,
  };
}

const WHEELBASE = 1.35; // metres

export function stepBike(
  state: BikeState,
  input: BikeInput,
  spec: BikeSpec,
  env: BikeEnvironment,
  dt: number,
  out?: BikeState
): BikeState {
  let effectiveAccel = spec.accel * clamp(input.throttle, 0, 1);
  if (env.conditionPct < spec.conditionPenaltyThreshold) {
    effectiveAccel *= spec.conditionPenaltyMult;
  }
  if (env.hasPassenger) {
    effectiveAccel *= spec.passengerAccelMult;
  }

  let baseBrake = env.wet ? spec.brakeDecelWet : spec.brakeDecelDry;
  if (spec.brakeUpgrade) {
    baseBrake /= 0.8; // -20% stopping distance
  }
  const effectiveBrake = baseBrake * clamp(input.brake, 0, 1);

  // Speed update
  let newSpeed = state.speed;
  if (effectiveBrake > 0) {
    newSpeed = Math.max(0, newSpeed - effectiveBrake * dt);
  } else if (effectiveAccel > 0) {
    newSpeed = Math.min(spec.vmax, newSpeed + effectiveAccel * dt);
  }

  // Speed-scaled steering angle
  const speedRatio = clamp(newSpeed / spec.vmax, 0, 1);
  const maxSteerDeg = lerp(spec.steerMaxDegAt0, spec.steerMaxDegAtVmax, speedRatio);
  const targetSteerRad = clamp(input.steer, -1, 1) * degToRad(maxSteerDeg);
  const newSteer = lerp(state.steer, targetSteerRad, clamp(dt * 20, 0, 1));

  // Yaw rate from kinematic bicycle model
  const yawRate = (newSpeed * Math.tan(newSteer)) / WHEELBASE;
  const newHeading = angleDiff(0, state.heading + yawRate * dt);

  // Lateral acceleration & grip check
  const aLat = Math.abs(newSpeed * yawRate);
  const grip = env.wet ? spec.wetLateralGrip : spec.dryLateralGrip;
  const gripLimit = 9.81 * grip * clamp(env.surface, 0.1, 1.0);
  const gripRatio = gripLimit > 0 ? aLat / gripLimit : 0;

  let wobble = false;
  let crashed = false;

  if (gripRatio > 1.5) {
    crashed = true;
    wobble = true;
    newSpeed = Math.max(0, newSpeed - 8.0 * dt);
  } else if (gripRatio > 1.0) {
    wobble = true;
    newSpeed = Math.max(0, newSpeed - 2.5 * dt);
  }

  // Lean angle derived from lateral acceleration (capped at leanMaxDeg)
  const maxLean = degToRad(spec.leanMaxDeg);
  const targetLean = clamp(Math.atan2(newSpeed * yawRate, 9.81), -maxLean, maxLean);
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
    out.wobble = wobble;
    out.crashed = crashed;
    return out;
  }

  return {
    x: newX,
    z: newZ,
    heading: newHeading,
    speed: newSpeed,
    lean: newLean,
    steer: newSteer,
    wobble,
    crashed,
  };
}
