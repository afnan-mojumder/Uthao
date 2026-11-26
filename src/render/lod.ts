import * as THREE from 'three';
import type { DistrictId } from '../core/types';
import type { WorldData, DistrictData } from '../sim/schemas';

export interface ChunkKey {
  cx: number;
  cz: number;
}

export interface DistrictBounds {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

/**
 * Calculates the shortest 2D Euclidean distance from a position (x, z) to an axis-aligned bounding box.
 * Returns 0 if the point is inside the box.
 */
export function distanceToDistrictBounds(
  bounds: DistrictBounds,
  pos: { x: number; z: number }
): number {
  const dx = Math.max(0, bounds.minX - pos.x, pos.x - bounds.maxX);
  const dz = Math.max(0, bounds.minZ - pos.z, pos.z - bounds.maxZ);
  return Math.hypot(dx, dz);
}

/**
 * Determines which districts should be loaded at the current player/camera position.
 * The current district (distance === 0) plus neighbours within loadRadius (default 400 m) are included.
 */
export function districtsToLoad(
  pos: { x: number; z: number },
  world: WorldData,
  loadRadius = 400
): DistrictId[] {
  const toLoad: DistrictId[] = [];
  for (const d of world.districts) {
    const dist = distanceToDistrictBounds(d.bounds, pos);
    if (dist <= loadRadius) {
      toLoad.push(d.districtId);
    }
  }
  return toLoad;
}

/**
 * Determines which currently loaded districts should be unloaded/disposed.
 * Districts are unloaded when the player has drifted beyond unloadRadius (default 700 m).
 */
export function districtsToUnload(
  pos: { x: number; z: number },
  loadedDistricts: Iterable<DistrictId>,
  world: WorldData,
  unloadRadius = 700
): DistrictId[] {
  const toUnload: DistrictId[] = [];
  const districtMap = new Map(world.districts.map((d) => [d.districtId, d]));

  for (const id of loadedDistricts) {
    const d = districtMap.get(id);
    if (!d) continue;
    const dist = distanceToDistrictBounds(d.bounds, pos);
    if (dist > unloadRadius) {
      toUnload.push(id);
    }
  }
  return toUnload;
}

/**
 * Recursively disposes GPU resources (BatchedMesh textures, InstancedMesh buffers,
 * non-shared geometries, non-shared materials + textures, and LineSegments) attached to an Object3D hierarchy.
 * Resources tagged `userData.shared === true` are preserved.
 */
export function disposeHierarchy(obj: THREE.Object3D): void {
  const disposedGeos = new Set<THREE.BufferGeometry>();
  const disposedMats = new Set<THREE.Material>();
  const disposedTexs = new Set<THREE.Texture>();

  obj.traverse((child) => {
    if (child instanceof THREE.BatchedMesh) {
      child.dispose();
    } else if (child instanceof THREE.InstancedMesh) {
      child.dispose();
      const instGeo = child.geometry as THREE.BufferGeometry | undefined;
      if (instGeo && !instGeo.userData?.shared && !disposedGeos.has(instGeo)) {
        disposedGeos.add(instGeo);
        instGeo.dispose();
      }
    } else {
      const geo = (child as { geometry?: THREE.BufferGeometry }).geometry;
      if (geo && !geo.userData?.shared && !disposedGeos.has(geo)) {
        disposedGeos.add(geo);
        geo.dispose();
      }
    }

    const material = (child as { material?: THREE.Material | THREE.Material[] }).material;
    if (material) {
      const mats = Array.isArray(material) ? material : [material];
      for (const m of mats) {
        if (!m || m.userData?.shared || disposedMats.has(m)) continue;
        disposedMats.add(m);
        for (const val of Object.values(m) as unknown[]) {
          if (val instanceof THREE.Texture) {
            const tex = val as THREE.Texture;
            if (!tex.userData?.shared && !disposedTexs.has(tex)) {
              disposedTexs.add(tex);
              tex.dispose();
            }
          }
        }
        m.dispose();
      }
    }
  });
}

/**
 * Creates a lightweight low-poly silhouette for a distant district.
 * Uses a single InstancedMesh of merged building boxes (~1 draw call) with matte shading
 * to depict the distant Dhaka skyline with zero physics colliders or heavy textures.
 */
export function createDistrictSilhouette(district: DistrictData): THREE.Object3D {
  const lots = district.lots ?? [];
  const count = Math.max(lots.length, 1);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x4a5568,
  });

  const instancedMesh = new THREE.InstancedMesh(geo, mat, count);
  instancedMesh.name = `silhouette_${district.districtId}`;

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Euler();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();

  if (lots.length > 0) {
    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i]!;
      const storeys = 4 + (Math.abs(Math.floor(lot.x * 13 + lot.z * 7)) % 6);
      const height = storeys * 3.2;

      position.set(lot.x, height / 2, lot.z);
      rotation.set(0, lot.facingHeading, 0);
      quaternion.setFromEuler(rotation);
      scale.set(lot.width * 0.92, height, lot.depth * 0.92);

      matrix.compose(position, quaternion, scale);
      instancedMesh.setMatrixAt(i, matrix);
    }
  } else {
    // Fallback: 4 coarse block boxes across district
    position.set(0, 16, 0);
    scale.set(100, 32, 100);
    matrix.compose(position, quaternion, scale);
    instancedMesh.setMatrixAt(0, matrix);
  }

  instancedMesh.instanceMatrix.needsUpdate = true;
  return instancedMesh;
}

