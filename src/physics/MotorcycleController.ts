import type { PhysicsWorld, SweepHit } from './PhysicsWorld';
import {
  stepBike,
  type BikeSpec,
  type BikeState,
  type BikeInput,
  type BikeEnvironment,
  createDefaultBikeSpec,
  createDefaultBikeState,
} from './bikeModel';
import type { EventBus, GameEvents } from '../core/events';
import type { BikeCollisionSeverity } from '../core/types';

export interface MotorcycleControllerOptions {
  world: PhysicsWorld;
  bus?: EventBus<GameEvents>;
  initialPose?: { x: number; z: number; heading: number };
  spec?: BikeSpec;
}

/** Bike swept collision radius in meters (matches previous capsule radius 0.35m). */
const BIKE_RADIUS_M = 0.35;
/** Ground elevation of the bike for 2.5D physics band overlap. */
const BIKE_GROUND_Y_M = 0;
/** Raycast elevation for near-miss detection against walls/buildings. */
const NEAR_MISS_RAY_Y_M = 0.5;
/** Minimum seconds between two bike/nearMiss reports. */
const NEAR_MISS_COOLDOWN_S = 1.0;
/** A static contact that drops out and restarts within this window counts as one contact. */
const CONTACT_RELEASE_S = 0.25;

export class MotorcycleController {
  readonly world: PhysicsWorld;
  readonly bus?: EventBus<GameEvents>;
  readonly spec: BikeSpec;
  state: BikeState;

  private nearMissCooldownS = 0;
  /** Seconds since the last frame of contact ended; a contact that
   * restarts within CONTACT_RELEASE_S is the same contact. */
  private contactHoldS = 0;
  private readonly _nextState: BikeState = createDefaultBikeState();
  private readonly _hit: SweepHit = {
    hit: false,
    toi: 1,
    normalX: 0,
    normalZ: 0,
    otherKind: 'building',
    otherVx: 0,
    otherVz: 0,
  };
  private readonly _slide = { x: 0, z: 0 };

  constructor(opts: MotorcycleControllerOptions) {
    this.world = opts.world;
    this.bus = opts.bus;
    this.spec = opts.spec ?? createDefaultBikeSpec();

    const initial = opts.initialPose ?? { x: 0, z: 0, heading: 0 };
    this.state = {
      ...createDefaultBikeState(),
      x: initial.x,
      z: initial.z,
      heading: initial.heading,
    };
  }

  update(input: BikeInput, env: BikeEnvironment, dt: number): BikeState {
    this.nearMissCooldownS = Math.max(0, this.nearMissCooldownS - dt);
    this.contactHoldS = Math.max(0, this.contactHoldS - dt);

    const desiredState = stepBike(this.state, input, this.spec, env, dt, this._nextState);
    const dx = desiredState.x - this.state.x;
    const dz = desiredState.z - this.state.z;

    this.world.sweepCapsule(
      this.state.x,
      this.state.z,
      BIKE_GROUND_Y_M,
      BIKE_RADIUS_M,
      dx,
      dz,
      this._hit,
      this._slide
    );

    const safeDt = dt > 1e-6 ? dt : 1e-6;
    let collisionSeverity: BikeCollisionSeverity | null = null;
    const totalSpeedKmh = Math.abs(this.state.speed) * 3.6;

    if (this._hit.hit) {
      const relVx = dx / safeDt - this._hit.otherVx;
      const relVz = dz / safeDt - this._hit.otherVz;
      const normalImpact = -(relVx * this._hit.normalX + relVz * this._hit.normalZ);
      let impactKmh = normalImpact * 3.6;
      if (impactKmh <= 0) {
        impactKmh = totalSpeedKmh;
      }

      if (impactKmh > 25) {
        collisionSeverity = 'crash';
        desiredState.speed = 0;
      } else if (impactKmh >= 8) {
        collisionSeverity = 'bump';
        desiredState.speed *= 0.4;
      } else {
        collisionSeverity = 'scuff';
        const tangentialSpeed = Math.hypot(this._slide.x, this._slide.z) / safeDt;
        desiredState.speed = tangentialSpeed * 0.95;
      }

      // The physical response above applies every frame of contact, but the
      // event is one report per contact (audit: grinding fires every frame).
      if (this.contactHoldS <= 0) {
        this.bus?.emit('bike/collision', {
          severity: collisionSeverity,
          relSpeedKmh: impactKmh,
          otherKind: this._hit.otherKind === 'traffic' ? 'traffic' : 'static',
        });
      }
    } else if (totalSpeedKmh > 20) {
      // Near miss check: raycast left and right
      const rayDist = 1.0;
      const cosH = Math.cos(this.state.heading);
      const sinH = Math.sin(this.state.heading);

      const hitLeft = this.world.castRay2D(
        this.state.x,
        this.state.z,
        NEAR_MISS_RAY_Y_M,
        -cosH,
        sinH,
        rayDist
      );
      const hitRight = this.world.castRay2D(
        this.state.x,
        this.state.z,
        NEAR_MISS_RAY_Y_M,
        cosH,
        -sinH,
        rayDist
      );

      let minClearance: number | null = null;
      if (hitLeft !== null) minClearance = hitLeft;
      if (hitRight !== null) {
        minClearance = minClearance === null ? hitRight : Math.min(minClearance, hitRight);
      }

      if (minClearance !== null && minClearance < 1.0 && this.nearMissCooldownS <= 0) {
        this.bus?.emit('bike/nearMiss', {
          distanceM: minClearance,
          speedKmh: totalSpeedKmh,
        });
        // A near miss is a moment, not a state: one report per second at most.
        this.nearMissCooldownS = NEAR_MISS_COOLDOWN_S;
      }
    }

    if (this._hit.hit) this.contactHoldS = CONTACT_RELEASE_S;

    // Apply swept movement
    this.state.x += this._slide.x;
    this.state.z += this._slide.z;
    this.state.heading = desiredState.heading;
    this.state.speed = desiredState.speed;
    this.state.lean = desiredState.lean;
    this.state.steer = desiredState.steer;
    this.state.wobble = desiredState.wobble;
    this.state.crashed = desiredState.crashed || collisionSeverity === 'crash';

    return this.state;
  }

  public setSpec(newSpec: BikeSpec): void {
    Object.assign(this.spec, newSpec);
  }
}
