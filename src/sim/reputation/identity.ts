import type { SafetyRecord } from '../../core/types';
import { clamp } from '../../core/math';

export interface IdentityTendencies {
  professional: number; // 0-100
  negotiator: number;   // 0-100
  hustler: number;      // 0-100
  regular: number;      // 0-100
}

export interface IdentityMetrics {
  rating: number; // 1.0 - 5.0
  safetyRecord: SafetyRecord;
  riskScore: number;
  localTrust: number; // 0-100
  promisesKept: number;
  promisesBroken: number;
  relationships: Record<string, number>;
  offAppTripsCount?: number;
  countersAcceptedCount?: number;
  totalTripsCount?: number;
  fareNetRatio?: number;
  helpChoicesCount?: number;
  joinedScheme?: boolean;
}

export function calculateIdentityTendencies(metrics: IdentityMetrics): IdentityTendencies {
  const {
    rating,
    safetyRecord,
    riskScore,
    localTrust,
    promisesKept,
    promisesBroken,
    relationships,
    offAppTripsCount = 0,
    countersAcceptedCount = 0,
    fareNetRatio,
    helpChoicesCount = 0,
    joinedScheme = false,
  } = metrics;

  // 1. Professional (rating, safety record, punctuality)
  const ratingBase = Math.max(0, (rating - 3.0) / 2.0) * 70;
  const safetyBonus = (safetyRecord.crashes === 0 ? 15 : 0) + (safetyRecord.nearMisses < 5 ? 15 : 0);
  const safetyPenalty = safetyRecord.crashes * 30 + safetyRecord.bumps * 5 + safetyRecord.infractions * 10;
  const professional = Math.round(clamp(ratingBase + safetyBonus - safetyPenalty, 0, 100));

  // 2. Negotiator (bargaining, avg net/fare ratio, successful counters, promises kept)
  const negBase = 30;
  const counterBonus = Math.min(35, countersAcceptedCount * 6);
  const fareRatioBonus =
    fareNetRatio !== undefined
      ? Math.min(25, Math.max(-20, (fareNetRatio - 1.0) * 100))
      : 0;
  const promiseBonus = Math.min(20, promisesKept * 5);
  const promisePenalty = promisesBroken * 15;
  const negotiator = Math.round(
    clamp(negBase + counterBonus + fareRatioBonus + promiseBonus - promisePenalty, 0, 100)
  );

  // 3. Hustler (riskScore, infractions, off-app count, illicit scheme)
  const riskBase = riskScore * 10;
  const infractionBonus = safetyRecord.infractions * 12;
  const offAppBonus = offAppTripsCount * 12;
  const schemeBonus = joinedScheme ? 40 : 0;
  const hustler = Math.round(clamp(riskBase + infractionBonus + offAppBonus + schemeBonus, 0, 100));

  // 4. Regular (relationships, localTrust, help choices, community promises)
  const trustBase = localTrust * 0.6;
  const positiveRelSum = Object.values(relationships).reduce(
    (sum, val) => (val > 0 ? sum + Math.min(15, val * 0.5) : sum),
    0
  );
  const relBonus = Math.min(30, positiveRelSum);
  const helpBonus = Math.min(15, helpChoicesCount * 5);
  const regPromiseBonus = Math.min(20, promisesKept * 4);
  const regPromisePenalty = promisesBroken * 10;
  const regular = Math.round(
    clamp(trustBase + relBonus + helpBonus + regPromiseBonus - regPromisePenalty, 0, 100)
  );

  return {
    professional,
    negotiator,
    hustler,
    regular,
  };
}

export interface SnapshotLikeForIdentity {
  reputation?: {
    rating: number;
    localTrust: number;
    safetyRecord: SafetyRecord;
    riskScore: number;
    promises: { kept: number; broken: number };
  };
  story?: {
    characterRelationships: Record<string, number>;
    branchFlags: Record<string, boolean | number | string>;
  };
}

export function calculateTendenciesFromSnapshot(snapshot: SnapshotLikeForIdentity): IdentityTendencies {
  const rep = snapshot.reputation;
  const story = snapshot.story;
  return calculateIdentityTendencies({
    rating: rep?.rating ?? 5.0,
    safetyRecord: rep?.safetyRecord ?? { nearMisses: 0, bumps: 0, crashes: 0, infractions: 0 },
    riskScore: rep?.riskScore ?? 0,
    localTrust: rep?.localTrust ?? 30,
    promisesKept: rep?.promises?.kept ?? 0,
    promisesBroken: rep?.promises?.broken ?? 0,
    relationships: story?.characterRelationships ?? {},
    joinedScheme: story?.branchFlags?.['joinedScheme'] === true,
  });
}

export function getDominantIdentity(tendencies: IdentityTendencies): keyof IdentityTendencies {
  let highestKey: keyof IdentityTendencies = 'professional';
  let highestVal = -1;

  for (const [key, val] of Object.entries(tendencies) as [keyof IdentityTendencies, number][]) {
    if (val > highestVal) {
      highestVal = val;
      highestKey = key;
    }
  }

  return highestKey;
}
