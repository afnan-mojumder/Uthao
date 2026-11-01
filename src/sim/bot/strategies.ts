import type {
  PassengerProfile,
  RideRequest,
  ReasonCode,
  WeatherKind,
  RoadNode,
  RoadSegment,
} from '../../core/types';
import type { DistrictData } from '../schemas';
import { Rng } from '../../core/rng';
import { clamp } from '../../core/math';
import { BALANCE } from '../../config/balance';
import { RoadNetwork } from '../road/RoadNetwork';
import type { Route } from '../road/routing';
import {
  startNegotiation,
  respond,
  clampCounterFare,
  evaluateFactors,
  type NegotiationSession,
  type NegotiationAction,
} from '../negotiation/NegotiationSystem';
import { fairFare } from '../negotiation/fare';
import { PassengerAI } from '../passenger/PassengerAI';
import { fuelUsed, fuelCost } from '../economy/fuel';
import { RequestGenerator, samplePoisson } from '../ride/RequestGenerator';
import {
  evaluateEnding,
  type EndingEvaluationContext,
} from '../mission/endings';
import type { EndingId } from '../../core/types';

export type BotStrategyName =
  | 'acceptAll'
  | 'alwaysMaxCounter'
  | 'smartPro'
  | 'reckless'
  | 'trustFocused'
  | 'offAppHeavy';

export interface BotDecisionContext {
  network: RoadNetwork;
  currentLocationNodeId: string;
  currentMinute: number;
  day: number;
  weather: WeatherKind;
  traffic: number;
  rng: Rng;
}

export interface BotStrategy {
  readonly name: BotStrategyName;
  evaluateRequest(
    req: RideRequest,
    route: Route,
    ctx: BotDecisionContext
  ): { accept: boolean; reason?: string; expectedNet?: number };
  decideNegotiation(
    session: NegotiationSession,
    ctx: BotDecisionContext
  ): NegotiationAction;
  readonly speedMultiplier: number;
  readonly nearMissChancePerKm: number;
  readonly crashChancePerRide: number;
  readonly infractionChancePerRide?: number;
  readonly helpfulChoiceChance?: number;
  readonly shiftMinutes?: number;
  readonly prefersOffApp?: boolean;
}

/**
 * Calculates expected net earnings for a ride given fare, route, and traffic.
 * Net = Fare - Commission - FuelCost - WearCost
 */
export function estimateExpectedNet(
  fareOffer: number,
  virtualKm: number,
  durationMin: number,
  options?: {
    idleMin?: number;
    commissionRate?: number;
    bikeModel?: 'old100' | 'used125' | 'new150';
    isDirect?: boolean;
    includeWear?: boolean;
  }
): number {
  const commRate = options?.isDirect
    ? 0
    : (options?.commissionRate ?? BALANCE.COMMISSION_APP);
  const commission = fareOffer * commRate;
  const idleMin =
    options?.idleMin ?? Math.max(0, durationMin - virtualKm / (40 / 60));
  const liters = fuelUsed(virtualKm, idleMin, { model: options?.bikeModel });
  const fCost = fuelCost(liters);
  const wearCost =
    options?.includeWear !== false
      ? Math.round(virtualKm * (BALANCE.WEAR.oilCost / BALANCE.WEAR.oilEveryKm))
      : 0;

  return fareOffer - commission - fCost - wearCost;
}

export const acceptAllStrategy: BotStrategy = {
  name: 'acceptAll',
  speedMultiplier: 1.0,
  nearMissChancePerKm: 0,
  crashChancePerRide: 0,
  evaluateRequest: () => ({ accept: true }),
  decideNegotiation: () => ({ kind: 'accept' }),
};

export const alwaysMaxCounterStrategy: BotStrategy = {
  name: 'alwaysMaxCounter',
  speedMultiplier: 1.0,
  nearMissChancePerKm: 0,
  crashChancePerRide: 0,
  evaluateRequest: () => ({ accept: true }),
  decideNegotiation: (session: NegotiationSession) => {
    const maxFare = clampCounterFare(
      session.fairFare * BALANCE.FARE.maxCounterMultiple,
      session.fairFare
    );
    return { kind: 'counter', amount: maxFare };
  },
};

