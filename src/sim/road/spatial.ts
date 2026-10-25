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
