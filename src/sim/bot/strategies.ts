import type {
  PassengerProfile,
  RideRequest,
  ReasonCode,
  WeatherKind,
  RoadNode,
  RoadSegment,
  EndingId,
  EncounterInstance,
  MeterId,
  BookingType,
} from '../../core/types';
import type { DistrictData } from '../schemas';
import { Rng } from '../../core/rng';
import { clamp } from '../../core/math';
import { BALANCE } from '../../config/balance';
import { RoadNetwork } from '../road/RoadNetwork';
import type { Route } from '../road/routing';
import {
  respond,
  clampCounterFare,
  evaluateFactors,
  type NegotiationSession,
  type NegotiationAction,
} from '../negotiation/NegotiationSystem';
import { fairFare } from '../negotiation/fare';
import { receipt as buildReceipt } from '../economy/fuel';
import type { DisputeResolutionKind, PendingDispute } from '../ride/RideManager';
import { GameManager } from '../GameManager';
import { GameSession } from '../GameSession';

export type BotStrategyName =
  | 'acceptAll'
  | 'alwaysMaxCounter'
  | 'smartPro'
  | 'reckless'
  | 'trustFocused'
  | 'offAppHeavy'
  | 'exploiter'
  | 'briber';

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
  chooseEncounterOption?: (
    instance: EncounterInstance,
    ctx: BotDecisionContext
  ) => string | undefined;
  resolveDispute?: (
    dispute: PendingDispute,
    ctx: BotDecisionContext
  ) => DisputeResolutionKind;
  readonly speedMultiplier: number;
  readonly nearMissChancePerKm: number;
  readonly crashChancePerRide: number;
  readonly infractionChancePerRide?: number;
  readonly helpfulChoiceChance?: number;
  readonly shiftMinutes?: number;
  readonly prefersOffApp?: boolean;
}

