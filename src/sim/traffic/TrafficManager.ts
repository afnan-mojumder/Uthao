import type { RoadNetwork } from '../road/RoadNetwork';
import { buildLanes, type Lane, type LaneGraph } from '../road/lanes';
import { stepCarFollowing, getIdmParams, type CarFollowingResult } from './idm';
import { SignalController } from './signals';
import { PedestrianManager } from './pedestrians';
import { Rng } from '../../core/rng';
import { distance2d, angleDiff, clamp } from '../../core/math';
import { BALANCE } from '../../config/balance';
import type { RoadType } from '../../core/types';
import type { RoadEventManager } from '../world/RoadEvents';

/** Stop line sits this far before the end of an approach lane (the junction). */
const STOP_LINE_SETBACK_M = 5;
/** A bike within this distance of a lane's centreline is in that lane. */
const BIKE_LANE_HALF_WIDTH_M = 2.2;
const BIKE_LENGTH_M = 1.8;
/** Only approaches within this distance of a red light react to it. */
const SIGNAL_REACT_RANGE_M = 80;
const SPAWN_RING_MIN_M = 60;
const SPAWN_RING_MAX_M = 350;
const DESPAWN_DIST_M = 450;
const HORN_COOLDOWN_S = 0.4;
const MID_LOD_STEP_S = 1 / 20;
const FAR_LOD_STEP_S = 1 / 5;

function compareAgentDistDesc(a: TrafficAgent, b: TrafficAgent): number {
  return b.distAlongLane - a.distAlongLane;
}

export type TrafficVehicleKind =
  | 'car'
  | 'bus'
  | 'motorcycle'
  | 'cng'
  | 'rickshaw'
  | 'minibus'
  | 'delivery_van'
  | 'truck'
  | 'bicycle'
  | 'scooter'
  | 'ride_hailing_car'
  | 'vendor_cart';

export interface VehicleDimensions {
  length: number;
  width: number;
  height: number;
  desiredSpeedMs: number;
}

export const VEHICLE_CONFIGS: Record<TrafficVehicleKind, VehicleDimensions> = {
  car: { length: 4.5, width: 1.8, height: 1.6, desiredSpeedMs: 50 / 3.6 },
  bus: { length: 8.0, width: 2.4, height: 3.2, desiredSpeedMs: 40 / 3.6 },
  motorcycle: { length: 2.0, width: 0.8, height: 1.4, desiredSpeedMs: 55 / 3.6 },
  cng: { length: 2.8, width: 1.3, height: 1.8, desiredSpeedMs: 43 / 3.6 },
  rickshaw: { length: 2.2, width: 1.1, height: 1.8, desiredSpeedMs: 3.5 }, // slow 3-4 m/s per GDD §11
  minibus: { length: 4.8, width: 1.8, height: 2.3, desiredSpeedMs: 42 / 3.6 }, // leguna
  delivery_van: { length: 5.0, width: 1.9, height: 2.4, desiredSpeedMs: 45 / 3.6 },
  truck: { length: 9.5, width: 2.5, height: 3.4, desiredSpeedMs: 35 / 3.6 }, // night only
  bicycle: { length: 1.8, width: 0.6, height: 1.5, desiredSpeedMs: 16 / 3.6 },
  scooter: { length: 1.9, width: 0.7, height: 1.4, desiredSpeedMs: 45 / 3.6 },
  ride_hailing_car: { length: 4.5, width: 1.8, height: 1.6, desiredSpeedMs: 48 / 3.6 },
  vendor_cart: { length: 2.2, width: 1.3, height: 1.6, desiredSpeedMs: 7.2 / 3.6 }, // 2.0 m/s
};

export interface TrafficAgent {
  id: string;
  kind: TrafficVehicleKind;
  laneId: string;
  distAlongLane: number; // m from lane start
  speed: number; // m/s
  x: number;
  y?: number;
  z: number;
  heading: number; // radians
  length: number;
  width: number;
  desiredSpeed: number;
  lod: 'near' | 'mid' | 'far';
  lodAccum?: number;
  dwellTimer?: number;
  lastDwellPoiId?: string;
  isDwelling?: boolean;
  yieldTimer?: number;
  lateralOffset?: number;
  targetLateralOffset?: number;
  weavePhase?: number;
  isRacingToStop?: boolean;
  isWrongWay?: boolean;
  nextLaneId?: string;
}

export interface CameraViewInfo {
  x: number;
  z: number;
  heading: number; // radians
  fovRad: number; // e.g. 70 deg in radians
}

export function getTimeOfDayTrafficMultiplier(minute: number): number {
  const m = ((minute % 1440) + 1440) % 1440;
  // Morning rush: 08:00 - 10:30 (480 - 630) -> 2.5
  if (m >= 480 && m <= 630) {
    return 2.5;
  }
  // Evening rush: 17:00 - 20:30 (1020 - 1230) -> 2.5
  if (m >= 1020 && m <= 1230) {
    return 2.5;
  }
  // Midday: 11:00 - 16:00 (660 - 960) -> 1.0
  if (m >= 660 && m <= 960) {
    return 1.0;
  }
  // Late night: 23:00 - 05:00 -> 0.3
  if (m >= 1380 || m < 300) {
    return 0.3;
  }
  // Shoulder hours
  return 1.2;
}

/**
 * Checks whether trucks are permitted in Dhaka (night hours: 21:00 to 06:00).
 */
export function isTruckAllowedTime(minute: number): boolean {
  const m = ((minute % 1440) + 1440) % 1440;
  return m >= 1260 || m < 360;
}

/**
 * Checks if a candidate position is allowed for spawning.
 * Vehicles MUST NOT spawn inside the camera frustum within 80 m to avoid popping.
 */
export function isSpawnPositionAllowed(
  candidate: { x: number; z: number },
  camera: CameraViewInfo,
  minDist = BALANCE.TRAFFIC.spawnMinDistM
): boolean {
  const dist = distance2d(camera.x, camera.z, candidate.x, candidate.z);

  // If outside 80m, spawn is allowed anywhere
  if (dist >= minDist) {
    return true;
  }

  // Within 80m: check if inside camera frustum cone
  const dx = candidate.x - camera.x;
  const dz = candidate.z - camera.z;
  const angleToCandidate = Math.atan2(dx, dz);
  const angleDelta = Math.abs(angleDiff(camera.heading, angleToCandidate));

  // If within the frustum cone (+- half fov), strictly disallowed
  if (angleDelta <= camera.fovRad / 2) {
    return false;
  }

  return true;
}

export interface BusStopLocation {
  id: string;
  nodeId: string;
  x: number;
  z: number;
}