export const smartProStrategy: BotStrategy = {
  name: 'smartPro',
  speedMultiplier: 1.0,
  nearMissChancePerKm: 0,
  crashChancePerRide: 0,
  evaluateRequest: (req: RideRequest, route: Route) => {
    const idleMin = Math.max(0, route.etaMin - route.virtualKm / (40 / 60));
    const currentNet = estimateExpectedNet(
      req.initialFare,
      route.virtualKm,
      route.etaMin,
      { idleMin }
    );
    const fair = fairFare(route.virtualKm, route.etaMin, req.surge);
    const fairNet = estimateExpectedNet(fair, route.virtualKm, route.etaMin, {
      idleMin,
    });

    // If even fair fare cannot cover fuel + commission in a deadlock jam, decline upfront
    if (fairNet < 0) {
      return {
        accept: false,
        reason: 'UNPROFITABLE_JAM',
        expectedNet: currentNet,
      };
    }

    return { accept: true, expectedNet: currentNet };
  },
  decideNegotiation: (
    session: NegotiationSession,
    ctx: BotDecisionContext
  ): NegotiationAction => {
    // Round 1: check crossing options for divided roads to save detour
    if (session.round === 1) {
      const options = ctx.network.pickupOptions(
        { pickupNodeId: session.req.pickupNodeId },
        ctx.currentLocationNodeId
      );
      if (
        options?.crossPoint &&
        options.crossPoint.savesMin >= 2 &&
        options.crossPoint.walkM <= 120
      ) {
        return {
          kind: 'pickupAdjust',
          walkM: options.crossPoint.walkM,
          savesMin: options.crossPoint.savesMin,
        };
      }
    }

    // If passenger's offer is at or above fair fare, accept
    if (session.currentPassengerOffer >= session.fairFare) {
      return { kind: 'accept' };
    }

    // Round 1: counter with fair fare
    if (session.round === 1) {
      const targetFare = clampCounterFare(session.fairFare, session.fairFare);
      return { kind: 'counter', amount: targetFare };
    }

    // Later rounds: if passenger has low patience (<= 0.35), accept if profitable
    if (session.currentPatience <= 0.35) {
      const net = estimateExpectedNet(
        session.currentPassengerOffer,
        session.req.estimatedDistance,
        session.req.estimatedDuration
      );
      if (net > 0) {
        return { kind: 'accept' };
      }
      return { kind: 'decline' };
    }

    // Otherwise, offer a compromise halfway
    const halfway = Math.round(
      (session.currentPassengerOffer + session.fairFare) / 2
    );
    const compromise = clampCounterFare(halfway, session.fairFare);
    return { kind: 'counter', amount: compromise };
  },
};

export const recklessStrategy: BotStrategy = {
  name: 'reckless',
  speedMultiplier: BALANCE.BOT?.reckless?.speedMultiplier ?? 1.35,
  nearMissChancePerKm: BALANCE.BOT?.reckless?.nearMissRatePerKm ?? 0.25,
  crashChancePerRide: BALANCE.BOT?.reckless?.crashChancePerRide ?? 0.05,
  infractionChancePerRide: 0.1,
  evaluateRequest: () => ({ accept: true }),
  decideNegotiation: (session: NegotiationSession) => {
    if (session.round === 1 && session.currentPassengerOffer >= 0.85 * session.fairFare) {
      return { kind: 'accept' };
    }
    if (session.round >= 2) {
      return { kind: 'accept' };
    }
    const mild = clampCounterFare(
      Math.round(session.fairFare * 1.05),
      session.fairFare
    );
    return { kind: 'counter', amount: mild };
  },
};

export const trustFocusedStrategy: BotStrategy = {
  name: 'trustFocused',
  speedMultiplier: 0.9,
  nearMissChancePerKm: 0,
  crashChancePerRide: 0,
  infractionChancePerRide: 0,
  helpfulChoiceChance: 0.85,
  shiftMinutes: 220, // 3.5-hour local neighborhood shift, prioritizing community over non-stop app grinding
  evaluateRequest: () => ({ accept: true }),
  decideNegotiation: (session: NegotiationSession) => {
    // Generous bargaining: accept if >= 70% of fair fare
    if (session.currentPassengerOffer >= 0.7 * session.fairFare) {
      return { kind: 'accept' };
    }
    // Offer a discount (25% below fair fare) to help community members
    const discounted = Math.round(session.fairFare * 0.75);
    return {
      kind: 'discount',
      amount: clampCounterFare(discounted, session.fairFare),
    };
  },
};

export const offAppHeavyStrategy: BotStrategy = {
  name: 'offAppHeavy',
  speedMultiplier: 1.05,
  nearMissChancePerKm: 0.04,
  crashChancePerRide: 0.01,
  infractionChancePerRide: 0.03,
  prefersOffApp: true,
  evaluateRequest: () => ({ accept: true }),
  decideNegotiation: (session: NegotiationSession, ctx: BotDecisionContext) => {
    // 35% of the time, offers off-app ride to bypass 15% commission
    if (session.round === 1 && ctx.rng.next() < 0.35) {
      const offFare = Math.round(session.fairFare * 0.95);
      return { kind: 'offApp', amount: clampCounterFare(offFare, session.fairFare) };
    }
    if (session.currentPassengerOffer >= session.fairFare * 0.9) {
      return { kind: 'accept' };
    }
    return {
      kind: 'counter',
      amount: clampCounterFare(session.fairFare, session.fairFare),
    };
  },
};

