import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '../../../src/render/CameraRig';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';

describe('reduce motion holds the camera field of view (audit: FOV kick not gated)', () => {
  function fovAt(speed: number, reduce: boolean, vmax?: number): number {
    const rig = new CameraRig(60, 16 / 9);
    rig.setReduceMotion(reduce);
    rig.update(new THREE.Vector3(0, 0, 0), 0, speed, [], 1 / 60, 0, vmax);
    return rig.camera.fov;
  }

  it('without reduce motion, the field of view widens with speed', () => {
    expect(fovAt(22, false)).toBeGreaterThan(70);
  });

  it('with reduce motion, the field of view stays at 60 at any speed', () => {
    expect(fovAt(22, true)).toBeCloseTo(60, 5);
  });

  it('scales FOV kick against active bike vmax (e.g. new150 at 28 m/s)', () => {
    const fovAt22On150 = fovAt(22, false, 28);
    const fovAt28On150 = fovAt(28, false, 28);
    expect(fovAt22On150).toBeLessThan(70.5);
    expect(fovAt22On150).toBeGreaterThan(68.0);
    expect(fovAt28On150).toBeCloseTo(72, 2);
  });
});

describe('CameraRig P2.6 anti-clip, exponential smoothing, spawn pose, and first-person handlebars', () => {
  it('spawns camera directly at initial bike pose without swooping from origin', () => {
    const rig = new CameraRig(60, 16 / 9);
    const spawn = new THREE.Vector3(300, 0, 300);
    rig.update(spawn, 0, 0, [], 1 / 60, 0);

    // Must spawn directly behind bike (~4.8m behind at (300, 2.3, 295.2)), NOT near (0, 3, -5)
    expect(rig.camera.position.distanceTo(spawn)).toBeLessThan(7);
    expect(rig.camera.position.z).toBeGreaterThan(290);
  });

  it('uses PhysicsWorld.castRay2D for anti-clip and clamps currentPos immediately on obstruction', async () => {
    const physics = await PhysicsWorld.create();
    // Building right behind bike at z = -3.0 (front wall at z = -2.0), bike at (0, 0, 0) facing +Z
    physics.addStaticBox(0, 5, -3.0, 6, 5, 1.0, 0, 'building');

    const rig = new CameraRig(60, 16 / 9);
    rig.setPhysicsWorld(physics);
    // Deliberately put camera far behind the wall first at unobstructed position
    rig.update(new THREE.Vector3(50, 0, 50), 0, 0, [], 1 / 60, 0);
    // Now place bike right in front of building wall at (0, 0, 0) facing +Z -> ideal camera at (0, 2.3, -4.8)
    // is behind wall [-4, -2]. Anti-clip must immediately clamp currentPos in front of z = -2.0!
    rig.update(new THREE.Vector3(0, 0, 0), 0, 0, [], 1 / 60, 0);

    expect(rig.camera.position.z).toBeGreaterThan(-2.0);
  });

  it('uses frame-rate independent exponential smoothing 1 - Math.exp(-k * dt)', () => {
    const rigA = new CameraRig(60, 16 / 9);
    const rigB = new CameraRig(60, 16 / 9);
    // Start both at (0, 0, 0)
    rigA.update(new THREE.Vector3(0, 0, 0), 0, 0, [], 1 / 60, 0);
    rigB.update(new THREE.Vector3(0, 0, 0), 0, 0, [], 1 / 60, 0);

    // Move target by 10m: 2 steps of 0.025s vs 1 step of 0.05s should closely match under exp(-k*dt)
    const target = new THREE.Vector3(0, 0, 10);
    rigA.update(target, 0, 0, [], 0.025, 0);
    rigA.update(target, 0, 0, [], 0.025, 0);
    rigB.update(target, 0, 0, [], 0.05, 0);

    expect(rigA.camera.position.z).toBeCloseTo(rigB.camera.position.z, 3);
  });

  it('shows handlebarGroup only in firstPerson and applies P0.1 roll sign + shake unless reduceMotion', () => {
    const rig = new CameraRig(60, 16 / 9);
    expect(rig.handlebarGroup).toBeDefined();
    expect(rig.handlebarGroup.visible).toBe(false);

    rig.setMode('firstPerson');
    expect(rig.handlebarGroup.visible).toBe(true);

    const origin = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < 60; i++) {
      rig.update(origin, 0, 12, [], 1 / 60, 0.35);
    }
    const camUpWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.camera.quaternion);
    // Right lean (>0) tilts camera-up toward -X (matching chase mode P0.1 roll sign)
    expect(camUpWorld.x).toBeLessThan(-0.02);

    // Shake offsets firstPerson camera position
    const baseRig = new CameraRig(60, 16 / 9);
    baseRig.setMode('firstPerson');
    for (let i = 0; i < 60; i++) baseRig.update(origin, 0, 12, [], 1 / 60, 0);
    rig.update(origin, 0, 12, [], 1 / 60, 0);
    rig.triggerShake(0.45);
    let maxDelta = 0;
    for (let i = 0; i < 10; i++) {
      baseRig.update(origin, 0, 12, [], 1 / 60, 0);
      rig.update(origin, 0, 12, [], 1 / 60, 0);
      maxDelta = Math.max(maxDelta, rig.camera.position.distanceTo(baseRig.camera.position));
    }
    expect(maxDelta).toBeGreaterThan(0.05);

    // Reduce motion suppresses roll and shake in firstPerson
    rig.setReduceMotion(true);
    rig.triggerShake(0.45);
    rig.update(origin, 0, 12, [], 1 / 60, 0.35);
    const reducedUp = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.camera.quaternion);
    expect(Math.abs(reducedUp.x)).toBeLessThan(1e-4);
    expect(rig.camera.fov).toBeCloseTo(60, 5);

    rig.setMode('chase');
    expect(rig.handlebarGroup.visible).toBe(false);
  });
});
