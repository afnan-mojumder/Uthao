import type { RoadNode, RoadSegment, WeatherKind } from '../../core/types';
import { distance2d, angleDiff, clamp } from '../../core/math';
import { DISTANCE_SCALE } from '../../config/constants';
import { isRushHourMinute } from '../../core/clock';

export interface RouteOptions {
  mode: 'motorcycle' | 'walk';
  avoid?: string[]; // segmentIds to avoid
  roadEvents?: {
    getClosedSegmentIds: () => string[];
    getSpeedCap?: (segmentId: string) => number | undefined;
    getCongestionMultiplier?: (segmentId: string) => number;
  };
  weather?: WeatherKind;
  minute?: number;
  isFlooded?: (segment: RoadSegment) => boolean;
  getFloodLevel?: (segmentId: string) => number;
}

export type PickupOptionsQuery = Omit<RouteOptions, 'mode'> & {
  maxWalkM?: number;
};

/** A segment a passenger can be picked up from: accessible, practical, and not a divided
 * carriageway. The single eligibility rule for generated and relocated pickups. */
export function isPickupSegment(seg: RoadSegment): boolean {
  return seg.pickupPractical && seg.motorcycleAccessible && !seg.divided;
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
  reverseOneWay?: boolean;
}

export class RoutingGraph {
  private adjacency: Map<string, GraphEdge[]> = new Map();
  private nodesMap: Map<string, RoadNode> = new Map();
  private segmentsMap: Map<string, RoadSegment> = new Map();
  private pickupNodes: Set<string> = new Set();
  private motorcycleNodes: Set<string> = new Set();

  constructor(nodes: RoadNode[], segments: RoadSegment[]) {
    for (const node of nodes) {
      this.nodesMap.set(node.nodeId, node);
      this.adjacency.set(node.nodeId, []);
    }

    for (const seg of segments) {
      this.segmentsMap.set(seg.segmentId, seg);
      if (seg.motorcycleAccessible) {
        this.motorcycleNodes.add(seg.startNodeId);
        this.motorcycleNodes.add(seg.endNodeId);
      }
      if (isPickupSegment(seg)) {
        this.pickupNodes.add(seg.startNodeId);
        this.pickupNodes.add(seg.endNodeId);
      }
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

      // Backward edge (walk mode may traverse one-way streets in reverse)
      this.adjacency.get(seg.endNodeId)?.push({
        segment: seg,
        fromNodeId: seg.endNodeId,
        toNodeId: seg.startNodeId,
        length: len,
        ...(seg.oneWay ? { reverseOneWay: true } : {}),
      });
    }
  }

  /** True when `nodeId` touches at least one pickup-eligible segment. */
  isPickupNode(nodeId: string): boolean {
    return this.pickupNodes.has(nodeId);
  }

