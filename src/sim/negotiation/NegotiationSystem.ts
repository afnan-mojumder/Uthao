import type {
  PassengerProfile,
  RideRequest,
  ReasonCode,
  NegotiationOutcome,
  SpecialCircumstance,
} from '../../core/types';
import { clamp } from '../../core/math';
import { Rng, hashSeed } from '../../core/rng';
import { BALANCE } from '../../config/balance';
import { fairFare } from './fare';
import { expectedBudget, openingOffer } from '../passenger/PassengerAI';
import { defaultDialogueManager } from '../dialogue/DialogueManager';

export interface NegotiationContext {
  traffic: number;
  day: number;
  walkM: number;
  rng: Rng;
}

export type NegotiationAction =
  | { kind: 'accept' }
  | { kind: 'counter'; amount: number }
  | { kind: 'discount'; amount: number }
  | { kind: 'pickupAdjust'; walkM: number; savesMin: number }
  | { kind: 'explainDetour'; extraMin: number }
  | { kind: 'refuseAlley'; walkM: number }
  | { kind: 'offApp'; amount: number }
  | { kind: 'decline' };

export interface NegotiationSession {
  readonly req: RideRequest;
  readonly profile: PassengerProfile;
  readonly ctx: NegotiationContext;
  readonly fairFare: number;
  readonly expectedBudget: number;
  readonly currentPassengerOffer: number;
  readonly currentRiderOffer: number | null;
  readonly round: number;
  readonly maxRounds: number;
  readonly currentPatience: number;
  readonly status: 'active' | 'accepted' | 'walkedAway';
  readonly walkM: number;
  readonly detourExtraMin: number;
}

export interface NegotiationResult {
  session: NegotiationSession;
  passengerLine: string; /* i18n key */
  outcome?: NegotiationOutcome;
  topFactor: ReasonCode;
}

export function calculateMaxRounds(profile: PassengerProfile): number {
  const base = 1 + Math.round(profile.patience * 2);
  const bargainerBonus = profile.archetype === 'bargainer' ? 1 : 0;
  return base + bargainerBonus;
}

export function clampCounterFare(amount: number, fair: number): number {
  const minFare = BALANCE.FARE.minFare; // 50
  const maxFare = Math.max(minFare, BALANCE.FARE.maxCounterMultiple * fair);
  const safeAmount = Number.isFinite(amount) ? amount : fair;
  const rounded = Math.round(safeAmount / BALANCE.FARE.roundTo) * BALANCE.FARE.roundTo;
  return clamp(rounded, minFare, maxFare);
}

export function calculateWalkPenalty(
  walkM: number,
  profile: PassengerProfile,
  specialCircumstance?: SpecialCircumstance
): number {
  if (walkM <= 0) return 0;
  let penalty = (walkM / 100) * 0.4;
  if (profile.traits.child) {
    penalty *= 2.0;
  }
  if (profile.traits.luggage) {
    penalty *= 2.0;
  }
  if (specialCircumstance === 'rain') {
    penalty *= 1.5;
  }
  const toleranceScale = Math.max(0.2, 1.5 - profile.traits.walkTolerance);
  return penalty * toleranceScale;
}

interface FactorContributions {
  contribFare: number;
  contribUrgency: number;
  contribTrust: number;
  contribPatience: number;
  contribTraffic: number;
  contribWalk: number;
  detourBoost: number;
  pAccept: number;
  topFactor: ReasonCode;
}

