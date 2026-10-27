import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { DistrictId } from '../core/types';
import type { DistrictData, WorldData } from '../sim/schemas';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { SignageAtlas } from './signage';
import { RoadMeshBuilder, getRoadWidth } from './roadMesh';
import { BuildingBuilder } from './buildings';
import {
  LodManager,
  districtsToLoad,
  districtsToUnload,
  createDistrictSilhouette,
  disposeHierarchy,
} from './lod';

export interface CityBuilderOptions {
  signageAtlas?: SignageAtlas;
  chunkSize?: number;
}

export interface StaticBoxDesc {
  x: number;
  y: number;
  z: number;
  halfX: number;
  halfY: number;
  halfZ: number;
  yaw: number;
}

interface BuildDistrictTask {
  districtId: DistrictId;
  district: DistrictData;
  physicsWorld?: PhysicsWorld;
  stage: 'roads' | 'lots' | 'lot_colliders' | 'kerb_colliders' | 'finalize';
  lotIndex: number;
  lotColliderIndex: number;
  kerbIndex: number;
  roadColliders: THREE.Object3D[];
  buildingColliders: THREE.Object3D[];
  chunkObjects: { obj: THREE.Object3D; x: number; z: number }[];
  physicsColliders: RAPIER.Collider[];
  staticBoxDescs: StaticBoxDesc[];
}

export class CityBuilder {
  readonly signageAtlas: SignageAtlas;
  readonly roadBuilder: RoadMeshBuilder;
  readonly buildingBuilder: BuildingBuilder;
  readonly lodManager: LodManager;
  readonly root: THREE.Group;
  readonly silhouetteGroup: THREE.Group;
  readonly colliders: THREE.Object3D[] = [];
  readonly staticBoxDescs: StaticBoxDesc[] = [];

  readonly loadedDistricts: Set<DistrictId> = new Set();
  readonly districtChunkObjects: Map<
    DistrictId,
    { obj: THREE.Object3D; x: number; z: number }[]
  > = new Map();
  readonly districtColliders: Map<DistrictId, THREE.Object3D[]> = new Map();
  readonly districtPhysicsColliders: Map<DistrictId, RAPIER.Collider[]> = new Map();
  readonly districtStaticBoxDescs: Map<DistrictId, StaticBoxDesc[]> = new Map();
  readonly silhouettes: Map<DistrictId, THREE.Object3D> = new Map();
  readonly buildQueue: BuildDistrictTask[] = [];

  private worldData?: WorldData;
  private districtProvider?: (id: DistrictId) => DistrictData | undefined;
  private physicsWorld?: PhysicsWorld;

  constructor(opts: CityBuilderOptions = {}) {
    this.signageAtlas = opts.signageAtlas ?? new SignageAtlas();
    this.roadBuilder = new RoadMeshBuilder();
    this.buildingBuilder = new BuildingBuilder(this.signageAtlas);
    this.lodManager = new LodManager(opts.chunkSize ?? 100);

    this.root = new THREE.Group();
    this.root.name = 'city_builder_root';

    this.silhouetteGroup = new THREE.Group();
    this.silhouetteGroup.name = 'city_silhouettes';
    this.root.add(this.silhouetteGroup);

    this.root.add(this.lodManager.root);
  }

  /**
   * Initializes multi-district streaming across the 7 Dhaka districts.
   * Generates low-poly skyline silhouettes for all districts in the world,
   * then kicks off streaming for the given initial player position.
   */
  initWorldStreaming(
    world: WorldData,
    districtProvider: (id: DistrictId) => DistrictData | undefined,
    physicsWorld?: PhysicsWorld,
    initialPos: { x: number; z: number } = { x: 300, z: 300 }
  ): void {
    this.worldData = world;
    this.districtProvider = districtProvider;
    this.physicsWorld = physicsWorld;

    // Create low-poly silhouette for each district
    for (const dRef of world.districts) {
      const dId = dRef.districtId as DistrictId;
      const district = districtProvider(dId);
      if (district) {
        const sil = createDistrictSilhouette(district);
        sil.visible = true;
        this.silhouettes.set(dId, sil);
        this.silhouetteGroup.add(sil);
      }
    }

    // Trigger initial load around starting position with enough initial budget to prepare starting district
    this.update(initialPos, 250, 50);
  }

  private createTask(
    districtId: DistrictId,
    district: DistrictData,
    physicsWorld?: PhysicsWorld
  ): BuildDistrictTask {
    return {
      districtId,
      district,
      physicsWorld,
      stage: 'roads',
      lotIndex: 0,
      lotColliderIndex: 0,
      kerbIndex: 0,
      roadColliders: [],
      buildingColliders: [],
      chunkObjects: [],
      physicsColliders: [],
      staticBoxDescs: [],
    };
  }

