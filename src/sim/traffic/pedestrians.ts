import type { RoadNetwork } from '../road/RoadNetwork';
import type { RoadSegment, RoadNode } from '../../core/types';
import { Rng } from '../../core/rng';
import { distance2d, clamp } from '../../core/math';
import { getRoadWidth } from '../../render/roadMesh';
import { BALANCE } from '../../config/balance';
import type { CameraViewInfo } from './TrafficManager';

/** What a walker reacts to: any vehicle, with its position and travel direction. */
export interface VehicleView {
  x: number;
  z: number;
  heading: number;
  speed: number;
}

/** How long a crossing hazard must clear before a walker steps out. */
const CROSSING_HAZARD_WINDOW_S = 1.0;
/** Vehicles farther than this do not stop a walker. */
const HAZARD_RANGE_M = 40;
const ACCIDENT_DURATION_S = 5;
/** Walkers within the accident radius plus this margin stop until it clears. */
const ACCIDENT_ZONE_MARGIN_M = 10;

export type PedestrianState = 'sidewalk' | 'crossing' | 'jaywalking' | 'yielding' | 'road_worker';

export interface PedestrianAgent {
  id: string;
  x: number;
  z: number;
  heading: number;
  speed: number;
  state: PedestrianState;
  segmentId: string;
  distAlongSegment: number; // meters from segment start
  lateralOffset: number; // distance from centerline (m)
  side: 'left' | 'right';
  direction: 1 | -1; // 1 = forward towards endNode, -1 = backward towards startNode
  targetCrossingNodeId?: string;
  crossingProgress?: number; // 0 to 1 across road
  crossingFromOffset?: number;
  crossingToOffset?: number;
  yieldTimer?: number;
  lod: 'near' | 'mid' | 'far';
  isRoadWorker?: boolean;
}

/**
 * Stopping distance of player motorcycle in meters:
 * v^2 / (2 * a)
 */
export function calculateStoppingDistance(speedMs: number, decelMs2 = 6.0): number {
  if (speedMs <= 0.05) return 0;
  return (speedMs * speedMs) / (2 * decelMs2);
}

/**
 * Fairness Rule (GDD §11 bounded):
 * A jaywalk only starts if the player is farther than 1.5 × stoppingDistance(playerSpeed).
 */
export function canStartJaywalk(
  pedPos: { x: number; z: number },
  playerPos: { x: number; z: number },
  playerSpeedMs: number,
  decelMs2 = 6.0
): boolean {
  const dist = distance2d(pedPos.x, pedPos.z, playerPos.x, playerPos.z);
  const stoppingDist = calculateStoppingDistance(playerSpeedMs, decelMs2);
  const minSafeDistance = 1.5 * stoppingDist;

  // If inside the bounded safety zone, the jaywalk MUST NOT start
  return dist > minSafeDistance;
}

export class PedestrianManager {
  readonly network: RoadNetwork;
  readonly pedestrians: Map<string, PedestrianAgent> = new Map();
  private rng: Rng;
  private nextPedSeq = 0;
  private crossingNodeIds: Set<string> = new Set();
  /** Reported accidents: walkers near one stop until it clears. */
  private accidents: { x: number; z: number; radius: number; ttl: number }[] = [];
  private eligibleSegments: RoadSegment[] = [];

  constructor(network: RoadNetwork, seed = 4242) {
    this.network = network;
    this.rng = new Rng(seed);

    // Identify crossing junctions
    for (const node of network.getAllNodes()) {
      if (node.kind === 'junction' && node.tags?.includes('crossing')) {
        this.crossingNodeIds.add(node.nodeId);
      }
    }

    // Pedestrians walk on all roads except flyovers
    this.eligibleSegments = network
      .getAllSegments()
      .filter((s) => s.roadType !== 'flyover');
  }

  getPedestrians(): PedestrianAgent[] {
    return Array.from(this.pedestrians.values());
  }

