import * as THREE from 'three';
import { lerp, clamp } from '../core/math';
import type { PhysicsWorld, StaticColliderKind } from '../physics/PhysicsWorld';

export type CameraMode = 'chase' | 'firstPerson';

const BUILDING_FILTER: readonly StaticColliderKind[] = ['building'];

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  readonly handlebarGroup: THREE.Group;
  mode: CameraMode = 'chase';

  // Target and current positions for spring damping
  private currentPos = new THREE.Vector3(0, 3, -5);
  private currentLookAt = new THREE.Vector3(0, 1, 0);
  private currentRoll = 0;
  private shakeIntensity = 0;
  private shakePhase = 0;
  private initialized = false;
  private maxSpeed = 22;
  private physics?: PhysicsWorld;

  private raycaster = new THREE.Raycaster();
  private readonly _eyeOffset = new THREE.Vector3();
  private readonly _lookAt = new THREE.Vector3();
  private readonly _idealPos = new THREE.Vector3();
  private readonly _idealLookAt = new THREE.Vector3();
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _rayDir = new THREE.Vector3();
  private readonly _shakeRight = new THREE.Vector3();
  private readonly _shakeUp = new THREE.Vector3();

  private reduceMotion = false;

  constructor(fov = 60, aspect = 16 / 9, near = 0.1, far = 450) {
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
    this.handlebarGroup = this.buildHandlebarGroup();
    this.handlebarGroup.visible = false;
    this.camera.add(this.handlebarGroup);
  }

  private buildHandlebarGroup(): THREE.Group {
    const group = new THREE.Group();
    group.name = 'first_person_handlebars';
    group.position.set(0, -0.34, -0.52);

    const barMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.45,
      metalness: 0.6,
    });
    const gripMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.9,
      metalness: 0.05,
    });
    const dialMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
    });

    // Main handlebar tube
    const barGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.64, 8);
    barGeo.rotateZ(Math.PI / 2);
    const barMesh = new THREE.Mesh(barGeo, barMat);
    barMesh.castShadow = false;
    barMesh.receiveShadow = false;
    group.add(barMesh);

    // Left & right rubber grips + side mirrors
    const gripGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.14, 8);
    gripGeo.rotateZ(Math.PI / 2);
    const stemGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.14, 6);
    const mirrorGeo = new THREE.BoxGeometry(0.11, 0.06, 0.02);

    for (const side of [-1, 1] as const) {
      const grip = new THREE.Mesh(gripGeo, gripMat);
      grip.position.set(side * 0.27, 0, 0.02);
      grip.rotation.y = side * -0.14;
      grip.castShadow = false;
      grip.receiveShadow = false;
      group.add(grip);

      const stem = new THREE.Mesh(stemGeo, barMat);
      stem.position.set(side * 0.19, 0.07, -0.01);
      stem.rotation.z = side * -0.25;
      stem.castShadow = false;
      stem.receiveShadow = false;
      group.add(stem);

      const mirror = new THREE.Mesh(mirrorGeo, barMat);
      mirror.position.set(side * 0.22, 0.14, -0.01);
      mirror.rotation.y = side * 0.18;
      mirror.castShadow = false;
      mirror.receiveShadow = false;
      group.add(mirror);
    }

    // Center speedometer housing & illuminated dial
    const podGeo = new THREE.BoxGeometry(0.14, 0.06, 0.09);
    const pod = new THREE.Mesh(podGeo, gripMat);
    pod.position.set(0, 0.03, -0.04);
    pod.rotation.x = -0.35;
    pod.castShadow = false;
    pod.receiveShadow = false;
    group.add(pod);

    const dialGeo = new THREE.PlaneGeometry(0.1, 0.036);
    const dial = new THREE.Mesh(dialGeo, dialMat);
    dial.position.set(0, 0.042, 0.006);
    dial.rotation.x = -0.35;
    dial.castShadow = false;
    dial.receiveShadow = false;
    group.add(dial);

    return group;
  }

  setPhysicsWorld(physics?: PhysicsWorld): void {
    this.physics = physics;
  }

  setMaxSpeed(vmax: number): void {
    this.maxSpeed = Math.max(1, vmax);
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
    this.handlebarGroup.visible = mode === 'firstPerson';
  }

  toggleMode(): void {
    this.setMode(this.mode === 'chase' ? 'firstPerson' : 'chase');
  }

  /** Snaps camera directly to the target pose (no swoop from previous position). */
  snapTo(targetPos: THREE.Vector3, heading: number, speed = 0): void {
    this.initialized = false;
    this.currentRoll = 0;
    this.shakeIntensity = 0;
    this.update(targetPos, heading, speed, [], 1 / 60, 0, this.maxSpeed, 0);
  }

  /** Reduce motion: no speed-linked field-of-view kick, roll, or impact shake. */
  setReduceMotion(on: boolean): void {
    this.reduceMotion = on;
    if (on) {
      this.shakeIntensity = 0;
      this.currentRoll = 0;
    }
  }

  /** Triggers a short spring-damped camera shake on bumps/crashes. */
  triggerShake(intensity: number): void {
    if (this.reduceMotion) return;
    this.shakeIntensity = Math.max(this.shakeIntensity, clamp(intensity, 0, 0.8));
  }

  /** Applies camera-local right/up shake using pre-allocated scratch vectors (zero allocations). */
  private applyShakeOffset(dt: number): void {
    if (this.shakeIntensity > 0.005) {
      this.shakePhase += dt * 55;
      const sx = Math.sin(this.shakePhase) * this.shakeIntensity;
      const sy = Math.cos(this.shakePhase * 1.3) * this.shakeIntensity * 0.7;
      this._shakeRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      this._shakeUp.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.addScaledVector(this._shakeRight, sx);
      this.camera.position.addScaledVector(this._shakeUp, sy);
      this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.4);
    } else {
      this.shakeIntensity = 0;
    }
  }

  /**
   * Camera looks down -Z, so +Z_cam points opposite bike +Z; negative rotateZ tilts
   * camera-up toward -X (screen-right), aligning roll with MotorcycleMesh's right lean (lean > 0).
   */
  private applyRoll(lean: number, dt: number): void {
    const safeDt = Math.max(0, dt);
    const rollDamping = 1 - Math.exp(-8 * safeDt);
    const targetRoll = this.reduceMotion ? 0 : clamp(-lean * 0.32, -0.18, 0.18);
    this.currentRoll = lerp(this.currentRoll, targetRoll, rollDamping);
    if (Math.abs(this.currentRoll) > 0.0005) {
      this.camera.rotateZ(this.currentRoll);
    }
  }

  /**
   * Pulls `point` back toward `targetPos` if any building collider lies along the segment.
   * Uses zero-allocation PhysicsWorld.castRay2D when available, with Three.js Raycaster fallback.
   */
  private applyAntiClip(
    targetPos: THREE.Vector3,
    point: THREE.Vector3,
    colliders: THREE.Object3D[]
  ): boolean {
    if (this.physics) {
      const dx = point.x - targetPos.x;
      const dz = point.z - targetPos.z;
      const dist2D = Math.hypot(dx, dz);
      if (dist2D > 0.001) {
        const dirX = dx / dist2D;
        const dirZ = dz / dist2D;
        const hitDist = this.physics.castRay2D(
          targetPos.x,
          targetPos.z,
          targetPos.y + 1.0,
          dirX,
          dirZ,
          dist2D,
          BUILDING_FILTER
        );
        if (hitDist !== null) {
          const safeDist = hitDist > 0.35 ? hitDist - 0.3 : hitDist * 0.5;
          const frac = safeDist / dist2D;
          point.x = targetPos.x + dirX * safeDist;
          point.z = targetPos.z + dirZ * safeDist;
          point.y = lerp(targetPos.y + 1.0, point.y, frac);
          return true;
        }
      }
      return false;
    }

    if (colliders.length > 0) {
      this._rayOrigin.set(targetPos.x, targetPos.y + 1.0, targetPos.z);
      this._rayDir.copy(point).sub(this._rayOrigin);
      const maxDist = this._rayDir.length();
      if (maxDist > 0.001) {
        for (let i = 0; i < colliders.length; i++) {
          colliders[i]!.updateMatrixWorld(false);
        }
        this._rayDir.divideScalar(maxDist);
        this.raycaster.set(this._rayOrigin, this._rayDir);
        this.raycaster.far = maxDist;
        const hits = this.raycaster.intersectObjects(colliders, true);
        if (hits.length > 0 && hits[0] && hits[0].distance < maxDist) {
          const safeDist = hits[0].distance > 0.35 ? hits[0].distance - 0.3 : hits[0].distance * 0.5;
          point.copy(this._rayOrigin).addScaledVector(this._rayDir, safeDist);
          return true;
        }
      }
    }

    return false;
  }

  update(
    targetPos: THREE.Vector3,
    heading: number, // radians
    speed: number, // m/s
    colliders: THREE.Object3D[] = [],
    dt: number = 1 / 60,
    lean: number = 0,
    vmax: number = this.maxSpeed,
    steer: number = 0
  ): void {
    // Dynamic FOV: 60 at rest -> 72 at active bike's vmax. Reduce motion holds it at 60.
    const safeVmax = Math.max(1, vmax);
    const speedRatio = this.reduceMotion ? 0 : clamp(speed / safeVmax, 0, 1);
    const nextFov = lerp(60, 72, speedRatio);
    if (Math.abs(this.camera.fov - nextFov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    const isFirstPerson = this.mode === 'firstPerson';
    this.handlebarGroup.visible = isFirstPerson;

    if (isFirstPerson) {
      // Rider's-eye position: slightly forward and at helmet height (1.35m)
      this._eyeOffset.set(
        Math.sin(heading) * 0.2,
        1.35,
        Math.cos(heading) * 0.2
      );
      this.camera.position.copy(targetPos).add(this._eyeOffset);

      // Look forward along heading with slight pitch down
      const lookDist = 20;
      this._lookAt.set(
        targetPos.x + Math.sin(heading) * lookDist,
        targetPos.y + 1.2,
        targetPos.z + Math.cos(heading) * lookDist
      );
      this.camera.lookAt(this._lookAt);
      this.applyRoll(lean, dt);
      this.applyShakeOffset(dt);

      this.handlebarGroup.rotation.y = this.reduceMotion ? 0 : -steer * 0.35;
      this.currentPos.copy(this.camera.position);
      this.currentLookAt.copy(this._lookAt);
      this.initialized = true;
    } else {
      // Chase camera mode:
      const distanceBehind = 4.8;
      const heightAbove = 2.3;
      const lookAheadDist = lerp(5, 16, speedRatio);

      this._idealPos.set(
        targetPos.x - Math.sin(heading) * distanceBehind,
        targetPos.y + heightAbove,
        targetPos.z - Math.cos(heading) * distanceBehind
      );

      this._idealLookAt.set(
        targetPos.x + Math.sin(heading) * lookAheadDist,
        targetPos.y + 1.1,
        targetPos.z + Math.cos(heading) * lookAheadDist
      );

      const idealObstructed = this.applyAntiClip(targetPos, this._idealPos, colliders);

      if (!this.initialized) {
        this.currentPos.copy(this._idealPos);
        this.currentLookAt.copy(this._idealLookAt);
        this.initialized = true;
      } else {
        const safeDt = Math.max(0, dt);
        const posDamping = 1 - Math.exp(-8 * safeDt);
        const lookDamping = 1 - Math.exp(-12 * safeDt);

        if (idealObstructed) {
          this.currentPos.copy(this._idealPos);
        } else {
          this.currentPos.lerp(this._idealPos, posDamping);
        }
        this.currentLookAt.lerp(this._idealLookAt, lookDamping);

        // Clamp currentPos immediately if lagging behind a building corner
        this.applyAntiClip(targetPos, this.currentPos, colliders);
      }

      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLookAt);
      this.applyRoll(lean, dt);
      this.applyShakeOffset(dt);
    }
  }

  dispose(): void {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.handlebarGroup.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        const geo = child.geometry as THREE.BufferGeometry | undefined;
        const mat = child.material as THREE.Material | THREE.Material[] | undefined;
        if (geo) geos.add(geo);
        if (Array.isArray(mat)) {
          for (const m of mat) mats.add(m);
        } else if (mat) {
          mats.add(mat);
        }
      }
    });
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }
}