export const BOT_STRATEGIES: Record<BotStrategyName, BotStrategy> = {
  acceptAll: acceptAllStrategy,
  alwaysMaxCounter: alwaysMaxCounterStrategy,
  smartPro: smartProStrategy,
  reckless: recklessStrategy,
  trustFocused: trustFocusedStrategy,
  offAppHeavy: offAppHeavyStrategy,
};

export function getStrategy(name: BotStrategyName): BotStrategy {
  return BOT_STRATEGIES[name] ?? smartProStrategy;
}

export interface SimulatedRideResult {
  requestId: string;
  strategy: BotStrategyName;
  status: 'completed' | 'declined' | 'walkedAway';
  fare: number;
  tip: number;
  commission: number;
  fuelUsedL: number;
  fuelCost: number;
  repairCost: number;
  wearCost: number;
  net: number;
  durationMin: number;
  virtualKm: number;
  finalMood: number;
  rating: number | null;
  reasonCodes: ReasonCode[];
  topReasonCode: ReasonCode;
  crashed: boolean;
  nearMissCount: number;
  isOffApp?: boolean;
  helpfulChoice?: boolean;
  infraction?: boolean;
}

export interface BotDayResult {
  day: number;
  strategy: BotStrategyName;
  ridesCompleted: number;
  ridesDeclined: number;
  ridesWalkedAway: number;
  crashes: number;
  infractions: number;
  offAppRides: number;
  helpfulChoices: number;
  nearMisses: number;
  grossRevenue: number;
  tips: number;
  fuelCostTotal: number;
  commissionTotal: number;
  repairCostTotal: number;
  livingExpenses: number;
  dailyNet: number;
  averageRating: number;
  rideResults: SimulatedRideResult[];
}

/**
 * Creates a representative road district for balance testing with varied route distances,
 * divided arterials, U-turns, and crossing nodes.
 */
export function createBalanceDistrict(): DistrictData {
  const nodes: RoadNode[] = [
    { nodeId: 'N1', x: 0, z: 0, kind: 'junction' },
    { nodeId: 'N2', x: 200, z: 0, kind: 'junction' },
    { nodeId: 'N3', x: 400, z: 0, kind: 'junction' },
    { nodeId: 'N4', x: 600, z: 0, kind: 'junction' },
    { nodeId: 'N5', x: 600, z: 200, kind: 'junction' },
    { nodeId: 'N6', x: 400, z: 200, kind: 'junction', tags: ['crossing'] },
    { nodeId: 'N7', x: 200, z: 200, kind: 'junction' },
    { nodeId: 'N8', x: 0, z: 200, kind: 'junction' },
    { nodeId: 'N9', x: 0, z: 400, kind: 'junction' },
    { nodeId: 'N10', x: 300, z: 400, kind: 'junction' },
    { nodeId: 'N11', x: 600, z: 400, kind: 'junction' },
    { nodeId: 'N12', x: 300, z: 200, kind: 'uturn' },
  ];

  const seg = (
    id: string,
    start: string,
    end: string,
    opts: Partial<RoadSegment> = {}
  ): RoadSegment => ({
    segmentId: id,
    startNodeId: start,
    endNodeId: end,
    width: 10,
    surfaceCondition: 1.0,
    trafficDensity: 0.3,
    speedLimit: 40,
    turnRestrictions: [],
    motorcycleAccessible: true,
    pedestrianDensity: 0.2,
    riskLevel: 0.1,
    oneWay: false,
    divided: false,
    lanes: 2,
    roadType: 'main',
    floodSensitivity: 0.2,
    pickupPractical: true,
    district: 'testloop',
    tags: [],
    ...opts,
  });

  const segments: RoadSegment[] = [
    seg('S1', 'N1', 'N2', { speedLimit: 40 }),
    seg('S2', 'N2', 'N3', { speedLimit: 40 }),
    seg('S3', 'N3', 'N4', { speedLimit: 40 }),
    seg('S4', 'N4', 'N5', {
      speedLimit: 50,
      divided: true,
      lanes: 4,
      roadType: 'main',
    }),
    seg('S5', 'N5', 'N6', {
      speedLimit: 50,
      divided: true,
      lanes: 4,
      roadType: 'main',
      tags: ['crossing'],
    }),
    seg('S6', 'N6', 'N12', {
      speedLimit: 50,
      divided: true,
      lanes: 4,
      roadType: 'main',
      tags: ['uturn'],
    }),
    seg('S7', 'N12', 'N7', {
      speedLimit: 50,
      divided: true,
      lanes: 4,
      roadType: 'main',
    }),
    seg('S8', 'N7', 'N8', { speedLimit: 30, roadType: 'residential' }),
    seg('S9', 'N8', 'N1', { speedLimit: 30, roadType: 'residential' }),
    seg('S10', 'N8', 'N9', { speedLimit: 30, roadType: 'residential' }),
    seg('S11', 'N9', 'N10', { speedLimit: 40, roadType: 'main' }),
    seg('S12', 'N10', 'N11', { speedLimit: 40, roadType: 'main' }),
    seg('S13', 'N11', 'N5', { speedLimit: 40, roadType: 'main' }),
    seg('S14', 'N2', 'N7', { speedLimit: 40, roadType: 'main' }),
    seg('S15', 'N7', 'N10', { speedLimit: 30, roadType: 'residential' }),
    seg('S16', 'N3', 'N6', { speedLimit: 40, roadType: 'main' }),
  ];

  return {
    districtId: 'testloop',
    name: { bn: 'ব্যালেন্স জেলা', en: 'Balance District' },
    nodes,
    segments,
    pois: [
      { id: 'poi_fuel_1', kind: 'fuel', nodeId: 'N2', nameKey: 'poi.fuel' },
      {
        id: 'poi_garage_1',
        kind: 'garage',
        nodeId: 'N7',
        nameKey: 'poi.garage',
      },
    ],
    lots: [],
  };
}

