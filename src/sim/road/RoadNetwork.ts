import type { DistrictId, RoadNode, RoadSegment } from '../../core/types';
import type { DistrictData, Poi, WorldData } from '../schemas';
import {
  RoutingGraph,
  isPickupSegment,
  type Route,
  type RouteOptions,
  pickupOptions,
  type PickupOptionsQuery,
  type PickupOptionsResult,
} from './routing';
import { nearestNode, segmentAt, segmentAtElevation, type SegmentElevationHit } from './spatial';

export { isPickupSegment };

export function getRoadWidth(segment: RoadSegment): number {
  if (typeof segment.width === 'number' && segment.width > 0) {
    return segment.width;
  }
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

export class RoadNetwork {
  private nodes: RoadNode[] = [];
  private segments: RoadSegment[] = [];
  private pois: Poi[] = [];
  private nodeDistrict: Map<string, DistrictId> = new Map();
  private readonly motorcycleNodeIds: Set<string>;
  private graph: RoutingGraph;

  private constructor(
    nodes: RoadNode[],
    segments: RoadSegment[],
    pois: Poi[],
    nodeDistrict: Map<string, DistrictId> = new Map()
  ) {
    this.nodes = nodes;
    this.segments = segments;
    this.pois = pois;
    this.nodeDistrict = nodeDistrict;
    this.motorcycleNodeIds = new Set<string>();
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      if (seg.motorcycleAccessible) {
        this.motorcycleNodeIds.add(seg.startNodeId);
        this.motorcycleNodeIds.add(seg.endNodeId);
      }
    }
    this.graph = new RoutingGraph(nodes, segments);
  }

  static fromDistricts(
    districts: DistrictData[],
    connectors: RoadSegment[] = []
  ): RoadNetwork {
    const allNodes: RoadNode[] = [];
    const allSegments: RoadSegment[] = [];
    const allPois: Poi[] = [];
    const nodeDistrict = new Map<string, DistrictId>();

    const nodeIds = new Set<string>();
    const segmentIds = new Set<string>();

    for (const d of districts) {
      for (const node of d.nodes) {
        if (!nodeIds.has(node.nodeId)) {
          nodeIds.add(node.nodeId);
          allNodes.push(node);
          nodeDistrict.set(node.nodeId, d.districtId);
        }
      }
      for (const seg of d.segments) {
        if (!segmentIds.has(seg.segmentId)) {
          segmentIds.add(seg.segmentId);
          allSegments.push(seg);
        }
      }
      if (d.pois) {
        allPois.push(...d.pois);
      }
    }

    for (const conn of connectors) {
      if (!segmentIds.has(conn.segmentId)) {
        segmentIds.add(conn.segmentId);
        allSegments.push(conn);
      }
    }

    return new RoadNetwork(allNodes, allSegments, allPois, nodeDistrict);
  }

  static fromWorld(
    worldData: WorldData,
    districts: DistrictData[]
  ): RoadNetwork {
    return RoadNetwork.fromDistricts(districts, worldData.connectors ?? []);
  }

  nearestNode(
    x: number,
    z: number,
    filter?: (node: RoadNode) => boolean,
    y?: number
  ): RoadNode | null {
    return nearestNode(this.nodes, x, z, filter, y);
  }

  isMotorcycleNode(nodeId: string): boolean {
    return this.motorcycleNodeIds.has(nodeId);
  }

  nearestMotorcycleNode(x: number, z: number, y?: number): RoadNode | null {
    return (
      nearestNode(this.nodes, x, z, (n) => this.motorcycleNodeIds.has(n.nodeId), y) ??
      nearestNode(this.nodes, x, z, undefined, y)
    );
  }

  segmentAt(x: number, z: number, tolerance: number = 10): RoadSegment | null {
    return segmentAt(this.segments, this.graph.getNodesMap(), x, z, tolerance);
  }

  segmentAtElevation(
    x: number,
    z: number,
    y: number,
    tolerance: number = 10,
    out?: SegmentElevationHit
  ): SegmentElevationHit {
    return segmentAtElevation(this.segments, this.graph.getNodesMap(), x, z, y, tolerance, out);
  }

  route(
    fromNodeId: string,
    toNodeId: string,
    opts: RouteOptions
  ): Route | null {
    return this.graph.route(fromNodeId, toNodeId, opts);
  }

  /** True when `nodeId` touches at least one pickup-eligible segment. */
  isPickupNode(nodeId: string): boolean {
    return this.graph.isPickupNode(nodeId);
  }

  getNode(nodeId: string): RoadNode | undefined {
    return this.graph.getNodesMap().get(nodeId);
  }

  getSegment(segmentId: string): RoadSegment | undefined {
    return this.graph.getSegmentsMap().get(segmentId);
  }

  getAllNodes(): RoadNode[] {
    return this.nodes;
  }

  getAllSegments(): RoadSegment[] {
    return this.segments;
  }

  getSegments(): RoadSegment[] {
    return this.segments;
  }

  getNodesMap(): Map<string, RoadNode> {
    return this.graph.getNodesMap();
  }

  getPois(): Poi[] {
    return this.pois;
  }

  getNodeDistrict(nodeId: string): DistrictId | undefined {
    const direct = this.nodeDistrict.get(nodeId);
    if (direct) return direct;
    let fallback: DistrictId | undefined;
    for (const seg of this.segments) {
      if (seg.startNodeId !== nodeId && seg.endNodeId !== nodeId) continue;
      if (!seg.tags.includes('connector')) {
        return seg.district;
      }
      fallback ??= seg.district;
    }
    return fallback;
  }

  getNodeZoneTags(nodeId: string): string[] {
    const tags = new Set<string>();
    const node = this.getNode(nodeId);
    if (node?.tags) {
      for (const t of node.tags) tags.add(t);
    }
    for (const poi of this.pois) {
      if (poi.nodeId === nodeId) {
        tags.add(poi.kind);
      }
    }
    for (const seg of this.segments) {
      if (seg.startNodeId !== nodeId && seg.endNodeId !== nodeId) continue;
      tags.add(seg.roadType);
      for (const t of seg.tags) tags.add(t);
    }
    return Array.from(tags);
  }

  getGraph(): RoutingGraph {
    return this.graph;
  }

  pickupOptions(
    req: { pickupNodeId: string },
    riderPos: { x: number; z: number } | string,
    options?: PickupOptionsQuery
  ): PickupOptionsResult | null {
    return pickupOptions(req, riderPos, this.graph, options);
  }
}
