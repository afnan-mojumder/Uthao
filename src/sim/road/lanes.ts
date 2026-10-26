import { distance2d } from '../../core/math';
import type { RoadNetwork } from './RoadNetwork';

export interface LanePoint {
  x: number;
  z: number;
}

export interface Lane {
  laneId: string;
  segmentId: string;
  laneIndex: number; // 0 = leftmost in travel direction
  totalLanesInDirection: number;
  direction: 'forward' | 'backward';
  startNodeId: string;
  endNodeId: string;
  points: LanePoint[]; // Polyline points offset to the left
  lengthM: number;
  speedLimitKmh: number;
  speedLimitMs: number;
  leftOffsetM: number; // Positive = offset to the left of centreline
}

export interface LaneGraph {
  lanes: Map<string, Lane>;
  lanesBySegment: Map<string, Lane[]>;
  outgoingLanes: Map<string, Lane[]>; // laneId -> next connected lanes at destination junction
  lanesByNode: Map<string, Lane[]>; // nodeId -> lanes entering or leaving this node
}

/**
 * Builds lane polylines for the road network.
 * In Bangladesh, traffic drives on the LEFT of the road/centreline.
 */
export function buildLanes(network: RoadNetwork): LaneGraph {
  const lanes = new Map<string, Lane>();
  const lanesBySegment = new Map<string, Lane[]>();
  const outgoingLanes = new Map<string, Lane[]>();
  const lanesByNode = new Map<string, Lane[]>();

  const segments = network.getAllSegments();
  const nodesMap = network.getNodesMap();

  for (const seg of segments) {
    const startNode = nodesMap.get(seg.startNodeId);
    const endNode = nodesMap.get(seg.endNodeId);
    if (!startNode || !endNode) continue;

    const dx = endNode.x - startNode.x;
    const dz = endNode.z - startNode.z;
    const len = distance2d(startNode.x, startNode.z, endNode.x, endNode.z);
    if (len <= 0) continue;

    // Forward direction unit vector
    const uX = dx / len;
    const uZ = dz / len;

    // Perpendicular vector pointing to the LEFT of the forward direction
    // In coordinate system where x is East and z is South:
    // Left of (uX, uZ) is (uZ, -uX)
    const leftX = uZ;
    const leftZ = -uX;

    const segLanes: Lane[] = [];

    if (seg.oneWay) {
      // One-way road: all lanes travel start -> end
      const count = Math.max(1, seg.lanes);
      const laneWidth = seg.width / count;

      for (let i = 0; i < count; i++) {
        // Offset from centreline to left:
        // i = 0 (leftmost) is closest to left kerb (+seg.width/2 - laneWidth/2)
        const leftOffset = seg.width / 2 - (i + 0.5) * laneWidth;
        const laneId = `${seg.segmentId}_fwd_${i}`;

        const p1: LanePoint = {
          x: startNode.x + leftX * leftOffset,
          z: startNode.z + leftZ * leftOffset,
        };
        const p2: LanePoint = {
          x: endNode.x + leftX * leftOffset,
          z: endNode.z + leftZ * leftOffset,
        };

        const lane: Lane = {
          laneId,
          segmentId: seg.segmentId,
          laneIndex: i,
          totalLanesInDirection: count,
          direction: 'forward',
          startNodeId: seg.startNodeId,
          endNodeId: seg.endNodeId,
          points: [p1, p2],
          lengthM: len,
          speedLimitKmh: seg.speedLimit,
          speedLimitMs: seg.speedLimit / 3.6,
          leftOffsetM: leftOffset,
        };

        lanes.set(laneId, lane);
        segLanes.push(lane);
      }
    } else {
      // Two-way road: traffic drives on the left in each direction
      const forwardCount = Math.max(1, Math.floor(seg.lanes / 2));
      const backwardCount = Math.max(1, Math.ceil(seg.lanes / 2));
      const halfWidth = seg.width / 2;

      // Forward direction (start -> end): uses LEFT half of roadway (+offset)
      const forwardLaneWidth = halfWidth / forwardCount;
      for (let i = 0; i < forwardCount; i++) {
        const leftOffset = halfWidth - (i + 0.5) * forwardLaneWidth;
        const laneId = `${seg.segmentId}_fwd_${i}`;

        const p1: LanePoint = {
          x: startNode.x + leftX * leftOffset,
          z: startNode.z + leftZ * leftOffset,
        };
        const p2: LanePoint = {
          x: endNode.x + leftX * leftOffset,
          z: endNode.z + leftZ * leftOffset,
        };

        const lane: Lane = {
          laneId,
          segmentId: seg.segmentId,
          laneIndex: i,
          totalLanesInDirection: forwardCount,
          direction: 'forward',
          startNodeId: seg.startNodeId,
          endNodeId: seg.endNodeId,
          points: [p1, p2],
          lengthM: len,
          speedLimitKmh: seg.speedLimit,
          speedLimitMs: seg.speedLimit / 3.6,
          leftOffsetM: leftOffset,
        };

        lanes.set(laneId, lane);
        segLanes.push(lane);
      }

      // Backward direction (end -> start): drives on ITS left (which is -offset from forward perspective)
      // Unit vector backward is (-uX, -uZ). Left of backward vector is (-leftX, -leftZ)
      const backwardLaneWidth = halfWidth / backwardCount;
      for (let i = 0; i < backwardCount; i++) {
        const leftOffsetInTravelDir = halfWidth - (i + 0.5) * backwardLaneWidth;
        const laneId = `${seg.segmentId}_bwd_${i}`;

        const p1: LanePoint = {
          x: endNode.x - leftX * leftOffsetInTravelDir,
          z: endNode.z - leftZ * leftOffsetInTravelDir,
        };
        const p2: LanePoint = {
          x: startNode.x - leftX * leftOffsetInTravelDir,
          z: startNode.z - leftZ * leftOffsetInTravelDir,
        };

        const lane: Lane = {
          laneId,
          segmentId: seg.segmentId,
          laneIndex: i,
          totalLanesInDirection: backwardCount,
          direction: 'backward',
          startNodeId: seg.endNodeId,
          endNodeId: seg.startNodeId,
          points: [p1, p2],
          lengthM: len,
          speedLimitKmh: seg.speedLimit,
          speedLimitMs: seg.speedLimit / 3.6,
          leftOffsetM: leftOffsetInTravelDir,
        };

        lanes.set(laneId, lane);
        segLanes.push(lane);
      }
    }

    lanesBySegment.set(seg.segmentId, segLanes);
  }

  // Connect outgoing lanes at junctions
  for (const lane of lanes.values()) {
    const endNodeId = lane.endNodeId;
    if (!lanesByNode.has(endNodeId)) {
      lanesByNode.set(endNodeId, []);
    }
    lanesByNode.get(endNodeId)!.push(lane);

    const seg = network.getSegment(lane.segmentId);
    const turnRestrictions = new Set(seg?.turnRestrictions ?? []);

    const candidates: Lane[] = [];
    for (const otherLane of lanes.values()) {
      if (otherLane.laneId === lane.laneId) continue;
      if (otherLane.startNodeId === endNodeId) {
        if (!turnRestrictions.has(otherLane.segmentId)) {
          // Avoid immediate U-turn unless specified
          if (otherLane.endNodeId !== lane.startNodeId || otherLane.segmentId !== lane.segmentId) {
            candidates.push(otherLane);
          }
        }
      }
    }
    outgoingLanes.set(lane.laneId, candidates);
  }

  return {
    lanes,
    lanesBySegment,
    outgoingLanes,
    lanesByNode,
  };
}
