import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import manifestJson from '../../assets.manifest.json';
import { MotorcycleMesh, createCNGMesh, createRickshawMesh, createBusMesh } from './vehicles';
import {
  createTeaStallMesh,
  createFuelCanopyMesh,
  createGarageShutterMesh,
  createFootbridgeMesh,
  createRooftopWaterTankMesh,
  createOverheadWiresMesh,
  createShopSignboardMesh,
} from './props';

export interface AssetCatalogEntry {
  id: string;
  url: string;
  pack: string;
  license: 'CC0-1.0';
  category: 'building' | 'vehicle' | 'prop' | 'audio';
  scale?: number;
}

export interface InstancedPrototype {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
}

interface RawManifestEntry {
  id: string;
  url: string;
  pack: string;
  license: string;
  category: string;
  scale?: number;
}

function toCatalogEntry(raw: RawManifestEntry): AssetCatalogEntry | null {
  if (raw.license !== 'CC0-1.0') return null;
  if (
    raw.category !== 'building' &&
    raw.category !== 'vehicle' &&
    raw.category !== 'prop' &&
    raw.category !== 'audio'
  ) {
    return null;
  }
  return {
    id: raw.id,
    url: raw.url,
    pack: raw.pack,
    license: 'CC0-1.0',
    category: raw.category,
    ...(typeof raw.scale === 'number' ? { scale: raw.scale } : {}),
  };
}

const rawModels = Array.isArray((manifestJson as { models?: unknown }).models)
  ? ((manifestJson as { models: RawManifestEntry[] }).models)
  : [];
const rawAudio = Array.isArray((manifestJson as { audio?: unknown }).audio)
  ? ((manifestJson as { audio: RawManifestEntry[] }).audio)
  : [];

export const ASSET_CATALOG: readonly AssetCatalogEntry[] = [...rawModels, ...rawAudio]
  .map(toCatalogEntry)
  .filter((e): e is AssetCatalogEntry => e !== null);

function disposeMaterial(
  mat: THREE.Material,
  disposedMats: Set<THREE.Material>,
  disposedTextures: Set<THREE.Texture>
): void {
  if (disposedMats.has(mat)) return;
  disposedMats.add(mat);
  for (const val of Object.values(mat) as unknown[]) {
    if (val instanceof THREE.Texture) {
      const tex = val as THREE.Texture;
      if (!disposedTextures.has(tex)) {
        disposedTextures.add(tex);
        tex.dispose();
      }
    }
  }
  mat.dispose();
}

function disposeObject3D(
  obj: THREE.Object3D,
  disposedGeos: Set<THREE.BufferGeometry>,
  disposedMats: Set<THREE.Material>,
  disposedTextures: Set<THREE.Texture>
): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      const geo = child.geometry as THREE.BufferGeometry | undefined;
      if (geo && !disposedGeos.has(geo)) {
        disposedGeos.add(geo);
        geo.dispose();
      }
      const matProp = child.material as THREE.Material | THREE.Material[] | undefined;
      if (matProp) {
        const mats = Array.isArray(matProp) ? matProp : [matProp];
        for (const mat of mats) {
          if (mat) {
            disposeMaterial(mat, disposedMats, disposedTextures);
          }
        }
      }
    }
  });
}

function deinterleaveToFloat32(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const out = new THREE.BufferGeometry();
  if (geo.index) {
    out.setIndex(geo.index.clone());
  }
  for (const name of Object.keys(geo.attributes)) {
    const attr = geo.getAttribute(name);
    if (!attr) continue;
    if (
      attr instanceof THREE.BufferAttribute &&
      attr.array instanceof Float32Array &&
      !attr.normalized
    ) {
      out.setAttribute(name, attr.clone());
      continue;
    }
    const itemSize = attr.itemSize;
    const count = attr.count;
    const arr = new Float32Array(count * itemSize);
    for (let i = 0; i < count; i++) {
      if (itemSize >= 1) arr[i * itemSize] = attr.getX(i);
      if (itemSize >= 2) arr[i * itemSize + 1] = attr.getY(i);
      if (itemSize >= 3) arr[i * itemSize + 2] = attr.getZ(i);
      if (itemSize >= 4) arr[i * itemSize + 3] = attr.getW(i);
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, itemSize, false));
  }
  for (const grp of geo.groups) {
    out.addGroup(grp.start, grp.count, grp.materialIndex);
  }
  return out;
}

