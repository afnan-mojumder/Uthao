import type { RoadNode, RoadSegment } from '../../core/types';
import type { DistrictData, Poi, WorldData } from '../schemas';
import {
  RoutingGraph,
  type Route,
  type RouteOptions,
  pickupOptions,
  type PickupOptionsResult,
} from './routing';
import { nearestNode, segmentAt } from './spatial';

export class RoadNetwork {
  private nodes: RoadNode[] = [];
  private segments: RoadSegment[] = [];
  private pois: Poi[] = [];
  private graph: RoutingGraph;

  private constructor(nodes: RoadNode[], segments: RoadSegment[], pois: Poi[]) {
    this.nodes = nodes;
    this.segments = segments;
    this.pois = pois;
    this.graph = new RoutingGraph(nodes, segments);
  }

  static fromDistricts(
    districts: DistrictData[],
    connectors: RoadSegment[] = []
  ): RoadNetwork {
    const allNodes: RoadNode[] = [];
    const allSegments: RoadSegment[] = [];
    const allPois: Poi[] = [];

    const nodeIds = new Set<string>();
    const segmentIds = new Set<string>();

    for (const d of districts) {
      for (const node of d.nodes) {
        if (!nodeIds.has(node.nodeId)) {
          nodeIds.add(node.nodeId);
          allNodes.push(node);
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

    return new RoadNetwork(allNodes, allSegments, allPois);
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
    filter?: (node: RoadNode) => boolean
  ): RoadNode | null {
    return nearestNode(this.nodes, x, z, filter);
  }

  segmentAt(x: number, z: number, tolerance: number = 10): RoadSegment | null {
    return segmentAt(this.segments, this.graph.getNodesMap(), x, z, tolerance);
  }

  route(
    fromNodeId: string,
    toNodeId: string,
    opts: RouteOptions
  ): Route | null {
    return this.graph.route(fromNodeId, toNodeId, opts);
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

  getNodesMap(): Map<string, RoadNode> {
    return this.graph.getNodesMap();
  }

  getPois(): Poi[] {
    return this.pois;
  }

  getGraph(): RoutingGraph {
    return this.graph;
  }

  pickupOptions(
    req: { pickupNodeId: string },
    riderPos: { x: number; z: number } | string,
    options?: { maxWalkM?: number }
  ): PickupOptionsResult | null {
    return pickupOptions(req, riderPos, this.graph, options);
  }
}
