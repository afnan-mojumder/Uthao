import {
  createTripFsm,
  isTerminalTripState,
  legacyStatusOf,
  type TripEvent,
} from './tripFsm';
import type { RoadNetwork } from '../road/RoadNetwork';
import type { EventBus, GameEvents } from '../../core/events';
import type {
  RideRequest,
  BikeId,
  TripOutcome,
  TripState,
} from '../../core/types';
import { distance2d, clamp } from '../../core/math';
import { distanceToRoute } from '../road/navigation';
import { fairFare } from '../negotiation/fare';
import type { Fsm } from '../../core/fsm';
import type { Route, PickupOptionsResult } from '../road/routing';
import type { Rng } from '../../core/rng';
import { BALANCE } from '../../config/balance';
import { receipt, fuelUsed } from '../economy/fuel';
import { offAppPayout, isDisputed } from '../economy/offApp';
import { Rng as SeededRng, hashSeed } from '../../core/rng';
import type { EconomyManager } from '../economy/EconomyManager';
import type { ReputationSystem } from '../reputation/ReputationSystem';
import { defaultDialogueManager } from '../dialogue/DialogueManager';
import { getCharacter } from '../passenger/PassengerAI';

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
}

export class RideManager {
  readonly roadNetwork: RoadNetwork;
  readonly bus: EventBus<GameEvents>;

  private offeredRequests: Map<string, RideRequest> = new Map();
  private activeRequest: RideRequest | null = null;
  private readonly trip: Fsm<TripState, TripEvent> = createTripFsm();
  private outcome: TripOutcome | null = null;
  private interruptedFrom: TripState | null = null;
  private readonly rng?: Rng;
  private readonly paymentReliabilityOf?: (req: RideRequest) => number | undefined;
  private readonly archetypeOf?: (req: RideRequest) => string | undefined;
  private readonly economy?: EconomyManager;
  private readonly reputation?: ReputationSystem;
  private readonly clock?: { day: number; minutes: number };
  private readonly tripFuelLiters?: () => number;
  private readonly appStatusProvider?: () => 'ok' | 'phoneDead' | 'suspended';
  // T8.4 live-navigation state. Scratch values only: nothing here allocates per step.
  private readonly pose = { x: 0, z: 0, heading: 0 };
  private hasPose = false;
  private simTimeSec = 0;
  private offRouteSince = -1;
  private passengerMood = 1;
  private noticeKey: string | null = null;
  private noticeUntil = 0;
  currentRoute: Route | null = null;
  offAppStrikes: number = 0;
  appSuspendedUntilDay: number = 0;
  readonly directContacts: Set<string> = new Set();
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
    this.economy = opts.economy;
    this.reputation = opts.reputation;
    this.clock = opts.clock;
    this.tripFuelLiters = opts.tripFuelLiters;
    this.appStatusProvider = opts.appStatus;
    this.bus.on('bike/swapped', ({ bikeId }) => {
      this.activeBikeId = bikeId;
    });
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

  /** A short-lived objective key explaining why the last ride ended (e.g. no route). */
  getNoticeKey(): string | null {
    return this.noticeKey !== null && this.simTimeSec < this.noticeUntil ? this.noticeKey : null;
  }

  getOfferedRequests(): RideRequest[] {
    return Array.from(this.offeredRequests.values());
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
    this.currentRoute = null;
    this.interruptedFrom = null;
    this.rideElapsedSec = 0;
    this.smallTalkTriggered = false;
    this.offRouteSince = -1;
  }

  /** Node nearest the last known bike pose, or null before the first `update`. */
  private nearestNodeId(): string | null {
    if (!this.hasPose) return null;
    return this.roadNetwork.nearestNode(this.pose.x, this.pose.z)?.nodeId ?? null;
  }

  /** Where the current route is heading: the pickup until the passenger is aboard. */
  private routeTargetId(): string | null {
    const req = this.activeRequest;
    if (!req) return null;
    const s = this.trip.state === 'EmergencyInterrupted' ? this.interruptedFrom : this.trip.state;
    return s === 'Negotiating' || s === 'Accepted' || s === 'EnRouteToPickup'
      ? req.pickupNodeId
      : req.destinationNodeId;
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
    this.offeredRequests.set(request.requestId, { ...request });
    this.settleToIdle();
    this.bus.emit('ride/requested', { request });
  }

