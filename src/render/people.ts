import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PedestrianAgent } from '../sim/traffic/pedestrians';
import type { TrafficAgent } from '../sim/traffic/TrafficManager';

export class PeopleRenderer {
  readonly root: THREE.Group;
  private pedMesh: THREE.InstancedMesh;
  private rickshawMesh: THREE.InstancedMesh;
  private maxPedestrians = 120;
  private maxRickshaws = 60;
  private dummy = new THREE.Object3D();

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'people_renderer';

    // 1. Pedestrian instanced mesh
    const pedGeo = this.buildPedestrianGeometry();
    const pedMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.7,
      metalness: 0.1,
    });
    this.pedMesh = new THREE.InstancedMesh(pedGeo, pedMat, this.maxPedestrians);
    this.pedMesh.count = 0;
    this.pedMesh.castShadow = true;
    this.pedMesh.receiveShadow = true;
    this.root.add(this.pedMesh);

    // 2. Rickshaw instanced mesh
    const rickshawGeo = this.buildRickshawGeometry();
    const rickshawMat = new THREE.MeshStandardMaterial({
      color: 0x16a34a, // Dhaka vibrant green and yellow
      roughness: 0.5,
      metalness: 0.2,
    });
    this.rickshawMesh = new THREE.InstancedMesh(
      rickshawGeo,
      rickshawMat,
      this.maxRickshaws
    );
    this.rickshawMesh.count = 0;
    this.rickshawMesh.castShadow = true;
    this.rickshawMesh.receiveShadow = true;
    this.root.add(this.rickshawMesh);
  }

  private buildPedestrianGeometry(): THREE.BufferGeometry {
    const head = new THREE.BoxGeometry(0.22, 0.22, 0.22).translate(0, 1.55, 0);
    const torso = new THREE.BoxGeometry(0.38, 0.6, 0.22).translate(0, 1.15, 0);
    const legs = new THREE.BoxGeometry(0.32, 0.85, 0.2).translate(0, 0.425, 0);
    const merged = mergeGeometries([head, torso, legs], false);
    return merged ?? new THREE.BoxGeometry(0.4, 1.7, 0.3);
  }

  private buildRickshawGeometry(): THREE.BufferGeometry {
    const hood = new THREE.BoxGeometry(1.0, 0.9, 0.9).translate(0, 1.35, -0.4);
    const seat = new THREE.BoxGeometry(0.9, 0.4, 0.6).translate(0, 0.6, -0.4);
    const chassis = new THREE.BoxGeometry(0.4, 0.1, 1.8).translate(0, 0.35, 0.2);
    const puller = new THREE.BoxGeometry(0.3, 0.5, 0.2).translate(0, 1.0, 0.4);
    const head = new THREE.BoxGeometry(0.18, 0.18, 0.18).translate(0, 1.35, 0.4);
    const wL = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 8)
      .rotateZ(Math.PI / 2)
      .translate(-0.48, 0.35, -0.4);
    const wR = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 8)
      .rotateZ(Math.PI / 2)
      .translate(0.48, 0.35, -0.4);
    const wF = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 8)
      .rotateZ(Math.PI / 2)
      .translate(0, 0.35, 1.0);

    const merged = mergeGeometries(
      [hood, seat, chassis, puller, head, wL, wR, wF],
      false
    );
    return merged ?? new THREE.BoxGeometry(1.1, 1.6, 2.2);
  }

  update(
    pedestrians: PedestrianAgent[],
    trafficAgents: TrafficAgent[],
    timeSec = 0
  ): void {
    // 1. Update pedestrians
    const pedCount = Math.min(pedestrians.length, this.maxPedestrians);
    this.pedMesh.count = pedCount;

    for (let i = 0; i < pedCount; i++) {
      const p = pedestrians[i]!;
      this.dummy.position.set(p.x, 0, p.z);
      this.dummy.rotation.set(0, p.heading, 0);

      // Subtle walking bob when moving
      if (p.state !== 'yielding') {
        this.dummy.position.y = Math.abs(Math.sin(timeSec * 8 + i * 1.5)) * 0.04;
      }

      this.dummy.updateMatrix();
      this.pedMesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (this.pedMesh.instanceMatrix) {
      this.pedMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Update rickshaws
    const rickshaws = trafficAgents.filter((a) => a.kind === 'rickshaw');
    const rCount = Math.min(rickshaws.length, this.maxRickshaws);
    this.rickshawMesh.count = rCount;

    for (let i = 0; i < rCount; i++) {
      const r = rickshaws[i]!;
      this.dummy.position.set(r.x, 0, r.z);
      this.dummy.rotation.set(0, r.heading, 0);
      this.dummy.updateMatrix();
      this.rickshawMesh.setMatrixAt(i, this.dummy.matrix);
    }
    if (this.rickshawMesh.instanceMatrix) {
      this.rickshawMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