  /**
   * Spawns pedestrians along sidewalks to match target density around player/camera.
   */
  maintainDensity(
    camera: CameraViewInfo,
    _currentMinute: number,
    baseTargetCount = 20
  ): void {
    // Despawn far pedestrians (> 350 m)
    for (const [id, ped] of this.pedestrians.entries()) {
      const dist = distance2d(camera.x, camera.z, ped.x, ped.z);
      if (dist > 350) {
        this.pedestrians.delete(id);
      }
    }

    if (this.eligibleSegments.length === 0) return;

    let attempts = 0;
    while (this.pedestrians.size < baseTargetCount && attempts < 40) {
      attempts++;
      const seg = this.rng.pick(this.eligibleSegments);
      const sNode = this.network.getNode(seg.startNodeId);
      const eNode = this.network.getNode(seg.endNodeId);
      if (!sNode || !eNode) continue;

      const segLen = Math.hypot(eNode.x - sNode.x, eNode.z - sNode.z);
      if (segLen < 10) continue;

      const roadW = getRoadWidth(seg);
      const sidewalkOffset = roadW / 2 + 1.2;
      const side: 'left' | 'right' = this.rng.next() > 0.5 ? 'left' : 'right';
      const lateralOffset = side === 'left' ? -sidewalkOffset : sidewalkOffset;
      const distAlong = this.rng.range(2, segLen - 2);

      const pos = this.computePosition(sNode, eNode, distAlong, lateralOffset);
      const distToCam = distance2d(camera.x, camera.z, pos.x, pos.z);

      // Avoid spawning right on top of camera
      if (distToCam < 15 || distToCam > 250) continue;

      const id = `ped_${++this.nextPedSeq}`;
      const direction: 1 | -1 = this.rng.next() > 0.5 ? 1 : -1;
      const dx = eNode.x - sNode.x;
      const dz = eNode.z - sNode.z;
      const baseHeading = Math.atan2(dx, dz);
      const heading = direction === 1 ? baseHeading : baseHeading + Math.PI;

      const lod: 'near' | 'mid' | 'far' =
        distToCam <= BALANCE.TRAFFIC.lod.near
          ? 'near'
          : distToCam <= BALANCE.TRAFFIC.lod.mid
            ? 'mid'
            : 'far';

      this.pedestrians.set(id, {
        id,
        x: pos.x,
        z: pos.z,
        heading,
        speed: this.rng.range(1.1, 1.45),
        state: 'sidewalk',
        segmentId: seg.segmentId,
        distAlongSegment: distAlong,
        lateralOffset,
        side,
        direction,
        lod,
      });
    }
  }

  /**
   * Attempts to initiate a jaywalk for a sidewalk pedestrian.
   * STRICTLY honors the fairness rule: if player is within 1.5x stopping distance, fails.
   */
  tryStartJaywalk(
    ped: PedestrianAgent,
    playerPos: { x: number; z: number },
    playerSpeedMs: number
  ): boolean {
    if (ped.state !== 'sidewalk') return false;

    // Check fairness rule
    if (!canStartJaywalk({ x: ped.x, z: ped.z }, playerPos, playerSpeedMs)) {
      return false; // Disallowed by bounded fairness rule
    }

    const seg = this.network.getSegment(ped.segmentId);
    if (!seg) return false;
    const roadW = getRoadWidth(seg);
    const sidewalkOffset = roadW / 2 + 1.2;

    ped.state = 'jaywalking';
    ped.crossingProgress = 0;
    ped.crossingFromOffset = ped.lateralOffset;
    ped.crossingToOffset = ped.side === 'left' ? sidewalkOffset : -sidewalkOffset;
    return true;
  }

