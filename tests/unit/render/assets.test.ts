import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';
import * as THREE from 'three';
import {
  AssetManager,
  type AssetCatalogEntry,
  loadModel,
  assetManager,
} from '../../../src/render/assets';
import { createCNGMesh, createRickshawMesh, createBusMesh } from '../../../src/render/vehicles';
import {
  createTeaStallMesh,
  createFuelCanopyMesh,
  createGarageShutterMesh,
  createFootbridgeMesh,
  createRooftopWaterTankMesh,
  createOverheadWiresMesh,
  createShopSignboardMesh,
} from '../../../src/render/props';

describe('T3.1 Asset Pipeline & Procedural Fallbacks', () => {
  it('assets.manifest.json exists and strictly enforces CC0 licensing', () => {
    const manifestPath = path.resolve('assets.manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.licensePolicy).toBe('CC0-1.0');
    expect(Array.isArray(manifest.packs)).toBe(true);
    for (const pack of manifest.packs) {
      expect(pack.license).toBe('CC0-1.0');
    }
  });

  it('guarantees procedural fallback for all Bangladesh-specific model IDs without crashing', async () => {
    const modelIds = [
      'motorcycle',
      'cng',
      'rickshaw',
      'bus',
      'teaStall',
      'fuelCanopy',
      'garage',
      'footbridge',
      'rooftopWaterTank',
      'overheadWires',
      'shopSignboard',
      'unknown_nonexistent_model_id',
    ];

    for (const id of modelIds) {
      const mesh = await loadModel(id);
      expect(mesh).toBeDefined();
      expect(mesh.isObject3D).toBe(true);
    }
  });

  it('procedural vehicle mesh generators produce populated Object3D hierarchies', () => {
    const cng = createCNGMesh();
    expect(cng.children.length).toBeGreaterThan(0);

    const rickshaw = createRickshawMesh();
    expect(rickshaw.children.length).toBeGreaterThan(0);

    const bus = createBusMesh();
    expect(bus.children.length).toBeGreaterThan(0);
  });

  it('procedural prop generators produce populated Object3D hierarchies', () => {
    expect(createTeaStallMesh().children.length).toBeGreaterThan(0);
    expect(createFuelCanopyMesh().children.length).toBeGreaterThan(0);
    expect(createGarageShutterMesh().children.length).toBeGreaterThan(0);
    expect(createFootbridgeMesh().children.length).toBeGreaterThan(0);
    expect(createRooftopWaterTankMesh().children.length).toBeGreaterThan(0);
    expect(createOverheadWiresMesh().children.length).toBeGreaterThan(0);
    expect(createShopSignboardMesh().children.length).toBeGreaterThan(0);
  });

  it('caches models in AssetManager', async () => {
    assetManager.clearCache();
    expect(assetManager.hasCached('cng')).toBe(false);

    await assetManager.loadModel('cng');
    expect(assetManager.hasCached('cng')).toBe(true);

    const clone = await assetManager.loadModel('cng');
    expect(clone).toBeDefined();
  });
});

describe('P2.2 External CC0 GLTF + Meshopt Asset Pipeline', () => {
  it('manifest references existing optimized GLBs in public/assets/models under 2MB total', () => {
    const manifestPath = path.resolve('assets.manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      licensePolicy: string;
      packs: Array<{ name: string; license: string; url: string; sha256?: string }>;
      models?: AssetCatalogEntry[];
    };

    expect(manifest.licensePolicy).toBe('CC0-1.0');
    for (const pack of manifest.packs) {
      expect(pack.license).toBe('CC0-1.0');
      expect(typeof pack.sha256).toBe('string');
      expect(pack.sha256).toMatch(/^[0-9a-f]{64}$/);
    }

    expect(Array.isArray(manifest.models)).toBe(true);
    const models = manifest.models ?? [];
    expect(models.length).toBeGreaterThanOrEqual(8);

    let totalRawBytes = 0;
    let totalGzBytes = 0;
    const seenIds = new Set<string>();

    for (const entry of models) {
      expect(entry.license).toBe('CC0-1.0');
      expect(['building', 'vehicle', 'prop', 'audio']).toContain(entry.category);
      expect(entry.url.startsWith('/assets/models/')).toBe(true);
      expect(entry.url.endsWith('.glb')).toBe(true);
      expect(seenIds.has(entry.id)).toBe(false);
      seenIds.add(entry.id);

      const diskPath = path.resolve('public', entry.url.replace(/^\//, ''));
      expect(fs.existsSync(diskPath), `Missing optimized GLB on disk: ${diskPath}`).toBe(true);

      const buf = fs.readFileSync(diskPath);
      expect(buf.byteLength).toBeGreaterThan(128);
      // glTF 2.0 binary magic: "glTF" (0x46546C67)
      expect(buf.subarray(0, 4).toString('ascii')).toBe('glTF');

      totalRawBytes += buf.byteLength;
      totalGzBytes += zlib.gzipSync(buf).byteLength;
    }

    expect(totalRawBytes).toBeLessThan(2 * 1024 * 1024);
    expect(totalGzBytes).toBeLessThan(1200 * 1024);
  });

  it('AssetManager wires GLTFLoader + MeshoptDecoder and falls back cleanly in headless Node', async () => {
    const manager = new AssetManager();
    await manager.init();

    expect(manager.isInitialized()).toBe(true);
    expect(manager.hasMeshoptDecoder()).toBe(true);

    const progressUpdates: number[] = [];
    await manager.preloadCore((pct) => {
      progressUpdates.push(pct);
    });
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    for (let i = 1; i < progressUpdates.length; i++) {
      expect(progressUpdates[i]!).toBeGreaterThanOrEqual(progressUpdates[i - 1]!);
    }

    // In headless Node (no HTTP server / DOM ImageBitmap), loading a catalog model
    // must gracefully fall back to a valid Object3D without throwing.
    const manifest = JSON.parse(fs.readFileSync(path.resolve('assets.manifest.json'), 'utf8')) as {
      models: AssetCatalogEntry[];
    };
    const firstModel = manifest.models[0]!;
    const loaded = await manager.loadModel(firstModel.id, 'high');
    expect(loaded).toBeInstanceOf(THREE.Object3D);

    const box = new THREE.Box3().setFromObject(loaded);
    expect(box.isEmpty()).toBe(false);
    expect(box.min.y).toBeGreaterThanOrEqual(-1e-3);

    expect(manager.getInstancedPrototype('nonexistent_asset_id')).toBeNull();

    manager.dispose();
    expect(manager.hasCached(firstModel.id)).toBe(false);
  });

  it('AssetManager normalizes ground pivot and extracts InstancedMesh prototype from GLTF scene', async () => {
    const manager = new AssetManager();
    await manager.init();

    // Build a synthetic GLTF-like scene whose mesh sits below y=0 (-1..+1)
    const mockScene = new THREE.Group();
    const boxGeo = new THREE.BoxGeometry(2, 2, 2);
    const mat = new THREE.MeshStandardMaterial({ color: 0x336699 });
    const mesh = new THREE.Mesh(boxGeo, mat);
    mockScene.add(mesh);

    const loader = manager.getLoader();
    expect(loader).toBeDefined();
    const loadAsyncSpy = vi.spyOn(loader!, 'loadAsync').mockResolvedValue({
      scene: mockScene,
      scenes: [mockScene],
      animations: [],
      cameras: [],
      asset: { version: '2.0' },
      parser: {} as never,
      userData: {},
    });

    const manifest = JSON.parse(fs.readFileSync(path.resolve('assets.manifest.json'), 'utf8')) as {
      models: AssetCatalogEntry[];
    };
    const targetEntry = manifest.models[0]!;

    const obj = await manager.loadModel(targetEntry.id, 'high');
    expect(loadAsyncSpy).toHaveBeenCalledOnce();

    const bounds = new THREE.Box3().setFromObject(obj);
    expect(bounds.min.y).toBeCloseTo(0, 3);

    const proto = manager.getInstancedPrototype(targetEntry.id);
    expect(proto).not.toBeNull();
    expect(proto?.geometry).toBeInstanceOf(THREE.BufferGeometry);
    expect(proto?.material).toBeDefined();

    // Prototype geometry itself should also have minY normalized to 0
    proto!.geometry.computeBoundingBox();
    expect(proto!.geometry.boundingBox!.min.y).toBeCloseTo(0, 3);

    loadAsyncSpy.mockRestore();
    manager.dispose();
  });

  it('extracts multi-mesh Float32 InstancedMesh prototype from quantized Int16 InterleavedBufferAttribute meshes', async () => {
    const manager = new AssetManager();
    await manager.init();

    // Simulate a quantized Meshopt GLTF scene with Int16 normalized InterleavedBufferAttribute
    const interleaved = new THREE.InterleavedBuffer(
      new Int16Array([
        0, 0, 0,
        32767, 0, 0,
        0, 32767, 0,
      ]),
      3
    );
    const posAttr = new THREE.InterleavedBufferAttribute(interleaved, 3, 0, true);
    const partGeo1 = new THREE.BufferGeometry();
    partGeo1.setAttribute('position', posAttr);
    const partGeo2 = new THREE.BufferGeometry();
    partGeo2.setAttribute('position', posAttr);

    const sharedMat = new THREE.MeshStandardMaterial({ color: 0x999999 });
    const mesh1 = new THREE.Mesh(partGeo1, sharedMat);
    const mesh2 = new THREE.Mesh(partGeo2, sharedMat);
    mesh2.position.set(0, -0.5, 0);

    const mockScene = new THREE.Group();
    mockScene.add(mesh1, mesh2);

    const loader = manager.getLoader()!;
    const loadAsyncSpy = vi.spyOn(loader, 'loadAsync').mockResolvedValue({
      scene: mockScene,
      scenes: [mockScene],
      animations: [],
      cameras: [],
      asset: { version: '2.0' },
      parser: {} as never,
      userData: {},
    });

    // building_commercial_a has scale: 10.0 in assets.manifest.json
    await manager.loadModel('building_commercial_a', 'high');
    const proto = manager.getInstancedPrototype('building_commercial_a');
    expect(proto).not.toBeNull();
    expect(proto!.geometry.getAttribute('position')).toBeInstanceOf(THREE.BufferAttribute);
    expect(proto!.geometry.getAttribute('position').array).toBeInstanceOf(Float32Array);

    proto!.geometry.computeBoundingBox();
    const bb = proto!.geometry.boundingBox!;
    expect(bb.min.y).toBeCloseTo(0, 3);
    // Mesh1 spans y=[0..10], mesh2 spans y=[-5..+5] -> shifted so minY=0, maxY=15!
    expect(bb.max.y).toBeCloseTo(15, 2);

    loadAsyncSpy.mockRestore();
    manager.dispose();
  });
});