const HORIZON_PALETTE = [0x64748b, 0x78716c, 0x7c5e52, 0x5b6778, 0x857f74] as const;

/**
 * Generates a single-draw-call distant Dhaka horizon skyline ring outside all playable
 * district bounds so outer edges and open quadrants never drop into an empty void.
 */
export function createWorldHorizonSkyline(world: WorldData): THREE.Object3D {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const d of world.districts) {
    if (d.bounds.minX < minX) minX = d.bounds.minX;
    if (d.bounds.minZ < minZ) minZ = d.bounds.minZ;
    if (d.bounds.maxX > maxX) maxX = d.bounds.maxX;
    if (d.bounds.maxZ > maxZ) maxZ = d.bounds.maxZ;
  }
  if (!Number.isFinite(minX)) {
    minX = 0;
    minZ = 0;
    maxX = 1200;
    maxZ = 1200;
  }

  let seed = 918273;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0xffffffff;
  };

  const placements: Array<{ x: number; z: number; w: number; h: number; d: number; yaw: number; color: number }> = [];
  const pad = 225;
  const step = 68;
  for (let gx = minX - pad; gx <= maxX + pad && placements.length < 260; gx += step) {
    for (let gz = minZ - pad; gz <= maxZ + pad && placements.length < 260; gz += step) {
      const cx = gx + (rand() - 0.5) * 26;
      const cz = gz + (rand() - 0.5) * 26;
      let minDist = Infinity;
      for (const d of world.districts) {
        const dist = distanceToDistrictBounds(d.bounds, { x: cx, z: cz });
        if (dist < minDist) minDist = dist;
      }
      if (minDist < 58 || minDist > 225) continue;

      const w = 14 + rand() * 20;
      const d = 14 + rand() * 20;
      const h = 14 + rand() * 34;
      const yaw = (rand() - 0.5) * 0.4;
      const color = HORIZON_PALETTE[Math.floor(rand() * HORIZON_PALETTE.length)]!;
      placements.push({ x: cx, z: cz, w, h, d, yaw, color });
    }
  }

  const count = Math.max(1, placements.length);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.95,
    metalness: 0.05,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  mesh.name = 'world_horizon_skyline';
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.frustumCulled = false;

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scale = new THREE.Vector3();
  const col = new THREE.Color();

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]!;
    pos.set(p.x, p.h * 0.5, p.z);
    euler.set(0, p.yaw, 0);
    quat.setFromEuler(euler);
    scale.set(p.w, p.h, p.d);
    m.compose(pos, quat, scale);
    mesh.setMatrixAt(i, m);
    col.setHex(p.color);
    mesh.setColorAt(i, col);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  return mesh;
}

