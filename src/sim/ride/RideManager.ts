import {
  createTripFsm,
  isTerminalTripState,
  legacyStatusOf,
  type TripEvent,
} from './tripFsm';
import { nearestPlaceKey } from './rideView';
import { getCharacter } from '../passenger/PassengerAI';
import type { RoadNetwork } from '../road/RoadNetwork';
import type { EventBus, GameEvents } from '../../core/events';
import type {
  ArchetypeId,
  BookingType,
  IntermediateStopState,
  PassengerProfile,
  RideRequest,
  BikeId,
  RideWaitState,
  RoadSegment,
  TripOutcome,
  TripReceipt,
  TripState,
  WeatherKind,
} from '../../core/types';
import { distance2d, clamp } from '../../core/math';
import { distanceToRoute, isWrongWayOnRoute } from '../road/navigation';
import { fairFare } from '../negotiation/fare';
import type { Fsm } from '../../core/fsm';
import type {
  Route,
  RouteOptions,
  PickupOptionsQuery,
  PickupOptionsResult,
} from '../road/routing';
import type { Rng } from '../../core/rng';
import { BALANCE } from '../../config/balance';
import { computeTipChance } from '../reputation/ReputationSystem';
import { receipt, fuelUsed } from '../economy/fuel';
import { offAppPayout, isDisputed } from '../economy/offApp';
import { Rng as SeededRng, hashSeed } from '../../core/rng';
import type { EconomyManager } from '../economy/EconomyManager';
import type { ReputationSystem } from '../reputation/ReputationSystem';
import { defaultDialogueManager } from '../dialogue/DialogueManager';

/**
 * Tip for a completed, paid trip. The roll is seeded by the request, so it replays.
 * Chance follows passenger rating (GDD §6); size is a share of the fare, clamped.
 */
export function tipAmountFor(requestId: string, fare: number, rating: number): number {
  const roll = new SeededRng(hashSeed(requestId, 'tip')).next();
  if (roll >= computeTipChance(rating)) return 0;
  return clamp(Math.round(fare * BALANCE.TIP.fareShare), BALANCE.TIP.minAmount, BALANCE.TIP.maxAmount);
}

/** What the platform settles: a disputed ride keeps only part of its fare. */
export function settledFare(fare: number, disputed: boolean): number {
  return disputed ? Math.round(fare * BALANCE.DISPUTE.fareKept) : fare;
}

export type DisputeResolutionKind = 'acceptPartial' | 'insistFull' | 'reportSupport';

export interface PendingDispute {
  requestId: string;
  fare: number;
  partialFare: number;
  paidFare: number;
  bookingType: BookingType;
  fuelLiters: number;
  rating: number;
  crashed?: boolean;
  day: number;
  minute: number;
  consequences: string[];
  unpaid: boolean;
}

export interface RideMetaSave {
  offAppStrikes: number;
  appSuspendedUntilDay: number;
  directContacts: string[];
  activeBikeId: BikeId;
  hadUnsettledTrip?: boolean;
}

export interface RideManagerOptions {
  roadNetwork: RoadNetwork;
  bus: EventBus<GameEvents>;
  /** Seeded RNG for the NoShow roll. Without it, passengers never no-show. */
  rng?: Rng;
  /** 0-1 payment reliability of the request's passenger; drives the NoShow chance.
   * Without it, every passenger counts as fully reliable (never no-shows). */
  paymentReliabilityOf?: (req: RideRequest) => number | undefined;
  /** T8.6: the passenger's archetype, for dispute behaviour (unreliable passengers may contest). */
  archetypeOf?: (req: RideRequest) => string | undefined;
  /** Live profile lookup for character/archetype dialogue and careful-passenger traits. */
  profileOf?: (req: RideRequest) => PassengerProfile | undefined;
  /** T8.2: when present, a finished trip is paid through `economy.settleTrip`.
   * Without it (bare unit tests) the receipt is computed but nothing is paid. */
  economy?: EconomyManager;
  /** T8.2: supplies the trip rating (`getActiveTripRating`) and starts the trip's tally. */
  reputation?: ReputationSystem;
  /** T8.2: real day/minute for the ledger rows. */
  clock?: { day: number; minutes: number };
  /** T8.3: fuel actually burned over the current trip. Without it the receipt falls
   * back to a distance estimate (bare unit tests, no live riding). */
  tripFuelLiters?: () => number;
  /** T8.4: whether the app can offer rides right now; drives the idle objective.
   * Without it the app is always available. */
  appStatus?: () => 'ok' | 'phoneDead' | 'suspended';
  /** Live road closures/caps/congestion provider for routing. */
  roadEvents?: {
    getClosedSegmentIds: () => string[];
    getSpeedCap?: (segmentId: string) => number | undefined;
    getCongestionMultiplier?: (segmentId: string) => number;
  };
  /** Live weather/flood provider for routing. */
  weatherSystem?: {
    readonly weather: WeatherKind;
    isFlooded?: (segmentId: string) => boolean;
    getFloodLevel?: (segmentId: string) => number;
  };
  /** Optional direct weather/flood callbacks when `weatherSystem` is omitted. */
  weather?: () => WeatherKind;
  isFlooded?: (segment: RoadSegment) => boolean;
  getFloodLevel?: (segmentId: string) => number;
  /** World-grounded pickup arrival hook: return 'hold' when an arrival encounter or boarding walk is pending. */
  onPickupArrival?: (
    req: RideRequest,
    bikePose: { x: number; z: number; speed: number }
  ) => 'hold' | 'proceed';
  /** World-grounded drop-off arrival hook: return 'hold' when a drop-off settlement encounter must run before completing. */
  onDropoffArrival?: (
    req: RideRequest,
    bikePose: { x: number; z: number; speed: number }
  ) => 'hold' | 'proceed';
  /** Advances the sim clock smoothly during real-time staged waits. */
  advanceClockMin?: (gameMin: number) => void;
}

export class RideManager {
  private static readonly MAX_OFFER_QUEUE = 3;
  private static readonly OFFER_TIMEOUT_SEC = 15;

  readonly roadNetwork: RoadNetwork;
  readonly bus: EventBus<GameEvents>;

  private offeredRequests: Map<string, RideRequest> = new Map();
  private offerDeadlines: Map<string, number> = new Map();
  private activeRequest: RideRequest | null = null;
  private pendingDispute: PendingDispute | null = null;
  private readonly trip: Fsm<TripState, TripEvent> = createTripFsm();
  private outcome: TripOutcome | null = null;
  private interruptedFrom: TripState | null = null;
  private readonly rng?: Rng;
  private readonly paymentReliabilityOf?: (req: RideRequest) => number | undefined;
  private readonly archetypeOf?: (req: RideRequest) => string | undefined;
  private readonly profileOf?: (req: RideRequest) => PassengerProfile | undefined;
  private readonly economy?: EconomyManager;
  private readonly reputation?: ReputationSystem;
  private readonly clock?: { day: number; minutes: number };
  private readonly tripFuelLiters?: () => number;
  private readonly appStatusProvider?: () => 'ok' | 'phoneDead' | 'suspended';
  private readonly roadEvents?: RideManagerOptions['roadEvents'];
  private readonly weatherSystem?: RideManagerOptions['weatherSystem'];
  private readonly weatherProvider?: () => WeatherKind;
  private readonly isFloodedFn?: (segment: RoadSegment) => boolean;
  private readonly getFloodLevelFn?: (segmentId: string) => number;
  private readonly onPickupArrival?: RideManagerOptions['onPickupArrival'];
  private readonly onDropoffArrival?: RideManagerOptions['onDropoffArrival'];
  private readonly advanceClockMin?: RideManagerOptions['advanceClockMin'];
  private pickupHold = false;
  private dropoffHold = false;
  private activeWait: RideWaitState | null = null;
  private intermediateStop: IntermediateStopState | null = null;
  private pickupArrivalEvaluatedForRequestId: string | null = null;
  private dropoffArrivalEvaluatedForRequestId: string | null = null;
  // T8.4 live-navigation state. Scratch values only: nothing here allocates per step.
  private readonly pose = { x: 0, z: 0, heading: 0 };
  private hasPose = false;
  private lastSpeed = 0;
  private simTimeSec = 0;
  private offRouteSince = -1;
  private passengerMood = 1;
  private noticeKey: string | null = null;
  private noticeUntil = 0;
  currentRoute: Route | null = null;
  private _offAppStrikes: number = 0;
  private _appSuspendedUntilDay: number = 0;
  readonly directContacts: Set<string> = new Set();

