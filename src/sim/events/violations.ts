import type { BikeInfractionKind, RoadNode, RoadSegment } from '../../core/types';
import { angleDiff } from '../../core/math';
import type { BikeState } from '../../physics/bikeModel';
import type { SignalController } from '../traffic/signals';

const SPEEDING_MARGIN_KMH = 8;
const SPEEDING_HYSTERESIS_KMH = 2;
const WRONG_WAY_MIN_SPEED_MS = 1.5;
const WRONG_WAY_ANGLE_RAD = (110 * Math.PI) / 180;
const DIVIDED_MEDIAN_OFFSET_M = 1.0;
const RED_LIGHT_MIN_SPEED_MS = 2.0;
const RED_LIGHT_RADIUS_SQ = 5.5 * 5.5;
const SIGNAL_ELEVATION_TOL_M = 2.5;

const SPEEDING_COOLDOWN_S = 15;
const WRONG_WAY_COOLDOWN_S = 12;
const RED_LIGHT_COOLDOWN_S = 10;

export interface NodeLookup {
  get(nodeId: string): RoadNode | undefined;
}

/**
 * Detects active traffic infractions on the current frame without allocating
 * any heap objects or arrays; callers pass a reusable `out` array.
 */
export function detectViolations(
  bike: BikeState,
  segment: RoadSegment | null,
  signals: SignalController,
  out: BikeInfractionKind[],
  nodes?: NodeLookup
): void {
  out.length = 0;

  const absSpeed = Math.abs(bike.speed);
  const speedKmh = absSpeed * 3.6;

  if (segment !== null) {
    if (speedKmh > segment.speedLimit + SPEEDING_MARGIN_KMH) {
      out.push('speeding');
    }

    if (absSpeed > WRONG_WAY_MIN_SPEED_MS && nodes) {
      const startNode = nodes.get(segment.startNodeId);
      const endNode = nodes.get(segment.endNodeId);
      if (startNode && endNode) {
        const dx = endNode.x - startNode.x;
        const dz = endNode.z - startNode.z;
        const len = Math.hypot(dx, dz);
        if (len > 0.1) {
          const segHeading = Math.atan2(dx, dz);
          const travelHeading = bike.speed >= 0 ? bike.heading : bike.heading + Math.PI;
          const headingDelta = Math.abs(angleDiff(travelHeading, segHeading));

          if (segment.oneWay) {
            if (headingDelta > WRONG_WAY_ANGLE_RAD) {
              out.push('wrongWay');
            }
          } else if (segment.divided) {
            const ux = dx / len;
            const uz = dz / len;
            // Bangladesh drives on the left: forward lane is +left, backward is -left.
            const lat = (bike.x - startNode.x) * uz - (bike.z - startNode.z) * ux;
            if (
              (lat > DIVIDED_MEDIAN_OFFSET_M && headingDelta > WRONG_WAY_ANGLE_RAD) ||
              (lat < -DIVIDED_MEDIAN_OFFSET_M && headingDelta < Math.PI - WRONG_WAY_ANGLE_RAD)
            ) {
              out.push('wrongWay');
            }
          }
        }
      }
    }
  }

  if (bike.speed > RED_LIGHT_MIN_SPEED_MS) {
    const states = signals.getSignalStates();
    for (let i = 0; i < states.length; i++) {
      const st = states[i]!;
      if (Math.abs(st.y - bike.y) > SIGNAL_ELEVATION_TOL_M) continue;
      const dx = st.x - bike.x;
      const dz = st.z - bike.z;
      if (dx * dx + dz * dz > RED_LIGHT_RADIUS_SQ) continue;
      const approach = Math.abs(Math.sin(bike.heading)) >= Math.abs(Math.cos(bike.heading)) ? 0 : 1;
      if (signals.getSignalStatus(st.nodeId, approach) === 'red') {
        out.push('redLight');
        break;
      }
    }
  }
}

/**
 * Tracks violation hysteresis & per-offense cooldowns in-place so each offense
 * emits `bike/infraction` once without allocating on the simulation step loop.
 */
export class ViolationMonitor {
  private readonly scratchOut: BikeInfractionKind[] = [];
  private speedingActive = false;
  private speedingCooldownS = 0;
  private wrongWayActive = false;
  private wrongWayCooldownS = 0;
  private redLightActive = false;
  private redLightCooldownS = 0;

  reset(): void {
    this.scratchOut.length = 0;
    this.speedingActive = false;
    this.speedingCooldownS = 0;
    this.wrongWayActive = false;
    this.wrongWayCooldownS = 0;
    this.redLightActive = false;
    this.redLightCooldownS = 0;
  }

  step(
    bike: BikeState,
    segment: RoadSegment | null,
    signals: SignalController,
    dt: number,
    nodes: NodeLookup | undefined,
    onInfraction: (kind: BikeInfractionKind, segmentId: string) => void
  ): void {
    this.speedingCooldownS = Math.max(0, this.speedingCooldownS - dt);
    this.wrongWayCooldownS = Math.max(0, this.wrongWayCooldownS - dt);
    this.redLightCooldownS = Math.max(0, this.redLightCooldownS - dt);

    detectViolations(bike, segment, signals, this.scratchOut, nodes);

    let hasSpeeding = false;
    let hasWrongWay = false;
    let hasRedLight = false;
    for (let i = 0; i < this.scratchOut.length; i++) {
      const kind = this.scratchOut[i]!;
      if (kind === 'speeding') hasSpeeding = true;
      else if (kind === 'wrongWay') hasWrongWay = true;
      else if (kind === 'redLight') hasRedLight = true;
    }

    const segmentId = segment?.segmentId ?? 'unknown';
    const speedKmh = Math.abs(bike.speed) * 3.6;

    if (hasSpeeding) {
      if (!this.speedingActive && this.speedingCooldownS <= 0) {
        this.speedingActive = true;
        this.speedingCooldownS = SPEEDING_COOLDOWN_S;
        onInfraction('speeding', segmentId);
      }
    } else if (
      this.speedingActive &&
      (!segment || speedKmh <= segment.speedLimit + SPEEDING_HYSTERESIS_KMH)
    ) {
      this.speedingActive = false;
    }

    if (hasWrongWay) {
      if (!this.wrongWayActive && this.wrongWayCooldownS <= 0) {
        this.wrongWayActive = true;
        this.wrongWayCooldownS = WRONG_WAY_COOLDOWN_S;
        onInfraction('wrongWay', segmentId);
      }
    } else {
      this.wrongWayActive = false;
    }

    if (hasRedLight) {
      if (!this.redLightActive && this.redLightCooldownS <= 0) {
        this.redLightActive = true;
        this.redLightCooldownS = RED_LIGHT_COOLDOWN_S;
        onInfraction('redLight', segmentId);
      }
    } else {
      this.redLightActive = false;
    }
  }
}
