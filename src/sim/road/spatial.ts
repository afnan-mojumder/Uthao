import type { RoadNode, RoadSegment } from '../../core/types';
import { distance2d, clamp } from '../../core/math';

export function nearestNode(
  nodes: RoadNode[],
  x: number,
  z: number,
  filter?: (node: RoadNode) => boolean
): RoadNode | null {
  let closest: RoadNode | null = null;
  let minDistSq = Infinity;

  for (const node of nodes) {
    if (filter && !filter(node)) {
      continue;
    }
    const distSq = (node.x - x) ** 2 + (node.z - z) ** 2;
    if (distSq < minDistSq) {
      minDistSq = distSq;
      closest = node;
    }
  }

  return closest;
}

export function distanceToSegment(
  px: number,
  pz: number,
  x1: number,
  z1: number,
  x2: number,
  z2: number
): number {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz;

  if (lenSq === 0) {
    return distance2d(px, pz, x1, z1);
  }

  const t = clamp(((px - x1) * dx + (pz - z1) * dz) / lenSq, 0, 1);
  const projX = x1 + t * dx;
  const projZ = z1 + t * dz;

  return distance2d(px, pz, projX, projZ);
}

export interface SegmentElevationHit {
  segment: RoadSegment | null;
  y: number;
  t: number;
  distXZ: number;
}

const ELEVATION_BAND_TOLERANCE_M = 2.5;

/** Finds the nearest road segment in XZ while preferring segments matching `refY`
 * when elevated flyovers and ground roads overlap. Writes into `out` to avoid allocations. */
export function segmentAtElevation(
  segments: RoadSegment[],
  nodesMap: Map<string, RoadNode>,
  x: number,
  z: number,
  refY: number,
  tolerance: number = 10,
  out: SegmentElevationHit = { segment: null, y: refY, t: 0, distXZ: Infinity }
): SegmentElevationHit {
  out.segment = null;
  out.y = refY;
  out.t = 0;
  out.distXZ = Infinity;

  let bestSameBand = false;
  let bestDy = Infinity;
  let bestDist = Infinity;

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    const startNode = nodesMap.get(seg.startNodeId);
    const endNode = nodesMap.get(seg.endNodeId);
    if (!startNode || !endNode) continue;

    const dx = endNode.x - startNode.x;
    const dz = endNode.z - startNode.z;
    const lenSq = dx * dx + dz * dz;
    const t =
      lenSq > 0 ? clamp(((x - startNode.x) * dx + (z - startNode.z) * dz) / lenSq, 0, 1) : 0;
    const px = startNode.x + t * dx;
    const pz = startNode.z + t * dz;
    const dist = distance2d(x, z, px, pz);

    const maxAllowedDist = Math.max(seg.width / 2 + 2, tolerance);
    if (dist > maxAllowedDist) continue;

    const y1 = startNode.y ?? 0;
    const y2 = endNode.y ?? 0;
    const segY = y1 + t * (y2 - y1);
    const dy = Math.abs(segY - refY);
    const sameBand = dy <= ELEVATION_BAND_TOLERANCE_M;

    let better: boolean;
    if (out.segment === null) {
      better = true;
    } else if (sameBand !== bestSameBand) {
      better = sameBand;
    } else if (sameBand) {
      better = dist < bestDist - 0.05 || (Math.abs(dist - bestDist) <= 0.05 && dy < bestDy);
    } else {
      better = dy < bestDy - 0.05 || (Math.abs(dy - bestDy) <= 0.05 && dist < bestDist);
    }

    if (better) {
      out.segment = seg;
      out.y = segY;
      out.t = t;
      out.distXZ = dist;
      bestSameBand = sameBand;
      bestDy = dy;
      bestDist = dist;
    }
  }

  return out;
}

export function segmentAt(
  segments: RoadSegment[],
  nodesMap: Map<string, RoadNode>,
  x: number,
  z: number,
  tolerance: number = 10
): RoadSegment | null {
  let closest: RoadSegment | null = null;
  let minDistance = Infinity;

  for (const seg of segments) {
    const startNode = nodesMap.get(seg.startNodeId);
    const endNode = nodesMap.get(seg.endNodeId);
    if (!startNode || !endNode) {
      continue;
    }

    const dist = distanceToSegment(
      x,
      z,
      startNode.x,
      startNode.z,
      endNode.x,
      endNode.z
    );

    const maxAllowedDist = Math.max(seg.width / 2 + 2, tolerance);
    if (dist <= maxAllowedDist && dist < minDistance) {
      minDistance = dist;
      closest = seg;
    }
  }

  return closest;
}
