import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { RoadSegment, RoadNode } from '../core/types';
import type { DistrictData } from '../sim/schemas';
import {
  getAsphaltTexture,
  getSidewalkTexture,
  scalePlaneUvs,
  scaleBoxUvs,
  scaleDiskUvs,
  ASPHALT_TILE_M,
  SIDEWALK_TILE_M,
} from './textures';

export interface RoadBuildResult {
  group: THREE.Group;
  colliders: THREE.Object3D[];
  zebraCount: number;
  segmentCount: number;
}

export type RoadNodeLike = { x: number; y?: number; z: number };

function computeKerbSideTrim(
  seg: RoadSegment,
  atStart: boolean,
  side: -1 | 1,
  segments: readonly RoadSegment[],
  nodeMap: ReadonlyMap<string, RoadNodeLike>
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

  const sNode = nodeMap.get(seg.startNodeId);
  const eNode = nodeMap.get(seg.endNodeId);
  if (!sNode || !eNode) return 0;
  const sdx = eNode.x - sNode.x;
  const sdz = eNode.z - sNode.z;
  const sLen = Math.hypot(sdx, sdz);
  if (sLen < 0.1) return 0;

  // Segment's fixed lateral unit vector: left (-1) = -n, right (+1) = +n
  const nx = -sdz / sLen;
  const nz = sdx / sLen;
  const sideX = side * nx;
  const sideZ = side * nz;
  const hereY = here.y ?? 0;
  const farY = far.y ?? 0;

  let hasContinuation = false;
  for (const c of segments) {
    if (c === seg) continue;
    const cFarId =
      c.startNodeId === nodeId ? c.endNodeId : c.endNodeId === nodeId ? c.startNodeId : null;
    const cFar = cFarId ? nodeMap.get(cFarId) : undefined;
    if (!cFar) continue;
    const cx = cFar.x - here.x;
    const cz = cFar.z - here.z;
    const cLen = Math.hypot(cx, cz);
    if (cLen < 0.1) continue;
    const dot = (ax * cx + az * cz) / (aLen * cLen);
    if (dot < -0.9) {
      hasContinuation = true;
      break;
    }
  }

  let trim = 0;
  for (const o of segments) {
    if (o === seg) continue;
    const oFarId =
      o.startNodeId === nodeId ? o.endNodeId : o.endNodeId === nodeId ? o.startNodeId : null;
    const oFar = oFarId ? nodeMap.get(oFarId) : undefined;
    if (!oFar) continue;

    // Ground segments should not trim against elevated flyover spans
    const oFarY = oFar.y ?? 0;
    if (Math.abs(oFarY - hereY) > 2.5 && Math.abs(farY - hereY) <= 0.5) continue;

    const bx = oFar.x - here.x;
    const bz = oFar.z - here.z;
    const bLen = Math.hypot(bx, bz);
    if (bLen < 0.1) continue;

    const sin = Math.abs(ax * bz - az * bx) / (aLen * bLen);
    if (sin < 0.2) continue; // (near-)collinear continuation, kerb carries on

    const dotSide = (bx * sideX + bz * sideZ) / bLen;
    const dotForward = (ax * bx + az * bz) / (aLen * bLen);
    if (dotSide > 0.2 || (!hasContinuation && dotForward > 0.35)) {
      trim = Math.max(trim, getRoadWidth(o) / 2 / Math.max(sin, 0.3));
    }
  }

  return Math.min(trim, aLen / 2 - 0.05);
}

export function kerbEndTrim(
  seg: RoadSegment,
  atStart: boolean,
  segments: readonly RoadSegment[],
  nodeMap: ReadonlyMap<string, RoadNodeLike>,
  side?: -1 | 1
): number {
  if (side === -1 || side === 1) {
    return computeKerbSideTrim(seg, atStart, side, segments, nodeMap);
  }
  return Math.max(
    computeKerbSideTrim(seg, atStart, -1, segments, nodeMap),
    computeKerbSideTrim(seg, atStart, 1, segments, nodeMap)
  );
}

