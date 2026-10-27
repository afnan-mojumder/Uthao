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
      toLoad.push(d.districtId as DistrictId);
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
  const districtMap = new Map(world.districts.map((d) => [d.districtId as DistrictId, d]));

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
 * Recursively disposes all geometries and materials attached to an Object3D hierarchy.
 */
export function disposeHierarchy(obj: THREE.Object3D): void {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material.dispose();
        }
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

export class SpatialChunk {
  readonly cx: number;
  readonly cz: number;
  readonly center: THREE.Vector3;
  readonly root: THREE.Group;
  readonly radius: number;

  constructor(cx: number, cz: number, chunkSize = 100) {
    this.cx = cx;
    this.cz = cz;
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
    this.root.add(object);
  }

  remove(object: THREE.Object3D): void {
    this.root.remove(object);
  }

  updateVisibility(cameraPos: { x: number; z: number }, maxDistance: number): void {
    const dist = Math.hypot(this.center.x - cameraPos.x, this.center.z - cameraPos.z);
    this.root.visible = dist <= maxDistance;
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
