import type { EventBus, GameEvents } from '../../core/events';
import type { BikeCollisionSeverity, SafetyRecord } from '../../core/types';
import { clamp } from '../../core/math';
import { BALANCE } from '../../config/balance';

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
  isCareful: boolean;
  isUrgent: boolean;
  nearMisses: number;
  bumps: number;
  crashed: boolean;
  helpfulChoices: number;
  minutesLate: number;
}

export interface ReputationSystemOptions {
  bus?: EventBus<GameEvents>;
  initialRating?: number;
  initialRatingsHistory?: number[];
  initialLocalTrust?: number;
  initialRelationships?: Record<string, number>;
  initialSafetyRecord?: Partial<SafetyRecord>;
  initialRiskScore?: number;
  initialPromisesKept?: number;
  initialPromisesBroken?: number;
  windowSize?: number;
}

/**
 * ReputationSystem (T4.2)
 * Owns app rating (rolling 50), localTrust, per-character relationships,
 * safetyRecord, riskScore, and promises kept/broken.
 */
export class ReputationSystem {
  readonly bus?: EventBus<GameEvents>;
  readonly windowSize: number;

  private ratings: number[] = [];
  private defaultRating: number;
  private localTrust: number;
  private characterRelationships: Record<string, number> = {};
  private safetyRecord: SafetyRecord = {
    nearMisses: 0,
    bumps: 0,
    crashes: 0,
    infractions: 0,
  };
  private riskScore: number = 0;
  private promisesKept: number = 0;
  private promisesBroken: number = 0;

  private wasWarned: boolean = false;
  private wasSuspended: boolean = false;

  private activeTrip: ActiveTripState | null = null;
  private unsubscribeFns: Array<() => void> = [];

  constructor(opts: ReputationSystemOptions = {}) {
    this.bus = opts.bus;
    this.windowSize = opts.windowSize ?? BALANCE.RATING.rollingWindow;
    this.defaultRating = opts.initialRating ?? BALANCE.RATING.start;

    if (opts.initialRatingsHistory && opts.initialRatingsHistory.length > 0) {
      this.ratings = opts.initialRatingsHistory
        .slice(-this.windowSize)
        .map((r) => clamp(r, 1.0, 5.0));
    }

    this.localTrust = clamp(
      opts.initialLocalTrust ?? BALANCE.TRUST.localTrustStart,
      BALANCE.TRUST.localTrustMin,
      BALANCE.TRUST.localTrustMax
    );

    if (opts.initialRelationships) {
      for (const [charId, rel] of Object.entries(opts.initialRelationships)) {
        this.characterRelationships[charId] = clamp(
          rel,
          BALANCE.TRUST.relationshipMin,
          BALANCE.TRUST.relationshipMax
        );
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
      bus.on('reputation/changed', ({ delta }) => {
        if (delta.localTrust !== undefined) {
          this.changeLocalTrust(delta.localTrust);
        }
        if (delta.relationship) {
          this.changeRelationship(
            delta.relationship.characterId,
            delta.relationship.delta
          );
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
        if (receipt.rating !== null && receipt.rating !== undefined) {
          this.recordTripRating(receipt.rating);
          this.activeTrip = null;
        } else if (this.activeTrip) {
          this.completeActiveTrip();
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

  recordTripRating(rating: number): number {
    const clamped = clamp(rating, 1.0, 5.0);
    this.ratings.push(clamped);
    if (this.ratings.length > this.windowSize) {
      this.ratings.shift();
    }

    const currentRating = this.getAppRating();

    // Check thresholds: below 3.5 -> warning, below 3.0 -> suspension
    if (currentRating < BALANCE.RATING.warningThreshold && !this.wasWarned) {
      this.wasWarned = true;
      this.bus?.emit('story/flag', { key: 'appWarned', value: true });
    }

    if (
      currentRating < BALANCE.RATING.suspensionThreshold &&
      !this.wasSuspended
    ) {
      this.wasSuspended = true;
      this.bus?.emit('story/flag', { key: 'appSuspended', value: true });
    }

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

  // --- Demand Impact & Thresholds ---

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

  isAppSuspended(): boolean {
    return (
      this.getAppRating() < BALANCE.RATING.suspensionThreshold || this.wasSuspended
    );
  }

  // --- Local Trust ---

  getLocalTrust(): number {
    return this.localTrust;
  }

  setLocalTrust(val: number): void {
    this.localTrust = clamp(
      val,
      BALANCE.TRUST.localTrustMin,
      BALANCE.TRUST.localTrustMax
    );
  }

  changeLocalTrust(delta: number): number {
    this.setLocalTrust(this.localTrust + delta);
    return this.localTrust;
  }

  // --- Character Relationships ---

  getRelationship(characterId: string): number {
    return this.characterRelationships[characterId] ?? 0;
  }

  setRelationship(characterId: string, val: number): void {
    this.characterRelationships[characterId] = clamp(
      val,
      BALANCE.TRUST.relationshipMin,
      BALANCE.TRUST.relationshipMax
    );
  }

  changeRelationship(characterId: string, delta: number): number {
    const next = (this.characterRelationships[characterId] ?? 0) + delta;
    this.setRelationship(characterId, next);
    return this.getRelationship(characterId);
  }

  getAllRelationships(): Record<string, number> {
    return { ...this.characterRelationships };
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
  }

  recordCollision(severity: BikeCollisionSeverity): void {
    if (severity === 'bump') {
      this.safetyRecord.bumps++;
      if (this.activeTrip) {
        this.activeTrip.bumps++;
      }
    } else if (severity === 'crash') {
      this.safetyRecord.crashes++;
      if (this.activeTrip) {
        this.activeTrip.crashed = true;
      }
    }
  }

  recordInfraction(): void {
    this.safetyRecord.infractions++;
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
    isCareful?: boolean;
    isUrgent?: boolean;
  }): void {
    this.activeTrip = {
      requestId: params.requestId,
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
    const rating = this.getActiveTripRating();
    this.recordTripRating(rating);
    this.activeTrip = null;
    return rating;
  }
}
