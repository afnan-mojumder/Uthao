import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '../../../src/render/CameraRig';

describe('reduce motion holds the camera field of view (audit: FOV kick not gated)', () => {
  function fovAt(speed: number, reduce: boolean): number {
    const rig = new CameraRig(60, 16 / 9);
    rig.setReduceMotion(reduce);
    rig.update(new THREE.Vector3(0, 0, 0), 0, speed, [], 1 / 60);
    return rig.camera.fov;
  }

  it('without reduce motion, the field of view widens with speed', () => {
    expect(fovAt(22, false)).toBeGreaterThan(70);
  });

  it('with reduce motion, the field of view stays at 60 at any speed', () => {
    expect(fovAt(22, true)).toBeCloseTo(60, 5);
  });
});
