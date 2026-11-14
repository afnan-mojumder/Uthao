import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RoadSegment, RoadNode } from '../core/types';
import type { DistrictData } from '../sim/schemas';
import { getAsphaltTexture, getSidewalkTexture } from './textures';

export interface RoadBuildResult {
  group: THREE.Group;
  colliders: THREE.Object3D[];
  zebraCount: number;
  segmentCount: number;
}

export function kerbEndTrim(
  seg: RoadSegment,
  atStart: boolean,
  segments: readonly RoadSegment[],
  nodeMap: ReadonlyMap<string, { x: number; z: number }>
): number {
  const nodeId = atStart ? seg.startNodeId : seg.endNodeId;
  const otherId = atStart ? seg.endNodeId : seg.startNodeId;
  const here = nodeMap.get(nodeId);
  const far = nodeMap.get(otherId);
  if (!here || !far) return 0;
  const ax = far.x - here.x;
  const az = far.z - here.z;
  const aLen = Math.hypot(ax, az);
  if (aLen < 0.1) return 0;
  let trim = 0;
  for (const o of segments) {
    if (o === seg) continue;
    const oFarId =
      o.startNodeId === nodeId ? o.endNodeId : o.endNodeId === nodeId ? o.startNodeId : null;
    const oFar = oFarId ? nodeMap.get(oFarId) : undefined;
    if (!oFar) continue;
    const bx = oFar.x - here.x;
    const bz = oFar.z - here.z;
    const bLen = Math.hypot(bx, bz);
    if (bLen < 0.1) continue;
    const sin = Math.abs(ax * bz - az * bx) / (aLen * bLen);
    if (sin < 0.2) continue; // (near-)collinear continuation, kerb carries on
    trim = Math.max(trim, getRoadWidth(o) / 2 / Math.max(sin, 0.3));
  }
  return Math.min(trim, aLen / 2 - 0.05);
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

/**
 * A mesh for world-space merged geometry, moved so its position is the
 * geometry's centre. CityBuilder bins road children into LOD chunks by
 * position; at the origin they were hidden everywhere else.
 */
function placedMesh(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
  geo.computeBoundingBox();
  const c = geo.boundingBox!.getCenter(new THREE.Vector3());
  geo.translate(-c.x, 0, -c.z);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(c.x, 0, c.z);
  return mesh;
}

export class RoadMeshBuilder {
  private roadMat: THREE.MeshStandardMaterial;
  private kerbMat: THREE.MeshStandardMaterial;
  private sidewalkMat: THREE.MeshStandardMaterial;
  private medianMat: THREE.MeshStandardMaterial;
  private markingMat: THREE.MeshBasicMaterial;
  private zebraMat: THREE.MeshBasicMaterial;
  private puddleMat: THREE.MeshStandardMaterial;
  private bumpMat: THREE.MeshStandardMaterial;
  private poleMat: THREE.MeshStandardMaterial;
  private wireMat: THREE.LineBasicMaterial;

  constructor() {
    const asphaltTex = getAsphaltTexture();
    this.roadMat = new THREE.MeshStandardMaterial({
      color: asphaltTex ? 0xd8dce0 : 0x262a2e, // Weathered Dhaka asphalt
      ...(asphaltTex ? { map: asphaltTex } : {}),
      roughness: 0.85,
      metalness: 0.05,
    });

    this.kerbMat = new THREE.MeshStandardMaterial({
      color: 0x8a8a8a, // Concrete kerb grey
      roughness: 0.9,
    });

    const sidewalkTex = getSidewalkTexture();
    this.sidewalkMat = new THREE.MeshStandardMaterial({
      color: sidewalkTex ? 0xffffff : 0x7c7870,
      ...(sidewalkTex ? { map: sidewalkTex } : {}),
      roughness: 0.92,
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

    this.poleMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.7,
      metalness: 0.4,
    });

    this.wireMat = new THREE.LineBasicMaterial({
      color: 0x1e293b,
      transparent: true,
      opacity: 0.75,
    });
  }

  /** Adjusts asphalt roughness/metalness for monsoon wetness (0 = dry, 1 = soaked). */
  setWetness(wet01: number): void {
    const w = Math.max(0, Math.min(1, wet01));
    this.roadMat.roughness = 0.85 - w * 0.67;
    this.roadMat.metalness = 0.05 + w * 0.25;
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
      // Plane is laid flat (x -90°) after this z turn, so +rotY lines it up with the
      // street: the z turn had the wrong sign and mirrored the strip on diagonals.
      roadMesh.rotation.z = rotY;
      roadMesh.position.set(midX, 0.02, midZ);
      roadMesh.receiveShadow = true;
      group.add(roadMesh);

      // Kerbs along left and right edges, trimmed at junctions so they don't cut across intersections
      const kerbHeight = 0.18;
      const kerbWidth = 0.28;
      const startTrim = kerbEndTrim(seg, true, district.segments, nodeMap);
      const endTrim = kerbEndTrim(seg, false, district.segments, nodeMap);
      const kerbLen = len - startTrim - endTrim;

      if (kerbLen > 0.2) {
        const kerbShift = (startTrim - endTrim) / 2;
        const kMidX = midX + (dx / len) * kerbShift;
        const kMidZ = midZ + (dz / len) * kerbShift;
        const kerbGeo = new THREE.BoxGeometry(kerbWidth, kerbHeight, kerbLen);

        // Left kerb
        const leftKerb = new THREE.Mesh(kerbGeo, this.kerbMat);
        leftKerb.position.set(
          kMidX - (nx * (width / 2 + kerbWidth / 2)),
          kerbHeight / 2,
          kMidZ - (nz * (width / 2 + kerbWidth / 2))
        );
        leftKerb.rotation.y = rotY;
        leftKerb.receiveShadow = true;
        leftKerb.castShadow = true;
        group.add(leftKerb);
        colliders.push(leftKerb);

        // Right kerb
        const rightKerb = new THREE.Mesh(kerbGeo, this.kerbMat);
        rightKerb.position.set(
          kMidX + (nx * (width / 2 + kerbWidth / 2)),
          kerbHeight / 2,
          kMidZ + (nz * (width / 2 + kerbWidth / 2))
        );
        rightKerb.rotation.y = rotY;
        rightKerb.receiveShadow = true;
        rightKerb.castShadow = true;
        group.add(rightKerb);
        colliders.push(rightKerb);

        // Sidewalks & overhead Dhaka utility poles/wires on main/residential/market streets
        if (seg.roadType !== 'alley' && seg.roadType !== 'flyover') {
          const swWidth = 1.6;
          const swHeight = 0.12;
          const swGeo = new THREE.BoxGeometry(swWidth, swHeight, kerbLen);
          const swOffset = width / 2 + kerbWidth + swWidth / 2;

          const leftSw = new THREE.Mesh(swGeo, this.sidewalkMat);
          leftSw.position.set(kMidX - nx * swOffset, swHeight / 2, kMidZ - nz * swOffset);
          leftSw.rotation.y = rotY;
          leftSw.receiveShadow = true;
          group.add(leftSw);

          const rightSw = new THREE.Mesh(swGeo, this.sidewalkMat);
          rightSw.position.set(kMidX + nx * swOffset, swHeight / 2, kMidZ + nz * swOffset);
          rightSw.rotation.y = rotY;
          rightSw.receiveShadow = true;
          group.add(rightSw);

          if ((seg.roadType === 'main' || seg.roadType === 'market') && kerbLen > 24) {
            const poleSpacing = 32;
            const numPoles = Math.floor(kerbLen / poleSpacing);
            if (numPoles >= 2) {
              const poleH = 6.2;
              const poleGeo = new THREE.CylinderGeometry(0.08, 0.11, poleH, 6);
              const poleGeos: THREE.BufferGeometry[] = [];
              const wireVerts: number[] = [];
              const dirX = dx / len;
              const dirZ = dz / len;
              const poleLateral = width / 2 + kerbWidth + 0.35;

              let prevX = 0;
              let prevZ = 0;
              for (let p = 0; p < numPoles; p++) {
                const along = -kerbLen / 2 + (p + 0.5) * (kerbLen / numPoles);
                const px = kMidX - nx * poleLateral + dirX * along;
                const pz = kMidZ - nz * poleLateral + dirZ * along;
                const g = poleGeo.clone();
                g.translate(px, poleH / 2, pz);
                poleGeos.push(g);

                if (p > 0) {
                  // Two sagging overhead wires between adjacent poles
                  const midWX = (prevX + px) / 2;
                  const midWZ = (prevZ + pz) / 2;
                  for (const hOff of [5.4, 5.85]) {
                    wireVerts.push(prevX, hOff, prevZ, midWX, hOff - 0.35, midWZ);
                    wireVerts.push(midWX, hOff - 0.35, midWZ, px, hOff, pz);
                  }
                }
                prevX = px;
                prevZ = pz;
              }
              const mergedPoles = mergeGeometries(poleGeos, false);
              if (mergedPoles) {
                group.add(placedMesh(mergedPoles, this.poleMat));
              }
              if (wireVerts.length > 0) {
                const wireGeo = new THREE.BufferGeometry();
                wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wireVerts, 3));
                wireGeo.computeBoundingBox();
                const c = wireGeo.boundingBox!.getCenter(new THREE.Vector3());
                wireGeo.translate(-c.x, 0, -c.z);
                const wireLines = new THREE.LineSegments(wireGeo, this.wireMat);
                wireLines.position.set(c.x, 0, c.z);
                group.add(wireLines);
              }
            }
          }
        }
      }

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
            group.add(placedMesh(mergedDashes, this.markingMat));
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
            group.add(placedMesh(mergedPuddles, this.puddleMat));
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
          group.add(placedMesh(mergedZebra, this.zebraMat));
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
