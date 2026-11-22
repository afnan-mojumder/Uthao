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

/** Bike swept collision radius in meters (matches capsule radius 0.35m). */
const BIKE_RADIUS_M = 0.35;
/** Raycast height offset above bike ground elevation for near-miss detection. */
const NEAR_MISS_RAY_Y_M = 0.25;
/** Surface-to-surface clearance threshold for near-miss reporting (meters). */
const NEAR_MISS_CLEARANCE_M = 1.0;
/** Minimum seconds between two bike/nearMiss reports (shared across static & traffic). */
const NEAR_MISS_COOLDOWN_S = 1.0;
/** A contact that drops out and restarts within this window counts as one contact. */
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
  private contactSeverityRank = 0;
  private contactOtherKind: 'static' | 'traffic' | null = null;
  private contactOtherId: string | undefined = undefined;
  private readonly _nextState: BikeState = createDefaultBikeState();
  private readonly _pushHit: SweepHit = {
    hit: false,
    toi: 1,
    normalX: 0,
    normalZ: 0,
    otherKind: 'building',
    otherVx: 0,
    otherVz: 0,
  };
  private readonly _pushSlide = { x: 0, z: 0 };
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
  private readonly _overlapHit: SweepHit = {
    hit: false,
    toi: 1,
    normalX: 0,
    normalZ: 0,
    otherKind: 'building',
    otherVx: 0,
    otherVz: 0,
  };
  private readonly _pushOut = { x: 0, z: 0 };

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
    if (this.contactHoldS <= 0) {
      this.contactSeverityRank = 0;
      this.contactOtherKind = null;
      this.contactOtherId = undefined;
    }

    const desiredState = stepBike(this.state, input, this.spec, env, dt, this._nextState);
    const dx = desiredState.x - this.state.x;
    const dz = desiredState.z - this.state.z;

    this.world.sweepCapsule(
      this.state.x,
      this.state.z,
      this.state.y,
      BIKE_RADIUS_M,
      dx,
      dz,
      this._hit,
      this._slide
    );

    let nextX = this.state.x + this._slide.x;
    let nextZ = this.state.z + this._slide.z;

    const safeDt = dt > 1e-6 ? dt : 1e-6;
    const bikeVx = dx / safeDt;
    const bikeVz = dz / safeDt;

    const pushed = this.world.resolveDynamicOverlap(
      nextX,
      nextZ,
      this.state.y,
      BIKE_RADIUS_M,
      this._overlapHit,
      this._pushOut
    );
    if (pushed) {
      this.world.sweepCapsule(
        nextX,
        nextZ,
        this.state.y,
        BIKE_RADIUS_M,
        this._pushOut.x,
        this._pushOut.z,
        this._pushHit,
        this._pushSlide
      );
      nextX += this._pushSlide.x;
      nextZ += this._pushSlide.z;
      const overlapImpactKmh =
        Math.hypot(bikeVx - this._overlapHit.otherVx, bikeVz - this._overlapHit.otherVz) * 3.6;
      const staticImpactKmh = this._hit.hit
        ? Math.max(0, -(bikeVx * this._hit.normalX + bikeVz * this._hit.normalZ) * 3.6)
        : -1;
      if (!this._hit.hit || (this._hit.otherKind !== 'traffic' && overlapImpactKmh >= staticImpactKmh)) {
        this._hit.hit = true;
        this._hit.toi = 0;
        this._hit.normalX = this._overlapHit.normalX;
        this._hit.normalZ = this._overlapHit.normalZ;
        this._hit.otherKind = 'traffic';
        this._hit.otherId = this._overlapHit.otherId;
        this._hit.otherVx = this._overlapHit.otherVx;
        this._hit.otherVz = this._overlapHit.otherVz;
      }
    }

    let collisionSeverity: BikeCollisionSeverity | null = null;
    const totalSpeedKmh = Math.abs(this.state.speed) * 3.6;

    if (this._hit.hit) {
      let impactKmh: number;
      if (this._hit.otherKind === 'traffic') {
        impactKmh = Math.hypot(bikeVx - this._hit.otherVx, bikeVz - this._hit.otherVz) * 3.6;
      } else {
        const normalImpact = -(bikeVx * this._hit.normalX + bikeVz * this._hit.normalZ);
        impactKmh = Math.max(0, normalImpact * 3.6);
      }

      if (impactKmh > 25) {
        collisionSeverity = 'crash';
        desiredState.speed = 0;
        desiredState.gear = 1;
        desiredState.rpmNorm = 0.15;
      } else if (impactKmh >= 8) {
        collisionSeverity = 'bump';
        desiredState.speed *= 0.4;
      } else {
        collisionSeverity = 'scuff';
        const tangentialSpeed = Math.hypot(this._slide.x, this._slide.z) / safeDt;
        const contactLoss = this.contactHoldS <= 0 ? 0.95 : 1.0;
        const slideDrag = Math.max(0, 1 - 0.3 * dt);
        const scuffedSpeed = tangentialSpeed * contactLoss * slideDrag;
        desiredState.speed = desiredState.speed < 0 ? -scuffedSpeed : scuffedSpeed;
      }

      // The physical response above applies every frame of contact, but the
      // event is one report per contact unless severity escalates or a new traffic entity hits.
      const severityRank = collisionSeverity === 'crash' ? 3 : collisionSeverity === 'bump' ? 2 : 1;
      const isTraffic = this._hit.otherKind === 'traffic';
      const hitKind: 'static' | 'traffic' = isTraffic ? 'traffic' : 'static';
      const shouldEmit =
        this.contactHoldS <= 0 ||
        severityRank > this.contactSeverityRank ||
        (isTraffic &&
          (this.contactOtherKind !== 'traffic' ||
            (this._hit.otherId !== undefined && this._hit.otherId !== this.contactOtherId)));
      if (shouldEmit) {
        this.contactSeverityRank = Math.max(this.contactSeverityRank, severityRank);
        this.contactOtherKind = hitKind;
        this.contactOtherId = this._hit.otherId;
        const otherSpeedKmh = isTraffic
          ? Math.hypot(this._hit.otherVx, this._hit.otherVz) * 3.6
          : 0;
        this.bus?.emit('bike/collision', {
          severity: collisionSeverity,
          relSpeedKmh: impactKmh,
          otherKind: hitKind,
          otherParty: isTraffic,
          bikeSpeedKmh: totalSpeedKmh,
          otherSpeedKmh,
        });
      }
    } else if (totalSpeedKmh > 20) {
      // Near miss check: raycast left and right, subtracting capsule radius.
      const rayDist = BIKE_RADIUS_M + NEAR_MISS_CLEARANCE_M;
      const cosH = Math.cos(this.state.heading);
      const sinH = Math.sin(this.state.heading);
      const rayY = this.state.y + NEAR_MISS_RAY_Y_M;

      // Forward = (sinH, cosH); left (+heading) = (cosH, -sinH); right = (-cosH, sinH).
      const hitLeft = this.world.castRay2D(this.state.x, this.state.z, rayY, cosH, -sinH, rayDist);
      const hitRight = this.world.castRay2D(this.state.x, this.state.z, rayY, -cosH, sinH, rayDist);

      let minClearance: number | null = null;
      if (hitLeft !== null) minClearance = Math.max(0, hitLeft - BIKE_RADIUS_M);
      if (hitRight !== null) {
        const rightClearance = Math.max(0, hitRight - BIKE_RADIUS_M);
        minClearance = minClearance === null ? rightClearance : Math.min(minClearance, rightClearance);
      }

      if (minClearance !== null && minClearance < NEAR_MISS_CLEARANCE_M && this.nearMissCooldownS <= 0) {
        this.bus?.emit('bike/nearMiss', {
          distanceM: minClearance,
          speedKmh: totalSpeedKmh,
        });
        // A near miss is a moment, not a state: one report per second at most across static & traffic.
        this.nearMissCooldownS = NEAR_MISS_COOLDOWN_S;
      }
    }

    if (this._hit.hit) this.contactHoldS = CONTACT_RELEASE_S;

    // Apply swept & depenetrated movement
    this.state.x = nextX;
    this.state.z = nextZ;
    this.state.heading = desiredState.heading;
    this.state.speed = desiredState.speed;
    this.state.lean = desiredState.lean;
    this.state.steer = desiredState.steer;
    this.state.gear = desiredState.gear;
    this.state.rpmNorm = desiredState.rpmNorm;
    this.state.y = desiredState.y;
    this.state.wobble = desiredState.wobble;
    this.state.crashed = desiredState.crashed || collisionSeverity === 'crash';
    this.state.reverseHoldS = desiredState.reverseHoldS;

    return this.state;
  }

  public setSpec(newSpec: BikeSpec): void {
    Object.assign(this.spec, newSpec);
  }
}
