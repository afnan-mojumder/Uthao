import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { PeopleRenderer } from '../../../src/render/people';
import { MotorcycleMesh, buildMultiMaterialPrototype } from '../../../src/render/vehicles';
import {
  VEHICLE_COLOR,
  VEHICLE_MODEL_IDS,
  ROAD_WORKER_VEST_COLOR,
} from '../../../src/render/vehicleStyles';
import { VEHICLE_CONFIGS } from '../../../src/sim/traffic/TrafficManager';
import type { PedestrianAgent } from '../../../src/sim/traffic/pedestrians';
import type { TrafficAgent } from '../../../src/sim/traffic/TrafficManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import { assetManager } from '../../../src/render/assets';
import defaultUpgrades from '../../../data/upgrades.json';
import type { UpgradeDef } from '../../../src/sim/economy/maintenance';

describe('traffic vehicles are drawn', () => {
  it('the renderer builds a mesh for every traffic kind except rickshaws', () => {
    const simKinds = Object.keys(VEHICLE_CONFIGS);

    const built = new PeopleRenderer().drawnVehicleKinds();
    const missing = simKinds.filter((k) => k !== 'rickshaw' && !built.includes(k as never));

    expect(missing).toEqual([]);
  });

  it('every drawn kind has a colour', () => {
    for (const kind of new PeopleRenderer().drawnVehicleKinds()) {
      expect(VEHICLE_COLOR[kind]).toBeTypeOf('number');
    }
  });
});

describe('MotorcycleMesh customization, animation, and lights (P2.4)', () => {
  it('updates MotorcycleMesh variant, paint color, seat cover, and wheel rotation from EconomyManager state', () => {
    const bus = new EventBus<GameEvents>();
    const econ = new EconomyManager(bus, { cash: 60000 });
    const upgrades = defaultUpgrades as UpgradeDef[];
    const crimson = upgrades.find((u) => u.id === 'cosmetic_paint_crimson')!;
    const emerald = upgrades.find((u) => u.id === 'cosmetic_paint_emerald')!;
    const leather = upgrades.find((u) => u.id === 'cosmetic_seat_leather')!;
    const meshSeat = upgrades.find((u) => u.id === 'cosmetic_seat_mesh')!;

    const mesh = new MotorcycleMesh();

    // Shadows enabled across bike and rider parts
    let meshCount = 0;
    mesh.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        meshCount++;
        expect(obj.castShadow).toBe(true);
      }
    });
    expect(meshCount).toBeGreaterThan(8);

    // Buy used125 + crimson paint + leather seat cover via EconomyManager
    expect(econ.buyBike('used125', false).success).toBe(true);
    expect(econ.buyUpgrade(crimson).success).toBe(true);
    expect(econ.buyUpgrade(leather).success).toBe(true);

    mesh.setVariant(econ.currentBikeId);
    mesh.setCosmetics(econ.installedCosmetics);

    expect(mesh.currentVariant).toBe('used125');
    const tankMat = mesh.tank.material as THREE.MeshStandardMaterial;
    expect(tankMat.color.getHexString()).toBe('dc2626');

    const seatMat = mesh.seat.material as THREE.MeshStandardMaterial;
    const leatherRoughness = seatMat.roughness;
    const leatherHex = seatMat.color.getHexString();

    // Switch to emerald paint and mesh seat cover
    expect(econ.buyUpgrade(emerald).success).toBe(true);
    expect(econ.buyUpgrade(meshSeat).success).toBe(true);
    mesh.setCosmetics(econ.installedCosmetics);
    expect(tankMat.color.getHexString()).toBe('059669');
    expect(seatMat.color.getHexString()).not.toBe(leatherHex);
    expect(seatMat.roughness).toBeGreaterThan(leatherRoughness);

    // Clearing cosmetics restores variant's default tank paint
    mesh.setVariant('new150');
    mesh.setCosmetics({});
    expect(mesh.currentVariant).toBe('new150');
    expect(tankMat.color.getHexString()).toBe('0284c7');

    // Wheel rotation driven by speed * dt
    const f0 = mesh.frontWheel.rotation.x;
    const r0 = mesh.rearWheel.rotation.x;
    mesh.setPose({ x: 0, y: 2.5, z: 0, heading: 0, lean: -0.2, steer: -0.3, speed: 12, dt: 0.1 });
    expect(mesh.root.position.y).toBeCloseTo(2.5);
    expect(mesh.frontWheel.rotation.x).toBeGreaterThan(f0 + 1.0);
    expect(mesh.rearWheel.rotation.x).toBeGreaterThan(r0 + 1.0);

    // Braking toggles brakeLight emissiveIntensity
    const brakeMat = mesh.brakeLight.material as THREE.MeshStandardMaterial;
    mesh.setBraking(false);
    const idleIntensity = brakeMat.emissiveIntensity;
    mesh.setBraking(true);
    expect(brakeMat.emissiveIntensity).toBeGreaterThan(idleIntensity * 2);
    mesh.setBraking(false);
    expect(brakeMat.emissiveIntensity).toBeCloseTo(idleIntensity);
  });

  it('animates smooth passenger boarding transition on setPassengerVisible', () => {
    const mesh = new MotorcycleMesh();
    expect(mesh.passengerGroup.visible).toBe(false);
    expect(mesh.getPassengerTransition()).toBe(0);

    mesh.setPassengerVisible(true);
    expect(mesh.passengerGroup.visible).toBe(true);
    mesh.update(0.1, 0);
    const mid = mesh.getPassengerTransition();
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);

    mesh.update(0.5, 0);
    expect(mesh.getPassengerTransition()).toBe(1);

    mesh.setPassengerVisible(false);
    mesh.update(0.1, 0);
    expect(mesh.passengerGroup.visible).toBe(true);
    expect(mesh.getPassengerTransition()).toBeLessThan(1);
    expect(mesh.getPassengerTransition()).toBeGreaterThan(0);

    mesh.update(0.5, 0);
    expect(mesh.getPassengerTransition()).toBe(0);
    expect(mesh.passengerGroup.visible).toBe(false);
  });
});

