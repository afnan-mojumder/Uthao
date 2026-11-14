import * as THREE from 'three';
import { lerp, clamp } from '../core/math';

export type CameraMode = 'chase' | 'firstPerson';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';

  // Target and current positions for spring damping
  private currentPos = new THREE.Vector3(0, 3, -5);
  private currentLookAt = new THREE.Vector3(0, 1, 0);
  private currentRoll = 0;
  private shakeIntensity = 0;
  private shakePhase = 0;

  private raycaster = new THREE.Raycaster();
  private readonly _eyeOffset = new THREE.Vector3();
  private readonly _lookAt = new THREE.Vector3();
  private readonly _idealPos = new THREE.Vector3();
  private readonly _idealLookAt = new THREE.Vector3();
  private readonly _rayOrigin = new THREE.Vector3();
  private readonly _rayDir = new THREE.Vector3();

  constructor(fov = 60, aspect = 16 / 9, near = 0.1, far = 450) {
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  toggleMode(): void {
    this.mode = this.mode === 'chase' ? 'firstPerson' : 'chase';
  }

  private reduceMotion = false;

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

  update(
    targetPos: THREE.Vector3,
    heading: number, // radians
    speed: number, // m/s
    colliders: THREE.Object3D[] = [],
    dt: number = 1 / 60,
    lean: number = 0
  ): void {
    // Dynamic FOV: 60 at rest -> 72 at vmax (22 m/s). Reduce motion holds it at 60.
    const speedRatio = this.reduceMotion ? 0 : clamp(speed / 22, 0, 1);
    const nextFov = lerp(60, 72, speedRatio);
    if (Math.abs(this.camera.fov - nextFov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    if (this.mode === 'firstPerson') {
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
    } else {
      // Chase camera mode:
      // Ideal position: behind the bike along heading (-heading)
      const distanceBehind = 4.8;
      const heightAbove = 2.3;

      // Look ahead distance scales with speed (e.g. 5m at rest -> 16m at high speed)
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

      // Anti-clip raycast pull-in:
      // Ray from bike center (targetPos + y: 1.0) to ideal camera position
      if (colliders.length > 0) {
        this._rayOrigin.set(targetPos.x, targetPos.y + 1.0, targetPos.z);
        this._rayDir.copy(this._idealPos).sub(this._rayOrigin);
        const maxDist = this._rayDir.length();
        if (maxDist > 0.001) {
          this._rayDir.divideScalar(maxDist);
          this.raycaster.set(this._rayOrigin, this._rayDir);
          this.raycaster.far = maxDist;
          const hits = this.raycaster.intersectObjects(colliders, true);
          if (hits.length > 0 && hits[0] && hits[0].distance < maxDist - 0.2) {
            // Pull camera closer to target in front of the hit point
            const hitDist = Math.max(0.8, hits[0].distance - 0.2);
            this._idealPos.copy(this._rayOrigin).addScaledVector(this._rayDir, hitDist);
          }
        }
      }

      // Spring-damping interpolation
      const posDamping = clamp(dt * 8, 0, 1);
      const lookDamping = clamp(dt * 12, 0, 1);

      this.currentPos.lerp(this._idealPos, posDamping);
      this.currentLookAt.lerp(this._idealLookAt, lookDamping);

      this.camera.position.copy(this.currentPos);
      if (this.shakeIntensity > 0.005) {
        this.shakePhase += dt * 55;
        this.camera.position.x += Math.sin(this.shakePhase) * this.shakeIntensity;
        this.camera.position.y += Math.cos(this.shakePhase * 1.3) * this.shakeIntensity * 0.7;
        this.shakeIntensity = Math.max(0, this.shakeIntensity - dt * 2.4);
      } else {
        this.shakeIntensity = 0;
      }

      this.camera.lookAt(this.currentLookAt);

      const targetRoll = this.reduceMotion ? 0 : clamp(-lean * 0.32, -0.18, 0.18);
      this.currentRoll = lerp(this.currentRoll, targetRoll, clamp(dt * 8, 0, 1));
      if (Math.abs(this.currentRoll) > 0.0005) {
        this.camera.rotateZ(this.currentRoll);
      }
    }
  }
}
