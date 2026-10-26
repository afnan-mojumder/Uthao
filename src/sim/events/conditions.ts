import type { WeatherKind, RoadSegment, RideRequest } from '../../core/types';
import type { Condition } from '../schemas';

export type EncounterPhase =
  | 'requestOffered'
  | 'atPickup'
  | 'onTrip'
  | 'dropOff'
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
  passenger?: {
    id: string;
    trust: number;
    mood: number;
    localKnowledge?: number;
    paymentReliability?: number;
    archetype?: string;
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
    const actuallyHasPassenger = Boolean(
      ctx.activeRequest && ctx.activeRequest.status === 'OnTrip'
    );
    if (actuallyHasPassenger !== cond.hasPassenger) return false;
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

  if (cond.custom && !ctx.flags[cond.custom]) {
    return false;
  }

  return true;
}