function normalizeGeometriesForMerge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry[] {
  if (geos.length <= 1) return geos;

  const hasIndexed = geos.some((g) => g.index !== null);
  const allIndexed = geos.every((g) => g.index !== null);
  const prepared = hasIndexed && !allIndexed
    ? geos.map((g) => {
        if (!g.index) return g;
        const nonIdx = g.toNonIndexed();
        g.dispose();
        return nonIdx;
      })
    : geos;

  const allAttrs = new Map<string, number>();
  for (const geo of prepared) {
    for (const [name, attr] of Object.entries(geo.attributes)) {
      if (attr && !allAttrs.has(name)) {
        allAttrs.set(name, attr.itemSize);
      }
    }
  }

  for (const geo of prepared) {
    const vertexCount = geo.getAttribute('position')?.count ?? 0;
    for (const [name, itemSize] of allAttrs.entries()) {
      if (!geo.getAttribute(name)) {
        geo.setAttribute(
          name,
          new THREE.BufferAttribute(new Float32Array(vertexCount * itemSize), itemSize, false)
        );
      }
    }
  }

  return prepared;
}

function tagSharedPrototype(proto: InstancedPrototype): InstancedPrototype {
  proto.geometry.userData.shared = true;
  if (Array.isArray(proto.material)) {
    for (const m of proto.material) {
      if (m) m.userData.shared = true;
    }
  } else if (proto.material) {
    proto.material.userData.shared = true;
  }
  return proto;
}

export class AssetManager {
  private cache = new Map<string, THREE.Object3D>();
  private prototypes = new Map<string, InstancedPrototype>();
  private inflight = new Map<string, Promise<THREE.Object3D>>();
  private catalogMap = new Map<string, AssetCatalogEntry>();
  private loader: GLTFLoader | null = null;
  private initPromise: Promise<void> | null = null;
  private initialized = false;
  private generation = 0;
  private renderer?: THREE.WebGLRenderer;

  constructor(catalog: readonly AssetCatalogEntry[] = ASSET_CATALOG) {
    for (const entry of catalog) {
      this.catalogMap.set(entry.id, entry);
    }
  }

  /**
   * Initializes GLTFLoader and wires MeshoptDecoder WASM support.
   * Safe to call multiple times or in headless Node environments without WebGL.
   */
  async init(renderer?: THREE.WebGLRenderer): Promise<void> {
    if (renderer) {
      this.renderer = renderer;
    }
    if (this.initialized && this.loader) {
      return;
    }
    if (this.initPromise) {
      return this.initPromise;
    }

    const startGen = this.generation;
    this.initPromise = (async () => {
      const loader = new GLTFLoader();
      try {
        if (MeshoptDecoder.supported) {
          await MeshoptDecoder.ready;
          loader.setMeshoptDecoder(MeshoptDecoder);
        }
      } catch {
        // Ignore WASM decoder initialization failures in restricted environments.
      }
      if (this.generation !== startGen) {
        return;
      }
      this.loader = loader;
      this.initialized = true;
    })();

    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  hasMeshoptDecoder(): boolean {
    return Boolean(this.loader?.meshoptDecoder?.supported);
  }

  getLoader(): GLTFLoader | null {
    return this.loader;
  }

  getRenderer(): THREE.WebGLRenderer | undefined {
    return this.renderer;
  }

  getCatalog(): readonly AssetCatalogEntry[] {
    return Array.from(this.catalogMap.values());
  }

  getEntry(id: string): AssetCatalogEntry | undefined {
    return this.catalogMap.get(id);
  }

  /**
   * Preloads all 3D models in the catalog with bounded concurrency and progress callback (0..100).
   */
  async preloadCore(onProgress?: (pct: number) => void): Promise<void> {
    await this.init(this.renderer);
    const entries = Array.from(this.catalogMap.values()).filter((e) => e.category !== 'audio');
    if (entries.length === 0) {
      onProgress?.(100);
      return;
    }

    let completed = 0;
    const concurrency = 4;
    let cursor = 0;

    const worker = async () => {
      while (cursor < entries.length) {
        const index = cursor++;
        const entry = entries[index];
        if (!entry) continue;
        await this.loadModel(entry.id, 'high');
        completed++;
        onProgress?.(Math.round((completed / entries.length) * 100));
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, entries.length) }, () => worker());
    await Promise.all(workers);
  }

