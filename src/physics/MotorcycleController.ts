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
  }

  update(input: BikeInput, env: BikeEnvironment, dt: number): BikeState {
    const desiredState = stepBike(this.state, input, this.spec, env, dt);

    const desiredTranslation = {
      x: desiredState.x - this.state.x,
      y: 0,
      z: desiredState.z - this.state.z,
    };

    // Sync kinematic body to current state immediately
    const halfYaw = this.state.heading / 2;
    this.body.setTranslation(
      {
        x: this.state.x,
        y: 0.5,
        z: this.state.z,
      },
      true
    );
    this.body.setRotation(
      {
        x: 0,
        y: Math.sin(halfYaw),
        z: 0,
        w: Math.cos(halfYaw),
      },
      true
    );
    this.world.step();

    // Compute movement against obstacles
    this.characterController.computeColliderMovement(
      this.collider,
      desiredTranslation
    );

    const movement = this.characterController.computedMovement();
    const numCollisions = this.characterController.numComputedCollisions();

    let collisionSeverity: BikeCollisionSeverity | null = null;
    const totalSpeedKmh = this.state.speed * 3.6;

    if (numCollisions > 0) {
      // Find maximum impact velocity along collision normal
      let maxImpactKmh = 0;
      const vx = desiredTranslation.x / dt;
      const vz = desiredTranslation.z / dt;

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
      const leftDir = {
        x: -Math.cos(this.state.heading),
        y: 0,
        z: Math.sin(this.state.heading),
      };
      const rightDir = {
        x: Math.cos(this.state.heading),
        y: 0,
        z: -Math.sin(this.state.heading),
      };

      const origin = { x: this.state.x, y: 0.5, z: this.state.z };

      const leftRay = new RAPIER.Ray(origin, leftDir);
      const rightRay = new RAPIER.Ray(origin, rightDir);

      const hitLeft = this.world.raw.castRay(leftRay, rayDist, true);
      const hitRight = this.world.raw.castRay(rightRay, rayDist, true);

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
    this.state = {
      x: this.state.x + movement.x,
      z: this.state.z + movement.z,
      heading: desiredState.heading,
      speed: desiredState.speed,
      lean: desiredState.lean,
      steer: desiredState.steer,
      wobble: desiredState.wobble,
      crashed: desiredState.crashed || collisionSeverity === 'crash',
    };

    // Update body position to new state
    this.body.setTranslation(
      {
        x: this.state.x,
        y: 0.5,
        z: this.state.z,
      },
      true
    );

    return this.state;
  }
}