  get offAppStrikes(): number {
    return this.reputation ? this.reputation.getOffAppStrikes() : this._offAppStrikes;
  }

  set offAppStrikes(strikes: number) {
    if (this.reputation) {
      this.reputation.setOffAppStrikes(strikes);
    } else {
      this._offAppStrikes = Math.max(0, strikes);
    }
  }

  get appSuspendedUntilDay(): number {
    return this.reputation
      ? this.reputation.getAppSuspendedUntilDay()
      : this._appSuspendedUntilDay;
  }

  set appSuspendedUntilDay(day: number) {
    if (this.reputation) {
      this.reputation.setAppSuspendedUntilDay(day);
    } else {
      this._appSuspendedUntilDay = Math.max(0, day);
    }
  }
  enableNegotiation: boolean = false;
  activeBikeId: BikeId = 'old100';
  hasEngineTune: boolean = false;
  rideElapsedSec: number = 0;
  smallTalkTriggered: boolean = false;

  constructor(opts: RideManagerOptions) {
    this.roadNetwork = opts.roadNetwork;
    this.bus = opts.bus;
    this.rng = opts.rng;
    this.paymentReliabilityOf = opts.paymentReliabilityOf;
    this.archetypeOf = opts.archetypeOf;
    this.profileOf = opts.profileOf;
    this.economy = opts.economy;
    this.reputation = opts.reputation;
    this.clock = opts.clock;
    this.tripFuelLiters = opts.tripFuelLiters;
    this.appStatusProvider = opts.appStatus;
    this.roadEvents = opts.roadEvents;
    this.weatherSystem = opts.weatherSystem;
    this.weatherProvider = opts.weather;
    this.isFloodedFn =
      opts.isFlooded ??
      (opts.weatherSystem?.isFlooded
        ? (seg: RoadSegment) => opts.weatherSystem!.isFlooded!(seg.segmentId)
        : undefined);
    this.getFloodLevelFn =
      opts.getFloodLevel ??
      (opts.weatherSystem?.getFloodLevel
        ? (segId: string) => opts.weatherSystem!.getFloodLevel!(segId)
        : undefined);
    this.onPickupArrival = opts.onPickupArrival;
    this.onDropoffArrival = opts.onDropoffArrival;
    this.advanceClockMin = opts.advanceClockMin;
    this.bus.on('bike/swapped', ({ bikeId }) => {
      this.activeBikeId = bikeId;
    });
  }

  private routeOpts(mode: 'motorcycle' | 'walk', avoid?: string[]): RouteOptions {
    const opts: RouteOptions = { mode };
    if (avoid) opts.avoid = avoid;
    if (this.roadEvents) opts.roadEvents = this.roadEvents;
    const weather = this.weatherSystem?.weather ?? this.weatherProvider?.();
    if (weather !== undefined) opts.weather = weather;
    if (this.clock) opts.minute = this.clock.minutes;
    if (this.isFloodedFn) opts.isFlooded = this.isFloodedFn;
    if (this.getFloodLevelFn) opts.getFloodLevel = this.getFloodLevelFn;
    return opts;
  }

  getActiveRequest(): RideRequest | null {
    return this.activeRequest;
  }

  /** The authoritative ride state. Everything that shows or reacts to ride
   * progress (HUD, minimap, markers) reads this, never `RideRequest.status`. */
  getTripState(): TripState {
    return this.trip.state;
  }

  /** Why the last ride ended unusually (cleared when the FSM returns to Idle). */
  getOutcome(): TripOutcome | null {
    return this.outcome;
  }

  /** While `EmergencyInterrupted`, the state that `resumeTrip()` returns to. */
  getInterruptedFrom(): TripState | null {
    return this.interruptedFrom;
  }

  /** Last known bike pose (from `update`); `heading` is 0 until the caller supplies it. */
  getPose(): { x: number; z: number; heading: number } {
    return this.pose;
  }

  getAppStatus(): 'ok' | 'phoneDead' | 'suspended' {
    return this.appStatusProvider ? this.appStatusProvider() : 'ok';
  }

  /** 0-1; drops when the passenger is asked to walk to a relocated pickup. */
  getPassengerMood(): number {
    return this.passengerMood;
  }

  /** Adjusts the live passenger mood within [0, 1]. */
  adjustPassengerMood(delta: number): void {
    if (!Number.isFinite(delta) || delta === 0 || !this.activeRequest) return;
    this.passengerMood = clamp(this.passengerMood + delta, 0, 1);
  }

  /** A short-lived objective key explaining why the last ride ended (e.g. no route). */
  getNoticeKey(): string | null {
    return this.noticeKey !== null && this.simTimeSec < this.noticeUntil ? this.noticeKey : null;
  }

  hasOfferedRequests(): boolean {
    return this.offeredRequests.size > 0;
  }

  hasOfferedRequest(requestId: string): boolean {
    return this.offeredRequests.has(requestId);
  }

  getOfferedRequests(): RideRequest[] {
    return Array.from(this.offeredRequests.values());
  }

  getOfferTimeoutRemaining(requestId: string): number {
    const deadline = this.offerDeadlines.get(requestId);
    if (deadline === undefined) return 0;
    return Math.max(0, deadline - this.simTimeSec);
  }

  getPendingDispute(): PendingDispute | null {
    return this.pendingDispute ? { ...this.pendingDispute } : null;
  }

  private resolveDialogueContext(req: RideRequest): {
    archetype: ArchetypeId;
    relationshipLevel: number;
    speaker: string;
    destination: string;
  } {
    const profile = this.profileOf?.(req);
    const charDef = req.characterId ? getCharacter(req.characterId) : undefined;
    const archetype: ArchetypeId =
      profile?.archetype ??
      (this.archetypeOf?.(req) as ArchetypeId | undefined) ??
      charDef?.archetype ??
      'commuter';
    const relationshipLevel = req.characterId
      ? (this.reputation?.getRelationship(req.characterId) ?? charDef?.initialRelationship ?? 10)
      : (charDef?.initialRelationship ?? 10);
    const speaker = profile?.nameKey ?? charDef?.nameKey ?? req.passengerId;
    const destination = req.destinationNodeId
      ? nearestPlaceKey(this, req.destinationNodeId) || req.destinationNodeId
      : 'destination';
    return { archetype, relationshipLevel, speaker, destination };
  }

  private emitRideDialogue(
    req: RideRequest,
    phase: 'greeting' | 'small_talk' | 'drop_off'
  ): void {
    const ctx = this.resolveDialogueContext(req);
    const query = {
      archetype: ctx.archetype,
      characterId: req.characterId,
      relationshipLevel: ctx.relationshipLevel,
      vars: {
        destination: ctx.destination,
        fare: req.initialFare,
      },
      rng: new SeededRng(hashSeed(req.requestId, phase)),
    };
    const selected =
      phase === 'greeting'
        ? defaultDialogueManager.getGreeting(query)
        : phase === 'small_talk'
          ? defaultDialogueManager.getSmallTalk(query)
          : defaultDialogueManager.getDropOff(query);
    if (!selected) return;
    this.bus.emit('passenger/dialogue', {
      requestId: req.requestId,
      key: selected.key,
      text: selected.text,
      phase,
      speaker: ctx.speaker,
    });
  }

  private go(event: TripEvent): void {
    const from = this.trip.state;
    const to = this.trip.send(event);
    if (this.activeRequest) this.activeRequest.status = legacyStatusOf(to);
    this.bus.emit('trip/state', {
      requestId: this.activeRequest?.requestId ?? null,
      from,
      to,
    });
  }

