import type { RoadNode } from '../../core/types';
import type { Route } from './routing';
import { angleDiff } from '../../core/math';

export interface NavInstruction {
  kind: 'left' | 'right' | 'straight' | 'uturn' | 'arrive';
  distanceM: number;
  /** i18n key (data/dialogue/{bn,en}/hud.json); `{dist}` is the distance in metres. */
  textKey: string;
}

type NodeLookup = { get(nodeId: string): RoadNode | undefined };

// Both functions run per step / per frame: results are written into these reused objects.
const loc = { leg: 0, dist: 0 };
const instr: NavInstruction = { kind: 'straight', distanceM: 0, textKey: 'nav.straight' };

const STRAIGHT_RAD = (30 * Math.PI) / 180;
const UTURN_RAD = (150 * Math.PI) / 180;
const WRONG_WAY_RAD = (120 * Math.PI) / 180;

/** Finds the route leg nearest (x, z) and the distance to it. Allocation-free. */
function locate(route: Route, nodes: NodeLookup, x: number, z: number): boolean {
  const ids = route.nodeIds;
  let best = Infinity;
  let bestLeg = -1;
  for (let i = 0; i + 1 < ids.length; i++) {
    const a = nodes.get(ids[i]!);
    const b = nodes.get(ids[i + 1]!);
    if (!a || !b) continue;
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    let t = lenSq > 0 ? ((x - a.x) * dx + (z - a.z) * dz) / lenSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + t * dx - x;
    const pz = a.z + t * dz - z;
    const d = Math.sqrt(px * px + pz * pz);
    if (d < best) {
      best = d;
      bestLeg = i;
    }
  }
  loc.leg = bestLeg;
  loc.dist = best;
  return bestLeg >= 0;
}

/** Metres from (x, z) to the route's polyline; Infinity for a route with no legs. */
export function distanceToRoute(
  route: Route,
  nodes: NodeLookup,
  x: number,
  z: number
): number {
  return locate(route, nodes, x, z) ? loc.dist : Infinity;
}

/**
 * True when a bike at `(x, z)` with `heading` is facing against (`> 120°`) the
 * nearest leg of `route`. Allocation-free.
 */
export function isWrongWayOnRoute(
  route: Route,
  nodes: NodeLookup,
  x: number,
  z: number,
  heading: number
): boolean {
  if (!locate(route, nodes, x, z)) return false;
  const ids = route.nodeIds;
  const a = nodes.get(ids[loc.leg]!);
  const b = nodes.get(ids[loc.leg + 1]!);
  if (!a || !b) return false;
  const legHeading = Math.atan2(b.x - a.x, b.z - a.z);
  return Math.abs(angleDiff(heading, legHeading)) > WRONG_WAY_RAD;
}

/**
 * The next maneuver along `route` for a bike at `pose`, or null when there is nothing
 * to follow. Heading convention is the bike's: `atan2(dx, dz)`, so a positive heading
 * change is a LEFT turn. The returned object is reused on every call: read it
 * immediately, never keep a reference.
 */
export function nextInstruction(
  route: Route | null,
  pose: { x: number; z: number; heading: number },
  nodes: NodeLookup
): NavInstruction | null {
  if (!route || route.nodeIds.length === 0) return null;
  const ids = route.nodeIds;
  const last = nodes.get(ids[ids.length - 1]!);
  if (!last) return null;
  if (ids.length < 2 || !locate(route, nodes, pose.x, pose.z)) {
    instr.kind = 'arrive';
    instr.textKey = 'nav.arrive';
    instr.distanceM = Math.hypot(last.x - pose.x, last.z - pose.z);
    return instr;
  }

  const leg = loc.leg;
  const a = nodes.get(ids[leg]!)!;
  const b = nodes.get(ids[leg + 1]!)!;
  const legHeading = Math.atan2(b.x - a.x, b.z - a.z);
  const toNext = Math.hypot(b.x - pose.x, b.z - pose.z);

  // Facing against the leg (wrong way): turn around before anything else.
  if (leg >= 0 && Math.abs(angleDiff(pose.heading, legHeading)) > WRONG_WAY_RAD) {
    instr.kind = 'uturn';
    instr.textKey = 'nav.uturn';
    instr.distanceM = 0;
    return instr;
  }

  const c = leg + 2 < ids.length ? nodes.get(ids[leg + 2]!) : undefined;
  instr.distanceM = toNext;
  if (!c) {
    instr.kind = 'arrive';
    instr.textKey = 'nav.arrive';
    return instr;
  }
  const turn = angleDiff(legHeading, Math.atan2(c.x - b.x, c.z - b.z));
  const mag = Math.abs(turn);
  if (mag < STRAIGHT_RAD) {
    instr.kind = 'straight';
    instr.textKey = 'nav.straight';
  } else if (mag > UTURN_RAD) {
    instr.kind = 'uturn';
    instr.textKey = 'nav.uturn';
  } else if (turn > 0) {
    instr.kind = 'left';
    instr.textKey = 'nav.left';
  } else {
    instr.kind = 'right';
    instr.textKey = 'nav.right';
  }
  return instr;
}

/**
 * Estimates remaining minutes along `route` from `pose` to the final node.
 * Allocation-free: safe to call every frame for HUD ETA display.
 */
export function remainingRouteEtaMin(
  route: Route | null,
  pose: { x: number; z: number },
  nodes: NodeLookup
): number | undefined {
  if (!route || route.nodeIds.length === 0) return undefined;
  const ids = route.nodeIds;
  if (ids.length < 2 || route.lengthM <= 0 || !locate(route, nodes, pose.x, pose.z)) {
    return Math.max(0, Math.round(route.etaMin));
  }

  const leg = loc.leg;
  const a = nodes.get(ids[leg]!);
  const b = nodes.get(ids[leg + 1]!);
  let remainingM = 0;
  if (a && b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const lenSq = dx * dx + dz * dz;
    const legLen = Math.sqrt(lenSq);
    let t = lenSq > 0 ? ((pose.x - a.x) * dx + (pose.z - a.z) * dz) / lenSq : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    remainingM += legLen * (1 - t);
  }
  for (let i = leg + 1; i + 1 < ids.length; i++) {
    const na = nodes.get(ids[i]!);
    const nb = nodes.get(ids[i + 1]!);
    if (na && nb) {
      remainingM += Math.hypot(nb.x - na.x, nb.z - na.z);
    }
  }
  const ratio = Math.min(1, Math.max(0, remainingM / route.lengthM));
  if (remainingM <= 15) return 0;
  return Math.max(1, Math.round(route.etaMin * ratio));
}