let cachedBalanceNetwork: RoadNetwork | null = null;
export function createBalanceNetwork(): RoadNetwork {
  if (!cachedBalanceNetwork) {
    cachedBalanceNetwork = RoadNetwork.fromDistricts([createBalanceDistrict()]);
  }
  return cachedBalanceNetwork;
}

/**
 * Headless ride execution via teleport-along-route at route ETA.
 */
export function runHeadlessRide(
  strategy: BotStrategy,
  req: RideRequest,
  profile: PassengerProfile,
  network: RoadNetwork,
  currentMinute: number,
  day: number,
  weather: WeatherKind,
  rng: Rng,
  currentLocationNodeId?: string
): SimulatedRideResult {
  const route = network.route(req.pickupNodeId, req.destinationNodeId, {
    mode: 'motorcycle',
    weather,
    minute: currentMinute,
  });

  const emptyResult: SimulatedRideResult = {
    requestId: req.requestId,
    strategy: strategy.name,
    status: 'declined',
    fare: 0,
    tip: 0,
    commission: 0,
    fuelUsedL: 0,
    fuelCost: 0,
    repairCost: 0,
    wearCost: 0,
    net: 0,
    durationMin: 0,
    virtualKm: 0,
    finalMood: 0.5,
    rating: null,
    reasonCodes: ['TOO_EXPENSIVE'],
    topReasonCode: 'TOO_EXPENSIVE',
    crashed: false,
    nearMissCount: 0,
  };

  if (!route) {
    return emptyResult;
  }

  const firstSegId = route.segmentIds[0];
  const traffic = clamp(
    firstSegId ? (network.getSegment(firstSegId)?.trafficDensity ?? 0.3) : 0.3,
    0,
    1
  );

  const ctx: BotDecisionContext = {
    network,
    currentLocationNodeId: currentLocationNodeId ?? req.pickupNodeId,
    currentMinute,
    day,
    weather,
    traffic,
    rng,
  };

  // Upfront strategy evaluation
  const evalRes = strategy.evaluateRequest(req, route, ctx);
  if (!evalRes.accept) {
    return {
      ...emptyResult,
      status: 'declined',
      virtualKm: route.virtualKm,
      durationMin: 0,
      reasonCodes: ['BAD_TRAFFIC'],
      topReasonCode: 'BAD_TRAFFIC',
    };
  }

  // Negotiation
  let session = startNegotiation(req, profile, {
    traffic,
    day,
    walkM: 0,
    rng,
  });

  const reasonCodes: ReasonCode[] = [];
  const evalInitial = evaluateFactors(session, session.currentPassengerOffer);
  reasonCodes.push(evalInitial.topFactor);
  let topReason: ReasonCode = evalInitial.topFactor;

  let agreedFare = req.initialFare;
  let isAccepted = false;
  let isOffApp = false;
  let savesMin = 0;

  while (session.status === 'active') {
    const action = strategy.decideNegotiation(session, ctx);

    if (action.kind === 'decline') {
      return {
        ...emptyResult,
        status: 'declined',
        reasonCodes,
        topReasonCode: topReason,
      };
    }

    if (action.kind === 'pickupAdjust') {
      savesMin = action.savesMin;
    }
    if (action.kind === 'offApp') {
      isOffApp = true;
    }

    const res = respond(session, action);
    reasonCodes.push(res.topFactor);
    topReason = res.topFactor;
    session = res.session;

    if (res.outcome?.kind === 'accepted') {
      agreedFare = res.outcome.fare;
      isAccepted = true;
      break;
    }

    if (res.outcome?.kind === 'walkedAway') {
      return {
        ...emptyResult,
        status: 'walkedAway',
        reasonCodes,
        topReasonCode: res.outcome.reason,
      };
    }

    if (session.status === 'walkedAway') {
      return {
        ...emptyResult,
        status: 'walkedAway',
        reasonCodes,
        topReasonCode: topReason,
      };
    }
  }

  if (!isAccepted) {
    return {
      ...emptyResult,
      status: 'walkedAway',
      reasonCodes,
      topReasonCode: topReason,
    };
  }

  // Teleport along route
  const speedMult = strategy.speedMultiplier;
  let durationMin = Math.max(1, (route.etaMin - savesMin) / speedMult);

  const passengerAI = new PassengerAI(profile, agreedFare, day);

  let crashed = false;
  let nearMissCount = 0;
  let repairCost = 0;

  if (strategy.nearMissChancePerKm > 0) {
    const expectedNearMisses = route.virtualKm * strategy.nearMissChancePerKm;
    nearMissCount = samplePoisson(expectedNearMisses, rng);
    for (let i = 0; i < nearMissCount; i++) {
      passengerAI.onNearMiss();
    }
  }

  if (
    strategy.crashChancePerRide > 0 &&
    rng.chance(strategy.crashChancePerRide)
  ) {
    crashed = true;
    passengerAI.onCrash();
    repairCost = rng.int(
      BALANCE.BOT?.reckless?.repairCostMin ?? 350,
      BALANCE.BOT?.reckless?.repairCostMax ?? 500
    );
    durationMin += BALANCE.BOT?.reckless?.crashDelayMin ?? 15;
  }

  let helpfulChoice = false;
  if (strategy.helpfulChoiceChance && rng.chance(strategy.helpfulChoiceChance)) {
    helpfulChoice = true;
    passengerAI.onHelpfulChoice();
  }

  let infraction = false;
  if (strategy.infractionChancePerRide && rng.chance(strategy.infractionChancePerRide)) {
    infraction = true;
  }

  const finalMood = passengerAI.getMood();

  // Tip calculation based on passenger satisfaction
  let tip = 0;
  const minMoodForTip = BALANCE.BOT?.tip?.minMoodForTip ?? 0.75;
  if (!crashed && finalMood >= minMoodForTip && profile.budget >= 0.8) {
    const rawTip = agreedFare * (BALANCE.BOT?.tip?.tipPercentage ?? 0.12);
    tip = Math.max(BALANCE.BOT?.tip?.minTip ?? 10, Math.round(rawTip / 5) * 5);
  }

  // Rating
  let rating: number | null;
  if (crashed) rating = 1;
  else if (finalMood < 0.4) rating = 2;
  else if (finalMood < 0.6) rating = 3;
  else if (finalMood < 0.8) rating = 4;
  else rating = 5;

  if (helpfulChoice && rating !== null && rating < 5) {
    rating = Math.min(5, rating + 1);
  }

  // Fuel consumption
  const idleMin = Math.max(0, durationMin - route.virtualKm / (40 / 60));
  const fuelUsedL = fuelUsed(route.virtualKm, idleMin);
  const fCost = fuelCost(fuelUsedL);

  // Commission & Wear
  const commRate = (req.bookingType === 'direct' || isOffApp) ? 0 : BALANCE.COMMISSION_APP;
  const commission = Math.round(agreedFare * commRate);
  const wearCost = Math.round(
    route.virtualKm * (BALANCE.WEAR.oilCost / BALANCE.WEAR.oilEveryKm)
  );

  const net = agreedFare + tip - commission - fCost - repairCost - wearCost;

  return {
    requestId: req.requestId,
    strategy: strategy.name,
    status: 'completed',
    fare: agreedFare,
    tip,
    commission,
    fuelUsedL,
    fuelCost: fCost,
    repairCost,
    wearCost,
    net,
    durationMin,
    virtualKm: route.virtualKm,
    finalMood,
    rating,
    reasonCodes,
    topReasonCode: topReason,
    crashed,
    nearMissCount,
    isOffApp,
    helpfulChoice,
    infraction,
  };
}