  /** Returns a finished ride (Declined/Cancelled/NoShow/Failed/Completed) to Idle,
   * then re-opens the offer list if requests are still waiting. */
  private settleToIdle(): void {
    if (isTerminalTripState(this.trip.state)) {
      this.go('reset');
      this.outcome = null;
    }
    if (this.trip.state === 'Idle' && this.offeredRequests.size > 0) this.go('offer');
  }

  /** Drops the active request, route and per-ride counters. */
  private clearActive(): void {
    this.activeRequest = null;
    this.pendingDispute = null;
    this.currentRoute = null;
    this.interruptedFrom = null;
    this.rideElapsedSec = 0;
    this.smallTalkTriggered = false;
    this.offRouteSince = -1;
    this.pickupHold = false;
    this.dropoffHold = false;
    this.activeWait = null;
    this.intermediateStop = null;
    this.pickupArrivalEvaluatedForRequestId = null;
    this.dropoffArrivalEvaluatedForRequestId = null;
  }

  isPickupHold(): boolean {
    return this.pickupHold;
  }

  isDropoffHold(): boolean {
    return this.dropoffHold;
  }

  getActiveWait(): RideWaitState | null {
    return this.activeWait;
  }

  getIntermediateStop(): IntermediateStopState | null {
    return this.intermediateStop;
  }

  /** Node nearest the last known bike pose, or null before the first `update`. */
  private nearestNodeId(): string | null {
    if (!this.hasPose) return null;
    return this.roadNetwork.nearestNode(this.pose.x, this.pose.z)?.nodeId ?? null;
  }

  /** Where the current route is heading: the pickup until the passenger is aboard, then optional stop, then destination. */
  private routeTargetId(): string | null {
    const req = this.activeRequest;
    if (!req) return null;
    const s = this.trip.state === 'EmergencyInterrupted' ? this.interruptedFrom : this.trip.state;
    if (s === 'Negotiating' || s === 'Accepted' || s === 'EnRouteToPickup') {
      return req.pickupNodeId;
    }
    if (this.intermediateStop && !this.intermediateStop.arrived) {
      return this.intermediateStop.nodeId;
    }
    return req.destinationNodeId;
  }

  /** No route remains: the ride fails visibly, never a silent stall. */
  private failNoRoute(): void {
    const requestId = this.activeRequest?.requestId;
    if (!requestId || !this.trip.can('fail')) return;
    this.go('fail');
    this.outcome = 'noRoute';
    this.noticeKey = 'objective.no_route';
    this.noticeUntil = this.simTimeSec + BALANCE.NAV.noRouteNoticeSec;
    this.clearActive();
    this.bus.emit('ride/cancelled', { requestId, by: 'system', reason: 'noRoute' });
  }

  offer(request: RideRequest): void {
    if (!this.offeredRequests.has(request.requestId)) {
      while (this.offeredRequests.size >= RideManager.MAX_OFFER_QUEUE) {
        const oldestId = this.offeredRequests.keys().next().value;
        if (!oldestId) break;
        this.offeredRequests.delete(oldestId);
        this.offerDeadlines.delete(oldestId);
        this.bus.emit('ride/cancelled', {
          requestId: oldestId,
          by: 'system',
          reason: 'queueFull',
        });
      }
    }
    this.offeredRequests.set(request.requestId, { ...request });
    this.offerDeadlines.set(request.requestId, this.simTimeSec + RideManager.OFFER_TIMEOUT_SEC);
    this.settleToIdle();
    this.bus.emit('ride/requested', { request });
  }

  /** Accepts an offered request: opens negotiation and, when negotiation is not
   * enabled (or bypassed on pre-agreed direct calls), agrees the listed fare straight away. */
  accept(requestId: string, startNodeId?: string, skipNegotiation = false): boolean {
    if (!this.openNegotiation(requestId, startNodeId, skipNegotiation)) return false;
    if ((!this.enableNegotiation || skipNegotiation) && this.activeRequest) {
      this.doAgree(this.activeRequest.initialFare);
    }
    return true;
  }

  /** T8.1: negotiation comes before pickup. Takes an offered request and moves
   * the trip to `Negotiating`; `agreeFare` or a walk-away ends it. */
  openNegotiation(
    requestId: string,
    startNodeId?: string,
    skipNegotiation = false
  ): boolean {
    this.settleToIdle();
    const req = this.offeredRequests.get(requestId);
    if (!req || this.trip.state !== 'RequestAvailable') return false;

    this.offeredRequests.delete(requestId);
    this.offerDeadlines.delete(requestId);
    this.activeRequest = { ...req };
    this.go('open');
    this.passengerMood = 1;
    this.offRouteSince = -1;
    // Ride to the pickup first from where the bike is; the trip route follows at pickup.
    // Without a known position (bare tests) fall back to the trip route itself.
    const from = startNodeId ?? this.nearestNodeId();
    const motoOpts = this.routeOpts('motorcycle');
    this.currentRoute = from
      ? this.roadNetwork.route(from, req.pickupNodeId, motoOpts)
      : this.roadNetwork.route(req.pickupNodeId, req.destinationNodeId, motoOpts);
    if (this.enableNegotiation && !skipNegotiation) {
      this.bus.emit('negotiation/started', { requestId, initialFare: req.initialFare });
    }
    return true;
  }

  private doAgree(fare: number): void {
    if (!this.activeRequest || this.trip.state !== 'Negotiating') return;
    this.activeRequest.initialFare = fare;
    this.go('agree');
    this.bus.emit('ride/accepted', { requestId: this.activeRequest.requestId });
  }

  /** T8.1: the player and passenger agreed a fare; the rider now heads to pickup. */
  agreeFare(fare: number, meta?: { discount?: boolean }): void {
    if (!this.activeRequest || this.trip.state !== 'Negotiating') return;
    const requestId = this.activeRequest.requestId;
    this.doAgree(fare);
    this.bus.emit('negotiation/result', {
      requestId,
      outcome: { kind: 'accepted', fare },
      ...(meta?.discount ? { discount: true } : {}),
    });
  }

  /** An emergency (crash, robbery, ...) pauses ride progress; `resumeTrip` continues it. */
  interrupt(): boolean {
    if (!this.trip.can('interrupt')) return false;
    this.interruptedFrom = this.trip.state;
    this.go('interrupt');
    return true;
  }

  resumeTrip(): boolean {
    if (!this.trip.can('resume')) return false;
    this.interruptedFrom = null;
    this.go('resume');
    return true;
  }

  pickupOptions(
    req: { pickupNodeId: string },
    riderPos: { x: number; z: number } | string,
    options?: PickupOptionsQuery
  ): PickupOptionsResult | null {
    const merged: PickupOptionsQuery = {
      ...this.routeOpts('motorcycle'),
      ...options,
    };
    return this.roadNetwork.pickupOptions(req, riderPos, merged);
  }

  /** A segment on the current route is blocked: route around it from where the bike
   * is, or fail the ride clearly when nothing is left. */
  rerouteIfBlocked(blockedSegmentId: string, currentNodeId?: string): Route | null {
    const target = this.routeTargetId();
    if (!this.activeRequest || !this.currentRoute || !target) return null;
    if (!this.currentRoute.segmentIds.includes(blockedSegmentId)) return null;

    const fromNode = currentNodeId ?? this.nearestNodeId() ?? this.activeRequest.pickupNodeId;
    const newRoute = this.roadNetwork.route(
      fromNode,
      target,
      this.routeOpts('motorcycle', [blockedSegmentId])
    );
    if (newRoute) {
      this.currentRoute = newRoute;
      this.offRouteSince = -1;
      return newRoute;
    }
    this.failNoRoute();
    return null;
  }

