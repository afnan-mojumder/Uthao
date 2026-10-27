import type { RoadNode, RoadSegment, WeatherKind } from '../../core/types';
import { distance2d, angleDiff, clamp } from '../../core/math';
import { DISTANCE_SCALE } from '../../config/constants';

export interface RouteOptions {
  mode: 'motorcycle' | 'walk';
  avoid?: string[]; // segmentIds to avoid
  roadEvents?: { getClosedSegmentIds: () => string[] };
  weather?: WeatherKind;
  minute?: number;
  isFlooded?: (segment: RoadSegment) => boolean;
  getFloodLevel?: (segmentId: string) => number;
}

export interface Route {
  nodeIds: string[];
  segmentIds: string[];
  lengthM: number;
  virtualKm: number;
  etaMin: number;
  uTurns: number;
}

interface GraphEdge {
  segment: RoadSegment;
  fromNodeId: string;
  toNodeId: string;
  length: number;
}

export class RoutingGraph {
  private adjacency: Map<string, GraphEdge[]> = new Map();
  private nodesMap: Map<string, RoadNode> = new Map();
  private segmentsMap: Map<string, RoadSegment> = new Map();

  constructor(nodes: RoadNode[], segments: RoadSegment[]) {
    for (const node of nodes) {
      this.nodesMap.set(node.nodeId, node);
      this.adjacency.set(node.nodeId, []);
    }

    for (const seg of segments) {
      this.segmentsMap.set(seg.segmentId, seg);
      const start = this.nodesMap.get(seg.startNodeId);
      const end = this.nodesMap.get(seg.endNodeId);
      if (!start || !end) {
        continue;
      }
      const len = distance2d(start.x, start.z, end.x, end.z);

      // Forward edge
      this.adjacency.get(seg.startNodeId)?.push({
        segment: seg,
        fromNodeId: seg.startNodeId,
        toNodeId: seg.endNodeId,
        length: len,
      });

      // Backward edge if not oneWay
      if (!seg.oneWay) {
        this.adjacency.get(seg.endNodeId)?.push({
          segment: seg,
          fromNodeId: seg.endNodeId,
          toNodeId: seg.startNodeId,
          length: len,
        });
      }
    }
  }

  getNodesMap(): Map<string, RoadNode> {
    return this.nodesMap;
  }

  getSegmentsMap(): Map<string, RoadSegment> {
    return this.segmentsMap;
  }

