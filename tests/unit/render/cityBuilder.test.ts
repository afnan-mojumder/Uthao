import { describe, it, expect, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { SignageAtlas } from '../../../src/render/signage';
import { RoadMeshBuilder, getRoadWidth } from '../../../src/render/roadMesh';
import { BuildingBuilder } from '../../../src/render/buildings';
import { LodManager } from '../../../src/render/lod';
import { CityBuilder, kerbEndTrim } from '../../../src/render/CityBuilder';
import { PhysicsWorld, type StaticBoxHandle } from '../../../src/physics/PhysicsWorld';
import { SignalController } from '../../../src/sim/traffic/signals';
import { assetManager } from '../../../src/render/assets';
import mirparaData from '../../../data/districts/mirpara.json';
import fulgateData from '../../../data/districts/fulgate.json';
import mohakhalData from '../../../data/districts/mohakhal.json';
import testloopData from '../../../data/districts/testloop.json';
import worldDataJson from '../../../data/world.json';
import type { DistrictData, BuildingLot, WorldData } from '../../../src/sim/schemas';
import type { DistrictId } from '../../../src/core/types';

describe('CityBuilder, Roads, Buildings and LOD (T3.3)', () => {
  describe('SignageAtlas', () => {
    it('initializes with default signs and provides valid UVs', () => {
      const atlas = new SignageAtlas();
      expect(atlas.signKeys.length).toBeGreaterThan(5);

      const uv = atlas.getUv('sign.pharmacy');
      expect(uv.uMin).toBeGreaterThanOrEqual(0);
      expect(uv.uMax).toBeLessThanOrEqual(1);
      expect(uv.vMin).toBeGreaterThanOrEqual(0);
      expect(uv.vMax).toBeLessThanOrEqual(1);
      expect(uv.uMax).toBeGreaterThan(uv.uMin);
      expect(uv.vMax).toBeGreaterThan(uv.vMin);
    });

    it('creates a signboard mesh with atlas material and custom UVs', () => {
      const atlas = new SignageAtlas();
      const mesh = atlas.createSignboardMesh('sign.tea_stall', 3.6, 0.9);
      expect(mesh).toBeDefined();
      expect(mesh.material).toBe(atlas.material);
      expect(mesh.castShadow).toBe(true);
    });
  });

  describe('RoadMeshBuilder', () => {
    it('computes expected road widths by honoring segment.width', () => {
      const dividedSeg = (mirparaData as DistrictData).segments.find((s) => s.divided)!;
      const residentialSeg = (mirparaData as DistrictData).segments.find((s) => s.roadType === 'residential')!;
      const alleySeg = (mirparaData as DistrictData).segments.find((s) => s.roadType === 'alley')!;

      expect(getRoadWidth(dividedSeg)).toBe(dividedSeg.width);
      expect(getRoadWidth(residentialSeg)).toBe(residentialSeg.width);
      expect(getRoadWidth(alleySeg)).toBe(alleySeg.width);
    });

    it('builds road ribbons, kerbs, and zebra crossings for Mirpara', () => {
      const builder = new RoadMeshBuilder();
      const result = builder.build(mirparaData as DistrictData);

      expect(result.group.children.length).toBeGreaterThan(50);
      expect(result.segmentCount).toBe(mirparaData.segments.length);
      expect(result.zebraCount).toBeGreaterThan(0);
      expect(result.colliders.length).toBeGreaterThan(0);
    });

    it('builds road ribbons for testloop without errors', () => {
      const builder = new RoadMeshBuilder();
      const result = builder.build(testloopData as DistrictData);

      expect(result.group.children.length).toBeGreaterThan(0);
      expect(result.segmentCount).toBe(testloopData.segments.length);
    });
  });

  describe('BuildingBuilder', () => {
    it('builds 4-8 storey apartment blocks with rooftop tanks and balconies', () => {
      const atlas = new SignageAtlas();
      const builder = new BuildingBuilder(atlas);

      const sampleLots: BuildingLot[] = [
        {
          lotId: 'test_lot_1',
          x: 10,
          z: 20,
          width: 18,
          depth: 16,
          facingHeading: 0,
          zone: 'residential',
        },
        {
          lotId: 'test_lot_2',
          x: 40,
          z: 20,
          width: 20,
          depth: 16,
          facingHeading: Math.PI / 2,
          zone: 'commercial',
        },
      ];

      const result = builder.build(sampleLots);
      expect(result.buildingCount).toBe(2);
      expect(result.group.children.length).toBe(2);
      expect(result.colliders.length).toBe(2);

      // Verify building components
      const bldg1 = result.group.children[0]!;
      expect(bldg1.position.x).toBe(10);
      expect(bldg1.position.z).toBe(20);
      // Contains main block, parapet, water tanks, balconies, windows
      expect(bldg1.children.length).toBeGreaterThan(5);
    });

    it('builds all lots from Mirpara district', () => {
      const builder = new BuildingBuilder();
      const result = builder.build(mirparaData.lots as BuildingLot[]);

      expect(result.buildingCount).toBe(mirparaData.lots.length);
      expect(result.colliders.length).toBe(mirparaData.lots.length);
    });
  });

  describe('LodManager', () => {
    it('organizes objects into 100m spatial chunks and culls distant chunks', () => {
      const lod = new LodManager(100);

      const objNear = new THREE.Object3D();
      objNear.position.set(20, 0, 30);
      lod.addObject(objNear, 20, 30);

      const objFar = new THREE.Object3D();
      objFar.position.set(500, 0, 500);
      lod.addObject(objFar, 500, 500);

      expect(lod.getChunkCount()).toBe(2);

      // Camera near (0, 0) with 200m draw distance
      lod.update({ x: 0, z: 0 }, 200);

      const nearChunk = lod.getChunk(20, 30);
      const farChunk = lod.getChunk(500, 500);

      expect(nearChunk.root.visible).toBe(true);
      expect(farChunk.root.visible).toBe(false);

      // Move camera close to (500, 500)
      lod.update({ x: 500, z: 500 }, 200);
      expect(nearChunk.root.visible).toBe(false);
      expect(farChunk.root.visible).toBe(true);
    });
  });

  describe('CityBuilder Orchestrator', () => {
    it('builds full district, populates colliders, and generates static physics boxes', async () => {
      const city = new CityBuilder();
      const physics = await PhysicsWorld.create();

      city.buildDistrict(mirparaData as DistrictData, physics);

      expect(city.colliders.length).toBeGreaterThan(50);
      expect(city.staticBoxDescs.length).toBe(mirparaData.lots.length);
      expect(city.lodManager.getChunkCount()).toBeGreaterThan(0);

      const handles = city.districtPhysicsColliders.get('mirpara') ?? [];
      expect(handles.some((h) => h.kind === 'building')).toBe(true);
      expect(handles.some((h) => h.kind === 'kerb')).toBe(true);
      expect(handles.some((h) => h.kind === 'median')).toBe(true);

      // Update LOD without error
      city.update({ x: 300, z: 300 }, 250);
      expect(city.lodManager.getVisibleChunkCount()).toBeGreaterThan(0);
    });
  });
});

describe('kerbEndTrim (T9.1)', () => {
  const nodes = new Map(testloopData.nodes.map((n) => [n.nodeId, n]));
  const segs = testloopData.segments as DistrictData['segments'];

  it('opens the N1 junction: kerbs of N1-N4 and N1-N2 stop short of the cross road', () => {
    const s1 = segs.find((s) => s.startNodeId === 'N1' && s.endNodeId === 'N2')!;
    const s4 = segs.find((s) => [s.startNodeId, s.endNodeId].sort().join() === 'N1,N4')!;
    // N1 is where N1-N2 (width 10) meets the N1-N4 road (width 8): the N1-N2 kerb
    // must clear half of N1-N4 so the bike can turn into it, and vice versa.
    expect(kerbEndTrim(s1, true, segs, nodes)).toBeGreaterThanOrEqual(4);
    expect(kerbEndTrim(s4, s4.startNodeId === 'N1', segs, nodes)).toBeGreaterThanOrEqual(5);
  });
});

describe('P2.3 CityBuilder Facades, POIs, Traffic Signals, Connectors & Shared Materials', () => {
  afterEach(() => {
    assetManager.clearCache();
  });

  it('orients building facades toward the street (+Z local facing normal points toward nearest road)', () => {
    const mirpara = mirparaData as unknown as DistrictData;
    const nodeMap = new Map(mirpara.nodes.map((n) => [n.nodeId, n]));
    const atlas = new SignageAtlas();
    const builder = new BuildingBuilder(atlas);
    const lots = (mirpara.lots ?? []).slice(0, 40);
    const result = builder.build(lots);
    result.group.updateMatrixWorld(true);

    let alignedCount = 0;
    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i]!;
      const bGroup = result.group.children[i]!;
      let bestDist = Infinity;
      let nearestX = lot.x;
      let nearestZ = lot.z;
      for (const seg of mirpara.segments) {
        const a = nodeMap.get(seg.startNodeId);
        const b = nodeMap.get(seg.endNodeId);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((lot.x - a.x) * dx + (lot.z - a.z) * dz) / len2)) : 0;
        const px = a.x + t * dx;
        const pz = a.z + t * dz;
        const d = Math.hypot(px - lot.x, pz - lot.z);
        if (d < bestDist) {
          bestDist = d;
          nearestX = px;
          nearestZ = pz;
        }
      }
      const toRoad = new THREE.Vector2(nearestX - lot.x, nearestZ - lot.z).normalize();
      const localPlusZ = new THREE.Vector3(0, 0, 1).transformDirection(bGroup.matrixWorld);
      const facingXZ = new THREE.Vector2(localPlusZ.x, localPlusZ.z).normalize();
      if (facingXZ.dot(toRoad) > 0.7) {
        alignedCount++;
      }
    }
    expect(alignedCount).toBeGreaterThanOrEqual(lots.length - 1);
  });

  it('scales building facade UVs in world meters and blends loaded Kenney GLB prototypes', async () => {
    const atlas = new SignageAtlas();
    const builder = new BuildingBuilder(atlas);
    const shortLot: BuildingLot = {
      lotId: 'short_lot',
      x: 0,
      z: 0,
      width: 14,
      depth: 12,
      facingHeading: 0,
      zone: 'residential',
    };
    const tallLot: BuildingLot = {
      lotId: 'tall_lot',
      x: 1,
      z: 0,
      width: 14,
      depth: 12,
      facingHeading: 0,
      zone: 'residential',
    };
    const res = builder.build([shortLot, tallLot]);
    const shortMain = res.group.children[0]!.children[0] as THREE.Mesh;
    const tallMain = res.group.children[1]!.children[0] as THREE.Mesh;
    const maxV = (m: THREE.Mesh) => {
      const uv = m.geometry.getAttribute('uv')!;
      let v = 0;
      for (let i = 0; i < uv.count; i++) v = Math.max(v, uv.getY(i));
      return v;
    };
    // shortLot has 4 storeys (12.8m), tallLot has 8 storeys (25.6m) -> tall UV V must be > short UV V
    expect(maxV(tallMain)).toBeGreaterThan(maxV(shortMain) * 1.5);

    // When a Kenney GLB prototype is cached in AssetManager, BuildingBuilder blends it in
    await assetManager.init();
    const protoGeo = new THREE.BoxGeometry(8, 12, 8);
    const protoMat = new THREE.MeshStandardMaterial({ color: 0x998877, name: 'colormap' });
    const mockScene = new THREE.Group();
    mockScene.add(new THREE.Mesh(protoGeo, protoMat));
    const loader = assetManager.getLoader()!;
    const spy = vi.spyOn(loader, 'loadAsync').mockResolvedValue({
      scene: mockScene,
      scenes: [mockScene],
      animations: [],
      cameras: [],
      asset: { version: '2.0' },
      parser: {} as never,
      userData: {},
    });
    await assetManager.loadModel('building_commercial_a', 'high');
    await assetManager.loadModel('building_commercial_b', 'high');
    await assetManager.loadModel('building_commercial_c', 'high');
    await assetManager.loadModel('building_commercial_d', 'high');
    await assetManager.loadModel('building_commercial_tower', 'high');
    await assetManager.loadModel('building_commercial_highrise', 'high');
    spy.mockRestore();

    const mixedLots: BuildingLot[] = Array.from({ length: 6 }, (_, idx) => ({
      lotId: `mix_${idx}`,
      x: 20 * idx,
      z: 0,
      width: 14,
      depth: 12,
      facingHeading: 0,
      zone: 'commercial',
    }));
    const mixedRes = builder.build(mixedLots);
    let glbMeshCount = 0;
    mixedRes.group.traverse((o) => {
      if (o.name.startsWith('kenney_building_')) glbMeshCount++;
    });
    expect(glbMeshCount).toBeGreaterThan(0);
  });

  it('places 3D POI props (teaStall, fuel, garage, footbridge, traffic signals) in district chunks and syncs signal lights', async () => {
    const mirpara = mirparaData as unknown as DistrictData;
    const city = new CityBuilder();
    const physics = await PhysicsWorld.create();
    city.buildDistrict(mirpara, physics);

    const names: string[] = [];
    for (const chunk of city.lodManager.chunks.values()) {
      chunk.root.traverse((obj) => {
        if (obj.name) names.push(obj.name);
      });
    }

    expect(names.some((n) => n.startsWith('poi_teaStall_'))).toBe(true);
    expect(names.some((n) => n.startsWith('poi_fuel_'))).toBe(true);
    expect(names.some((n) => n.startsWith('poi_garage_'))).toBe(true);
    expect(names.some((n) => n.startsWith('poi_footbridge_'))).toBe(true);
    expect(names.some((n) => n.startsWith('traffic_signal_'))).toBe(true);

    // Verify SignalController live sync drives red/yellow/green lens emissive intensity
    const signals = new SignalController(mirpara.nodes, 10);
    const sigNode = mirpara.nodes.find((n) => n.signal)!;
    city.updateTrafficSignals(signals);

    const signalObjects: THREE.Object3D[] = [];
    for (const chunk of city.lodManager.chunks.values()) {
      chunk.root.traverse((obj) => {
        if (obj.name.startsWith(`traffic_signal_${sigNode.nodeId}`)) {
          signalObjects.push(obj);
        }
      });
    }
    expect(signalObjects.length).toBeGreaterThanOrEqual(2);

    const ewPole = signalObjects.find((o) => o.userData.approachIndex === 0)!;
    expect(ewPole).toBeDefined();
    const getLensEmissive = (pole: THREE.Object3D, lensName: string) => {
      const m = pole.getObjectByName(lensName) as THREE.Mesh;
      return (m.material as THREE.MeshStandardMaterial).emissiveIntensity;
    };

    // Phase 0: approach 0 is green
    expect(getLensEmissive(ewPole, 'lens_green')).toBeGreaterThan(0);
    expect(getLensEmissive(ewPole, 'lens_yellow')).toBe(0);
    expect(getLensEmissive(ewPole, 'lens_red')).toBe(0);

    // Advance into yellow (< 3s remaining)
    signals.update(8.0);
    city.updateTrafficSignals(signals);
    expect(getLensEmissive(ewPole, 'lens_yellow')).toBeGreaterThan(0);
    expect(getLensEmissive(ewPole, 'lens_green')).toBe(0);

    // Advance into Phase 1: approach 0 is red
    signals.update(3.0);
    city.updateTrafficSignals(signals);
    expect(getLensEmissive(ewPole, 'lens_red')).toBeGreaterThan(0);
    expect(getLensEmissive(ewPole, 'lens_yellow')).toBe(0);
  });

  it('builds road meshes and colliders for world.connectors and elevated flyover decks with pillars', async () => {
    const worldData = worldDataJson as unknown as WorldData;
    const districts = new Map<DistrictId, DistrictData>();
    for (const dRef of worldData.districts) {
      const raw = JSON.parse(fs.readFileSync(path.resolve(dRef.file), 'utf-8')) as DistrictData;
      districts.set(dRef.districtId as DistrictId, raw);
    }

    const physics = await PhysicsWorld.create();
    const city = new CityBuilder();
    city.initWorldStreaming(worldData, (id) => districts.get(id), physics, { x: 300, z: 300 });

    // Border between Mirpara and Fulgate around (600, 291)
    const borderChunk = city.lodManager.getChunk(595, 291);
    const hasConnectorMesh = borderChunk.root.children.some((c) => {
      const box = new THREE.Box3().setFromObject(c);
      return box.max.x > 590;
    });
    expect(hasConnectorMesh).toBe(true);

    // Physics kerb colliders exist along the connector corridor (x ~ 580..620, z ~ 280..320)
    const connHits: StaticBoxHandle[] = [];
    physics.queryAabb(585, 280, 615, 320, connHits);
    expect(connHits.some((h) => h.kind === 'kerb')).toBe(true);

    // Also build Mohakhali and confirm flyover pillars + elevated colliders exist
    city.buildDistrict(mohakhalData as unknown as DistrictData, physics);
    const mohakhalNames: string[] = [];
    for (const chunk of city.lodManager.chunks.values()) {
      chunk.root.traverse((obj) => {
        if (obj.name) mohakhalNames.push(obj.name);
      });
    }
    expect(mohakhalNames).toContain('flyover_pillar');

    const mohakhalHandles = city.districtPhysicsColliders.get('mohakhal') ?? [];
    expect(mohakhalHandles.some((h) => h.minY >= 5.5)).toBe(true);
  });

  it('keeps shared materials intact when unloading a district', async () => {
    const city = new CityBuilder();
    const physics = await PhysicsWorld.create();
    city.buildDistrict(mirparaData as unknown as DistrictData, physics);
    city.buildDistrict(fulgateData as unknown as DistrictData, physics);

    expect(city.signageAtlas.material.userData.shared).toBe(true);
    let disposedCount = 0;
    const origDispose = city.signageAtlas.material.dispose.bind(city.signageAtlas.material);
    city.signageAtlas.material.dispose = () => {
      disposedCount++;
      origDispose();
    };

    city.unloadDistrict('fulgate');
    expect(disposedCount).toBe(0);
    expect(city.isDistrictLoaded('mirpara')).toBe(true);
  });

  it('tags AssetManager prototypes as shared and does not dispose them when unloading a district', async () => {
    await assetManager.init();
    const g1 = new THREE.BoxGeometry(8, 12, 8);
    const g2 = new THREE.BoxGeometry(4, 6, 4);
    const m1 = new THREE.MeshStandardMaterial({ color: 0x998877 });
    const m2 = new THREE.MeshStandardMaterial({ color: 0x334455 });
    const mockScene = new THREE.Group();
    mockScene.add(new THREE.Mesh(g1, m1));
    mockScene.add(new THREE.Mesh(g2, m2));

    const loader = assetManager.getLoader()!;
    const loadSpy = vi.spyOn(loader, 'loadAsync').mockResolvedValue({
      scene: mockScene,
      scenes: [mockScene],
      animations: [],
      cameras: [],
      asset: { version: '2.0' },
      parser: {} as never,
      userData: {},
    });
    await assetManager.loadModel('building_commercial_a', 'high');
    loadSpy.mockRestore();

    const extracted = assetManager.getInstancedPrototype('building_commercial_a')!;
    expect(extracted).not.toBeNull();
    expect(extracted.geometry.userData.shared).toBe(true);
    const extractedMats = Array.isArray(extracted.material) ? extracted.material : [extracted.material];
    for (const m of extractedMats) {
      expect(m.userData.shared).toBe(true);
    }

    // Also test unloadDistrict() directly with mocked getInstancedPrototype + dispose spies
    const sharedGeo = new THREE.BoxGeometry(6, 10, 6);
    const sharedMatA = new THREE.MeshStandardMaterial({ color: 0xaa8866 });
    const sharedMatB = new THREE.MeshStandardMaterial({ color: 0x556677 });
    const geoDisposeSpy = vi.spyOn(sharedGeo, 'dispose');
    const matADisposeSpy = vi.spyOn(sharedMatA, 'dispose');
    const matBDisposeSpy = vi.spyOn(sharedMatB, 'dispose');

    const protoSpy = vi.spyOn(assetManager, 'getInstancedPrototype').mockImplementation((id) => {
      if (id.startsWith('building_') || id === 'prop_streetlight') {
        return { geometry: sharedGeo, material: [sharedMatA, sharedMatB] };
      }
      return null;
    });

    const city = new CityBuilder();
    const physics = await PhysicsWorld.create();
    city.buildDistrict(mirparaData as unknown as DistrictData, physics);
    city.buildDistrict(fulgateData as unknown as DistrictData, physics);

    city.unloadDistrict('fulgate');

    expect(geoDisposeSpy).not.toHaveBeenCalled();
    expect(matADisposeSpy).not.toHaveBeenCalled();
    expect(matBDisposeSpy).not.toHaveBeenCalled();

    protoSpy.mockRestore();
    sharedGeo.dispose();
    sharedMatA.dispose();
    sharedMatB.dispose();
    g1.dispose();
    g2.dispose();
    m1.dispose();
    m2.dispose();
  });

  it('orients traffic signal cantilever arms inward over the roadway toward the intersection center', async () => {
    const mirpara = mirparaData as unknown as DistrictData;
    const city = new CityBuilder();
    const physics = await PhysicsWorld.create();
    city.buildDistrict(mirpara, physics);

    const sigNode = mirpara.nodes.find((n) => n.signal)!;
    const signalObjects: THREE.Object3D[] = [];
    for (const chunk of city.lodManager.chunks.values()) {
      chunk.root.updateMatrixWorld(true);
      chunk.root.traverse((obj) => {
        if (obj.name.startsWith(`traffic_signal_${sigNode.nodeId}`)) {
          signalObjects.push(obj);
        }
      });
    }

    const ewPole = signalObjects.find((o) => o.userData.approachIndex === 0)!;
    const nsPole = signalObjects.find((o) => o.userData.approachIndex === 1)!;
    expect(ewPole).toBeDefined();
    expect(nsPole).toBeDefined();

    for (const pole of [ewPole, nsPole]) {
      const basePos = new THREE.Vector3();
      const headPos = new THREE.Vector3();
      pole.getWorldPosition(basePos);
      pole.getObjectByName('lens_red')!.getWorldPosition(headPos);

      const baseDist = Math.hypot(basePos.x - sigNode.x, basePos.z - sigNode.z);
      const headDist = Math.hypot(headPos.x - sigNode.x, headPos.z - sigNode.z);
      expect(headDist).toBeLessThan(baseDist);
    }
  });

  it('batchStaticGroups preserves exact world transforms for multi-material meshes without double-applying local transforms', () => {
    const city = new CityBuilder();
    const parent = new THREE.Group();
    parent.position.set(100, 0, 200);
    parent.rotation.y = Math.PI / 3;

    const geo = new THREE.BoxGeometry(2, 4, 2);
    const matA = new THREE.MeshStandardMaterial({ color: 0xff0000 });
    const matB = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const child = new THREE.Mesh(geo, [matA, matB]);
    child.name = 'multi_mat_child';
    child.position.set(3, 1, -2);
    child.rotation.y = Math.PI / 4;
    child.scale.set(1.5, 2.0, 0.75);
    child.castShadow = true;
    child.receiveShadow = true;
    parent.add(child);
    parent.updateMatrixWorld(true);

    const expectedPos = new THREE.Vector3();
    const expectedQuat = new THREE.Quaternion();
    const expectedScale = new THREE.Vector3();
    child.matrixWorld.decompose(expectedPos, expectedQuat, expectedScale);

    type BatchFn = (entries: Array<{ obj: THREE.Object3D; x: number; z: number }>) => Array<{ obj: THREE.Object3D; x: number; z: number }>;
    const batched = (city as unknown as { batchStaticGroups: BatchFn }).batchStaticGroups([
      { obj: parent, x: 100, z: 200 },
    ]);

    expect(batched.length).toBe(1);
    const outMesh = batched[0]!.obj as THREE.Mesh;
    expect(outMesh.name).toBe('multi_mat_child');
    expect(outMesh.position.x).toBeCloseTo(expectedPos.x, 5);
    expect(outMesh.position.y).toBeCloseTo(expectedPos.y, 5);
    expect(outMesh.position.z).toBeCloseTo(expectedPos.z, 5);
    expect(Math.abs(outMesh.quaternion.dot(expectedQuat))).toBeCloseTo(1, 5);
    expect(outMesh.scale.x).toBeCloseTo(expectedScale.x, 5);
    expect(outMesh.scale.y).toBeCloseTo(expectedScale.y, 5);
    expect(outMesh.scale.z).toBeCloseTo(expectedScale.z, 5);

    geo.dispose();
    matA.dispose();
    matB.dispose();
  });
});