  /** True once the bike has been more than `NAV.offRouteM` from the current route, or
   * traveling the wrong way along its centerline, for `NAV.offRouteSec` of sim time.
   * Allocation-free. */
  isOffRoute(pose: { x: number; z: number; heading?: number; speed?: number }): boolean {
    const route = this.currentRoute;
    if (!route || !this.activeRequest || route.segmentIds.length === 0) {
      this.offRouteSince = -1;
      return false;
    }
    const nodes = this.roadNetwork.getNodesMap();
    const tooFar = distanceToRoute(route, nodes, pose.x, pose.z) > BALANCE.NAV.offRouteM;
    const heading = pose.heading ?? (this.hasPose ? this.pose.heading : undefined);
    const checkSpeed =
      pose.heading !== undefined
        ? pose.speed === undefined || Math.abs(pose.speed) > 0.5
        : Math.abs(pose.speed ?? this.lastSpeed) > 0.5;
    const wrongWay =
      !tooFar &&
      heading !== undefined &&
      checkSpeed &&
      isWrongWayOnRoute(route, nodes, pose.x, pose.z, heading);

    if (!tooFar && !wrongWay) {
      this.offRouteSince = -1;
      return false;
    }
    if (this.offRouteSince < 0) this.offRouteSince = this.simTimeSec;
    return this.simTimeSec - this.offRouteSince >= BALANCE.NAV.offRouteSec;
  }

  /** Recalculates the route from the bike's position to the current target (after a
   * missed turn). Fails the ride clearly when the target is unreachable. */
  reroute(pose: { x: number; z: number }): Route | null {
    const target = this.routeTargetId();
    if (!this.activeRequest || !target) return null;
    const from = this.roadNetwork.nearestNode(pose.x, pose.z)?.nodeId;
    const fresh = from ? this.roadNetwork.route(from, target, this.routeOpts('motorcycle')) : null;
    this.offRouteSince = -1;
    if (fresh) {
      this.currentRoute = fresh;
      return fresh;
    }
    this.failNoRoute();
    return null;
  }

  rerouteAvoiding(avoidSegmentIds: Iterable<string>): Route | null {
    const target = this.routeTargetId();
    const req = this.activeRequest;
    if (!req || !target) return null;
    const from = this.nearestNodeId() ?? req.pickupNodeId;
    const avoidList = Array.from(avoidSegmentIds);
    const fresh = this.roadNetwork.route(
      from,
      target,
      this.routeOpts('motorcycle', avoidList.length > 0 ? avoidList : undefined)
    );
    if (fresh) {
      this.currentRoute = fresh;
      this.offRouteSince = -1;
      return fresh;
    }
    return null;
  }

  rerouteViaTag(tag: string): Route | null {
    const req = this.activeRequest;
    const s = this.trip.state;
    if (!req || (s !== 'PassengerOnboard' && s !== 'EnRouteToDestination')) return null;
    const fromNodeId = this.nearestNodeId() ?? req.pickupNodeId;
    const destNodeId = this.intermediateStop && !this.intermediateStop.arrived
      ? this.intermediateStop.nodeId
      : req.destinationNodeId;
    const fromNode = this.roadNetwork.getNode(fromNodeId);
    const destNode = this.roadNetwork.getNode(destNodeId);
    if (!fromNode || !destNode) return null;

    const midX = (fromNode.x + destNode.x) * 0.5;
    const midZ = (fromNode.z + destNode.z) * 0.5;
    const opts = this.routeOpts('motorcycle');
    const candidates: Array<{ nodeId: string; score: number }> = [];
    for (const node of this.roadNetwork.getAllNodes()) {
      if (node.nodeId === fromNodeId || node.nodeId === destNodeId) continue;
      const tags = this.roadNetwork.getNodeZoneTags(node.nodeId);
      if (!tags.includes(tag)) continue;
      candidates.push({
        nodeId: node.nodeId,
        score: distance2d(node.x, node.z, midX, midZ),
      });
    }
    candidates.sort((a, b) => a.score - b.score);

    for (let i = 0; i < Math.min(candidates.length, 6); i++) {
      const viaId = candidates[i]!.nodeId;
      const leg1 = this.roadNetwork.route(fromNodeId, viaId, opts);
      const leg2 = leg1 ? this.roadNetwork.route(viaId, destNodeId, opts) : null;
      if (!leg1 || !leg2) continue;
      const stitched: Route = {
        nodeIds: [...leg1.nodeIds, ...leg2.nodeIds.slice(1)],
        segmentIds: [...leg1.segmentIds, ...leg2.segmentIds],
        lengthM: leg1.lengthM + leg2.lengthM,
        virtualKm: leg1.virtualKm + leg2.virtualKm,
        etaMin: leg1.etaMin + leg2.etaMin,
        uTurns: leg1.uTurns + leg2.uTurns,
      };
      this.currentRoute = stitched;
      this.offRouteSince = -1;
      return stitched;
    }
    return null;
  }

  setIntermediateStop(stop: IntermediateStopState): boolean {
    const req = this.activeRequest;
    const s = this.trip.state;
    if (!req || (s !== 'PassengerOnboard' && s !== 'EnRouteToDestination')) return false;
    const fromNode = this.nearestNodeId() ?? req.pickupNodeId;
    const opts = this.routeOpts('motorcycle');
    const toStop = this.roadNetwork.route(fromNode, stop.nodeId, opts);
    const toDest = this.roadNetwork.route(stop.nodeId, req.destinationNodeId, opts);
    if (!toStop || !toDest) return false;

    this.intermediateStop = { ...stop, arrived: false };
    this.currentRoute = toStop;
    this.offRouteSince = -1;
    this.bus.emit('ride/stopAdded', {
      requestId: req.requestId,
      nodeId: stop.nodeId,
      placeKey: stop.placeKey,
      kind: stop.kind,
    });
    return true;
  }

  relocatePickupToNearbyJunction(
    minDistM: number = 45,
    maxDistM: number = 120
  ): { oldNodeId: string; newNodeId: string } | null {
    const req = this.activeRequest;
    const s = this.trip.state;
    if (!req || (s !== 'Accepted' && s !== 'EnRouteToPickup')) return null;
    const oldNodeId = req.pickupNodeId;
    const oldNode = this.roadNetwork.getNode(oldNodeId);
    if (!oldNode) return null;

    const fromNode = this.nearestNodeId() ?? oldNodeId;
    const opts = this.routeOpts('motorcycle');
    let best: {
      nodeId: string;
      toNew: Route;
      trip: Route;
      distErr: number;
    } | null = null;
    const idealDist = (minDistM + maxDistM) * 0.5;

    for (const pass of [0, 1]) {
      const lo = pass === 0 ? minDistM : 20;
      const hi = pass === 0 ? maxDistM : 180;
      for (const node of this.roadNetwork.getAllNodes()) {
        if (node.nodeId === oldNodeId || !this.roadNetwork.isPickupNode(node.nodeId)) {
          continue;
        }
        const d = distance2d(oldNode.x, oldNode.z, node.x, node.z);
        if (d < lo || d > hi) continue;
        const toNew = this.roadNetwork.route(fromNode, node.nodeId, opts);
        if (!toNew) continue;
        const trip = this.roadNetwork.route(node.nodeId, req.destinationNodeId, opts);
        if (!trip) continue;
        const err = Math.abs(d - idealDist);
        if (!best || err < best.distErr) {
          best = { nodeId: node.nodeId, toNew, trip, distErr: err };
        }
      }
      if (best) break;
    }

    if (!best) return null;
    req.pickupNodeId = best.nodeId;
    req.estimatedDistance = best.trip.virtualKm;
    req.estimatedDuration = best.trip.etaMin;
    this.currentRoute = best.toNew;
    this.offRouteSince = -1;
    this.pickupHold = false;
    this.activeWait = null;
    // Allow arrival at the corrected pin to board smoothly without re-triggering wrong pin
    this.pickupArrivalEvaluatedForRequestId = req.requestId;
    this.bus.emit('ride/pickupRelocated', {
      requestId: req.requestId,
      oldNodeId,
      newNodeId: best.nodeId,
    });
    return { oldNodeId, newNodeId: best.nodeId };
  }