/**
 * Estimates expected net earnings using the canonical `receipt()` and `fuelUsed()` formulas.
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
  const idleMin =
    options?.idleMin ?? Math.max(0, durationMin - virtualKm / (40 / 60));
  const bookingType: BookingType = options?.isDirect ? 'direct' : 'app';
  const r = buildReceipt({
    requestId: 'est',
    fare: fareOffer,
    bookingType,
    durationMin,
    distanceKm: virtualKm,
    idleMin,
    spec: { model: options?.bikeModel },
  });
  const wearCost =
    options?.includeWear !== false
      ? Math.round(virtualKm * (BALANCE.WEAR.oilCost / BALANCE.WEAR.oilEveryKm))
      : 0;
  return r.net - wearCost;
}

function pickEncounterChoice(
  instance: EncounterInstance,
  preferredKinds: Array<'official' | 'neutral' | 'illicit'>,
  preferredIds: string[] = []
): string | undefined {
  for (const id of preferredIds) {
    if (instance.choices.some((c) => c.id === id)) return id;
  }
  for (const kind of preferredKinds) {
    const found = instance.choices.find((c) => c.kind === kind);
    if (found) return found.id;
  }
  return instance.choices[0]?.id;
}

export const acceptAllStrategy: BotStrategy = {
  name: 'acceptAll',
  speedMultiplier: 1.4,
  nearMissChancePerKm: 0,
  crashChancePerRide: 0,
  evaluateRequest: () => ({ accept: true }),
  decideNegotiation: () => ({ kind: 'accept' }),
  chooseEncounterOption: (inst) =>
    pickEncounterChoice(inst, ['neutral', 'official', 'illicit']),
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
  chooseEncounterOption: (inst) =>
    pickEncounterChoice(inst, ['neutral', 'official', 'illicit'], [
      'decline',
      'refuse',
      'cancel',
      'stay_app',
      'standard',
      'wait',
    ]),
};

export const smartProStrategy: BotStrategy = {
  name: 'smartPro',
  speedMultiplier: 1.6,
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

    if (session.currentPassengerOffer >= session.fairFare) {
      return { kind: 'accept' };
    }

    if (session.round === 1) {
      const targetFare = clampCounterFare(session.fairFare, session.fairFare);
      return { kind: 'counter', amount: targetFare };
    }

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

    const halfway = Math.round(
      (session.currentPassengerOffer + session.fairFare) / 2
    );
    const compromise = clampCounterFare(halfway, session.fairFare);
    return { kind: 'counter', amount: compromise };
  },
  chooseEncounterOption: (inst) =>
    pickEncounterChoice(inst, ['official', 'neutral', 'illicit'], [
      'cooperate',
      'pay_fine',
      'turn_around',
      'call_help',
      'protect',
      'return',
      'stay_app',
      'accept',
      'tea_favor',
      'grant',
      'waive',
      'wait',
      'cautious',
      'steady',
      'refuse',
    ]),
  resolveDispute: () => 'reportSupport',
};

export const recklessStrategy: BotStrategy = {
  name: 'reckless',
  speedMultiplier: BALANCE.BOT?.reckless?.speedMultiplier ?? 1.75,
  nearMissChancePerKm: BALANCE.BOT?.reckless?.nearMissRatePerKm ?? 0.08,
  crashChancePerRide: BALANCE.BOT?.reckless?.crashChancePerRide ?? 0.02,
  infractionChancePerRide: 0.05,
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
  chooseEncounterOption: (inst) =>
    pickEncounterChoice(inst, ['illicit', 'neutral', 'official'], [
      'try_flee',
      'flee_stop',
      'flee_scene',
      'offer_bribe',
      'proceed',
      'push_fast',
      'speed',
      'sidewalk',
      'standard',
    ]),
  resolveDispute: () => 'insistFull',
};

export const trustFocusedStrategy: BotStrategy = {
  name: 'trustFocused',
  speedMultiplier: 1.35,
  nearMissChancePerKm: 0,
  crashChancePerRide: 0,
  infractionChancePerRide: 0,
  helpfulChoiceChance: 0.85,
  shiftMinutes: 460, // Shorter community-oriented shift (~7.5h) with generous discounts
  evaluateRequest: () => ({ accept: true }),
  decideNegotiation: (session: NegotiationSession) => {
    // Offer a friendly discount below fairFare so real GameSession awards publicReputation & trust
    if (session.round === 1) {
      const discounted = Math.round(session.fairFare * 0.88);
      return {
        kind: 'discount',
        amount: clampCounterFare(discounted, session.fairFare),
      };
    }
    return { kind: 'accept' };
  },
  chooseEncounterOption: (inst) =>
    pickEncounterChoice(inst, ['official', 'neutral', 'illicit'], [
      'protect',
      'call_help',
      'cooperate',
      'help',
      'accept',
      'pay_fine',
    ]),
  resolveDispute: () => 'acceptPartial',
};

export const offAppHeavyStrategy: BotStrategy = {
  name: 'offAppHeavy',
  speedMultiplier: 1.6,
  nearMissChancePerKm: 0.04,
  crashChancePerRide: 0.01,
  infractionChancePerRide: 0.04,
  prefersOffApp: true,
  evaluateRequest: () => ({ accept: true }),
  decideNegotiation: (session: NegotiationSession, ctx: BotDecisionContext) => {
    if (session.round === 1 && ctx.rng.next() < 0.55) {
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
  chooseEncounterOption: (inst) =>
    pickEncounterChoice(inst, ['neutral', 'illicit', 'official']),
  resolveDispute: () => 'acceptPartial',
};

export const exploiterStrategy: BotStrategy = {
  name: 'exploiter',
  speedMultiplier: 1.5,
  nearMissChancePerKm: 0.05,
  crashChancePerRide: 0.015,
  infractionChancePerRide: 0.05,
  evaluateRequest: () => ({ accept: true }),
  decideNegotiation: (session: NegotiationSession) => {
    if (session.round === 1) {
      return {
        kind: 'misleadDistance',
        amount: clampCounterFare(Math.round(session.fairFare * 1.25), session.fairFare),
      };
    }
    if (session.currentPatience > 0.2 && !session.pressureUsed) {
      return {
        kind: 'pressure',
        amount: clampCounterFare(Math.round(session.fairFare * 1.2), session.fairFare),
      };
    }
    if (session.currentPassengerOffer >= session.fairFare * 0.9) {
      return { kind: 'accept' };
    }
    return {
      kind: 'counter',
      amount: clampCounterFare(Math.round(session.fairFare * 1.15), session.fairFare),
    };
  },
  chooseEncounterOption: (inst) =>
    pickEncounterChoice(inst, ['illicit', 'neutral', 'official'], [
      'proceed',
      'keep',
      'fee',
      'offer_bribe',
      'flee_stop',
      'flee_scene',
      'standard',
      'comply',
    ]),
  resolveDispute: () => 'insistFull',
};

export const briberStrategy: BotStrategy = {
  name: 'briber',
  speedMultiplier: 1.65,
  nearMissChancePerKm: 0.03,
  crashChancePerRide: 0.005,
  infractionChancePerRide: 0.12,
  evaluateRequest: () => ({ accept: true }),
  decideNegotiation: (session: NegotiationSession, ctx: BotDecisionContext) => {
    if (session.round === 1 && ctx.rng.next() < 0.25) {
      return {
        kind: 'offApp',
        amount: clampCounterFare(Math.round(session.fairFare * 0.95), session.fairFare),
      };
    }
    if (session.currentPassengerOffer >= session.fairFare) {
      return { kind: 'accept' };
    }
    if (session.round === 1) {
      return {
        kind: 'counter',
        amount: clampCounterFare(Math.round(session.fairFare * 1.1), session.fairFare),
      };
    }
    return { kind: 'accept' };
  },
  chooseEncounterOption: (inst) =>
    pickEncounterChoice(inst, ['illicit', 'neutral', 'official'], [
      'offer_bribe',
      'flee_stop',
      'flee_scene',
      'proceed',
      'push_fast',
      'speed',
      'sidewalk',
      'standard',
      'explain',
    ]),
  resolveDispute: () => 'insistFull',
};

export const BOT_STRATEGIES: Record<BotStrategyName, BotStrategy> = {
  acceptAll: acceptAllStrategy,
  alwaysMaxCounter: alwaysMaxCounterStrategy,
  smartPro: smartProStrategy,
  reckless: recklessStrategy,
  trustFocused: trustFocusedStrategy,
  offAppHeavy: offAppHeavyStrategy,
  exploiter: exploiterStrategy,
  briber: briberStrategy,
};

export function getStrategy(name: BotStrategyName): BotStrategy {
  return BOT_STRATEGIES[name] ?? smartProStrategy;
}

export interface SimulatedRideResult {
  requestId: string;
  strategy: BotStrategyName;
  status: 'completed' | 'declined' | 'walkedAway' | 'cancelled' | 'noShow';
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

function createBotSession(
  network: RoadNetwork,
  seed: number,
  day: number,
  minute: number,
  weather: WeatherKind,
  enableEncounters = true
): GameSession {
  const gm = new GameManager({ seed, mode: 'career', data: {} });
  gm.clock.day = day;
  gm.clock.minutes = minute;
  gm.weather = weather;
  gm.weatherSystem.restoreWeather(weather);
  gm.eventDirector.enabled = enableEncounters;
  gm.eventDirector.pauseOnDecisions = false;
  const session = new GameSession({
    gm,
    road: network,
    autoRequests: false,
    negotiation: true,
  });
  session.spawnAtHome();
  gm.economyManager.fuelLevel = gm.economyManager.maxFuelL();
  return session;
}

function executeRideOnSession(
  session: GameSession,
  strategy: BotStrategy,
  req: RideRequest,
  profile: PassengerProfile,
  rng: Rng,
  currentLocationNodeId?: string
): SimulatedRideResult {
  const { gm } = session;
  const route = session.road.route(req.pickupNodeId, req.destinationNodeId, {
    mode: 'motorcycle',
    weather: gm.weather,
    minute: gm.clock.minutes,
    roadEvents: gm.roadEvents,
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
    finalMood: session.ride.getPassengerMood(),
    rating: null,
    reasonCodes: ['TOO_EXPENSIVE'],
    topReasonCode: 'TOO_EXPENSIVE',
    crashed: false,
    nearMissCount: 0,
  };

  if (!route) return emptyResult;

  const firstSegId = route.segmentIds[0];
  const traffic = clamp(
    firstSegId ? (session.road.getSegment(firstSegId)?.trafficDensity ?? 0.3) : 0.3,
    0,
    1
  );

  const ctx: BotDecisionContext = {
    network: session.road,
    currentLocationNodeId: currentLocationNodeId ?? req.pickupNodeId,
    currentMinute: gm.clock.minutes,
    day: gm.clock.day,
    weather: gm.weather,
    traffic,
    rng,
  };

  const evalRes = strategy.evaluateRequest(req, route, ctx);
  if (!evalRes.accept) {
    return {
      ...emptyResult,
      status: 'declined',
      virtualKm: route.virtualKm,
      reasonCodes: ['BAD_TRAFFIC'],
      topReasonCode: 'BAD_TRAFFIC',
    };
  }

  // Register passenger profile with the real RequestGenerator before offering
  session.requests.setProfile(profile);
  session.ride.offer(req);
  if (!session.ride.openNegotiation(req.requestId, ctx.currentLocationNodeId)) {
    return emptyResult;
  }

  let negSession = session.beginNegotiation(req.requestId);
  if (!negSession) {
    session.ride.cancel(req.requestId, 'system', 'noSession');
    return emptyResult;
  }

  const initialFactor = evaluateFactors(negSession, negSession.currentPassengerOffer);
  const reasonCodes: ReasonCode[] = [initialFactor.topFactor];
  let topReason: ReasonCode = initialFactor.topFactor;
  let isOffApp = false;
  let accepted = false;

  while (negSession.status === 'active') {
    const action = strategy.decideNegotiation(negSession, ctx);
    if (action.kind === 'decline') {
      session.ride.cancel(req.requestId, 'rider', 'declined');
      return {
        ...emptyResult,
        status: 'declined',
        reasonCodes,
        topReasonCode: topReason,
      };
    }

    if (action.kind === 'pickupAdjust') {
      const choice = session.pickupChoice();
      if (choice && session.ride.relocatePickup(choice.nodeId, choice.walkM)) {
        negSession = session.repriceNegotiation(negSession);
      }
    }

    const res = respond(negSession, action);
    reasonCodes.push(res.topFactor);
    topReason = res.topFactor;
    session.applyNegotiationResult(res);
    negSession = res.session;

    if (res.outcome?.kind === 'accepted') {
      if (action.kind === 'offApp') {
        session.markOffApp();
        isOffApp = true;
      }
      session.ride.agreeFare(res.outcome.fare, {
        discount: negSession.discountApplied,
      });
      accepted = true;
      break;
    }

    if (res.outcome?.kind === 'walkedAway' || negSession.status === 'walkedAway') {
      session.ride.walkAwayNegotiation();
      return {
        ...emptyResult,
        status: 'walkedAway',
        reasonCodes,
        topReasonCode: res.outcome?.kind === 'walkedAway' ? res.outcome.reason : topReason,
      };
    }
  }

  if (!accepted) {
    session.ride.walkAwayNegotiation();
    return {
      ...emptyResult,
      status: 'walkedAway',
      reasonCodes,
      topReasonCode: topReason,
    };
  }

  // Roll realistic driving incidents and feed them to GameSession.fastForwardTrip
  const expectedNearMiss =
    strategy.nearMissChancePerKm > 0 ? route.virtualKm * strategy.nearMissChancePerKm : 0;
  const nearMissCount =
    expectedNearMiss > 0
      ? Math.floor(expectedNearMiss) + (rng.next() < (expectedNearMiss % 1) ? 1 : 0)
      : 0;
  const crashed = strategy.crashChancePerRide > 0 && rng.chance(strategy.crashChancePerRide);
  const infraction = Boolean(
    strategy.infractionChancePerRide && rng.chance(strategy.infractionChancePerRide)
  );
  const helpfulChoice = Boolean(
    strategy.helpfulChoiceChance && rng.chance(strategy.helpfulChoiceChance)
  );

  const ledgerStartIdx = gm.economyManager.getLedger().length;

  const ff = session.fastForwardTrip({
    speedMultiplier: strategy.speedMultiplier,
    nearMisses: nearMissCount,
    crashed,
    infractions: infraction ? 1 : 0,
    helpfulChoice,
    onEncounter: (inst) => strategy.chooseEncounterOption?.(inst, ctx),
    onDispute: (disp) => strategy.resolveDispute?.(disp, ctx) ?? 'acceptPartial',
  });

  // Measure any real encounter medical/fine/bribe/robbery expenses posted during the ride
  let encounterPenalty = 0;
  const ledger = gm.economyManager.getLedger();
  for (let i = ledgerStartIdx; i < ledger.length; i++) {
    const tx = ledger[i]!;
    if (
      tx.amount < 0 &&
      (tx.kind === 'fine' || tx.kind === 'bribe' || tx.kind === 'medical' || tx.kind === 'robbery') &&
      tx.requestId !== req.requestId
    ) {
      encounterPenalty += Math.abs(tx.amount);
    }
  }

  if (ff.status !== 'completed' || !ff.receipt) {
    return {
      ...emptyResult,
      status: ff.status === 'noShow' ? 'noShow' : 'cancelled',
      durationMin: ff.durationMin,
      fuelUsedL: ff.fuelLiters,
      fuelCost: Math.round(ff.fuelLiters * BALANCE.FUEL.pricePerL),
      repairCost: encounterPenalty,
      net: -Math.round(ff.fuelLiters * BALANCE.FUEL.pricePerL) - encounterPenalty,
      crashed,
      nearMissCount,
      isOffApp,
      helpfulChoice,
      infraction,
      reasonCodes,
      topReasonCode: topReason,
    };
  }

  const r = ff.receipt;
  return {
    requestId: req.requestId,
    strategy: strategy.name,
    status: 'completed',
    fare: r.fare,
    tip: r.tip,
    commission: r.commission,
    fuelUsedL: r.fuelLiters,
    fuelCost: r.fuelCost,
    repairCost: encounterPenalty,
    wearCost: 0,
    net: r.net - encounterPenalty,
    durationMin: ff.durationMin,
    virtualKm: r.distanceKm,
    finalMood: session.ride.getPassengerMood(),
    rating: r.rating,
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
 * Headless ride execution running on a real GameSession + GameManager.
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
  const session = createBotSession(network, rng.int(1, 999999), day, currentMinute, weather, false);
  const startNode = currentLocationNodeId ?? req.pickupNodeId;
  const node = network.getNode(startNode);
  if (node) {
    session.bike.x = node.x;
    session.bike.z = node.z;
  }
  return executeRideOnSession(session, strategy, req, profile, rng, startNode);
}

function moveBikeToNode(session: GameSession, nodeId: string): void {
  const node = session.road.getNode(nodeId);
  if (!node) return;
  session.bike.x = node.x;
  session.bike.z = node.z;
  session.bike.y = node.y ?? 0;
  session.bike.speed = 0;
  session.gm.syncPlayerLocation(nodeId, 0, nodeId === 'N7');
}

function chargePhoneAtHomeIfLow(session: GameSession): void {
  const { gm } = session;
  if (gm.economyManager.phoneBattery >= 25) return;
  const prevX = session.bike.x;
  const prevZ = session.bike.z;
  moveBikeToNode(session, gm.homeNodeId);
  gm.dispatch({ type: 'chargePhone', location: 'home' });
  session.bike.x = prevX;
  session.bike.z = prevZ;
}

function serviceBikeOnSession(session: GameSession, strategy: BotStrategy): number {
  const { gm } = session;
  const em = gm.economyManager;
  const fuelNode = session.road.getPois().find((p) => p.kind === 'fuel')?.nodeId;
  const garageNode = session.road.getPois().find((p) => p.kind === 'garage')?.nodeId;
  const prevX = session.bike.x;
  const prevZ = session.bike.z;

  // Refuel at fuel POI when below 2.5 L
  if (em.fuelLevel < 2.5 && fuelNode) {
    moveBikeToNode(session, fuelNode);
    const space = Math.max(0, em.maxFuelL() - em.fuelLevel);
    if (space > 0.25 && em.cash >= BALANCE.FUEL.pricePerL * 0.5) {
      gm.dispatch({ type: 'refuelAtStation', liters: space });
    }
  }
  // Emergency fuel rescue if still below rescue threshold
  if (em.fuelLevel < BALANCE.FUEL.rescueBelowL) {
    gm.dispatch({ type: 'callFuelRescue' });
  }

  // Routine maintenance / collision repair at garage POI
  let repairSpent = 0;
  const needsOil = em.kmSinceOilChange >= BALANCE.WEAR.oilEveryKm;
  const needsRepair = em.motorcycleCondition < 50;
  if ((needsOil || needsRepair) && garageNode && strategy.name !== 'alwaysMaxCounter') {
    moveBikeToNode(session, garageNode);
    if (needsRepair && em.cash >= 1200) {
      const before = em.cash;
      if (gm.dispatch({ type: 'repair', item: 'full' }).success) {
        repairSpent += Math.max(0, before - em.cash);
      }
    } else if (needsOil && em.cash >= BALANCE.WEAR.oilCost) {
      const before = em.cash;
      if (gm.dispatch({ type: 'repair', item: 'oil' }).success) {
        repairSpent += Math.max(0, before - em.cash);
      }
    } else if (em.motorcycleCondition < 35 && em.cash >= 400) {
      const before = em.cash;
      if (gm.dispatch({ type: 'repair', item: 'engine' }).success) {
        repairSpent += Math.max(0, before - em.cash);
      }
    }
  }

  // Restore bike coordinates back to current road spot
  session.bike.x = prevX;
  session.bike.z = prevZ;
  return repairSpent;
}

function runDayOnSession(
  session: GameSession,
  strategy: BotStrategy,
  rng: Rng,
  shiftMinutes: number
): BotDayResult {
  const { gm } = session;
  const em = gm.economyManager;
  const day = gm.clock.day;
  const startMinute = Math.max(420, gm.clock.minutes);
  const endMinute = Math.min(23 * 60 - 5, startMinute + shiftMinutes);

  const ledgerStartIdx = em.getLedger().length;
  const safetyStart = gm.reputationSystem.getSafetyRecord();

  const rideResults: SimulatedRideResult[] = [];
  let ridesCompleted = 0;
  let ridesDeclined = 0;
  let ridesWalkedAway = 0;
  let offAppRides = 0;
  let helpfulChoices = 0;
  let fuelCostFromLedger = 0;

  // Ensure phone is charged and tank is topped up cleanly at start of shift when affordable
  chargePhoneAtHomeIfLow(session);
  serviceBikeOnSession(session, strategy);

  const eligible = session.requests.getEligibleNodeIds();
  if (eligible.length > 0 && !session.road.nearestNode(session.bike.x, session.bike.z)) {
    moveBikeToNode(session, eligible[0]!);
  }

  while (gm.clock.minutes < endMinute && !gm.shiftEnded) {
    serviceBikeOnSession(session, strategy);

    const suspended = session.ride.isAppSuspended(day);
    // If app is suspended, only offAppHeavy / briber attempt street hails; others lose app work
    if (suspended && !strategy.prefersOffApp && strategy.name !== 'briber') {
      session.fastForwardTrip({ idleMin: 30 });
      continue;
    }

    const waitMin = rng.range(3, 7);
    if (gm.clock.minutes + waitMin >= endMinute) break;
    session.fastForwardTrip({
      idleMin: waitMin,
      onEncounter: (inst) =>
        strategy.chooseEncounterOption?.(inst, {
          network: session.road,
          currentLocationNodeId: gm.playerNodeId,
          currentMinute: gm.clock.minutes,
          day,
          weather: gm.weather,
          traffic: 0.3,
          rng,
        }),
    });
    if (gm.shiftEnded || gm.clock.minutes >= endMinute) break;

    const currentNodeId =
      session.road.nearestNode(session.bike.x, session.bike.z)?.nodeId ??
      eligible[0] ??
      'N1';

    const bookingType: BookingType = suspended ? 'street' : 'app';
    const sampled = session.requests.sampleRequest(
      gm.clock.minutes,
      gm.weather,
      bookingType,
      currentNodeId
    );
    if (!sampled) continue;

    // Keep phone topped up at home if low during long shifts
    chargePhoneAtHomeIfLow(session);

    const ride = executeRideOnSession(
      session,
      strategy,
      sampled.request,
      sampled.profile,
      rng,
      currentNodeId
    );
    rideResults.push(ride);

    if (ride.status === 'completed') {
      ridesCompleted++;
      if (ride.isOffApp) offAppRides++;
      if (ride.helpfulChoice) helpfulChoices++;
    } else if (ride.status === 'declined') {
      ridesDeclined++;
      session.fastForwardTrip({ idleMin: 2 });
    } else {
      ridesWalkedAway++;
      session.fastForwardTrip({ idleMin: 3 });
    }
  }

  // Finalize shift through real GameManager
  let summaryLiving = BALANCE.LIVING.foodPerDay + BALANCE.LIVING.phoneDataPerDay;
  if (!gm.shiftEnded) {
    if (gm.clock.minutes < 11 * 60) {
      moveBikeToNode(session, gm.homeNodeId);
    }
    const endCmd = gm.clock.minutes >= 12 * 60 ? 'endShift' : 'endShiftEarly';
    const res = gm.dispatch({ type: endCmd });
    if (!res.success && !gm.shiftEnded) {
      gm.clock.minutes = 23 * 60;
      gm.dispatch({ type: 'endShift' });
    }
  }

  // Tally exact day totals from the real EconomyManager ledger
  let grossRevenue = 0;
  let tips = 0;
  let commissionTotal = 0;
  let repairAndFines = 0;
  let livingExpenses = 0;

  const ledger = em.getLedger();
  for (let i = ledgerStartIdx; i < ledger.length; i++) {
    const tx = ledger[i]!;
    if (tx.kind === 'fare' || tx.kind === 'bonus' || tx.kind === 'event' || tx.kind === 'reward') {
      if (tx.amount > 0) {
        grossRevenue += tx.amount;
      } else if (tx.kind === 'fare' && tx.amount < 0) {
        grossRevenue = Math.max(0, grossRevenue + tx.amount);
      }
    } else if (tx.kind === 'tip') {
      if (tx.amount > 0) tips += tx.amount;
    } else if (tx.kind === 'commission') {
      commissionTotal += Math.abs(tx.amount);
    } else if (tx.kind === 'fuel') {
      fuelCostFromLedger += Math.abs(tx.amount);
    } else if (
      tx.kind === 'fine' ||
      tx.kind === 'bribe' ||
      tx.kind === 'medical' ||
      tx.kind === 'robbery' ||
      tx.kind === 'maintenance' ||
      tx.kind === 'repair'
    ) {
      if (tx.amount < 0) repairAndFines += Math.abs(tx.amount);
    } else if (
      tx.kind === 'food' ||
      tx.kind === 'phoneData' ||
      tx.kind === 'rent' ||
      tx.kind === 'family'
    ) {
      if (tx.amount < 0) livingExpenses += Math.abs(tx.amount);
    }
  }
  if (livingExpenses > 0) {
    summaryLiving = livingExpenses;
  }

  // Sweep cash buffer (> 600) to repay debt and build bank savings via real commands
  if (em.debt > 0 && em.cash > 600) {
    const pay = Math.min(em.debt, em.cash - 600);
    if (pay > 0) gm.dispatch({ type: 'repayDebt', amount: pay });
  }
  if (em.debt > 0 && em.savings > 0) {
    const cover = Math.min(em.debt, em.savings);
    if (cover > 0) {
      gm.dispatch({ type: 'withdrawSavings', amount: cover });
      gm.dispatch({ type: 'repayDebt', amount: cover });
    }
  }
  if (em.cash > 600) {
    gm.dispatch({ type: 'depositSavings', amount: Math.floor(em.cash - 600) });
  }

  const safetyEnd = gm.reputationSystem.getSafetyRecord();
  const crashes = Math.max(0, safetyEnd.crashes - safetyStart.crashes);
  const infractions = Math.max(0, safetyEnd.infractions - safetyStart.infractions);
  const nearMisses = Math.max(0, safetyEnd.nearMisses - safetyStart.nearMisses);

  const rideFuelTotal = rideResults.reduce((s, r) => s + r.fuelCost, 0);
  const fuelDisplay = fuelCostFromLedger > 0 ? fuelCostFromLedger : rideFuelTotal;
  const dailyNet =
    grossRevenue + tips - commissionTotal - fuelDisplay - repairAndFines - summaryLiving;

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
    fuelCostTotal: fuelDisplay,
    commissionTotal,
    repairCostTotal: repairAndFines,
    livingExpenses: summaryLiving,
    dailyNet,
    averageRating: gm.reputationSystem.getAppRating(),
    rideResults,
  };
}

/**
 * Simulates a full working day (shift) for a bot strategy on a real GameSession.
 */
