import * as THREE from 'three';
import type { DistrictData, BuildingLot } from '../sim/schemas';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { SignageAtlas } from './signage';
import { RoadMeshBuilder, getRoadWidth } from './roadMesh';
import { BuildingBuilder } from './buildings';
import { LodManager } from './lod';

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

export class CityBuilder {
  readonly signageAtlas: SignageAtlas;
  readonly roadBuilder: RoadMeshBuilder;
  readonly buildingBuilder: BuildingBuilder;
  readonly lodManager: LodManager;
  readonly root: THREE.Group;
  readonly colliders: THREE.Object3D[] = [];
  readonly staticBoxDescs: StaticBoxDesc[] = [];

  constructor(opts: CityBuilderOptions = {}) {
    this.signageAtlas = opts.signageAtlas ?? new SignageAtlas();
    this.roadBuilder = new RoadMeshBuilder();
    this.buildingBuilder = new BuildingBuilder(this.signageAtlas);
    this.lodManager = new LodManager(opts.chunkSize ?? 100);

    this.root = new THREE.Group();
    this.root.name = 'city_builder_root';
    this.root.add(this.lodManager.root);
  }

  buildDistrict(district: DistrictData, physicsWorld?: PhysicsWorld): void {
    // 1. Build road ribbons and crossings
    const roadResult = this.roadBuilder.build(district);
    this.colliders.push(...roadResult.colliders);

    // Distribute road mesh elements into spatial chunks
    const nodeMap = new Map(district.nodes.map((n) => [n.nodeId, n]));
    for (const child of roadResult.group.children) {
      this.lodManager.addObject(child, child.position.x, child.position.z);
    }

    // 2. Build buildings on lots
    const lots = district.lots ?? [];
    const buildingResult = this.buildingBuilder.build(lots);
    this.colliders.push(...buildingResult.colliders);

    // Place building groups into spatial chunks
    for (const bGroup of buildingResult.group.children) {
      this.lodManager.addObject(bGroup, bGroup.position.x, bGroup.position.z);
    }

    // 3. Register static physics colliders for building footprints
    for (let i = 0; i < lots.length; i++) {
      const lot: BuildingLot = lots[i]!;
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
      this.staticBoxDescs.push(desc);

      if (physicsWorld) {
        physicsWorld.addStaticBox(
          desc.x,
          desc.y,
          desc.z,
          desc.halfX,
          desc.halfY,
          desc.halfZ,
          desc.yaw
        );
      }
    }

    // 4. Register kerb colliders in physics if physicsWorld present
    if (physicsWorld) {
      for (const seg of district.segments) {
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
        physicsWorld.addStaticBox(
          midX - nx * (width / 2 + kerbW / 2),
          kerbH / 2,
          midZ - nz * (width / 2 + kerbW / 2),
          kerbW / 2,
          kerbH / 2,
          len / 2,
          rotY
        );

        // Right kerb
        physicsWorld.addStaticBox(
          midX + nx * (width / 2 + kerbW / 2),
          kerbH / 2,
          midZ + nz * (width / 2 + kerbW / 2),
          kerbW / 2,
          kerbH / 2,
          len / 2,
          rotY
        );

        // Median
        if (seg.divided) {
          physicsWorld.addStaticBox(
            midX,
            0.11,
            midZ,
            0.45,
            0.11,
            len / 2,
            rotY
          );
        }
      }
    }
  }

  update(cameraPos: { x: number; z: number }, maxDistance = 250): void {
    this.lodManager.update(cameraPos, maxDistance);
  }
}