  startPickupWait(gameMin: number, realSec?: number): void {
    const req = this.activeRequest;
    if (!req || this.trip.state !== 'EnRouteToPickup') return;
    const totalGameMin = Math.max(1, gameMin);
    const totalSimSec = realSec ?? clamp(3 + totalGameMin * 0.7, 4, 8);
    this.pickupHold = true;
    this.activeWait = {
      kind: 'pickupWait',
      labelKey: 'hud.wait.pickup',
      totalSimSec,
      remainingSimSec: totalSimSec,
      totalGameMin,
      remainingGameMin: totalGameMin,
      canCancel: true,
    };
    this.bus.emit('ride/waitUpdated', {
      requestId: req.requestId,
      active: true,
      kind: 'pickupWait',
      remainingGameMin: totalGameMin,
    });
  }

  startDropoffWait(gameMin: number, realSec?: number): void {
    const req = this.activeRequest;
    if (!req || this.trip.state !== 'Completing') return;
    const totalGameMin = Math.max(1, gameMin);
    const totalSimSec = realSec ?? clamp(3 + totalGameMin * 0.7, 4, 8);
    this.dropoffHold = true;
    this.activeWait = {
      kind: 'stopErrand',
      labelKey: 'hud.wait.pickup',
      totalSimSec,
      remainingSimSec: totalSimSec,
      totalGameMin,
      remainingGameMin: totalGameMin,
      canCancel: true,
    };
    this.bus.emit('ride/waitUpdated', {
      requestId: req.requestId,
      active: true,
      kind: 'stopErrand',
      remainingGameMin: totalGameMin,
    });
  }

  resumePickupBoarding(): void {
    if (!this.activeRequest || this.trip.state !== 'EnRouteToPickup') return;
    const hadWait = this.activeWait !== null;
    this.pickupHold = false;
    this.activeWait = null;
    if (hadWait) {
      this.bus.emit('ride/waitUpdated', {
        requestId: this.activeRequest.requestId,
        active: false,
      });
    }
    this.completePickupBoarding();
  }

  resumeDropoffSettlement(): void {
    const req = this.activeRequest;
    if (!req || this.trip.state !== 'Completing') return;
    const hadWait = this.activeWait !== null;
    this.dropoffHold = false;
    this.activeWait = null;
    if (hadWait) {
      this.bus.emit('ride/waitUpdated', {
        requestId: req.requestId,
        active: false,
      });
    }
    this.settleArrival(req);
  }

  cancelActiveWait(): boolean {
    const req = this.activeRequest;
    const wait = this.activeWait;
    if (!req || !wait || !wait.canCancel) return false;
    const kind = wait.kind;
    this.activeWait = null;
    this.bus.emit('ride/waitUpdated', {
      requestId: req.requestId,
      active: false,
    });
    if (kind === 'pickupWait') {
      this.pickupHold = false;
      this.cancel(req.requestId, 'rider', 'wait_cancelled');
      return true;
    }
    if (this.trip.state === 'Completing') {
      this.resumeDropoffSettlement();
      return true;
    }
    const completedStop = this.intermediateStop;
    this.intermediateStop = null;
    const charId = req.characterId ?? req.passengerId;
    if (charId) {
      this.reputation?.changePassengerTrust(charId, -3);
    }
    this.adjustPassengerMood(-0.15);
    const fromNode =
      completedStop?.nodeId ?? this.nearestNodeId() ?? req.pickupNodeId;
    this.currentRoute = this.roadNetwork.route(
      fromNode,
      req.destinationNodeId,
      this.routeOpts('motorcycle')
    );
    this.offRouteSince = -1;
    if (completedStop) {
      this.bus.emit('ride/stopCompleted', {
        requestId: req.requestId,
        nodeId: completedStop.nodeId,
        placeKey: completedStop.placeKey,
      });
    }
    return true;
  }

  /** Moves the pickup to `nodeId` (e.g. a safe crossing), `walkM` metres from the old
   * one. Only while the pickup can still change. Re-prices the trip while still
   * negotiating; later the agreed fare stands and the passenger just walks. */
  relocatePickup(nodeId: string, walkM: number): boolean {
    const req = this.activeRequest;
    const s = this.trip.state;
    if (!req || (s !== 'Negotiating' && s !== 'Accepted' && s !== 'EnRouteToPickup')) return false;
    const oldNode = this.roadNetwork.getNode(req.pickupNodeId);
    const newNode = this.roadNetwork.getNode(nodeId);
    if (!oldNode || !newNode || !this.roadNetwork.isPickupNode(nodeId)) return false;
    // The walk is measured from the map, not trusted: a caller's walkM must match it (within 5 m).
    const walkRoute = this.roadNetwork.route(req.pickupNodeId, nodeId, this.routeOpts('walk'));
    if (!walkRoute) return false;
    const trueWalkM = walkRoute.lengthM;
    if (!(walkM >= 0) || Math.abs(walkM - trueWalkM) > 5 || trueWalkM > BALANCE.TRIP.maxRelocateWalkM) {
      return false;
    }
    const from = this.nearestNodeId() ?? req.pickupNodeId;
    const motoOpts = this.routeOpts('motorcycle');
    const toPickup = this.roadNetwork.route(from, nodeId, motoOpts);
    const trip = this.roadNetwork.route(nodeId, req.destinationNodeId, motoOpts);
    if (!toPickup || !trip) return false;

    req.pickupNodeId = nodeId;
    req.estimatedDistance = trip.virtualKm;
    req.estimatedDuration = trip.etaMin;
    if (s === 'Negotiating') req.initialFare = fairFare(trip.virtualKm, trip.etaMin, req.surge);
    this.currentRoute = toPickup;
    this.offRouteSince = -1;
    this.passengerMood = clamp(this.passengerMood - trueWalkM * BALANCE.TRIP.walkMoodLossPerM, 0, 1);
    return true;
  }

  private isAlleyOnlyNode(nodeId: string): boolean {
    let touchesAlley = false;
    let touchesNonAlley = false;
    for (const seg of this.roadNetwork.getAllSegments()) {
      if (seg.startNodeId !== nodeId && seg.endNodeId !== nodeId) continue;
      if (seg.roadType === 'alley' || seg.tags.includes('alley')) {
        touchesAlley = true;
      } else if (seg.motorcycleAccessible) {
        touchesNonAlley = true;
      }
    }
    return touchesAlley && !touchesNonAlley;
  }

  /** Finds a nearby non-alley entrance when the pickup or destination sits inside an alley. */
  alleyEntranceOption(
    req: Pick<RideRequest, 'pickupNodeId' | 'destinationNodeId'>
  ): { nodeId: string; walkM: number; target: 'pickup' | 'destination' } | null {
    const motoOpts = this.routeOpts('motorcycle');
    const walkOpts = this.routeOpts('walk');
    const candidates: Array<{ target: 'destination' | 'pickup'; targetNodeId: string }> = [
      { target: 'destination', targetNodeId: req.destinationNodeId },
      { target: 'pickup', targetNodeId: req.pickupNodeId },
    ];
    for (const { target, targetNodeId } of candidates) {
      if (!this.isAlleyOnlyNode(targetNodeId)) continue;
      let best: { nodeId: string; walkM: number; target: 'pickup' | 'destination' } | null = null;
      for (const node of this.roadNetwork.getAllNodes()) {
        if (node.nodeId === targetNodeId || this.isAlleyOnlyNode(node.nodeId)) continue;
        if (!this.roadNetwork.isPickupNode(node.nodeId)) continue;
        const walkRoute =
          target === 'destination'
            ? this.roadNetwork.route(node.nodeId, targetNodeId, walkOpts)
            : this.roadNetwork.route(targetNodeId, node.nodeId, walkOpts);
        if (!walkRoute || walkRoute.lengthM > BALANCE.TRIP.maxRelocateWalkM) continue;
        const tripOk =
          target === 'destination'
            ? this.roadNetwork.route(req.pickupNodeId, node.nodeId, motoOpts)
            : this.roadNetwork.route(node.nodeId, req.destinationNodeId, motoOpts);
        if (!tripOk) continue;
        if (!best || walkRoute.lengthM < best.walkM) {
          best = { nodeId: node.nodeId, walkM: Math.round(walkRoute.lengthM), target };
        }
      }
      if (best) return best;
    }
    return null;
  }