describe('PeopleRenderer multi-material Dhaka vehicles, GLTF cars, and animated pedestrians (P2.4)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates distinct multi-material traffic meshes (green CNG, rickshaw, bus, GLTF cars) and animated pedestrians', () => {
    // Mock GLTF prototypes for all 7 Kenney Car Kit vehicle IDs
    const gltfIds = new Set(Object.values(VEHICLE_MODEL_IDS).flat());
    expect(gltfIds.size).toBe(7);

    const mockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, name: 'colormap' });
    mockMat.userData.shared = true;
    const mockGeo = new THREE.BoxGeometry(1.6, 1.2, 3.8);
    mockGeo.userData.shared = true;

    vi.spyOn(assetManager, 'getInstancedPrototype').mockImplementation((id: string) => {
      if (gltfIds.has(id)) {
        return { geometry: mockGeo, material: mockMat };
      }
      return null;
    });

    const people = new PeopleRenderer();

    // 1. CNG is multi-material with Dhaka green (0x187a38) and yellow skirt (0xf2b705)
    const cngMeshes = people.getVehicleMeshes('cng');
    expect(cngMeshes.length).toBe(1);
    const cngMat = cngMeshes[0]!.material;
    expect(Array.isArray(cngMat)).toBe(true);
    const cngColors = (cngMat as THREE.MeshStandardMaterial[]).map((m) => m.color.getHex());
    expect(cngColors).toContain(0x187a38);
    expect(cngColors).toContain(0xf2b705);

    // 2. Rickshaw is multi-material (canopy crimson + folk art orange + blue carriage)
    const rickshawMesh = people.getRickshawMesh();
    expect(Array.isArray(rickshawMesh.material)).toBe(true);
    const rickshawColors = (rickshawMesh.material as THREE.MeshStandardMaterial[]).map((m) =>
      m.color.getHex()
    );
    expect(rickshawColors).toContain(0xdd3322);
    expect(rickshawColors).toContain(0xffaa00);

    // 3. Bus is multi-material (blue chassis + yellow stripe + red destination sign)
    const busMeshes = people.getVehicleMeshes('bus');
    expect(Array.isArray(busMeshes[0]!.material)).toBe(true);
    const busColors = (busMeshes[0]!.material as THREE.MeshStandardMaterial[]).map((m) =>
      m.color.getHex()
    );
    expect(busColors).toContain(0x1e88e5);
    expect(busColors).toContain(0xfdd835);
    expect(busColors).toContain(0xd32f2f);

    // 4. Scooter and motorcycle are multi-material
    expect(Array.isArray(people.getVehicleMeshes('scooter')[0]!.material)).toBe(true);
    expect(Array.isArray(people.getVehicleMeshes('motorcycle')[0]!.material)).toBe(true);

    // 5. GLTF car variants loaded from AssetManager
    expect(people.hasGltfPrototype('car')).toBe(true);
    expect(people.hasGltfPrototype('ride_hailing_car')).toBe(true);
    expect(people.hasGltfPrototype('minibus')).toBe(true);
    expect(people.hasGltfPrototype('delivery_van')).toBe(true);
    expect(people.hasGltfPrototype('truck')).toBe(true);
    expect(people.getVehicleMeshes('car').length).toBe(3);

    // 6. Multi-part pedestrians with clothing color variation & walk-cycle leg swing
    const parts = people.getPedestrianPartMeshes();
    expect(parts.head).toBeInstanceOf(THREE.InstancedMesh);
    expect(parts.torso).toBeInstanceOf(THREE.InstancedMesh);
    expect(parts.leftLeg).toBeInstanceOf(THREE.InstancedMesh);
    expect(parts.rightLeg).toBeInstanceOf(THREE.InstancedMesh);
    expect(parts.leftArm).toBeInstanceOf(THREE.InstancedMesh);
    expect(parts.rightArm).toBeInstanceOf(THREE.InstancedMesh);

    const peds: PedestrianAgent[] = [
      {
        id: 'ped_1',
        x: 10,
        z: 10,
        heading: 0,
        speed: 1.4,
        state: 'sidewalk',
        segmentId: 'seg_1',
        distAlongSegment: 5,
        lateralOffset: 4,
        side: 'left',
        direction: 1,
        lod: 'near',
      },
      {
        id: 'ped_worker_2',
        x: 14,
        z: 12,
        heading: 0,
        speed: 0.2,
        state: 'road_worker',
        segmentId: 'seg_1',
        distAlongSegment: 8,
        lateralOffset: 2,
        side: 'right',
        direction: 1,
        lod: 'near',
        isRoadWorker: true,
      },
      {
        id: 'ped_3',
        x: 18,
        z: 14,
        heading: 0,
        speed: 1.3,
        state: 'yielding',
        segmentId: 'seg_1',
        distAlongSegment: 10,
        lateralOffset: 4,
        side: 'left',
        direction: 1,
        lod: 'near',
      },
    ];

    const vehicles: TrafficAgent[] = [
      {
        id: 'veh_1',
        kind: 'car',
        laneId: 'l1',
        distAlongLane: 10,
        speed: 8,
        x: 5,
        z: 5,
        heading: 0,
        length: 4.5,
        width: 1.8,
        desiredSpeed: 12,
        lod: 'near',
      },
      {
        id: 'veh_2',
        kind: 'cng',
        laneId: 'l1',
        distAlongLane: 20,
        speed: 7,
        x: 8,
        z: 10,
        heading: 0,
        length: 2.8,
        width: 1.3,
        desiredSpeed: 10,
        lod: 'near',
      },
    ];

    people.update(peds, vehicles, 0.2);
    const legMatT1 = new THREE.Matrix4();
    const legMatT2 = new THREE.Matrix4();
    parts.leftLeg.getMatrixAt(0, legMatT1);

    // Road worker (index 1) wears high-vis orange vest
    const workerColor = new THREE.Color();
    parts.torso.getColorAt(1, workerColor);
    expect(workerColor.getHex()).toBe(ROAD_WORKER_VEST_COLOR);

    // Advance time -> walking ped_1's leg matrix changes
    people.update(peds, vehicles, 0.55);
    parts.leftLeg.getMatrixAt(0, legMatT2);
    expect(legMatT2.elements).not.toEqual(legMatT1.elements);

    // Yielding ped_3 (index 2) keeps stationary leg pose across frames
    const yieldMatT1 = new THREE.Matrix4();
    const yieldMatT2 = new THREE.Matrix4();
    people.update(peds, vehicles, 0.9);
    parts.leftLeg.getMatrixAt(2, yieldMatT1);
    people.update(peds, vehicles, 1.3);
    parts.leftLeg.getMatrixAt(2, yieldMatT2);
    expect(yieldMatT2.elements).toEqual(yieldMatT1.elements);
  });

  it('falls back gracefully when GLTF prototypes are null and upgrades on refreshPrototypes()', () => {
    const spy = vi.spyOn(assetManager, 'getInstancedPrototype').mockReturnValue(null);
    const people = new PeopleRenderer();
    expect(people.hasGltfPrototype('car')).toBe(false);
    expect(people.getVehicleMeshes('car')[0]!.geometry).toBeDefined();

    const mockMat = new THREE.MeshStandardMaterial({ color: 0xffffff, name: 'colormap' });
    mockMat.userData.shared = true;
    const mockGeo = new THREE.BoxGeometry(1.6, 1.2, 3.8);
    mockGeo.userData.shared = true;
    spy.mockImplementation((id) =>
      id === 'vehicle_sedan' || id === 'vehicle_taxi' ? { geometry: mockGeo, material: mockMat } : null
    );

    people.refreshPrototypes();
    expect(people.hasGltfPrototype('car')).toBe(true);
    expect(people.hasGltfPrototype('ride_hailing_car')).toBe(true);
  });

  it('runs PeopleRenderer.update and MotorcycleMesh.setPose for 1,000 frames without hot-path heap growth', () => {
    const people = new PeopleRenderer();
    const bike = new MotorcycleMesh();

    const peds: PedestrianAgent[] = Array.from({ length: 40 }, (_, i) => ({
      id: `ped_${i}`,
      x: i * 3,
      z: i * 2,
      heading: 0.4,
      speed: 1.3,
      state: 'sidewalk',
      segmentId: 'seg_1',
      distAlongSegment: i,
      lateralOffset: 4,
      side: 'left',
      direction: 1,
      lod: 'near',
    }));

    const vehicles: TrafficAgent[] = Array.from({ length: 20 }, (_, i) => ({
      id: `veh_${i}`,
      kind: i % 3 === 0 ? 'car' : i % 3 === 1 ? 'cng' : 'rickshaw',
      laneId: 'l1',
      distAlongLane: i * 5,
      speed: 8,
      x: i * 4,
      z: i * 3,
      heading: 0.1,
      length: 4,
      width: 1.8,
      desiredSpeed: 12,
      lod: 'near',
    }));

    // Warm up
    for (let i = 0; i < 100; i++) {
      people.update(peds, vehicles, i * 0.016);
      bike.setPose({ x: 0, y: 0, z: i, heading: 0, lean: 0.1, steer: 0.05, speed: 10, dt: 0.016 });
    }

    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 1000; i++) {
      people.update(peds, vehicles, i * 0.016);
      bike.setPose({ x: 0, y: 0, z: i, heading: 0, lean: 0.1, steer: 0.05, speed: 10, dt: 0.016 });
    }
    const diffMb = (process.memoryUsage().heapUsed - before) / (1024 * 1024);
    expect(diffMb).toBeLessThan(5);
  });

  it('buildMultiMaterialPrototype unwraps a single preserved material instead of returning a 1-element Material[]', () => {
    const group = new THREE.Group();
    const preservedMat = new THREE.MeshStandardMaterial({ color: 0x187a38, roughness: 0.5 });
    const partA = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), preservedMat);
    const partB = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), preservedMat);
    partB.position.set(0, 1, 0);
    group.add(partA, partB);

    const proto = buildMultiMaterialPrototype(group);
    expect(Array.isArray(proto.material)).toBe(false);
    expect(proto.material).toBe(preservedMat);
    expect(proto.geometry.groups.length).toBe(0);
  });
});
