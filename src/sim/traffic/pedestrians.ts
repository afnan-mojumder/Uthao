import { getRoadWidth, type RoadNetwork } from '../road/RoadNetwork';
import type { RoadSegment, RoadNode } from '../../core/types';
import { Rng } from '../../core/rng';
import { distance2d, clamp } from '../../core/math';
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
const WET_CROSSING_HAZARD_WINDOW_S = 1.4;
/** Vehicles farther than this do not stop a walker. */
const HAZARD_RANGE_M = 40;
const ACCIDENT_DURATION_S = 5;
/** Walkers within the accident radius plus this margin stop until it clears. */
const ACCIDENT_ZONE_MARGIN_M = 10;
const HORN_COOLDOWN_S = 0.4;
const MID_LOD_STEP_S = 1 / 20;
const FAR_LOD_STEP_S = 1 / 5;

export type PedestrianState = 'sidewalk' | 'crossing' | 'jaywalking' | 'yielding' | 'road_worker';

export interface PedestrianAgent {
  id: string;
  x: number;
  y?: number;
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
  lodAccum?: number;
  isRoadWorker?: boolean;
}

export function getSidewalkOffset(seg: RoadSegment): number {
  const roadW = getRoadWidth(seg);
  return seg.roadType === 'alley' ? roadW / 2 + 0.4 : roadW / 2 + 1.2;
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
 * On wet roads, deceleration drops from dry 6.0 m/s^2 to 4.4 m/s^2 (~36% longer safety margin).
 */
export function canStartJaywalk(
  pedPos: { x: number; z: number },
  playerPos: { x: number; z: number },
  playerSpeedMs: number,
  decelMs2 = 6.0,
  wet = false
): boolean {
  const dist = distance2d(pedPos.x, pedPos.z, playerPos.x, playerPos.z);
  const effectiveDecel = wet
    ? Math.min(decelMs2, BALANCE.BIKE.old100.brakeDecelWet)
    : decelMs2;
  const stoppingDist = calculateStoppingDistance(playerSpeedMs, effectiveDecel);
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
  /** Reported accidents: walkers near one stop or scatter until it clears. */
  private accidents: { x: number; z: number; radius: number; ttl: number }[] = [];
  private eligibleSegments: RoadSegment[] = [];
  private readonly segsByNode: Map<string, RoadSegment[]> = new Map();
  private readonly localSegsScratch: RoadSegment[] = [];
  private readonly deleteIdsScratch: string[] = [];
  private lastSegScanX = NaN;
  private lastSegScanZ = NaN;
  private hornCooldownS = 0;
  private readonly posScratch = { x: 0, z: 0 };

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

    for (const seg of this.eligibleSegments) {
      let sList = this.segsByNode.get(seg.startNodeId);
      if (!sList) {
        sList = [];
        this.segsByNode.set(seg.startNodeId, sList);
      }
      sList.push(seg);

      let eList = this.segsByNode.get(seg.endNodeId);
      if (!eList) {
        eList = [];
        this.segsByNode.set(seg.endNodeId, eList);
      }
      eList.push(seg);
    }
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
    // Despawn far pedestrians (> 350 m) without .entries() tuple allocs; keep road workers bound to active events
    this.deleteIdsScratch.length = 0;
    for (const ped of this.pedestrians.values()) {
      if (ped.isRoadWorker) continue;
      const dist = distance2d(camera.x, camera.z, ped.x, ped.z);
      if (dist > 350) {
        this.deleteIdsScratch.push(ped.id);
      }
    }
    for (let i = 0; i < this.deleteIdsScratch.length; i++) {
      this.pedestrians.delete(this.deleteIdsScratch[i]!);
    }

    if (this.eligibleSegments.length === 0 || this.pedestrians.size >= baseTargetCount) return;

    if (
      Number.isNaN(this.lastSegScanX) ||
      Math.hypot(camera.x - this.lastSegScanX, camera.z - this.lastSegScanZ) > 20
    ) {
      this.localSegsScratch.length = 0;
      for (let i = 0; i < this.eligibleSegments.length; i++) {
        const seg = this.eligibleSegments[i]!;
        const sNode = this.network.getNode(seg.startNodeId);
        const eNode = this.network.getNode(seg.endNodeId);
        if (!sNode || !eNode) continue;
        const dx = eNode.x - sNode.x;
        const dz = eNode.z - sNode.z;
        const lenSq = dx * dx + dz * dz;
        if (lenSq < 100) continue;
        const t = clamp(((camera.x - sNode.x) * dx + (camera.z - sNode.z) * dz) / lenSq, 0, 1);
        const minDist = distance2d(camera.x, camera.z, sNode.x + dx * t, sNode.z + dz * t);
        if (minDist <= 260) {
          this.localSegsScratch.push(seg);
        }
      }
      this.lastSegScanX = camera.x;
      this.lastSegScanZ = camera.z;
    }

    if (this.localSegsScratch.length === 0) return;

    let attempts = 0;
    while (this.pedestrians.size < baseTargetCount && attempts < 40) {
      attempts++;
      const seg = this.rng.pick(this.localSegsScratch);
      const sNode = this.network.getNode(seg.startNodeId);
      const eNode = this.network.getNode(seg.endNodeId);
      if (!sNode || !eNode) continue;

      const segLen = Math.hypot(eNode.x - sNode.x, eNode.z - sNode.z);
      if (segLen < 10) continue;

      const sidewalkOffset = getSidewalkOffset(seg);
      const side: 'left' | 'right' = this.rng.next() > 0.5 ? 'left' : 'right';
      const lateralOffset = side === 'left' ? -sidewalkOffset : sidewalkOffset;
      const distAlong = this.rng.range(2, segLen - 2);

      const pos = this.computePositionInto(sNode, eNode, distAlong, lateralOffset, this.posScratch);
      const distToCam = distance2d(camera.x, camera.z, pos.x, pos.z);

      // Avoid spawning right on top of camera
      if (distToCam < 15 || distToCam > 250) continue;

      const id = `ped_${++this.nextPedSeq}`;
      const direction: 1 | -1 = this.rng.next() > 0.5 ? 1 : -1;
      const dx = eNode.x - sNode.x;
      const dz = eNode.z - sNode.z;
      const baseHeading = Math.atan2(dx, dz);
      const heading = direction === 1 ? baseHeading : baseHeading + Math.PI;
      const t = clamp(distAlong / segLen, 0, 1);
      const y = (sNode.y ?? 0) + t * ((eNode.y ?? 0) - (sNode.y ?? 0));

      const lod: 'near' | 'mid' | 'far' =
        distToCam <= BALANCE.TRAFFIC.lod.near
          ? 'near'
          : distToCam <= BALANCE.TRAFFIC.lod.mid
            ? 'mid'
            : 'far';

      this.pedestrians.set(id, {
        id,
        x: pos.x,
        y,
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
        lodAccum: 0,
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
    playerSpeedMs: number,
    wet = false
  ): boolean {
    if (ped.state !== 'sidewalk') return false;

    // Check fairness rule (wet-aware)
    if (!canStartJaywalk({ x: ped.x, z: ped.z }, playerPos, playerSpeedMs, 6.0, wet)) {
      return false; // Disallowed by bounded fairness rule
    }

    const seg = this.network.getSegment(ped.segmentId);
    if (!seg) return false;
    const sidewalkOffset = getSidewalkOffset(seg);

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

  hasRoadWorkers(segmentId: string): boolean {
    for (const ped of this.pedestrians.values()) {
      if (ped.isRoadWorker && ped.segmentId === segmentId) {
        return true;
      }
    }
    return false;
  }

  clearRoadWorkers(segmentId?: string): void {
    this.deleteIdsScratch.length = 0;
    for (const ped of this.pedestrians.values()) {
      if (!ped.isRoadWorker) continue;
      if (segmentId === undefined || ped.segmentId === segmentId) {
        this.deleteIdsScratch.push(ped.id);
      }
    }
    for (let i = 0; i < this.deleteIdsScratch.length; i++) {
      this.pedestrians.delete(this.deleteIdsScratch[i]!);
    }
  }

  /**
   * When horn is blown (0.4s debounced), pedestrians within radius yield or clear off the road.
   */
  triggerHorn(hornPos: { x: number; z: number }, radius = 15): number {
    if (this.hornCooldownS > 0) return 0;
    this.hornCooldownS = HORN_COOLDOWN_S;

    let affected = 0;
    for (const ped of this.pedestrians.values()) {
      const dist = distance2d(hornPos.x, hornPos.z, ped.x, ped.z);
      if (dist <= radius) {
        ped.state = 'yielding';
        ped.yieldTimer = 2.0;
        affected++;
      }
    }
    return affected;
  }

  /** A vehicle or accident reported here: walkers near it stop or scatter until it clears. */
  reportAccident(x: number, z: number, radius = 5): void {
    this.accidents.push({ x, z, radius, ttl: ACCIDENT_DURATION_S });
  }

  update(
    dt: number,
    player?: { x: number; z: number; speed: number; heading?: number },
    camera?: CameraViewInfo,
    vehicles?: ReadonlyMap<string, VehicleView> | readonly VehicleView[],
    wet = false
  ): void {
    this.hornCooldownS = Math.max(0, this.hornCooldownS - dt);

    // Compact expired accidents in-place (zero per-tick allocation)
    let writeIdx = 0;
    for (let i = 0; i < this.accidents.length; i++) {
      const a = this.accidents[i]!;
      a.ttl -= dt;
      if (a.ttl > 0) {
        this.accidents[writeIdx++] = a;
      }
    }
    this.accidents.length = writeIdx;

    const hazardWindowS = wet ? WET_CROSSING_HAZARD_WINDOW_S : CROSSING_HAZARD_WINDOW_S;

    for (const ped of this.pedestrians.values()) {
      // Update LOD first so approaching pedestrians immediately wake to 60Hz
      if (camera) {
        const d = distance2d(camera.x, camera.z, ped.x, ped.z);
        ped.lod =
          d <= BALANCE.TRAFFIC.lod.near
            ? 'near'
            : d <= BALANCE.TRAFFIC.lod.mid
              ? 'mid'
              : 'far';
      }

      // LOD tick throttling: 60Hz near / 20Hz mid / 5Hz far
      let effDt = dt;
      if (ped.lod === 'mid') {
        const acc = (ped.lodAccum ?? 0) + dt;
        if (acc < MID_LOD_STEP_S - 1e-6) {
          ped.lodAccum = acc;
          continue;
        }
        effDt = acc;
        ped.lodAccum = 0;
      } else if (ped.lod === 'far') {
        const acc = (ped.lodAccum ?? 0) + dt;
        if (acc < FAR_LOD_STEP_S - 1e-6) {
          ped.lodAccum = acc;
          continue;
        }
        effDt = acc;
        ped.lodAccum = 0;
      } else if (ped.lodAccum) {
        effDt = dt + ped.lodAccum;
        ped.lodAccum = 0;
      }

      const seg = this.network.getSegment(ped.segmentId);
      if (!seg) continue;
      const sNode = this.network.getNode(seg.startNodeId);
      const eNode = this.network.getNode(seg.endNodeId);
      if (!sNode || !eNode) continue;

      const segLen = Math.max(0.1, Math.hypot(eNode.x - sNode.x, eNode.z - sNode.z));
      const sidewalkOffset = getSidewalkOffset(seg);
      const crossDistTotal = sidewalkOffset * 2;
      const dx = eNode.x - sNode.x;
      const dz = eNode.z - sNode.z;
      const nx = -dz / segLen;
      const nz = dx / segLen;
      const baseHeading = Math.atan2(dx, dz);
      const here = this.computePositionInto(
        sNode,
        eNode,
        ped.distAlongSegment,
        ped.lateralOffset,
        this.posScratch
      );

      // 1. Handle yielding: hurry off asphalt if crossing, or step gently aside on sidewalk
      if (ped.state === 'yielding') {
        ped.yieldTimer = Math.max(0, (ped.yieldTimer ?? 0) - effDt);
        if (ped.crossingProgress !== undefined) {
          const done = this.advanceCrossingStep(
            ped,
            effDt,
            crossDistTotal,
            sidewalkOffset,
            nx,
            nz,
            baseHeading,
            ped.crossingProgress >= 0.45 ? 1 : -1,
            1.5
          );
          if (done) {
            ped.yieldTimer = 0;
          } else if (ped.yieldTimer <= 0) {
            ped.yieldTimer = 0;
            ped.state = 'crossing';
          }
        } else {
          // On sidewalk: step slightly toward outer edge rather than onto the road
          const outerTarget = ped.side === 'left' ? -(sidewalkOffset + 0.45) : sidewalkOffset + 0.45;
          const diffLat = outerTarget - ped.lateralOffset;
          const stepLat = clamp(diffLat, -1.2 * effDt, 1.2 * effDt);
          ped.lateralOffset += stepLat;
          if ((ped.yieldTimer ?? 0) <= 0) {
            ped.yieldTimer = 0;
            ped.state = 'sidewalk';
          }
        }
        this.syncPedWorldPose(ped, this.network.getSegment(ped.segmentId) ?? seg);
        continue;
      }

      const accidentLevel = this.accidentProximity(here.x, here.z);

      // 2. State-specific behavior
      if (ped.state === 'sidewalk') {
        if (accidentLevel === 1) {
          // In outer accident buffer: stop safely on sidewalk until it clears
          continue;
        }
        if (accidentLevel === 2) {
          // Inside core crash radius: scatter along sidewalk away from the accident
          const nearestAcc = this.nearestAccident(here.x, here.z);
          if (nearestAcc) {
            const awayDot = (here.x - nearestAcc.x) * (dx / segLen) + (here.z - nearestAcc.z) * (dz / segLen);
            const scatterDir: 1 | -1 = awayDot >= 0 ? 1 : -1;
            ped.direction = scatterDir;
            ped.distAlongSegment = clamp(
              ped.distAlongSegment + scatterDir * ped.speed * 1.6 * effDt,
              0,
              segLen
            );
            ped.heading = scatterDir === 1 ? baseHeading : baseHeading + Math.PI;
          }
        } else {
          // Walk along sidewalk
          ped.distAlongSegment += ped.direction * ped.speed * effDt;

          // Gently ease back to canonical sidewalk offset if shifted
          const nominalOffset = ped.side === 'left' ? -sidewalkOffset : sidewalkOffset;
          const latErr = nominalOffset - ped.lateralOffset;
          if (Math.abs(latErr) > 0.01) {
            ped.lateralOffset += clamp(latErr, -1.0 * effDt, 1.0 * effDt);
          }

          // Occasional jaywalk roll (1 in 500 chance per step, wet-aware fairness)
          if (player && this.rng.next() < 0.002) {
            this.tryStartJaywalk(ped, player, Math.abs(player.speed), wet);
          }

          // Check if reached segment boundary
          if (ped.distAlongSegment >= segLen) {
            if (this.crossingNodeIds.has(seg.endNodeId)) {
              const kerb = this.computePositionInto(sNode, eNode, segLen, ped.lateralOffset, this.posScratch);
              if (
                this.crossingHazard(
                  kerb.x,
                  kerb.z,
                  crossDistTotal / Math.max(0.1, ped.speed),
                  hazardWindowS,
                  player,
                  vehicles
                )
              ) {
                ped.distAlongSegment = segLen;
              } else {
                ped.state = 'crossing';
                ped.crossingProgress = 0;
                ped.crossingFromOffset = ped.lateralOffset;
                ped.crossingToOffset = ped.side === 'left' ? sidewalkOffset : -sidewalkOffset;
              }
            } else if (!this.turnCorner(ped, seg, sNode, eNode, segLen, seg.endNodeId, true)) {
              ped.direction = -1;
              ped.distAlongSegment = segLen;
              ped.heading = baseHeading + Math.PI;
            }
          } else if (ped.distAlongSegment <= 0) {
            if (this.crossingNodeIds.has(seg.startNodeId)) {
              const kerb = this.computePositionInto(sNode, eNode, 0, ped.lateralOffset, this.posScratch);
              if (
                this.crossingHazard(
                  kerb.x,
                  kerb.z,
                  crossDistTotal / Math.max(0.1, ped.speed),
                  hazardWindowS,
                  player,
                  vehicles
                )
              ) {
                ped.distAlongSegment = 0;
              } else {
                ped.state = 'crossing';
                ped.crossingProgress = 0;
                ped.crossingFromOffset = ped.lateralOffset;
                ped.crossingToOffset = ped.side === 'left' ? sidewalkOffset : -sidewalkOffset;
              }
            } else if (!this.turnCorner(ped, seg, sNode, eNode, segLen, seg.startNodeId, false)) {
              ped.direction = 1;
              ped.distAlongSegment = 0;
              ped.heading = baseHeading;
            }
          }
        }
      } else if (ped.state === 'crossing' || ped.state === 'jaywalking') {
        if (accidentLevel > 0) {
          // Scatter rapidly off the road to the nearer kerb on nearby accidents
          const dir: 1 | -1 = (ped.crossingProgress ?? 0) >= 0.45 ? 1 : -1;
          this.advanceCrossingStep(ped, effDt, crossDistTotal, sidewalkOffset, nx, nz, baseHeading, dir, 2.0);
        } else {
          const remainingS = ((1 - (ped.crossingProgress ?? 0)) * crossDistTotal) / Math.max(0.1, ped.speed);
          const hazard =
            ped.state === 'crossing' &&
            this.crossingHazard(here.x, here.z, remainingS, hazardWindowS, player, vehicles);

          if (hazard && (ped.crossingProgress ?? 0) < 0.45) {
            // Early in crossing: step back toward starting kerb while facing it (no moonwalking)
            this.advanceCrossingStep(ped, effDt, crossDistTotal, sidewalkOffset, nx, nz, baseHeading, -1, 1.0);
          } else {
            // Forward crossing completion (hurry forward if hazard appeared after midpoint)
            const speedMult = hazard ? 1.45 : 1.0;
            this.advanceCrossingStep(ped, effDt, crossDistTotal, sidewalkOffset, nx, nz, baseHeading, 1, speedMult);
          }
        }
      } else if (ped.state === 'road_worker') {
        ped.distAlongSegment += ped.direction * ped.speed * effDt;
        if (ped.distAlongSegment > segLen - 2) {
          ped.direction = -1;
          ped.heading = baseHeading + Math.PI;
        } else if (ped.distAlongSegment < 2) {
          ped.direction = 1;
          ped.heading = baseHeading;
        }
      }

      // 3. Update spatial position on active segment (which may have changed via turnCorner)
      const activeSeg = this.network.getSegment(ped.segmentId) ?? seg;
      this.syncPedWorldPose(ped, activeSeg);
    }
  }

  private syncPedWorldPose(ped: PedestrianAgent, seg: RoadSegment): void {
    const sNode = this.network.getNode(seg.startNodeId);
    const eNode = this.network.getNode(seg.endNodeId);
    if (!sNode || !eNode) return;
    const pos = this.computePositionInto(sNode, eNode, ped.distAlongSegment, ped.lateralOffset, this.posScratch);
    ped.x = pos.x;
    ped.z = pos.z;
    const len = Math.max(0.1, Math.hypot(eNode.x - sNode.x, eNode.z - sNode.z));
    const t = clamp(ped.distAlongSegment / len, 0, 1);
    ped.y = (sNode.y ?? 0) + t * ((eNode.y ?? 0) - (sNode.y ?? 0));
  }

  private advanceCrossingStep(
    ped: PedestrianAgent,
    dt: number,
    crossDistTotal: number,
    sidewalkOffset: number,
    nx: number,
    nz: number,
    baseHeading: number,
    dir: 1 | -1,
    speedMult: number
  ): boolean {
    const fromOffset = ped.crossingFromOffset ?? -sidewalkOffset;
    const toOffset = ped.crossingToOffset ?? sidewalkOffset;
    const span = Math.max(0.5, Math.abs(toOffset - fromOffset));
    const latSign = toOffset > fromOffset ? 1 : -1;
    const progressInc = ((ped.speed * speedMult * dt) / Math.max(span, crossDistTotal)) * dir;
    const nextProgress = (ped.crossingProgress ?? 0) + progressInc;

    if (dir === -1 && nextProgress <= 0) {
      ped.state = 'sidewalk';
      ped.lateralOffset = fromOffset;
      ped.crossingProgress = undefined;
      ped.crossingFromOffset = undefined;
      ped.crossingToOffset = undefined;
      ped.heading = ped.direction === 1 ? baseHeading : baseHeading + Math.PI;
      return true;
    }

    if (dir === 1 && nextProgress >= 1) {
      ped.state = 'sidewalk';
      ped.side = ped.side === 'left' ? 'right' : 'left';
      ped.lateralOffset = toOffset;
      ped.crossingProgress = undefined;
      ped.crossingFromOffset = undefined;
      ped.crossingToOffset = undefined;
      ped.heading = ped.direction === 1 ? baseHeading : baseHeading + Math.PI;
      return true;
    }

    ped.crossingProgress = clamp(nextProgress, 0, 1);
    ped.lateralOffset = fromOffset + (toOffset - fromOffset) * ped.crossingProgress;
    // Heading strictly aligns with actual travel direction across road (never moonwalks)
    const moveSign = latSign * dir;
    ped.heading = Math.atan2(nx * moveSign, nz * moveSign);
    return false;
  }

  private turnCorner(
    ped: PedestrianAgent,
    seg: RoadSegment,
    sNode: RoadNode,
    eNode: RoadNode,
    segLen: number,
    junctionNodeId: string,
    atEnd: boolean
  ): boolean {
    const candidates = this.segsByNode.get(junctionNodeId);
    if (!candidates || candidates.length <= 1) return false;

    const junctionNode = atEnd ? eNode : sNode;
    const ux = (eNode.x - sNode.x) / segLen;
    const uz = (eNode.z - sNode.z) / segLen;
    const nx = -uz;
    const nz = ux;
    const travelX = ux * ped.direction;
    const travelZ = uz * ped.direction;
    const pedSideSign = ped.lateralOffset >= 0 ? 1 : -1;
    const sideVecX = nx * pedSideSign;
    const sideVecZ = nz * pedSideSign;

    const endDist = atEnd ? segLen : 0;
    const endPos = this.computePositionInto(sNode, eNode, endDist, ped.lateralOffset, this.posScratch);
    const cornerRefX = endPos.x - travelX * 0.5;
    const cornerRefZ = endPos.z - travelZ * 0.5;

    let bestSeg: RoadSegment | null = null;
    let bestDir: 1 | -1 = 1;
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i]!;
      if (cand.segmentId === seg.segmentId) continue;
      const cs = this.network.getNode(cand.startNodeId);
      const ce = this.network.getNode(cand.endNodeId);
      if (!cs || !ce) continue;
      const cLen = Math.hypot(ce.x - cs.x, ce.z - cs.z);
      if (cLen < 5) continue;

      const candDir: 1 | -1 = cand.startNodeId === junctionNodeId ? 1 : -1;
      const cux = (ce.x - cs.x) / cLen;
      const cuz = (ce.z - cs.z) / cLen;
      const outX = cux * candDir;
      const outZ = cuz * candDir;

      const dotForward = travelX * outX + travelZ * outZ;
      const dotSide = sideVecX * outX + sideVecZ * outZ;
      // Prefer continuous forward extension or turning around the sidewalk corner (no crossing backward)
      if (dotForward <= 0.25 && (dotSide <= 0.25 || dotForward < -0.5)) continue;

      const score = dotSide * 1.2 + dotForward;
      if (score > bestScore) {
        bestScore = score;
        bestSeg = cand;
        bestDir = candDir;
      }
    }

    if (!bestSeg) return false;
    const bs = this.network.getNode(bestSeg.startNodeId)!;
    const be = this.network.getNode(bestSeg.endNodeId)!;
    const bLen = Math.max(0.1, Math.hypot(be.x - bs.x, be.z - bs.z));
    const bux = (be.x - bs.x) / bLen;
    const buz = (be.z - bs.z) / bLen;
    const bnx = -buz;
    const bnz = bux;

    const rx = cornerRefX - junctionNode.x;
    const rz = cornerRefZ - junctionNode.z;
    const projLat = rx * bnx + rz * bnz;
    const projAlongFromJunction = rx * bux + rz * buz;

    const newSide: 'left' | 'right' = projLat < 0 ? 'left' : 'right';
    const nextSwOffset = getSidewalkOffset(bestSeg);
    ped.segmentId = bestSeg.segmentId;
    ped.direction = bestDir;
    ped.side = newSide;
    ped.lateralOffset = newSide === 'left' ? -nextSwOffset : nextSwOffset;
    if (bestDir === 1) {
      ped.distAlongSegment = clamp(projAlongFromJunction, 0, Math.min(bLen * 0.4, nextSwOffset + 1));
      ped.heading = Math.atan2(bux, buz);
    } else {
      ped.distAlongSegment = clamp(bLen + projAlongFromJunction, Math.max(bLen * 0.6, bLen - nextSwOffset - 1), bLen);
      ped.heading = Math.atan2(-bux, -buz);
    }
    return true;
  }

  private accidentProximity(x: number, z: number): 0 | 1 | 2 {
    let level: 0 | 1 | 2 = 0;
    for (let i = 0; i < this.accidents.length; i++) {
      const a = this.accidents[i]!;
      const dx = x - a.x;
      const dz = z - a.z;
      const dSq = dx * dx + dz * dz;
      if (dSq <= a.radius * a.radius) return 2;
      const zone = a.radius + ACCIDENT_ZONE_MARGIN_M;
      if (dSq <= zone * zone) level = 1;
    }
    return level;
  }

  private nearestAccident(x: number, z: number): { x: number; z: number; radius: number } | null {
    let best: { x: number; z: number; radius: number } | null = null;
    let bestSq = Infinity;
    for (let i = 0; i < this.accidents.length; i++) {
      const a = this.accidents[i]!;
      const dx = x - a.x;
      const dz = z - a.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < bestSq) {
        bestSq = dSq;
        best = a;
      }
    }
    return best;
  }

  /**
   * True when a vehicle or the bike is coming toward (px, pz) and would reach it
   * before a walker who needs `timeNeededS` to get across has finished.
   */
  private crossingHazard(
    px: number,
    pz: number,
    timeNeededS: number,
    hazardWindowS: number,
    player: { x: number; z: number; speed: number; heading?: number } | undefined,
    vehicles: ReadonlyMap<string, VehicleView> | readonly VehicleView[] | undefined
  ): boolean {
    if (player && player.heading !== undefined && this.isApproaching(px, pz, player, timeNeededS, hazardWindowS)) {
      return true;
    }
    if (vehicles) {
      const isReadonlyArray = (
        col: ReadonlyMap<string, VehicleView> | readonly VehicleView[]
      ): col is readonly VehicleView[] => Array.isArray(col);
      if (isReadonlyArray(vehicles)) {
        for (const v of vehicles) {
          if (this.isApproaching(px, pz, v, timeNeededS, hazardWindowS)) return true;
        }
      } else {
        for (const v of vehicles.values()) {
          if (this.isApproaching(px, pz, v, timeNeededS, hazardWindowS)) return true;
        }
      }
    }
    return false;
  }

  private isApproaching(
    px: number,
    pz: number,
    v: { x: number; z: number; speed: number; heading?: number },
    timeNeededS: number,
    hazardWindowS: number
  ): boolean {
    if (v.heading === undefined || Math.abs(v.speed) < 0.5) return false;
    const rx = px - v.x;
    const rz = pz - v.z;
    const dist = Math.hypot(rx, rz);
    if (dist > HAZARD_RANGE_M) return false;
    const vx = Math.sin(v.heading) * v.speed;
    const vz = Math.cos(v.heading) * v.speed;
    if (vx * rx + vz * rz <= 0) return false; // moving away from the point
    return dist / v.speed < timeNeededS + hazardWindowS;
  }

  private computePositionInto(
    sNode: RoadNode,
    eNode: RoadNode,
    distAlong: number,
    lateralOffset: number,
    out: { x: number; z: number }
  ): { x: number; z: number } {
    const dx = eNode.x - sNode.x;
    const dz = eNode.z - sNode.z;
    const len = Math.max(0.1, Math.hypot(dx, dz));
    const t = clamp(distAlong / len, 0, 1);

    const nx = -dz / len;
    const nz = dx / len;

    out.x = sNode.x + dx * t + nx * lateralOffset;
    out.z = sNode.z + dz * t + nz * lateralOffset;
    return out;
  }

  private computePosition(
    sNode: RoadNode,
    eNode: RoadNode,
    distAlong: number,
    lateralOffset: number
  ): { x: number; z: number } {
    return this.computePositionInto(sNode, eNode, distAlong, lateralOffset, { x: 0, z: 0 });
  }
}
