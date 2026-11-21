import type { WeatherKind, RoadSegment, RideRequest, MeterId } from '../../core/types';
import type { Condition } from '../schemas';

export type EncounterPhase =
  | 'requestOffered'
  | 'enRouteToPickup'
  | 'atPickup'
  | 'onTrip'
  | 'dropOff'
  | 'postDropoff'
  | 'roaming';

export interface EncounterContext {
  phase: EncounterPhase;
  minute: number;
  day: number;
  weather: WeatherKind;
  chapter: number;
  flags: Record<string, boolean | number | string>;
  relationships: Record<string, number>;
  cash: number;
  speedKmh: number;
  bikeCondition: number;
  segment?: RoadSegment | null;
  activeRequest?: RideRequest | null;
  hasEscapePath?: boolean;
  witnesses?: number;
  meters?: Partial<Record<MeterId, number>>;
  tripDistanceM?: number;
  pickupDistanceM?: number;
  roamDistanceM?: number;
  nearbyAnchorKinds?: readonly string[];
  nearbyAnchorPlaceKey?: string;
  nearbyRoadEventKinds?: readonly string[];
  inFastForward?: boolean;
  passenger?: {
    id: string;
    trust: number;
    mood: number;
    localKnowledge?: number;
    paymentReliability?: number;
    archetype?: string;
    hasChild?: boolean;
  } | null;
}

