import * as THREE from 'three';
import type { DistrictId, RoadNode, RoadSegment } from '../core/types';
import type { DistrictData, WorldData } from '../sim/schemas';
import type { PhysicsWorld, StaticBoxHandle } from '../physics/PhysicsWorld';
import type { SignalController } from '../sim/traffic/signals';
import { SignageAtlas } from './signage';
import { RoadMeshBuilder, getRoadWidth, kerbEndTrim } from './roadMesh';
export { kerbEndTrim };
import { BuildingBuilder } from './buildings';
import { assetManager } from './assets';
import {
  createTeaStallMesh,
  createFuelCanopyMesh,
  createGarageShutterMesh,
  createFootbridgeMesh,
  createTrafficSignalPole,
  syncTrafficSignalVisual,
  createStreetlightFallback,
  createTreeFallback,
  type TrafficSignalVisual,
} from './props';
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

interface PositionedObj {
  obj: THREE.Object3D;
  x: number;
  z: number;
}

interface BuildDistrictTask {
  districtId: DistrictId;
  district: DistrictData;
  physicsWorld?: PhysicsWorld;
  stage: 'roads' | 'lots' | 'lot_colliders' | 'kerb_colliders' | 'props' | 'finalize';
  lotIndex: number;
  lotColliderIndex: number;
  kerbIndex: number;
  roadColliders: THREE.Object3D[];
  buildingColliders: THREE.Object3D[];
  roadMeshes: PositionedObj[];
  roadLines: PositionedObj[];
  buildingGroups: PositionedObj[];
  batchedPropGroups: PositionedObj[];
  chunkObjects: PositionedObj[];
  physicsColliders: StaticBoxHandle[];
  staticBoxDescs: StaticBoxDesc[];
  signalVisuals: TrafficSignalVisual[];
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
  readonly districtChunkObjects: Map<DistrictId, PositionedObj[]> = new Map();
  readonly districtColliders: Map<DistrictId, THREE.Object3D[]> = new Map();
  readonly districtPhysicsColliders: Map<DistrictId, StaticBoxHandle[]> = new Map();
  readonly districtStaticBoxDescs: Map<DistrictId, StaticBoxDesc[]> = new Map();
  readonly districtSignalVisuals: Map<DistrictId, TrafficSignalVisual[]> = new Map();
  readonly silhouettes: Map<DistrictId, THREE.Object3D> = new Map();
  readonly buildQueue: BuildDistrictTask[] = [];

  private readonly signalVisuals: TrafficSignalVisual[] = [];
  private readonly connectorObjects: PositionedObj[] = [];
  private readonly connectorColliders: THREE.Object3D[] = [];
  private readonly connectorPhysicsColliders: StaticBoxHandle[] = [];
  private readonly canonicalPropMaterials: Map<string, THREE.Material> = new Map();

  private worldData?: WorldData;
  private districtProvider?: (id: DistrictId) => DistrictData | undefined;
  private physicsWorld?: PhysicsWorld;
  private worldNodesMap: Map<string, RoadNode> = new Map();
  private allWorldSegments: RoadSegment[] = [];

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
   * builds world border connector roads + colliders, and kicks off streaming
   * around the initial player position.
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
    this.worldNodesMap.clear();
    this.allWorldSegments = [];

    for (const dRef of world.districts) {
      const dId = dRef.districtId as DistrictId;
      const district = districtProvider(dId);
      if (district) {
        const sil = createDistrictSilhouette(district);
        sil.visible = true;
        this.silhouettes.set(dId, sil);
        this.silhouetteGroup.add(sil);

        for (const n of district.nodes) {
          this.worldNodesMap.set(n.nodeId, n);
        }
        this.allWorldSegments.push(...district.segments);
      }
    }

    if (world.connectors && world.connectors.length > 0) {
      this.allWorldSegments.push(...world.connectors);
      this.buildConnectors(world.connectors, this.worldNodesMap, physicsWorld, this.allWorldSegments);
    }