export function runHeadlessDay(
  strategy: BotStrategy,
  network: RoadNetwork = createBalanceNetwork(),
  day: number = 1,
  weather: WeatherKind = 'clear',
  rng: Rng = new Rng(42),
  shiftMinutes: number = strategy.shiftMinutes ?? (BALANCE.BOT?.shiftMinutes ?? 900),
  options?: { isSuspended?: boolean }
): BotDayResult {
  const session = createBotSession(
    network,
    rng.int(1, 999999),
    day,
    7 * 60,
    weather,
    true
  );
  if (options?.isSuspended) {
    session.gm.reputationSystem.triggerSuspension(day);
  }
  return runDayOnSession(session, strategy, rng, shiftMinutes);
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
  meters?: Record<MeterId, number>;
}

export function runHeadlessCampaign(
  strategy: BotStrategy,
  network: RoadNetwork = createBalanceNetwork(),
  seed: number = 42,
  daysCount: number = 20,
  options?: BotCampaignOptions
): BotCampaignResult {
  const rng = new Rng(seed);
  const session = createBotSession(network, seed, 1, 7 * 60, 'clear', true);
  const { gm } = session;

  if (options?.joinedScheme) {
    gm.bus.emit('story/flag', { key: 'joinedScheme', value: true });
  }
  if (options?.kamalRelationship !== undefined) {
    gm.reputationSystem.setRelationship('char_kamal', options.kamalRelationship);
  }

  let totalCompletedRides = 0;
  let totalGrossRevenue = 0;
  let totalTips = 0;
  let totalFuelCost = 0;
  let totalCommission = 0;
  let totalRepairCost = 0;
  let totalLivingExpenses = 0;
  let totalRentPaid = 0;
  let offAppTripsCount = 0;
  let suspensionsCount = 0;
  let wasSuspended = false;
  const dailyNets: number[] = [];

  const shiftMin = strategy.shiftMinutes ?? (BALANCE.BOT?.shiftMinutes ?? 900);

  for (let day = 1; day <= daysCount; day++) {
    const wasSuspToday = session.ride.isAppSuspended(day);
    const dayRes = runDayOnSession(session, strategy, rng, shiftMin);
    const isSuspEnd =
      session.ride.isAppSuspended(day) || gm.story.branchFlags['appSuspended'] === true;

    if (!wasSuspToday && isSuspEnd) {
      suspensionsCount++;
    }
    if (isSuspEnd) {
      wasSuspended = true;
    }

    totalCompletedRides += dayRes.ridesCompleted;
    totalGrossRevenue += dayRes.grossRevenue;
    totalTips += dayRes.tips;
    totalFuelCost += dayRes.fuelCostTotal;
    totalCommission += dayRes.commissionTotal;
    totalRepairCost += dayRes.repairCostTotal;
    if (BALANCE.LIVING.rentDueDays.includes(day)) {
      totalRentPaid += BALANCE.LIVING.rentAmount;
      totalLivingExpenses += Math.max(0, dayRes.livingExpenses - BALANCE.LIVING.rentAmount);
    } else {
      totalLivingExpenses += dayRes.livingExpenses;
    }
    offAppTripsCount += dayRes.offAppRides;
    dailyNets.push(dayRes.dailyNet);

    if (day < daysCount) {
      gm.dispatch({ type: 'sleep' });
    }
  }

  // Trigger final career choice & ending through real GameManager
  if (options?.careerChoice && gm.mode === 'career') {
    gm.missionManager.activateMission('m6_decision');
    const chosen = gm.dispatch({ type: 'selectCareerChoice', choice: options.careerChoice });
    if (!chosen.success) {
      gm.dispatch({ type: 'selectCareerChoice', choice: 'continue' });
    }
  }
  const endingResult = gm.evaluateCurrentEnding();

  const em = gm.economyManager;
  const rep = gm.reputationSystem;
  const safety = rep.getSafetyRecord();
  const meters = rep.getMeters();

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
    totalCrashes: safety.crashes,
    totalNearMisses: safety.nearMisses,
    totalInfractions: safety.infractions,
    dailyNets,
    finalCash: em.cash,
    finalSavings: em.savings,
    finalDebt: em.debt,
    finalRating: rep.getAppRating(),
    finalLocalTrust: Math.round(meters.publicReputation),
    finalRiskScore: rep.getRiskScore(),
    offAppTripsCount,
    suspensionsCount,
    wasSuspended: wasSuspended || gm.story.branchFlags['appSuspended'] === true,
    endingId: endingResult.endingId,
    meters,
  };
}