  /**
   * Spawns road construction workers stationed on a segment.
   */
  spawnRoadWorkers(segmentId: string, count = 2): PedestrianAgent[] {
    const seg = this.network.getSegment(segmentId);
    if (!seg) return [];
    const sNode = this.network.getNode(seg.startNodeId);
    const eNode = this.network.getNode(seg.endNodeId);
    if (!sNode || !eNode) return [];

    const workers: PedestrianAgent[] = [];
    const segLen = distance2d(sNode.x, sNode.z, eNode.x, eNode.z);
    const roadW = getRoadWidth(seg);

    for (let i = 0; i < count; i++) {
      const id = `ped_worker_${++this.nextPedSeq}`;
      const distAlong = clamp(segLen * (0.3 + 0.4 * (i / Math.max(1, count - 1))), 2, segLen - 2);
      const lateralOffset = (roadW / 4) * (i % 2 === 0 ? 1 : -1);
      const pos = this.computePosition(sNode, eNode, distAlong, lateralOffset);
      const dx = eNode.x - sNode.x;
      const dz = eNode.z - sNode.z;
      const heading = Math.atan2(dx, dz);

      const worker: PedestrianAgent = {
        id,
        x: pos.x,
        z: pos.z,
        heading,
        speed: 0.2,
        state: 'road_worker',
        segmentId,
        distAlongSegment: distAlong,
        lateralOffset,
        side: i % 2 === 0 ? 'left' : 'right',
        direction: 1,
        lod: 'near',
        isRoadWorker: true,
      };

      this.pedestrians.set(id, worker);
      workers.push(worker);
    }

    return workers;
  }

  /**
   * When horn is blown, pedestrians within radius yield slightly.
   */
  triggerHorn(hornPos: { x: number; z: number }, radius = 15): number {
    let affected = 0;
    for (const ped of this.pedestrians.values()) {
      const dist = distance2d(hornPos.x, hornPos.z, ped.x, ped.z);
      if (dist <= radius) {
        ped.state = 'yielding';
        ped.yieldTimer = 2.0; // Freeze/yield for 2 seconds
        affected++;
      }
    }
    return affected;
  }

  /** A vehicle or accident reported here: walkers near it stop until it clears. */
  reportAccident(x: number, z: number, radius = 5): void {
    this.accidents.push({ x, z, radius, ttl: ACCIDENT_DURATION_S });
  }