  /**
   * Loads a model by ID with in-memory caching, ground-pivot normalization (minY = 0),
   * and guaranteed procedural fallback if GLTF loading is unavailable or fails.
   */
  async loadModel(id: string, lod: 'high' | 'low' = 'high'): Promise<THREE.Object3D> {
    const key = lod === 'low' ? `${id}_low` : id;
    const cached = this.cache.get(key);
    if (cached) {
      return cached.clone();
    }

    const existing = this.inflight.get(key);
    if (existing) {
      const resolved = await existing;
      return resolved.clone();
    }

    const startGen = this.generation;
    const loadTask = (async (): Promise<THREE.Object3D> => {
      const entry = this.catalogMap.get(id);
      if (lod === 'high' && entry && entry.category !== 'audio') {
        if (!this.initialized || !this.loader) {
          await this.init(this.renderer);
        }
        if (this.generation !== startGen) {
          return this.createProceduralFallback(id, lod);
        }
        if (this.loader) {
          try {
            const gltf = await this.loader.loadAsync(entry.url);
            if (this.generation !== startGen) {
              disposeObject3D(
                gltf.scene,
                new Set<THREE.BufferGeometry>(),
                new Set<THREE.Material>(),
                new Set<THREE.Texture>()
              );
              return this.createProceduralFallback(id, lod);
            }
            const normalized = this.normalizeModel(gltf.scene, entry.scale ?? 1, entry.id);
            this.cache.set(key, normalized);
            const proto = this.extractInstancedPrototype(normalized);
            if (proto) {
              this.prototypes.set(id, proto);
            }
            return normalized;
          } catch {
            if (this.generation !== startGen) {
              return this.createProceduralFallback(id, lod);
            }
          }
        }
      }

      const rawFallback = this.createProceduralFallback(id, lod);
      const model = entry ? this.normalizeModel(rawFallback, 1, id) : rawFallback;
      if (this.generation !== startGen) {
        return model;
      }
      this.cache.set(key, model);
      if (lod === 'high' && entry) {
        const proto = this.extractInstancedPrototype(model);
        if (proto) {
          this.prototypes.set(id, proto);
        }
      }
      return model;
    })();

    this.inflight.set(key, loadTask);
    try {
      const result = await loadTask;
      return result.clone();
    } finally {
      if (this.inflight.get(key) === loadTask) {
        this.inflight.delete(key);
      }
    }
  }

  /**
   * Returns a normalized single-geometry prototype for InstancedMesh rendering, or null if not loaded/found.
   */
  getInstancedPrototype(id: string): InstancedPrototype | null {
    const existing = this.prototypes.get(id);
    if (existing) {
      return existing;
    }

    const cached = this.cache.get(id);
    if (cached) {
      const proto = this.extractInstancedPrototype(cached);
      if (proto) {
        this.prototypes.set(id, proto);
        return proto;
      }
    }

    return null;
  }

  private normalizeModel(source: THREE.Object3D, scale = 1, name?: string): THREE.Group {
    const wrapper = new THREE.Group();
    wrapper.name = name || source.name || 'asset_model';
    if (scale !== 1) {
      source.scale.multiplyScalar(scale);
    }
    wrapper.add(source);
    wrapper.updateMatrixWorld(true);

    const box = new THREE.Box3().setFromObject(wrapper);
    if (!box.isEmpty()) {
      source.position.y -= box.min.y;
    }

    wrapper.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    wrapper.updateMatrixWorld(true);
    return wrapper;
  }

