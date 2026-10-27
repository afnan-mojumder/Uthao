import type { RoadNetwork } from '../road/RoadNetwork';
import { buildLanes, type Lane, type LaneGraph } from '../road/lanes';
import { stepCarFollowing } from './idm';
import { SignalController } from './signals';
import { PedestrianManager } from './pedestrians';
import { Rng } from '../../core/rng';
import { distance2d, angleDiff, clamp } from '../../core/math';
import { BALANCE } from '../../config/balance';

export type TrafficVehicleKind = 'car' | 'bus' | 'motorcycle' | 'cng' | 'rickshaw';

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
  private rng: Rng;
  private nextAgentSeq = 0;

  constructor(network: RoadNetwork, seed = 12345) {
    this.network = network;
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
   * Samples a vehicle kind according to typical Dhaka modal share:
   * 35% CNG, 25% Car, 20% Rickshaw, 12% Motorcycle, 8% Bus
   */
  sampleVehicleKind(): TrafficVehicleKind {
    const roll = this.rng.next();
    if (roll < 0.35) return 'cng';
    if (roll < 0.6) return 'car';
    if (roll < 0.8) return 'rickshaw';
    if (roll < 0.92) return 'motorcycle';
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

      const kind = this.sampleVehicleKind();
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

      this.agents.set(agentId, {
        id: agentId,
        kind,
        laneId: lane.laneId,
        distAlongLane: sPos,
        speed: Math.min(cfg.desiredSpeedMs, lane.speedLimitMs) * 0.8,
        x: pos.x,
        z: pos.z,
        heading,
        length: cfg.length,
        width: cfg.width,
        desiredSpeed: Math.min(cfg.desiredSpeedMs, lane.speedLimitMs),
        lod,
      });
    }
  }

  computeLanePosition(lane: Lane, distAlongLane: number): { x: number; z: number } {
    if (lane.points.length < 2) return { x: 0, z: 0 };
    const p1 = lane.points[0]!;
    const p2 = lane.points[1]!;
    const t = clamp(distAlongLane / Math.max(0.1, lane.lengthM), 0, 1);
    return {
      x: p1.x + (p2.x - p1.x) * t,
      z: p1.z + (p2.z - p1.z) * t,
    };
  }

  computeLaneHeading(lane: Lane): number {
    if (lane.points.length < 2) return 0;
    const p1 = lane.points[0]!;
    const p2 = lane.points[1]!;
    return Math.atan2(p2.x - p1.x, p2.z - p1.z);
  }

  /**
   * Triggers horn yield on both pedestrians and nearby vehicles (rickshaws/motorcycles).
   * Actors within radius yield slightly.
   */
  triggerHorn(
    hornPos: { x: number; z: number },
    radius = 15
  ): { pedsYielded: number; rickshawsYielded: number } {
    const pedsYielded = this.pedestrians.triggerHorn(hornPos, radius);
    let rickshawsYielded = 0;

    for (const agent of this.agents.values()) {
      if (agent.kind === 'rickshaw' || agent.kind === 'motorcycle') {
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

    // Group agents by lane to identify leader-follower pairs
    const agentsByLane = new Map<string, TrafficAgent[]>();
    for (const agent of this.agents.values()) {
      if (!agentsByLane.has(agent.laneId)) {
        agentsByLane.set(agent.laneId, []);
      }
      agentsByLane.get(agent.laneId)!.push(agent);
    }

    // Sort agents on each lane by distAlongLane descending (furthest along lane is leader)
    for (const laneAgents of agentsByLane.values()) {
      laneAgents.sort((a, b) => b.distAlongLane - a.distAlongLane);
    }

    // Update each agent using IDM car following
    for (const agent of this.agents.values()) {
      const lane = this.laneGraph.lanes.get(agent.laneId);
      if (!lane) continue;

      const laneAgents = agentsByLane.get(agent.laneId) ?? [];
      const myIdx = laneAgents.findIndex((a) => a.id === agent.id);
      const leader = myIdx > 0 ? laneAgents[myIdx - 1] : null;

      // 1. Bus dwell at bus stops (10-20s, blocks the lane)
      if (agent.kind === 'bus') {
        if (agent.dwellTimer !== undefined && agent.dwellTimer > 0) {
          agent.dwellTimer -= dt;
          agent.speed = 0;
          agent.isDwelling = true;
          if (agent.dwellTimer <= 0) {
            agent.dwellTimer = 0;
            agent.isDwelling = false;
          }
        } else {
          for (const stop of this.busStops) {
            if (agent.lastDwellPoiId === stop.id) continue;
            const distToStop = distance2d(agent.x, agent.z, stop.x, stop.z);
            if (distToStop < 8.0) {
              agent.dwellTimer = this.rng.range(10, 20);
              agent.lastDwellPoiId = stop.id;
              agent.speed = 0;
              agent.isDwelling = true;
              break;
            }
          }
        }
      }

      // 2. Horn yield slowdown
      if (agent.yieldTimer !== undefined && agent.yieldTimer > 0) {
        agent.yieldTimer -= dt;
        agent.desiredSpeed = VEHICLE_CONFIGS[agent.kind].desiredSpeedMs * 0.5;
        if (agent.yieldTimer <= 0) {
          agent.yieldTimer = 0;
          agent.desiredSpeed = Math.min(
            VEHICLE_CONFIGS[agent.kind].desiredSpeedMs,
            lane.speedLimitMs
          );
        }
      }

      // 3. Position update via IDM or dwell
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
        const nextLanes = this.laneGraph.outgoingLanes.get(lane.laneId) ?? [];
        if (nextLanes.length > 0) {
          const nextLane = this.rng.pick(nextLanes);
          agent.laneId = nextLane.laneId;
          agent.distAlongLane = 0;
          agent.desiredSpeed = Math.min(
            VEHICLE_CONFIGS[agent.kind].desiredSpeedMs,
            nextLane.speedLimitMs
          );
        } else {
          // No outgoing lane -> recycle/remove
          this.agents.delete(agent.id);
          continue;
        }
      }

      // Update position and heading (rickshaws turn slowly)
      const updatedLane = this.laneGraph.lanes.get(agent.laneId) ?? lane;
      const pos = this.computeLanePosition(updatedLane, agent.distAlongLane);
      agent.x = pos.x;
      agent.z = pos.z;

      const targetHeading = this.computeLaneHeading(updatedLane);
      if (agent.kind === 'rickshaw') {
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