export class SpatialChunk {
  readonly cx: number;
  readonly cz: number;
  readonly chunkSize: number;
  readonly center: THREE.Vector3;
  readonly root: THREE.Group;
  readonly radius: number;

  constructor(cx: number, cz: number, chunkSize = 100) {
    this.cx = cx;
    this.cz = cz;
    this.chunkSize = chunkSize;
    this.center = new THREE.Vector3(
      cx * chunkSize + chunkSize / 2,
      0,
      cz * chunkSize + chunkSize / 2
    );
    this.radius = Math.hypot(chunkSize / 2, chunkSize / 2);
    this.root = new THREE.Group();
    this.root.name = `chunk_${cx}_${cz}`;
  }

  add(object: THREE.Object3D): void {
    object.traverse((child) => {
      if (child.userData.initialCastShadow === undefined) {
        child.userData.initialCastShadow = child.castShadow;
      }
    });
    this.root.add(object);
  }

  remove(object: THREE.Object3D): void {
    this.root.remove(object);
  }

  updateVisibility(cameraPos: { x: number; z: number }, maxDistance: number): void {
    const dist = Math.hypot(this.center.x - cameraPos.x, this.center.z - cameraPos.z);
    const visible = dist <= maxDistance + this.radius;
    this.root.visible = visible;
    if (!visible) return;

    // Only cast directional shadows for chunks whose AABB can intersect the ±55m shadow frustum
    const minX = this.cx * this.chunkSize;
    const maxX = minX + this.chunkSize;
    const minZ = this.cz * this.chunkSize;
    const maxZ = minZ + this.chunkSize;
    const nearX = Math.max(minX, Math.min(cameraPos.x, maxX));
    const nearZ = Math.max(minZ, Math.min(cameraPos.z, maxZ));
    const nearShadow = Math.hypot(cameraPos.x - nearX, cameraPos.z - nearZ) <= 34;
    for (let i = 0; i < this.root.children.length; i++) {
      const child = this.root.children[i]!;
      child.traverse((node) => {
        if (node.userData.initialCastShadow) {
          node.castShadow = nearShadow;
        }
      });
    }
  }
}

export class LodManager {
  readonly chunkSize: number;
  readonly chunks: Map<string, SpatialChunk> = new Map();
  readonly root: THREE.Group;

  constructor(chunkSize = 100) {
    this.chunkSize = chunkSize;
    this.root = new THREE.Group();
    this.root.name = 'city_lod_root';
  }

  getChunk(x: number, z: number): SpatialChunk {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    const key = `${cx},${cz}`;

    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = new SpatialChunk(cx, cz, this.chunkSize);
      this.chunks.set(key, chunk);
      this.root.add(chunk.root);
    }
    return chunk;
  }

  addObject(object: THREE.Object3D, x: number, z: number): void {
    const chunk = this.getChunk(x, z);
    chunk.add(object);
  }

  removeObject(object: THREE.Object3D, x: number, z: number): void {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    const key = `${cx},${cz}`;
    const chunk = this.chunks.get(key);
    if (chunk) {
      chunk.remove(object);
    }
  }

  update(cameraPos: { x: number; z: number }, maxDistance = 250): void {
    for (const chunk of this.chunks.values()) {
      chunk.updateVisibility(cameraPos, maxDistance);
    }
  }

  getChunkCount(): number {
    return this.chunks.size;
  }

  getVisibleChunkCount(): number {
    let count = 0;
    for (const chunk of this.chunks.values()) {
      if (chunk.root.visible) count++;
    }
    return count;
  }
}