/**
 * Simulates a full working day (shift) for a bot strategy.
 */
export function runHeadlessDay(
  strategy: BotStrategy,
  network: RoadNetwork = createBalanceNetwork(),
  day: number = 1,
  weather: WeatherKind = 'clear',
  rng: Rng = new Rng(42),
  shiftMinutes: number = strategy.shiftMinutes ?? (BALANCE.BOT?.shiftMinutes ?? 600),
  options?: { isSuspended?: boolean }
): BotDayResult {
  const livingExpenses =
    BALANCE.LIVING.foodPerDay + BALANCE.LIVING.phoneDataPerDay;

  if (options?.isSuspended) {
    return {
      day,
      strategy: strategy.name,
      ridesCompleted: 0,
      ridesDeclined: 0,
      ridesWalkedAway: 0,
      crashes: 0,
      infractions: 0,
      offAppRides: 0,
      helpfulChoices: 0,
      nearMisses: 0,
      grossRevenue: 0,
      tips: 0,
      fuelCostTotal: 0,
      commissionTotal: 0,
      repairCostTotal: 0,
      livingExpenses,
      dailyNet: -livingExpenses,
      averageRating: 5.0,
      rideResults: [],
    };
  }

  const reqGen = new RequestGenerator(network, rng);
  let currentMinute = 480; // 08:00 start
  const endMinute = currentMinute + shiftMinutes;
  const eligible = reqGen.getEligibleNodeIds();
  let currentNodeId = eligible.length > 0 ? eligible[0] : 'N1';

  let ridesCompleted = 0;
  let ridesDeclined = 0;
  let ridesWalkedAway = 0;
  let crashes = 0;
  let infractions = 0;
  let offAppRides = 0;
  let helpfulChoices = 0;
  let nearMisses = 0;
  let grossRevenue = 0;
  let tips = 0;
  let fuelCostTotal = 0;
  let commissionTotal = 0;
  let repairCostTotal = 0;
  const ratings: number[] = [];
  const rideResults: SimulatedRideResult[] = [];

  while (currentMinute < endMinute) {
    // Inter-arrival time between ride offers (4 - 9 minutes)
    const waitMin = rng.range(4, 9);
    currentMinute += waitMin;
    if (currentMinute >= endMinute) break;

    const sampled = reqGen.sampleRequest(
      currentMinute,
      weather,
      'app',
      currentNodeId
    );
    if (!sampled) continue;

    const ride = runHeadlessRide(
      strategy,
      sampled.request,
      sampled.profile,
      network,
      currentMinute,
      day,
      weather,
      rng,
      currentNodeId
    );

    rideResults.push(ride);

    if (ride.status === 'completed') {
      ridesCompleted++;
      grossRevenue += ride.fare;
      tips += ride.tip;
      commissionTotal += ride.commission;
      fuelCostTotal += ride.fuelCost;
      repairCostTotal += ride.repairCost;
      if (ride.crashed) crashes++;
      if (ride.infraction) infractions++;
      if (ride.isOffApp) offAppRides++;
      if (ride.helpfulChoice) helpfulChoices++;
      nearMisses += ride.nearMissCount;
      if (ride.rating !== null) ratings.push(ride.rating);

      currentMinute += ride.durationMin;
      currentNodeId = sampled.request.destinationNodeId;
    } else if (ride.status === 'declined') {
      ridesDeclined++;
      currentMinute += 2; // small decision delay
    } else {
      ridesWalkedAway++;
      currentMinute += 3; // negotiation time lost
    }
  }

  const dailyNet =
    grossRevenue +
    tips -
    commissionTotal -
    fuelCostTotal -
    repairCostTotal -
    livingExpenses;

  const averageRating =
    ratings.length > 0
      ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
      : 5.0;

  return {
    day,
    strategy: strategy.name,
    ridesCompleted,
    ridesDeclined,
    ridesWalkedAway,
    crashes,
    infractions,
    offAppRides,
    helpfulChoices,
    nearMisses,
    grossRevenue,
    tips,
    fuelCostTotal,
    commissionTotal,
    repairCostTotal,
    livingExpenses,
    dailyNet,
    averageRating,
    rideResults,
  };
}

