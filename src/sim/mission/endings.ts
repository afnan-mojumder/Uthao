import type { EndingId, PlayerEconomy, StoryState, SafetyRecord } from '../../core/types';
import {
  calculateIdentityTendencies,
  getDominantIdentity,
  type IdentityTendencies,
  type IdentityMetrics,
} from '../reputation/identity';

export type CareerChoice = 'workshop' | 'bike' | 'continue';

export interface EndingEvaluationContext {
  day: number;
  economy: PlayerEconomy;
  story: StoryState;
  rating: number;
  localTrust: number;
  safetyRecord: SafetyRecord;
  riskScore: number;
  promises: { kept: number; broken: number };
  careerChoice?: CareerChoice;
  appSuspended?: boolean;
}

export interface CareerChoiceOption {
  id: CareerChoice;
  titleKey: string;
  descKey: string;
  cost: number;
  available: boolean;
  disabledReason?: string;
}

export interface EndingResult {
  endingId: EndingId;
  titleKey: string;
  descKey: string;
  tendencies: IdentityTendencies;
  dominantIdentity: string;
  summary: {
    cash: number;
    savings: number;
    debt: number;
    rating: number;
    localTrust: number;
    completedMissions: number;
  };
}

export function getAvailableCareerChoices(
  savings: number,
  kamalRelationship: number = 0
): CareerChoiceOption[] {
  return [
    {
      id: 'workshop',
      titleKey: 'choice_workshop_title',
      descKey: 'choice_workshop_desc',
      cost: 25000,
      available: savings >= 25000 && kamalRelationship >= 30,
      disabledReason:
        savings < 25000
          ? 'Requires ৳25,000 workshop deposit'
          : kamalRelationship < 30
          ? 'Requires Kamal bhai relationship ≥ 30'
          : undefined,
    },
    {
      id: 'bike',
      titleKey: 'choice_bike_title',
      descKey: 'choice_bike_desc',
      cost: 15000,
      available: savings >= 15000,
      disabledReason: savings < 15000 ? 'Requires ৳15,000 for used 125cc bike' : undefined,
    },
    {
      id: 'continue',
      titleKey: 'choice_continue_title',
      descKey: 'choice_continue_desc',
      cost: 0,
      available: true,
    },
  ];
}

/**
 * Evaluates the final campaign ending in strict priority order (first match wins).
 * GDD §12 & Plan §T5.5.
 */
export function evaluateEnding(ctx: EndingEvaluationContext): EndingResult {
  const { economy, story, rating, localTrust, safetyRecord, riskScore, promises } = ctx;

  const identityMetrics: IdentityMetrics = {
    rating,
    safetyRecord,
    riskScore,
    localTrust,
    promisesKept: promises.kept,
    promisesBroken: promises.broken,
    relationships: story.characterRelationships,
    joinedScheme: story.branchFlags['joinedScheme'] === true,
  };

  const tendencies = calculateIdentityTendencies(identityMetrics);
  const dominantIdentity = getDominantIdentity(tendencies);

  const kamalRel = story.characterRelationships['kamal_bhai'] ?? 0;
  const isSuspended = ctx.appSuspended || story.branchFlags['appSuspended'] === true;

  let endingId: EndingId;

  // 1. Fresh Start: appSuspended at Day 20 OR debt >= 5000 OR rating < 3.5
  if (isSuspended || economy.debt >= 5000 || rating < 3.5) {
    endingId = 'fresh_start';
  }
  // 2. Fast Money: joinedScheme OR (riskScore >= 8 AND localTrust < 40 AND savings >= 20000)
  else if (
    story.branchFlags['joinedScheme'] === true ||
    (riskScore >= 8 && localTrust < 40 && economy.savings >= 20000)
  ) {
    endingId = 'fast_money';
  }
  // 3. Workshop Owner: choice workshop AND savings >= 25000 AND relationship.kamal >= 30
  else if (ctx.careerChoice === 'workshop' && economy.savings >= 25000 && kamalRel >= 30) {
    endingId = 'workshop_owner';
  }
  // 4. Independent Rider: choice bike AND savings >= 15000
  else if (ctx.careerChoice === 'bike' && economy.savings >= 15000) {
    endingId = 'independent_rider';
  }
  // 5. Trusted Local: localTrust >= 70 AND rating >= 4.6 (accessible with low savings!)
  else if (localTrust >= 70 && rating >= 4.6) {
    endingId = 'trusted_local';
  }
  // 6. Fallback
  else if (economy.savings >= 5000 && rating >= 4.0) {
    endingId = 'independent_rider';
  } else {
    endingId = 'fresh_start';
  }

  return {
    endingId,
    titleKey: `ending_${endingId}_title`,
    descKey: `ending_${endingId}_desc`,
    tendencies,
    dominantIdentity,
    summary: {
      cash: economy.cash,
      savings: economy.savings,
      debt: economy.debt,
      rating,
      localTrust,
      completedMissions: story.completedMissions.length,
    },
  };
}