import { getRoadWidth } from '../sim/road/RoadNetwork';
export { getRoadWidth };

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

function pointToSegmentDistanceXZ(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

function sharedMat<T extends THREE.Material>(mat: T): T {
  mat.userData.shared = true;
  return mat;
}

function applyVertexColor(geo: THREE.BufferGeometry, colorHex: number): void {
  const pos = geo.getAttribute('position');
  if (!pos) return;
  const c = new THREE.Color(colorHex);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export interface RoadSliceContext {
  segments: readonly RoadSegment[];
  nodeMap: ReadonlyMap<string, RoadNode>;
  trimContextSegments: readonly RoadSegment[];
  crossingNodes: Set<string>;
  nodeIncidents: Map<string, RoadSegment[]>;
  groundSegments: { ax: number; az: number; bx: number; bz: number; halfW: number }[];
  builtFlyoverPairs: Set<string>;
  placedPillarPositions: { x: number; z: number }[];
  patchesBuilt: boolean;
  zebrasBuilt: boolean;
  segmentIndex: number;
  zebraCount: number;
}

export class RoadMeshBuilder {
  private roadMat: THREE.MeshStandardMaterial;
  private roadTrimMat: THREE.MeshStandardMaterial;
  private sidewalkMat: THREE.MeshStandardMaterial;
  private markingMat: THREE.MeshBasicMaterial;
  private puddleMat: THREE.MeshStandardMaterial;
  private wireMat: THREE.LineBasicMaterial;

  constructor() {
    const asphaltTex = getAsphaltTexture();
    this.roadMat = sharedMat(
      new THREE.MeshStandardMaterial({
        color: asphaltTex ? 0xd8dce0 : 0x262a2e, // Weathered Dhaka asphalt
        ...(asphaltTex ? { map: asphaltTex } : {}),
        roughness: 0.85,
        metalness: 0.05,
      })
    );

    this.roadTrimMat = sharedMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.85,
        metalness: 0.1,
      })
    );

    const sidewalkTex = getSidewalkTexture();
    this.sidewalkMat = sharedMat(
      new THREE.MeshStandardMaterial({
        color: sidewalkTex ? 0xffffff : 0x7c7870,
        ...(sidewalkTex ? { map: sidewalkTex } : {}),
        roughness: 0.92,
      })
    );

    this.markingMat = sharedMat(
      new THREE.MeshBasicMaterial({
        color: 0xf5f5f5, // Road white line & zebra crossing
      })
    );

    this.puddleMat = sharedMat(
      new THREE.MeshStandardMaterial({
        color: 0x11161a,
        roughness: 0.15,
        metalness: 0.3,
      })
    );

    this.wireMat = sharedMat(
      new THREE.LineBasicMaterial({
        color: 0x1e293b,
        transparent: true,
        opacity: 0.75,
      })
    );
  }

  dispose(): void {
    this.roadMat.dispose();
    this.roadTrimMat.dispose();
    this.sidewalkMat.dispose();
    this.markingMat.dispose();
    this.puddleMat.dispose();
    this.wireMat.dispose();
  }

  /** Adjusts asphalt roughness/metalness for monsoon wetness (0 = dry, 1 = soaked). */
  setWetness(wet01: number): void {
    const w = Math.max(0, Math.min(1, wet01));
    this.roadMat.roughness = 0.85 - w * 0.58;
    this.roadMat.metalness = 0.05 + w * 0.06;
  }

  build(district: DistrictData): RoadBuildResult {
    const nodeMap = new Map<string, RoadNode>();
    for (const node of district.nodes) {
      nodeMap.set(node.nodeId, node);
    }
    return this.buildSegments(
      district.segments,
      nodeMap,
      district.districtId,
      district.segments
    );
  }

  createSliceContext(
    segments: readonly RoadSegment[],
    nodeMap: ReadonlyMap<string, RoadNode>,
    trimContextSegments: readonly RoadSegment[] = segments
  ): RoadSliceContext {
    const crossingNodes = new Set<string>();
    const nodeIncidents = new Map<string, RoadSegment[]>();

    for (const seg of segments) {
      if (!nodeMap.has(seg.startNodeId) || !nodeMap.has(seg.endNodeId)) continue;
      let startList = nodeIncidents.get(seg.startNodeId);
      if (!startList) {
        startList = [];
        nodeIncidents.set(seg.startNodeId, startList);
      }
      startList.push(seg);

      let endList = nodeIncidents.get(seg.endNodeId);
      if (!endList) {
        endList = [];
        nodeIncidents.set(seg.endNodeId, endList);
      }
      endList.push(seg);
    }

    for (const [nodeId] of nodeIncidents) {
      const node = nodeMap.get(nodeId);
      if (
        node &&
        node.kind === 'junction' &&
        node.tags &&
        node.tags.includes('crossing')
      ) {
        crossingNodes.add(node.nodeId);
      }
    }

    // Collect ground-level segments for flyover pillar clearance checks
    const groundSegments: { ax: number; az: number; bx: number; bz: number; halfW: number }[] = [];
    for (const seg of trimContextSegments) {
      const a = nodeMap.get(seg.startNodeId);
      const b = nodeMap.get(seg.endNodeId);
      if (!a || !b) continue;
      if ((a.y ?? 0) < 0.5 && (b.y ?? 0) < 0.5) {
        groundSegments.push({
          ax: a.x,
          az: a.z,
          bx: b.x,
          bz: b.z,
          halfW: getRoadWidth(seg) / 2,
        });
      }
    }

    return {
      segments,
      nodeMap,
      trimContextSegments,
      crossingNodes,
      nodeIncidents,
      groundSegments,
      builtFlyoverPairs: new Set<string>(),
      placedPillarPositions: [],
      patchesBuilt: false,
      zebrasBuilt: false,
      segmentIndex: 0,
      zebraCount: 0,
    };
  }

  /**
   * Builds a single time-sliced batch of road geometry into `outObjects` and `colliders`.
   * Returns `true` when all junction patches, segments, and zebra crossings are complete.
   */
  stepSlice(
    ctx: RoadSliceContext,
    batchSize: number,
    outObjects: THREE.Object3D[],
    colliders: THREE.Object3D[]
  ): boolean {
    if (!ctx.patchesBuilt) {
      ctx.patchesBuilt = true;
      this.buildJunctionPatches(ctx, outObjects);
    }

    const end = Math.min(ctx.segments.length, ctx.segmentIndex + batchSize);
    for (let i = ctx.segmentIndex; i < end; i++) {
      this.buildSingleSegment(ctx, ctx.segments[i]!, outObjects, colliders);
    }
    ctx.segmentIndex = end;

    if (ctx.segmentIndex >= ctx.segments.length && !ctx.zebrasBuilt) {
      ctx.zebrasBuilt = true;
      this.buildZebraCrossings(ctx, outObjects);
      return true;
    }

    return ctx.zebrasBuilt;
  }

  /**
   * Builds road geometry for an arbitrary list of segments (such as a district or
   * world border connectors) using `trimContextSegments` to trim kerbs cleanly at junctions.
   */
  buildSegments(
    segments: readonly RoadSegment[],
    nodeMap: ReadonlyMap<string, RoadNode>,
    groupLabel = 'roads',
    trimContextSegments: readonly RoadSegment[] = segments
  ): RoadBuildResult {
    const group = new THREE.Group();
    group.name = `district_roads_${groupLabel}`;
    const colliders: THREE.Object3D[] = [];

    const ctx = this.createSliceContext(segments, nodeMap, trimContextSegments);
    const outObjects: THREE.Object3D[] = [];
    this.stepSlice(ctx, Math.max(segments.length, 1), outObjects, colliders);
    for (const obj of outObjects) {
      group.add(obj);
    }

    return {
      group,
      colliders,
      zebraCount: ctx.zebraCount,
      segmentCount: segments.length,
    };
  }

  private buildJunctionPatches(ctx: RoadSliceContext, outObjects: THREE.Object3D[]): void {
    // 1. Build junction asphalt patches at nodes (y = 0.015 below strips at 0.02)
    for (const [nodeId, incSegs] of ctx.nodeIncidents) {
      if (incSegs.length < 2) continue;
      const node = ctx.nodeMap.get(nodeId);
      if (!node) continue;
      const nodeY = node.y ?? 0;

      let maxW = 0;
      for (const s of incSegs) {
        maxW = Math.max(maxW, getRoadWidth(s));
      }
      const radius = maxW / 2 + 0.35;
      const patchGeo = new THREE.CircleGeometry(radius, 12);
      scaleDiskUvs(patchGeo, radius, ASPHALT_TILE_M, ASPHALT_TILE_M);
      patchGeo.rotateX(-Math.PI / 2);
      const patchMesh = new THREE.Mesh(patchGeo, this.roadMat);
      patchMesh.name = 'junction_patch';
      patchMesh.position.set(node.x, nodeY > 0.5 ? nodeY - 0.005 : nodeY + 0.015, node.z);
      patchMesh.castShadow = false;
      patchMesh.receiveShadow = true;
      outObjects.push(patchMesh);
    }
  }

  private buildSingleSegment(
    ctx: RoadSliceContext,
    seg: RoadSegment,
    outObjects: THREE.Object3D[],
    colliders: THREE.Object3D[]
  ): void {
    const sNode = ctx.nodeMap.get(seg.startNodeId);
    const eNode = ctx.nodeMap.get(seg.endNodeId);
    if (!sNode || !eNode) return;

    const dx = eNode.x - sNode.x;
    const dz = eNode.z - sNode.z;
    const horizLen = Math.hypot(dx, dz);
    if (horizLen < 0.1) return;

    const y1 = sNode.y ?? 0;
    const y2 = eNode.y ?? 0;
    const dy = y2 - y1;
    const len3d = Math.hypot(horizLen, dy);
    const isElevated = seg.roadType === 'flyover' || y1 > 0.1 || y2 > 0.1;

    // Deduplicate opposite one-way flyover deck segments occupying exact same span
    if (isElevated && Math.abs(dy) < 0.1) {
      const pairKey =
        seg.startNodeId < seg.endNodeId
          ? `${seg.startNodeId}|${seg.endNodeId}`
          : `${seg.endNodeId}|${seg.startNodeId}`;
      if (ctx.builtFlyoverPairs.has(pairKey)) return;
      ctx.builtFlyoverPairs.add(pairKey);
    }

    const nx = -dz / horizLen;
    const nz = dx / horizLen;
    const width = getRoadWidth(seg);

    const midX = (sNode.x + eNode.x) / 2;
    const midY = (y1 + y2) / 2;
    const midZ = (sNode.z + eNode.z) / 2;
    const rotY = Math.atan2(dx, dz);
    const pitch = -Math.atan2(dy, horizLen);

    // Road plane (PlaneGeometry lies in XY; YXZ rotation y=rotY, x=-PI/2 + pitch lays it along 3D span)
    const roadGeo = new THREE.PlaneGeometry(width, len3d);
    scalePlaneUvs(roadGeo, width, len3d, ASPHALT_TILE_M, ASPHALT_TILE_M);
    const roadMesh = new THREE.Mesh(roadGeo, this.roadMat);
    roadMesh.rotation.order = 'YXZ';
    roadMesh.rotation.y = rotY;
    roadMesh.rotation.x = -Math.PI / 2 + pitch;
    roadMesh.position.set(midX, midY + 0.02, midZ);
    roadMesh.castShadow = false;
    roadMesh.receiveShadow = true;
    outObjects.push(roadMesh);

    if (isElevated) {
      // Concrete box girder deck slab beneath elevated road / ramp
      const deckThickness = 0.7;
      const deckGeo = new THREE.BoxGeometry(width + 0.6, deckThickness, len3d);
      applyVertexColor(deckGeo, 0x767b82);
      const deckMesh = new THREE.Mesh(deckGeo, this.roadTrimMat);
      deckMesh.name = 'flyover_deck';
      deckMesh.rotation.order = 'YXZ';
      deckMesh.rotation.y = rotY;
      deckMesh.rotation.x = pitch;
      deckMesh.position.set(midX, midY - deckThickness / 2 - 0.01, midZ);
      deckMesh.castShadow = false;
      deckMesh.receiveShadow = true;
      outObjects.push(deckMesh);

      // Raised concrete safety parapets along left and right edges
      const barrierW = 0.28;
      const barrierH = 0.85;
      const barrierGeo = new THREE.BoxGeometry(barrierW, barrierH, len3d);
      applyVertexColor(barrierGeo, 0x8a8a8a);
      for (const side of [-1, 1] as const) {
        const barrier = new THREE.Mesh(barrierGeo, this.roadTrimMat);
        barrier.position.set(
          midX + side * nx * (width / 2 + barrierW / 2),
          midY + barrierH / 2,
          midZ + side * nz * (width / 2 + barrierW / 2)
        );
        barrier.rotation.order = 'YXZ';
        barrier.rotation.y = rotY;
        barrier.rotation.x = pitch;
        barrier.castShadow = false;
        barrier.receiveShadow = true;
        outObjects.push(barrier);
        colliders.push(barrier);
      }

      // Concrete support columns under elevated spans (deckY >= 2.0) clear of ground streets
      const numPillars = Math.max(1, Math.floor(horizLen / 40));
      for (let p = 0; p < numPillars; p++) {
        const t = (p + 0.5) / numPillars;
        const deckY = y1 + dy * t;
        if (deckY < 2.0) continue;
        const px = sNode.x + dx * t;
        const pz = sNode.z + dz * t;

        let blocked = false;
        for (const g of ctx.groundSegments) {
          if (pointToSegmentDistanceXZ(px, pz, g.ax, g.az, g.bx, g.bz) < g.halfW + 1.4) {
            blocked = true;
            break;
          }
        }
        if (!blocked) {
          for (const prev of ctx.placedPillarPositions) {
            if (Math.hypot(px - prev.x, pz - prev.z) < 8) {
              blocked = true;
              break;
            }
          }
        }
        if (blocked) continue;

        ctx.placedPillarPositions.push({ x: px, z: pz });
        const colH = Math.max(1.0, deckY - deckThickness);
        const colGeo = new THREE.CylinderGeometry(0.65, 0.78, colH, 10);
        colGeo.translate(0, colH / 2, 0);
        const capGeo = new THREE.BoxGeometry(width * 0.72, 0.65, 1.4);
        capGeo.translate(0, colH + 0.25, 0);
        const pillarGeo = mergeGeometries([colGeo, capGeo], false);
        colGeo.dispose();
        capGeo.dispose();
        if (pillarGeo) {
          applyVertexColor(pillarGeo, 0x767b82);
          const pillar = new THREE.Mesh(pillarGeo, this.roadTrimMat);
          pillar.name = 'flyover_pillar';
          pillar.position.set(px, 0, pz);
          pillar.rotation.y = rotY;
          pillar.castShadow = false;
          pillar.receiveShadow = true;
          outObjects.push(pillar);
          colliders.push(pillar);
        }
      }
    } else {
      // Asymmetric kerbs & sidewalks on ground segments (skip kerbLen <= 0.2)
      const kerbHeight = 0.18;
      const kerbWidth = 0.28;
      const dirX = dx / horizLen;
      const dirZ = dz / horizLen;

      for (const side of [-1, 1] as const) {
        const startTrim = kerbEndTrim(seg, true, ctx.trimContextSegments, ctx.nodeMap, side);
        const endTrim = kerbEndTrim(seg, false, ctx.trimContextSegments, ctx.nodeMap, side);
        const kerbLen = horizLen - startTrim - endTrim;
        if (kerbLen <= 0.2) continue;

        const kerbShift = (startTrim - endTrim) / 2;
        const kMidX = midX + dirX * kerbShift;
        const kMidZ = midZ + dirZ * kerbShift;

        const kerbGeo = new THREE.BoxGeometry(kerbWidth, kerbHeight, kerbLen);
        applyVertexColor(kerbGeo, 0x8a8a8a);
        const kerb = new THREE.Mesh(kerbGeo, this.roadTrimMat);
        kerb.position.set(
          kMidX + side * nx * (width / 2 + kerbWidth / 2),
          kerbHeight / 2,
          kMidZ + side * nz * (width / 2 + kerbWidth / 2)
        );
        kerb.rotation.y = rotY;
        kerb.castShadow = false;
        kerb.receiveShadow = true;
        outObjects.push(kerb);
        colliders.push(kerb);

        // Sidewalks & overhead Dhaka utility poles/wires on main/residential/market/service streets
        if (seg.roadType !== 'alley') {
          const swWidth = 1.6;
          const swHeight = 0.12;
          const swGeo = new THREE.BoxGeometry(swWidth, swHeight, kerbLen);
          scaleBoxUvs(swGeo, swWidth, swHeight, kerbLen, SIDEWALK_TILE_M, SIDEWALK_TILE_M);
          const swOffset = width / 2 + kerbWidth + swWidth / 2;

          const sw = new THREE.Mesh(swGeo, this.sidewalkMat);
          sw.position.set(
            kMidX + side * nx * swOffset,
            swHeight / 2,
            kMidZ + side * nz * swOffset
          );
          sw.rotation.y = rotY;
          sw.castShadow = false;
          sw.receiveShadow = true;
          outObjects.push(sw);

          // Place overhead utility poles + sagging wires along the left side (-1) of main/market roads
          if (
            side === -1 &&
            (seg.roadType === 'main' || seg.roadType === 'market') &&
            kerbLen > 24
          ) {
            const poleSpacing = 32;
            const numPoles = Math.floor(kerbLen / poleSpacing);
            if (numPoles >= 2) {
              const poleH = 6.2;
              const poleGeo = new THREE.CylinderGeometry(0.08, 0.11, poleH, 6);
              const poleGeos: THREE.BufferGeometry[] = [];
              const wireVerts: number[] = [];
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
              poleGeo.dispose();
              const mergedPoles = mergeGeometries(poleGeos, false);
              for (const g of poleGeos) g.dispose();
              if (mergedPoles) {
                applyVertexColor(mergedPoles, 0x475569);
                const poleMesh = placedMesh(mergedPoles, this.roadTrimMat);
                poleMesh.castShadow = false;
                outObjects.push(poleMesh);
              }
              if (wireVerts.length > 0) {
                const wireGeo = new THREE.BufferGeometry();
                wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(wireVerts, 3));
                wireGeo.computeBoundingBox();
                const c = wireGeo.boundingBox!.getCenter(new THREE.Vector3());
                wireGeo.translate(-c.x, 0, -c.z);
                const wireLines = new THREE.LineSegments(wireGeo, this.wireMat);
                wireLines.position.set(c.x, 0, c.z);
                outObjects.push(wireLines);
              }
            }
          }
        }
      }
    }

    // Raised median on two-way divided roads (never down the center of one-way carriageways)
    if (seg.divided && !seg.oneWay && !isElevated) {
      const medianW = 0.9;
      const medianH = 0.22;
      const medianGeo = new THREE.BoxGeometry(medianW, medianH, horizLen);
      applyVertexColor(medianGeo, 0x555555);
      const median = new THREE.Mesh(medianGeo, this.roadTrimMat);
      median.position.set(midX, medianH / 2, midZ);
      median.rotation.y = rotY;
      median.castShadow = false;
      median.receiveShadow = true;
      outObjects.push(median);
      colliders.push(median);
    } else {
      // Dashed white centerline markings (interpolated along elevation on sloped ramps)
      const dashLen = 2.5;
      const gapLen = 2.5;
      const step = dashLen + gapLen;
      const numDashes = Math.floor(len3d / step);
      const dashGeos: THREE.BufferGeometry[] = [];

      for (let i = 0; i < numDashes; i++) {
        const t = (i * step + dashLen / 2) / len3d;
        const dashX = sNode.x + dx * t;
        const dashY = y1 + dy * t + 0.03;
        const dashZ = sNode.z + dz * t;

        const dashGeo = new THREE.PlaneGeometry(0.16, dashLen);
        dashGeo.rotateX(-Math.PI / 2 + pitch);
        dashGeo.rotateY(rotY);
        dashGeo.translate(dashX, dashY, dashZ);
        dashGeos.push(dashGeo);
      }

      if (dashGeos.length > 0) {
        const mergedDashes = mergeGeometries(dashGeos, false);
        for (const g of dashGeos) g.dispose();
        if (mergedDashes) {
          const markMesh = placedMesh(mergedDashes, this.markingMat);
          markMesh.castShadow = false;
          outObjects.push(markMesh);
        }
      }
    }

    // Potholes / puddle decals by surfaceCondition (ground level only)
    if (seg.surfaceCondition < 0.9 && !isElevated) {
      const count = Math.min(4, Math.floor((1.0 - seg.surfaceCondition) * 8) + 1);
      const puddleGeos: THREE.BufferGeometry[] = [];
      for (let p = 0; p < count; p++) {
        const t = 0.2 + (p * 0.6) / count;
        const px = sNode.x + dx * t + nx * (p % 2 === 0 ? 1 : -1) * width * 0.2;
        const pz = sNode.z + dz * t + nz * (p % 2 === 0 ? 1 : -1) * width * 0.2;
        const puddleW = 1.2 + p * 0.3;
        const puddleH = 0.8 + p * 0.2;
        const puddleGeo = new THREE.PlaneGeometry(puddleW, puddleH);
        puddleGeo.rotateX(-Math.PI / 2);
        puddleGeo.translate(px, 0.025, pz);
        puddleGeos.push(puddleGeo);
      }
      if (puddleGeos.length > 0) {
        const mergedPuddles = mergeGeometries(puddleGeos, false);
        for (const g of puddleGeos) g.dispose();
        if (mergedPuddles) {
          const puddleMesh = placedMesh(mergedPuddles, this.puddleMat);
          puddleMesh.castShadow = false;
          outObjects.push(puddleMesh);
        }
      }
    }

    // Speed bump (ground level)
    if (!isElevated && seg.tags && (seg.tags.includes('speed_bump') || seg.tags.includes('school'))) {
      const bumpW = width * 0.9;
      const bumpGeo = new THREE.CylinderGeometry(0.5, 0.5, bumpW, 8);
      bumpGeo.rotateZ(Math.PI / 2);
      bumpGeo.scale(1.0, 0.2, 1.0);
      applyVertexColor(bumpGeo, 0xd97706);
      const bump = new THREE.Mesh(bumpGeo, this.roadTrimMat);
      bump.rotation.y = rotY;
      bump.position.set(midX, 0.02, midZ);
      bump.castShadow = false;
      outObjects.push(bump);
    }
  }

  private buildZebraCrossings(ctx: RoadSliceContext, outObjects: THREE.Object3D[]): void {
    // 3. Build Zebra Crossings at crossing nodes
    for (const nodeId of ctx.crossingNodes) {
      const node = ctx.nodeMap.get(nodeId);
      if (!node) continue;

      const nodeY = node.y ?? 0;
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
        zebraGeo.translate(node.x + offset, nodeY + 0.035, node.z);
        stripeGeos.push(zebraGeo);
      }

      if (stripeGeos.length > 0) {
        const mergedZebra = mergeGeometries(stripeGeos, false);
        for (const g of stripeGeos) g.dispose();
        if (mergedZebra) {
          const zebraMesh = placedMesh(mergedZebra, this.markingMat);
          zebraMesh.castShadow = false;
          outObjects.push(zebraMesh);
        }
      }
      ctx.zebraCount++;
    }
  }
}