  /** Accepts an offered request: opens negotiation and, when negotiation is not
   * enabled (M1 auto-accept), agrees the listed fare straight away. */
  accept(requestId: string, startNodeId?: string): boolean {
    if (!this.openNegotiation(requestId, startNodeId)) return false;
    if (!this.enableNegotiation && this.activeRequest) {
      this.doAgree(this.activeRequest.initialFare);
    }
    return true;
  }

  /** T8.1: negotiation comes before pickup. Takes an offered request and moves
   * the trip to `Negotiating`; `agreeFare` or a walk-away ends it. */
  openNegotiation(requestId: string, startNodeId?: string): boolean {
    this.settleToIdle();
    const req = this.offeredRequests.get(requestId);
    if (!req || this.trip.state !== 'RequestAvailable') return false;

    this.offeredRequests.delete(requestId);
    this.activeRequest = { ...req };
    this.go('open');
    this.passengerMood = 1;
    this.offRouteSince = -1;
    // Ride to the pickup first from where the bike is; the trip route follows at pickup.
    // Without a known position (bare tests) fall back to the trip route itself.
    const from = startNodeId ?? this.nearestNodeId();
    this.currentRoute = from
      ? this.roadNetwork.route(from, req.pickupNodeId, { mode: 'motorcycle' })
      : this.roadNetwork.route(req.pickupNodeId, req.destinationNodeId, { mode: 'motorcycle' });
    this.bus.emit('ride/accepted', { requestId });
    if (this.enableNegotiation) {
      this.bus.emit('negotiation/started', { requestId, initialFare: req.initialFare });
    }
    return true;
  }

  private doAgree(fare: number): void {
    if (!this.activeRequest || this.trip.state !== 'Negotiating') return;
    this.activeRequest.initialFare = fare;
    this.go('agree');
  }

  /** T8.1: the player and passenger agreed a fare; the rider now heads to pickup. */
  agreeFare(fare: number): void {
    if (!this.activeRequest || this.trip.state !== 'Negotiating') return;
    this.doAgree(fare);
    this.bus.emit('negotiation/result', {
      requestId: this.activeRequest.requestId,
      outcome: { kind: 'accepted', fare },
    });
  }

  /** @deprecated T8.1: use `agreeFare` (negotiation now precedes pickup). Removed in T12.5. */
  completeNegotiation(finalFare: number): void {
    this.agreeFare(finalFare);
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
    options?: { maxWalkM?: number }
  ): PickupOptionsResult | null {
    return this.roadNetwork.pickupOptions(req, riderPos, options);
  }

  /** A segment on the current route is blocked: route around it from where the bike
   * is, or fail the ride clearly when nothing is left. */
  rerouteIfBlocked(blockedSegmentId: string, currentNodeId?: string): Route | null {
    const target = this.routeTargetId();
    if (!this.activeRequest || !this.currentRoute || !target) return null;
    if (!this.currentRoute.segmentIds.includes(blockedSegmentId)) return null;

    const fromNode = currentNodeId ?? this.nearestNodeId() ?? this.activeRequest.pickupNodeId;
    const newRoute = this.roadNetwork.route(fromNode, target, {
      mode: 'motorcycle',
      avoid: [blockedSegmentId],
    });
    if (newRoute) {
      this.currentRoute = newRoute;
      this.offRouteSince = -1;
      return newRoute;
    }
    this.failNoRoute();
    return null;
  }