interface LaneMeta {
  ux: number;
  uz: number;
  heading: number;
  startY: number;
  endY: number;
  laneWidth: number;
  roadType: RoadType;
}

export class TrafficManager {
  readonly network: RoadNetwork;
  readonly laneGraph: LaneGraph;
  readonly signals: SignalController;
  readonly pedestrians: PedestrianManager;
  readonly busStops: BusStopLocation[] = [];
  readonly agents: Map<string, TrafficAgent> = new Map();
  readonly roadEvents?: RoadEventManager;
  private rng: Rng;
  private nextAgentSeq = 0;
  private agentsByLane: Map<string, TrafficAgent[]> = new Map();
  private readonly laneAgentLists: TrafficAgent[][] = [];
  private readonly allLanes: Lane[] = [];
  private readonly laneMeta: Map<string, LaneMeta> = new Map();
  private readonly localLanesScratch: Lane[] = [];
  private readonly innerLanesScratch: Lane[] = [];
  private readonly nextLanesScratch: Lane[] = [];
  private readonly clearNextLanesScratch: Lane[] = [];
  private readonly processScratch: TrafficAgent[] = [];
  private readonly spawnAgentsScratch: TrafficAgent[] = [];
  private readonly deleteIdsScratch: string[] = [];
  private readonly sampleOptsScratch: { minute?: number; roadType?: RoadType; maxWidth?: number } = {};
  private readonly followerScratch = { pos: 0, speed: 0, length: 0 };
  private readonly leaderScratch = { pos: 0, speed: 0, length: 0 };
  private readonly stepOutScratch: CarFollowingResult = { newPos: 0, newSpeed: 0, gap: Infinity };
  private readonly posScratch = { x: 0, y: 0, z: 0 };
  private lastRingScanX = NaN;
  private lastRingScanZ = NaN;
  private hornCooldownS = 0;
  /** The rider this tick, so vehicles can see the bike ahead of them. */
  private bikeView: { x: number; y?: number; z: number; speed: number; heading?: number } | undefined;

  constructor(
    network: RoadNetwork,
    seed = 12345,
    roadEvents?: RoadEventManager
  ) {
    this.network = network;
    this.roadEvents = roadEvents;
    this.laneGraph = buildLanes(network);
    this.signals = new SignalController(network.getAllNodes());
    this.pedestrians = new PedestrianManager(network, seed);
    this.rng = new Rng(seed);

    for (const lane of this.laneGraph.lanes.values()) {
      this.allLanes.push(lane);
      const laneArr: TrafficAgent[] = [];
      this.agentsByLane.set(lane.laneId, laneArr);
      this.laneAgentLists.push(laneArr);
      const p1 = lane.points[0];
      const p2 = lane.points[1];
      const dx = p1 && p2 ? p2.x - p1.x : 0;
      const dz = p1 && p2 ? p2.z - p1.z : 1;
      const len = Math.max(0.1, Math.hypot(dx, dz));
      const sNode = network.getNode(lane.startNodeId);
      const eNode = network.getNode(lane.endNodeId);
      const seg = network.getSegment(lane.segmentId);
      const halfRoad = seg ? (seg.oneWay ? seg.width : seg.width * 0.5) : 3.5;
      const laneWidth = halfRoad / Math.max(1, lane.totalLanesInDirection);
      this.laneMeta.set(lane.laneId, {
        ux: dx / len,
        uz: dz / len,
        heading: Math.atan2(dx, dz),
        startY: sNode?.y ?? 0,
        endY: eNode?.y ?? 0,
        laneWidth,
        roadType: seg?.roadType ?? 'main',
      });
    }

    // Index bus stop POIs
    for (const poi of network.getPois()) {
      if (poi.kind === 'busStop') {
        const node = network.getNode(poi.nodeId);
        this.busStops.push({
          id: poi.id,
          nodeId: poi.nodeId,
          x: node?.x ?? 0,
          z: node?.z ?? 0,
        });
      }
    }
  }

  addBusStop(stop: BusStopLocation): void {
    this.busStops.push(stop);
  }

  getAgents(): TrafficAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Samples a vehicle kind according to authentic Dhaka modal share,
   * respecting time of day (trucks night-only), road type, and lane width.
   */
  sampleVehicleKind(opts?: {
    minute?: number;
    roadType?: RoadType;
    maxWidth?: number;
  }): TrafficVehicleKind {
    const minute = opts?.minute ?? 720;
    const roadType = opts?.roadType;
    const maxWidth = opts?.maxWidth ?? Infinity;
    const isNight = isTruckAllowedTime(minute);

    // 0. Narrow alleys: only two-wheelers (and rickshaws when lane width allows)
    if (roadType === 'alley') {
      const roll = this.rng.next();
      if (maxWidth >= 1.15 && roll < 0.30) return 'rickshaw';
      if (roll < 0.55) return 'motorcycle';
      if (roll < 0.80) return 'scooter';
      return 'bicycle';
    }

    // 1. Market roads: high vendor carts, rickshaws, and bicycles
    if (roadType === 'market') {
      const roll = this.rng.next();
      if (roll < 0.20) return 'vendor_cart';
      if (roll < 0.45) return 'rickshaw';
      if (roll < 0.60) return 'cng';
      if (roll < 0.72) return 'bicycle';
      if (roll < 0.82) return 'motorcycle';
      if (roll < 0.92 && maxWidth >= 1.8) return 'minibus';
      if (maxWidth >= 1.9) return 'delivery_van';
      return 'cng';
    }

    // 1b. Flyovers: motor traffic only (no slow cycle rickshaws or vendor carts)
    if (roadType === 'flyover') {
      const roll = this.rng.next();
      if (isNight && roll < 0.15) return 'truck';
      if (roll < 0.30) return 'cng';
      if (roll < 0.50) return 'car';
      if (roll < 0.62) return 'ride_hailing_car';
      if (roll < 0.76) return 'motorcycle';
      if (roll < 0.86) return 'minibus';
      if (roll < 0.93) return 'delivery_van';
      return 'bus';
    }

    // 2. Night traffic on main roads: trucks permitted
    if (isNight && (roadType === 'main' || roadType === undefined)) {
      const roll = this.rng.next();
      if (roll < 0.15) return 'truck';
      if (roll < 0.35) return 'cng';
      if (roll < 0.50) return 'car';
      if (roll < 0.60) return 'ride_hailing_car';
      if (roll < 0.70) return 'delivery_van';
      if (roll < 0.80) return 'motorcycle';
      if (roll < 0.90) return 'minibus';
      return 'bus';
    }

    // 3. Standard daytime modal share (Dhaka traffic distribution):
    // Trucks strictly disallowed during daytime
    const roll = this.rng.next();
    if (roll < 0.26) return 'cng';
    if (roll < 0.42) return 'car';
    if (roll < 0.54) return 'rickshaw';
    if (roll < 0.64) return 'motorcycle';
    if (roll < 0.72) return 'scooter';
    if (roll < 0.80) return 'ride_hailing_car';
    if (roll < 0.88) return 'minibus';
    if (roll < 0.94) return 'delivery_van';
    if (roll < 0.97) return 'bicycle';
    return 'bus';
  }

