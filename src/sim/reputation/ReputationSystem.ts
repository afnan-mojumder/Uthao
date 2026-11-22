import type { EventBus, GameEvents } from '../../core/events';
import type {
  BikeCollisionSeverity,
  BookingType,
  CharacterDef,
  KarmaEvent,
  MeterId,
  ReputationDelta,
  SafetyRecord,
} from '../../core/types';
import { clamp } from '../../core/math';
import { BALANCE } from '../../config/balance';
import charactersRaw from '../../../data/characters.json';

export type { MeterId, KarmaEvent };

const CHARACTER_DEFS = charactersRaw as readonly CharacterDef[];

function createDefaultMeters(): Record<MeterId, number> {
  return { ...BALANCE.KARMA.starts };
}

function normalizePassengerTrustId(passengerId: string): string {
  return passengerId.startsWith('pass_char_') ? passengerId.slice(5) : passengerId;
}

const VALID_METERS = new Set<MeterId>([
  'riderIntegrity',
  'publicReputation',
  'platformStanding',
  'criminalExposure',
  'evidenceExposure',
  'safetyRecord',
]);

function isMeterId(val: string): val is MeterId {
  return VALID_METERS.has(val as MeterId);
}

export interface TripRatingParams {
  baseRating?: number;
  crashed?: boolean;
  bumps?: number;
  nearMisses?: number;
  isCareful?: boolean;
  minutesLate?: number;
  isUrgent?: boolean;
  helpfulChoices?: number;
}

/**
 * Pure trip rating calculator implementing GDD §6:
 * Base 5★; −0.5 per 5 game-min late (urgent only);
 * −0.3 per near-miss (×2 careful); −1 per bump; crash → 1★;
 * +0.3 helpful choice. Clamped to [1.0, 5.0].
 */
export function computeTripRating(params: TripRatingParams): number {
  if (params.crashed) {
    return BALANCE.RATING.crashRating;
  }

  let rating = params.baseRating ?? BALANCE.RATING.start;

  // Lateness: −0.5 per 5 game-min late (urgent only)
  if (params.isUrgent && params.minutesLate && params.minutesLate > 0) {
    const latePenalty =
      (params.minutesLate / 5) * BALANCE.RATING.latePenaltyPer5Min;
    rating -= latePenalty;
  }

  // Near-misses: −0.3 per near-miss (×2 careful)
  const nearMissMult = params.isCareful
    ? BALANCE.RATING.carefulNearMissMult
    : 1.0;
  const nearMissPenalty = BALANCE.RATING.nearMissPenalty * nearMissMult;
  rating -= Math.max(0, params.nearMisses ?? 0) * nearMissPenalty;

  // Bumps: −1 per bump
  rating -= Math.max(0, params.bumps ?? 0) * BALANCE.RATING.bumpPenalty;

  // Helpful choice: +0.3
  rating +=
    Math.max(0, params.helpfulChoices ?? 0) * BALANCE.RATING.helpfulChoiceBonus;

  const clamped = clamp(rating, 1.0, 5.0);
  return Math.round(clamped * 100) / 100;
}

/**
 * Tip probability helper per GDD §6:
 * chance = 0.1 + 0.3 * (rating - 4) clamped to [0, 1]
 */
export function computeTipChance(rating: number): number {
  return clamp(
    BALANCE.TIP.baseChance + BALANCE.TIP.ratingSlope * (rating - 4.0),
    0,
    1
  );
}

export interface ActiveTripState {
  requestId: string;
  bookingType: BookingType;
  isCareful: boolean;
  isUrgent: boolean;
  nearMisses: number;
  bumps: number;
  crashed: boolean;
  helpfulChoices: number;
  minutesLate: number;
}

export interface ReputationSnapshot {
  rating: number;
  ratingsHistory: number[];
  localTrust: number;
  safetyRecord: SafetyRecord;
  riskScore: number;
  promises: { kept: number; broken: number };
  meters: Record<MeterId, number>;
  karmaLog: KarmaEvent[];
  passengerTrust: Record<string, number>;
  offAppStrikes: number;
  suspendedUntilDay: number;
  wasWarned: boolean;
  wasSuspended: boolean;
  ratingSuspensionCleared: boolean;
  karmaSeq: number;
}