  update(
    dt: number,
    player?: { x: number; z: number; speed: number; heading?: number },
    camera?: CameraViewInfo,
    vehicles?: ReadonlyMap<string, VehicleView>
  ): void {
    this.accidents = this.accidents.filter((a) => {
      a.ttl -= dt;
      return a.ttl > 0;
    });

    for (const ped of this.pedestrians.values()) {
      // 1. Handle yielding
      if (ped.state === 'yielding') {
        if (ped.yieldTimer !== undefined && ped.yieldTimer > 0) {
          ped.yieldTimer -= dt;
          if (ped.yieldTimer <= 0) {
            ped.yieldTimer = 0;
            // Return to prior state
            ped.state = ped.crossingProgress !== undefined ? 'crossing' : 'sidewalk';
          } else {
            // While yielding, pedestrian stops in place
            continue;
          }
        }
      }

      const seg = this.network.getSegment(ped.segmentId);
      if (!seg) continue;
      const sNode = this.network.getNode(seg.startNodeId);
      const eNode = this.network.getNode(seg.endNodeId);
      if (!sNode || !eNode) continue;

      const segLen = Math.hypot(eNode.x - sNode.x, eNode.z - sNode.z);
      const roadW = getRoadWidth(seg);
      const sidewalkOffset = roadW / 2 + 1.2;
      const crossDistTotal = roadW + 2.4;
      const dx = eNode.x - sNode.x;
      const dz = eNode.z - sNode.z;
      const baseHeading = Math.atan2(dx, dz);
      const here = this.computePosition(sNode, eNode, ped.distAlongSegment, ped.lateralOffset);

      // Walkers near an accident stop where they are until it clears.
      if (ped.state === 'sidewalk' && this.nearAccident(here.x, here.z)) continue;

      // 2. State-specific behavior
      if (ped.state === 'sidewalk') {
        // Walk along sidewalk
        ped.distAlongSegment += ped.direction * ped.speed * dt;

        // Occasional jaywalk roll (1 in 500 chance per step)
        if (player && this.rng.next() < 0.002) {
          this.tryStartJaywalk(ped, player, player.speed);
        }

        // Check if reached segment boundary
        if (ped.distAlongSegment >= segLen) {
          // Reached end node: check for crossing
          if (this.crossingNodeIds.has(seg.endNodeId)) {
            const kerb = this.computePosition(sNode, eNode, segLen, ped.lateralOffset);
            if (this.crossingHazard(kerb.x, kerb.z, crossDistTotal / Math.max(0.1, ped.speed), player, vehicles)) {
              // Wait at the kerb: never step out in front of a vehicle.
              ped.distAlongSegment = segLen;
            } else {
              ped.state = 'crossing';
              ped.crossingProgress = 0;
              ped.crossingFromOffset = ped.lateralOffset;
              ped.crossingToOffset = ped.side === 'left' ? sidewalkOffset : -sidewalkOffset;
            }
          } else {
            // Reverse direction
            ped.direction = -1;
            ped.distAlongSegment = segLen;
            ped.heading = baseHeading + Math.PI;
          }
        } else if (ped.distAlongSegment <= 0) {
          // Reached start node: check for crossing
          if (this.crossingNodeIds.has(seg.startNodeId)) {
            const kerb = this.computePosition(sNode, eNode, 0, ped.lateralOffset);
            if (this.crossingHazard(kerb.x, kerb.z, crossDistTotal / Math.max(0.1, ped.speed), player, vehicles)) {
              ped.distAlongSegment = 0;
            } else {
              ped.state = 'crossing';
              ped.crossingProgress = 0;
              ped.crossingFromOffset = ped.lateralOffset;
              ped.crossingToOffset = ped.side === 'left' ? sidewalkOffset : -sidewalkOffset;
            }
          } else {
            // Reverse direction
            ped.direction = 1;
            ped.distAlongSegment = 0;
            ped.heading = baseHeading;
          }
        }
      } else if (ped.state === 'crossing' || ped.state === 'jaywalking') {
        const remainingS = (1 - (ped.crossingProgress ?? 0)) * crossDistTotal / Math.max(0.1, ped.speed);
        const hazard =
          ped.state === 'crossing' &&
          this.crossingHazard(here.x, here.z, remainingS, player, vehicles);

        if (hazard) {
          // A vehicle is coming while the walker is still on the road: step back.
          const back = (ped.crossingProgress ?? 0) - (ped.speed * dt) / crossDistTotal;
          if (back <= 0) {
            ped.state = 'sidewalk';
            ped.lateralOffset = ped.crossingFromOffset ?? ped.lateralOffset;
            ped.crossingProgress = undefined;
            ped.crossingFromOffset = undefined;
            ped.crossingToOffset = undefined;
            ped.heading = ped.direction === 1 ? baseHeading : baseHeading + Math.PI;
          } else {
            ped.crossingProgress = back;
            const fromOffset = ped.crossingFromOffset ?? -sidewalkOffset;
            const toOffset = ped.crossingToOffset ?? sidewalkOffset;
            ped.lateralOffset = fromOffset + (toOffset - fromOffset) * back;
          }
        } else {
          // Progress crossing across road
          const progressInc = (ped.speed * dt) / crossDistTotal;
          ped.crossingProgress = clamp((ped.crossingProgress ?? 0) + progressInc, 0, 1);

          const fromOffset = ped.crossingFromOffset ?? -sidewalkOffset;
          const toOffset = ped.crossingToOffset ?? sidewalkOffset;
          ped.lateralOffset = fromOffset + (toOffset - fromOffset) * ped.crossingProgress;

          // Heading across road: perpendicular to road
          const crossHeading = toOffset > fromOffset ? baseHeading + Math.PI / 2 : baseHeading - Math.PI / 2;
          ped.heading = crossHeading;

          if (ped.crossingProgress >= 1) {
            // Completed crossing
            ped.state = 'sidewalk';
            ped.side = ped.side === 'left' ? 'right' : 'left';
            ped.lateralOffset = toOffset;
            ped.crossingProgress = undefined;
            ped.crossingFromOffset = undefined;
            ped.crossingToOffset = undefined;
            ped.heading = ped.direction === 1 ? baseHeading : baseHeading + Math.PI;
          }
        }
      } else if (ped.state === 'road_worker') {
        ped.distAlongSegment += ped.direction * ped.speed * dt;
        if (ped.distAlongSegment > segLen - 2) {
          ped.direction = -1;
          ped.heading = baseHeading + Math.PI;
        } else if (ped.distAlongSegment < 2) {
          ped.direction = 1;
          ped.heading = baseHeading;
        }
      }

      // 3. Update spatial position
      const pos = this.computePosition(sNode, eNode, ped.distAlongSegment, ped.lateralOffset);
      ped.x = pos.x;
      ped.z = pos.z;

      // 4. Update LOD
      if (camera) {
        const d = distance2d(camera.x, camera.z, ped.x, ped.z);
        ped.lod =
          d <= BALANCE.TRAFFIC.lod.near
            ? 'near'
            : d <= BALANCE.TRAFFIC.lod.mid
              ? 'mid'
              : 'far';
      }
    }
  }

