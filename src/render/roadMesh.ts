import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RoadSegment, RoadNode } from '../core/types';
import type { DistrictData } from '../sim/schemas';

export interface RoadBuildResult {
  group: THREE.Group;
  colliders: THREE.Object3D[];
  zebraCount: number;
  segmentCount: number;
}

export function getRoadWidth(segment: RoadSegment): number {
  if (segment.divided) return 14.0;
  switch (segment.roadType) {
    case 'flyover':
      return 12.0;
    case 'main':
      return 10.0;
    case 'residential':
    case 'service':
      return 8.0;
    case 'market':
      return 6.0;
    case 'alley':
      return 4.0;
    default:
      return 7.0;
  }
}

export class RoadMeshBuilder {
  private roadMat: THREE.MeshStandardMaterial;
  private kerbMat: THREE.MeshStandardMaterial;
  private medianMat: THREE.MeshStandardMaterial;
  private markingMat: THREE.MeshBasicMaterial;
  private zebraMat: THREE.MeshBasicMaterial;
  private puddleMat: THREE.MeshStandardMaterial;
  private bumpMat: THREE.MeshStandardMaterial;

  constructor() {
    this.roadMat = new THREE.MeshStandardMaterial({
      color: 0x1e2124, // Dhaka dark weathered asphalt
      roughness: 0.85,
      metalness: 0.05,
    });

    this.kerbMat = new THREE.MeshStandardMaterial({
      color: 0x8a8a8a, // Concrete kerb grey
      roughness: 0.9,
    });

    this.medianMat = new THREE.MeshStandardMaterial({
      color: 0x555555, // Raised median concrete
      roughness: 0.8,
    });

    this.markingMat = new THREE.MeshBasicMaterial({
      color: 0xf5f5f5, // Road white line
    });

    this.zebraMat = new THREE.MeshBasicMaterial({
      color: 0xffffff, // Zebra crossing white
    });

    this.puddleMat = new THREE.MeshStandardMaterial({
      color: 0x11161a,
      roughness: 0.15,
      metalness: 0.3,
    });

    this.bumpMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // Amber/yellow speed bump
      roughness: 0.7,
    });
  }

  build(district: DistrictData): RoadBuildResult {
    const group = new THREE.Group();
    group.name = `district_roads_${district.districtId}`;
    const colliders: THREE.Object3D[] = [];

    const nodeMap = new Map<string, RoadNode>();
    for (const node of district.nodes) {
      nodeMap.set(node.nodeId, node);
    }

    let zebraCount = 0;
    const crossingNodes = new Set<string>();

    for (const node of district.nodes) {
      if (
        node.kind === 'junction' &&
        node.tags &&
        node.tags.includes('crossing')
      ) {
        crossingNodes.add(node.nodeId);
      }
    }

    // 1. Build road ribbons, kerbs, markings, medians for each segment
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

      const midX = (sNode.x + eNode.x) / 2;
      const midZ = (sNode.z + eNode.z) / 2;
      const rotY = Math.atan2(dx, dz);

      // Road plane
      const roadGeo = new THREE.PlaneGeometry(width, len);
      const roadMesh = new THREE.Mesh(roadGeo, this.roadMat);
      roadMesh.rotation.x = -Math.PI / 2;
      roadMesh.rotation.z = -rotY;
      roadMesh.position.set(midX, 0.02, midZ);
      roadMesh.receiveShadow = true;
      group.add(roadMesh);

      // Kerbs along left and right edges
      const kerbHeight = 0.18;
      const kerbWidth = 0.28;
      const kerbGeo = new THREE.BoxGeometry(kerbWidth, kerbHeight, len);

      // Left kerb
      const leftKerb = new THREE.Mesh(kerbGeo, this.kerbMat);
      leftKerb.position.set(
        midX - (nx * (width / 2 + kerbWidth / 2)),
        kerbHeight / 2,
        midZ - (nz * (width / 2 + kerbWidth / 2))
      );
      leftKerb.rotation.y = rotY;
      leftKerb.receiveShadow = true;
      leftKerb.castShadow = true;
      group.add(leftKerb);
      colliders.push(leftKerb);

      // Right kerb
      const rightKerb = new THREE.Mesh(kerbGeo, this.kerbMat);
      rightKerb.position.set(
        midX + (nx * (width / 2 + kerbWidth / 2)),
        kerbHeight / 2,
        midZ + (nz * (width / 2 + kerbWidth / 2))
      );
      rightKerb.rotation.y = rotY;
      rightKerb.receiveShadow = true;
      rightKerb.castShadow = true;
      group.add(rightKerb);
      colliders.push(rightKerb);

      // Raised median on divided roads
      if (seg.divided) {
        const medianW = 0.9;
        const medianH = 0.22;
        const medianGeo = new THREE.BoxGeometry(medianW, medianH, len);
        const median = new THREE.Mesh(medianGeo, this.medianMat);
        median.position.set(midX, medianH / 2, midZ);
        median.rotation.y = rotY;
        median.castShadow = true;
        median.receiveShadow = true;
        group.add(median);
        colliders.push(median);
      } else {
        // Dashed white centerline markings
        const dashLen = 2.5;
        const gapLen = 2.5;
        const step = dashLen + gapLen;
        const numDashes = Math.floor(len / step);
        const dashGeos: THREE.BufferGeometry[] = [];

        for (let i = 0; i < numDashes; i++) {
          const dashProgress = (i * step + dashLen / 2) / len - 0.5;
          const dashX = midX + dx * dashProgress;
          const dashZ = midZ + dz * dashProgress;

          const dashGeo = new THREE.PlaneGeometry(0.16, dashLen);
          dashGeo.rotateX(-Math.PI / 2);
          dashGeo.rotateY(rotY);
          dashGeo.translate(dashX, 0.03, dashZ);
          dashGeos.push(dashGeo);
        }

        if (dashGeos.length > 0) {
          const mergedDashes = mergeGeometries(dashGeos, false);
          if (mergedDashes) {
            group.add(new THREE.Mesh(mergedDashes, this.markingMat));
          }
        }
      }

      // Potholes / puddle decals by surfaceCondition
      if (seg.surfaceCondition < 0.9) {
        const count = Math.min(4, Math.floor((1.0 - seg.surfaceCondition) * 8) + 1);
        const puddleGeos: THREE.BufferGeometry[] = [];
        for (let p = 0; p < count; p++) {
          const t = 0.2 + (p * 0.6) / count;
          const px = sNode.x + dx * t + (nx * (p % 2 === 0 ? 1 : -1) * width * 0.2);
          const pz = sNode.z + dz * t + (nz * (p % 2 === 0 ? 1 : -1) * width * 0.2);
          const puddleW = 1.2 + (p * 0.3);
          const puddleH = 0.8 + (p * 0.2);
          const puddleGeo = new THREE.PlaneGeometry(puddleW, puddleH);
          puddleGeo.rotateX(-Math.PI / 2);
          puddleGeo.translate(px, 0.025, pz);
          puddleGeos.push(puddleGeo);
        }
        if (puddleGeos.length > 0) {
          const mergedPuddles = mergeGeometries(puddleGeos, false);
          if (mergedPuddles) {
            group.add(new THREE.Mesh(mergedPuddles, this.puddleMat));
          }
        }
      }

      // Speed bump
      if (seg.tags && (seg.tags.includes('speed_bump') || seg.tags.includes('school'))) {
        const bumpW = width * 0.9;
        const bumpGeo = new THREE.CylinderGeometry(0.5, 0.5, bumpW, 8);
        const bump = new THREE.Mesh(bumpGeo, this.bumpMat);
        bump.rotation.z = Math.PI / 2;
        bump.rotation.y = rotY;
        bump.scale.set(1.0, 0.2, 1.0);
        bump.position.set(midX, 0.05, midZ);
        group.add(bump);
      }
    }

    // 2. Build Zebra Crossings at crossing nodes
    for (const nodeId of crossingNodes) {
      const node = nodeMap.get(nodeId);
      if (!node) continue;

      const stripes = 6;
      const stripeW = 0.5;
      const stripeL = 3.2;
      const gap = 0.35;
      const totalCrossingWidth = stripes * stripeW + (stripes - 1) * gap;
      const stripeGeos: THREE.BufferGeometry[] = [];

      for (let s = 0; s < stripes; s++) {
        const offset = -totalCrossingWidth / 2 + s * (stripeW + gap) + stripeW / 2;
        const zebraGeo = new THREE.PlaneGeometry(stripeW, stripeL);
        zebraGeo.rotateX(-Math.PI / 2);
        zebraGeo.translate(node.x + offset, 0.035, node.z);
        stripeGeos.push(zebraGeo);
      }

      if (stripeGeos.length > 0) {
        const mergedZebra = mergeGeometries(stripeGeos, false);
        if (mergedZebra) {
          group.add(new THREE.Mesh(mergedZebra, this.zebraMat));
        }
      }
      zebraCount++;
    }

    return {
      group,
      colliders,
      zebraCount,
      segmentCount: district.segments.length,
    };
  }
}
