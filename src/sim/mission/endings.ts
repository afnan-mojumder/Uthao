import type { EndingId, MeterId, PlayerEconomy, StoryState, SafetyRecord } from '../../core/types';
import { BALANCE } from '../../config/balance';
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
  meters?: Partial<Record<MeterId, number>>;
  promises: { kept: number; broken: number };
  careerChoice?: CareerChoice;
  /** Savings the player had when they made the career choice, before paying for it. */
  careerSavings?: number;
  appSuspended?: boolean;
}

export interface CareerChoiceOption {
  id: CareerChoice;
  titleKey: string;
  descKey: string;
  cost: number;
  available: boolean;
  disabledReason?: string;
  disabledReasonKey?: string;
  disabledReasonVars?: Record<string, string | number>;
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
  const workshopCost = BALANCE.GOALS.workshopDeposit;
  const bikeCost = BALANCE.GOALS.betterBike;
  return [
    {
      id: 'workshop',
      titleKey: 'choice_workshop_title',
      descKey: 'choice_workshop_desc',
      cost: workshopCost,
      available: savings >= workshopCost && kamalRelationship >= 30,
      disabledReason:
        savings < workshopCost
          ? `Requires ৳${workshopCost.toLocaleString('en-US')} workshop deposit`
          : kamalRelationship < 30
          ? 'Requires Kamal bhai relationship ≥ 30'
          : undefined,
      disabledReasonKey:
        savings < workshopCost
          ? 'ending.choice_requires_workshop_deposit'
          : kamalRelationship < 30
          ? 'ending.choice_requires_kamal_rel'
          : undefined,
      disabledReasonVars:
        savings < workshopCost
          ? { cost: workshopCost.toLocaleString('en-US') }
          : kamalRelationship < 30
          ? { min: 30 }
          : undefined,
    },
    {
      id: 'bike',
      titleKey: 'choice_bike_title',
      descKey: 'choice_bike_desc',
      cost: bikeCost,
      available: savings >= bikeCost,
      disabledReason:
        savings < bikeCost
          ? `Requires ৳${bikeCost.toLocaleString('en-US')} for used 125cc bike`
          : undefined,
      disabledReasonKey:
        savings < bikeCost ? 'ending.choice_requires_bike_savings' : undefined,
      disabledReasonVars:
        savings < bikeCost ? { cost: bikeCost.toLocaleString('en-US') } : undefined,
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

  const kamalRel = story.characterRelationships['char_kamal'] ?? 0;
  const maRel = story.characterRelationships['char_ma'] ?? 0;
  const decisionSavings = ctx.careerSavings ?? economy.savings;

  const riderIntegrity = ctx.meters?.riderIntegrity ?? BALANCE.KARMA.starts.riderIntegrity;
  const publicReputation = ctx.meters?.publicReputation ?? localTrust ?? BALANCE.KARMA.starts.publicReputation;
  const platformStanding = ctx.meters?.platformStanding ?? BALANCE.KARMA.starts.platformStanding;
  const criminalExposure = ctx.meters?.criminalExposure ?? BALANCE.KARMA.starts.criminalExposure;
  const evidenceExposure = ctx.meters?.evidenceExposure ?? BALANCE.KARMA.starts.evidenceExposure;
  const safetyMeter = ctx.meters?.safetyRecord ?? BALANCE.KARMA.starts.safetyRecord;

  const isSuspended =
    Boolean(ctx.appSuspended) ||
    story.branchFlags['appSuspended'] === true ||
    platformStanding < BALANCE.KARMA.platformSuspensionStandingThreshold;

  const workshopCost = BALANCE.GOALS.workshopDeposit;
  const bikeCost = BALANCE.GOALS.betterBike;

  const highCriminalHustle =
    (criminalExposure >= 40 || evidenceExposure >= 40) &&
    riderIntegrity < 40 &&
    publicReputation < 70 &&
    (decisionSavings >= bikeCost || economy.cash >= bikeCost);

  let endingId: EndingId;

  // 1. Fresh Start: appSuspended at Day 20 OR debt >= 5000 OR rating < 3.5 OR severe safety collapse
  if (
    isSuspended ||
    economy.debt >= 5000 ||
    rating < 3.5 ||
    safetyMeter <= 20 ||
    (evidenceExposure >= 80 && riderIntegrity < 30 && decisionSavings < bikeCost)
  ) {
    endingId = 'fresh_start';
  }
  // 2. Fast Money: joinedScheme OR risky/illicit high-exposure hustle for big cash
  else if (
    story.branchFlags['joinedScheme'] === true ||
    (riskScore >= 8 && publicReputation < 40 && decisionSavings >= 20000) ||
    highCriminalHustle
  ) {
    endingId = 'fast_money';
  }
  // 3. Workshop Owner: choice workshop AND savings >= workshopDeposit AND relationship.kamal >= 30.
  // The choice is paid for first, so savings are judged as they were before it.
  else if (ctx.careerChoice === 'workshop' && decisionSavings >= workshopCost && kamalRel >= 30) {
    endingId = 'workshop_owner';
  }
  // 4. Independent Rider: choice bike AND savings >= betterBike
  else if (ctx.careerChoice === 'bike' && decisionSavings >= bikeCost) {
    endingId = 'independent_rider';
  }
  // 5. Trusted Local: publicReputation >= 70 AND rating >= 4.6 AND intact riderIntegrity (accessible with low savings!)
  else if (
    (publicReputation >= 70 && rating >= 4.6 && riderIntegrity >= 45) ||
    (publicReputation >= 60 &&
      rating >= 4.5 &&
      riderIntegrity >= 55 &&
      maRel >= 40 &&
      story.branchFlags['cooperatedPolice'] === true)
  ) {
    endingId = 'trusted_local';
  }
  // 6. Fallback
  else if (decisionSavings >= 5000 && rating >= 4.0) {
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