    // Trigger initial load around starting position with enough initial budget to prepare starting district
    this.update(initialPos, 250, 50);
  }

  /**
   * Builds 3D road meshes, kerbs, sidewalks, markings, and physics colliders
   * for cross-district world.connectors.
   */
  buildConnectors(
    connectors: readonly RoadSegment[],
    nodeMap: ReadonlyMap<string, RoadNode>,
    physicsWorld?: PhysicsWorld,
    trimContextSegments: readonly RoadSegment[] = connectors
  ): void {
    if (connectors.length === 0) return;

    const roadResult = this.roadBuilder.buildSegments(
      connectors,
      nodeMap,
      'world_connectors',
      trimContextSegments
    );

    const protectedGeos = new Set<THREE.BufferGeometry>();
    for (const col of roadResult.colliders) {
      this.colliders.push(col);
      this.connectorColliders.push(col);
      if (col instanceof THREE.Mesh && col.geometry) {
        protectedGeos.add(col.geometry);
      }
    }

    const meshes: PositionedObj[] = [];
    const lines: PositionedObj[] = [];
    for (const child of roadResult.group.children) {
      if (child instanceof THREE.LineSegments) {
        lines.push({ obj: child, x: child.position.x, z: child.position.z });
      } else {
        meshes.push({ obj: child, x: child.position.x, z: child.position.z });
      }
    }

    const batched = this.batchStaticGroups(meshes, protectedGeos);
    const mergedLines = this.mergeLineSegmentsPerChunk(lines);
    for (const item of [...batched, ...mergedLines]) {
      this.lodManager.addObject(item.obj, item.x, item.z);
      this.connectorObjects.push(item);
    }

    if (physicsWorld) {
      for (const seg of connectors) {
        this.addSegmentKerbPhysicsColliders(
          seg,
          trimContextSegments,
          nodeMap,
          physicsWorld,
          this.connectorPhysicsColliders
        );
      }
    }
  }

  private addSegmentKerbPhysicsColliders(
    seg: RoadSegment,
    trimSegments: readonly RoadSegment[],
    nodeMap: ReadonlyMap<string, RoadNode>,
    physicsWorld: PhysicsWorld,
    outHandles: StaticBoxHandle[]
  ): void {
    const sNode = nodeMap.get(seg.startNodeId);
    const eNode = nodeMap.get(seg.endNodeId);
    if (!sNode || !eNode) return;

    const dx = eNode.x - sNode.x;
    const dz = eNode.z - sNode.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) return;

    const y1 = sNode.y ?? 0;
    const y2 = eNode.y ?? 0;
    if (Math.abs(y1 - y2) > 0.1) return; // Sloped ramps cannot use flat horizontal boxes
    const segY = (y1 + y2) * 0.5;
    const isElevated = seg.roadType === 'flyover' || segY > 0.5;

    const nx = -dz / len;
    const nz = dx / len;
    const width = getRoadWidth(seg);
    const rotY = Math.atan2(dx, dz);
    const kerbW = 0.28;
    const kerbH = isElevated ? 0.85 : 0.18;

    if (isElevated) {
      const midX = (sNode.x + eNode.x) * 0.5;
      const midZ = (sNode.z + eNode.z) * 0.5;
      for (const side of [-1, 1] as const) {
        outHandles.push(
          physicsWorld.addStaticBox(
            midX + side * nx * (width / 2 + kerbW / 2),
            segY + kerbH / 2,
            midZ + side * nz * (width / 2 + kerbW / 2),
            kerbW / 2,
            kerbH / 2,
            len / 2,
            rotY,
            'kerb'
          )
        );
      }
      return;
    }

    for (const side of [-1, 1] as const) {
      const trimS = kerbEndTrim(seg, true, trimSegments, nodeMap, side);
      const trimE = kerbEndTrim(seg, false, trimSegments, nodeMap, side);
      const kerbLen = len - trimS - trimE;
      if (kerbLen <= 0.2) continue;

      const mid = (len + trimS - trimE) / 2;
      const midX = sNode.x + (dx / len) * mid;
      const midZ = sNode.z + (dz / len) * mid;

      outHandles.push(
        physicsWorld.addStaticBox(
          midX + side * nx * (width / 2 + kerbW / 2),
          segY + kerbH / 2,
          midZ + side * nz * (width / 2 + kerbW / 2),
          kerbW / 2,
          kerbH / 2,
          kerbLen / 2,
          rotY,
          'kerb'
        )
      );
    }

    if (seg.divided && !seg.oneWay) {
      outHandles.push(
        physicsWorld.addStaticBox(
          (sNode.x + eNode.x) / 2,
          segY + 0.11,
          (sNode.z + eNode.z) / 2,
          0.45,
          0.11,
          len / 2,
          rotY,
          'median'
        )
      );
    }
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
      roadMeshes: [],
      roadLines: [],
      buildingGroups: [],
      batchedPropGroups: [],
      chunkObjects: [],
      physicsColliders: [],
      staticBoxDescs: [],
      signalVisuals: [],
    };
  }

  private resolvePropMaterial(
    modelId: string,
    rawMaterial: THREE.Material | THREE.Material[]
  ): THREE.Material | THREE.Material[] {
    if (Array.isArray(rawMaterial)) {
      for (const m of rawMaterial) m.userData.shared = true;
      return rawMaterial;
    }
    rawMaterial.userData.shared = true;
    const entry = assetManager.getEntry(modelId);
    const stdMat = rawMaterial as THREE.MeshStandardMaterial;
    if (entry?.pack && rawMaterial.name === 'colormap' && stdMat.map) {
      const key = `${entry.pack}|${stdMat.map.image ? 'tex' : 'notex'}`;
      const existing = this.canonicalPropMaterials.get(key);
      if (existing) return existing;
      this.canonicalPropMaterials.set(key, rawMaterial);
    }
    return rawMaterial;
  }

  private createPropInstance(modelId: string, fallbackFn: () => THREE.Object3D): THREE.Object3D {
    const proto = assetManager.getInstancedPrototype(modelId);
    if (proto) {
      proto.geometry.userData.shared = true;
      const mat = this.resolvePropMaterial(modelId, proto.material);
      const mesh = new THREE.Mesh(proto.geometry, mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
    return fallbackFn();
  }

  private buildDistrictProps(task: BuildDistrictTask): void {
    const district = task.district;
    const nodeMap = new Map(district.nodes.map((n) => [n.nodeId, n]));
    const trimContext =
      this.allWorldSegments.length > 0 ? this.allWorldSegments : district.segments;

    const lots = district.lots ?? [];
    const nearAnyLot = (px: number, pz: number, margin: number): boolean => {
      for (const l of lots) {
        const halfMax = Math.max(l.width, l.depth) * 0.5 + margin;
        if (Math.abs(px - l.x) < halfMax && Math.abs(pz - l.z) < halfMax) {
          return true;
        }
      }
      return false;
    };

    const nearAnyRoad = (px: number, pz: number, excludeSeg: RoadSegment | null, margin: number): boolean => {
      for (const seg of district.segments) {
        if (seg === excludeSeg || seg.roadType === 'flyover') continue;
        const a = nodeMap.get(seg.startNodeId);
        const b = nodeMap.get(seg.endNodeId);
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len2 = dx * dx + dz * dz;
        const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - a.x) * dx + (pz - a.z) * dz) / len2)) : 0;
        const d = Math.hypot(px - (a.x + t * dx), pz - (a.z + t * dz));
        if (d < getRoadWidth(seg) / 2 + margin) return true;
      }
      return false;
    };

    // 1. Place 3D POI landmarks (teaStall, fuel, garage, footbridge)
    for (const poi of district.pois ?? []) {
      const node = nodeMap.get(poi.nodeId);
      if (!node) continue;

      const incidentSegs = district.segments.filter(
        (s) =>
          (s.startNodeId === poi.nodeId || s.endNodeId === poi.nodeId) &&
          s.roadType !== 'flyover'
      );
      if (incidentSegs.length === 0) continue;

      // Pick widest ground segment attached to this POI node
      let seg = incidentSegs[0]!;
      for (const s of incidentSegs) {
        if (getRoadWidth(s) > getRoadWidth(seg)) seg = s;
      }

      const farId = seg.startNodeId === poi.nodeId ? seg.endNodeId : seg.startNodeId;
      const farNode = nodeMap.get(farId);
      if (!farNode) continue;

      const dx = farNode.x - node.x;
      const dz = farNode.z - node.z;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 1) continue;

      const ux = dx / segLen;
      const uz = dz / segLen;
      const nx = -uz;
      const nz = ux;
      const roadW = getRoadWidth(seg);

      const pickClearSide = (along: number, lateral: number): 1 | -1 => {
        const pxPos = node.x + ux * along + nx * lateral;
        const pzPos = node.z + uz * along + nz * lateral;
        if (!nearAnyRoad(pxPos, pzPos, seg, 1.5) && !nearAnyLot(pxPos, pzPos, 1.0)) return 1;
        const pxNeg = node.x + ux * along - nx * lateral;
        const pzNeg = node.z + uz * along - nz * lateral;
        if (!nearAnyRoad(pxNeg, pzNeg, seg, 1.5)) return -1;
        return 1;
      };

      if (poi.kind === 'teaStall') {
        const along = Math.min(8, segLen * 0.25);
        const lateral = roadW / 2 + 2.3;
        const side = pickClearSide(along, lateral);
        const mesh = createTeaStallMesh();
        mesh.name = `poi_teaStall_${poi.id}`;
        const px = node.x + ux * along + side * nx * lateral;
        const pz = node.z + uz * along + side * nz * lateral;
        mesh.position.set(px, 0, pz);
        mesh.rotation.y = Math.atan2(-side * nx, -side * nz);
        task.chunkObjects.push({ obj: mesh, x: px, z: pz });
      } else if (poi.kind === 'fuel') {
        const along = Math.min(12, segLen * 0.3);
        const lateral = roadW / 2 + 5.0;
        const side = pickClearSide(along, lateral);
        const mesh = createFuelCanopyMesh();
        mesh.name = `poi_fuel_${poi.id}`;
        const px = node.x + ux * along + side * nx * lateral;
        const pz = node.z + uz * along + side * nz * lateral;
        mesh.position.set(px, 0, pz);
        mesh.rotation.y = Math.atan2(ux, uz);
        task.chunkObjects.push({ obj: mesh, x: px, z: pz });
      } else if (poi.kind === 'garage') {
        const along = Math.min(10, segLen * 0.28);
        const lateral = roadW / 2 + 2.4;
        const side = pickClearSide(along, lateral);
        const mesh = createGarageShutterMesh();
        mesh.name = `poi_garage_${poi.id}`;
        const px = node.x + ux * along + side * nx * lateral;
        const pz = node.z + uz * along + side * nz * lateral;
        mesh.position.set(px, 0, pz);
        mesh.rotation.y = Math.atan2(-side * nx, -side * nz);
        task.chunkObjects.push({ obj: mesh, x: px, z: pz });
      } else if (poi.kind === 'crossing') {
        const along = Math.min(10, segLen * 0.25);
        const mesh = createFootbridgeMesh(roadW + 2.8);
        mesh.name = `poi_footbridge_${poi.id}`;
        const px = node.x + ux * along;
        const pz = node.z + uz * along;
        mesh.position.set(px, 0, pz);
        mesh.rotation.y = Math.atan2(ux, uz);
        task.chunkObjects.push({ obj: mesh, x: px, z: pz });
      }
    }

    // 2. Place 3D traffic signal poles at signaled junctions (synced live to SignalController)
    for (const node of district.nodes) {
      if (!node.signal) continue;
      const nodeY = node.y ?? 0;
      const incSegs = district.segments.filter(
        (s) =>
          (s.startNodeId === node.nodeId || s.endNodeId === node.nodeId) &&
          s.roadType !== 'flyover'
      );
      let maxW = 10;
      for (const s of incSegs) {
        maxW = Math.max(maxW, getRoadWidth(s));
      }
      const corner = maxW / 2 + 1.1;

      // Approach 0: East-West traffic (pole on NW corner, facing ±X)
      const ewSignal = createTrafficSignalPole(node.nodeId, 0);
      const ewX = node.x - corner;
      const ewZ = node.z - corner;
      ewSignal.group.position.set(ewX, nodeY, ewZ);
      ewSignal.group.rotation.y = Math.PI / 2;
      task.chunkObjects.push({ obj: ewSignal.group, x: ewX, z: ewZ });
      task.signalVisuals.push(ewSignal);

      // Approach 1: North-South traffic (pole on SE corner, facing ±Z)
      const nsSignal = createTrafficSignalPole(node.nodeId, 1);
      const nsX = node.x + corner;
      const nsZ = node.z + corner;
      nsSignal.group.position.set(nsX, nodeY, nsZ);
      nsSignal.group.rotation.y = 0;
      task.chunkObjects.push({ obj: nsSignal.group, x: nsX, z: nsZ });
      task.signalVisuals.push(nsSignal);
    }

    // 3. Place roadside streetlights & trees along trimmed sidewalks (batched per chunk)
    for (let sIdx = 0; sIdx < district.segments.length; sIdx++) {
      const seg = district.segments[sIdx]!;
      if (seg.roadType === 'flyover' || seg.roadType === 'alley') continue;

      const sNode = nodeMap.get(seg.startNodeId);
      const eNode = nodeMap.get(seg.endNodeId);
      if (!sNode || !eNode) continue;
      if ((sNode.y ?? 0) > 0.5 || (eNode.y ?? 0) > 0.5) continue;

      const dx = eNode.x - sNode.x;
      const dz = eNode.z - sNode.z;
      const len = Math.hypot(dx, dz);
      if (len < 22) continue;

      const dirX = dx / len;
      const dirZ = dz / len;
      const nx = -dirZ;
      const nz = dirX;
      const roadW = getRoadWidth(seg);

      // Streetlamps on right (+1) sidewalk (and median on divided roads)
      const rightStart = kerbEndTrim(seg, true, trimContext, nodeMap, 1);
      const rightEnd = kerbEndTrim(seg, false, trimContext, nodeMap, 1);
      const rightKerbLen = len - rightStart - rightEnd;

      if (rightKerbLen > 16) {
        const lampStep = 38;
        const numLamps = Math.max(1, Math.floor(rightKerbLen / lampStep));
        const lampLat = roadW / 2 + 0.55;
        for (let i = 0; i < numLamps; i++) {
          const along = rightStart + ((i + 0.5) / numLamps) * rightKerbLen;
          const lx = sNode.x + dirX * along + nx * lampLat;
          const lz = sNode.z + dirZ * along + nz * lampLat;
          const lamp = this.createPropInstance('prop_streetlight', createStreetlightFallback);
          lamp.position.set(lx, 0, lz);
          lamp.rotation.y = Math.atan2(nx, nz);
          task.batchedPropGroups.push({ obj: lamp, x: lx, z: lz });
        }
      }

      // Roadside trees on residential / service / main sidewalks where clear of lots & junctions
      if (
        (seg.roadType === 'residential' || seg.roadType === 'service' || seg.roadType === 'main') &&
        len > 30
      ) {
        for (const side of [-1, 1] as const) {
          const st = kerbEndTrim(seg, true, trimContext, nodeMap, side);
          const et = kerbEndTrim(seg, false, trimContext, nodeMap, side);
          const kLen = len - st - et;
          if (kLen < 22) continue;

          const treeStep = 36;
          const numTrees = Math.floor(kLen / treeStep);
          const treeLat = roadW / 2 + 2.05;
          for (let i = 0; i < numTrees; i++) {
            const along = st + ((i + 0.5) / numTrees) * kLen;
            const tx = sNode.x + dirX * along + side * nx * treeLat;
            const tz = sNode.z + dirZ * along + side * nz * treeLat;
            if (nearAnyLot(tx, tz, 0.8)) continue;
            const large = (sIdx + i + (side > 0 ? 1 : 0)) % 2 === 0;
            const treeId = large ? 'prop_tree_large' : 'prop_tree_small';
            const tree = this.createPropInstance(treeId, () => createTreeFallback(large));
            tree.position.set(tx, 0, tz);
            tree.rotation.y = ((sIdx * 37 + i * 19) % 628) / 100;
            task.batchedPropGroups.push({ obj: tree, x: tx, z: tz });
          }
        }
      }
    }
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
        if (child instanceof THREE.LineSegments) {
          task.roadLines.push({
            obj: child,
            x: child.position.x,
            z: child.position.z,
          });
        } else if (child.name === 'flyover_pillar') {
          // Keep flyover pillars individually named inside their chunk
          task.chunkObjects.push({
            obj: child,
            x: child.position.x,
            z: child.position.z,
          });
        } else {
          task.roadMeshes.push({
            obj: child,
            x: child.position.x,
            z: child.position.z,
          });
        }
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
        task.buildingGroups.push({
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
            desc.yaw,
            'building'
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
        task.stage = 'props';
        return false;
      }
      const nodeMap = new Map(task.district.nodes.map((n) => [n.nodeId, n]));
      const batch = segments.slice(task.kerbIndex, task.kerbIndex + 20);
      const trimContext =
        this.allWorldSegments.length > 0 ? this.allWorldSegments : segments;

      if (task.physicsWorld) {
        for (const seg of batch) {
          this.addSegmentKerbPhysicsColliders(
            seg,
            trimContext,
            nodeMap,
            task.physicsWorld,
            task.physicsColliders
          );
        }
      }

      task.kerbIndex += batch.length;
      if (task.kerbIndex >= segments.length) {
        task.stage = 'props';
      }
      return false;
    }

    if (task.stage === 'props') {
      this.buildDistrictProps(task);
      task.stage = 'finalize';
      return false;
    }

    if (task.stage === 'finalize') {
      // 0. Batch static meshes (roads, buildings, trees, streetlights) per spatial chunk
      //    and material into BatchedMesh to stay well within draw-call budgets.
      const protectedGeos = new Set<THREE.BufferGeometry>();
      for (const col of task.roadColliders) {
        if (col instanceof THREE.Mesh && col.geometry) {
          protectedGeos.add(col.geometry);
        }
      }

      const batchedAll = this.batchStaticGroups(
        [...task.roadMeshes, ...task.buildingGroups, ...task.batchedPropGroups],
        protectedGeos
      );
      const mergedLines = this.mergeLineSegmentsPerChunk(task.roadLines);
      task.chunkObjects.push(...batchedAll, ...mergedLines);

      // 1. Commit objects to LodManager
      for (const item of task.chunkObjects) {
        this.lodManager.addObject(item.obj, item.x, item.z);
      }

      // 2. Commit colliders & descriptors
      this.colliders.push(...task.roadColliders, ...task.buildingColliders);
      this.staticBoxDescs.push(...task.staticBoxDescs);

      // 3. Register traffic signal visuals for live per-frame updates
      this.signalVisuals.push(...task.signalVisuals);
      this.districtSignalVisuals.set(task.districtId, task.signalVisuals);

      // 4. Save district state for unloading
      this.districtChunkObjects.set(task.districtId, task.chunkObjects);
      this.districtColliders.set(task.districtId, [
        ...task.roadColliders,
        ...task.buildingColliders,
      ]);
      this.districtPhysicsColliders.set(task.districtId, task.physicsColliders);
      this.districtStaticBoxDescs.set(task.districtId, task.staticBoxDescs);
      this.loadedDistricts.add(task.districtId);

      // 5. Hide low-poly silhouette now that full LOD is built
      const sil = this.silhouettes.get(task.districtId);
      if (sil) {
        sil.visible = false;
      }

      return true;
    }

    return true;
  }

  /**
   * Synchronously updates 3D traffic signal pole red/yellow/green emissive lenses
   * from SignalController. Zero heap allocations.
   */
  updateTrafficSignals(signals: SignalController): void {
    for (let i = 0; i < this.signalVisuals.length; i++) {
      const entry = this.signalVisuals[i]!;
      const phase = signals.getSignalStatus(entry.nodeId, entry.approachIndex);
      syncTrafficSignalVisual(entry, phase);
    }
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
   * Removes physics colliders, disposes Three.js non-shared meshes/geometries/materials,
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

    // 2. Unregister district traffic signals
    const sigs = this.districtSignalVisuals.get(districtId) ?? [];
    for (const s of sigs) {
      const idx = this.signalVisuals.indexOf(s);
      if (idx !== -1) this.signalVisuals.splice(idx, 1);
    }
    this.districtSignalVisuals.delete(districtId);

    // 3. Remove physics colliders
    if (this.physicsWorld) {
      const pCols = this.districtPhysicsColliders.get(districtId) ?? [];
      for (const col of pCols) {
        this.physicsWorld.removeCollider(col);
      }
    }
    this.districtPhysicsColliders.delete(districtId);

    // 4. Remove raycast colliders & dispose their private geometries
    const cols = this.districtColliders.get(districtId) ?? [];
    for (const c of cols) {
      const idx = this.colliders.indexOf(c);
      if (idx !== -1) {
        this.colliders.splice(idx, 1);
      }
      disposeHierarchy(c);
    }
    this.districtColliders.delete(districtId);

    // 5. Remove static box descs
    const descs = this.districtStaticBoxDescs.get(districtId) ?? [];
    for (const d of descs) {
      const idx = this.staticBoxDescs.indexOf(d);
      if (idx !== -1) {
        this.staticBoxDescs.splice(idx, 1);
      }
    }
    this.districtStaticBoxDescs.delete(districtId);

    // 6. Restore silhouette visibility
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

  private mergeLineSegmentsPerChunk(lines: PositionedObj[]): PositionedObj[] {
    if (lines.length === 0) return [];
    const chunkSize = this.lodManager.chunkSize;
    const buckets = new Map<
      string,
      { cx: number; cz: number; material: THREE.Material; verts: number[] }
    >();

    for (const entry of lines) {
      const lineObj = entry.obj;
      if (!(lineObj instanceof THREE.LineSegments)) continue;
      lineObj.updateMatrixWorld(true);
      const posAttr = lineObj.geometry.getAttribute('position');
      if (!posAttr) continue;

      const cx = Math.floor(entry.x / chunkSize);
      const cz = Math.floor(entry.z / chunkSize);
      const mat = Array.isArray(lineObj.material) ? lineObj.material[0]! : lineObj.material;
      const key = `${cx},${cz}|${mat.uuid}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          cx: (cx + 0.5) * chunkSize,
          cz: (cz + 0.5) * chunkSize,
          material: mat,
          verts: [],
        };
        buckets.set(key, bucket);
      }

      const v = new THREE.Vector3();
      for (let i = 0; i < posAttr.count; i++) {
        v.fromBufferAttribute(posAttr, i).applyMatrix4(lineObj.matrixWorld);
        bucket.verts.push(v.x, v.y, v.z);
      }
      if (!lineObj.geometry.userData?.shared) {
        lineObj.geometry.dispose();
      }
    }

    const result: PositionedObj[] = [];
    for (const bucket of buckets.values()) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(bucket.verts, 3));
      geo.computeBoundingSphere();
      const merged = new THREE.LineSegments(geo, bucket.material);
      result.push({ obj: merged, x: bucket.cx, z: bucket.cz });
    }
    return result;
  }

  private batchStaticGroups(
    entries: PositionedObj[],
    protectedGeos: Set<THREE.BufferGeometry> = new Set()
  ): PositionedObj[] {
    if (entries.length === 0) return [];
    const chunkSize = this.lodManager.chunkSize;
    const result: PositionedObj[] = [];

    type BatchItem = { geometry: THREE.BufferGeometry; matrix: THREE.Matrix4 };
    type Bucket = {
      chunkX: number;
      chunkZ: number;
      material: THREE.Material;
      castShadow: boolean;
      receiveShadow: boolean;
      items: BatchItem[];
      vertexCount: number;
      indexCount: number;
    };
    const buckets = new Map<string, Bucket>();

    for (const entry of entries) {
      entry.obj.updateMatrixWorld(true);
      const cx = Math.floor(entry.x / chunkSize);
      const cz = Math.floor(entry.z / chunkSize);
      const chunkCenterX = (cx + 0.5) * chunkSize;
      const chunkCenterZ = (cz + 0.5) * chunkSize;

      entry.obj.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const mat = child.material;
        if (Array.isArray(mat)) {
          const worldClone = child.clone();
          worldClone.applyMatrix4(child.matrixWorld);
          result.push({ obj: worldClone, x: entry.x, z: entry.z });
          return;
        }
        const geo = child.geometry;
        const posAttr = geo.getAttribute('position');
        if (!posAttr) return;

        const hasIndex = geo.index !== null;
        const hasColor = geo.getAttribute('color') !== undefined ? 1 : 0;
        const hasUv = geo.getAttribute('uv') !== undefined ? 1 : 0;
        const key = `${cx},${cz}|${mat.uuid}|${hasIndex ? 1 : 0}|${hasColor}|${hasUv}|${child.castShadow ? 1 : 0}|${child.receiveShadow ? 1 : 0}`;
        let bucket = buckets.get(key);
        if (!bucket) {
          bucket = {
            chunkX: chunkCenterX,
            chunkZ: chunkCenterZ,
            material: mat,
            castShadow: child.castShadow,
            receiveShadow: child.receiveShadow,
            items: [],
            vertexCount: 0,
            indexCount: 0,
          };
          buckets.set(key, bucket);
        }
        bucket.items.push({ geometry: geo, matrix: child.matrixWorld.clone() });
        bucket.vertexCount += posAttr.count;
        bucket.indexCount += geo.index ? geo.index.count : posAttr.count;
      });
    }

    for (const bucket of buckets.values()) {
      const batched = new THREE.BatchedMesh(
        bucket.items.length,
        bucket.vertexCount,
        Math.max(bucket.indexCount, bucket.vertexCount),
        bucket.material
      );
      batched.castShadow = bucket.castShadow;
      batched.receiveShadow = bucket.receiveShadow;

      const geoIdMap = new Map<string, number>();
      for (const item of bucket.items) {
        let geoId = geoIdMap.get(item.geometry.uuid);
        if (geoId === undefined) {
          geoId = batched.addGeometry(item.geometry);
          geoIdMap.set(item.geometry.uuid, geoId);
        }
        const instId = batched.addInstance(geoId);
        batched.setMatrixAt(instId, item.matrix);
      }

      for (const item of bucket.items) {
        if (!item.geometry.userData?.shared && !protectedGeos.has(item.geometry)) {
          item.geometry.dispose();
        }
      }

      batched.computeBoundingSphere();
      result.push({ obj: batched, x: bucket.chunkX, z: bucket.chunkZ });
    }

    return result;
  }
}
