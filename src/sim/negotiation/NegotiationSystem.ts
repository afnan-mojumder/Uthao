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

// ponytail: detour explanations cap at 16 extra minutes; a per-negotiation budget is the upgrade path if tuning needs more.
const MAX_DETOUR_EXTRA_MIN = 16;

export interface NegotiationContext {
  traffic: number;
  day: number;
  walkM: number;
  /** The session RNG (a fork); its state seeds this negotiation's decision rolls. */
  rng: Rng;
  /** H: interaction history -1..1; negative = the rider overcharged this passenger before. */
  history?: number;
  /** True when the route actually contains a detour, U-turn, road event, or heavy weather disruption. */
  hasDetour?: boolean;
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
  /** Per-negotiation salt taken from `ctx.rng` (and salted per non-fare action) so decisions differ by seed and step. */
  readonly salt: number;
  readonly detourExplained?: boolean;
  readonly alleyRefused?: boolean;
  readonly actionSeq?: number;
  readonly discountApplied?: boolean;
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
  contribHistory: number;
  detourBoost: number;
  z: number;
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

  const contribHistory = cfg.h * clamp(session.ctx.history ?? 0, -1, 1);

  const detourBoost =
    session.detourExtraMin > 0
      ? 0.6 * (Math.min(session.detourExtraMin, MAX_DETOUR_EXTRA_MIN) / 10) * (0.5 + 0.5 * U)
      : 0;

  const z =
    cfg.k0 +
    contribFare +
    contribUrgency +
    contribTrust +
    contribPatience +
    contribTraffic +
    contribWalk +
    contribHistory +
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
    contribHistory,
    detourBoost,
    z,
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
    salt: ctx.rng.getState(),
    detourExplained: false,
    alleyRefused: false,
    actionSeq: 0,
    discountApplied: false,
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

