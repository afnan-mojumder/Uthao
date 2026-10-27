import * as THREE from 'three';

export interface ChunkKey {
  cx: number;
  cz: number;
}

export class SpatialChunk {
  readonly cx: number;
  readonly cz: number;
  readonly center: THREE.Vector3;
  readonly root: THREE.Group;
  private radius: number;

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

  updateVisibility(cameraPos: { x: number; z: number }, maxDistance: number): void {
    const dist = Math.hypot(this.center.x - cameraPos.x, this.center.z - cameraPos.z);
    this.root.visible = dist <= maxDistance + this.radius;
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