  /** Moves an alley pickup or drop-off point out to the nearest non-alley entrance. */
  relocateAlley(
    nodeId: string,
    walkM: number,
    target: 'pickup' | 'destination'
  ): boolean {
    if (this.isAlleyOnlyNode(nodeId)) return false;
    if (target === 'pickup') {
      return this.relocatePickup(nodeId, walkM);
    }
    const req = this.activeRequest;
    const s = this.trip.state;
    if (!req || (s !== 'Negotiating' && s !== 'Accepted' && s !== 'EnRouteToPickup')) {
      return false;
    }
    if (!this.roadNetwork.getNode(nodeId) || !this.roadNetwork.isPickupNode(nodeId)) return false;
    const walkRoute = this.roadNetwork.route(nodeId, req.destinationNodeId, this.routeOpts('walk'));
    if (!walkRoute) return false;
    const trueWalkM = walkRoute.lengthM;
    if (!(walkM >= 0) || Math.abs(walkM - trueWalkM) > 5 || trueWalkM > BALANCE.TRIP.maxRelocateWalkM) {
      return false;
    }
    const trip = this.roadNetwork.route(req.pickupNodeId, nodeId, this.routeOpts('motorcycle'));
    if (!trip) return false;
    req.destinationNodeId = nodeId;
    req.estimatedDistance = trip.virtualKm;
    req.estimatedDuration = trip.etaMin;
    if (s === 'Negotiating') req.initialFare = fairFare(trip.virtualKm, trip.etaMin, req.surge);
    this.passengerMood = clamp(
      this.passengerMood - trueWalkM * BALANCE.TRIP.walkMoodLossPerM,
      0,
      1
    );
    return true;
  }

  addStrike(currentDay: number): { strikes: number; suspended: boolean } {
    if (this.reputation) {
      return this.reputation.addOffAppStrike(currentDay);
    }
    this._offAppStrikes++;
    const suspended = this._offAppStrikes >= BALANCE.OFF_APP.strikesToSuspend;
    if (suspended) {
      this._appSuspendedUntilDay = currentDay + BALANCE.OFF_APP.suspendDays;
      this.bus.emit('story/flag', { key: 'appSuspended', value: true });
      this.bus.emit('story/flag', {
        key: 'appSuspendedUntilDay',
        value: this._appSuspendedUntilDay,
      });
    }
    return { strikes: this._offAppStrikes, suspended };
  }

  recordOffAppRide(
    passengerId: string,
    currentDay: number,
    rng: Rng
  ): { detected: boolean; strikes: number; suspended: boolean } {
    this.directContacts.add(passengerId);
    const detected = rng.chance(BALANCE.OFF_APP.policyDetectChance);
    if (detected) {
      const res = this.addStrike(currentDay);
      return { detected: true, strikes: res.strikes, suspended: res.suspended };
    }
    return {
      detected: false,
      strikes: this.offAppStrikes,
      suspended: this.isAppSuspended(currentDay),
    };
  }

  isAppSuspended(currentDay: number): boolean {
    if (this.reputation) {
      return this.reputation.isAppSuspended(currentDay);
    }
    if (this._appSuspendedUntilDay > 0 && currentDay >= this._appSuspendedUntilDay) {
      this._appSuspendedUntilDay = 0;
      this._offAppStrikes = 0;
      return false;
    }
    return this._appSuspendedUntilDay > 0 && currentDay < this._appSuspendedUntilDay;
  }

  hasUnsettledTrip(): boolean {
    if (!this.activeRequest) return false;
    return !(this.economy?.getSettledIds().includes(this.activeRequest.requestId) ?? false);
  }

  exportMeta(): RideMetaSave {
    return {
      offAppStrikes: this.offAppStrikes,
      appSuspendedUntilDay: this.appSuspendedUntilDay,
      directContacts: Array.from(this.directContacts),
      activeBikeId: this.activeBikeId,
      hadUnsettledTrip: this.hasUnsettledTrip(),
    };
  }

  importMeta(meta?: Partial<RideMetaSave>): void {
    if (!meta) return;
    if (Array.isArray(meta.directContacts)) {
      this.directContacts.clear();
      for (const id of meta.directContacts) {
        this.directContacts.add(id);
      }
    }
    if (meta.activeBikeId) {
      this.activeBikeId = meta.activeBikeId;
    }
    if (!this.reputation) {
      if (typeof meta.offAppStrikes === 'number' && Number.isFinite(meta.offAppStrikes)) {
        this._offAppStrikes = Math.max(0, Math.floor(meta.offAppStrikes));
      }
      if (typeof meta.appSuspendedUntilDay === 'number' && Number.isFinite(meta.appSuspendedUntilDay)) {
        this._appSuspendedUntilDay = Math.max(0, Math.floor(meta.appSuspendedUntilDay));
      }
    }
  }

  /** Cancels/resets any unsettled live ride or queued offers cleanly to Idle on reload without penalty. */
  resetUnsettledToIdle(): boolean {
    const active = this.activeRequest;
    this.offeredRequests.clear();
    this.offerDeadlines.clear();
    this.pendingDispute = null;
    this.currentRoute = null;
    this.noticeKey = null;
    this.noticeUntil = 0;

    if (active) {
      const reqId = active.requestId;
      const state = this.trip.state;
      if (state === 'Negotiating') {
        this.go('decline');
      } else if (this.trip.can('cancel')) {
        this.go('cancel');
      } else if (this.trip.can('abort')) {
        this.go('abort');
      } else if (this.trip.can('fail')) {
        this.go('fail');
      }
      this.outcome = null;
      this.clearActive();
      this.settleToIdle();
      this.bus.emit('ride/cancelled', { requestId: reqId, by: 'system', reason: 'reload_unsettled' });
      return true;
    }

    if (this.trip.state === 'RequestAvailable') {
      this.go('withdraw');
    }
    this.outcome = null;
    this.clearActive();
    this.settleToIdle();
    return false;
  }

  resetCareer(): void {
    if (this.activeRequest) {
      this.cancel(this.activeRequest.requestId, 'system', 'new_career');
    }
    this.offeredRequests.clear();
    this.offerDeadlines.clear();
    if (this.trip.state === 'RequestAvailable') {
      this.go('withdraw');
    }
    this.outcome = null;
    this.settleToIdle();
    this.pendingDispute = null;
    this.currentRoute = null;
    this.directContacts.clear();
    this._offAppStrikes = 0;
    this._appSuspendedUntilDay = 0;
    this.noticeKey = null;
    this.noticeUntil = 0;
  }

  cancel(
    requestId: string,
    by: 'rider' | 'passenger' | 'system',
    reason: string
  ): void {
    const active = this.activeRequest;
    if (active?.requestId === requestId) {
      const state = this.trip.state;
      if (state === 'Negotiating') {
        this.go(by === 'passenger' ? 'walkAway' : 'decline');
      } else if (state === 'Accepted' || state === 'EnRouteToPickup') {
        this.go('cancel');
        this.outcome = by === 'passenger' ? 'passengerCancelled' : by === 'rider' ? 'riderCancelled' : null;
      } else if (this.trip.can('abort')) {
        this.go('abort');
        this.outcome =
          by === 'passenger'
            ? 'passengerCancelled'
            : by === 'rider'
              ? 'riderCancelled'
              : reason === 'accident'
                ? 'accident'
                : reason === 'robbery'
                  ? 'robbery'
                  : null;
      }
      this.clearActive();
    } else if (this.offeredRequests.delete(requestId)) {
      this.offerDeadlines.delete(requestId);
      if (this.trip.state === 'RequestAvailable' && this.offeredRequests.size === 0) {
        this.go(by === 'rider' ? 'decline' : 'withdraw');
      }
    }
    this.bus.emit('ride/cancelled', { requestId, by, reason });
  }

  walkAwayNegotiation(): void {
    if (this.activeRequest && this.trip.state === 'Negotiating') {
      const reqId = this.activeRequest.requestId;
      this.cancel(reqId, 'passenger', 'walkedAway');
      this.bus.emit('negotiation/result', {
        requestId: reqId,
        outcome: { kind: 'walkedAway', reason: 'OUT_OF_PATIENCE' },
      });
    }
  }