export function evaluateFactors(
  session: NegotiationSession,
  fare: number,
  additionalWalkM = 0
): FactorContributions {
  const cfg = BALANCE.NEGOTIATION;
  const B = session.expectedBudget;
  const F = fare;

  const fareDiffNorm = (B - F) / Math.max(B, 1);
  const contribFare = cfg.a * fareDiffNorm;

  const U = session.profile.urgency;
  const contribUrgency = cfg.b * U;

  const R = session.profile.trustInRider;
  const contribTrust = cfg.c * R;

  const P = session.currentPatience;
  const contribPatience = cfg.d * P;

  const traffic = clamp(session.ctx.traffic, 0, 1);
  const contribTraffic = -cfg.e * traffic;

  const totalWalkM = session.walkM + additionalWalkM;
  const walkPenalty = calculateWalkPenalty(
    totalWalkM,
    session.profile,
    session.req.specialCircumstance
  );
  const contribWalk = -cfg.e * walkPenalty;

  const detourBoost =
    session.detourExtraMin > 0
      ? 0.6 * (session.detourExtraMin / 10) * (0.5 + 0.5 * U)
      : 0;

  const z =
    cfg.k0 +
    contribFare +
    contribUrgency +
    contribTrust +
    contribPatience +
    contribTraffic +
    contribWalk +
    detourBoost;

  const pAccept = 1 / (1 + Math.exp(-z));

  // Determine topFactor: the term with the largest absolute contribution
  const candidates: { factor: ReasonCode; magnitude: number }[] = [
    {
      factor: F > B ? 'TOO_EXPENSIVE' : 'FAIR_PRICE',
      magnitude: Math.abs(contribFare),
    },
    {
      factor: 'URGENT',
      magnitude: Math.abs(contribUrgency),
    },
    {
      factor: 'TRUSTS_YOU',
      magnitude: Math.abs(contribTrust),
    },
    {
      factor: 'OUT_OF_PATIENCE',
      magnitude: Math.abs(cfg.d * (1 - P)),
    },
    {
      factor: 'BAD_TRAFFIC',
      magnitude: Math.abs(contribTraffic),
    },
    {
      factor: 'WALK_TOO_FAR',
      magnitude: Math.abs(contribWalk),
    },
  ];

  candidates.sort((a, b) => b.magnitude - a.magnitude);
  const topCandidate = candidates[0];
  const topFactor: ReasonCode = topCandidate ? topCandidate.factor : 'FAIR_PRICE';

  return {
    contribFare,
    contribUrgency,
    contribTrust,
    contribPatience,
    contribTraffic,
    contribWalk,
    detourBoost,
    pAccept,
    topFactor,
  };
}

export function startNegotiation(
  req: RideRequest,
  profile: PassengerProfile,
  ctx: NegotiationContext
): NegotiationSession {
  const fair = fairFare(req.estimatedDistance, req.estimatedDuration, req.surge);
  const budget = expectedBudget(profile, fair, ctx.day);
  const initialOffer = openingOffer(profile, budget);
  const maxRounds = calculateMaxRounds(profile);

  return {
    req,
    profile,
    ctx,
    fairFare: fair,
    expectedBudget: budget,
    currentPassengerOffer: initialOffer,
    currentRiderOffer: null,
    round: 1,
    maxRounds,
    currentPatience: profile.patience,
    status: 'active',
    walkM: ctx.walkM,
    detourExtraMin: 0,
  };
}