export interface BotCampaignOptions {
  careerChoice?: 'workshop' | 'bike' | 'continue';
  joinedScheme?: boolean;
  kamalRelationship?: number;
}

export interface BotCampaignResult {
  strategy: BotStrategyName;
  seed: number;
  totalDays: number;
  totalCompletedRides: number;
  totalGrossRevenue: number;
  totalTips: number;
  totalFuelCost: number;
  totalCommission: number;
  totalRepairCost: number;
  totalLivingExpenses: number;
  totalRentPaid: number;
  totalCrashes: number;
  totalNearMisses: number;
  totalInfractions: number;
  dailyNets: number[];
  finalCash: number;
  finalSavings: number;
  finalDebt: number;
  finalRating: number;
  finalLocalTrust: number;
  finalRiskScore: number;
  offAppTripsCount: number;
  suspensionsCount: number;
  wasSuspended: boolean;
  endingId: EndingId;
}

export function runHeadlessCampaign(
  strategy: BotStrategy,
  network: RoadNetwork = createBalanceNetwork(),
  seed: number = 42,
  daysCount: number = 20,
  options?: BotCampaignOptions
): BotCampaignResult {
  const rng = new Rng(seed);
  let cash = BALANCE.LIVING.startCash;
  let savings = 0;
  let debt = 0;
  let localTrust = BALANCE.TRUST.localTrustStart;
  const ratingsHistory: number[] = [];

  let totalCompletedRides = 0;
  let totalGrossRevenue = 0;
  let totalTips = 0;
  let totalFuelCost = 0;
  let totalCommission = 0;
  let totalRepairCost = 0;
  let totalLivingExpenses = 0;
  let totalRentPaid = 0;
  let totalCrashes = 0;
  let totalNearMisses = 0;
  let totalInfractions = 0;
  let offAppTripsCount = 0;
  let offAppStrikes = 0;
  let suspensionsCount = 0;
  let suspendedDaysRemaining = 0;
  let wasSuspended = false;
  let riskScore = 0;
  let kmSinceOilChange = 15;
  const dailyNets: number[] = [];

  for (let day = 1; day <= daysCount; day++) {
    const wRoll = rng.next();
    const weather: WeatherKind =
      wRoll < 0.6 ? 'clear' : wRoll < 0.85 ? 'lightRain' : 'heavyRain';

    const isSuspended = suspendedDaysRemaining > 0;
    if (suspendedDaysRemaining > 0) {
      suspendedDaysRemaining--;
    }

    const dayRes = runHeadlessDay(
      strategy,
      network,
      day,
      weather,
      rng,
      strategy.shiftMinutes,
      { isSuspended }
    );

    totalCompletedRides += dayRes.ridesCompleted;
    totalGrossRevenue += dayRes.grossRevenue;
    totalTips += dayRes.tips;
    totalFuelCost += dayRes.fuelCostTotal;
    totalCommission += dayRes.commissionTotal;
    totalCrashes += dayRes.crashes;
    totalNearMisses += dayRes.nearMisses;
    totalInfractions += dayRes.infractions;

    // Routine wear & maintenance
    let routineMaintenanceCost = 0;
    for (const r of dayRes.rideResults) {
      if (r.status === 'completed') {
        kmSinceOilChange += r.virtualKm;
        if (r.isOffApp) {
          offAppTripsCount++;
          riskScore += 1;
          if (rng.chance(BALANCE.OFF_APP.policyDetectChance)) {
            offAppStrikes++;
            if (offAppStrikes >= BALANCE.OFF_APP.strikesToSuspend) {
              suspensionsCount++;
              wasSuspended = true;
              suspendedDaysRemaining = BALANCE.OFF_APP.suspendDays;
              offAppStrikes = 0;
            }
          }
        }
        if (r.helpfulChoice) {
          localTrust = Math.min(100, localTrust + 0.45);
        } else if (!r.crashed && r.rating !== null && r.rating >= 4.5) {
          localTrust = Math.min(
            100,
            localTrust + (strategy.name === 'trustFocused' ? 0.35 : 0.08)
          );
        }
        if (r.crashed) {
          localTrust = Math.max(0, localTrust - 3);
        }
        if (r.rating !== null) {
          ratingsHistory.push(r.rating);
        }
      }
    }

    if (kmSinceOilChange >= BALANCE.WEAR.oilEveryKm) {
      const oilChanges = Math.floor(kmSinceOilChange / BALANCE.WEAR.oilEveryKm);
      routineMaintenanceCost = oilChanges * BALANCE.WEAR.oilCost;
      kmSinceOilChange %= BALANCE.WEAR.oilEveryKm;
    }

    const dayTotalRepair = dayRes.repairCostTotal + routineMaintenanceCost;
    totalRepairCost += dayTotalRepair;

    // Daily living expenses & rent
    const food = BALANCE.LIVING.foodPerDay;
    const phoneData = BALANCE.LIVING.phoneDataPerDay;
    const family = day === 3 ? BALANCE.LIVING.familyPaymentDay3 : 0;
    const rent = BALANCE.LIVING.rentDueDays.includes(day)
      ? BALANCE.LIVING.rentAmount
      : 0;
    totalRentPaid += rent;
    totalLivingExpenses += food + phoneData + family;

    const dayNet =
      dayRes.grossRevenue +
      dayRes.tips -
      dayRes.commissionTotal -
      dayRes.fuelCostTotal -
      dayTotalRepair -
      food -
      phoneData -
      family -
      rent;

    dailyNets.push(dayNet);
    cash += dayNet;

    // Daily sweep between cash buffer and savings
    if (cash > 600) {
      if (debt > 0) {
        const payDebt = Math.min(debt, cash - 600);
        debt -= payDebt;
        cash -= payDebt;
      }
      const toSavings = cash - 600;
      savings += toSavings;
      cash = 600;
    } else if (cash < 0) {
      const needed = -cash;
      const fromSavings = Math.min(savings, needed);
      savings -= fromSavings;
      cash += fromSavings;
      if (cash < 0) {
        debt += -cash;
        cash = 0;
      }
    }
  }

  const rollingRatings = ratingsHistory.slice(-50);
  const finalRating =
    rollingRatings.length > 0
      ? rollingRatings.reduce((sum, r) => sum + r, 0) / rollingRatings.length
      : 5.0;

  const kamalRel =
    options?.kamalRelationship ??
    (strategy.name === 'trustFocused' || options?.careerChoice === 'workshop'
      ? 35
      : 20);

  const endingCtx: EndingEvaluationContext = {
    day: daysCount,
    economy: {
      cash,
      savings,
      debt,
      dailyRevenue: 0,
      dailyExpenses: 0,
      fuelLevel: 4.0,
      motorcycleCondition: 80,
      appBalance: 0,
      reputation: finalRating,
      phoneBattery: 80,
    },
    story: {
      currentChapter: 6,
      completedMissions: ['m1_first_ride'],
      activeMissions: [],
      characterRelationships: { kamal_bhai: kamalRel, ma: 30 },
      promises: [],
      branchFlags: {
        appSuspended: wasSuspended,
        joinedScheme: options?.joinedScheme === true,
      },
      endingEligibility: {
        independent_rider: false,
        workshop_owner: false,
        trusted_local: false,
        fast_money: false,
        fresh_start: false,
      },
    },
    rating: finalRating,
    localTrust: Math.round(localTrust),
    safetyRecord: {
      nearMisses: totalNearMisses,
      bumps: 0,
      crashes: totalCrashes,
      infractions: totalInfractions,
    },
    riskScore,
    promises: { kept: 5, broken: 0 },
    careerChoice: options?.careerChoice,
    appSuspended: suspendedDaysRemaining > 0,
  };

  const endingResult = evaluateEnding(endingCtx);

  return {
    strategy: strategy.name,
    seed,
    totalDays: daysCount,
    totalCompletedRides,
    totalGrossRevenue,
    totalTips,
    totalFuelCost,
    totalCommission,
    totalRepairCost,
    totalLivingExpenses,
    totalRentPaid,
    totalCrashes,
    totalNearMisses,
    totalInfractions,
    dailyNets,
    finalCash: cash,
    finalSavings: savings,
    finalDebt: debt,
    finalRating,
    finalLocalTrust: Math.round(localTrust),
    finalRiskScore: riskScore,
    offAppTripsCount,
    suspensionsCount,
    wasSuspended,
    endingId: endingResult.endingId,
  };
}