  /** Chance the passenger is gone when the rider reaches pickup: less
   * reliable passengers no-show more often. */
  private noShowChance(req: RideRequest): number {
    const reliability = this.paymentReliabilityOf?.(req) ?? 1;
    return (1 - reliability) * BALANCE.TRIP.noShowMaxChance;
  }

  private expireStaleOffers(): void {
    if (this.offerDeadlines.size === 0) return;
    for (const [id, deadline] of Array.from(this.offerDeadlines.entries())) {
      if (this.simTimeSec < deadline) continue;
      this.offerDeadlines.delete(id);
      if (this.offeredRequests.delete(id)) {
        this.bus.emit('ride/cancelled', { requestId: id, by: 'system', reason: 'expired' });
      }
    }
    if (this.trip.state === 'RequestAvailable' && this.offeredRequests.size === 0) {
      this.go('withdraw');
    }
  }

  private finalizeTrip(params: {
    req: RideRequest;
    fare: number;
    tip: number;
    bonus?: number;
    rating: number;
    crashed?: boolean;
    fuelLiters: number;
    day: number;
    minute: number;
    consequences: string[];
  }): TripReceipt | null {
    const tripReceipt = this.economy
      ? this.economy.settleTrip({
          requestId: params.req.requestId,
          fare: params.fare,
          tip: params.tip,
          bonus: params.bonus ?? 0,
          bookingType: params.req.bookingType,
          fuelLiters: params.fuelLiters,
          otherCosts: 0,
          penalties: 0,
          compensation: 0,
          durationMin: params.req.estimatedDuration,
          distanceKm: params.req.estimatedDistance,
          rating: params.rating,
          day: params.day,
          minute: params.minute,
          consequences: params.consequences,
        })
      : receipt({
          requestId: params.req.requestId,
          fare: params.fare,
          tip: params.tip,
          bonus: params.bonus ?? 0,
          bookingType: params.req.bookingType,
          durationMin: params.req.estimatedDuration,
          distanceKm: params.req.estimatedDistance,
          rating: params.rating,
          fuelLiters: params.fuelLiters,
          consequences: params.consequences,
        });

    this.emitRideDialogue(params.req, 'drop_off');

    // null: already settled (e.g. the tutorial settled it); never pay or announce twice.
    if (tripReceipt) {
      const pickupDistrict = this.roadNetwork.getNodeDistrict(params.req.pickupNodeId);
      const destinationDistrict = this.roadNetwork.getNodeDistrict(params.req.destinationNodeId);
      const district = destinationDistrict ?? pickupDistrict;
      const zoneTagSet = new Set<string>([
        ...this.roadNetwork.getNodeZoneTags(params.req.pickupNodeId),
        ...this.roadNetwork.getNodeZoneTags(params.req.destinationNodeId),
      ]);
      const weather = this.weatherSystem?.weather ?? this.weatherProvider?.();
      const passengerNameKey =
        params.req.passengerNameKey ??
        (params.req.characterId ? getCharacter(params.req.characterId)?.nameKey : undefined);
      this.bus.emit('ride/completed', {
        requestId: params.req.requestId,
        receipt: tripReceipt,
        ...(params.crashed !== undefined ? { crashed: params.crashed } : {}),
        ...(params.req.characterId !== undefined
          ? { passengerCharacterId: params.req.characterId }
          : {}),
        ...(passengerNameKey !== undefined ? { passengerNameKey } : {}),
        ...(district !== undefined ? { district } : {}),
        ...(pickupDistrict !== undefined ? { pickupDistrict } : {}),
        ...(destinationDistrict !== undefined ? { destinationDistrict } : {}),
        ...(zoneTagSet.size > 0 ? { zoneTags: Array.from(zoneTagSet) } : {}),
        ...(weather !== undefined ? { weather } : {}),
        ...(this.clock ? { minute: this.clock.minutes } : {}),
      });
    }

    this.go('settle'); // enters 'Completed'
    this.clearActive();
    this.settleToIdle();
    return tripReceipt;
  }

  /** Completes an interactive fare dispute while paused in `Completing`. */
  resolveDispute(choice: DisputeResolutionKind): TripReceipt | null {
    const dispute = this.pendingDispute;
    const req = this.activeRequest;
    if (!dispute || !req || this.trip.state !== 'Completing') return null;
    this.pendingDispute = null;

    let finalFare: number;
    let bonus = 0;
    let effectiveRating = dispute.rating;
    const consequences = [...dispute.consequences];

    if (choice === 'acceptPartial') {
      finalFare = dispute.partialFare;
      consequences.push('trip.consequence.disputeAcceptedPartial');
      this.reputation?.applyMeter('publicReputation', 1, 'karma.dispute_settled');
    } else if (choice === 'insistFull') {
      const trust = this.reputation?.getMeters().publicReputation ?? 50;
      const winChance = clamp(0.35 + (trust - 50) * 0.005, 0.2, 0.8);
      const roll = new SeededRng(hashSeed(req.requestId, 'disputeInsist')).next();
      if (roll < winChance) {
        finalFare = dispute.fare;
        consequences.push('trip.consequence.disputeRecoveredFull');
      } else {
        finalFare = 0;
        effectiveRating = Math.max(1, Math.round((dispute.rating - 1.0) * 100) / 100);
        consequences.push('trip.consequence.disputeEscalated');
        this.reputation?.applyMeter('publicReputation', -2, 'karma.dispute_escalated');
      }
    } else {
      finalFare = dispute.partialFare;
      bonus =
        dispute.bookingType === 'app'
          ? Math.max(0, dispute.fare - dispute.partialFare)
          : Math.round((dispute.fare - dispute.partialFare) * 0.5);
      consequences.push('trip.consequence.disputeReported');
    }

    const tripReceipt = this.finalizeTrip({
      req,
      fare: finalFare,
      tip: 0,
      bonus,
      rating: effectiveRating,
      crashed: dispute.crashed,
      fuelLiters: dispute.fuelLiters,
      day: dispute.day,
      minute: dispute.minute,
      consequences,
    });

    this.bus.emit('ride/disputeResolved', {
      requestId: req.requestId,
      choice,
      fare: finalFare,
    });

    return tripReceipt;
  }

  private tickWaitCountdown(dt: number): boolean {
    const wait = this.activeWait;
    if (!wait || !this.activeRequest) return false;
    const prevMin = wait.remainingGameMin;
    wait.remainingSimSec = Math.max(0, wait.remainingSimSec - dt);
    const ratio = wait.totalSimSec > 0 ? wait.remainingSimSec / wait.totalSimSec : 0;
    wait.remainingGameMin = wait.totalGameMin * ratio;
    const deltaMin = prevMin - wait.remainingGameMin;
    if (deltaMin > 0) {
      this.advanceClockMin?.(deltaMin);
    }
    return wait.remainingSimSec <= 0;
  }

  private completePickupBoarding(): void {
    const req = this.activeRequest;
    if (!req || this.trip.state !== 'EnRouteToPickup') return;
    this.go('arrivePickup');
    this.bus.emit('ride/arrivedPickup', {
      requestId: req.requestId,
    });
    this.go('startTrip');
    const firstTarget = this.routeTargetId() ?? req.destinationNodeId;
    this.currentRoute = this.roadNetwork.route(
      req.pickupNodeId,
      firstTarget,
      this.routeOpts('motorcycle')
    );
    this.offRouteSince = -1;
    const ctx = this.resolveDialogueContext(req);
    this.reputation?.startTrip({
      requestId: req.requestId,
      bookingType: req.bookingType,
      isCareful: ctx.archetype === 'careful',
      isUrgent:
        req.specialCircumstance === 'urgent' ||
        ctx.archetype === 'urgent' ||
        req.requestedArrivalTime !== null,
    });
    this.emitRideDialogue(req, 'greeting');
    this.bus.emit('ride/started', {
      requestId: req.requestId,
    });
  }