export interface ReputationSystemOptions {
  bus?: EventBus<GameEvents>;
  clock?: { day: number; minutes: number };
  initialRating?: number;
  initialRatingsHistory?: number[];
  initialLocalTrust?: number;
  initialMeters?: Partial<Record<MeterId, number>>;
  initialRelationships?: Record<string, number>;
  initialPassengerTrust?: Record<string, number>;
  initialSafetyRecord?: Partial<SafetyRecord>;
  initialRiskScore?: number;
  initialPromisesKept?: number;
  initialPromisesBroken?: number;
  windowSize?: number;
}

/**
 * ReputationSystem (T4.2 + T13.1/P4.3)
 * Sole writer for app rating (rolling 50), 6 bounded [0..100] karma meters,
 * 200-entry karma ring buffer, per-passenger trust [0..100], per-character
 * relationships [-100..100], safetyRecord, riskScore, off-app strikes/suspension,
 * and promises kept/broken.
 */
export class ReputationSystem {
  readonly bus?: EventBus<GameEvents>;
  readonly windowSize: number;
  private readonly clock?: { day: number; minutes: number };

  private ratings: number[] = [];
  private defaultRating: number;
  private meters: Record<MeterId, number> = createDefaultMeters();
  private karmaLog: KarmaEvent[] = [];
  private karmaSeq: number = 0;
  private characterRelationships: Record<string, number> = {};
  private passengerTrust: Record<string, number> = {};
  private safetyRecord: SafetyRecord = {
    nearMisses: 0,
    bumps: 0,
    crashes: 0,
    infractions: 0,
  };
  private riskScore: number = 0;
  private promisesKept: number = 0;
  private promisesBroken: number = 0;

  private offAppStrikes: number = 0;
  private suspendedUntilDay: number = 0;
  private wasWarned: boolean = false;
  private wasSuspended: boolean = false;
  private ratingSuspensionCleared: boolean = false;

  private activeTrip: ActiveTripState | null = null;
  private selfEmittedDelta: ReputationDelta | null = null;
  private suppressRelationshipEmit: boolean = false;
  private unsubscribeFns: Array<() => void> = [];