  private nearAccident(x: number, z: number): boolean {
    for (const a of this.accidents) {
      const zone = a.radius + ACCIDENT_ZONE_MARGIN_M;
      const dx = x - a.x;
      const dz = z - a.z;
      if (dx * dx + dz * dz <= zone * zone) return true;
    }
    return false;
  }

  /**
   * True when a vehicle or the bike is coming toward (px, pz) and would reach it
   * before a walker who needs `timeNeededS` to get across has finished.
   */
  private crossingHazard(
    px: number,
    pz: number,
    timeNeededS: number,
    player: { x: number; z: number; speed: number; heading?: number } | undefined,
    vehicles: ReadonlyMap<string, VehicleView> | undefined
  ): boolean {
    if (player && player.heading !== undefined && this.isApproaching(px, pz, player, timeNeededS)) {
      return true;
    }
    if (vehicles) {
      for (const v of vehicles.values()) {
        if (this.isApproaching(px, pz, v, timeNeededS)) return true;
      }
    }
    return false;
  }

  private isApproaching(
    px: number,
    pz: number,
    v: { x: number; z: number; speed: number; heading?: number },
    timeNeededS: number
  ): boolean {
    if (v.heading === undefined || v.speed < 0.5) return false;
    const rx = px - v.x;
    const rz = pz - v.z;
    const dist = Math.hypot(rx, rz);
    if (dist > HAZARD_RANGE_M) return false;
    const vx = Math.sin(v.heading) * v.speed;
    const vz = Math.cos(v.heading) * v.speed;
    if (vx * rx + vz * rz <= 0) return false; // moving away from the point
    return dist / v.speed < timeNeededS + CROSSING_HAZARD_WINDOW_S;
  }

  private computePosition(
    sNode: RoadNode,
    eNode: RoadNode,
    distAlong: number,
    lateralOffset: number
  ): { x: number; z: number } {
    const dx = eNode.x - sNode.x;
    const dz = eNode.z - sNode.z;
    const len = Math.max(0.1, Math.hypot(dx, dz));
    const t = clamp(distAlong / len, 0, 1);

    const nx = -dz / len;
    const nz = dx / len;

    return {
      x: sNode.x + dx * t + nx * lateralOffset,
      z: sNode.z + dz * t + nz * lateralOffset,
    };
  }
}