  route(fromNodeId: string, toNodeId: string, opts: RouteOptions): Route | null {
    if (fromNodeId === toNodeId) {
      return {
        nodeIds: [fromNodeId],
        segmentIds: [],
        lengthM: 0,
        virtualKm: 0,
        etaMin: 0,
        uTurns: 0,
      };
    }

    const targetNode = this.nodesMap.get(toNodeId);
    if (!targetNode || !this.nodesMap.has(fromNodeId)) {
      return null;
    }

    const avoidSet = new Set(opts.avoid ?? []);
    if (opts.roadEvents) {
      for (const id of opts.roadEvents.getClosedSegmentIds()) {
        avoidSet.add(id);
      }
    }
    const isWalk = opts.mode === 'walk';

    // Min-priority queue node for A*
    const serializeState = (nodeId: string, prevSegId: string | null) =>
      `${nodeId}|${prevSegId ?? ''}`;

    interface QueueItem {
      nodeId: string;
      prevSegId: string | null;
      g: number; // seconds
      f: number; // g + h
      lengthM: number;
      uTurns: number;
      parent: QueueItem | null;
      viaEdge: GraphEdge | null;
    }

    const openSet: QueueItem[] = [];
    const bestG = new Map<string, number>();

    const startH =
      distance2d(
        this.nodesMap.get(fromNodeId)!.x,
        this.nodesMap.get(fromNodeId)!.z,
        targetNode.x,
        targetNode.z
      ) / 15; // optimistic heuristic

    const startItem: QueueItem = {
      nodeId: fromNodeId,
      prevSegId: null,
      g: 0,
      f: startH,
      lengthM: 0,
      uTurns: 0,
      parent: null,
      viaEdge: null,
    };

    openSet.push(startItem);
    bestG.set(serializeState(fromNodeId, null), 0);

    let goalItem: QueueItem | null = null;

    while (openSet.length > 0) {
      // Find min f
      let bestIdx = 0;
      for (let i = 1; i < openSet.length; i++) {
        if (openSet[i]!.f < openSet[bestIdx]!.f) {
          bestIdx = i;
        }
      }
      const current = openSet.splice(bestIdx, 1)[0]!;

      if (current.nodeId === toNodeId) {
        goalItem = current;
        break;
      }

      const currKey = serializeState(current.nodeId, current.prevSegId);
      if (current.g > (bestG.get(currKey) ?? Infinity)) {
        continue;
      }

      const edges = this.adjacency.get(current.nodeId) ?? [];

      for (const edge of edges) {
        const seg = edge.segment;

        // In motorcycle mode, check accessibility
        if (!isWalk && !seg.motorcycleAccessible) {
          continue;
        }

        // Avoid list (closures)
        if (avoidSet.has(seg.segmentId)) {
          continue;
        }

        // Flooding check: heavyRain with floodSensitivity > 0.9 is impassable, OR floodLevel > 0.9
        const currentFloodLevel = opts.getFloodLevel ? opts.getFloodLevel(seg.segmentId) : 0;
        const isFloodedImpassable =
          (opts.weather === 'heavyRain' && seg.floodSensitivity > 0.9) ||
          currentFloodLevel > 0.9 ||
          (opts.isFlooded && opts.isFlooded(seg) && seg.floodSensitivity > 0.9);

        if (!isWalk && isFloodedImpassable) {
          continue;
        }

        // Turn restrictions from previous segment
        if (current.prevSegId) {
          const prevSeg = this.segmentsMap.get(current.prevSegId);
          if (prevSeg && prevSeg.turnRestrictions.includes(seg.segmentId)) {
            continue;
          }
        }

        // Calculate turn angle and penalty
        let turnPenaltySec = 0;
        let isUTurn = false;

        const currNode = this.nodesMap.get(current.nodeId)!;
        const nextNode = this.nodesMap.get(edge.toNodeId)!;

        if (current.viaEdge) {
          const prevFromNode = this.nodesMap.get(current.viaEdge.fromNodeId)!;
          const inHeading = Math.atan2(
            currNode.x - prevFromNode.x,
            currNode.z - prevFromNode.z
          );
          const outHeading = Math.atan2(
            nextNode.x - currNode.x,
            nextNode.z - currNode.z
          );
          const diff = Math.abs(angleDiff(inHeading, outHeading));

          const isDivided = current.viaEdge.segment.divided || seg.divided;

          if (
            diff > 2.35 ||
            currNode.kind === 'uturn' ||
            seg.tags.includes('uturn')
          ) {
            isUTurn = true;
            // On divided roads, U-turns are ONLY allowed at kind === 'uturn' nodes
            if (isDivided && currNode.kind !== 'uturn') {
              continue; // disallowed U-turn on divided road!
            }
            turnPenaltySec = 25;
          } else if (diff > 0.5) {
            turnPenaltySec = 3;
          }
        }

        // Speed and cost calculation
        let speedMs = 1.39; // walk speed (5 km/h)
        if (!isWalk) {
          let speedKmh = seg.speedLimit;
          const isFloodedSlow =
            (opts.weather === 'heavyRain' && seg.floodSensitivity > 0.6) ||
            currentFloodLevel >= 0.5 ||
            (opts.isFlooded && opts.isFlooded(seg));
          if (isFloodedSlow) {
            speedKmh = Math.min(speedKmh, 10); // speed cap in water
          }
          const weatherMult =
            opts.weather === 'heavyRain'
              ? 0.7
              : opts.weather === 'lightRain'
              ? 0.9
              : 1.0;
          const min = opts.minute ?? 720;
          const minOfDay = min % 1440;
          const isRush =
            (minOfDay >= 450 && minOfDay <= 600) ||
            (minOfDay >= 1020 && minOfDay <= 1200);
          const congestion = isRush
            ? 1 + seg.trafficDensity * 0.5
            : 1 + seg.trafficDensity * 0.2;

          speedMs = clamp(
            ((speedKmh * 1000) / 3600) * (weatherMult / congestion),
            1.5,
            30
          );
        }

        const traversalTimeSec = edge.length / speedMs;
        const edgeCostSec = traversalTimeSec + turnPenaltySec;
        const nextG = current.g + edgeCostSec;

        const nextStateKey = serializeState(edge.toNodeId, seg.segmentId);
        if (nextG >= (bestG.get(nextStateKey) ?? Infinity)) {
          continue;
        }

        bestG.set(nextStateKey, nextG);

        const h =
          distance2d(nextNode.x, nextNode.z, targetNode.x, targetNode.z) / 15;

        openSet.push({
          nodeId: edge.toNodeId,
          prevSegId: seg.segmentId,
          g: nextG,
          f: nextG + h,
          lengthM: current.lengthM + edge.length,
          uTurns: current.uTurns + (isUTurn ? 1 : 0),
          parent: current,
          viaEdge: edge,
        });
      }
    }

    if (!goalItem) {
      return null;
    }

    // Reconstruct path
    const nodeIds: string[] = [];
    const segmentIds: string[] = [];
    let curr: QueueItem | null = goalItem;

    while (curr) {
      nodeIds.unshift(curr.nodeId);
      if (curr.viaEdge) {
        segmentIds.unshift(curr.viaEdge.segment.segmentId);
      }
      curr = curr.parent;
    }

    const lengthM = goalItem.lengthM;
    const virtualKm = (lengthM * DISTANCE_SCALE) / 1000;
    const etaMin = Math.ceil(goalItem.g / 60);

    return {
      nodeIds,
      segmentIds,
      lengthM,
      virtualKm,
      etaMin,
      uTurns: goalItem.uTurns,
    };
  }
}

