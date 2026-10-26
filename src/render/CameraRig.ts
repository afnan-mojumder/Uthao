import * as THREE from 'three';
import { lerp, clamp } from '../core/math';

export type CameraMode = 'chase' | 'firstPerson';

export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'chase';

  // Target and current positions for spring damping
  private currentPos = new THREE.Vector3(0, 3, -5);
  private currentLookAt = new THREE.Vector3(0, 1, 0);
  private initialized = false;

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
      // Rider's-eye position: at helmet height (1.35m)
      const eyeOffset = new THREE.Vector3(
        Math.sin(heading) * 0.25,
        1.35,
        Math.cos(heading) * 0.25
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
      // Ideal position: behind the bike along heading
      const distanceBehind = 5.2;
      const heightAbove = 2.4;

      // Look ahead distance scales with speed (e.g. 6m at rest -> 18m at high speed)
      const lookAheadDist = lerp(6, 18, speedRatio);

      const idealPos = new THREE.Vector3(
        targetPos.x - Math.sin(heading) * distanceBehind,
        targetPos.y + heightAbove,
        targetPos.z - Math.cos(heading) * distanceBehind
      );

      const idealLookAt = new THREE.Vector3(
        targetPos.x + Math.sin(heading) * lookAheadDist,
        targetPos.y + 1.2,
        targetPos.z + Math.cos(heading) * lookAheadDist
      );

      // Anti-clip raycast pull-in:
      // Only test against large building/structure obstacles, NOT sidewalks or curbs
      const buildingColliders = colliders.filter(
        (c) => c.userData?.isBuilding || (c as THREE.Mesh).position?.y > 2.0
      );

      if (buildingColliders.length > 0) {
        const origin = targetPos.clone().add(new THREE.Vector3(0, 1.4, 0));
        const dir = idealPos.clone().sub(origin);
        const maxDist = dir.length();
        dir.normalize();

        this.raycaster.set(origin, dir);
        this.raycaster.far = maxDist;
        const hits = this.raycaster.intersectObjects(buildingColliders, true);
        if (hits.length > 0 && hits[0] && hits[0].distance < maxDist - 0.3) {
          // Keep safe distance behind the bike, never zoom into the rider
          const hitDist = Math.max(3.2, hits[0].distance - 0.3);
          idealPos.copy(origin).add(dir.multiplyScalar(hitDist));
        }
      }

      if (!this.initialized) {
        this.currentPos.copy(idealPos);
        this.currentLookAt.copy(idealLookAt);
        this.initialized = true;
      } else {
        // Spring-damping interpolation
        const posDamping = clamp(dt * 8, 0, 1);
        const lookDamping = clamp(dt * 12, 0, 1);

        this.currentPos.lerp(idealPos, posDamping);
        this.currentLookAt.lerp(idealLookAt, lookDamping);
      }

      this.camera.position.copy(this.currentPos);
      this.camera.lookAt(this.currentLookAt);
    }
  }
}
