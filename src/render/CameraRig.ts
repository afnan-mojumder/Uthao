import * as THREE from 'three';
import { lerp, clamp } from '../core/math';

export type CameraMode = 'chase' | 'firstPerson';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';

  // Target and current positions for spring damping
  private currentPos = new THREE.Vector3(0, 3, -5);
  private currentLookAt = new THREE.Vector3(0, 1, 0);

  private raycaster = new THREE.Raycaster();

  constructor(fov = 60, aspect = 16 / 9, near = 0.1, far = 450) {
    this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
  }

  setMode(mode: CameraMode): void {
    this.mode = mode;
  }

  toggleMode(): void {
    this.mode = this.mode === 'chase' ? 'firstPerson' : 'chase';
  }

  update(
    targetPos: THREE.Vector3,
    heading: number, // radians
    speed: number, // m/s
    colliders: THREE.Object3D[] = [],
    dt: number = 1 / 60
  ): void {
    // Dynamic FOV: 60 at rest -> 72 at vmax (22 m/s)
    const speedRatio = clamp(speed / 22, 0, 1);
    this.camera.fov = lerp(60, 72, speedRatio);
    this.camera.updateProjectionMatrix();

    if (this.mode === 'firstPerson') {
      // Rider's-eye position: slightly forward and at helmet height (1.35m)
      const eyeOffset = new THREE.Vector3(
        Math.sin(heading) * 0.2,
        1.35,
        Math.cos(heading) * 0.2
      );
      this.camera.position.copy(targetPos).add(eyeOffset);

      // Look forward along heading with slight pitch down
      const lookDist = 20;
      const lookAt = new THREE.Vector3(
        targetPos.x + Math.sin(heading) * lookDist,
        targetPos.y + 1.2,
        targetPos.z + Math.cos(heading) * lookDist
      );
      this.camera.lookAt(lookAt);
    } else {
      // Chase camera mode:
      // Ideal position: behind the bike along heading (-heading)
      const distanceBehind = 4.8;
      const heightAbove = 2.3;

      // Look ahead distance scales with speed (e.g. 5m at rest -> 16m at high speed)
      const lookAheadDist = lerp(5, 16, speedRatio);

      const idealPos = new THREE.Vector3(
        targetPos.x - Math.sin(heading) * distanceBehind,
        targetPos.y + heightAbove,
        targetPos.z - Math.cos(heading) * distanceBehind
      );

      const idealLookAt = new THREE.Vector3(
        targetPos.x + Math.sin(heading) * lookAheadDist,
        targetPos.y + 1.1,
        targetPos.z + Math.cos(heading) * lookAheadDist
      );

      // Anti-clip raycast pull-in:
      // Ray from bike center (targetPos + y: 1.0) to ideal camera position
      if (colliders.length > 0) {
        const origin = targetPos.clone().add(new THREE.Vector3(0, 1.0, 0));
        const dir = idealPos.clone().sub(origin);
        const maxDist = dir.length();
        dir.normalize();

        this.raycaster.set(origin, dir);
        this.raycaster.far = maxDist;
        const hits = this.raycaster.intersectObjects(colliders, true);
        if (hits.length > 0 && hits[0] && hits[0].distance < maxDist - 0.2) {
          // Pull camera closer to target in front of the hit point
          const hitDist = Math.max(0.8, hits[0].distance - 0.2);
          idealPos.copy(origin).add(dir.multiplyScalar(hitDist));
        }
      }

      // Spring-damping interpolation
      const posDamping = clamp(dt * 8, 0, 1);
      const lookDamping = clamp(dt * 12, 0, 1);

      this.currentPos.lerp(idealPos, posDamping);
      this.currentLookAt.lerp(idealLookAt, lookDamping);

      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLookAt);
    }
  }
}