  private refreshRingLanes(camera: CameraViewInfo): void {
    this.localLanesScratch.length = 0;
    this.innerLanesScratch.length = 0;

    for (let i = 0; i < this.allLanes.length; i++) {
      const lane = this.allLanes[i]!;
      if (lane.lengthM < 12) continue;
      const p1 = lane.points[0];
      const p2 = lane.points[1];
      if (!p1 || !p2) continue;

      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const lenSq = dx * dx + dz * dz;
      const t =
        lenSq > 0 ? clamp(((camera.x - p1.x) * dx + (camera.z - p1.z) * dz) / lenSq, 0, 1) : 0;
      const minDist = distance2d(camera.x, camera.z, p1.x + dx * t, p1.z + dz * t);
      if (minDist > SPAWN_RING_MAX_M) continue;

      const d1 = distance2d(camera.x, camera.z, p1.x, p1.z);
      const d2 = distance2d(camera.x, camera.z, p2.x, p2.z);
      const maxDist = d1 > d2 ? d1 : d2;
      if (maxDist < SPAWN_RING_MIN_M) continue;

      this.localLanesScratch.push(lane);
      if (minDist <= 200) {
        this.innerLanesScratch.push(lane);
      }
    }

    this.lastRingScanX = camera.x;
    this.lastRingScanZ = camera.z;
  }