/**
 * Simulates a batch of completed rides for a given strategy on real GameSession instances.
 */
export function simulateRides(
  strategy: BotStrategy,
  network: RoadNetwork = createBalanceNetwork(),
  targetCount: number = 200,
  seed: number = 42
): SimulatedRideResult[] {
  const rng = new Rng(seed);
  const session = createBotSession(network, seed, 1, 8 * 60, 'clear', false);
  const results: SimulatedRideResult[] = [];
  let attempts = 0;
  while (results.length < targetCount && attempts < targetCount * 20) {
    attempts++;
    const currentMinute = 480 + ((attempts * 19) % 720);
    if (session.gm.shiftEnded) {
      session.gm.dispatch({ type: 'sleep' });
      session.gm.economyManager.cash = Math.max(session.gm.economyManager.cash, 1000);
    }
    if (attempts % 30 === 0 && !session.gm.shiftEnded) {
      session.gm.clock.minutes = 23 * 60;
      session.gm.dispatch({ type: 'endShift' });
      session.gm.dispatch({ type: 'sleep' });
      session.gm.economyManager.cash = Math.max(session.gm.economyManager.cash, 1000);
    }
    session.gm.clock.minutes = currentMinute;
    chargePhoneAtHomeIfLow(session);

    const weatherRoll = rng.next();
    const weather: WeatherKind =
      weatherRoll < 0.6
        ? 'clear'
        : weatherRoll < 0.85
        ? 'lightRain'
        : 'heavyRain';
    session.gm.weather = weather;
    session.gm.weatherSystem.restoreWeather(weather);
    session.gm.economyManager.fuelLevel = session.gm.economyManager.maxFuelL();

    const sampled = session.requests.sampleRequest(currentMinute, weather);
    if (!sampled) continue;

    const node = network.getNode(sampled.request.pickupNodeId);
    if (node) {
      session.bike.x = node.x;
      session.bike.z = node.z;
    }

    const ride = executeRideOnSession(
      session,
      strategy,
      sampled.request,
      sampled.profile,
      rng,
      sampled.request.pickupNodeId
    );

    if (ride.status === 'completed') {
      results.push(ride);
    }
  }

  return results;
}