  constructor(opts: ReputationSystemOptions = {}) {
    this.bus = opts.bus;
    this.clock = opts.clock;
    this.windowSize = opts.windowSize ?? BALANCE.RATING.rollingWindow;
    this.defaultRating = opts.initialRating ?? BALANCE.RATING.start;

    if (opts.initialRatingsHistory && opts.initialRatingsHistory.length > 0) {
      this.ratings = opts.initialRatingsHistory
        .slice(-this.windowSize)
        .map((r) => clamp(r, 1.0, 5.0));
    }

    if (opts.initialLocalTrust !== undefined) {
      this.meters.publicReputation = clamp(
        opts.initialLocalTrust,
        BALANCE.KARMA.min,
        BALANCE.KARMA.max
      );
    }

    if (opts.initialMeters) {
      for (const [k, v] of Object.entries(opts.initialMeters)) {
        if (isMeterId(k) && typeof v === 'number' && Number.isFinite(v)) {
          this.meters[k] = clamp(v, BALANCE.KARMA.min, BALANCE.KARMA.max);
        }
      }
    }

    if (opts.initialRelationships) {
      // T7.5 / P4.3 Ruling 6: hold the caller's object (GameManager passes
      // `story.characterRelationships`) so there is only a single store in memory
      // and ReputationSystem is its sole writer.
      this.characterRelationships = opts.initialRelationships;
      if (Object.keys(this.characterRelationships).length === 0) {
        this.seedRelationshipDefaults();
      } else {
        for (const charId of Object.keys(this.characterRelationships)) {
          this.characterRelationships[charId] = clamp(
            this.characterRelationships[charId] ?? 0,
            BALANCE.TRUST.relationshipMin,
            BALANCE.TRUST.relationshipMax
          );
        }
      }
    } else {
      this.seedRelationshipDefaults();
    }

    this.seedPassengerTrustDefaults();
    if (opts.initialPassengerTrust) {
      for (const [k, v] of Object.entries(opts.initialPassengerTrust)) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          this.passengerTrust[normalizePassengerTrustId(k)] = clamp(
            v,
            BALANCE.KARMA.min,
            BALANCE.KARMA.max
          );
        }
      }
    }

    if (opts.initialSafetyRecord) {
      this.safetyRecord = {
        nearMisses: opts.initialSafetyRecord.nearMisses ?? 0,
        bumps: opts.initialSafetyRecord.bumps ?? 0,
        crashes: opts.initialSafetyRecord.crashes ?? 0,
        infractions: opts.initialSafetyRecord.infractions ?? 0,
      };
    }

    this.riskScore = Math.max(0, opts.initialRiskScore ?? 0);
    this.promisesKept = Math.max(0, opts.initialPromisesKept ?? 0);
    this.promisesBroken = Math.max(0, opts.initialPromisesBroken ?? 0);

    if (this.bus) {
      this.setupEventListeners(this.bus);
    }
  }

  private seedRelationshipDefaults(): void {
    for (const k of Object.keys(this.characterRelationships)) {
      delete this.characterRelationships[k];
    }
    for (const def of CHARACTER_DEFS) {
      this.characterRelationships[def.id] = clamp(
        def.initialRelationship ?? 0,
        BALANCE.TRUST.relationshipMin,
        BALANCE.TRUST.relationshipMax
      );
    }
  }

  private seedPassengerTrustDefaults(): void {
    this.passengerTrust = {};
    for (const def of CHARACTER_DEFS) {
      if (typeof def.trustInRider === 'number' && Number.isFinite(def.trustInRider)) {
        this.passengerTrust[def.id] = clamp(
          Math.round(def.trustInRider * 100),
          BALANCE.KARMA.min,
          BALANCE.KARMA.max
        );
      }
    }
  }

  private setupEventListeners(bus: EventBus<GameEvents>): void {
    this.unsubscribeFns.push(
      bus.on('bike/nearMiss', () => {
        this.recordNearMiss();
      })
    );

    this.unsubscribeFns.push(
      bus.on('bike/collision', ({ severity }) => {
        this.recordCollision(severity);
      })
    );

    this.unsubscribeFns.push(
      bus.on('bike/infraction', () => {
        this.recordInfraction();
      })
    );

    this.unsubscribeFns.push(
      bus.on('day/started', ({ day }) => {
        this.checkSuspensionExpiry(day);
      })
    );

    this.unsubscribeFns.push(
      bus.on('reputation/changed', ({ delta }) => {
        if (delta === this.selfEmittedDelta) return;
        if (delta.localTrust !== undefined) {
          this.applyMeter('publicReputation', delta.localTrust, 'karma.local_trust');
        }
        if (delta.relationship) {
          const prev = this.suppressRelationshipEmit;
          this.suppressRelationshipEmit = true;
          try {
            this.changeRelationship(
              delta.relationship.characterId,
              delta.relationship.delta
            );
          } finally {
            this.suppressRelationshipEmit = prev;
          }
        }
        if (delta.riskScore !== undefined) {
          this.addRiskScore(delta.riskScore);
        }
        if (delta.promisesKept !== undefined) {
          this.promisesKept += delta.promisesKept;
        }
        if (delta.promisesBroken !== undefined) {
          this.promisesBroken += delta.promisesBroken;
        }
      })
    );

    this.unsubscribeFns.push(
      bus.on('ride/completed', ({ receipt }) => {
        const isNonAppTrip =
          this.activeTrip !== null &&
          this.activeTrip.requestId === receipt.requestId &&
          (this.activeTrip.bookingType === 'street' ||
            this.activeTrip.bookingType === 'offApp');
        if (receipt.rating !== null && receipt.rating !== undefined) {
          if (!isNonAppTrip) {
            this.recordTripRating(receipt.rating);
          }
          if (
            this.activeTrip &&
            !this.activeTrip.crashed &&
            this.activeTrip.bumps === 0 &&
            this.activeTrip.nearMisses === 0 &&
            this.meters.safetyRecord < BALANCE.KARMA.max
          ) {
            this.applyMeter('safetyRecord', 2, 'karma.safe_trip', receipt.requestId);
          }
          this.activeTrip = null;
        } else if (this.activeTrip) {
          this.completeActiveTrip();
        }
      })
    );

    this.unsubscribeFns.push(
      bus.on('ride/cancelled', ({ requestId }) => {
        if (this.activeTrip && (!requestId || this.activeTrip.requestId === requestId)) {
          this.activeTrip = null;
        }
      })
    );
  }

  destroy(): void {
    for (const unsub of this.unsubscribeFns) {
      unsub();
    }
    this.unsubscribeFns = [];
  }

  // --- App Rating & Rolling Window ---

  /**
   * Current app rating: rolling average of the last 50 trips.
   * If no trips completed yet, returns default initial rating (5.0).
   */
  getAppRating(): number {
    if (this.ratings.length === 0) {
      return this.defaultRating;
    }
    const sum = this.ratings.reduce((acc, r) => acc + r, 0);
    const avg = sum / this.ratings.length;
    return Math.round(avg * 100) / 100;
  }

  getRatingsHistory(): number[] {
    return [...this.ratings];
  }

  private evaluateRatingThresholds(
    currentRating: number,
    isNegativeSample: boolean
  ): void {
    if (currentRating >= BALANCE.RATING.suspensionThreshold) {
      this.ratingSuspensionCleared = false;
    }

    // Check thresholds: below 3.5 -> warning, below 3.0 -> suspension
    if (currentRating < BALANCE.RATING.warningThreshold && !this.wasWarned) {
      this.wasWarned = true;
      this.bus?.emit('story/flag', { key: 'appWarned', value: true });
    }

    if (
      currentRating < BALANCE.RATING.suspensionThreshold &&
      !this.wasSuspended &&
      (!this.ratingSuspensionCleared || isNegativeSample)
    ) {
      this.ratingSuspensionCleared = false;
      this.triggerSuspension(this.clock?.day ?? 1);
    }
  }

  recordTripRating(rating: number): number {
    if (!Number.isFinite(rating)) {
      return this.getAppRating();
    }
    const clamped = clamp(rating, 1.0, 5.0);
    this.ratings.push(clamped);
    if (this.ratings.length > this.windowSize) {
      this.ratings.shift();
    }

    const currentRating = this.getAppRating();
    this.evaluateRatingThresholds(
      currentRating,
      clamped < BALANCE.RATING.suspensionThreshold
    );

    this.bus?.emit('reputation/changed', {
      delta: {
        rating: clamped,
      },
    });

    return currentRating;
  }

  recordCompletedTrip(params: TripRatingParams): number {
    const rating = computeTripRating(params);
    return this.recordTripRating(rating);
  }

  /**
   * T7.5: applies a one-off rating nudge (e.g. an encounter's `rating`
   * effect — a bonus/penalty, not a new completed trip) directly to the
   * same storage `getAppRating()` reads, instead of a second field that
   * GameManager's own `reputation/changed` listener (which always resyncs
   * `economy.reputation` from `getAppRating()`) would silently clobber on
   * the very next event. Replaces the latest sample in place (or
   * `defaultRating` when no trips have completed yet) rather than pushing a
   * new history entry, so the nudge isn't diluted by the rolling average.
   */
  adjustRating(delta: number): number {
    if (!Number.isFinite(delta)) {
      return this.getAppRating();
    }
    if (this.ratings.length === 0) {
      this.defaultRating = Math.round(clamp(this.defaultRating + delta, 1.0, 5.0) * 100) / 100;
    } else {
      for (let i = 0; i < this.ratings.length; i++) {
        this.ratings[i] = Math.round(clamp(this.ratings[i]! + delta, 1.0, 5.0) * 100) / 100;
      }
    }
    const currentRating = this.getAppRating();
    this.evaluateRatingThresholds(currentRating, delta < 0);
    this.bus?.emit('reputation/changed', { delta: { rating: currentRating } });
    return currentRating;
  }

  // --- Demand Impact, Strikes & 2-Day App Suspension ---

  /**
   * Request rate multiplier:
   * Low rating (< 4.0) reduces request rate (x0.7).
   */
  getRequestRateMultiplier(): number {
    if (this.getAppRating() < BALANCE.RATING.lowRatingThreshold) {
      return BALANCE.RATING.lowRatingRequestRateMult;
    }
    return 1.0;
  }

  isAppWarned(): boolean {
    return this.getAppRating() < BALANCE.RATING.warningThreshold || this.wasWarned;
  }

  isAppSuspended(currentDay?: number): boolean {
    const day = currentDay ?? this.clock?.day ?? 1;
    if (this.wasSuspended) {
      if (this.suspendedUntilDay > 0 && day >= this.suspendedUntilDay) {
        return false;
      }
      return true;
    }
    const lowRatingActive =
      !this.ratingSuspensionCleared &&
      this.getAppRating() < BALANCE.RATING.suspensionThreshold;
    const lowStanding =
      this.meters.platformStanding < BALANCE.KARMA.platformSuspensionStandingThreshold;
    return lowRatingActive || lowStanding;
  }

  getOffAppStrikes(): number {
    return this.offAppStrikes;
  }

  setOffAppStrikes(strikes: number): void {
    this.offAppStrikes = Math.max(0, strikes);
  }

  getAppSuspendedUntilDay(): number {
    return this.suspendedUntilDay;
  }

  setAppSuspendedUntilDay(day: number): void {
    this.suspendedUntilDay = Math.max(0, day);
    if (this.suspendedUntilDay > (this.clock?.day ?? 0)) {
      this.wasSuspended = true;
    } else if (this.suspendedUntilDay === 0) {
      this.wasSuspended = false;
    }
  }

  triggerSuspension(currentDay: number = this.clock?.day ?? 1): void {
    const untilDay = Math.max(this.suspendedUntilDay, currentDay + 2);
    const newlySuspended = !this.wasSuspended || untilDay !== this.suspendedUntilDay;
    this.wasSuspended = true;
    this.suspendedUntilDay = untilDay;
    if (newlySuspended) {
      this.bus?.emit('story/flag', { key: 'appSuspended', value: true });
      this.bus?.emit('story/flag', { key: 'appSuspendedUntilDay', value: untilDay });
    }
  }

  addOffAppStrike(currentDay: number = this.clock?.day ?? 1): {
    strikes: number;
    suspended: boolean;
  } {
    this.offAppStrikes += 1;
    const suspended = this.offAppStrikes >= 3;
    if (suspended) {
      this.triggerSuspension(currentDay);
    }
    return { strikes: this.offAppStrikes, suspended };
  }

  checkSuspensionExpiry(currentDay: number = this.clock?.day ?? 1): boolean {
    if (!this.wasSuspended || this.suspendedUntilDay <= 0 || currentDay < this.suspendedUntilDay) {
      return false;
    }
    this.wasSuspended = false;
    this.suspendedUntilDay = 0;
    this.offAppStrikes = 0;

    if (this.meters.platformStanding < BALANCE.KARMA.platformSuspensionStandingThreshold) {
      this.applyMeter(
        'platformStanding',
        BALANCE.KARMA.platformReinstatementStanding - this.meters.platformStanding,
        'karma.suspension_reinstated'
      );
    }

    if (this.getAppRating() < BALANCE.RATING.suspensionThreshold) {
      this.ratingSuspensionCleared = true;
    }

    this.bus?.emit('story/flag', { key: 'appSuspended', value: false });
    this.bus?.emit('story/flag', { key: 'appSuspendedUntilDay', value: 0 });
    return true;
  }

  // --- 6 Bounded Karma Meters [0..100] & Attributed 200-Entry Ring Log ---

  applyMeter(
    meter: MeterId,
    delta: number,
    reasonKey: string,
    subjectId?: string
  ): KarmaEvent | null {
    if (!Number.isFinite(delta) || delta === 0) {
      return null;
    }
    const prev = this.meters[meter];
    const next = clamp(prev + delta, BALANCE.KARMA.min, BALANCE.KARMA.max);
    const applied = next - prev;
    this.meters[meter] = next;

    this.karmaSeq += 1;
    const event: KarmaEvent = {
      id: `karma_${this.karmaSeq}`,
      day: this.clock?.day ?? 1,
      minute: this.clock?.minutes ?? 0,
      meter,
      delta,
      applied,
      reasonKey,
      ...(subjectId !== undefined ? { subjectId } : {}),
    };

    this.karmaLog.unshift(event);
    if (this.karmaLog.length > BALANCE.KARMA.logCapacity) {
      this.karmaLog.length = BALANCE.KARMA.logCapacity;
    }

    if (
      meter === 'platformStanding' &&
      next < BALANCE.KARMA.platformSuspensionStandingThreshold
    ) {
      this.triggerSuspension(this.clock?.day ?? 1);
    }

    this.bus?.emit('karma/changed', { event: { ...event } });
    return event;
  }

  getMeter(meter: MeterId): number {
    return this.meters[meter];
  }

  getMeters(): Record<MeterId, number> {
    return { ...this.meters };
  }

  /** Zero-allocation read view for hot simulation ticks. */
  getMetersView(): Readonly<Record<MeterId, number>> {
    return this.meters;
  }

  getKarmaLog(limit?: number): KarmaEvent[] {
    const slice =
      limit !== undefined
        ? this.karmaLog.slice(0, Math.max(0, limit))
        : this.karmaLog;
    return slice.map((e) => ({ ...e }));
  }

  // --- Per-Passenger Trust [0..100] ---

  getPassengerTrust(passengerId: string): number {
    const key = normalizePassengerTrustId(passengerId);
    return this.passengerTrust[key] ?? BALANCE.KARMA.defaultPassengerTrust;
  }

  setPassengerTrust(passengerId: string, val: number): void {
    if (!Number.isFinite(val)) return;
    const key = normalizePassengerTrustId(passengerId);
    this.passengerTrust[key] = clamp(val, BALANCE.KARMA.min, BALANCE.KARMA.max);
  }

  changePassengerTrust(passengerId: string, delta: number): number {
    if (!Number.isFinite(delta) || delta === 0) {
      return this.getPassengerTrust(passengerId);
    }
    const next = this.getPassengerTrust(passengerId) + delta;
    this.setPassengerTrust(passengerId, next);
    return this.getPassengerTrust(passengerId);
  }

  getAllPassengerTrust(): Record<string, number> {
    return { ...this.passengerTrust };
  }

  // --- Character Relationships [-100..100] ---

  getRelationship(characterId: string): number {
    return this.characterRelationships[characterId] ?? 0;
  }

  setRelationship(characterId: string, val: number): void {
    if (!Number.isFinite(val)) return;
    this.characterRelationships[characterId] = clamp(
      val,
      BALANCE.TRUST.relationshipMin,
      BALANCE.TRUST.relationshipMax
    );
  }

  changeRelationship(characterId: string, delta: number): number {
    const next = (this.characterRelationships[characterId] ?? 0) + delta;
    this.setRelationship(characterId, next);
    if (this.bus && !this.suppressRelationshipEmit && delta !== 0) {
      const deltaObj: ReputationDelta = { relationship: { characterId, delta } };
      const prevDelta = this.selfEmittedDelta;
      this.selfEmittedDelta = deltaObj;
      try {
        this.bus.emit('reputation/changed', { delta: deltaObj });
      } finally {
        this.selfEmittedDelta = prevDelta;
      }
    }
    return this.getRelationship(characterId);
  }

  getAllRelationships(): Record<string, number> {
    return { ...this.characterRelationships };
  }

  /** Zero-allocation read view for hot simulation ticks. */
  getRelationshipsView(): Readonly<Record<string, number>> {
    return this.characterRelationships;
  }

  // --- Safety Record ---

  getSafetyRecord(): SafetyRecord {
    return { ...this.safetyRecord };
  }

  recordNearMiss(): void {
    this.safetyRecord.nearMisses++;
    if (this.activeTrip) {
      this.activeTrip.nearMisses++;
    }
    this.applyMeter('safetyRecord', -1, 'karma.near_miss', this.activeTrip?.requestId);
  }

  recordCollision(severity: BikeCollisionSeverity): void {
    if (severity === 'bump') {
      this.safetyRecord.bumps++;
      if (this.activeTrip) {
        this.activeTrip.bumps++;
      }
      this.applyMeter('safetyRecord', -5, 'karma.collision_bump', this.activeTrip?.requestId);
    } else if (severity === 'crash') {
      this.safetyRecord.crashes++;
      if (this.activeTrip) {
        this.activeTrip.crashed = true;
      }
      this.applyMeter('safetyRecord', -15, 'karma.collision_crash', this.activeTrip?.requestId);
    }
  }

  recordInfraction(): void {
    this.safetyRecord.infractions++;
    this.applyMeter('safetyRecord', -8, 'karma.infraction', this.activeTrip?.requestId);
  }

  // --- Risk Score ---

  getRiskScore(): number {
    return this.riskScore;
  }

  addRiskScore(points: number = 1): number {
    this.riskScore += points;
    return this.riskScore;
  }

  // --- Promises Kept / Broken ---

  getPromisesRecord(): { kept: number; broken: number } {
    return {
      kept: this.promisesKept,
      broken: this.promisesBroken,
    };
  }

  recordPromiseKept(): void {
    this.promisesKept++;
  }

  recordPromiseBroken(): void {
    this.promisesBroken++;
  }

  // --- Active Trip Management ---

  startTrip(params: {
    requestId: string;
    bookingType?: BookingType;
    isCareful?: boolean;
    isUrgent?: boolean;
  }): void {
    this.activeTrip = {
      requestId: params.requestId,
      bookingType: params.bookingType ?? 'app',
      isCareful: !!params.isCareful,
      isUrgent: !!params.isUrgent,
      nearMisses: 0,
      bumps: 0,
      crashed: false,
      helpfulChoices: 0,
      minutesLate: 0,
    };
  }

  getActiveTrip(): ActiveTripState | null {
    return this.activeTrip ? { ...this.activeTrip } : null;
  }

  recordHelpfulChoice(): void {
    if (this.activeTrip) {
      this.activeTrip.helpfulChoices++;
    }
  }

  recordLateness(minutesLate: number): void {
    if (this.activeTrip) {
      this.activeTrip.minutesLate = Math.max(0, minutesLate);
    }
  }

  getActiveTripRating(): number {
    if (!this.activeTrip) {
      return BALANCE.RATING.start;
    }
    return computeTripRating(this.activeTrip);
  }

  completeActiveTrip(): number {
    const trip = this.activeTrip;
    const rating = this.getActiveTripRating();
    const isNonAppTrip =
      trip !== null &&
      (trip.bookingType === 'street' || trip.bookingType === 'offApp');
    if (!isNonAppTrip) {
      this.recordTripRating(rating);
    }
    this.activeTrip = null;
    if (
      trip &&
      !trip.crashed &&
      trip.bumps === 0 &&
      trip.nearMisses === 0 &&
      this.meters.safetyRecord < BALANCE.KARMA.max
    ) {
      this.applyMeter('safetyRecord', 2, 'karma.safe_trip', trip.requestId);
    }
    return rating;
  }

  resetCareer(): void {
    this.ratings = [];
    this.defaultRating = BALANCE.RATING.start;
    this.meters = createDefaultMeters();
    this.karmaLog = [];
    this.karmaSeq = 0;
    this.seedRelationshipDefaults();
    this.seedPassengerTrustDefaults();
    this.safetyRecord = {
      nearMisses: 0,
      bumps: 0,
      crashes: 0,
      infractions: 0,
    };
    this.riskScore = 0;
    this.promisesKept = 0;
    this.promisesBroken = 0;
    this.offAppStrikes = 0;
    this.suspendedUntilDay = 0;
    this.wasWarned = false;
    this.wasSuspended = false;
    this.ratingSuspensionCleared = false;
    this.activeTrip = null;
  }

  snapshot(): ReputationSnapshot {
    return {
      rating: this.getAppRating(),
      ratingsHistory: [...this.ratings],
      localTrust: this.meters.publicReputation,
      safetyRecord: { ...this.safetyRecord },
      riskScore: this.riskScore,
      promises: { kept: this.promisesKept, broken: this.promisesBroken },
      meters: { ...this.meters },
      karmaLog: this.karmaLog.map((e) => ({ ...e })),
      passengerTrust: { ...this.passengerTrust },
      offAppStrikes: this.offAppStrikes,
      suspendedUntilDay: this.suspendedUntilDay,
      wasWarned: this.wasWarned,
      wasSuspended: this.wasSuspended,
      ratingSuspensionCleared: this.ratingSuspensionCleared,
      karmaSeq: this.karmaSeq,
    };
  }

  applySnapshot(opts: {
    rating?: number;
    ratingsHistory?: number[];
    localTrust?: number;
    relationships?: Record<string, number>;
    safetyRecord?: Partial<SafetyRecord>;
    riskScore?: number;
    promises?: { kept?: number; broken?: number };
    meters?: Partial<Record<MeterId, number>>;
    karmaLog?: KarmaEvent[];
    passengerTrust?: Record<string, number>;
    offAppStrikes?: number;
    suspendedUntilDay?: number;
    wasWarned?: boolean;
    wasSuspended?: boolean;
    ratingSuspensionCleared?: boolean;
    karmaSeq?: number;
  }): void {
    this.defaultRating =
      opts.rating !== undefined && Number.isFinite(opts.rating)
        ? clamp(opts.rating, 1.0, 5.0)
        : BALANCE.RATING.start;
    this.ratings = opts.ratingsHistory
      ? opts.ratingsHistory
          .slice(-this.windowSize)
          .filter((r) => typeof r === 'number' && Number.isFinite(r))
          .map((r) => clamp(r, 1.0, 5.0))
      : [];

    this.meters = createDefaultMeters();
    if (opts.meters) {
      for (const [k, v] of Object.entries(opts.meters)) {
        if (isMeterId(k) && typeof v === 'number' && Number.isFinite(v)) {
          this.meters[k] = clamp(v, BALANCE.KARMA.min, BALANCE.KARMA.max);
        }
      }
    } else if (opts.localTrust !== undefined && Number.isFinite(opts.localTrust)) {
      this.meters.publicReputation = clamp(
        opts.localTrust,
        BALANCE.KARMA.min,
        BALANCE.KARMA.max
      );
    }

    this.karmaLog = opts.karmaLog
      ? opts.karmaLog.slice(0, BALANCE.KARMA.logCapacity).map((e) => ({ ...e }))
      : [];
    this.karmaSeq =
      opts.karmaSeq !== undefined && Number.isFinite(opts.karmaSeq)
        ? Math.max(0, opts.karmaSeq)
        : this.karmaLog.length;

    this.seedPassengerTrustDefaults();
    if (opts.passengerTrust) {
      for (const [k, v] of Object.entries(opts.passengerTrust)) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          this.passengerTrust[normalizePassengerTrustId(k)] = clamp(
            v,
            BALANCE.KARMA.min,
            BALANCE.KARMA.max
          );
        }
      }
    }

    const incomingRels =
      opts.relationships && opts.relationships === this.characterRelationships
        ? { ...opts.relationships }
        : opts.relationships;
    this.seedRelationshipDefaults();
    if (incomingRels) {
      for (const [k, v] of Object.entries(incomingRels)) {
        if (typeof v === 'number' && Number.isFinite(v)) {
          this.characterRelationships[k] = clamp(
            v,
            BALANCE.TRUST.relationshipMin,
            BALANCE.TRUST.relationshipMax
          );
        }
      }
    }

    this.safetyRecord = {
      nearMisses: opts.safetyRecord?.nearMisses ?? 0,
      bumps: opts.safetyRecord?.bumps ?? 0,
      crashes: opts.safetyRecord?.crashes ?? 0,
      infractions: opts.safetyRecord?.infractions ?? 0,
    };
    this.riskScore = Math.max(0, opts.riskScore ?? 0);
    this.promisesKept = Math.max(0, opts.promises?.kept ?? 0);
    this.promisesBroken = Math.max(0, opts.promises?.broken ?? 0);
    this.offAppStrikes = Math.max(0, opts.offAppStrikes ?? 0);
    this.suspendedUntilDay = Math.max(0, opts.suspendedUntilDay ?? 0);
    this.wasWarned = opts.wasWarned ?? false;
    this.wasSuspended =
      opts.wasSuspended ?? this.suspendedUntilDay > (this.clock?.day ?? 0);
    this.ratingSuspensionCleared = opts.ratingSuspensionCleared ?? false;
    this.activeTrip = null;
  }

  restoreState(opts: Parameters<ReputationSystem['applySnapshot']>[0]): void {
    this.applySnapshot(opts);
  }
}
