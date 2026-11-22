import * as THREE from 'three';
import type { PedestrianAgent } from '../sim/traffic/pedestrians';
import type { TrafficAgent, TrafficVehicleKind } from '../sim/traffic/TrafficManager';
import { assetManager } from './assets';
import {
  DRAWN_VEHICLE_KINDS,
  PEDESTRIAN_PANTS_COLORS,
  PEDESTRIAN_SHIRT_COLORS,
  PEDESTRIAN_SKIN_COLORS,
  ROAD_WORKER_VEST_COLOR,
  VEHICLE_COLOR,
  VEHICLE_MODEL_IDS,
} from './vehicleStyles';
import {
  buildMultiMaterialPrototype,
  createBicycleMesh,
  createBusMesh,
  createCNGMesh,
  createCarMesh,
  createRickshawMesh,
  createScooterMesh,
  createTrafficMotorcycleMesh,
  createVendorCartMesh,
} from './vehicles';

interface VehiclePrototype {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
  isGltf: boolean;
}

interface VehicleSlot {
  kind: TrafficVehicleKind;
  modelId?: string;
  mesh: THREE.InstancedMesh;
  capacity: number;
  isGltf: boolean;
  slotIndex: number;
}

export interface PedestrianPartMeshes {
  head: THREE.InstancedMesh;
  torso: THREE.InstancedMesh;
  leftLeg: THREE.InstancedMesh;
  rightLeg: THREE.InstancedMesh;
  leftArm: THREE.InstancedMesh;
  rightArm: THREE.InstancedMesh;
}

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function disposeSlotResources(mesh: THREE.InstancedMesh, isGltf = false): void {
  mesh.dispose();
  if (isGltf) return;
  if (mesh.geometry && !mesh.geometry.userData?.shared) {
    mesh.geometry.dispose();
  }
  if (Array.isArray(mesh.material)) {
    for (const m of mesh.material) {
      if (m && !m.userData?.shared) m.dispose();
    }
  } else if (mesh.material && !mesh.material.userData?.shared) {
    mesh.material.dispose();
  }
}

export class PeopleRenderer {
  readonly root: THREE.Group;

  // Multi-part animated pedestrians (6 InstancedMeshes = 6 draw calls total)
  private pedHeadMesh: THREE.InstancedMesh;
  private pedTorsoMesh: THREE.InstancedMesh;
  private pedLeftLegMesh: THREE.InstancedMesh;
  private pedRightLegMesh: THREE.InstancedMesh;
  private pedLeftArmMesh: THREE.InstancedMesh;
  private pedRightArmMesh: THREE.InstancedMesh;

  private rickshawMesh: THREE.InstancedMesh;
  private maxPedestrians = 120;
  private maxRickshaws = 60;
  private maxVehiclesPerKind = 40;

  // Preallocated scratch objects for 100% allocation-free per-frame updates
  private readonly _pos = new THREE.Vector3();
  private readonly _quat = new THREE.Quaternion();
  private readonly _scale = new THREE.Vector3(1, 1, 1);
  private readonly _rootMat = new THREE.Matrix4();
  private readonly _partPos = new THREE.Vector3();
  private readonly _partQuat = new THREE.Quaternion();
  private readonly _partMat = new THREE.Matrix4();
  private readonly _finalMat = new THREE.Matrix4();
  private readonly _xAxis = new THREE.Vector3(1, 0, 0);
  private readonly _yAxis = new THREE.Vector3(0, 1, 0);
  private readonly _scratchColor = new THREE.Color();

  // Vehicle slots per kind
  private readonly vehicleKinds: TrafficVehicleKind[] = [];
  private readonly slotsByKind = new Map<TrafficVehicleKind, VehicleSlot[]>();
  private readonly allSlots: VehicleSlot[] = [];
  private readonly slotCounts: number[] = [];

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'people_renderer';

