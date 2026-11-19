export type StaticColliderKind = 'building' | 'kerb' | 'median' | 'prop';

export interface StaticBoxHandle {
  readonly id: number;
  readonly kind: StaticColliderKind;
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly minY: number;
  readonly maxY: number;
  readonly yaw: number;
  readonly cos: number;
  readonly sin: number;
}

export interface DynamicObb {
  id: string;
  kind: string;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  minY: number;
  maxY: number;
  yaw: number;
  vx: number;
  vz: number;
}

export interface SweepHit {
  hit: boolean;
  toi: number;
  normalX: number;
  normalZ: number;
  otherKind: StaticColliderKind | 'traffic';
  otherId?: string;
  otherVx: number;
  otherVz: number;
}

interface InternalStaticBox {
  readonly handle: StaticBoxHandle;
  readonly id: number;
  readonly kind: StaticColliderKind;
  readonly x: number;
  readonly z: number;
  readonly halfX: number;
  readonly halfZ: number;
  readonly minY: number;
  readonly maxY: number;
  readonly cos: number;
  readonly sin: number;
  readonly aabbMinX: number;
  readonly aabbMaxX: number;
  readonly aabbMinZ: number;
  readonly aabbMaxZ: number;
  readonly minCellX: number;
  readonly maxCellX: number;
  readonly minCellZ: number;
  readonly maxCellZ: number;
  stamp: number;
  removed: boolean;
}

interface InternalDynamicObb {
  id: string;
  kind: string;
  x: number;
  z: number;
  halfX: number;
  halfZ: number;
  minY: number;
  maxY: number;
  yaw: number;
  cos: number;
  sin: number;
  vx: number;
  vz: number;
  aabbMinX: number;
  aabbMaxX: number;
  aabbMinZ: number;
  aabbMaxZ: number;
}

const CELL_SIZE = 20;
const CAPSULE_HEIGHT_M = 1.5;
const SKIN_BACKOFF_M = 1e-4;
const OVERLAP_DIR_EPS = 1e-5;

function cellKey(cx: number, cz: number): number {
  return (cx << 16) ^ (cz & 0xffff);
}

export class PhysicsWorld {
  private readonly grid = new Map<number, InternalStaticBox[]>();
  private readonly boxesById = new Map<number, InternalStaticBox>();
  private readonly dynamicVehicles: InternalDynamicObb[] = [];
  private readonly dynamicIndexById = new Map<string, number>();

  private nextId = 1;
  private queryStamp = 0;
  private dynamicCount = 0;
  private dynamicGen = 1;

  private minGridCx = 0;
  private maxGridCx = -1;
  private minGridCz = 0;
  private maxGridCz = -1;

  // Scratch fields for zero-allocation sweep queries
  private _tmpToi = 1;
  private _tmpNx = 0;
  private _tmpNz = 0;

  private _passToi = 1;
  private _passNx = 0;
  private _passNz = 0;
  private _passKind: StaticColliderKind | 'traffic' = 'building';
  private _passId: string | undefined = undefined;
  private _passVx = 0;
  private _passVz = 0;
  private _passStatic: InternalStaticBox | null = null;
  private _passDynamicIdx = -1;

  private constructor() {}

  static async create(): Promise<PhysicsWorld> {
    return new PhysicsWorld();
  }