  /**
   * Performs an incremental step of building a district.
   * Returns true when the task is completely finished.
   */
  private stepTask(task: BuildDistrictTask): boolean {
    if (task.stage === 'roads') {
      const roadResult = this.roadBuilder.build(task.district);
      task.roadColliders.push(...roadResult.colliders);
      for (const child of roadResult.group.children) {
        task.chunkObjects.push({
          obj: child,
          x: child.position.x,
          z: child.position.z,
        });
      }
      task.stage = 'lots';
      return false;
    }

    if (task.stage === 'lots') {
      const lots = task.district.lots ?? [];
      if (lots.length === 0 || task.lotIndex >= lots.length) {
        task.stage = 'lot_colliders';
        return false;
      }
      const batch = lots.slice(task.lotIndex, task.lotIndex + 12);
      const bResult = this.buildingBuilder.build(batch);
      task.buildingColliders.push(...bResult.colliders);
      for (const bGroup of bResult.group.children) {
        task.chunkObjects.push({
          obj: bGroup,
          x: bGroup.position.x,
          z: bGroup.position.z,
        });
      }
      task.lotIndex += batch.length;
      if (task.lotIndex >= lots.length) {
        task.stage = 'lot_colliders';
      }
      return false;
    }

    if (task.stage === 'lot_colliders') {
      const lots = task.district.lots ?? [];
      if (lots.length === 0 || task.lotColliderIndex >= lots.length) {
        task.stage = 'kerb_colliders';
        return false;
      }
      const batch = lots.slice(task.lotColliderIndex, task.lotColliderIndex + 20);
      for (const lot of batch) {
        const storeys = 4 + (Math.abs(Math.floor(lot.x * 13 + lot.z * 7)) % 5);
        const totalHeight = storeys * 3.2;
        const width = lot.width * 0.94;
        const depth = lot.depth * 0.94;

        const desc: StaticBoxDesc = {
          x: lot.x,
          y: totalHeight / 2,
          z: lot.z,
          halfX: width / 2,
          halfY: totalHeight / 2,
          halfZ: depth / 2,
          yaw: lot.facingHeading,
        };
        task.staticBoxDescs.push(desc);

        if (task.physicsWorld) {
          const col = task.physicsWorld.addStaticBox(
            desc.x,
            desc.y,
            desc.z,
            desc.halfX,
            desc.halfY,
            desc.halfZ,
            desc.yaw
          );
          task.physicsColliders.push(col);
        }
      }
      task.lotColliderIndex += batch.length;
      if (task.lotColliderIndex >= lots.length) {
        task.stage = 'kerb_colliders';
      }
      return false;
    }

    if (task.stage === 'kerb_colliders') {
      const segments = task.district.segments;
      if (segments.length === 0 || task.kerbIndex >= segments.length) {
        task.stage = 'finalize';
        return false;
      }
      const nodeMap = new Map(task.district.nodes.map((n) => [n.nodeId, n]));
      const batch = segments.slice(task.kerbIndex, task.kerbIndex + 20);

      if (task.physicsWorld) {
        for (const seg of batch) {
          const sNode = nodeMap.get(seg.startNodeId);
          const eNode = nodeMap.get(seg.endNodeId);
          if (!sNode || !eNode) continue;

          const dx = eNode.x - sNode.x;
          const dz = eNode.z - sNode.z;
          const len = Math.hypot(dx, dz);
          if (len < 0.1) continue;

          const nx = -dz / len;
          const nz = dx / len;
          const width = getRoadWidth(seg);
          const rotY = Math.atan2(dx, dz);
          const midX = (sNode.x + eNode.x) / 2;
          const midZ = (sNode.z + eNode.z) / 2;

          const kerbW = 0.28;
          const kerbH = 0.18;

          // Left kerb
          const leftCol = task.physicsWorld.addStaticBox(
            midX - nx * (width / 2 + kerbW / 2),
            kerbH / 2,
            midZ - nz * (width / 2 + kerbW / 2),
            kerbW / 2,
            kerbH / 2,
            len / 2,
            rotY
          );
          task.physicsColliders.push(leftCol);

          // Right kerb
          const rightCol = task.physicsWorld.addStaticBox(
            midX + nx * (width / 2 + kerbW / 2),
            kerbH / 2,
            midZ + nz * (width / 2 + kerbW / 2),
            kerbW / 2,
            kerbH / 2,
            len / 2,
            rotY
          );
          task.physicsColliders.push(rightCol);

          // Median
          if (seg.divided) {
            const medCol = task.physicsWorld.addStaticBox(
              midX,
              0.11,
              midZ,
              0.45,
              0.11,
              len / 2,
              rotY
            );
            task.physicsColliders.push(medCol);
          }
        }
      }

      task.kerbIndex += batch.length;
      if (task.kerbIndex >= segments.length) {
        task.stage = 'finalize';
      }
      return false;
    }

    if (task.stage === 'finalize') {
      // 1. Commit objects to LodManager
      for (const item of task.chunkObjects) {
        this.lodManager.addObject(item.obj, item.x, item.z);
      }

      // 2. Commit colliders & descriptors
      this.colliders.push(...task.roadColliders, ...task.buildingColliders);
      this.staticBoxDescs.push(...task.staticBoxDescs);

      // 3. Save district state for unloading
      this.districtChunkObjects.set(task.districtId, task.chunkObjects);
      this.districtColliders.set(task.districtId, [
        ...task.roadColliders,
        ...task.buildingColliders,
      ]);
      this.districtPhysicsColliders.set(task.districtId, task.physicsColliders);
      this.districtStaticBoxDescs.set(task.districtId, task.staticBoxDescs);
      this.loadedDistricts.add(task.districtId);

      // 4. Hide low-poly silhouette now that full LOD is built
      const sil = this.silhouettes.get(task.districtId);
      if (sil) {
        sil.visible = false;
      }

      return true;
    }

    return true;
  }