export function evaluateCondition(
  cond: Condition,
  ctx: EncounterContext
): boolean {
  if (cond.phase && cond.phase !== ctx.phase) {
    return false;
  }

  if (cond.weather && !cond.weather.includes(ctx.weather)) {
    return false;
  }

  if (cond.hours) {
    const h = (ctx.minute / 60) % 24;
    const [minH, maxH] = cond.hours;
    if (minH <= maxH) {
      if (h < minH || h > maxH) return false;
    } else {
      // Over midnight, e.g. [22, 4]
      if (h < minH && h > maxH) return false;
    }
  }

  if (cond.chapter !== undefined) {
    if (typeof cond.chapter === 'number') {
      if (ctx.chapter !== cond.chapter) return false;
    } else {
      const [minCh, maxCh] = cond.chapter;
      if (ctx.chapter < minCh || ctx.chapter > maxCh) return false;
    }
  }

  if (cond.flags) {
    for (const [k, v] of Object.entries(cond.flags)) {
      if (ctx.flags[k] !== v) return false;
    }
  }

  if (cond.notFlags) {
    for (const [k, expectedAbsent] of Object.entries(cond.notFlags)) {
      if (expectedAbsent ? Boolean(ctx.flags[k]) : ctx.flags[k] === false) {
        return false;
      }
    }
  }

  if (cond.minRelationship) {
    for (const [charId, minVal] of Object.entries(cond.minRelationship)) {
      const current = ctx.relationships[charId] ?? 0;
      if (current < minVal) return false;
    }
  }

  if (cond.tags && cond.tags.length > 0) {
    if (!ctx.segment) return false;
    const hasTag = cond.tags.some((t) => ctx.segment!.tags.includes(t));
    if (!hasTag) return false;
  }

  if (cond.roadType && cond.roadType.length > 0) {
    if (!ctx.segment || !cond.roadType.includes(ctx.segment.roadType)) {
      return false;
    }
  }

  if (cond.district && cond.district.length > 0) {
    if (!ctx.segment || !cond.district.includes(ctx.segment.district)) {
      return false;
    }
  }

  if (cond.minTrust !== undefined) {
    const current = ctx.passenger?.trust ?? 0;
    if (current < cond.minTrust) return false;
  }

  if (cond.maxTrust !== undefined) {
    const current = ctx.passenger?.trust ?? 100;
    if (current > cond.maxTrust) return false;
  }

  if (cond.minMood !== undefined) {
    const current = ctx.passenger?.mood ?? 0;
    if (current < cond.minMood) return false;
  }

  if (cond.maxMood !== undefined) {
    const current = ctx.passenger?.mood ?? 1.0;
    if (current > cond.maxMood) return false;
  }

  if (cond.minCash !== undefined && ctx.cash < cond.minCash) {
    return false;
  }

  if (cond.maxCash !== undefined && ctx.cash > cond.maxCash) {
    return false;
  }

  if (cond.minSpeed !== undefined && ctx.speedKmh < cond.minSpeed) {
    return false;
  }

  if (cond.maxSpeed !== undefined && ctx.speedKmh > cond.maxSpeed) {
    return false;
  }

  if (cond.hasPassenger !== undefined) {
    const actuallyHasPassenger =
      ctx.activeRequest !== undefined
        ? Boolean(ctx.activeRequest && ctx.activeRequest.status === 'OnTrip')
        : ctx.phase === 'onTrip' || ctx.phase === 'dropOff';
    if (actuallyHasPassenger !== cond.hasPassenger) return false;
  }
  if (
    cond.minTripDistanceM !== undefined &&
    ctx.tripDistanceM !== undefined &&
    ctx.tripDistanceM < cond.minTripDistanceM
  ) {
    return false;
  }
  if (
    cond.minPickupDistanceM !== undefined &&
    ctx.pickupDistanceM !== undefined &&
    ctx.pickupDistanceM < cond.minPickupDistanceM
  ) {
    return false;
  }
  if (
    cond.minRoamDistanceM !== undefined &&
    ctx.roamDistanceM !== undefined &&
    ctx.roamDistanceM < cond.minRoamDistanceM
  ) {
    return false;
  }
  if (
    cond.requiresAnchorKind !== undefined &&
    cond.requiresAnchorKind.length > 0 &&
    ctx.nearbyAnchorKinds !== undefined
  ) {
    let matched = false;
    for (let i = 0; i < cond.requiresAnchorKind.length; i++) {
      if (ctx.nearbyAnchorKinds.includes(cond.requiresAnchorKind[i]!)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  if (
    cond.requiresRoadEventKind !== undefined &&
    cond.requiresRoadEventKind.length > 0 &&
    ctx.nearbyRoadEventKinds !== undefined
  ) {
    let matched = false;
    for (let i = 0; i < cond.requiresRoadEventKind.length; i++) {
      if (ctx.nearbyRoadEventKinds.includes(cond.requiresRoadEventKind[i]!)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  if (
    cond.requiresChild !== undefined &&
    ctx.passenger !== undefined &&
    ctx.passenger !== null &&
    ctx.passenger.hasChild !== undefined &&
    ctx.passenger.hasChild !== cond.requiresChild
  ) {
    return false;
  }

  if (cond.passengerLocalKnowledgeMin !== undefined) {
    const val = ctx.passenger?.localKnowledge ?? 0;
    if (val < cond.passengerLocalKnowledgeMin) return false;
  }

  if (cond.passengerPaymentReliabilityMax !== undefined) {
    const val = ctx.passenger?.paymentReliability ?? 1.0;
    if (val > cond.passengerPaymentReliabilityMax) return false;
  }

  if (cond.bikeConditionMax !== undefined && ctx.bikeCondition > cond.bikeConditionMax) {
    return false;
  }

  if (cond.hasEscapePath !== undefined) {
    const escape =
      ctx.hasEscapePath ??
      (ctx.segment ? !ctx.segment.tags.includes('deadend') : true);
    if (escape !== cond.hasEscapePath) return false;
  }

  if (cond.witnessesMin !== undefined) {
    const witnesses =
      ctx.witnesses ?? Math.round((ctx.segment?.pedestrianDensity ?? 0) * 5);
    if (witnesses < cond.witnessesMin) return false;
  }

  if (cond.passengerTrustMin !== undefined) {
    const current = ctx.passenger?.trust ?? 0;
    if (current < cond.passengerTrustMin) return false;
  }

  if (cond.minRiskLevel !== undefined) {
    if (!ctx.segment || ctx.segment.riskLevel < cond.minRiskLevel) return false;
  }

  if (cond.meterMax) {
    for (const [meter, maxVal] of Object.entries(cond.meterMax)) {
      const current = ctx.meters?.[meter as MeterId] ?? 0;
      if (current > maxVal) return false;
    }
  }

  if (cond.custom && !ctx.flags[cond.custom]) {
    return false;
  }

  return true;
}