    // 1. Multi-part pedestrians
    const headGeo = new THREE.BoxGeometry(0.21, 0.22, 0.21);
    headGeo.translate(0, 1.56, 0);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.72 });
    this.pedHeadMesh = this.createPedPartMesh(headGeo, headMat);

    const torsoGeo = new THREE.BoxGeometry(0.36, 0.56, 0.22);
    torsoGeo.translate(0, 1.12, 0);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 });
    this.pedTorsoMesh = this.createPedPartMesh(torsoGeo, torsoMat);

    // Pivot legs at hip (y = 0.84) and arms at shoulder (y = 1.36)
    const legGeo = new THREE.BoxGeometry(0.13, 0.84, 0.14);
    legGeo.translate(0, -0.42, 0);
    const legMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    this.pedLeftLegMesh = this.createPedPartMesh(legGeo, legMat);
    this.pedRightLegMesh = this.createPedPartMesh(legGeo, legMat);

    const armGeo = new THREE.BoxGeometry(0.1, 0.48, 0.1);
    armGeo.translate(0, -0.22, 0);
    const armMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.78 });
    this.pedLeftArmMesh = this.createPedPartMesh(armGeo, armMat);
    this.pedRightArmMesh = this.createPedPartMesh(armGeo, armMat);

    // 2. Multi-material Dhaka cycle rickshaw
    const rickshawProto = buildMultiMaterialPrototype(createRickshawMesh());
    this.rickshawMesh = new THREE.InstancedMesh(
      rickshawProto.geometry,
      rickshawProto.material,
      this.maxRickshaws
    );
    this.rickshawMesh.count = 0;
    this.rickshawMesh.frustumCulled = false;
    this.rickshawMesh.castShadow = true;
    this.rickshawMesh.receiveShadow = true;
    this.root.add(this.rickshawMesh);

    // 3. Cars, buses, CNG autos, trucks, motorcycles, scooters, bicycles, carts
    for (const kind of DRAWN_VEHICLE_KINDS) {
      this.vehicleKinds.push(kind);
      const modelIds = VEHICLE_MODEL_IDS[kind];
      const slots: VehicleSlot[] = [];

      if (modelIds && modelIds.length > 0) {
        const perVariantCap = Math.max(
          16,
          Math.ceil(this.maxVehiclesPerKind / modelIds.length) + 4
        );
        for (const modelId of modelIds) {
          const proto = this.resolveVehiclePrototype(kind, modelId);
          const mesh = this.createVehicleInstancedMesh(proto, perVariantCap);
          const slot: VehicleSlot = {
            kind,
            modelId,
            mesh,
            capacity: perVariantCap,
            isGltf: proto.isGltf,
            slotIndex: this.allSlots.length,
          };
          slots.push(slot);
          this.allSlots.push(slot);
          this.slotCounts.push(0);
        }
      } else {
        const proto = this.resolveVehiclePrototype(kind);
        const mesh = this.createVehicleInstancedMesh(proto, this.maxVehiclesPerKind);
        const slot: VehicleSlot = {
          kind,
          mesh,
          capacity: this.maxVehiclesPerKind,
          isGltf: proto.isGltf,
          slotIndex: this.allSlots.length,
        };
        slots.push(slot);
        this.allSlots.push(slot);
        this.slotCounts.push(0);
      }

      this.slotsByKind.set(kind, slots);
    }
  }

  private createPedPartMesh(
    geo: THREE.BufferGeometry,
    mat: THREE.Material
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geo, mat, this.maxPedestrians);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    // Pre-allocate instanceColor buffer once at construction time so update() stays zero-alloc
    this._scratchColor.setHex(0xffffff);
    mesh.setColorAt(0, this._scratchColor);
    this.root.add(mesh);
    return mesh;
  }

  private createVehicleInstancedMesh(
    proto: VehiclePrototype,
    capacity: number
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(proto.geometry, proto.material, capacity);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }

  private resolveVehiclePrototype(kind: TrafficVehicleKind, modelId?: string): VehiclePrototype {
    if (modelId) {
      const gltfProto = assetManager.getInstancedPrototype(modelId);
      if (gltfProto) {
        return {
          geometry: gltfProto.geometry,
          material: gltfProto.material,
          isGltf: true,
        };
      }
    }

    switch (kind) {
      case 'cng': {
        const p = buildMultiMaterialPrototype(createCNGMesh());
        return { ...p, isGltf: false };
      }
      case 'bus': {
        const p = buildMultiMaterialPrototype(createBusMesh());
        return { ...p, isGltf: false };
      }
      case 'motorcycle': {
        const p = buildMultiMaterialPrototype(createTrafficMotorcycleMesh());
        return { ...p, isGltf: false };
      }
      case 'scooter': {
        const p = buildMultiMaterialPrototype(createScooterMesh());
        return { ...p, isGltf: false };
      }
      case 'bicycle': {
        const p = buildMultiMaterialPrototype(createBicycleMesh());
        return { ...p, isGltf: false };
      }
      case 'vendor_cart': {
        const p = buildMultiMaterialPrototype(createVendorCartMesh());
        return { ...p, isGltf: false };
      }
      case 'car':
      case 'ride_hailing_car': {
        const p = buildMultiMaterialPrototype(createCarMesh());
        return { ...p, isGltf: false };
      }
      default:
        return this.buildBoxFallbackPrototype(kind);
    }
  }

  private buildBoxFallbackPrototype(kind: TrafficVehicleKind): VehiclePrototype {
    const group = new THREE.Group();
    const color = VEHICLE_COLOR[kind] ?? 0x64748b;
    const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.2 });
    const cabinMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.2 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });

    let w = 2.0;
    let h = 1.6;
    let d = 4.4;
    if (kind === 'minibus') {
      w = 2.05;
      h = 2.1;
      d = 4.8;
    } else if (kind === 'delivery_van') {
      w = 2.0;
      h = 2.2;
      d = 4.6;
    } else if (kind === 'truck') {
      w = 2.4;
      h = 2.6;
      d = 7.4;
    }

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.65, d), bodyMat);
    body.position.set(0, 0.35 + h * 0.325, 0);
    group.add(body);

    const cab = new THREE.Mesh(new THREE.BoxGeometry(w * 0.86, h * 0.35, d * 0.45), cabinMat);
    cab.position.set(0, 0.35 + h * 0.82, d * 0.18);
    group.add(cab);

    const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.16, 10);
    const halfW = w * 0.48;
    const halfL = d * 0.32;
    const offsets: [number, number][] = [
      [-halfW, halfL],
      [halfW, halfL],
      [-halfW, -halfL],
      [halfW, -halfL],
    ];
    for (const [wx, wz] of offsets) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.35, wz);
      group.add(wheel);
    }

    const p = buildMultiMaterialPrototype(group);
    return { ...p, isGltf: false };
  }

  /**
   * Upgrades procedural car/van/truck placeholders to optimized Kenney GLTF prototypes
   * once `assetManager.preloadCore()` has finished.
   */
  refreshPrototypes(): void {
    for (const slot of this.allSlots) {
      if (!slot.modelId) continue;
      const gltfProto = assetManager.getInstancedPrototype(slot.modelId);
      if (!gltfProto) continue;
      if (slot.isGltf && slot.mesh.geometry === gltfProto.geometry) continue;

      const oldMesh = slot.mesh;
      const nextMesh = new THREE.InstancedMesh(
        gltfProto.geometry,
        gltfProto.material,
        slot.capacity
      );
      nextMesh.count = 0;
      nextMesh.frustumCulled = false;
      nextMesh.castShadow = true;
      nextMesh.receiveShadow = true;

      this.root.remove(oldMesh);
      disposeSlotResources(oldMesh, slot.isGltf);
      this.root.add(nextMesh);

      slot.mesh = nextMesh;
      slot.isGltf = true;
    }
  }

  /** The kinds this renderer draws as vehicles (for tests and debugging). */
  drawnVehicleKinds(): TrafficVehicleKind[] {
    return [...this.vehicleKinds];
  }

  getRickshawMesh(): THREE.InstancedMesh {
    return this.rickshawMesh;
  }

  getVehicleMeshes(kind: TrafficVehicleKind): THREE.InstancedMesh[] {
    const slots = this.slotsByKind.get(kind);
    return slots ? slots.map((s) => s.mesh) : [];
  }

  hasGltfPrototype(kind: TrafficVehicleKind): boolean {
    const slots = this.slotsByKind.get(kind);
    if (!slots || slots.length === 0) return false;
    return slots.some((s) => s.isGltf);
  }

  getPedestrianPartMeshes(): PedestrianPartMeshes {
    return {
      head: this.pedHeadMesh,
      torso: this.pedTorsoMesh,
      leftLeg: this.pedLeftLegMesh,
      rightLeg: this.pedRightLegMesh,
      leftArm: this.pedLeftArmMesh,
      rightArm: this.pedRightArmMesh,
    };
  }

  update(
    pedestrians: PedestrianAgent[],
    trafficAgents: TrafficAgent[],
    timeSec = 0,
    cameraPos?: { x: number; z: number },
    maxDistance = 250
  ): void {
    const maxDistSq = maxDistance * maxDistance;

    // 1. Update multi-part pedestrians (allocation-free)
    let pedCount = 0;
    const maxPeds = this.maxPedestrians;
    for (let i = 0; i < pedestrians.length && pedCount < maxPeds; i++) {
      const p = pedestrians[i]!;
      if (cameraPos) {
        const dx = p.x - cameraPos.x;
        const dz = p.z - cameraPos.z;
        if (dx * dx + dz * dz > maxDistSq) continue;
      }

      const idHash = hashId(p.id);
      const baseY = p.y ?? 0;
      const effectiveSpeed = p.state === 'yielding' && p.crossingProgress === undefined ? 0 : p.speed;
      const isMoving = effectiveSpeed > 0.05;

      let legSwing = 0;
      let bobY = 0;
      if (isMoving) {
        const phase = timeSec * (effectiveSpeed * 5.2) + (idHash % 100) * 0.0628;
        const swingAmp = Math.min(0.55, effectiveSpeed * 0.36);
        legSwing = Math.sin(phase) * swingAmp;
        bobY = Math.abs(Math.sin(phase)) * 0.04;
      }

      this._pos.set(p.x, baseY + bobY, p.z);
      this._quat.setFromAxisAngle(this._yAxis, p.heading);
      this._rootMat.compose(this._pos, this._quat, this._scale);

      // Head & Torso
      this.pedHeadMesh.setMatrixAt(pedCount, this._rootMat);
      this.pedTorsoMesh.setMatrixAt(pedCount, this._rootMat);

      // Left leg (hip at -0.09, 0.84, 0)
      this._partPos.set(-0.09, 0.84, 0);
      this._partQuat.setFromAxisAngle(this._xAxis, legSwing);
      this._partMat.compose(this._partPos, this._partQuat, this._scale);
      this._finalMat.multiplyMatrices(this._rootMat, this._partMat);
      this.pedLeftLegMesh.setMatrixAt(pedCount, this._finalMat);

      // Right leg (hip at +0.09, 0.84, 0)
      this._partPos.set(0.09, 0.84, 0);
      this._partQuat.setFromAxisAngle(this._xAxis, -legSwing);
      this._partMat.compose(this._partPos, this._partQuat, this._scale);
      this._finalMat.multiplyMatrices(this._rootMat, this._partMat);
      this.pedRightLegMesh.setMatrixAt(pedCount, this._finalMat);

      // Left arm (shoulder at -0.24, 1.36, 0) swings opposite to left leg
      this._partPos.set(-0.24, 1.36, 0);
      this._partQuat.setFromAxisAngle(this._xAxis, -legSwing * 0.7);
      this._partMat.compose(this._partPos, this._partQuat, this._scale);
      this._finalMat.multiplyMatrices(this._rootMat, this._partMat);
      this.pedLeftArmMesh.setMatrixAt(pedCount, this._finalMat);

      // Right arm (shoulder at +0.24, 1.36, 0)
      this._partPos.set(0.24, 1.36, 0);
      this._partQuat.setFromAxisAngle(this._xAxis, legSwing * 0.7);
      this._partMat.compose(this._partPos, this._partQuat, this._scale);
      this._finalMat.multiplyMatrices(this._rootMat, this._partMat);
      this.pedRightArmMesh.setMatrixAt(pedCount, this._finalMat);

      // Per-instance Bangladeshi clothing & skin variation
      const skinHex = PEDESTRIAN_SKIN_COLORS[idHash % PEDESTRIAN_SKIN_COLORS.length]!;
      this._scratchColor.setHex(skinHex);
      this.pedHeadMesh.setColorAt(pedCount, this._scratchColor);

      const shirtHex = p.isRoadWorker
        ? ROAD_WORKER_VEST_COLOR
        : PEDESTRIAN_SHIRT_COLORS[(idHash >>> 4) % PEDESTRIAN_SHIRT_COLORS.length]!;
      this._scratchColor.setHex(shirtHex);
      this.pedTorsoMesh.setColorAt(pedCount, this._scratchColor);
      this.pedLeftArmMesh.setColorAt(pedCount, this._scratchColor);
      this.pedRightArmMesh.setColorAt(pedCount, this._scratchColor);

      const pantsHex = PEDESTRIAN_PANTS_COLORS[(idHash >>> 8) % PEDESTRIAN_PANTS_COLORS.length]!;
      this._scratchColor.setHex(pantsHex);
      this.pedLeftLegMesh.setColorAt(pedCount, this._scratchColor);
      this.pedRightLegMesh.setColorAt(pedCount, this._scratchColor);

      pedCount++;
    }

    this.commitPedPartMesh(this.pedHeadMesh, pedCount);
    this.commitPedPartMesh(this.pedTorsoMesh, pedCount);
    this.commitPedPartMesh(this.pedLeftLegMesh, pedCount);
    this.commitPedPartMesh(this.pedRightLegMesh, pedCount);
    this.commitPedPartMesh(this.pedLeftArmMesh, pedCount);
    this.commitPedPartMesh(this.pedRightArmMesh, pedCount);

    // 2. Update rickshaws without array allocations
    let rCount = 0;
    for (let i = 0; i < trafficAgents.length && rCount < this.maxRickshaws; i++) {
      const r = trafficAgents[i]!;
      if (r.kind !== 'rickshaw') continue;
      if (cameraPos) {
        const dx = r.x - cameraPos.x;
        const dz = r.z - cameraPos.z;
        if (dx * dx + dz * dz > maxDistSq) continue;
      }
      const y = r.y ?? 0;
      this._pos.set(r.x, y, r.z);
      this._quat.setFromAxisAngle(this._yAxis, r.heading);
      this._rootMat.compose(this._pos, this._quat, this._scale);
      this.rickshawMesh.setMatrixAt(rCount, this._rootMat);
      rCount++;
    }
    this.rickshawMesh.count = rCount;
    if (this.rickshawMesh.instanceMatrix) {
      this.rickshawMesh.instanceMatrix.needsUpdate = true;
    }

    // 3. Cars, buses, CNGs, trucks, motorcycles, scooters, bicycles, carts
    for (let s = 0; s < this.slotCounts.length; s++) {
      this.slotCounts[s] = 0;
    }

    for (let i = 0; i < trafficAgents.length; i++) {
      const a = trafficAgents[i]!;
      const slots = this.slotsByKind.get(a.kind);
      if (!slots || slots.length === 0) continue;
      if (cameraPos) {
        const dx = a.x - cameraPos.x;
        const dz = a.z - cameraPos.z;
        if (dx * dx + dz * dz > maxDistSq) continue;
      }

      const slot = slots.length === 1 ? slots[0]! : slots[hashId(a.id) % slots.length]!;
      const slotIdx = slot.slotIndex;
      const n = this.slotCounts[slotIdx]!;
      if (n >= slot.capacity) continue;

      const y = a.y ?? 0;
      this._pos.set(a.x, y, a.z);
      this._quat.setFromAxisAngle(this._yAxis, a.heading);
      this._rootMat.compose(this._pos, this._quat, this._scale);
      slot.mesh.setMatrixAt(n, this._rootMat);
      this.slotCounts[slotIdx] = n + 1;
    }

    for (let s = 0; s < this.allSlots.length; s++) {
      const slot = this.allSlots[s]!;
      slot.mesh.count = this.slotCounts[s]!;
      if (slot.mesh.instanceMatrix) {
        slot.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  private commitPedPartMesh(mesh: THREE.InstancedMesh, count: number): void {
    mesh.count = count;
    if (mesh.instanceMatrix) mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    const pedMeshes = [
      this.pedHeadMesh,
      this.pedTorsoMesh,
      this.pedLeftLegMesh,
      this.pedRightLegMesh,
      this.pedLeftArmMesh,
      this.pedRightArmMesh,
    ];
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    for (const pm of pedMeshes) {
      pm.dispose();
      if (pm.geometry) geos.add(pm.geometry);
      if (Array.isArray(pm.material)) {
        for (const m of pm.material) mats.add(m);
      } else if (pm.material) {
        mats.add(pm.material);
      }
    }
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();

    const disposeOwnedSlot = (mesh: THREE.InstancedMesh) => {
      mesh.dispose();
      if (mesh.geometry) mesh.geometry.dispose();
      if (Array.isArray(mesh.material)) {
        for (const m of mesh.material) m.dispose();
      } else if (mesh.material) {
        mesh.material.dispose();
      }
    };

    disposeOwnedSlot(this.rickshawMesh);
    for (const slot of this.allSlots) {
      if (slot.isGltf) {
        slot.mesh.dispose();
      } else {
        disposeOwnedSlot(slot.mesh);
      }
    }
    this.root.clear();
  }
}
