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

export type BotStrategyName =
  | 'acceptAll'
  | 'alwaysMaxCounter'
  | 'smartPro'
  | 'reckless';

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

export const BOT_STRATEGIES: Record<BotStrategyName, BotStrategy> = {
  acceptAll: acceptAllStrategy,
  alwaysMaxCounter: alwaysMaxCounterStrategy,
  smartPro: smartProStrategy,
  reckless: recklessStrategy,
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
}

export interface BotDayResult {
  day: number;
  strategy: BotStrategyName;
  ridesCompleted: number;
  ridesDeclined: number;
  ridesWalkedAway: number;
  crashes: number;
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

  // Fuel consumption
  const idleMin = Math.max(0, durationMin - route.virtualKm / (40 / 60));
  const fuelUsedL = fuelUsed(route.virtualKm, idleMin);
  const fCost = fuelCost(fuelUsedL);

  // Commission & Wear
  const commRate = req.bookingType === 'direct' ? 0 : BALANCE.COMMISSION_APP;
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
  shiftMinutes: number = BALANCE.BOT?.shiftMinutes ?? 600
): BotDayResult {
  const reqGen = new RequestGenerator(network, rng);
  let currentMinute = 480; // 08:00 start
  const endMinute = currentMinute + shiftMinutes;
  const eligible = reqGen.getEligibleNodeIds();
  let currentNodeId = eligible.length > 0 ? eligible[0] : 'N1';

  let ridesCompleted = 0;
  let ridesDeclined = 0;
  let ridesWalkedAway = 0;
  let crashes = 0;
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

  const livingExpenses =
    BALANCE.LIVING.foodPerDay + BALANCE.LIVING.phoneDataPerDay;
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