  /**
   * Synchronously builds a complete district immediately (legacy/direct mode).
   */
  buildDistrict(district: DistrictData, physicsWorld?: PhysicsWorld): void {
    const task = this.createTask(district.districtId, district, physicsWorld);
    while (!this.stepTask(task)) {
      // Execute all slices until finished
    }
  }

  /**
   * Unloads and disposes a district that has moved beyond the unload radius.
   * Removes physics colliders, disposes Three.js meshes/geometries/materials,
   * and restores the distant low-poly silhouette.
   */
  unloadDistrict(districtId: DistrictId): void {
    if (!this.loadedDistricts.has(districtId)) return;

    // 1. Remove and dispose chunk objects
    const chunkObjs = this.districtChunkObjects.get(districtId) ?? [];
    for (const item of chunkObjs) {
      this.lodManager.removeObject(item.obj, item.x, item.z);
      disposeHierarchy(item.obj);
    }
    this.districtChunkObjects.delete(districtId);

    // 2. Remove physics colliders
    if (this.physicsWorld) {
      const pCols = this.districtPhysicsColliders.get(districtId) ?? [];
      for (const col of pCols) {
        this.physicsWorld.removeCollider(col);
      }
    }
    this.districtPhysicsColliders.delete(districtId);

    // 3. Remove raycast colliders
    const cols = this.districtColliders.get(districtId) ?? [];
    for (const c of cols) {
      const idx = this.colliders.indexOf(c);
      if (idx !== -1) {
        this.colliders.splice(idx, 1);
      }
    }
    this.districtColliders.delete(districtId);

    // 4. Remove static box descs
    const descs = this.districtStaticBoxDescs.get(districtId) ?? [];
    for (const d of descs) {
      const idx = this.staticBoxDescs.indexOf(d);
      if (idx !== -1) {
        this.staticBoxDescs.splice(idx, 1);
      }
    }
    this.districtStaticBoxDescs.delete(districtId);

    // 5. Restore silhouette visibility
    const sil = this.silhouettes.get(districtId);
    if (sil) {
      sil.visible = true;
    }

    this.loadedDistricts.delete(districtId);
  }

  isDistrictLoaded(districtId: DistrictId): boolean {
    return this.loadedDistricts.has(districtId);
  }

  isDistrictBuilding(districtId: DistrictId): boolean {
    return this.buildQueue.some((t) => t.districtId === districtId);
  }

  getLoadedDistricts(): DistrictId[] {
    return Array.from(this.loadedDistricts);
  }

  getSilhouette(districtId: DistrictId): THREE.Object3D | undefined {
    return this.silhouettes.get(districtId);
  }

  getBuildQueueLength(): number {
    return this.buildQueue.length;
  }

  /**
   * Main per-frame update loop.
   * Manages district streaming (loads within 400m, unloads > 700m),
   * executes asynchronous build slices respecting the frame time budget (<= 4 ms),
   * and updates chunk visibility culling.
   */
  update(
    cameraPos: { x: number; z: number },
    maxDistance = 250,
    maxBudgetMs = 4
  ): void {
    if (this.worldData && this.districtProvider) {
      // 1. Check which districts need loading (<= 400m)
      const toLoad = districtsToLoad(cameraPos, this.worldData, 400);
      for (const distId of toLoad) {
        if (!this.loadedDistricts.has(distId) && !this.isDistrictBuilding(distId)) {
          const district = this.districtProvider(distId);
          if (district) {
            this.buildQueue.push(
              this.createTask(distId, district, this.physicsWorld)
            );
          }
        }
      }

      // 2. Check which districts need unloading (> 700m)
      const toUnload = districtsToUnload(
        cameraPos,
        this.loadedDistricts,
        this.worldData,
        700
      );
      for (const distId of toUnload) {
        this.unloadDistrict(distId);
      }

      // 3. Process time-sliced build queue within frame budget
      const startTime = performance.now();
      while (this.buildQueue.length > 0) {
        const currentTask = this.buildQueue[0]!;
        const finished = this.stepTask(currentTask);
        if (finished) {
          this.buildQueue.shift();
        }
        if (performance.now() - startTime >= maxBudgetMs) {
          break;
        }
      }
    }

    // 4. Update spatial chunk visibility culling
    this.lodManager.update(cameraPos, maxDistance);
  }
}
