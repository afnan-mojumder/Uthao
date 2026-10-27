import type { RoadNetwork } from '../road/RoadNetwork';
import { buildLanes, type Lane, type LaneGraph } from '../road/lanes';
import { stepCarFollowing } from './idm';
import { SignalController } from './signals';
import { PedestrianManager } from './pedestrians';
import { Rng } from '../../core/rng';
import { distance2d, angleDiff, clamp } from '../../core/math';
import { BALANCE } from '../../config/balance';
import type { RoadType } from '../../core/types';
import type { RoadEventManager } from '../world/RoadEvents';

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
  desiredSpeedMs: number;
}

export const VEHICLE_CONFIGS: Record<TrafficVehicleKind, VehicleDimensions> = {
  car: { length: 4.5, width: 1.8, desiredSpeedMs: 50 / 3.6 },
  bus: { length: 8.0, width: 2.4, desiredSpeedMs: 40 / 3.6 },
  motorcycle: { length: 2.0, width: 0.8, desiredSpeedMs: 55 / 3.6 },
  cng: { length: 2.8, width: 1.3, desiredSpeedMs: 43 / 3.6 },
  rickshaw: { length: 2.2, width: 1.1, desiredSpeedMs: 3.5 }, // slow 3-4 m/s per GDD §11
  minibus: { length: 4.8, width: 1.8, desiredSpeedMs: 42 / 3.6 }, // leguna
  delivery_van: { length: 5.0, width: 1.9, desiredSpeedMs: 45 / 3.6 },
  truck: { length: 9.5, width: 2.5, desiredSpeedMs: 35 / 3.6 }, // night only
  bicycle: { length: 1.8, width: 0.6, desiredSpeedMs: 16 / 3.6 },
  scooter: { length: 1.9, width: 0.7, desiredSpeedMs: 45 / 3.6 },
  ride_hailing_car: { length: 4.5, width: 1.8, desiredSpeedMs: 48 / 3.6 },
  vendor_cart: { length: 2.2, width: 1.3, desiredSpeedMs: 7.2 / 3.6 }, // 2.0 m/s
};