  private extractInstancedPrototype(root: THREE.Object3D): InstancedPrototype | null {
    root.updateMatrixWorld(true);
    const rootInv = root.matrixWorld.clone().invert();
    const meshes: THREE.Mesh[] = [];
    root.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        meshes.push(child as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>);
      }
    });

    if (meshes.length === 0) {
      return null;
    }

    if (meshes.length === 1) {
      const mesh = meshes[0]!;
      const geo = deinterleaveToFloat32(mesh.geometry);
      const rel = new THREE.Matrix4().multiplyMatrices(rootInv, mesh.matrixWorld);
      geo.applyMatrix4(rel);
      geo.computeBoundingBox();
      return tagSharedPrototype({
        geometry: geo,
        material: mesh.material,
      });
    }

    const clonedGeos: THREE.BufferGeometry[] = [];
    const materials: THREE.Material[] = [];
    const rel = new THREE.Matrix4();

    for (const mesh of meshes) {
      const geo = deinterleaveToFloat32(mesh.geometry);
      rel.multiplyMatrices(rootInv, mesh.matrixWorld);
      geo.applyMatrix4(rel);
      clonedGeos.push(geo);

      if (Array.isArray(mesh.material)) {
        materials.push(mesh.material[0] ?? new THREE.MeshStandardMaterial({ color: 0x888888 }));
      } else if (mesh.material) {
        materials.push(mesh.material);
      } else {
        materials.push(new THREE.MeshStandardMaterial({ color: 0x888888 }));
      }
    }

    const prepared = normalizeGeometriesForMerge(clonedGeos);
    const uniqueMaterials = Array.from(new Set(materials));
    const singleMaterial = uniqueMaterials.length === 1;
    const merged = mergeGeometries(prepared, !singleMaterial);

    for (const g of prepared) {
      g.dispose();
    }

    if (!merged) {
      const fallbackMesh = meshes[0]!;
      const fallbackGeo = deinterleaveToFloat32(fallbackMesh.geometry);
      rel.multiplyMatrices(rootInv, fallbackMesh.matrixWorld);
      fallbackGeo.applyMatrix4(rel);
      fallbackGeo.computeBoundingBox();
      return tagSharedPrototype({
        geometry: fallbackGeo,
        material: fallbackMesh.material,
      });
    }

    merged.computeBoundingBox();
    return tagSharedPrototype({
      geometry: merged,
      material: singleMaterial ? uniqueMaterials[0]! : materials,
    });
  }

  createProceduralFallback(id: string, lod: 'high' | 'low' = 'high'): THREE.Object3D {
    if (lod === 'low') {
      const group = new THREE.Group();
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.translate(0, 0.5, 0);
      const mat = new THREE.MeshBasicMaterial({ color: 0x64748b });
      group.add(new THREE.Mesh(geo, mat));
      return group;
    }

    switch (id) {
      case 'motorcycle':
      case 'bike':
        return new MotorcycleMesh().root;
      case 'cng':
        return createCNGMesh();
      case 'rickshaw':
        return createRickshawMesh();
      case 'bus':
        return createBusMesh();
      case 'teaStall':
      case 'tong':
        return createTeaStallMesh();
      case 'fuelCanopy':
      case 'fuelStation':
        return createFuelCanopyMesh();
      case 'garage':
      case 'garageShutter':
        return createGarageShutterMesh();
      case 'footbridge':
        return createFootbridgeMesh();
      case 'rooftopWaterTank':
      case 'waterTank':
        return createRooftopWaterTankMesh();
      case 'overheadWires':
      case 'wires':
        return createOverheadWiresMesh();
      case 'shopSignboard':
      case 'signboard':
        return createShopSignboardMesh();
      default: {
        const entry = this.catalogMap.get(id);
        const group = new THREE.Group();
        group.name = `${id}_fallback`;
        if (entry?.category === 'building') {
          const isTall = id.includes('tower') || id.includes('highrise');
          const w = 8;
          const h = isTall ? 20 : 10;
          const d = 8;
          const geo = new THREE.BoxGeometry(w, h, d);
          geo.translate(0, h / 2, 0);
          const mat = new THREE.MeshStandardMaterial({ color: 0xb0a28f, roughness: 0.85 });
          group.add(new THREE.Mesh(geo, mat));
          return group;
        }
        if (entry?.category === 'vehicle') {
          const isHeavy = id.includes('truck') || id.includes('delivery') || id.includes('van');
          const w = isHeavy ? 2.1 : 1.8;
          const h = isHeavy ? 2.2 : 1.45;
          const d = isHeavy ? 4.6 : 3.9;
          const geo = new THREE.BoxGeometry(w, h, d);
          geo.translate(0, h / 2, 0);
          const mat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 });
          group.add(new THREE.Mesh(geo, mat));
          return group;
        }
        if (entry?.category === 'prop') {
          const isPole = id.includes('light') || id.includes('pole') || id.includes('tree');
          const geo = isPole
            ? new THREE.CylinderGeometry(0.2, 0.25, 5, 8)
            : new THREE.BoxGeometry(1.2, 1.0, 0.8);
          geo.translate(0, isPole ? 2.5 : 0.5, 0);
          const mat = new THREE.MeshStandardMaterial({
            color: id.includes('tree') ? 0x2f6f3e : 0x64748b,
            roughness: 0.8,
          });
          group.add(new THREE.Mesh(geo, mat));
          return group;
        }
        const geo = new THREE.BoxGeometry(1, 1, 1);
        geo.translate(0, 0.5, 0);
        const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
        group.add(new THREE.Mesh(geo, mat));
        return group;
      }
    }
  }

  hasCached(id: string): boolean {
    return this.cache.has(id);
  }

  private disposeCachedAssets(): void {
    this.generation++;
    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();
    const disposedTextures = new Set<THREE.Texture>();

    for (const proto of this.prototypes.values()) {
      if (!disposedGeos.has(proto.geometry)) {
        disposedGeos.add(proto.geometry);
        proto.geometry.dispose();
      }
      const mats = Array.isArray(proto.material) ? proto.material : [proto.material];
      for (const mat of mats) {
        if (mat) {
          disposeMaterial(mat, disposedMats, disposedTextures);
        }
      }
    }

    for (const obj of this.cache.values()) {
      disposeObject3D(obj, disposedGeos, disposedMats, disposedTextures);
    }

    this.prototypes.clear();
    this.cache.clear();
  }

  clearCache(): void {
    this.disposeCachedAssets();
    this.inflight.clear();
  }

  dispose(): void {
    this.disposeCachedAssets();
    this.inflight.clear();
    this.initialized = false;
    this.initPromise = null;
    this.loader = null;
    this.renderer = undefined;
  }
}

export const assetManager = new AssetManager();
export const loadModel = (id: string, lod: 'high' | 'low' = 'high'): Promise<THREE.Object3D> =>
  assetManager.loadModel(id, lod);