/**
 * Simulates a batch of completed rides for a given strategy.
 */
export function simulateRides(
  strategy: BotStrategy,
  network: RoadNetwork = createBalanceNetwork(),
  targetCount: number = 200,
  seed: number = 42
): SimulatedRideResult[] {
  const rng = new Rng(seed);
  const reqGen = new RequestGenerator(network, rng);
  const results: SimulatedRideResult[] = [];
  let currentMinute: number;
  let day = 1;

  let attempts = 0;
  while (results.length < targetCount && attempts < targetCount * 15) {
    attempts++;
    // Cycle across day time (morning rush, midday, evening rush, late night)
    currentMinute = (480 + attempts * 19) % 1440;
    if (attempts % 30 === 0) day++;

    const weatherRoll = rng.next();
    const weather: WeatherKind =
      weatherRoll < 0.6
        ? 'clear'
        : weatherRoll < 0.85
        ? 'lightRain'
        : 'heavyRain';

    const sampled = reqGen.sampleRequest(currentMinute, weather);
    if (!sampled) continue;

    const ride = runHeadlessRide(
      strategy,
      sampled.request,
      sampled.profile,
      network,
      currentMinute,
      day,
      weather,
      rng
    );

    if (ride.status === 'completed') {
      results.push(ride);
    }
  }

  return results;
}