  addStaticBox(
    x: number,
    y: number,
    z: number,
    halfX: number,
    halfY: number,
    halfZ: number,
    yaw: number = 0,
    kind: StaticColliderKind = 'building'
  ): StaticBoxHandle {
    const id = this.nextId++;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const minY = y - halfY;
    const maxY = y + halfY;

    const handle: StaticBoxHandle = {
      id,
      kind,
      x,
      z,
      halfX,
      halfZ,
      minY,
      maxY,
      yaw,
      cos,
      sin,
    };

    const absCos = Math.abs(cos);
    const absSin = Math.abs(sin);
    const extentX = absCos * halfX + absSin * halfZ;
    const extentZ = absSin * halfX + absCos * halfZ;
    const aabbMinX = x - extentX;
    const aabbMaxX = x + extentX;
    const aabbMinZ = z - extentZ;
    const aabbMaxZ = z + extentZ;

    const minCellX = Math.floor(aabbMinX / CELL_SIZE);
    const maxCellX = Math.floor(aabbMaxX / CELL_SIZE);
    const minCellZ = Math.floor(aabbMinZ / CELL_SIZE);
    const maxCellZ = Math.floor(aabbMaxZ / CELL_SIZE);

    if (this.boxesById.size === 0) {
      this.minGridCx = minCellX;
      this.maxGridCx = maxCellX;
      this.minGridCz = minCellZ;
      this.maxGridCz = maxCellZ;
    } else {
      if (minCellX < this.minGridCx) this.minGridCx = minCellX;
      if (maxCellX > this.maxGridCx) this.maxGridCx = maxCellX;
      if (minCellZ < this.minGridCz) this.minGridCz = minCellZ;
      if (maxCellZ > this.maxGridCz) this.maxGridCz = maxCellZ;
    }

    const entry: InternalStaticBox = {
      handle,
      id,
      kind,
      x,
      z,
      halfX,
      halfZ,
      minY,
      maxY,
      cos,
      sin,
      aabbMinX,
      aabbMaxX,
      aabbMinZ,
      aabbMaxZ,
      minCellX,
      maxCellX,
      minCellZ,
      maxCellZ,
      stamp: 0,
      removed: false,
    };

    this.boxesById.set(id, entry);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const key = cellKey(cx, cz);
        let cell = this.grid.get(key);
        if (!cell) {
          cell = [];
          this.grid.set(key, cell);
        }
        cell.push(entry);
      }
    }

    return handle;
  }

  addStaticPolyline(
    points: { x: number; z: number }[],
    height: number = 0.5,
    kind: StaticColliderKind = 'kerb'
  ): StaticBoxHandle[] {
    const colliders: StaticBoxHandle[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      const midX = (p1.x + p2.x) / 2;
      const midZ = (p1.z + p2.z) / 2;
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const len = Math.hypot(dx, dz);
      if (len < 1e-6) continue;
      const angle = Math.atan2(dx, dz);
      const col = this.addStaticBox(
        midX,
        height / 2,
        midZ,
        0.15,
        height / 2,
        len / 2,
        angle,
        kind
      );
      colliders.push(col);
    }
    return colliders;
  }

  removeCollider(handle: StaticBoxHandle): void {
    const entry = this.boxesById.get(handle.id);
    if (!entry || entry.removed) return;
    entry.removed = true;
    this.boxesById.delete(handle.id);

    for (let cx = entry.minCellX; cx <= entry.maxCellX; cx++) {
      for (let cz = entry.minCellZ; cz <= entry.maxCellZ; cz++) {
        const key = cellKey(cx, cz);
        const cell = this.grid.get(key);
        if (!cell) continue;
        const idx = cell.indexOf(entry);
        if (idx !== -1) {
          const last = cell.length - 1;
          if (idx !== last) {
            cell[idx] = cell[last]!;
          }
          cell.pop();
          if (cell.length === 0) {
            this.grid.delete(key);
          }
        }
      }
    }
  }

  clearAllColliders(): void {
    this.grid.clear();
    this.boxesById.clear();
    this.minGridCx = 0;
    this.maxGridCx = -1;
    this.minGridCz = 0;
    this.maxGridCz = -1;
    this.dynamicCount = 0;
    this.dynamicGen = 1;
    this.dynamicIndexById.clear();
  }

  clearDynamicVehicles(): void {
    this.dynamicCount = 0;
    this.dynamicGen++;
    if (this.dynamicIndexById.size > 4096) {
      this.dynamicIndexById.clear();
      this.dynamicGen = 1;
    }
  }

  upsertDynamicVehicle(obb: DynamicObb): void {
    const cos = Math.cos(obb.yaw);
    const sin = Math.sin(obb.yaw);
    const absCos = Math.abs(cos);
    const absSin = Math.abs(sin);
    const extentX = absCos * obb.halfX + absSin * obb.halfZ;
    const extentZ = absSin * obb.halfX + absCos * obb.halfZ;

    const genBase = this.dynamicGen * 1048576;
    const packed = this.dynamicIndexById.get(obb.id);
    let slot: InternalDynamicObb;
    if (packed !== undefined && packed >= genBase && packed < genBase + 1048576) {
      slot = this.dynamicVehicles[packed - genBase]!;
    } else if (this.dynamicCount < this.dynamicVehicles.length) {
      const idx = this.dynamicCount++;
      slot = this.dynamicVehicles[idx]!;
      this.dynamicIndexById.set(obb.id, genBase + idx);
    } else {
      const idx = this.dynamicCount++;
      slot = {
        id: obb.id,
        kind: obb.kind,
        x: 0,
        z: 0,
        halfX: 0,
        halfZ: 0,
        minY: 0,
        maxY: 0,
        yaw: 0,
        cos: 1,
        sin: 0,
        vx: 0,
        vz: 0,
        aabbMinX: 0,
        aabbMaxX: 0,
        aabbMinZ: 0,
        aabbMaxZ: 0,
      };
      this.dynamicVehicles.push(slot);
      this.dynamicIndexById.set(obb.id, genBase + idx);
    }

    slot.id = obb.id;
    slot.kind = obb.kind;
    slot.x = obb.x;
    slot.z = obb.z;
    slot.halfX = obb.halfX;
    slot.halfZ = obb.halfZ;
    slot.minY = obb.minY;
    slot.maxY = obb.maxY;
    slot.yaw = obb.yaw;
    slot.cos = cos;
    slot.sin = sin;
    slot.vx = obb.vx;
    slot.vz = obb.vz;
    slot.aabbMinX = obb.x - extentX;
    slot.aabbMaxX = obb.x + extentX;
    slot.aabbMinZ = obb.z - extentZ;
    slot.aabbMaxZ = obb.z + extentZ;
  }

  sweepCapsule(
    x: number,
    z: number,
    y: number,
    radius: number,
    dx: number,
    dz: number,
    out: SweepHit,
    slideOut: { x: number; z: number }
  ): void {
    out.hit = false;
    out.toi = 1;
    out.normalX = 0;
    out.normalZ = 0;
    out.otherKind = 'building';
    out.otherId = undefined;
    out.otherVx = 0;
    out.otherVz = 0;

    const moveLenSq = dx * dx + dz * dz;
    if (moveLenSq < 1e-16) {
      slideOut.x = 0;
      slideOut.z = 0;
      return;
    }

    // Pass 1: initial sweep
    const hit1 = this.sweepOnce(x, z, y, radius, dx, dz, null, -1);
    if (!hit1) {
      slideOut.x = dx;
      slideOut.z = dz;
      return;
    }

    const toi1 = this._passToi;
    const nx1 = this._passNx;
    const nz1 = this._passNz;

    out.hit = true;
    out.toi = toi1;
    out.normalX = nx1;
    out.normalZ = nz1;
    out.otherKind = this._passKind;
    out.otherId = this._passId;
    out.otherVx = this._passVx;
    out.otherVz = this._passVz;

    const skipStatic = this._passStatic;
    const skipDynamic = this._passDynamicIdx;

    const moveLen = Math.sqrt(moveLenSq);
    const backoff1 = moveLen > 1e-6 ? Math.min(toi1, SKIN_BACKOFF_M / moveLen) : 0;
    const t1 = toi1 - backoff1;
    const p1x = x + dx * t1;
    const p1z = z + dz * t1;

    // Project remaining displacement onto the contact tangent
    let remX = dx * (1 - toi1);
    let remZ = dz * (1 - toi1);
    const dot1 = remX * nx1 + remZ * nz1;
    if (dot1 < 0) {
      remX -= dot1 * nx1;
      remZ -= dot1 * nz1;
    }

    const remLenSq = remX * remX + remZ * remZ;
    if (remLenSq < 1e-14) {
      slideOut.x = p1x - x;
      slideOut.z = p1z - z;
      return;
    }

    // Pass 2: wall slide along remaining tangent displacement
    const hit2 = this.sweepOnce(p1x, p1z, y, radius, remX, remZ, skipStatic, skipDynamic);
    if (!hit2) {
      slideOut.x = (p1x - x) + remX;
      slideOut.z = (p1z - z) + remZ;
      return;
    }

    const toi2 = this._passToi;
    const remLen = Math.sqrt(remLenSq);
    const backoff2 = remLen > 1e-6 ? Math.min(toi2, SKIN_BACKOFF_M / remLen) : 0;
    const t2 = toi2 - backoff2;
    slideOut.x = (p1x - x) + remX * t2;
    slideOut.z = (p1z - z) + remZ * t2;
  }

  resolveDynamicOverlap(
    x: number,
    z: number,
    y: number,
    radius: number,
    out: SweepHit,
    pushOut: { x: number; z: number }
  ): boolean {
    out.hit = false;
    out.toi = 1;
    out.normalX = 0;
    out.normalZ = 0;
    out.otherKind = 'building';
    out.otherId = undefined;
    out.otherVx = 0;
    out.otherVz = 0;

    let curX = x;
    let curZ = z;
    let any = false;
    const rSq = radius * radius;

    for (let i = 0; i < this.dynamicCount; i++) {
      const dyn = this.dynamicVehicles[i]!;
      if (y + CAPSULE_HEIGHT_M < dyn.minY || y > dyn.maxY) continue;
      if (
        curX + radius < dyn.aabbMinX ||
        curX - radius > dyn.aabbMaxX ||
        curZ + radius < dyn.aabbMinZ ||
        curZ - radius > dyn.aabbMaxZ
      ) {
        continue;
      }

      const rx = curX - dyn.x;
      const rz = curZ - dyn.z;
      const sx = rx * dyn.cos - rz * dyn.sin;
      const sz = rx * dyn.sin + rz * dyn.cos;

      const cx = sx < -dyn.halfX ? -dyn.halfX : sx > dyn.halfX ? dyn.halfX : sx;
      const cz = sz < -dyn.halfZ ? -dyn.halfZ : sz > dyn.halfZ ? dyn.halfZ : sz;
      const vx = sx - cx;
      const vz = sz - cz;
      const distSq = vx * vx + vz * vz;

      if (distSq >= rSq) continue;

      let nlx: number;
      let nlz: number;
      let pen: number;
      if (distSq > 1e-12) {
        const d = Math.sqrt(distSq);
        nlx = vx / d;
        nlz = vz / d;
        pen = radius - d + SKIN_BACKOFF_M;
      } else {
        const penX = dyn.halfX - Math.abs(sx);
        const penZ = dyn.halfZ - Math.abs(sz);
        if (penX < penZ) {
          nlx = sx >= 0 ? 1 : -1;
          nlz = 0;
          pen = penX + radius + SKIN_BACKOFF_M;
        } else {
          nlx = 0;
          nlz = sz >= 0 ? 1 : -1;
          pen = penZ + radius + SKIN_BACKOFF_M;
        }
      }

      const nx = nlx * dyn.cos + nlz * dyn.sin;
      const nz = -nlx * dyn.sin + nlz * dyn.cos;
      curX += nx * pen;
      curZ += nz * pen;

      if (!any) {
        out.hit = true;
        out.toi = 0;
        out.normalX = nx;
        out.normalZ = nz;
        out.otherKind = 'traffic';
        out.otherId = dyn.id;
        out.otherVx = dyn.vx;
        out.otherVz = dyn.vz;
        any = true;
      }
    }

    pushOut.x = curX - x;
    pushOut.z = curZ - z;
    return any;
  }

  castRay2D(
    ox: number,
    oz: number,
    y: number,
    dirX: number,
    dirZ: number,
    maxDist: number,
    filterKinds?: readonly StaticColliderKind[]
  ): number | null {
    const includeDynamic = filterKinds === undefined;
    if (
      maxDist <= 0 ||
      (this.boxesById.size === 0 && (!includeDynamic || this.dynamicCount === 0))
    ) {
      return null;
    }

    const dirLen = Math.sqrt(dirX * dirX + dirZ * dirZ);
    if (dirLen < 1e-9) return null;
    const ndx = dirX / dirLen;
    const ndz = dirZ / dirLen;

    const endX = ox + ndx * maxDist;
    const endZ = oz + ndz * maxDist;
    const minX = ox < endX ? ox : endX;
    const maxX = ox > endX ? ox : endX;
    const minZ = oz < endZ ? oz : endZ;
    const maxZ = oz > endZ ? oz : endZ;

    let bestDist = maxDist;
    let hitAny = false;

    if (this.boxesById.size > 0) {
      let cMinX = Math.floor(minX / CELL_SIZE);
      let cMaxX = Math.floor(maxX / CELL_SIZE);
      let cMinZ = Math.floor(minZ / CELL_SIZE);
      let cMaxZ = Math.floor(maxZ / CELL_SIZE);

      if (cMinX < this.minGridCx) cMinX = this.minGridCx;
      if (cMaxX > this.maxGridCx) cMaxX = this.maxGridCx;
      if (cMinZ < this.minGridCz) cMinZ = this.minGridCz;
      if (cMaxZ > this.maxGridCz) cMaxZ = this.maxGridCz;

      if (cMinX <= cMaxX && cMinZ <= cMaxZ) {
        const stamp = ++this.queryStamp;

        for (let cx = cMinX; cx <= cMaxX; cx++) {
          for (let cz = cMinZ; cz <= cMaxZ; cz++) {
            const cell = this.grid.get(cellKey(cx, cz));
            if (!cell) continue;
            for (let i = 0; i < cell.length; i++) {
              const box = cell[i]!;
              if (box.stamp === stamp) continue;
              box.stamp = stamp;

              if (y + CAPSULE_HEIGHT_M < box.minY || y > box.maxY) continue;
              if (filterKinds !== undefined && !matchesKind(box.kind, filterKinds)) continue;
              if (
                box.aabbMaxX < minX ||
                box.aabbMinX > maxX ||
                box.aabbMaxZ < minZ ||
                box.aabbMinZ > maxZ
              ) {
                continue;
              }

              const hitT = intersectRayObb(
                ox,
                oz,
                ndx,
                ndz,
                box.x,
                box.z,
                box.halfX,
                box.halfZ,
                box.cos,
                box.sin,
                bestDist
              );
              if (hitT >= 0 && (!hitAny || hitT < bestDist)) {
                bestDist = hitT;
                hitAny = true;
              }
            }
          }
        }
      }
    }

    if (includeDynamic && this.dynamicCount > 0) {
      for (let i = 0; i < this.dynamicCount; i++) {
        const dyn = this.dynamicVehicles[i]!;
        if (y + CAPSULE_HEIGHT_M < dyn.minY || y > dyn.maxY) continue;
        if (
          dyn.aabbMaxX < minX ||
          dyn.aabbMinX > maxX ||
          dyn.aabbMaxZ < minZ ||
          dyn.aabbMinZ > maxZ
        ) {
          continue;
        }

        const hitT = intersectRayObb(
          ox,
          oz,
          ndx,
          ndz,
          dyn.x,
          dyn.z,
          dyn.halfX,
          dyn.halfZ,
          dyn.cos,
          dyn.sin,
          bestDist
        );
        if (hitT >= 0 && (!hitAny || hitT < bestDist)) {
          bestDist = hitT;
          hitAny = true;
        }
      }
    }

    return hitAny ? bestDist : null;
  }

  queryAabb(
    minX: number,
    minZ: number,
    maxX: number,
    maxZ: number,
    out: StaticBoxHandle[]
  ): void {
    if (this.boxesById.size === 0 || minX > maxX || minZ > maxZ) {
      while (out.length > 0) out.pop();
      return;
    }

    let cMinX = Math.floor(minX / CELL_SIZE);
    let cMaxX = Math.floor(maxX / CELL_SIZE);
    let cMinZ = Math.floor(minZ / CELL_SIZE);
    let cMaxZ = Math.floor(maxZ / CELL_SIZE);

    if (cMinX < this.minGridCx) cMinX = this.minGridCx;
    if (cMaxX > this.maxGridCx) cMaxX = this.maxGridCx;
    if (cMinZ < this.minGridCz) cMinZ = this.minGridCz;
    if (cMaxZ > this.maxGridCz) cMaxZ = this.maxGridCz;
    if (cMinX > cMaxX || cMinZ > cMaxZ) {
      while (out.length > 0) out.pop();
      return;
    }

    const qcx = (minX + maxX) * 0.5;
    const qcz = (minZ + maxZ) * 0.5;
    const qhx = (maxX - minX) * 0.5;
    const qhz = (maxZ - minZ) * 0.5;

    const stamp = ++this.queryStamp;
    let count = 0;

    for (let cx = cMinX; cx <= cMaxX; cx++) {
      for (let cz = cMinZ; cz <= cMaxZ; cz++) {
        const cell = this.grid.get(cellKey(cx, cz));
        if (!cell) continue;
        for (let i = 0; i < cell.length; i++) {
          const box = cell[i]!;
          if (box.stamp === stamp) continue;
          box.stamp = stamp;

          if (box.aabbMaxX < minX || box.aabbMinX > maxX || box.aabbMaxZ < minZ || box.aabbMinZ > maxZ) {
            continue;
          }

          // Exact OBB-vs-AABB SAT axes for rotated boxes
          const dx = qcx - box.x;
          const dz = qcz - box.z;
          const absCos = Math.abs(box.cos);
          const absSin = Math.abs(box.sin);
          if (Math.abs(dx * box.cos - dz * box.sin) > box.halfX + qhx * absCos + qhz * absSin) {
            continue;
          }
          if (Math.abs(dx * box.sin + dz * box.cos) > box.halfZ + qhx * absSin + qhz * absCos) {
            continue;
          }

          out[count++] = box.handle;
        }
      }
    }

    while (out.length > count) out.pop();
  }

  private sweepOnce(
    x: number,
    z: number,
    y: number,
    radius: number,
    dx: number,
    dz: number,
    skipStatic: InternalStaticBox | null,
    skipDynamicIdx: number
  ): boolean {
    const minX = (dx < 0 ? x + dx : x) - radius;
    const maxX = (dx > 0 ? x + dx : x) + radius;
    const minZ = (dz < 0 ? z + dz : z) - radius;
    const maxZ = (dz > 0 ? z + dz : z) + radius;

    let bestToi = 2;
    this._passStatic = null;
    this._passDynamicIdx = -1;

    if (this.boxesById.size > 0) {
      let cMinX = Math.floor(minX / CELL_SIZE);
      let cMaxX = Math.floor(maxX / CELL_SIZE);
      let cMinZ = Math.floor(minZ / CELL_SIZE);
      let cMaxZ = Math.floor(maxZ / CELL_SIZE);

      if (cMinX < this.minGridCx) cMinX = this.minGridCx;
      if (cMaxX > this.maxGridCx) cMaxX = this.maxGridCx;
      if (cMinZ < this.minGridCz) cMinZ = this.minGridCz;
      if (cMaxZ > this.maxGridCz) cMaxZ = this.maxGridCz;

      if (cMinX <= cMaxX && cMinZ <= cMaxZ) {
        const stamp = ++this.queryStamp;

        for (let cx = cMinX; cx <= cMaxX; cx++) {
          for (let cz = cMinZ; cz <= cMaxZ; cz++) {
            const cell = this.grid.get(cellKey(cx, cz));
            if (!cell) continue;
            for (let i = 0; i < cell.length; i++) {
              const box = cell[i]!;
              if (box.stamp === stamp) continue;
              box.stamp = stamp;
              if (box === skipStatic) continue;

              if (y + CAPSULE_HEIGHT_M < box.minY || y > box.maxY) continue;
              if (box.aabbMaxX < minX || box.aabbMinX > maxX || box.aabbMaxZ < minZ || box.aabbMinZ > maxZ) {
                continue;
              }

              if (
                this.sweepCircleObb(
                  x,
                  z,
                  radius,
                  dx,
                  dz,
                  box.x,
                  box.z,
                  box.halfX,
                  box.halfZ,
                  box.cos,
                  box.sin
                ) &&
                this._tmpToi < bestToi
              ) {
                bestToi = this._tmpToi;
                this._passToi = bestToi;
                this._passNx = this._tmpNx;
                this._passNz = this._tmpNz;
                this._passKind = box.kind;
                this._passId = undefined;
                this._passVx = 0;
                this._passVz = 0;
                this._passStatic = box;
                this._passDynamicIdx = -1;
              }
            }
          }
        }
      }
    }

    for (let i = 0; i < this.dynamicCount; i++) {
      if (i === skipDynamicIdx) continue;
      const dyn = this.dynamicVehicles[i]!;
      if (y + CAPSULE_HEIGHT_M < dyn.minY || y > dyn.maxY) continue;
      if (dyn.aabbMaxX < minX || dyn.aabbMinX > maxX || dyn.aabbMaxZ < minZ || dyn.aabbMinZ > maxZ) {
        continue;
      }

      if (
        this.sweepCircleObb(
          x,
          z,
          radius,
          dx,
          dz,
          dyn.x,
          dyn.z,
          dyn.halfX,
          dyn.halfZ,
          dyn.cos,
          dyn.sin
        ) &&
        this._tmpToi < bestToi
      ) {
        bestToi = this._tmpToi;
        this._passToi = bestToi;
        this._passNx = this._tmpNx;
        this._passNz = this._tmpNz;
        this._passKind = 'traffic';
        this._passId = dyn.id;
        this._passVx = dyn.vx;
        this._passVz = dyn.vz;
        this._passStatic = null;
        this._passDynamicIdx = i;
      }
    }

    return bestToi <= 1;
  }

  private sweepCircleObb(
    x: number,
    z: number,
    radius: number,
    dx: number,
    dz: number,
    bx: number,
    bz: number,
    hx: number,
    hz: number,
    cos: number,
    sin: number
  ): boolean {
    const rx = x - bx;
    const rz = z - bz;
    const sx = rx * cos - rz * sin;
    const sz = rx * sin + rz * cos;
    const ldx = dx * cos - dz * sin;
    const ldz = dx * sin + dz * cos;

    const moveLen = Math.sqrt(ldx * ldx + ldz * ldz);
    if (moveLen < 1e-12) return false;

    const cx = sx < -hx ? -hx : sx > hx ? hx : sx;
    const cz = sz < -hz ? -hz : sz > hz ? hz : sz;
    const vx = sx - cx;
    const vz = sz - cz;
    const distSq = vx * vx + vz * vz;
    const rSq = radius * radius;

    if (distSq < rSq) {
      let nlx: number;
      let nlz: number;
      if (distSq > 1e-12) {
        const d = Math.sqrt(distSq);
        nlx = vx / d;
        nlz = vz / d;
      } else {
        const penX = hx - Math.abs(sx);
        const penZ = hz - Math.abs(sz);
        if (penX < penZ) {
          nlx = sx >= 0 ? 1 : -1;
          nlz = 0;
        } else {
          nlx = 0;
          nlz = sz >= 0 ? 1 : -1;
        }
      }
      if (ldx * nlx + ldz * nlz < -OVERLAP_DIR_EPS * moveLen) {
        this._tmpToi = 0;
        this._tmpNx = nlx * cos + nlz * sin;
        this._tmpNz = -nlx * sin + nlz * cos;
        return true;
      }
      return false;
    }

    let bestT = 2;
    let nlx = 0;
    let nlz = 0;

    if (ldx < -1e-12) {
      const t = (hx + radius - sx) / ldx;
      if (t >= 0 && t <= 1 && t < bestT) {
        const hitZ = sz + t * ldz;
        if (hitZ >= -hz && hitZ <= hz) {
          bestT = t;
          nlx = 1;
          nlz = 0;
        }
      }
    }
    if (ldx > 1e-12) {
      const t = (-hx - radius - sx) / ldx;
      if (t >= 0 && t <= 1 && t < bestT) {
        const hitZ = sz + t * ldz;
        if (hitZ >= -hz && hitZ <= hz) {
          bestT = t;
          nlx = -1;
          nlz = 0;
        }
      }
    }
    if (ldz < -1e-12) {
      const t = (hz + radius - sz) / ldz;
      if (t >= 0 && t <= 1 && t < bestT) {
        const hitX = sx + t * ldx;
        if (hitX >= -hx && hitX <= hx) {
          bestT = t;
          nlx = 0;
          nlz = 1;
        }
      }
    }
    if (ldz > 1e-12) {
      const t = (-hz - radius - sz) / ldz;
      if (t >= 0 && t <= 1 && t < bestT) {
        const hitX = sx + t * ldx;
        if (hitX >= -hx && hitX <= hx) {
          bestT = t;
          nlx = 0;
          nlz = -1;
        }
      }
    }

    const a = ldx * ldx + ldz * ldz;
    const invR = radius > 1e-9 ? 1 / radius : 0;
    for (let ci = 0; ci < 4; ci++) {
      const cornerX = (ci & 1) === 0 ? -hx : hx;
      const cornerZ = (ci & 2) === 0 ? -hz : hz;
      const ox = sx - cornerX;
      const oz = sz - cornerZ;
      const b = ox * ldx + oz * ldz;
      if (b >= 0) continue;
      const c = Math.max(0, ox * ox + oz * oz - rSq);
      const disc = b * b - a * c;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / a;
      if (t >= 0 && t <= 1 && t < bestT) {
        bestT = t;
        nlx = (sx + t * ldx - cornerX) * invR;
        nlz = (sz + t * ldz - cornerZ) * invR;
      }
    }

    if (bestT > 1) return false;

    const nLen = Math.sqrt(nlx * nlx + nlz * nlz);
    if (nLen > 1e-9) {
      nlx /= nLen;
      nlz /= nLen;
    }

    if (ldx * nlx + ldz * nlz >= -OVERLAP_DIR_EPS * moveLen) {
      return false;
    }

    this._tmpToi = bestT;
    this._tmpNx = nlx * cos + nlz * sin;
    this._tmpNz = -nlx * sin + nlz * cos;
    return true;
  }
}