export function respond(
  session: NegotiationSession,
  action: NegotiationAction
): NegotiationResult {
  // If session already finished, return as is
  if (session.status !== 'active') {
    return {
      session,
      passengerLine:
        session.status === 'accepted'
          ? 'dialogue.negotiation.accept_ok'
          : 'dialogue.negotiation.walked_away',
      outcome:
        session.status === 'accepted'
          ? { kind: 'accepted', fare: session.currentPassengerOffer }
          : { kind: 'walkedAway', reason: 'OUT_OF_PATIENCE' },
      topFactor: session.status === 'accepted' ? 'FAIR_PRICE' : 'OUT_OF_PATIENCE',
    };
  }

  // 1. Accept passenger's current offer
  if (action.kind === 'accept') {
    const finalFare = session.currentPassengerOffer;
    const updatedSession: NegotiationSession = {
      ...session,
      currentRiderOffer: finalFare,
      status: 'accepted',
    };
    return {
      session: updatedSession,
      passengerLine: defaultDialogueManager.getAccept({
        archetype: session.profile.archetype,
        characterId: session.profile.characterId,
        relationshipLevel: session.profile.relationshipLevel,
        rng: new Rng(hashSeed(session.req.requestId, session.round, 'dialogue')),
        vars: { fare: finalFare },
      })?.key ?? 'dialogue.negotiation.accept_ok',
      outcome: { kind: 'accepted', fare: finalFare },
      topFactor: 'FAIR_PRICE',
    };
  }

  // 2. Rider declines
  if (action.kind === 'decline') {
    const updatedSession: NegotiationSession = {
      ...session,
      status: 'walkedAway',
    };
    return {
      session: updatedSession,
      passengerLine: 'dialogue.negotiation.rider_declined',
      outcome: { kind: 'walkedAway', reason: 'OUT_OF_PATIENCE' },
      topFactor: 'OUT_OF_PATIENCE',
    };
  }

  // 3. Explain detour
  if (action.kind === 'explainDetour') {
    const nextPatience = Math.max(
      0,
      session.currentPatience - BALANCE.NEGOTIATION.patienceDecayPerRound * 0.25
    );
    const updatedSession: NegotiationSession = {
      ...session,
      detourExtraMin: session.detourExtraMin + action.extraMin,
      currentPatience: nextPatience,
    };
    return {
      session: updatedSession,
      passengerLine: 'dialogue.negotiation.detour_explained',
      topFactor: 'URGENT',
    };
  }

  // 4. Pickup adjustment (walkM, savesMin)
  if (action.kind === 'pickupAdjust') {
    const walkPenalty = calculateWalkPenalty(
      action.walkM,
      session.profile,
      session.req.specialCircumstance
    );
    const timeBenefit = 0.4 * (action.savesMin / 5) * (0.5 + session.profile.urgency);
    const zAdjust =
      BALANCE.NEGOTIATION.k0 +
      session.profile.trustInRider * BALANCE.NEGOTIATION.c -
      BALANCE.NEGOTIATION.e * walkPenalty +
      timeBenefit;
    const pAcceptAdjust = 1 / (1 + Math.exp(-zAdjust));

    const decisionSeed = hashSeed(
      session.req.requestId,
      session.round,
      'pickupAdjust'
    );
    const rng = new Rng(decisionSeed);
    const accepted = rng.next() < pAcceptAdjust;

    const nextPatience = Math.max(
      0,
      session.currentPatience - BALANCE.NEGOTIATION.patienceDecayPerRound * 0.5
    );

    if (accepted) {
      const updatedSession: NegotiationSession = {
        ...session,
        walkM: session.walkM + action.walkM,
        currentPatience: nextPatience,
      };
      return {
        session: updatedSession,
        passengerLine: 'dialogue.negotiation.pickup_adjust_accepted',
        topFactor: 'URGENT',
      };
    } else {
      const updatedSession: NegotiationSession = {
        ...session,
        currentPatience: nextPatience,
      };
      return {
        session: updatedSession,
        passengerLine: 'dialogue.negotiation.pickup_adjust_rejected',
        outcome: { kind: 'rejected', reason: 'WALK_TOO_FAR' },
        topFactor: 'WALK_TOO_FAR',
      };
    }
  }

  // 5. Refuse alley
  if (action.kind === 'refuseAlley') {
    const walkPenalty = calculateWalkPenalty(
      action.walkM,
      session.profile,
      session.req.specialCircumstance
    );
    const zAlley =
      BALANCE.NEGOTIATION.k0 +
      session.profile.trustInRider * BALANCE.NEGOTIATION.c -
      BALANCE.NEGOTIATION.e * walkPenalty;
    const pAcceptAlley = 1 / (1 + Math.exp(-zAlley));

    const decisionSeed = hashSeed(
      session.req.requestId,
      session.round,
      'refuseAlley'
    );
    const rng = new Rng(decisionSeed);
    const accepted = rng.next() < pAcceptAlley;

    const nextPatience = Math.max(
      0,
      session.currentPatience - BALANCE.NEGOTIATION.patienceDecayPerRound * 0.5
    );

    if (accepted) {
      const updatedSession: NegotiationSession = {
        ...session,
        walkM: session.walkM + action.walkM,
        currentPatience: nextPatience,
      };
      return {
        session: updatedSession,
        passengerLine: 'dialogue.negotiation.refuse_alley_accepted',
        topFactor: 'WALK_TOO_FAR',
      };
    } else {
      const updatedSession: NegotiationSession = {
        ...session,
        currentPatience: nextPatience,
      };
      return {
        session: updatedSession,
        passengerLine: 'dialogue.negotiation.refuse_alley_rejected',
        outcome: { kind: 'rejected', reason: 'WALK_TOO_FAR' },
        topFactor: 'WALK_TOO_FAR',
      };
    }
  }

  // 6. Fare actions: counter, discount, offApp
  let rawAmount: number;
  if (action.kind === 'counter' || action.kind === 'discount' || action.kind === 'offApp') {
    rawAmount = action.amount;
  } else {
    rawAmount = session.fairFare;
  }

  const F = clampCounterFare(rawAmount, session.fairFare);
  const factors = evaluateFactors(session, F);

  // Decision roll seeded by hash(requestId, round)
  const decisionSeed = hashSeed(session.req.requestId, session.round);
  const decisionRng = new Rng(decisionSeed);
  const accepted = decisionRng.next() < factors.pAccept;

  if (accepted) {
    const updatedSession: NegotiationSession = {
      ...session,
      currentRiderOffer: F,
      currentPassengerOffer: F,
      status: 'accepted',
    };
    let line = defaultDialogueManager.getAccept({
        archetype: session.profile.archetype,
        characterId: session.profile.characterId,
        relationshipLevel: session.profile.relationshipLevel,
        rng: new Rng(hashSeed(session.req.requestId, session.round, 'dialogue')),
        vars: { fare: F },
      })?.key ?? 'dialogue.negotiation.counter_accepted';
    if (action.kind === 'discount') {
      line = 'dialogue.negotiation.discount_accepted';
    } else if (action.kind === 'offApp') {
      line = 'dialogue.negotiation.off_app_accepted';
    }
    return {
      session: updatedSession,
      passengerLine: line,
      outcome: { kind: 'accepted', fare: F },
      topFactor: factors.topFactor,
    };
  }

  // If rejected: patience decays
  const nextPatience = Math.max(
    0,
    session.currentPatience - BALANCE.NEGOTIATION.patienceDecayPerRound
  );
  const nextRound = session.round + 1;

  // Check if rounds exhausted
  if (session.round >= session.maxRounds || nextPatience <= 0) {
    const walkAwayReason: ReasonCode =
      factors.topFactor === 'FAIR_PRICE' ? 'OUT_OF_PATIENCE' : factors.topFactor;
    const updatedSession: NegotiationSession = {
      ...session,
      currentRiderOffer: F,
      currentPatience: nextPatience,
      round: nextRound,
      status: 'walkedAway',
    };
    return {
      session: updatedSession,
      passengerLine: defaultDialogueManager.getReject({
        archetype: session.profile.archetype,
        characterId: session.profile.characterId,
        relationshipLevel: session.profile.relationshipLevel,
        rng: new Rng(hashSeed(session.req.requestId, session.round, 'dialogue')),
      })?.key ?? 'dialogue.negotiation.walked_away',
      outcome: { kind: 'walkedAway', reason: walkAwayReason },
      topFactor: walkAwayReason,
    };
  }

  // Passenger counter-offer
  const cur = session.currentPassengerOffer;
  const diff = Math.max(0, F - cur);
  const step = 0.3 + 0.4 * (1 - session.profile.bargainingTendency);
  const rawNext = cur + diff * step;
  const cap = session.expectedBudget * (1 + 0.3 * session.profile.urgency);
  const boundedNext = Math.min(rawNext, cap);
  let nextPassengerOffer =
    Math.round(boundedNext / BALANCE.FARE.roundTo) * BALANCE.FARE.roundTo;
  nextPassengerOffer = Math.max(cur, nextPassengerOffer);
  nextPassengerOffer = Math.min(F, nextPassengerOffer);

  // If passenger's counter matches or exceeds rider's ask, deal is accepted
  if (nextPassengerOffer >= F) {
    const updatedSession: NegotiationSession = {
      ...session,
      currentRiderOffer: F,
      currentPassengerOffer: F,
      status: 'accepted',
    };
    return {
      session: updatedSession,
      passengerLine: 'dialogue.negotiation.counter_accepted',
      outcome: { kind: 'accepted', fare: F },
      topFactor: factors.topFactor,
    };
  }

  // Normal counter-rejection
  const updatedSession: NegotiationSession = {
    ...session,
    currentRiderOffer: F,
    currentPassengerOffer: nextPassengerOffer,
    currentPatience: nextPatience,
    round: nextRound,
    status: 'active',
  };

  return {
    session: updatedSession,
    passengerLine: defaultDialogueManager.getCounter({
      archetype: session.profile.archetype,
      characterId: session.profile.characterId,
      relationshipLevel: session.profile.relationshipLevel,
      rng: new Rng(hashSeed(session.req.requestId, session.round, 'dialogue')),
      vars: { fare: F, counter: nextPassengerOffer },
    })?.key ?? 'dialogue.negotiation.counter_rejected',
    outcome: { kind: 'rejected', reason: factors.topFactor },
    topFactor: factors.topFactor,
  };
}
