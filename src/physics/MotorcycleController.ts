import RAPIER from '@dimforge/rapier3d-compat';
import type { PhysicsWorld } from './PhysicsWorld';
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

export class MotorcycleController {
  readonly world: PhysicsWorld;
  readonly bus?: EventBus<GameEvents>;
  readonly spec: BikeSpec;
  state: BikeState;

  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly characterController: RAPIER.KinematicCharacterController;

  private readonly _desiredTranslation = { x: 0, y: 0, z: 0 };
  private readonly _bodyTranslation = { x: 0, y: 0.5, z: 0 };
  private readonly _bodyRotation = { x: 0, y: 0, z: 0, w: 1 };
  private readonly _leftDir = { x: 0, y: 0, z: 0 };
  private readonly _rightDir = { x: 0, y: 0, z: 0 };
  private readonly _rayOrigin = { x: 0, y: 0.5, z: 0 };
  private readonly _leftRay: RAPIER.Ray;
  private readonly _rightRay: RAPIER.Ray;
  private readonly _nextState: BikeState = createDefaultBikeState();

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

    // Capsule collider: height 0.6, radius 0.35 (motorcycle profile)
    const bodyDesc =
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        this.state.x,
        0.5,
        this.state.z
      );
    this.body = this.world.raw.createRigidBody(bodyDesc);
    const colliderDesc = RAPIER.ColliderDesc.capsule(0.3, 0.35);
    this.collider = this.world.raw.createCollider(colliderDesc, this.body);

    this.characterController = this.world.raw.createCharacterController(0.01);
    this.characterController.enableAutostep(0.3, 0.2, true);
    this.characterController.enableSnapToGround(0.5);
    this.world.step();

    this._leftRay = new RAPIER.Ray(this._rayOrigin, this._leftDir);
    this._rightRay = new RAPIER.Ray(this._rayOrigin, this._rightDir);
  }

  update(input: BikeInput, env: BikeEnvironment, dt: number): BikeState {
    const desiredState = stepBike(this.state, input, this.spec, env, dt, this._nextState);

    this._desiredTranslation.x = desiredState.x - this.state.x;
    this._desiredTranslation.y = 0;
    this._desiredTranslation.z = desiredState.z - this.state.z;

    // Sync kinematic body to current state immediately
    const halfYaw = this.state.heading / 2;
    this._bodyTranslation.x = this.state.x;
    this._bodyTranslation.y = 0.5;
    this._bodyTranslation.z = this.state.z;
    this.body.setTranslation(this._bodyTranslation, true);

    this._bodyRotation.x = 0;
    this._bodyRotation.y = Math.sin(halfYaw);
    this._bodyRotation.z = 0;
    this._bodyRotation.w = Math.cos(halfYaw);
    this.body.setRotation(this._bodyRotation, true);
    this.world.step();

    // Compute movement against obstacles
    this.characterController.computeColliderMovement(
      this.collider,
      this._desiredTranslation
    );

    const movement = this.characterController.computedMovement();
    const numCollisions = this.characterController.numComputedCollisions();

    let collisionSeverity: BikeCollisionSeverity | null = null;
    const totalSpeedKmh = this.state.speed * 3.6;

    if (numCollisions > 0) {
      // Find maximum impact velocity along collision normal
      let maxImpactKmh = 0;
      const vx = this._desiredTranslation.x / dt;
      const vz = this._desiredTranslation.z / dt;

      for (let i = 0; i < numCollisions; i++) {
        const col = this.characterController.computedCollision(i);
        if (col && col.normal1) {
          // normal1 points from obstacle to collider
          const normalImpact = -(vx * col.normal1.x + vz * col.normal1.z);
          const impactKmh = normalImpact * 3.6;
          if (impactKmh > maxImpactKmh) {
            maxImpactKmh = impactKmh;
          }
        }
      }

      if (maxImpactKmh === 0) {
        maxImpactKmh = totalSpeedKmh;
      }

      if (maxImpactKmh > 25) {
        collisionSeverity = 'crash';
        desiredState.speed = 0;
      } else if (maxImpactKmh >= 8) {
        collisionSeverity = 'bump';
        desiredState.speed *= 0.4;
      } else {
        collisionSeverity = 'scuff';
        // Preserve tangential velocity along obstacle surface
        const tangentialSpeed = Math.hypot(movement.x, movement.z) / dt;
        desiredState.speed = tangentialSpeed * 0.95;
      }

      this.bus?.emit('bike/collision', {
        severity: collisionSeverity,
        relSpeedKmh: maxImpactKmh,
        otherKind: 'static',
      });
    } else if (totalSpeedKmh > 20) {
      // Near miss check: raycast left and right
      const rayDist = 1.0;
      this._leftDir.x = -Math.cos(this.state.heading);
      this._leftDir.y = 0;
      this._leftDir.z = Math.sin(this.state.heading);

      this._rightDir.x = Math.cos(this.state.heading);
      this._rightDir.y = 0;
      this._rightDir.z = -Math.sin(this.state.heading);

      this._rayOrigin.x = this.state.x;
      this._rayOrigin.y = 0.5;
      this._rayOrigin.z = this.state.z;

      const hitLeft = this.world.raw.castRay(this._leftRay, rayDist, true);
      const hitRight = this.world.raw.castRay(this._rightRay, rayDist, true);

      let minClearance: number | null = null;
      if (hitLeft !== null) minClearance = hitLeft.timeOfImpact;
      if (hitRight !== null) {
        minClearance =
          minClearance === null
            ? hitRight.timeOfImpact
            : Math.min(minClearance, hitRight.timeOfImpact);
      }

      if (minClearance !== null && minClearance < 1.0) {
        this.bus?.emit('bike/nearMiss', {
          distanceM: minClearance,
          speedKmh: totalSpeedKmh,
        });
      }
    }

    // Apply movement
    this.state.x += movement.x;
    this.state.z += movement.z;
    this.state.heading = desiredState.heading;
    this.state.speed = desiredState.speed;
    this.state.lean = desiredState.lean;
    this.state.steer = desiredState.steer;
    this.state.wobble = desiredState.wobble;
    this.state.crashed = desiredState.crashed || collisionSeverity === 'crash';

    // Update body position to new state
    this._bodyTranslation.x = this.state.x;
    this._bodyTranslation.y = 0.5;
    this._bodyTranslation.z = this.state.z;
    this.body.setTranslation(this._bodyTranslation, true);

    return this.state;
  }
  public setSpec(newSpec: BikeSpec): void {
    Object.assign(this.spec, newSpec);
  }
}