export interface TrafficAgent {
  id: string;
  kind: TrafficVehicleKind;
  laneId: string;
  distAlongLane: number; // m from lane start
  speed: number; // m/s
  x: number;
  z: number;
  heading: number; // radians
  length: number;
  width: number;
  desiredSpeed: number;
  lod: 'near' | 'mid' | 'far';
  dwellTimer?: number;
  lastDwellPoiId?: string;
  isDwelling?: boolean;
  yieldTimer?: number;
  lateralOffset?: number;
  weavePhase?: number;
  isRacingToStop?: boolean;
  isWrongWay?: boolean;
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
   * respecting time of day (trucks night-only) and road type.
   */
  sampleVehicleKind(opts?: { minute?: number; roadType?: RoadType }): TrafficVehicleKind {
    const minute = opts?.minute ?? 720;
    const roadType = opts?.roadType;
    const isNight = isTruckAllowedTime(minute);

    // 1. Market roads: high vendor carts, rickshaws, and bicycles
    if (roadType === 'market') {
      const roll = this.rng.next();
      if (roll < 0.20) return 'vendor_cart';
      if (roll < 0.45) return 'rickshaw';
      if (roll < 0.60) return 'cng';
      if (roll < 0.72) return 'bicycle';
      if (roll < 0.82) return 'motorcycle';
      if (roll < 0.92) return 'minibus';
      return 'delivery_van';
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

  /**
   * Spawns traffic agents to match target density around rider/camera.
   */
  maintainDensity(
    camera: CameraViewInfo,
    currentMinute: number,
    baseTargetDensity = 12
  ): void {
    const timeMult = getTimeOfDayTrafficMultiplier(currentMinute);
    const targetCount = Math.round(baseTargetDensity * timeMult);

    // Maintain pedestrians density too
    this.pedestrians.maintainDensity(camera, currentMinute);

    // Despawn agents too far from camera (> 450 m)
    for (const [id, agent] of this.agents.entries()) {
      const d = distance2d(camera.x, camera.z, agent.x, agent.z);
      if (d > BALANCE.TRAFFIC.lod.far) {
        this.agents.delete(id);
      }
    }

    // Spawn new agents if below target count
    const allLanes = Array.from(this.laneGraph.lanes.values());
    if (allLanes.length === 0) return;

    let attempts = 0;
    while (this.agents.size < targetCount && attempts < 50) {
      attempts++;
      const lane = this.rng.pick(allLanes);

      // Never spawn on closed segments
      if (this.roadEvents?.isSegmentClosed(lane.segmentId)) {
        continue;
      }

      const sPos = this.rng.range(5, Math.max(6, lane.lengthM - 5));

      const pos = this.computeLanePosition(lane, sPos);
      if (!isSpawnPositionAllowed(pos, camera)) {
        continue;
      }

      // Ensure no existing agent on this lane is within 10 m
      const conflict = Array.from(this.agents.values()).some(
        (a) => a.laneId === lane.laneId && Math.abs(a.distAlongLane - sPos) < 10
      );
      if (conflict) continue;

      const seg = this.network.getSegment(lane.segmentId);
      const kind = this.sampleVehicleKind({
        minute: currentMinute,
        roadType: seg?.roadType,
      });
      const cfg = VEHICLE_CONFIGS[kind];
      const heading = this.computeLaneHeading(lane);

      const agentId = `veh_${++this.nextAgentSeq}`;
      const distToCam = distance2d(camera.x, camera.z, pos.x, pos.z);
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

      this.agents.set(agentId, {
        id: agentId,
        kind,
        laneId: lane.laneId,
        distAlongLane: sPos,
        speed: Math.min(cfg.desiredSpeedMs, effectiveLaneSpeedLimit) * 0.8,
        x: pos.x,
        z: pos.z,
        heading: isWrongWay ? heading + Math.PI : heading,
        length: cfg.length,
        width: cfg.width,
        desiredSpeed: Math.min(cfg.desiredSpeedMs, effectiveLaneSpeedLimit),
        lod,
        lateralOffset: isWrongWay ? 0.4 : 0,
        weavePhase: kind === 'cng' ? this.rng.range(0, Math.PI * 2) : undefined,
        isWrongWay,
      });
    }
  }

  computeLanePosition(
    lane: Lane,
    distAlongLane: number,
    lateralOffset = 0
  ): { x: number; z: number } {
    if (lane.points.length < 2) return { x: 0, z: 0 };
    const p1 = lane.points[0]!;
    const p2 = lane.points[1]!;
    const t = clamp(distAlongLane / Math.max(0.1, lane.lengthM), 0, 1);
    const baseX = p1.x + (p2.x - p1.x) * t;
    const baseZ = p1.z + (p2.z - p1.z) * t;

    if (Math.abs(lateralOffset) > 0.001) {
      const dx = p2.x - p1.x;
      const dz = p2.z - p1.z;
      const len = Math.hypot(dx, dz);
      if (len > 0) {
        const leftX = dz / len;
        const leftZ = -dx / len;
        return {
          x: baseX + leftX * lateralOffset,
          z: baseZ + leftZ * lateralOffset,
        };
      }
    }

    return { x: baseX, z: baseZ };
  }

  computeLaneHeading(lane: Lane): number {
    if (lane.points.length < 2) return 0;
    const p1 = lane.points[0]!;
    const p2 = lane.points[1]!;
    return Math.atan2(p2.x - p1.x, p2.z - p1.z);
  }

  /**
   * Triggers horn yield on pedestrians, rickshaws, bicycles, motorcycles, and carts.
   */
  triggerHorn(
    hornPos: { x: number; z: number },
    radius = 15
  ): { pedsYielded: number; rickshawsYielded: number } {
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
          agent.yieldTimer = 2.5;
          agent.speed *= 0.6;
          rickshawsYielded++;
        }
      }
    }