  /** True once the bike has been more than `NAV.offRouteM` from the current route for
   * `NAV.offRouteSec` of sim time (advanced by `update`). Allocation-free. */
  isOffRoute(pose: { x: number; z: number }): boolean {
    const route = this.currentRoute;
    if (!route || !this.activeRequest || route.segmentIds.length === 0) {
      this.offRouteSince = -1;
      return false;
    }
    if (distanceToRoute(route, this.roadNetwork.getNodesMap(), pose.x, pose.z) <= BALANCE.NAV.offRouteM) {
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
    const fresh = from ? this.roadNetwork.route(from, target, { mode: 'motorcycle' }) : null;
    this.offRouteSince = -1;
    if (fresh) {
      this.currentRoute = fresh;
      return fresh;
    }
    this.failNoRoute();
    return null;
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
    const trueWalkM = distance2d(oldNode.x, oldNode.z, newNode.x, newNode.z);
    if (!(walkM >= 0) || Math.abs(walkM - trueWalkM) > 5 || trueWalkM > BALANCE.TRIP.maxRelocateWalkM) {
      return false;
    }
    const from = this.nearestNodeId() ?? req.pickupNodeId;
    const toPickup = this.roadNetwork.route(from, nodeId, { mode: 'motorcycle' });
    const trip = this.roadNetwork.route(nodeId, req.destinationNodeId, { mode: 'motorcycle' });
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

  addStrike(currentDay: number): { strikes: number; suspended: boolean } {
    this.offAppStrikes++;
    const suspended = this.offAppStrikes >= BALANCE.OFF_APP.strikesToSuspend;
    if (suspended) {
      this.appSuspendedUntilDay = currentDay + BALANCE.OFF_APP.suspendDays;
      this.bus.emit('story/flag', { key: 'appSuspended', value: true });
      this.bus.emit('story/flag', { key: 'appSuspendedUntilDay', value: this.appSuspendedUntilDay });
    }
    return { strikes: this.offAppStrikes, suspended };
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
    return currentDay < this.appSuspendedUntilDay;
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
        this.outcome = by === 'passenger' ? 'passengerCancelled' : by === 'rider' ? 'riderCancelled' : null;
      }
      this.clearActive();
    } else if (this.offeredRequests.delete(requestId)) {
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

  update(
    bikePose: { x: number; z: number; speed: number; heading?: number },
    dt: number
  ): void {
    this.simTimeSec += dt;
    this.pose.x = bikePose.x;
    this.pose.z = bikePose.z;
    this.pose.heading = bikePose.heading ?? this.pose.heading;
    this.hasPose = true;
    this.settleToIdle();
    if (!this.activeRequest) {
      return;
    }

    if (this.trip.state === 'Accepted') {
      this.go('headToPickup');
    }

    const state = this.trip.state;

    if (state === 'EnRouteToPickup') {
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
          // ponytail: one roll on arrival; a waiting window with patience is T8.x work.
          if (this.rng && chance > 0 && this.rng.chance(chance)) {
            const requestId = this.activeRequest.requestId;
            this.go('noShow');
            this.clearActive();
            this.bus.emit('ride/cancelled', { requestId, by: 'passenger', reason: 'noShow' });
            return;
          }
          this.go('arrivePickup');
          this.bus.emit('ride/arrivedPickup', {
            requestId: this.activeRequest.requestId,
          });
          this.go('startTrip');
          // Pickup done: the route now runs from here to the destination.
          this.currentRoute = this.roadNetwork.route(
            this.activeRequest.pickupNodeId,
            this.activeRequest.destinationNodeId,
            { mode: 'motorcycle' }
          );
          this.offRouteSince = -1;
          this.reputation?.startTrip({
            requestId: this.activeRequest.requestId,
            isUrgent: this.activeRequest.specialCircumstance === 'urgent',
          });
          this.bus.emit('ride/started', {
            requestId: this.activeRequest.requestId,
          });
        }
      }
    } else if (state === 'EnRouteToDestination') {
      this.rideElapsedSec += dt;
      if (!this.smallTalkTriggered && this.rideElapsedSec >= 4.0) {
        this.smallTalkTriggered = true;
        const charDef = this.activeRequest.characterId ? getCharacter(this.activeRequest.characterId) : undefined;
        const dialogue = defaultDialogueManager.getSmallTalk({
          archetype: charDef?.archetype ?? 'commuter',
          characterId: this.activeRequest.characterId,
          relationshipLevel: charDef?.initialRelationship ?? 10,
          vars: {
            destination: this.activeRequest.destinationNodeId ?? 'destination',
            fare: this.activeRequest.initialFare,
          },
        });
        if (dialogue) {
          this.bus.emit('passenger/dialogue', {
            requestId: this.activeRequest.requestId,
            key: dialogue.key,
            text: dialogue.text,
            phase: 'small_talk',
            speaker: charDef?.nameKey ?? this.activeRequest.passengerId,
          });
        }
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
          // Arrived at destination
          const req = this.activeRequest;
          // MASTER §15 completion order: clear nav target -> settle -> reputation
          // (ReputationSystem's ride/completed listener records receipt.rating) ->
          // dropped off -> ride/completed -> Completed.
          this.go('arriveDestination'); // enters 'Completing'
          this.currentRoute = null;

          const rating = this.reputation?.getActiveTripRating() ?? 5;
          const spec = { model: this.activeBikeId, engineTune: this.hasEngineTune };
          const fuelLiters = this.tripFuelLiters?.() ?? fuelUsed(req.estimatedDistance, 0, spec);
          // T8.6: an off-app fare can go unpaid. The roll is seeded by the request, so it replays.
          const offApp = req.bookingType === 'offApp'
            ? offAppPayout(
                req.initialFare,
                this.paymentReliabilityOf?.(req) ?? 1,
                new SeededRng(hashSeed(req.requestId, 'offAppPay')).next()
              )
            : null;
          // T8.6: an unreliable passenger may contest the ride; it settles as Disputed.
          const archetype = this.archetypeOf?.(req);
          const disputed = archetype !== undefined && isDisputed(
            archetype,
            this.paymentReliabilityOf?.(req) ?? 1,
            new SeededRng(hashSeed(req.requestId, 'dispute')).next()
          );
          if (disputed) this.outcome = 'disputed';
          const tripReceipt = this.economy
            ? this.economy.settleTrip({
                requestId: req.requestId,
                fare: offApp ? offApp.paid : req.initialFare,
                tip: 0,
                bonus: 0,
                bookingType: req.bookingType,
                fuelLiters,
                otherCosts: 0,
                penalties: 0,
                compensation: 0,
                durationMin: req.estimatedDuration,
                distanceKm: req.estimatedDistance,
                rating,
                day: this.clock?.day ?? 1,
                minute: this.clock?.minutes ?? 0,
                consequences: [
                  ...(offApp?.unpaid ? ['trip.consequence.offAppUnpaid'] : []),
                  ...(disputed ? ['trip.consequence.disputed'] : []),
                ],
              })
            : receipt({
                requestId: req.requestId,
                fare: req.initialFare,
                bookingType: req.bookingType,
                durationMin: req.estimatedDuration,
                distanceKm: req.estimatedDistance,
                rating,
                fuelLiters,
              });

          const charDef = this.activeRequest.characterId ? getCharacter(this.activeRequest.characterId) : undefined;
          const dropOffDialogue = defaultDialogueManager.getDropOff({
            archetype: charDef?.archetype ?? 'commuter',
            characterId: this.activeRequest.characterId,
            relationshipLevel: charDef?.initialRelationship ?? 10,
            vars: {
              fare: this.activeRequest.initialFare,
              destination: this.activeRequest.destinationNodeId ?? 'destination',
            },
          });
          if (dropOffDialogue) {
            this.bus.emit('passenger/dialogue', {
              requestId: this.activeRequest.requestId,
              key: dropOffDialogue.key,
              text: dropOffDialogue.text,
              phase: 'drop_off',
              speaker: charDef?.nameKey ?? this.activeRequest.passengerId,
            });
          }

          // null: already settled (e.g. the tutorial settled it); never pay or announce twice.
          if (tripReceipt) {
            this.bus.emit('ride/completed', {
              requestId: req.requestId,
              receipt: tripReceipt,
            });
          }

          this.go('settle'); // enters 'Completed'
          this.clearActive();
          this.settleToIdle();
        }
      }
    }
  }
}
