import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { CameraRig } from '../../../src/render/CameraRig';
import { MotorcycleMesh } from '../../../src/render/vehicles';

describe('CameraRig roll & MotorcycleMesh lean/steer alignment', () => {
  const origin = new THREE.Vector3(0, 0, 0);

  function buildHelmetProbe(mesh: MotorcycleMesh): THREE.Object3D {
    // The rider's helmet sits at the top of leanGroup (y ≈ 1.3).
    // Measure world-X offset of a top-mounted probe attached to leanGroup.
    const leanGroup = mesh.root.children[0]!;
    const probe = new THREE.Object3D();
    probe.position.set(0, 1.3, 0);
    leanGroup.add(probe);
    return probe;
  }

  function buildForkProbe(mesh: MotorcycleMesh): THREE.Object3D {
    const leanGroup = mesh.root.children[0]!;
    // forkGroup sits at (0, 0.32, 0.65) inside leanGroup.
    const forkGroup = leanGroup.children.find(
      (c) => Math.abs(c.position.z - 0.65) < 0.01 && Math.abs(c.position.y - 0.32) < 0.01
    )!;
    const probe = new THREE.Object3D();
    probe.position.set(0, 0, 1);
    forkGroup.add(probe);
    return probe;
  }

  it('lean > 0 leans bike screen-right and rolls chase camera in the same direction (clockwise into right turn)', () => {
    const mesh = new MotorcycleMesh();
    const helmetProbe = buildHelmetProbe(mesh);

    const rig = new CameraRig(60, 16 / 9);
    // Warm up camera at rest facing +Z
    for (let i = 0; i < 120; i++) {
      rig.update(origin, 0, 10, [], 1 / 60, 0.35);
    }
    mesh.setPose({ x: 0, y: 0, z: 0, heading: 0, lean: 0.35, steer: 0 });
    mesh.root.updateMatrixWorld(true);

    const helmetWorld = new THREE.Vector3();
    helmetProbe.getWorldPosition(helmetWorld);

    // Project onto an unrolled chase camera facing +Z to check screen side (+ndc.x is screen-right)
    const unrolledCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
    unrolledCam.position.set(0, 2.3, -4.8);
    unrolledCam.lookAt(0, 1.1, 5);
    unrolledCam.updateMatrixWorld();
    const helmetNdc = helmetWorld.clone().project(unrolledCam);
    expect(helmetNdc.x).toBeGreaterThan(0.02); // leans screen-right
    expect(helmetWorld.x).toBeLessThan(0); // -X world is screen-right when facing +Z

    // Camera up vector must tilt in the same world-X direction as the bike lean (clockwise from behind)
    const camUpWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.camera.quaternion);
    expect(Math.sign(camUpWorld.x)).toBe(Math.sign(helmetWorld.x));
    expect(camUpWorld.x).toBeLessThan(-0.02);
  });

  it('lean < 0 leans bike screen-left and rolls chase camera in the same direction (counter-clockwise into left turn)', () => {
    const mesh = new MotorcycleMesh();
    const helmetProbe = buildHelmetProbe(mesh);

    const rig = new CameraRig(60, 16 / 9);
    for (let i = 0; i < 120; i++) {
      rig.update(origin, 0, 10, [], 1 / 60, -0.35);
    }
    mesh.setPose({ x: 0, y: 0, z: 0, heading: 0, lean: -0.35, steer: 0 });
    mesh.root.updateMatrixWorld(true);

    const helmetWorld = new THREE.Vector3();
    helmetProbe.getWorldPosition(helmetWorld);

    const unrolledCam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
    unrolledCam.position.set(0, 2.3, -4.8);
    unrolledCam.lookAt(0, 1.1, 5);
    unrolledCam.updateMatrixWorld();
    const helmetNdc = helmetWorld.clone().project(unrolledCam);
    expect(helmetNdc.x).toBeLessThan(-0.02); // leans screen-left
    expect(helmetWorld.x).toBeGreaterThan(0); // +X world is screen-left when facing +Z

    const camUpWorld = new THREE.Vector3(0, 1, 0).applyQuaternion(rig.camera.quaternion);
    expect(Math.sign(camUpWorld.x)).toBe(Math.sign(helmetWorld.x));
    expect(camUpWorld.x).toBeGreaterThan(0.02);
  });

  it('forkGroup turns toward screen-left for steer < 0 and screen-right for steer > 0', () => {
    const mesh = new MotorcycleMesh();
    const forkProbe = buildForkProbe(mesh);

    const cam = new THREE.PerspectiveCamera(60, 16 / 9, 0.1, 200);
    cam.position.set(0, 2.3, -4.8);
    cam.lookAt(0, 1.1, 5);
    cam.updateMatrixWorld();

    mesh.setPose({ x: 0, y: 0, z: 0, heading: 0, lean: 0, steer: -0.4 });
    mesh.root.updateMatrixWorld(true);
    const leftTip = new THREE.Vector3();
    forkProbe.getWorldPosition(leftTip);
    expect(leftTip.clone().project(cam).x).toBeLessThan(-0.02);

    mesh.setPose({ x: 0, y: 0, z: 0, heading: 0, lean: 0, steer: 0.4 });
    mesh.root.updateMatrixWorld(true);
    const rightTip = new THREE.Vector3();
    forkProbe.getWorldPosition(rightTip);
    expect(rightTip.clone().project(cam).x).toBeGreaterThan(0.02);
  });
});