  /** True when `nodeId` touches at least one motorcycle-accessible segment. */
  isMotorcycleNode(nodeId: string): boolean {
    return this.motorcycleNodes.has(nodeId);
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
    const heuristicSpeedMs = isWalk ? 1.39 : 30;

    const heapPush = (item: QueueItem): void => {
      openSet.push(item);
      let idx = openSet.length - 1;
      while (idx > 0) {
        const parentIdx = (idx - 1) >> 1;
        const parent = openSet[parentIdx]!;
        if (item.f >= parent.f) break;
        openSet[idx] = parent;
        openSet[parentIdx] = item;
        idx = parentIdx;
      }
    };

    const heapPop = (): QueueItem | undefined => {
      const len = openSet.length;
      if (len === 0) return undefined;
      const top = openSet[0]!;
      const last = openSet.pop()!;
      if (len > 1) {
        openSet[0] = last;
        let idx = 0;
        const half = (len - 1) >> 1;
        while (idx < half) {
          let left = (idx << 1) + 1;
          const right = left + 1;
          if (right < len - 1 && openSet[right]!.f < openSet[left]!.f) {
            left = right;
          }
          if (last.f <= openSet[left]!.f) break;
          openSet[idx] = openSet[left]!;
          openSet[left] = last;
          idx = left;
        }
      }
      return top;
    };

    const startH =
      distance2d(
        this.nodesMap.get(fromNodeId)!.x,
        this.nodesMap.get(fromNodeId)!.z,
        targetNode.x,
        targetNode.z
      ) / heuristicSpeedMs;

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

    heapPush(startItem);
    bestG.set(serializeState(fromNodeId, null), 0);

    let goalItem: QueueItem | null = null;

    while (openSet.length > 0) {
      const current = heapPop()!;

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

        // One-way restriction applies to vehicles only, not pedestrians
        if (!isWalk && edge.reverseOneWay) {
          continue;
        }

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

        // Turn restrictions from previous segment (vehicular only)
        if (!isWalk && current.prevSegId) {
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

          if (diff > 2.35 || seg.tags.includes('uturn')) {
            isUTurn = true;
            // On divided roads, vehicular U-turns are ONLY allowed at kind === 'uturn' nodes
            if (!isWalk && isDivided && currNode.kind !== 'uturn') {
              continue; // disallowed U-turn on divided road!
            }
            turnPenaltySec = isWalk ? 0 : 25;
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
          const eventSpeedCap = opts.roadEvents?.getSpeedCap?.(seg.segmentId);
          if (eventSpeedCap !== undefined) {
            speedKmh = Math.min(speedKmh, eventSpeedCap);
          }
          const weatherMult =
            opts.weather === 'heavyRain'
              ? 0.7
              : opts.weather === 'lightRain'
              ? 0.9
              : 1.0;
          const min = opts.minute ?? 720;
          const isRush = isRushHourMinute(min);
          const eventCong = opts.roadEvents?.getCongestionMultiplier?.(seg.segmentId) ?? 1;
          const congestion =
            (isRush ? 1 + seg.trafficDensity * 0.5 : 1 + seg.trafficDensity * 0.2) * eventCong;

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
          distance2d(nextNode.x, nextNode.z, targetNode.x, targetNode.z) / heuristicSpeedMs;

        heapPush({
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
    const etaMin = Math.ceil((goalItem.g * DISTANCE_SCALE) / 60);

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
  riderPos: { x: number; z: number; y?: number } | string,
  graph: RoutingGraph,
  options?: PickupOptionsQuery
): PickupOptionsResult | null {
  const nodesMap = graph.getNodesMap();
  let startNodeId: string | null = null;

  if (typeof riderPos === 'string') {
    startNodeId = riderPos;
  } else {
    let bestDist = Infinity;
    let bestSameBand = false;
    const refY = riderPos.y;
    for (const node of nodesMap.values()) {
      if (!graph.isMotorcycleNode(node.nodeId)) continue;
      const d = distance2d(riderPos.x, riderPos.z, node.x, node.z);
      if (refY !== undefined) {
        const sameBand = Math.abs((node.y ?? 0) - refY) <= 2.5;
        if (
          startNodeId === null ||
          (sameBand && !bestSameBand) ||
          (sameBand === bestSameBand && d < bestDist)
        ) {
          bestDist = d;
          bestSameBand = sameBand;
          startNodeId = node.nodeId;
        }
      } else if (d < bestDist) {
        bestDist = d;
        startNodeId = node.nodeId;
      }
    }
  }

  if (!startNodeId) {
    return null;
  }

  const routeOptsBase: Omit<RouteOptions, 'mode'> = {
    avoid: options?.avoid,
    roadEvents: options?.roadEvents,
    weather: options?.weather,
    minute: options?.minute,
    isFlooded: options?.isFlooded,
    getFloodLevel: options?.getFloodLevel,
  };

  const direct = graph.route(startNodeId, req.pickupNodeId, {
    ...routeOptsBase,
    mode: 'motorcycle',
  });
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
    if (!graph.isPickupNode(node.nodeId)) {
      continue;
    }

    const euclidM = distance2d(pickupNode.x, pickupNode.z, node.x, node.z);
    if (euclidM > maxWalkM) {
      continue;
    }

    const walkRoute = graph.route(req.pickupNodeId, node.nodeId, {
      ...routeOptsBase,
      mode: 'walk',
    });
    if (!walkRoute || walkRoute.lengthM > maxWalkM) {
      continue;
    }

    const crossRoute = graph.route(startNodeId, node.nodeId, {
      ...routeOptsBase,
      mode: 'motorcycle',
    });
    if (!crossRoute) {
      continue;
    }

    const savesMin = direct.etaMin - crossRoute.etaMin;
    if (savesMin > 0 && savesMin > maxNetSavings) {
      maxNetSavings = savesMin;
      bestCrossPoint = {
        nodeId: node.nodeId,
        walkM: Math.round(walkRoute.lengthM),
        savesMin: Math.max(1, Math.round(savesMin)),
      };
    }
  }

  return {
    direct,
    crossPoint: bestCrossPoint,
  };
}