export function route(
  graph: RoutingGraph,
  fromNodeId: string,
  toNodeId: string,
  opts: RouteOptions
): Route | null {
  return graph.route(fromNodeId, toNodeId, opts);
}

export interface PickupOptionsResult {
  direct: Route;
  crossPoint?: {
    nodeId: string;
    walkM: number;
    savesMin: number;
  };
}

export function pickupOptions(
  req: { pickupNodeId: string },
  riderPos: { x: number; z: number } | string,
  graph: RoutingGraph,
  options?: { maxWalkM?: number }
): PickupOptionsResult | null {
  const nodesMap = graph.getNodesMap();
  let startNodeId: string | null = null;

  if (typeof riderPos === 'string') {
    startNodeId = riderPos;
  } else {
    let bestDist = Infinity;
    for (const node of nodesMap.values()) {
      const d = distance2d(riderPos.x, riderPos.z, node.x, node.z);
      if (d < bestDist) {
        bestDist = d;
        startNodeId = node.nodeId;
      }
    }
  }

  if (!startNodeId) {
    return null;
  }

  const direct = graph.route(startNodeId, req.pickupNodeId, { mode: 'motorcycle' });
  if (!direct) {
    return null;
  }

  const pickupNode = nodesMap.get(req.pickupNodeId);
  if (!pickupNode) {
    return { direct };
  }

  const maxWalkM = options?.maxWalkM ?? 300;
  let bestCrossPoint: { nodeId: string; walkM: number; savesMin: number } | undefined;
  let maxNetSavings = 0;

  for (const node of nodesMap.values()) {
    // A cross point is only a node with tags: ['crossing'] (zebra/footbridge)
    if (!node.tags?.includes('crossing')) {
      continue;
    }
    if (node.nodeId === req.pickupNodeId) {
      continue;
    }

    const walkM = distance2d(pickupNode.x, pickupNode.z, node.x, node.z);
    if (walkM > maxWalkM) {
      continue;
    }

    const crossRoute = graph.route(startNodeId, node.nodeId, { mode: 'motorcycle' });
    if (!crossRoute) {
      continue;
    }

    const savesMin = direct.etaMin - crossRoute.etaMin;
    if (savesMin > 0 && savesMin > maxNetSavings) {
      maxNetSavings = savesMin;
      bestCrossPoint = {
        nodeId: node.nodeId,
        walkM: Math.round(walkM),
        savesMin: Math.max(1, Math.round(savesMin)),
      };
    }
  }

  return {
    direct,
    crossPoint: bestCrossPoint,
  };
}