function matchesKind(
  kind: StaticColliderKind,
  filterKinds: readonly StaticColliderKind[]
): boolean {
  for (let i = 0; i < filterKinds.length; i++) {
    if (filterKinds[i] === kind) return true;
  }
  return false;
}

function intersectRayObb(
  ox: number,
  oz: number,
  ndx: number,
  ndz: number,
  bx: number,
  bz: number,
  hx: number,
  hz: number,
  cos: number,
  sin: number,
  maxDist: number
): number {
  const rx = ox - bx;
  const rz = oz - bz;
  const lx = rx * cos - rz * sin;
  const lz = rx * sin + rz * cos;
  const ldx = ndx * cos - ndz * sin;
  const ldz = ndx * sin + ndz * cos;

  let tMin = 0;
  let tMax = maxDist;

  if (Math.abs(ldx) < 1e-12) {
    if (lx < -hx || lx > hx) return -1;
  } else {
    const invX = 1 / ldx;
    let t1 = (-hx - lx) * invX;
    let t2 = (hx - lx) * invX;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }

  if (Math.abs(ldz) < 1e-12) {
    if (lz < -hz || lz > hz) return -1;
  } else {
    const invZ = 1 / ldz;
    let t1 = (-hz - lz) * invZ;
    let t2 = (hz - lz) * invZ;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    if (t1 > tMin) tMin = t1;
    if (t2 < tMax) tMax = t2;
    if (tMin > tMax) return -1;
  }

  return tMin >= 0 && tMin <= tMax ? tMin : -1;
}