  private hasSpawnConflict(
    laneId: string,
    sPos: number,
    posX: number,
    posY: number,
    posZ: number,
    length: number
  ): boolean {
    const minSameLaneGap = Math.max(12, length + 4);
    for (let i = 0; i < this.spawnAgentsScratch.length; i++) {
      const a = this.spawnAgentsScratch[i]!;
      if (a.laneId === laneId) {
        if (Math.abs(a.distAlongLane - sPos) < minSameLaneGap) {
          return true;
        }
      }
      if (Math.abs((a.y ?? 0) - posY) < 2.5) {
        const min2dGap = (a.length + length) * 0.5 + 2.5;
        const dx = posX - a.x;
        const dz = posZ - a.z;
        if (dx * dx + dz * dz < min2dGap * min2dGap) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Spawns traffic agents to match target density inside the active 60m–350m ring
   * around the rider/camera (despawning > 450m) with zero per-tick Array.from() allocations.
   */
  maintainDensity(
    camera: CameraViewInfo,
    currentMinute: number,
    baseTargetDensity = 24
  ): void {
    const timeMult = getTimeOfDayTrafficMultiplier(currentMinute);
    const targetCount = Math.round(baseTargetDensity * timeMult);

    // Maintain pedestrians density too
    this.pedestrians.maintainDensity(camera, currentMinute);

    // Despawn agents outside active retention horizon (> 450 m) and collect active set in one pass
    this.deleteIdsScratch.length = 0;
    this.spawnAgentsScratch.length = 0;
    let near200Count = 0;
    let furthestFarId: string | null = null;
    let furthestFarDist = 300;
    for (const agent of this.agents.values()) {
      const d = distance2d(camera.x, camera.z, agent.x, agent.z);
      if (d > DESPAWN_DIST_M) {
        this.deleteIdsScratch.push(agent.id);
      } else {
        this.spawnAgentsScratch.push(agent);
        if (d <= 200) {
          near200Count++;
        } else if (d > furthestFarDist) {
          furthestFarDist = d;
          furthestFarId = agent.id;
        }
      }
    }
    for (let i = 0; i < this.deleteIdsScratch.length; i++) {
      this.agents.delete(this.deleteIdsScratch[i]!);
    }

    const desiredInner = Math.min(20, Math.ceil(targetCount * 0.45));
    // Rebalance distant (>300m) agents into the local <=200m ring if local traffic thins out
    if (this.agents.size >= targetCount && near200Count < desiredInner && furthestFarId !== null) {
      this.agents.delete(furthestFarId);
    }

    if (this.agents.size >= targetCount || this.allLanes.length === 0) return;

    if (
      Number.isNaN(this.lastRingScanX) ||
      Math.hypot(camera.x - this.lastRingScanX, camera.z - this.lastRingScanZ) > 15
    ) {
      this.refreshRingLanes(camera);
    }

    if (this.localLanesScratch.length === 0) return;

    let attempts = 0;
    while (this.agents.size < targetCount && attempts < 80) {
      attempts++;
      const useInner =
        this.innerLanesScratch.length > 0 &&
        (near200Count < desiredInner || this.rng.next() < 0.55);
      const pool = useInner ? this.innerLanesScratch : this.localLanesScratch;
      const lane = this.rng.pick(pool);

      // Never spawn on closed segments
      if (this.roadEvents?.isSegmentClosed(lane.segmentId)) {
        continue;
      }

      const sPos = this.rng.range(5, lane.lengthM - 5);
      const pos = this.computeLanePositionInto(lane, sPos, 0, this.posScratch);
      const distToCam = distance2d(camera.x, camera.z, pos.x, pos.z);

      if (distToCam < SPAWN_RING_MIN_M || distToCam > SPAWN_RING_MAX_M) {
        continue;
      }
      if (!isSpawnPositionAllowed(pos, camera)) {
        continue;
      }

      const meta = this.laneMeta.get(lane.laneId);
      const seg = this.network.getSegment(lane.segmentId);
      this.sampleOptsScratch.minute = currentMinute;
      this.sampleOptsScratch.roadType = seg?.roadType;
      this.sampleOptsScratch.maxWidth = meta?.laneWidth;
      const kind = this.sampleVehicleKind(this.sampleOptsScratch);
      const cfg = VEHICLE_CONFIGS[kind];

      if (this.hasSpawnConflict(lane.laneId, sPos, pos.x, pos.y, pos.z, cfg.length)) {
        continue;
      }

      const heading = meta ? meta.heading : this.computeLaneHeading(lane);
      const agentId = `veh_${++this.nextAgentSeq}`;
      const lod =
        distToCam <= BALANCE.TRAFFIC.lod.near
          ? 'near'
          : distToCam <= BALANCE.TRAFFIC.lod.mid
            ? 'mid'
            : 'far';

      // Check speed cap from road events
      const speedCapKmh = this.roadEvents?.getSpeedCap(lane.segmentId);
      const speedCapMs = speedCapKmh !== undefined ? speedCapKmh / 3.6 : Infinity;
      const effectiveLaneSpeedLimit = Math.min(lane.speedLimitMs, speedCapMs);

      // Rare wrong-way rickshaw on residential lanes
      const isWrongWay =
        kind === 'rickshaw' &&
        seg?.roadType === 'residential' &&
        this.rng.next() < 0.08;
      const initLat = isWrongWay ? 0.5 : 0;
      if (initLat !== 0) {
        this.computeLanePositionInto(lane, sPos, initLat, this.posScratch);
      }

      const newAgent: TrafficAgent = {
        id: agentId,
        kind,
        laneId: lane.laneId,
        distAlongLane: sPos,
        speed: Math.min(cfg.desiredSpeedMs, effectiveLaneSpeedLimit) * 0.8,
        x: pos.x,
        y: pos.y,
        z: pos.z,
        heading: isWrongWay ? heading + Math.PI : heading,
        length: cfg.length,
        width: cfg.width,
        desiredSpeed: Math.min(cfg.desiredSpeedMs, effectiveLaneSpeedLimit),
        lod,
        lodAccum: 0,
        lateralOffset: initLat,
        targetLateralOffset: initLat,
        weavePhase: kind === 'cng' ? this.rng.range(0, Math.PI * 2) : undefined,
        isWrongWay,
      };
      this.agents.set(agentId, newAgent);
      this.spawnAgentsScratch.push(newAgent);

      if (distToCam <= 200) {
        near200Count++;
      }
    }
  }

  private computeLanePositionInto(
    lane: Lane,
    distAlongLane: number,
    lateralOffset: number,
    out: { x: number; y: number; z: number }
  ): { x: number; y: number; z: number } {
    if (lane.points.length < 2) {
      out.x = 0;
      out.y = 0;
      out.z = 0;
      return out;
    }
    const p1 = lane.points[0]!;
    const p2 = lane.points[1]!;
    const t = clamp(distAlongLane / Math.max(0.1, lane.lengthM), 0, 1);
    const baseX = p1.x + (p2.x - p1.x) * t;
    const baseZ = p1.z + (p2.z - p1.z) * t;
    const meta = this.laneMeta.get(lane.laneId);
    out.y = meta ? meta.startY + (meta.endY - meta.startY) * t : 0;

    if (Math.abs(lateralOffset) > 0.001) {
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        const leftX = dz / len;
        const leftZ = -dx / len;
        out.x = baseX + leftX * lateralOffset;
        out.z = baseZ + leftZ * lateralOffset;
        return out;
      }
    }

    out.x = baseX;
    out.z = baseZ;
    return out;
  }

  computeLanePosition(
    lane: Lane,
    distAlongLane: number,
    lateralOffset = 0
  ): { x: number; z: number } {
    const scratch = { x: 0, y: 0, z: 0 };
    this.computeLanePositionInto(lane, distAlongLane, lateralOffset, scratch);
    return { x: scratch.x, z: scratch.z };
  }

  /** Checks whether `nextLane` has rear clearance at dist=0 for `agent` without overlapping. */
  private hasNextLaneRearClearance(agent: TrafficAgent, nextLane: Lane): boolean {
    const nextAgents = this.agentsByLane.get(nextLane.laneId);
    if (!nextAgents || nextAgents.length === 0) return true;
    const requiredClearance = agent.length * 0.5 + 1.5;
    for (let i = 0; i < nextAgents.length; i++) {
      const other = nextAgents[i]!;
      if (other.id === agent.id) continue;
      const otherRear = other.distAlongLane - other.length * 0.5;
      if (otherRear < requiredClearance) {
        return false;
      }
    }
    return true;
  }

  private isVehicleCompatibleWithLane(agent: TrafficAgent, nextLane: Lane): boolean {
    if (this.roadEvents?.isSegmentClosed(nextLane.segmentId)) return false;
    const meta = this.laneMeta.get(nextLane.laneId);
    if (!meta) return true;
    if (meta.roadType === 'alley' && agent.width > 1.15) return false;
    if (meta.laneWidth < agent.width - 0.05) return false;
    return true;
  }

  private fillCompatibleOutgoingLanes(agent: TrafficAgent, lane: Lane): void {
    this.nextLanesScratch.length = 0;
    this.clearNextLanesScratch.length = 0;
    const outgoing = this.laneGraph.outgoingLanes.get(lane.laneId);
    if (!outgoing) return;
    for (let i = 0; i < outgoing.length; i++) {
      const nl = outgoing[i]!;
      if (!this.isVehicleCompatibleWithLane(agent, nl)) continue;
      this.nextLanesScratch.push(nl);
      if (this.hasNextLaneRearClearance(agent, nl)) {
        this.clearNextLanesScratch.push(nl);
      }
    }
  }

  /**
   * Checks junction right-of-way at endNode via SignalController.canAcceptGap()
   * and verifies outgoing lane rear clearance before entering the junction box.
   */
  private canEnterJunction(agent: TrafficAgent, lane: Lane): boolean {
    const endNode = this.network.getNode(lane.endNodeId);
    if (!endNode) return true;

    const myDistToNode = lane.lengthM - agent.distAlongLane;
    const myMeta = this.laneMeta.get(lane.laneId);
    const myHeading = myMeta ? myMeta.heading : this.computeLaneHeading(lane);

    // 1. Ensure at least one compatible outgoing lane has rear clearance (or no outgoing lanes = despawn)
    this.fillCompatibleOutgoingLanes(agent, lane);
    if (this.nextLanesScratch.length > 0 && this.clearNextLanesScratch.length === 0) {
      return false;
    }

    // 2. Unsignaled junction right-of-way using SignalController.canAcceptGap()
    if (!endNode.signal) {
      const incoming = this.laneGraph.lanesByNode.get(lane.endNodeId);
      if (incoming) {
        const myIsPriority = myMeta?.roadType === 'main' || myMeta?.roadType === 'flyover';
        for (let i = 0; i < incoming.length; i++) {
          const otherLane = incoming[i]!;
          if (otherLane.segmentId === lane.segmentId) continue;
          const otherMeta = this.laneMeta.get(otherLane.laneId);
          const otherHeading = otherMeta ? otherMeta.heading : this.computeLaneHeading(otherLane);
          // Only cross/conflicting approaches conflict
          if (Math.abs(Math.sin(angleDiff(myHeading, otherHeading))) <= 0.3) continue;

          const otherAgents = this.agentsByLane.get(otherLane.laneId);
          if (!otherAgents) continue;

          const otherIsPriority = otherMeta?.roadType === 'main' || otherMeta?.roadType === 'flyover';
          for (let j = 0; j < otherAgents.length; j++) {
            const other = otherAgents[j]!;
            if (other.isWrongWay) continue;
            const otherDistToNode = otherLane.lengthM - other.distAlongLane;
            if (otherDistToNode < 0 || otherDistToNode > 50) continue;

            // Vehicle already inside intersection edge has unconditional right of way
            if (otherDistToNode < 4.5 && other.speed > 0.2) {
              return false;
            }

            if (other.speed > 0.5) {
              const otherCloser = otherDistToNode < myDistToNode - 1.5;
              const sameDist = Math.abs(otherDistToNode - myDistToNode) <= 1.5;
              const priorityHigher = otherIsPriority && !myIsPriority;
              const samePriority = otherIsPriority === myIsPriority;
              const tieWinner =
                otherCloser ||
                (sameDist && (priorityHigher || (samePriority && other.id < agent.id)));

              if (tieWinner && !this.signals.canAcceptGap(otherDistToNode, other.speed, 3.5)) {
                return false;
              }
            }
          }
        }
      }

      // Check if any conflicting vehicle is physically clearing the center of the junction
      const outgoing = this.laneGraph.outgoingLanes.get(lane.laneId);
      if (outgoing) {
        for (let i = 0; i < outgoing.length; i++) {
          const outLane = outgoing[i]!;
          if (outLane.segmentId === lane.segmentId) continue;
          const outAgents = this.agentsByLane.get(outLane.laneId);
          if (!outAgents) continue;
          for (let j = 0; j < outAgents.length; j++) {
            const other = outAgents[j]!;
            if (distance2d(other.x, other.z, endNode.x, endNode.z) < 5.5) {
              return false;
            }
          }
        }
      }

      // Check if player bike is fast-approaching the unsignaled junction on a cross street
      const bike = this.bikeView;
      if (
        bike &&
        bike.heading !== undefined &&
        bike.speed > 2.0 &&
        (bike.y === undefined || Math.abs(bike.y - (endNode.y ?? 0)) <= 2.5)
      ) {
        const toNodeX = endNode.x - bike.x;
        const toNodeZ = endNode.z - bike.z;
        const distBike = Math.hypot(toNodeX, toNodeZ);
        if (distBike > 1.0 && distBike < 35.0) {
          const dirDot =
            (Math.sin(bike.heading) * toNodeX + Math.cos(bike.heading) * toNodeZ) / distBike;
          const headingDiff = Math.abs(Math.sin(angleDiff(myHeading, bike.heading)));
          if (
            dirDot > 0.7 &&
            headingDiff > 0.3 &&
            myDistToNode > 5.0 &&
            !this.signals.canAcceptGap(distBike, bike.speed, 3.0)
          ) {
            return false;
          }
        }
      }
    }

    return true;
  }

  /**
   * The nearest thing ahead that the agent must respect: the vehicle in front,
   * a red (or unsafe yellow) signal / junction yield at the stop line, an upcoming
   * bus stop target, or the bike in its lane (with signed velocity projection).
   * Writes into `this.leaderScratch` to stay allocation-free.
   */
  private effectiveLeader(
    agent: TrafficAgent,
    lane: Lane,
    leader: TrafficAgent | null,
    busStopTargetPos: number | null
  ): { pos: number; speed: number; length: number } | null {
    let hasBest = false;
    const best = this.leaderScratch;

    if (leader) {
      best.pos = leader.distAlongLane;
      best.speed = leader.speed;
      best.length = leader.length;
      hasBest = true;
    }

    const stopPos = lane.lengthM - STOP_LINE_SETBACK_M;
    const distToStop = stopPos - agent.distAlongLane;
    if (
      this.signalHoldsAt(agent, lane, stopPos) ||
      (distToStop >= 0 && distToStop <= 25 && !this.canEnterJunction(agent, lane))
    ) {
      if (!hasBest || stopPos < best.pos - best.length * 0.5) {
        best.pos = stopPos;
        best.speed = 0;
        best.length = 0;
        hasBest = true;
      }
    }

    if (busStopTargetPos !== null) {
      if (!hasBest || busStopTargetPos < best.pos - best.length * 0.5) {
        best.pos = busStopTargetPos;
        best.speed = 0;
        best.length = 0;
        hasBest = true;
      }
    }

    const bike = this.bikeView;
    if (
      bike &&
      (bike.y === undefined || Math.abs(bike.y - (agent.y ?? 0)) <= 2.5)
    ) {
      const along = this.projectOntoLane(lane, bike.x, bike.z);
      if (along !== null && along > agent.distAlongLane) {
        const meta = this.laneMeta.get(lane.laneId);
        let projSpeed = Math.max(0, bike.speed);
        if (bike.heading !== undefined && meta) {
          const dot = Math.sin(bike.heading) * meta.ux + Math.cos(bike.heading) * meta.uz;
          projSpeed = bike.speed * dot;
        }
        const rear = along - BIKE_LENGTH_M / 2;
        if (!hasBest || rear < best.pos - best.length * 0.5) {
          best.pos = along;
          best.speed = projSpeed;
          best.length = BIKE_LENGTH_M;
          hasBest = true;
        }
      }
    }

    return hasBest ? best : null;
  }

  /** True when the agent must stop for the light at the end of its lane. */
  private signalHoldsAt(agent: TrafficAgent, lane: Lane, stopPos: number): boolean {
    const node = this.network.getNode(lane.endNodeId);
    if (!node?.signal) return false;
    const distToLine = stopPos - agent.distAlongLane;
    if (distToLine < 0 || distToLine > SIGNAL_REACT_RANGE_M) return false;

    // Phase 0 serves east-west approaches, phase 1 north-south.
    const meta = this.laneMeta.get(lane.laneId);
    const heading = meta ? meta.heading : this.computeLaneHeading(lane);
    const approach = Math.abs(Math.sin(heading)) >= Math.abs(Math.cos(heading)) ? 0 : 1;
    const status = this.signals.getSignalStatus(node.nodeId, approach);
    if (status === 'red') return true;
    // Yellow: stop only if the vehicle can stop short of the line, otherwise go through.
    if (status === 'yellow') return distToLine > agent.speed * 1.5;
    return false;
  }

  /** Distance along the lane where a point lies, or null if it is off the lane. */
  private projectOntoLane(lane: Lane, x: number, z: number): number | null {
    const p1 = lane.points[0];
    const p2 = lane.points[1];
    if (!p1 || !p2) return null;
    const dx = p2.x - p1.x;
    const dz = p2.z - p1.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.1) return null;
    const ux = dx / len;
    const uz = dz / len;
    const rx = x - p1.x;
    const rz = z - p1.z;
    const along = rx * ux + rz * uz;
    const lateral = rx * uz - rz * ux;
    if (along < 0 || along > lane.lengthM || Math.abs(lateral) > BIKE_LANE_HALF_WIDTH_M) {
      return null;
    }
    return along;
  }

  computeLaneHeading(lane: Lane): number {
    if (lane.points.length < 2) return 0;
    const p1 = lane.points[0]!;
    const p2 = lane.points[1]!;
    return Math.atan2(p2.x - p1.x, p2.z - p1.z);
  }

  /** Returns the agent's interpolated Y elevation (falling back to lane endpoints if unset). */
  getAgentY(agent: TrafficAgent): number {
    if (agent.y !== undefined) return agent.y;
    const meta = this.laneMeta.get(agent.laneId);
    const lane = this.laneGraph.lanes.get(agent.laneId);
    if (!meta || !lane) return 0;
    const t = clamp(agent.distAlongLane / Math.max(0.1, lane.lengthM), 0, 1);
    return meta.startY + (meta.endY - meta.startY) * t;
  }

  /**
   * Triggers 0.4s-debounced horn yield on pedestrians, rickshaws, bicycles, motorcycles, and carts
   * using gentle lateral yield / speed-clear instead of freezing traffic in the player's path.
   */
  triggerHorn(
    hornPos: { x: number; z: number },
    radius = 15
  ): { pedsYielded: number; rickshawsYielded: number } {
    if (this.hornCooldownS > 0) {
      return { pedsYielded: 0, rickshawsYielded: 0 };
    }
    this.hornCooldownS = HORN_COOLDOWN_S;

    const pedsYielded = this.pedestrians.triggerHorn(hornPos, radius);
    let rickshawsYielded = 0;

    for (const agent of this.agents.values()) {
      if (
        agent.kind === 'rickshaw' ||
        agent.kind === 'motorcycle' ||
        agent.kind === 'bicycle' ||
        agent.kind === 'vendor_cart'
      ) {
        const dist = distance2d(hornPos.x, hornPos.z, agent.x, agent.z);
        if (dist <= radius) {
          const wasYielding = (agent.yieldTimer ?? 0) > 0;
          agent.yieldTimer = 2.5;
          if (!wasYielding) {
            agent.speed *= 0.85;
          }
          // Yield laterally toward left kerb (or away from horn source) rather than freezing
          const lane = this.laneGraph.lanes.get(agent.laneId);
          const meta = this.laneMeta.get(agent.laneId);
          if (lane && lane.points[0] && meta) {
            const hornLat =
              (hornPos.x - lane.points[0].x) * meta.uz -
              (hornPos.z - lane.points[0].z) * meta.ux;
            const maxLat = Math.max(0.35, Math.min(0.75, (meta.laneWidth - agent.width) * 0.45));
            agent.targetLateralOffset = hornLat <= (agent.lateralOffset ?? 0) ? maxLat : -maxLat;
          } else {
            agent.targetLateralOffset = 0.5;
          }
          rickshawsYielded++;
        }
      }
    }

    return { pedsYielded, rickshawsYielded };
  }

  /** Reports an accident at (x, z) so nearby pedestrians react immediately. */
  reportAccident(x: number, z: number, radius = 5): void {
    this.pedestrians.reportAccident(x, z, radius);
  }

  private removeFromLaneList(laneId: string, agent: TrafficAgent): void {
    const list = this.agentsByLane.get(laneId);
    if (!list) return;
    const idx = list.indexOf(agent);
    if (idx >= 0) {
      list.splice(idx, 1);
    }
  }

  update(
    dt: number,
    camera?: CameraViewInfo,
    player?: { x: number; y?: number; z: number; speed: number; heading?: number },
    wet = false
  ): void {
    this.hornCooldownS = Math.max(0, this.hornCooldownS - dt);
    this.signals.update(dt);
    this.bikeView = player;

    // Group agents by lane using pooled arrays (zero per-tick Map/array allocations)
    for (let i = 0; i < this.laneAgentLists.length; i++) {
      this.laneAgentLists[i]!.length = 0;
    }
    this.processScratch.length = 0;
    for (const agent of this.agents.values()) {
      let laneList = this.agentsByLane.get(agent.laneId);
      if (!laneList) {
        laneList = [];
        this.agentsByLane.set(agent.laneId, laneList);
        this.laneAgentLists.push(laneList);
      }
      laneList.push(agent);
    }

    // Sort agents on each lane by distAlongLane descending (leader first) and queue for processing
    for (let i = 0; i < this.laneAgentLists.length; i++) {
      const laneAgents = this.laneAgentLists[i]!;
      if (laneAgents.length === 0) continue;
      if (laneAgents.length > 1) {
        laneAgents.sort(compareAgentDistDesc);
      }
      for (let j = 0; j < laneAgents.length; j++) {
        this.processScratch.push(laneAgents[j]!);
      }
    }

    this.pedestrians.update(dt, player, camera, this.processScratch, wet);

    // Update each agent using per-class IDM car following & LOD tick throttling
    for (let idx = 0; idx < this.processScratch.length; idx++) {
      const agent = this.processScratch[idx]!;
      if (!this.agents.has(agent.id)) continue;

      const lane = this.laneGraph.lanes.get(agent.laneId);
      if (!lane) continue;

      if (camera) {
        const d = distance2d(camera.x, camera.z, agent.x, agent.z);
        agent.lod =
          d <= BALANCE.TRAFFIC.lod.near
            ? 'near'
            : d <= BALANCE.TRAFFIC.lod.mid
              ? 'mid'
              : 'far';
      }

      // LOD tick throttling: 60Hz near / 20Hz mid / 5Hz far
      let effDt = dt;
      if (agent.lod === 'mid') {
        const acc = (agent.lodAccum ?? 0) + dt;
        if (acc < MID_LOD_STEP_S - 1e-6) {
          agent.lodAccum = acc;
          continue;
        }
        effDt = acc;
        agent.lodAccum = 0;
      } else if (agent.lod === 'far') {
        const acc = (agent.lodAccum ?? 0) + dt;
        if (acc < FAR_LOD_STEP_S - 1e-6) {
          agent.lodAccum = acc;
          continue;
        }
        effDt = acc;
        agent.lodAccum = 0;
      } else if (agent.lodAccum) {
        effDt = dt + agent.lodAccum;
        agent.lodAccum = 0;
      }

      const meta = this.laneMeta.get(lane.laneId);
      const laneAgents = this.agentsByLane.get(agent.laneId);

      // Handle wrong-way rickshaw separately (check obstacles so it never ghosts through stopped traffic)
      if (agent.isWrongWay) {
        let blockedAhead = false;
        if (laneAgents) {
          for (let j = 0; j < laneAgents.length; j++) {
            const other = laneAgents[j]!;
            if (other === agent) continue;
            const gapBehind = agent.distAlongLane - other.distAlongLane;
            const minLong = (agent.length + other.length) * 0.5 + 1.5;
            if (gapBehind > 0 && gapBehind < minLong + 2.0) {
              const latDiff = Math.abs((other.lateralOffset ?? 0) - (agent.lateralOffset ?? 0.4));
              if (latDiff < (agent.width + other.width) * 0.5 + 0.2) {
                blockedAhead = true;
                break;
              }
            }
          }
        }
        agent.speed = blockedAhead ? 0 : 2.5;
        agent.distAlongLane -= agent.speed * effDt;
        if (agent.distAlongLane <= 0) {
          this.agents.delete(agent.id);
          this.removeFromLaneList(lane.laneId, agent);
          continue;
        }

        const pos = this.computeLanePositionInto(
          lane,
          agent.distAlongLane,
          agent.lateralOffset ?? 0.4,
          this.posScratch
        );
        agent.x = pos.x;
        agent.y = pos.y;
        agent.z = pos.z;
        const normalHeading = meta ? meta.heading : this.computeLaneHeading(lane);
        agent.heading = normalHeading + Math.PI;
        continue;
      }

      // Find nearest non-wrong-way leader ahead on the same lane
      let leader: TrafficAgent | null = null;
      if (laneAgents) {
        for (let j = 0; j < laneAgents.length; j++) {
          const cand = laneAgents[j]!;
          if (cand === agent || cand.isWrongWay) continue;
          if (cand.distAlongLane > agent.distAlongLane) {
            if (!leader || cand.distAlongLane < leader.distAlongLane) {
              leader = cand;
            }
          }
        }
      }

      // Speed limit including active road event speed caps and congestion
      const speedCapKmh = this.roadEvents?.getSpeedCap(lane.segmentId);
      const speedCapMs = speedCapKmh !== undefined ? speedCapKmh / 3.6 : Infinity;
      const congMult = this.roadEvents?.getCongestionMultiplier(lane.segmentId) ?? 1.0;
      const effectiveLaneSpeedLimit = Math.min(lane.speedLimitMs, speedCapMs) / Math.max(1.0, Math.sqrt(congMult));
      let baseDesired = Math.min(
        VEHICLE_CONFIGS[agent.kind].desiredSpeedMs,
        effectiveLaneSpeedLimit
      );

      // Clear lastDwellPoiId once the bus has traveled well past that stop
      if (agent.lastDwellPoiId) {
        for (let i = 0; i < this.busStops.length; i++) {
          const st = this.busStops[i]!;
          if (st.id === agent.lastDwellPoiId && distance2d(agent.x, agent.z, st.x, st.z) > 25) {
            agent.lastDwellPoiId = undefined;
            break;
          }
        }
      }

      // 1. Bus and minibus: lane-direction-aware dwell & smooth braking into bus stops
      let busStopTargetPos: number | null = null;
      if (agent.kind === 'bus' || agent.kind === 'minibus') {
        if (agent.dwellTimer !== undefined && agent.dwellTimer > 0) {
          agent.dwellTimer -= effDt;
          agent.speed = 0;
          agent.isDwelling = true;
          agent.isRacingToStop = false;
          if (agent.dwellTimer <= 0) {
            agent.dwellTimer = 0;
            agent.isDwelling = false;
          }
        } else {
          let bestStop: BusStopLocation | null = null;
          let bestAlong = 0;
          let bestForwardDist = Infinity;
          let bestEuclidDist = Infinity;

          const p1 = lane.points[0];
          if (p1 && meta) {
            for (let i = 0; i < this.busStops.length; i++) {
              const stop = this.busStops[i]!;
              if (agent.lastDwellPoiId === stop.id) continue;
              const rx = stop.x - p1.x;
              const rz = stop.z - p1.z;
              const along = rx * meta.ux + rz * meta.uz;
              const lat = Math.abs(rx * meta.uz - rz * meta.ux);
              // Stop must serve this lane corridor (excludes opposite divided carriageway)
              if (lat > 10.0 || along < -5.0 || along > lane.lengthM + 10.0) continue;

              const forwardDist = along - agent.distAlongLane;
              // Must be ahead or right at the stop (never behind the bus)
              if (forwardDist < -3.0) continue;

              if (forwardDist < bestForwardDist) {
                bestStop = stop;
                bestAlong = along;
                bestForwardDist = forwardDist;
                bestEuclidDist = distance2d(agent.x, agent.z, stop.x, stop.z);
              }
            }
          }

          if (
            bestStop &&
            ((bestEuclidDist < 3.5 && bestForwardDist <= 4.0) ||
              (bestEuclidDist < 8.0 && bestForwardDist <= 6.0 && agent.speed <= 2.5))
          ) {
            // Arrived smoothly (or placed at stop) -> dwell
            agent.dwellTimer = this.rng.range(10, 20);
            agent.lastDwellPoiId = bestStop.id;
            agent.speed = 0;
            agent.isDwelling = true;
            agent.isRacingToStop = false;
          } else if (
            bestStop &&
            bestForwardDist >= 20.0 &&
            bestForwardDist <= 120.0 &&
            (!leader || leader.distAlongLane - agent.distAlongLane > 25.0)
          ) {
            // Approaching stop with clear road ahead -> race to the stop!
            agent.isRacingToStop = true;
            baseDesired = Math.min(
              VEHICLE_CONFIGS[agent.kind].desiredSpeedMs * 1.25,
              effectiveLaneSpeedLimit * 1.25
            );
          } else {
            agent.isRacingToStop = false;
            if (bestStop && bestForwardDist >= 0 && bestForwardDist < 20.0) {
              // Smooth IDM braking target into the bus stop
              busStopTargetPos = Math.max(
                agent.distAlongLane + 0.1,
                bestAlong + agent.length * 0.5 + 1.0
              );
            }
          }
        }
      }
      agent.desiredSpeed = baseDesired;

      // 2. Lateral behavior: CNG weaving, oncoming player swerve, or horn yield
      let desiredLat = 0;
      let latRate = 1.8;

      if (agent.kind === 'cng') {
        agent.weavePhase = (agent.weavePhase ?? 0) + 2.0 * effDt;
        desiredLat = clamp(Math.sin(agent.weavePhase) * 0.5, -0.6, 0.6);
        agent.lateralOffset = desiredLat;
      }

      if (agent.yieldTimer !== undefined && agent.yieldTimer > 0) {
        agent.yieldTimer -= effDt;
        // Speed-clear at ~85% normal speed while stepping laterally toward kerb (never freeze)
        agent.desiredSpeed = Math.min(baseDesired, VEHICLE_CONFIGS[agent.kind].desiredSpeedMs * 0.85);
        desiredLat = agent.targetLateralOffset ?? 0.5;
        latRate = 2.0;
        if (agent.yieldTimer <= 0) {
          agent.yieldTimer = 0;
          agent.targetLateralOffset = 0;
        }
      }

      // Check oncoming player bike on the same lane -> swerve laterally out of head-on path
      const bike = this.bikeView;
      if (
        bike &&
        bike.heading !== undefined &&
        meta &&
        lane.points[0] &&
        (bike.y === undefined || Math.abs(bike.y - (agent.y ?? 0)) <= 2.5)
      ) {
        const alongBike = this.projectOntoLane(lane, bike.x, bike.z);
        if (alongBike !== null && alongBike > agent.distAlongLane && alongBike - agent.distAlongLane <= 55) {
          const dot = Math.sin(bike.heading) * meta.ux + Math.cos(bike.heading) * meta.uz;
          if (bike.speed * dot < -0.5) {
            const bikeLat =
              (bike.x - lane.points[0].x) * meta.uz -
              (bike.z - lane.points[0].z) * meta.ux;
            const maxLat = Math.max(0.35, Math.min(0.8, (meta.laneWidth - agent.width) * 0.45));
            desiredLat = bikeLat <= (agent.lateralOffset ?? 0) ? maxLat : -maxLat;
            latRate = 3.2;
            agent.desiredSpeed = Math.min(agent.desiredSpeed, 2.0);
          }
        }
      }

      if (agent.kind !== 'cng' || desiredLat !== 0 || Math.abs(agent.lateralOffset ?? 0) > 0.001) {
        if (agent.kind !== 'cng') {
          const curLat = agent.lateralOffset ?? 0;
          const diffLat = desiredLat - curLat;
          if (Math.abs(diffLat) > 0.001) {
            agent.lateralOffset = curLat + clamp(diffLat, -latRate * effDt, latRate * effDt);
          }
        } else if (latRate > 2.5) {
          // Oncoming swerve overrides normal CNG weave temporarily (still clamped inside lane)
          const curLat = agent.lateralOffset ?? 0;
          const diffLat = desiredLat - curLat;
          agent.lateralOffset = clamp(
            curLat + clamp(diffLat, -latRate * effDt, latRate * effDt),
            -0.6,
            0.6
          );
        }
      }

      // 3. Position update via per-class IDM or dwell
      if (agent.isDwelling) {
        agent.speed = 0;
      } else {
        this.followerScratch.pos = agent.distAlongLane;
        this.followerScratch.speed = agent.speed;
        this.followerScratch.length = agent.length;

        const leaderItem = this.effectiveLeader(agent, lane, leader, busStopTargetPos);

        const step = stepCarFollowing(
          this.followerScratch,
          leaderItem,
          agent.desiredSpeed,
          effDt,
          getIdmParams(agent.kind),
          this.stepOutScratch
        );

        agent.distAlongLane = step.newPos;
        agent.speed = step.newSpeed;
      }

      // 4. Lane transition with rear-clearance check (prevents teleport-fusing)
      if (agent.distAlongLane >= lane.lengthM) {
        this.fillCompatibleOutgoingLanes(agent, lane);

        if (this.nextLanesScratch.length === 0) {
          // No open compatible outgoing lane -> despawn cleanly
          this.agents.delete(agent.id);
          this.removeFromLaneList(lane.laneId, agent);
          continue;
        }

        if (this.clearNextLanesScratch.length === 0) {
          // Outgoing lanes currently occupied at entrance -> hold at lane end without overlapping
          agent.distAlongLane = lane.lengthM;
          agent.speed = 0;
        } else {
          let nextLane: Lane | undefined;
          if (agent.nextLaneId) {
            for (let i = 0; i < this.clearNextLanesScratch.length; i++) {
              if (this.clearNextLanesScratch[i]!.laneId === agent.nextLaneId) {
                nextLane = this.clearNextLanesScratch[i];
                break;
              }
            }
          }
          if (!nextLane) {
            nextLane = this.rng.pick(this.clearNextLanesScratch);
          }

          this.removeFromLaneList(lane.laneId, agent);
          let nextList = this.agentsByLane.get(nextLane.laneId);
          if (!nextList) {
            nextList = [];
            this.agentsByLane.set(nextLane.laneId, nextList);
            this.laneAgentLists.push(nextList);
          }
          nextList.push(agent);

          agent.laneId = nextLane.laneId;
          agent.distAlongLane = 0;
          agent.nextLaneId = undefined;
          const nextSpeedCap = this.roadEvents?.getSpeedCap(nextLane.segmentId);
          const nextLimit =
            nextSpeedCap !== undefined
              ? Math.min(nextLane.speedLimitMs, nextSpeedCap / 3.6)
              : nextLane.speedLimitMs;
          agent.desiredSpeed = Math.min(
            VEHICLE_CONFIGS[agent.kind].desiredSpeedMs,
            nextLimit
          );
        }
      }

      // 5. Update spatial position (x, y, z) and heading (rickshaws and vendor carts turn slowly)
      const updatedLane = this.laneGraph.lanes.get(agent.laneId) ?? lane;
      const updatedMeta = this.laneMeta.get(updatedLane.laneId);
      const pos = this.computeLanePositionInto(
        updatedLane,
        agent.distAlongLane,
        agent.lateralOffset ?? 0,
        this.posScratch
      );
      agent.x = pos.x;
      agent.y = pos.y;
      agent.z = pos.z;

      const targetHeading = updatedMeta ? updatedMeta.heading : this.computeLaneHeading(updatedLane);
      if (agent.kind === 'rickshaw' || agent.kind === 'vendor_cart') {
        const diff = angleDiff(agent.heading, targetHeading);
        const maxTurnThisFrame = 1.2 * effDt;
        agent.heading += clamp(diff, -maxTurnThisFrame, maxTurnThisFrame);
      } else {
        agent.heading = targetHeading;
      }
    }
  }
}