  private settleArrival(req: RideRequest): void {
    if (req.requestedArrivalTime !== null && this.clock) {
      let lateMin = this.clock.minutes - req.requestedArrivalTime;
      if (lateMin < -720) lateMin += 1440;
      if (lateMin > 0) this.reputation?.recordLateness(lateMin);
    }

    const crashed = this.reputation?.getActiveTrip()?.crashed ?? false;
    const rating = this.reputation?.getActiveTripRating() ?? 5;
    const spec = { model: this.activeBikeId, engineTune: this.hasEngineTune };
    const fuelLiters = this.tripFuelLiters?.() ?? fuelUsed(req.estimatedDistance, 0, spec);
    const offApp = req.bookingType === 'offApp'
      ? offAppPayout(
          req.initialFare,
          this.paymentReliabilityOf?.(req) ?? 1,
          new SeededRng(hashSeed(req.requestId, 'offAppPay')).next()
        )
      : null;
    const paidFare = offApp ? offApp.paid : req.initialFare;
    const archetype = this.archetypeOf?.(req);
    const disputed =
      paidFare > 0 &&
      archetype !== undefined &&
      isDisputed(
        archetype,
        this.paymentReliabilityOf?.(req) ?? 1,
        new SeededRng(hashSeed(req.requestId, 'dispute')).next()
      );
    const baseConsequences = [
      ...(offApp?.unpaid ? ['trip.consequence.offAppUnpaid'] : []),
      ...(disputed ? ['trip.consequence.disputed'] : []),
    ];

    if (disputed) {
      this.outcome = 'disputed';
      const partialFare = settledFare(paidFare, true);
      this.pendingDispute = {
        requestId: req.requestId,
        fare: paidFare,
        partialFare,
        paidFare,
        bookingType: req.bookingType,
        fuelLiters,
        rating,
        crashed,
        day: this.clock?.day ?? 1,
        minute: this.clock?.minutes ?? 0,
        consequences: baseConsequences,
        unpaid: Boolean(offApp?.unpaid),
      };
      this.bus.emit('ride/disputed', {
        requestId: req.requestId,
        fare: paidFare,
        partialFare,
        bookingType: req.bookingType,
      });
      return;
    }

    this.finalizeTrip({
      req,
      fare: paidFare,
      tip: offApp?.unpaid ? 0 : tipAmountFor(req.requestId, paidFare, rating),
      rating,
      crashed,
      fuelLiters,
      day: this.clock?.day ?? 1,
      minute: this.clock?.minutes ?? 0,
      consequences: baseConsequences,
    });
  }

  update(
    bikePose: { x: number; z: number; speed: number; heading?: number },
    dt: number
  ): void {
    this.simTimeSec += dt;
    this.pose.x = bikePose.x;
    this.pose.z = bikePose.z;
    this.pose.heading = bikePose.heading ?? this.pose.heading;
    this.lastSpeed = bikePose.speed;
    this.hasPose = true;
    this.expireStaleOffers();
    this.settleToIdle();
    if (!this.activeRequest) {
      return;
    }

    if (this.trip.state === 'Accepted') {
      this.go('headToPickup');
    }

    const state = this.trip.state;

    if (state === 'EnRouteToPickup') {
      if (this.activeWait && this.activeWait.kind === 'pickupWait') {
        if (this.tickWaitCountdown(dt)) {
          this.resumePickupBoarding();
        }
        return;
      }
      if (this.pickupHold) {
        return;
      }
      const pickupNode = this.roadNetwork.getNode(
        this.activeRequest.pickupNodeId
      );
      if (pickupNode) {
        const dist = distance2d(
          bikePose.x,
          bikePose.z,
          pickupNode.x,
          pickupNode.z
        );
        if (dist <= 8.0 && bikePose.speed < 2.0) {
          const chance = this.noShowChance(this.activeRequest);
          if (this.rng && chance > 0 && this.rng.chance(chance)) {
            const requestId = this.activeRequest.requestId;
            this.go('noShow');
            this.clearActive();
            this.bus.emit('ride/cancelled', { requestId, by: 'passenger', reason: 'noShow' });
            return;
          }
          if (
            this.onPickupArrival &&
            this.pickupArrivalEvaluatedForRequestId !== this.activeRequest.requestId
          ) {
            this.pickupArrivalEvaluatedForRequestId = this.activeRequest.requestId;
            const decision = this.onPickupArrival(this.activeRequest, bikePose);
            if (decision === 'hold') {
              this.pickupHold = true;
              return;
            }
          }
          this.completePickupBoarding();
        }
      }
    } else if (state === 'EnRouteToDestination') {
      if (this.activeWait && this.activeWait.kind === 'stopErrand') {
        if (this.tickWaitCountdown(dt)) {
          const completedStop = this.intermediateStop;
          this.activeWait = null;
          this.intermediateStop = null;
          const fromNode =
            completedStop?.nodeId ??
            this.nearestNodeId() ??
            this.activeRequest.pickupNodeId;
          this.currentRoute = this.roadNetwork.route(
            fromNode,
            this.activeRequest.destinationNodeId,
            this.routeOpts('motorcycle')
          );
          this.offRouteSince = -1;
          if (completedStop) {
            this.bus.emit('ride/stopCompleted', {
              requestId: this.activeRequest.requestId,
              nodeId: completedStop.nodeId,
              placeKey: completedStop.placeKey,
            });
          }
          this.bus.emit('ride/waitUpdated', {
            requestId: this.activeRequest.requestId,
            active: false,
          });
        }
        return;
      }

      if (this.intermediateStop && !this.intermediateStop.arrived) {
        const stopNode = this.roadNetwork.getNode(this.intermediateStop.nodeId);
        if (stopNode) {
          const stopDist = distance2d(bikePose.x, bikePose.z, stopNode.x, stopNode.z);
          if (stopDist <= 8.0 && bikePose.speed < 2.0) {
            this.intermediateStop.arrived = true;
            const totalGameMin = Math.max(1, this.intermediateStop.waitGameMin);
            const totalSimSec = clamp(3 + totalGameMin * 0.7, 4, 8);
            this.activeWait = {
              kind: 'stopErrand',
              labelKey: 'hud.wait.stop_errand',
              placeKey: this.intermediateStop.placeKey,
              totalSimSec,
              remainingSimSec: totalSimSec,
              totalGameMin,
              remainingGameMin: totalGameMin,
              canCancel: true,
            };
            this.bus.emit('ride/stopArrived', {
              requestId: this.activeRequest.requestId,
              nodeId: this.intermediateStop.nodeId,
              placeKey: this.intermediateStop.placeKey,
            });
            this.bus.emit('ride/waitUpdated', {
              requestId: this.activeRequest.requestId,
              active: true,
              kind: 'stopErrand',
              remainingGameMin: totalGameMin,
            });
          }
        }
        return;
      }

      this.rideElapsedSec += dt;
      if (!this.smallTalkTriggered && this.rideElapsedSec >= 4.0) {
        this.smallTalkTriggered = true;
        this.emitRideDialogue(this.activeRequest, 'small_talk');
      }
      const destNode = this.roadNetwork.getNode(
        this.activeRequest.destinationNodeId
      );
      if (destNode) {
        const dist = distance2d(
          bikePose.x,
          bikePose.z,
          destNode.x,
          destNode.z
        );
        if (dist <= 8.0 && bikePose.speed < 2.0) {
          const req = this.activeRequest;
          this.go('arriveDestination'); // enters 'Completing'
          this.currentRoute = null;

          if (
            this.onDropoffArrival &&
            this.dropoffArrivalEvaluatedForRequestId !== req.requestId
          ) {
            this.dropoffArrivalEvaluatedForRequestId = req.requestId;
            const decision = this.onDropoffArrival(req, bikePose);
            if (decision === 'hold') {
              this.dropoffHold = true;
              return;
            }
          }

          this.settleArrival(req);
        }
      }
    } else if (state === 'Completing') {
      if (this.activeWait && this.tickWaitCountdown(dt)) {
        this.resumeDropoffSettlement();
      }
    }
  }
}