  // 3. Explain detour: usable at most once when actual congestion or detour exists, advancing round & patience.
  if (action.kind === 'explainDetour') {
    const safeExtraMin = Number.isFinite(action.extraMin) ? Math.max(0, action.extraMin) : 0;
    const hasCongestionOrDetour = session.ctx.hasDetour === true || session.ctx.traffic >= 0.5;
    const canExplain = !session.detourExplained && hasCongestionOrDetour;
    const nextRound = Math.min(session.maxRounds, session.round + 1);
    const nextSeq = (session.actionSeq ?? 0) + 1;
    const nextSalt = hashSeed(session.salt, 'explainDetour', session.round);

    if (canExplain) {
      const nextPatience = Math.max(
        0,
        session.currentPatience - BALANCE.NEGOTIATION.patienceDecayPerRound * 0.5
      );
      if (nextPatience <= 0) {
        return {
          session: {
            ...session,
            detourExplained: true,
            detourExtraMin: Math.min(MAX_DETOUR_EXTRA_MIN, session.detourExtraMin + safeExtraMin),
            currentPatience: nextPatience,
            round: nextRound,
            actionSeq: nextSeq,
            salt: nextSalt,
            status: 'walkedAway',
          },
          passengerLine: 'dialogue.negotiation.walked_away',
          outcome: { kind: 'walkedAway', reason: 'OUT_OF_PATIENCE' },
          topFactor: 'OUT_OF_PATIENCE',
        };
      }
      const updatedSession: NegotiationSession = {
        ...session,
        detourExplained: true,
        detourExtraMin: Math.min(MAX_DETOUR_EXTRA_MIN, session.detourExtraMin + safeExtraMin),
        currentPatience: nextPatience,
        round: nextRound,
        actionSeq: nextSeq,
        salt: nextSalt,
      };
      return {
        session: updatedSession,
        passengerLine: 'dialogue.negotiation.detour_explained',
        topFactor: 'URGENT',
      };
    }

    // Invalid (no real congestion/detour) or repeated click: no boost, costs full patience & advances round
    const nextPatience = Math.max(
      0,
      session.currentPatience - BALANCE.NEGOTIATION.patienceDecayPerRound
    );
    if (session.round >= session.maxRounds || nextPatience <= 0) {
      return {
        session: {
          ...session,
          currentPatience: nextPatience,
          round: nextRound,
          actionSeq: nextSeq,
          salt: nextSalt,
          status: 'walkedAway',
        },
        passengerLine: 'dialogue.negotiation.walked_away',
        outcome: { kind: 'walkedAway', reason: 'OUT_OF_PATIENCE' },
        topFactor: 'OUT_OF_PATIENCE',
      };
    }
    return {
      session: {
        ...session,
        currentPatience: nextPatience,
        round: nextRound,
        actionSeq: nextSeq,
        salt: nextSalt,
      },
      passengerLine: 'dialogue.negotiation.detour_rejected',
      outcome: { kind: 'rejected', reason: 'BAD_TRAFFIC' },
      topFactor: 'BAD_TRAFFIC',
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

    const decisionSeed = hashSeed(session.req.requestId, session.round, session.salt, 'pickupAdjust');
    const rng = new Rng(decisionSeed);
    const accepted = rng.next() < pAcceptAdjust;

    const nextPatience = Math.max(
      0,
      session.currentPatience - BALANCE.NEGOTIATION.patienceDecayPerRound * 0.5
    );
    const nextRound = Math.min(session.maxRounds, session.round + 1);
    const nextSeq = (session.actionSeq ?? 0) + 1;
    const nextSalt = hashSeed(session.salt, 'pickupAdjust', session.round);

    if (accepted) {
      if (nextPatience <= 0) {
        return {
          session: {
            ...session,
            currentPatience: nextPatience,
            round: nextRound,
            actionSeq: nextSeq,
            salt: nextSalt,
            status: 'walkedAway',
          },
          passengerLine: 'dialogue.negotiation.walked_away',
          outcome: { kind: 'walkedAway', reason: 'OUT_OF_PATIENCE' },
          topFactor: 'OUT_OF_PATIENCE',
        };
      }
      const updatedSession: NegotiationSession = {
        ...session,
        walkM: session.walkM + action.walkM,
        currentPatience: nextPatience,
        round: nextRound,
        actionSeq: nextSeq,
        salt: nextSalt,
      };
      return {
        session: updatedSession,
        passengerLine: 'dialogue.negotiation.pickup_adjust_accepted',
        topFactor: 'URGENT',
      };
    } else {
      if (session.round >= session.maxRounds || nextPatience <= 0) {
        return {
          session: {
            ...session,
            currentPatience: nextPatience,
            round: nextRound,
            actionSeq: nextSeq,
            salt: nextSalt,
            status: 'walkedAway',
          },
          passengerLine: 'dialogue.negotiation.walked_away',
          outcome: { kind: 'walkedAway', reason: 'WALK_TOO_FAR' },
          topFactor: 'WALK_TOO_FAR',
        };
      }
      const updatedSession: NegotiationSession = {
        ...session,
        currentPatience: nextPatience,
        round: nextRound,
        actionSeq: nextSeq,
        salt: nextSalt,
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
    const nextPatience = Math.max(
      0,
      session.currentPatience - BALANCE.NEGOTIATION.patienceDecayPerRound * 0.5
    );
    const nextRound = Math.min(session.maxRounds, session.round + 1);
    const nextSeq = (session.actionSeq ?? 0) + 1;
    const nextSalt = hashSeed(session.salt, 'refuseAlley', session.round);

    if (session.alleyRefused) {
      if (session.round >= session.maxRounds || nextPatience <= 0) {
        return {
          session: {
            ...session,
            currentPatience: nextPatience,
            round: nextRound,
            actionSeq: nextSeq,
            salt: nextSalt,
            status: 'walkedAway',
          },
          passengerLine: 'dialogue.negotiation.walked_away',
          outcome: { kind: 'walkedAway', reason: 'WALK_TOO_FAR' },
          topFactor: 'WALK_TOO_FAR',
        };
      }
      return {
        session: {
          ...session,
          currentPatience: nextPatience,
          round: nextRound,
          actionSeq: nextSeq,
          salt: nextSalt,
        },
        passengerLine: 'dialogue.negotiation.refuse_alley_rejected',
        outcome: { kind: 'rejected', reason: 'WALK_TOO_FAR' },
        topFactor: 'WALK_TOO_FAR',
      };
    }

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

    const decisionSeed = hashSeed(session.req.requestId, session.round, session.salt, 'refuseAlley');
    const rng = new Rng(decisionSeed);
    const accepted = rng.next() < pAcceptAlley;

    if (accepted && nextPatience > 0) {
      const updatedSession: NegotiationSession = {
        ...session,
        alleyRefused: true,
        walkM: session.walkM + action.walkM,
        currentPatience: nextPatience,
        round: nextRound,
        actionSeq: nextSeq,
        salt: nextSalt,
      };
      return {
        session: updatedSession,
        passengerLine: 'dialogue.negotiation.refuse_alley_accepted',
        topFactor: 'WALK_TOO_FAR',
      };
    } else {
      if (session.round >= session.maxRounds || nextPatience <= 0) {
        return {
          session: {
            ...session,
            alleyRefused: true,
            currentPatience: nextPatience,
            round: nextRound,
            actionSeq: nextSeq,
            salt: nextSalt,
            status: 'walkedAway',
          },
          passengerLine: 'dialogue.negotiation.walked_away',
          outcome: { kind: 'walkedAway', reason: 'WALK_TOO_FAR' },
          topFactor: 'WALK_TOO_FAR',
        };
      }
      const updatedSession: NegotiationSession = {
        ...session,
        alleyRefused: true,
        currentPatience: nextPatience,
        round: nextRound,
        actionSeq: nextSeq,
        salt: nextSalt,
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

  let effectivePAccept = factors.pAccept;
  const baseTopFactor = factors.topFactor;
  let nextProfile = session.profile;
  let discountApplied = session.discountApplied ?? false;

  if (action.kind === 'offApp') {
    const p = session.profile;
    const archPenalty =
      p.archetype === 'careful' || p.archetype === 'family' || p.archetype === 'office'
        ? 0.35
        : p.archetype === 'regular'
          ? -0.2
          : 0;
    const hesitation = clamp(
      0.45 +
        p.safetySensitivity * 1.0 -
        p.trustInRider * 0.5 -
        Math.max(0, p.relationshipLevel) * 0.008 +
        archPenalty,
      0.15,
      1.8
    );
    effectivePAccept = 1 / (1 + Math.exp(-(factors.z - hesitation)));
  } else if (action.kind === 'discount' && F <= session.fairFare) {
    const discountRatio = clamp((session.fairFare - F) / Math.max(session.fairFare, 1), 0.02, 0.4);
    const discountBoost = 0.5 + discountRatio * 4.0;
    effectivePAccept = 1 / (1 + Math.exp(-(factors.z + discountBoost)));
    if (!discountApplied) {
      nextProfile = {
        ...session.profile,
        trustInRider: clamp(session.profile.trustInRider + 0.08, 0, 1),
      };
      discountApplied = true;
    }
  }

  // Decision roll seeded by hash(requestId, round, salt)
  const decisionSeed = hashSeed(session.req.requestId, session.round, session.salt);
  const decisionRng = new Rng(decisionSeed);
  const accepted = decisionRng.next() < effectivePAccept;
  const acceptedTopFactor: ReasonCode =
    action.kind === 'offApp' && F <= session.expectedBudget ? 'TRUSTS_YOU' : baseTopFactor;

  if (accepted) {
    const updatedSession: NegotiationSession = {
      ...session,
      profile: nextProfile,
      discountApplied,
      currentRiderOffer: F,
      currentPassengerOffer: F,
      status: 'accepted',
    };
    let line = defaultDialogueManager.getAccept({
        archetype: nextProfile.archetype,
        characterId: nextProfile.characterId,
        relationshipLevel: nextProfile.relationshipLevel,
        rng: new Rng(hashSeed(session.req.requestId, session.round, 'dialogue')),
        vars: { fare: F },
      })?.key ?? 'dialogue.negotiation.counter_accepted';
    if (action.kind === 'discount' && F <= session.fairFare) {
      line = 'dialogue.negotiation.discount_accepted';
    } else if (action.kind === 'offApp') {
      line = 'dialogue.negotiation.off_app_accepted';
    }
    return {
      session: updatedSession,
      passengerLine: line,
      outcome: { kind: 'accepted', fare: F },
      topFactor: acceptedTopFactor,
    };
  }

  // If rejected: patience decays
  const nextPatience = Math.max(
    0,
    session.currentPatience - BALANCE.NEGOTIATION.patienceDecayPerRound
  );
  const nextRound = Math.min(session.maxRounds, session.round + 1);

  // Check if rounds exhausted
  if (session.round >= session.maxRounds || nextPatience <= 0) {
    const walkAwayReason: ReasonCode =
      baseTopFactor === 'FAIR_PRICE' ? 'OUT_OF_PATIENCE' : baseTopFactor;
    const updatedSession: NegotiationSession = {
      ...session,
      profile: nextProfile,
      discountApplied,
      currentRiderOffer: F,
      currentPatience: nextPatience,
      round: nextRound,
      status: 'walkedAway',
    };
    return {
      session: updatedSession,
      passengerLine: defaultDialogueManager.getReject({
        archetype: nextProfile.archetype,
        characterId: nextProfile.characterId,
        relationshipLevel: nextProfile.relationshipLevel,
        rng: new Rng(hashSeed(session.req.requestId, session.round, 'dialogue')),
      })?.key ?? 'dialogue.negotiation.walked_away',
      outcome: { kind: 'walkedAway', reason: walkAwayReason },
      topFactor: walkAwayReason,
    };
  }

  // Passenger counter-offer (off-app refusals keep the standing offer unchanged)
  const cur = session.currentPassengerOffer;
  let nextPassengerOffer = cur;
  if (action.kind !== 'offApp') {
    const diff = Math.max(0, F - cur);
    const step = 0.3 + 0.4 * (1 - session.profile.bargainingTendency);
    const rawNext = cur + diff * step;
    const cap = session.expectedBudget * (1 + 0.3 * session.profile.urgency);
    const boundedNext = Math.min(rawNext, cap);
    nextPassengerOffer = Math.round(boundedNext / BALANCE.FARE.roundTo) * BALANCE.FARE.roundTo;
    nextPassengerOffer = Math.max(cur, nextPassengerOffer);
    nextPassengerOffer = Math.min(F, nextPassengerOffer);

    // If passenger's counter matches or exceeds rider's ask, deal is accepted
    if (nextPassengerOffer >= F) {
      const updatedSession: NegotiationSession = {
        ...session,
        profile: nextProfile,
        discountApplied,
        currentRiderOffer: F,
        currentPassengerOffer: F,
        status: 'accepted',
      };
      return {
        session: updatedSession,
        passengerLine:
          action.kind === 'discount' && F <= session.fairFare
            ? 'dialogue.negotiation.discount_accepted'
            : 'dialogue.negotiation.counter_accepted',
        outcome: { kind: 'accepted', fare: F },
        topFactor: acceptedTopFactor,
      };
    }
  }

  // Normal counter-rejection
  const updatedSession: NegotiationSession = {
    ...session,
    profile: nextProfile,
    discountApplied,
    currentRiderOffer: F,
    currentPassengerOffer: nextPassengerOffer,
    currentPatience: nextPatience,
    round: nextRound,
    status: 'active',
  };

  const rejectLine =
    action.kind === 'offApp'
      ? 'dialogue.negotiation.off_app_rejected'
      : defaultDialogueManager.getCounter({
          archetype: nextProfile.archetype,
          characterId: nextProfile.characterId,
          relationshipLevel: nextProfile.relationshipLevel,
          rng: new Rng(hashSeed(session.req.requestId, session.round, 'dialogue')),
          vars: { fare: F, counter: nextPassengerOffer },
        })?.key ?? 'dialogue.negotiation.counter_rejected';

  return {
    session: updatedSession,
    passengerLine: rejectLine,
    outcome: { kind: 'rejected', reason: baseTopFactor },
    topFactor: baseTopFactor,
  };
}