    return { pedsYielded, rickshawsYielded };
  }

  update(
    dt: number,
    camera?: CameraViewInfo,
    player?: { x: number; z: number; speed: number }
  ): void {
    this.signals.update(dt);
    this.pedestrians.update(dt, player, camera);

    // Group agents by lane to identify leader-follower pairs using pooled map
    for (const arr of this.agentsByLane.values()) {
      arr.length = 0;
    }
    for (const agent of this.agents.values()) {
      let laneList = this.agentsByLane.get(agent.laneId);
      if (!laneList) {
        laneList = [];
        this.agentsByLane.set(agent.laneId, laneList);
      }
      laneList.push(agent);
    }

    // Sort agents on each lane by distAlongLane descending (furthest along lane is leader)
    for (const laneAgents of this.agentsByLane.values()) {
      if (laneAgents.length > 1) {
        laneAgents.sort((a, b) => b.distAlongLane - a.distAlongLane);
      }
    }

    // Update each agent using IDM car following
    for (const agent of this.agents.values()) {
      const lane = this.laneGraph.lanes.get(agent.laneId);
      if (!lane) continue;

      // Handle wrong-way rickshaw separately
      if (agent.isWrongWay) {
        agent.speed = 2.5; // slow ~9 km/h along kerb
        agent.distAlongLane -= agent.speed * dt;
        if (agent.distAlongLane <= 0) {
          this.agents.delete(agent.id);
          continue;
        }

        const pos = this.computeLanePosition(
          lane,
          agent.distAlongLane,
          agent.lateralOffset ?? 0.4
        );
        agent.x = pos.x;
        agent.z = pos.z;
        const normalHeading = this.computeLaneHeading(lane);
        agent.heading = normalHeading + Math.PI;

        if (camera) {
          const d = distance2d(camera.x, camera.z, agent.x, agent.z);
          agent.lod =
            d <= BALANCE.TRAFFIC.lod.near
              ? 'near'
              : d <= BALANCE.TRAFFIC.lod.mid
                ? 'mid'
                : 'far';
        }
        continue;
      }

      const laneAgents = this.agentsByLane.get(agent.laneId) ?? [];
      const myIdx = laneAgents.findIndex((a) => a.id === agent.id);
      const leader = myIdx > 0 ? laneAgents[myIdx - 1] : null;

      // Speed limit including active road event speed caps
      const speedCapKmh = this.roadEvents?.getSpeedCap(lane.segmentId);
      const speedCapMs = speedCapKmh !== undefined ? speedCapKmh / 3.6 : Infinity;
      const effectiveLaneSpeedLimit = Math.min(lane.speedLimitMs, speedCapMs);

      // 1. Bus and minibus dwell at bus stops & racing to stops
      if (agent.kind === 'bus' || agent.kind === 'minibus') {
        if (agent.dwellTimer !== undefined && agent.dwellTimer > 0) {
          agent.dwellTimer -= dt;
          agent.speed = 0;
          agent.isDwelling = true;
          agent.isRacingToStop = false;
          if (agent.dwellTimer <= 0) {
            agent.dwellTimer = 0;
            agent.isDwelling = false;
          }
        } else {
          let nearestStop: BusStopLocation | null = null;
          let nearestStopDist = Infinity;

          for (const stop of this.busStops) {
            if (agent.lastDwellPoiId === stop.id) continue;
            const distToStop = distance2d(agent.x, agent.z, stop.x, stop.z);
            if (distToStop < nearestStopDist) {
              nearestStopDist = distToStop;
              nearestStop = stop;
            }
          }

          if (nearestStop && nearestStopDist < 8.0) {
            // Arrived at bus stop -> dwell
            agent.dwellTimer = this.rng.range(10, 20);
            agent.lastDwellPoiId = nearestStop.id;
            agent.speed = 0;
            agent.isDwelling = true;
            agent.isRacingToStop = false;
          } else if (
            nearestStop &&
            nearestStopDist >= 20.0 &&
            nearestStopDist <= 120.0 &&
            (!leader || (leader.distAlongLane - agent.distAlongLane) > 25.0)
          ) {
            // Approaching stop with clear road ahead -> race to the stop!
            agent.isRacingToStop = true;
            agent.desiredSpeed = Math.min(
              VEHICLE_CONFIGS[agent.kind].desiredSpeedMs * 1.25,
              effectiveLaneSpeedLimit * 1.25
            );
          } else {
            agent.isRacingToStop = false;
            agent.desiredSpeed = Math.min(
              VEHICLE_CONFIGS[agent.kind].desiredSpeedMs,
              effectiveLaneSpeedLimit
            );
          }
        }
      }

      // 2. CNG weaving (strictly bounded within [-0.6m, +0.6m])
      if (agent.kind === 'cng') {
        agent.weavePhase = (agent.weavePhase ?? 0) + 2.0 * dt;
        const rawWeave = Math.sin(agent.weavePhase) * 0.5;
        agent.lateralOffset = clamp(rawWeave, -0.6, 0.6);
      }

      // 3. Horn yield slowdown
      if (agent.yieldTimer !== undefined && agent.yieldTimer > 0) {
        agent.yieldTimer -= dt;
        agent.desiredSpeed = VEHICLE_CONFIGS[agent.kind].desiredSpeedMs * 0.5;
        if (agent.yieldTimer <= 0) {
          agent.yieldTimer = 0;
          agent.desiredSpeed = Math.min(
            VEHICLE_CONFIGS[agent.kind].desiredSpeedMs,
            effectiveLaneSpeedLimit
          );
        }
      }

      // 4. Position update via IDM or dwell
      if (agent.isDwelling) {
        agent.speed = 0;
      } else {
        const followerItem = {
          pos: agent.distAlongLane,
          speed: agent.speed,
          length: agent.length,
        };

        const leaderItem = leader
          ? { pos: leader.distAlongLane, speed: leader.speed, length: leader.length }
          : null;

        const step = stepCarFollowing(
          followerItem,
          leaderItem,
          agent.desiredSpeed,
          dt
        );

        agent.distAlongLane = step.newPos;
        agent.speed = step.newSpeed;
      }

      // Check if reached end of lane
      if (agent.distAlongLane >= lane.lengthM) {
        const outgoing = this.laneGraph.outgoingLanes.get(lane.laneId) ?? [];
        // Filter out any outgoing lanes on closed segments
        const nextLanes = outgoing.filter(
          (nl) => !this.roadEvents?.isSegmentClosed(nl.segmentId)
        );

        if (nextLanes.length > 0) {
          const nextLane = this.rng.pick(nextLanes);
          agent.laneId = nextLane.laneId;
          agent.distAlongLane = 0;
          const nextSpeedCap = this.roadEvents?.getSpeedCap(nextLane.segmentId);
          const nextLimit =
            nextSpeedCap !== undefined
              ? Math.min(nextLane.speedLimitMs, nextSpeedCap / 3.6)
              : nextLane.speedLimitMs;
          agent.desiredSpeed = Math.min(
            VEHICLE_CONFIGS[agent.kind].desiredSpeedMs,
            nextLimit
          );
        } else {
          // No open outgoing lane -> recycle/remove
          this.agents.delete(agent.id);
          continue;
        }
      }

      // Update position and heading (rickshaws and vendor carts turn slowly)
      const updatedLane = this.laneGraph.lanes.get(agent.laneId) ?? lane;
      const pos = this.computeLanePosition(
        updatedLane,
        agent.distAlongLane,
        agent.lateralOffset ?? 0
      );
      agent.x = pos.x;
      agent.z = pos.z;

      const targetHeading = this.computeLaneHeading(updatedLane);
      if (agent.kind === 'rickshaw' || agent.kind === 'vendor_cart') {
        const diff = angleDiff(agent.heading, targetHeading);
        const maxTurnThisFrame = 1.2 * dt; // turn rate ~1.2 rad/s
        agent.heading += clamp(diff, -maxTurnThisFrame, maxTurnThisFrame);
      } else {
        agent.heading = targetHeading;
      }

      if (camera) {
        const d = distance2d(camera.x, camera.z, agent.x, agent.z);
        agent.lod =
          d <= BALANCE.TRAFFIC.lod.near
            ? 'near'
            : d <= BALANCE.TRAFFIC.lod.mid
              ? 'mid'
              : 'far';
      }
    }
  }
}
