import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { PedestrianAgent } from '../sim/traffic/pedestrians';
import type { TrafficAgent, TrafficVehicleKind } from '../sim/traffic/TrafficManager';
import { DRAWN_VEHICLE_KINDS, VEHICLE_COLOR } from './vehicleStyles';

export class PeopleRenderer {
  readonly root: THREE.Group;
  private pedMesh: THREE.InstancedMesh;
  private rickshawMesh: THREE.InstancedMesh;
  private maxPedestrians = 120;
  private maxRickshaws = 60;
  private dummy = new THREE.Object3D();

  // One instanced mesh per drawn vehicle kind, indexed like DRAWN_VEHICLE_KINDS.
  private readonly vehicleKinds: TrafficVehicleKind[] = [];
  private readonly vehicleMeshes: THREE.InstancedMesh[] = [];
  private readonly vehicleCounts: number[] = [];
  private readonly vehicleIndex = new Map<TrafficVehicleKind, number>();
  private maxVehiclesPerKind = 40;

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

    // 3. Cars, buses, CNG autos, trucks and the rest of the traffic
    DRAWN_VEHICLE_KINDS.forEach((kind, idx) => {
      const mesh = new THREE.InstancedMesh(
        this.buildVehicleGeometry(kind),
        new THREE.MeshStandardMaterial({ color: VEHICLE_COLOR[kind], roughness: 0.5, metalness: 0.2 }),
        this.maxVehiclesPerKind
      );
      mesh.count = 0;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.root.add(mesh);
      this.vehicleKinds.push(kind);
      this.vehicleMeshes.push(mesh);
      this.vehicleCounts.push(0);
      this.vehicleIndex.set(kind, idx);
    });
  }

  /** The kinds this renderer draws as vehicles (for tests and debugging). */
  drawnVehicleKinds(): TrafficVehicleKind[] {
    return [...this.vehicleKinds];
  }

  private buildVehicleGeometry(kind: TrafficVehicleKind): THREE.BufferGeometry {
    const parts: THREE.BufferGeometry[] = [];
    const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
      new THREE.BoxGeometry(w, h, d).translate(x, y, z);
    const wheel = (x: number, y: number, z: number) =>
      new THREE.CylinderGeometry(0.35, 0.35, 0.12, 8).rotateZ(Math.PI / 2).translate(x, y, z);
    const fourWheels = (halfW: number, halfL: number) => {
      parts.push(
        wheel(-halfW, 0.35, halfL),
        wheel(halfW, 0.35, halfL),
        wheel(-halfW, 0.35, -halfL),
        wheel(halfW, 0.35, -halfL)
      );
    };

    switch (kind) {
      case 'car':
        parts.push(box(1.8, 0.7, 4.0, 0, 0.55, 0), box(1.6, 0.6, 2.0, 0, 1.15, -0.2));
        fourWheels(0.85, 1.3);
        break;
      case 'bus':
        parts.push(box(2.5, 2.8, 8.0, 0, 1.6, 0));
        fourWheels(1.2, 2.5);
        break;
      case 'minibus':
        parts.push(box(2.1, 2.2, 5.0, 0, 1.25, 0));
        fourWheels(0.95, 1.7);
        break;
      case 'truck':
        parts.push(box(2.4, 2.6, 6.0, 0, 1.5, -1.4), box(2.2, 1.6, 1.8, 0, 1.0, 2.6));
        fourWheels(1.1, 2.7);
        break;
      case 'delivery_van':
        parts.push(box(2.0, 2.1, 4.4, 0, 1.2, 0));
        fourWheels(0.9, 1.5);
        break;
      case 'cng':
        // Three-wheeled auto-rickshaw: one wheel at the front, two at the back.
        parts.push(box(1.2, 0.9, 2.0, 0, 0.6, -0.2), wheel(0, 0.35, 1.0), wheel(-0.5, 0.35, -0.9), wheel(0.5, 0.35, -0.9));
        break;
      case 'motorcycle':
        parts.push(box(0.4, 0.9, 1.8, 0, 0.6, 0), wheel(0, 0.35, 0.8), wheel(0, 0.35, -0.8));
        break;
      case 'scooter':
        parts.push(box(0.45, 0.7, 1.6, 0, 0.55, 0), wheel(0, 0.3, 0.7), wheel(0, 0.3, -0.7));
        break;
      case 'bicycle':
        parts.push(box(0.15, 0.6, 1.6, 0, 0.6, 0), wheel(0, 0.33, 0.7), wheel(0, 0.33, -0.7));
        break;
      case 'ride_hailing_car':
        parts.push(box(1.9, 0.7, 4.4, 0, 0.55, 0), box(1.6, 0.6, 2.2, 0, 1.15, -0.2));
        fourWheels(0.9, 1.4);
        break;
      case 'vendor_cart':
        parts.push(box(1.3, 0.9, 2.2, 0, 0.9, 0), box(1.1, 0.25, 1.9, 0, 1.5, 0));
        fourWheels(0.6, 0.8);
        break;
      default:
        parts.push(box(1.8, 1.0, 3.0, 0, 0.7, 0));
    }

    const merged = mergeGeometries(parts, false);
    return merged ?? new THREE.BoxGeometry(1.8, 1.4, 4.0);
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
    timeSec = 0,
    cameraPos?: { x: number; z: number },
    maxDistance = 250
  ): void {
    // 1. Update pedestrians with optional distance culling
    let pedCount = 0;
    const maxPeds = this.maxPedestrians;
    for (let i = 0; i < pedestrians.length && pedCount < maxPeds; i++) {
      const p = pedestrians[i]!;
      if (cameraPos) {
        const d = Math.hypot(p.x - cameraPos.x, p.z - cameraPos.z);
        if (d > maxDistance) continue;
      }
      this.dummy.position.set(p.x, 0, p.z);
      this.dummy.rotation.set(0, p.heading, 0);

      // Subtle walking bob when moving
      if (p.state !== 'yielding') {
        this.dummy.position.y = Math.abs(Math.sin(timeSec * 8 + i * 1.5)) * 0.04;
      } else {
        this.dummy.position.y = 0;
      }

      this.dummy.updateMatrix();
      this.pedMesh.setMatrixAt(pedCount, this.dummy.matrix);
      pedCount++;
    }
    this.pedMesh.count = pedCount;
    if (this.pedMesh.instanceMatrix) {
      this.pedMesh.instanceMatrix.needsUpdate = true;
    }

    // 2. Update rickshaws without array allocations (.filter)
    let rCount = 0;
    for (let i = 0; i < trafficAgents.length && rCount < this.maxRickshaws; i++) {
      const r = trafficAgents[i]!;
      if (r.kind !== 'rickshaw') continue;
      if (cameraPos) {
        const d = Math.hypot(r.x - cameraPos.x, r.z - cameraPos.z);
        if (d > maxDistance) continue;
      }
      this.dummy.position.set(r.x, 0, r.z);
      this.dummy.rotation.set(0, r.heading, 0);
      this.dummy.position.y = 0;
      this.dummy.updateMatrix();
      this.rickshawMesh.setMatrixAt(rCount, this.dummy.matrix);
      rCount++;
    }
    this.rickshawMesh.count = rCount;
    if (this.rickshawMesh.instanceMatrix) {
      this.rickshawMesh.instanceMatrix.needsUpdate = true;
    }

    // 3. Cars, buses and the rest: each kind fills its own instanced mesh.
    for (let k = 0; k < this.vehicleCounts.length; k++) this.vehicleCounts[k] = 0;
    for (let i = 0; i < trafficAgents.length; i++) {
      const a = trafficAgents[i]!;
      const idx = this.vehicleIndex.get(a.kind);
      if (idx === undefined) continue; // rickshaws and anything drawn elsewhere
      const n = this.vehicleCounts[idx]!;
      if (n >= this.maxVehiclesPerKind) continue;
      if (cameraPos) {
        const d = Math.hypot(a.x - cameraPos.x, a.z - cameraPos.z);
        if (d > maxDistance) continue;
      }
      this.dummy.position.set(a.x, 0, a.z);
      this.dummy.rotation.set(0, a.heading, 0);
      this.dummy.updateMatrix();
      this.vehicleMeshes[idx]!.setMatrixAt(n, this.dummy.matrix);
      this.vehicleCounts[idx] = n + 1;
    }
    for (let k = 0; k < this.vehicleMeshes.length; k++) {
      const mesh = this.vehicleMeshes[k]!;
      mesh.count = this.vehicleCounts[k]!;
      if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
    }
  }
}
