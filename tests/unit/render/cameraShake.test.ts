import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '../../../src/render/CameraRig';

describe('CameraRig camera-local shake', () => {
  it('applies shake along camera-local right and up axes regardless of heading', () => {
    const origin = new THREE.Vector3(0, 0, 0);
    const heading = Math.PI / 2; // Facing +X (East); camera-local right is +Z, forward is +X

    const baseRig = new CameraRig(60, 16 / 9);
    const shakeRig = new CameraRig(60, 16 / 9);

    for (let i = 0; i < 60; i++) {
      baseRig.update(origin, heading, 10, [], 1 / 60, 0);
      shakeRig.update(origin, heading, 10, [], 1 / 60, 0);
    }

    shakeRig.triggerShake(0.45);

    let maxDepthDelta = 0;
    let maxRightDelta = 0;
    let maxUpDelta = 0;

    for (let i = 0; i < 20; i++) {
      baseRig.update(origin, heading, 10, [], 1 / 60, 0);
      shakeRig.update(origin, heading, 10, [], 1 / 60, 0);
      maxDepthDelta = Math.max(maxDepthDelta, Math.abs(shakeRig.camera.position.x - baseRig.camera.position.x));
      maxRightDelta = Math.max(maxRightDelta, Math.abs(shakeRig.camera.position.z - baseRig.camera.position.z));
      maxUpDelta = Math.max(maxUpDelta, Math.abs(shakeRig.camera.position.y - baseRig.camera.position.y));
    }

    expect(maxRightDelta).toBeGreaterThan(0.05);
    expect(maxUpDelta).toBeGreaterThan(0.05);
    expect(maxDepthDelta).toBeLessThan(0.02);
  });

  it('respects reduceMotion when triggerShake is called', () => {
    const origin = new THREE.Vector3(0, 0, 0);
    const baseRig = new CameraRig(60, 16 / 9);
    const shakeRig = new CameraRig(60, 16 / 9);
    shakeRig.setReduceMotion(true);
    shakeRig.triggerShake(0.45);

    baseRig.update(origin, 0, 0, [], 1 / 60, 0);
    shakeRig.update(origin, 0, 0, [], 1 / 60, 0);

    expect(shakeRig.camera.position.distanceTo(baseRig.camera.position)).toBeCloseTo(0, 6);
  });
});
