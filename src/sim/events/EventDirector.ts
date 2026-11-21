import type { EncounterDef, EncounterChoiceDef } from '../schemas';
import type { EncounterInstance, EncounterChoice, RoadSegment } from '../../core/types';
import type { EncounterContext, EncounterPhase } from './conditions';
import { evaluateCondition } from './conditions';
import type { EffectContext } from './effects';
import { applyEffects } from './effects';
import { Rng } from '../../core/rng';
import type { EventBus, GameEvents } from '../../core/events';
import { TIME_SCALE } from '../../config/constants';
import {
  type CrimeOutcome,
  type FleeResult,
  type RobberyResult,
  calculateSegmentEncounterProbability,
  isSafeCh1Alley,
  sampleCrimeOutcome,
  resolveFlee,
  resolveRobbery,
} from './flee';

/** Severe encounters show a readable cue for at least 10 seconds of sim time before firing. */
export const CUE_LEAD_SIM_SECONDS = 10;
export const CUE_LEAD_GAME_MINUTES = (CUE_LEAD_SIM_SECONDS * TIME_SCALE) / 60;

export interface PendingEncounterCue {
  encounterId: string;
  cueKey: string;
  startedAtMinute: number;
  fireAtMinute: number;
}

export interface EventDirectorState {
  cooldowns: Record<string, number>;
  firedToday: string[];
  lastEvaluationMinute: number;
  hasEvaluatedOnce: boolean;
  nextGlobalEncounterMinute: number;
  rngState?: number;
  pendingM4PoliceDecision?: boolean;
}

export interface EventDirectorOptions {
  definitions?: EncounterDef[];
  seed?: number;
  pauseOnDecisions?: boolean;
  globalCooldownMin?: number;
  maxRandomPerRide?: number;
  roamingTriggerChance?: number;
  onTripTriggerChance?: number;
  suppressIdleEncounters?: boolean;
  contextProvider?: () => EncounterContext;
}

const INLINE_PROMPT_LIFETIME_SEC = 12;

export class EventDirector {
  readonly definitions: EncounterDef[];
  private rng: Rng;
  pauseOnDecisions: boolean;
  /** T7.1: ambient (roaming) encounters only fire while this is true — gated by
   * the UI from the real-game screen/tutorial state, or permanently off via `?encounters=0`. */
  enabled: boolean = true;

  activeEncounter: EncounterInstance | null = null;
  activeEncounterDef: EncounterDef | null = null;
  pendingCue: PendingEncounterCue | null = null;

  private cooldowns: Map<string, number> = new Map();
  private firedToday: Set<string> = new Set();
  private lastEvaluationMinute: number = -1;
  private hasEvaluatedOnce: boolean = false;
  private currentPhase: EncounterPhase = 'roaming';
  private readonly globalCooldownMin: number;
  private readonly maxRandomPerRide: number;
  private readonly roamingTriggerChance: number;
  private readonly onTripTriggerChance: number;
  private readonly suppressIdleEncounters: boolean;
  private nextGlobalEncounterMinute: number = 0;
  private randomEncountersThisRide: number = 0;
  private lastRideRequestId: string | null = null;
  private inlineRemainingSec: number | null = null;
  private lastContext?: EncounterContext;
  private contextProvider?: () => EncounterContext;
  private readonly eligibleScratch: EncounterDef[] = [];
  private readonly validChoicesScratch: EncounterChoiceDef[] = [];

  constructor(opts: EventDirectorOptions = {}) {
    this.definitions = opts.definitions ?? [];
    this.rng = new Rng(opts.seed ?? 42);
    this.pauseOnDecisions = opts.pauseOnDecisions ?? true;
    this.globalCooldownMin = opts.globalCooldownMin ?? 0;
    this.maxRandomPerRide = opts.maxRandomPerRide ?? Number.POSITIVE_INFINITY;
    this.roamingTriggerChance = opts.roamingTriggerChance ?? 1;
    this.onTripTriggerChance = opts.onTripTriggerChance ?? 1;
    this.suppressIdleEncounters = opts.suppressIdleEncounters ?? false;
    this.contextProvider = opts.contextProvider;
  }

  setContextProvider(provider: (() => EncounterContext) | undefined): void {
    this.contextProvider = provider;
  }

  setPauseOnDecisions(val: boolean): void {
    this.pauseOnDecisions = val;
  }

  resetDaily(): void {
    this.firedToday.clear();
    this.cooldowns.clear();
    this.nextGlobalEncounterMinute = 0;
    this.lastEvaluationMinute = -1;
    this.randomEncountersThisRide = 0;
    this.lastRideRequestId = null;
    this.inlineRemainingSec = null;
    this.pendingCue = null;
    this.activeEncounter = null;
    this.activeEncounterDef = null;
  }

  resetCareer(): void {
    this.resetDaily();
    this.hasEvaluatedOnce = false;
    this.currentPhase = 'roaming';
    this.lastContext = undefined;
  }

  setSeed(seed: number): void {
    this.rng.setState(seed);
  }

  exportState(): EventDirectorState {
    const cooldowns: Record<string, number> = {};
    for (const [k, v] of this.cooldowns.entries()) {
      cooldowns[k] = v;
    }
    return {
      cooldowns,
      firedToday: Array.from(this.firedToday),
      lastEvaluationMinute: this.lastEvaluationMinute,
      hasEvaluatedOnce: this.hasEvaluatedOnce,
      nextGlobalEncounterMinute: this.nextGlobalEncounterMinute,
      rngState: this.rng.getState(),
    };
  }

  importState(state?: EventDirectorState): void {
    this.resetCareer();
    if (!state) return;
    for (const [k, v] of Object.entries(state.cooldowns ?? {})) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        this.cooldowns.set(k, v);
      }
    }
    for (const id of state.firedToday ?? []) {
      this.firedToday.add(id);
    }
    if (typeof state.lastEvaluationMinute === 'number' && Number.isFinite(state.lastEvaluationMinute)) {
      this.lastEvaluationMinute = state.lastEvaluationMinute;
    }
    if (typeof state.hasEvaluatedOnce === 'boolean') {
      this.hasEvaluatedOnce = state.hasEvaluatedOnce;
    }
    if (
      typeof state.nextGlobalEncounterMinute === 'number' &&
      Number.isFinite(state.nextGlobalEncounterMinute)
    ) {
      this.nextGlobalEncounterMinute = state.nextGlobalEncounterMinute;
    }
    if (typeof state.rngState === 'number' && Number.isFinite(state.rngState)) {
      this.rng.setState(state.rngState);
    }
  }

  private collectValidChoices(
    def: EncounterDef,
    ctx: EncounterContext
  ): EncounterChoiceDef[] {
    this.validChoicesScratch.length = 0;
    for (let i = 0; i < def.choices.length; i++) {
      const choice = def.choices[i]!;
      if (!choice.requires || evaluateCondition(choice.requires, ctx)) {
        this.validChoicesScratch.push(choice);
      }
    }
    return this.validChoicesScratch;
  }

  private buildChoiceMeta(c: EncounterChoiceDef): EncounterChoice {
    const choice: EncounterChoice = {
      id: c.id,
      labelKey: c.labelKey,
      isMission: c.effects.some((e) => e.type === 'startMission'),
    };
    if (c.riskKey !== undefined) choice.riskKey = c.riskKey;
    if (c.costHint !== undefined) choice.costHint = c.costHint;
    if (c.kind !== undefined) choice.kind = c.kind;
    return choice;
  }

  private activateEncounter(
    def: EncounterDef,
    choices: readonly EncounterChoiceDef[],
    ctx: EncounterContext | undefined,
    bus: EventBus<GameEvents> | undefined,
    markCooldown: boolean
  ): EncounterInstance {
    if (markCooldown && ctx) {
      const effectiveGlobalCooldown = ctx.inFastForward
        ? Math.min(this.globalCooldownMin, 12)
        : this.globalCooldownMin;
      if (effectiveGlobalCooldown > 0) {
        this.nextGlobalEncounterMinute = ctx.minute + effectiveGlobalCooldown;
      }
      this.cooldowns.set(def.id, ctx.minute + def.cooldownMin);
      if (def.oncePerDay) {
        this.firedToday.add(def.id);
      }
      if (
        ctx.phase === 'atPickup' ||
        ctx.phase === 'onTrip' ||
        ctx.phase === 'dropOff'
      ) {
        this.randomEncountersThisRide += 1;
      }
    }

    const instanceChoices: EncounterChoice[] = [];
    for (let i = 0; i < choices.length; i++) {
      instanceChoices.push(this.buildChoiceMeta(choices[i]!));
    }

    const presentation = def.presentation ?? 'modal';
    const minTag = ctx ? `_${Math.floor(ctx.minute)}` : '';
    const instance: EncounterInstance = {
      id: `inst_${def.id}${minTag}_${this.rng.int(1000, 9999)}`,
      encounterId: def.id,
      lineKey: def.lineKey,
      ...(def.cueKey ? { cueKey: def.cueKey } : {}),
      presentation,
      ...(presentation === 'inline' && ctx?.nearbyAnchorPlaceKey
        ? { anchorPlaceKey: ctx.nearbyAnchorPlaceKey }
        : {}),
      choices: instanceChoices,
    };

    this.activeEncounter = instance;
    this.activeEncounterDef = def;
    this.inlineRemainingSec =
      presentation === 'inline' ? INLINE_PROMPT_LIFETIME_SEC : null;

    if (bus) {
      bus.emit('encounter/started', { instance });
    }

    return instance;
  }

  /**
   * Evaluates encounters. Called once per game minute and at phase changes.
   */
  evaluate(
    ctx: EncounterContext,
    bus?: EventBus<GameEvents>
  ): EncounterInstance | null {
    this.lastContext = ctx;

    const reqId = ctx.activeRequest?.requestId ?? null;
    if (reqId !== this.lastRideRequestId) {
      this.lastRideRequestId = reqId;
      this.randomEncountersThisRide = 0;
    }

    // Max 1 active encounter at a time
    if (this.activeEncounter !== null) {
      return null;
    }

    // Check pending severe-event cue window first (allows counterplay before firing)
    if (this.pendingCue !== null) {
      let cueDef: EncounterDef | undefined;
      for (let i = 0; i < this.definitions.length; i++) {
        if (this.definitions[i]!.id === this.pendingCue.encounterId) {
          cueDef = this.definitions[i]!;
          break;
        }
      }
      if (
        !cueDef ||
        !evaluateCondition(cueDef.trigger, ctx) ||
        this.collectValidChoices(cueDef, ctx).length === 0
      ) {
        // Player avoided the severe encounter via counterplay or context changed
        const clearedId = this.pendingCue.encounterId;
        this.pendingCue = null;
        if (bus) {
          bus.emit('encounter/cueCleared', { encounterId: clearedId });
        }
      } else if (ctx.minute >= this.pendingCue.fireAtMinute) {
        if (
          !this.pauseOnDecisions &&
          ctx.speedKmh >= 10 &&
          (ctx.inFastForward || cueDef.presentation !== 'inline')
        ) {
          return null;
        }
        const choices = this.collectValidChoices(cueDef, ctx);
        this.pendingCue = null;
        this.lastEvaluationMinute = ctx.minute;
        this.currentPhase = ctx.phase;
        return this.activateEncounter(cueDef, choices, ctx, bus, true);
      } else {
        this.lastEvaluationMinute = ctx.minute;
        this.currentPhase = ctx.phase;
        return null;
      }
    }

    const isMinuteTick =
      Math.floor(ctx.minute) !== Math.floor(this.lastEvaluationMinute);
    const isPhaseChange =
      ctx.phase !== this.currentPhase &&
      ctx.phase !== 'enRouteToPickup' &&
      ctx.phase !== 'roaming';

    if (!isMinuteTick && !isPhaseChange) {
      return null;
    }

    const effectiveGlobalCooldown = ctx.inFastForward
      ? Math.min(this.globalCooldownMin, 12)
      : this.globalCooldownMin;

    if (!this.hasEvaluatedOnce) {
      this.hasEvaluatedOnce = true;
      if (effectiveGlobalCooldown > 0 && !this.pauseOnDecisions) {
        // Avoid firing a random encounter on the very first frame of a live session.
        this.nextGlobalEncounterMinute = ctx.minute + 3;
      }
    }

    this.lastEvaluationMinute = ctx.minute;
    this.currentPhase = ctx.phase;

    if (
      effectiveGlobalCooldown > 0 &&
      ctx.minute < this.nextGlobalEncounterMinute
    ) {
      return null;
    }

    // Enforce per-ride random encounter cap while inside a live active ride
    if (
      !ctx.inFastForward &&
      (ctx.phase === 'atPickup' ||
        ctx.phase === 'onTrip' ||
        ctx.phase === 'dropOff') &&
      this.randomEncountersThisRide >= this.maxRandomPerRide
    ) {
      return null;
    }

    if (ctx.inFastForward && !this.pauseOnDecisions && ctx.speedKmh >= 10) {
      return null;
    }

    const onlyInlineAllowed =
      !ctx.inFastForward && !this.pauseOnDecisions && ctx.speedKmh >= 10;

    // Filter eligible encounters without allocating
    this.eligibleScratch.length = 0;
    let totalWeight = 0;
    let hasAnchorMatchedCandidate = false;
    let allFlagDriven = true;
    for (let i = 0; i < this.definitions.length; i++) {
      const def = this.definitions[i]!;
      if (onlyInlineAllowed && def.presentation !== 'inline') {
        continue;
      }

      const hasFlagTrigger = Boolean(
        def.trigger.flags && Object.keys(def.trigger.flags).length > 0
      );
      // Suppress idle roaming chatter at 0 m distance in live driving while still allowing flag-driven consequence events
      if (
        !ctx.inFastForward &&
        this.suppressIdleEncounters &&
        ctx.phase === 'roaming' &&
        ctx.roamDistanceM !== undefined &&
        ctx.roamDistanceM < 25 &&
        !hasFlagTrigger
      ) {
        continue;
      }

      // Cooldown check
      const readyAt = this.cooldowns.get(def.id) ?? 0;
      if (readyAt > ctx.minute) {
        continue;
      }

      // Once per day check
      if (def.oncePerDay && this.firedToday.has(def.id)) {
        continue;
      }

      // Trigger condition check
      if (!evaluateCondition(def.trigger, ctx)) {
        continue;
      }

      // Ensure at least one choice passes `requires` so we never softlock
      if (this.collectValidChoices(def, ctx).length === 0) {
        continue;
      }

      if (!hasFlagTrigger) {
        allFlagDriven = false;
      }

      if (
        (def.trigger.requiresAnchorKind &&
          def.trigger.requiresAnchorKind.length > 0 &&
          ctx.nearbyAnchorKinds &&
          ctx.nearbyAnchorKinds.length > 0) ||
        (def.trigger.requiresRoadEventKind &&
          def.trigger.requiresRoadEventKind.length > 0 &&
          ctx.nearbyRoadEventKinds &&
          ctx.nearbyRoadEventKinds.length > 0)
      ) {
        hasAnchorMatchedCandidate = true;
      }

      this.eligibleScratch.push(def);
      totalWeight += def.weight;
    }

    if (this.eligibleScratch.length === 0 || totalWeight <= 0) {
      return null;
    }

    // Probability gate: roaming & non-anchor onTrip events roll chance in live play
    if (
      !ctx.inFastForward &&
      !this.pauseOnDecisions &&
      this.definitions.length > 1 &&
      !allFlagDriven
    ) {
      if (
        ctx.phase === 'roaming' &&
        this.roamingTriggerChance < 1 &&
        this.rng.next() >= this.roamingTriggerChance
      ) {
        return null;
      }
      if (
        ctx.phase === 'onTrip' &&
        !hasAnchorMatchedCandidate &&
        this.onTripTriggerChance < 1 &&
        this.rng.next() >= this.onTripTriggerChance
      ) {
        return null;
      }
    }

    // Prefer world-anchored stop or road-event candidates when approaching matching world state
    const isWorldAnchored = (d: EncounterDef): boolean =>
      Boolean(
        (d.trigger.requiresAnchorKind && d.trigger.requiresAnchorKind.length > 0) ||
          (d.trigger.requiresRoadEventKind && d.trigger.requiresRoadEventKind.length > 0)
      );
    let selectionTotalWeight = totalWeight;
    if (hasAnchorMatchedCandidate) {
      selectionTotalWeight = 0;
      for (let i = 0; i < this.eligibleScratch.length; i++) {
        const def = this.eligibleScratch[i]!;
        if (isWorldAnchored(def)) {
          selectionTotalWeight += def.weight;
        }
      }
    }

    // Seeded weighted selection
    const roll = this.rng.next() * selectionTotalWeight;
    let sum = 0;
    let selected: EncounterDef = this.eligibleScratch[0]!;

    for (let i = 0; i < this.eligibleScratch.length; i++) {
      const def = this.eligibleScratch[i]!;
      if (hasAnchorMatchedCandidate && !isWorldAnchored(def)) {
        continue;
      }
      sum += def.weight;
      if (roll < sum) {
        selected = def;
        break;
      }
    }

    // Severe encounters with cueKey emit a readable warning >= 10s before firing
    if (selected.cueKey) {
      const fireAtMinute = ctx.minute + CUE_LEAD_GAME_MINUTES;
      this.pendingCue = {
        encounterId: selected.id,
        cueKey: selected.cueKey,
        startedAtMinute: ctx.minute,
        fireAtMinute,
      };
      if (bus) {
        bus.emit('encounter/cue', {
          encounterId: selected.id,
          cueKey: selected.cueKey,
          fireAtMinute,
        });
      }
      return null;
    }

    const choices = this.collectValidChoices(selected, ctx);
    return this.activateEncounter(selected, choices, ctx, bus, true);
  }

  /**
   * Deterministically stages an encounter's advance warning cue (`pendingCue`) when eligible,
   * so mission-critical hazards appear in 3D before the modal fires.
   */
  startCueIfEligible(
    encounterId: string,
    ctx: EncounterContext,
    bus?: EventBus<GameEvents>
  ): boolean {
    if (!this.enabled || this.activeEncounter !== null || this.pendingCue !== null) {
      return false;
    }
    const def = this.definitions.find((d) => d.id === encounterId);
    if (!def || !def.cueKey) {
      return false;
    }
    if (def.oncePerDay && this.firedToday.has(def.id)) {
      return false;
    }
    if ((this.cooldowns.get(def.id) ?? 0) > ctx.minute) {
      return false;
    }
    if (!evaluateCondition(def.trigger, ctx)) {
      return false;
    }
    if (this.collectValidChoices(def, ctx).length === 0) {
      return false;
    }

    const fireAtMinute = ctx.minute + CUE_LEAD_GAME_MINUTES;
    this.pendingCue = {
      encounterId: def.id,
      cueKey: def.cueKey,
      startedAtMinute: ctx.minute,
      fireAtMinute,
    };
    if (bus) {
      bus.emit('encounter/cue', {
        encounterId: def.id,
        cueKey: def.cueKey,
        fireAtMinute,
      });
    }
    return true;
  }

  /**
   * T7.1 debug hook & direct hazard trigger: force-starts a specific encounter
   * definition by id, filtering `choice.requires` against `ctx` (or the live
   * context provider). Returns null safely if all choices fail `requires`.
   */
  forceStart(
    encounterId: string,
    bus?: EventBus<GameEvents>,
    ctx?: EncounterContext
  ): EncounterInstance | null {
    if (this.activeEncounter !== null) {
      return null;
    }
    const def = this.definitions.find((d) => d.id === encounterId);
    if (!def) {
      return null;
    }

    const filterCtx = ctx ?? this.lastContext ?? this.contextProvider?.();
    if (filterCtx) {
      const validChoices = this.collectValidChoices(def, filterCtx);
      if (validChoices.length === 0) {
        return null;
      }
      this.pendingCue = null;
      return this.activateEncounter(def, validChoices, filterCtx, bus, false);
    }

    this.pendingCue = null;
    return this.activateEncounter(def, def.choices, undefined, bus, false);
  }

  /**
   * Resolves the active encounter with the player's chosen option.
   */
  chooseOption(
    instanceId: string,
    choiceId: string,
    ctx: EffectContext
  ): boolean {
    if (!this.activeEncounter || this.activeEncounter.id !== instanceId) {
      return false;
    }

    const def = this.activeEncounterDef;
    if (!def) {
      return false;
    }

    // Only choices actually offered on this instance may be selected
    if (!this.activeEncounter.choices.some((c) => c.id === choiceId)) {
      return false;
    }

    const choice = def.choices.find((c) => c.id === choiceId);
    if (!choice) {
      return false;
    }

    ctx.rng = ctx.rng ?? this.rng;
    ctx.encounterContext = ctx.encounterContext ?? this.lastContext ?? this.contextProvider?.();
    ctx.outcomeLineKey = undefined;

    // Apply effects to owning systems
    applyEffects(choice.effects, ctx);

    // Emit resolved event
    ctx.eventBus.emit('encounter/resolved', {
      instanceId,
      choiceId,
      encounterId: def.id,
      ...(ctx.outcomeLineKey ? { outcomeLineKey: ctx.outcomeLineKey } : {}),
    });

    const baseMin = ctx.encounterContext?.minute ?? this.lastEvaluationMinute;
    const effectiveGlobalCooldown = ctx.encounterContext?.inFastForward
      ? Math.min(this.globalCooldownMin, 12)
      : this.globalCooldownMin;
    if (effectiveGlobalCooldown > 0 && baseMin >= 0) {
      this.nextGlobalEncounterMinute = Math.max(
        this.nextGlobalEncounterMinute,
        baseMin + effectiveGlobalCooldown
      );
    }

    this.activeEncounter = null;
    this.activeEncounterDef = null;
    this.inlineRemainingSec = null;

    return true;
  }

  /**
   * Evaluates an arrival-gated encounter from explicit candidate ids when the player
   * physically stops at pickup or drop-off.
   */
  evaluateArrivalEncounter(
    candidateIds: readonly string[],
    ctx: EncounterContext,
    bus?: EventBus<GameEvents>
  ): EncounterInstance | null {
    this.lastContext = ctx;
    if (this.activeEncounter !== null) {
      return null;
    }

    this.eligibleScratch.length = 0;
    let totalWeight = 0;
    for (let i = 0; i < this.definitions.length; i++) {
      const def = this.definitions[i]!;
      if (!candidateIds.includes(def.id)) continue;

      const readyAt = this.cooldowns.get(def.id) ?? 0;
      if (readyAt > ctx.minute) continue;
      if (def.oncePerDay && this.firedToday.has(def.id)) continue;
      if (!evaluateCondition(def.trigger, ctx)) continue;
      if (this.collectValidChoices(def, ctx).length === 0) continue;

      this.eligibleScratch.push(def);
      totalWeight += def.weight;
    }

    if (this.eligibleScratch.length === 0 || totalWeight <= 0) {
      return null;
    }

    const roll = this.rng.next() * totalWeight;
    let sum = 0;
    let selected: EncounterDef = this.eligibleScratch[0]!;
    for (let i = 0; i < this.eligibleScratch.length; i++) {
      const def = this.eligibleScratch[i]!;
      sum += def.weight;
      if (roll < sum) {
        selected = def;
        break;
      }
    }

    const choices = this.collectValidChoices(selected, ctx);
    return this.activateEncounter(selected, choices, ctx, bus, true);
  }

  tickInlineExpiry(dtSimSec: number, bus?: EventBus<GameEvents>): boolean {
    if (
      this.activeEncounter?.presentation !== 'inline' ||
      this.inlineRemainingSec === null
    ) {
      return false;
    }
    this.inlineRemainingSec -= dtSimSec;
    if (this.inlineRemainingSec <= 0) {
      return this.dismissActive('expired', bus);
    }
    return false;
  }

  dismissActive(
    reason: 'expired' | 'overshot' | 'rideEnded',
    bus?: EventBus<GameEvents>
  ): boolean {
    if (!this.activeEncounter) return false;
    const inst = this.activeEncounter;
    const def = this.activeEncounterDef;
    this.activeEncounter = null;
    this.activeEncounterDef = null;
    this.inlineRemainingSec = null;
    if (bus) {
      bus.emit('encounter/dismissed', {
        instanceId: inst.id,
        encounterId: def?.id,
        reason,
      });
    }
    return true;
  }

  /**
   * Evaluates per-segment encounter probability when entering a segment while on trip or at pickup.
   * Outcome split: harmless 0.6 / suspicious 0.3 / dangerous 0.1.
   */
  evaluateSegmentCrime(
    segment: RoadSegment,
    ctx: EncounterContext,
    bus?: EventBus<GameEvents>,
    rng?: Rng
  ): {
    triggered: boolean;
    outcome?: CrimeOutcome;
    instance?: EncounterInstance | null;
  } {
    if (isSafeCh1Alley(segment, ctx.chapter, ctx.flags)) {
      return { triggered: false };
    }

    const prob = calculateSegmentEncounterProbability({
      riskLevel: segment.riskLevel,
      minute: ctx.minute,
      isReckless: !!ctx.flags?.['isReckless'],
    });

    const r = rng ?? this.rng;
    if (!r.chance(prob)) {
      return { triggered: false };
    }

    const outcome = sampleCrimeOutcome(r);
    if (outcome === 'harmless') {
      return { triggered: true, outcome: 'harmless', instance: null };
    }

    // Look for matching crime encounter definitions
    const crimeDefs = this.definitions.filter((d) => d.category === 'crime');
    const matchingDef = crimeDefs.find((d) =>
      evaluateCondition(d.trigger, { ...ctx, segment })
    );
    if (!matchingDef) {
      return { triggered: true, outcome: 'harmless', instance: null };
    }

    let instance: EncounterInstance | null = null;
    if (matchingDef) {
      // Ensure 'turn_around' is always available before entering a dangerous segment
      const validChoices: EncounterChoiceDef[] = [];
      let hasTurnAround = false;
      for (const choice of matchingDef.choices) {
        if (choice.id === 'turn_around') hasTurnAround = true;
        if (!choice.requires || evaluateCondition(choice.requires, ctx)) {
          validChoices.push(choice);
        }
      }

      if (!hasTurnAround) {
        validChoices.unshift({
          id: 'turn_around',
          labelKey: 'encounter.crime.choice.turn_around',
          effects: [{ type: 'route', action: 'avoid', ref: segment.segmentId }],
        });
      }

      instance = {
        id: `inst_${matchingDef.id}_${Math.floor(ctx.minute)}_${r.int(1000, 9999)}`,
        encounterId: matchingDef.id,
        lineKey: matchingDef.lineKey,
        ...(matchingDef.cueKey ? { cueKey: matchingDef.cueKey } : {}),
        choices: validChoices.map((c) => this.buildChoiceMeta(c)),
      };

      this.activeEncounter = instance;
      this.activeEncounterDef = matchingDef;

      if (bus) {
        bus.emit('encounter/started', { instance });
      }
    }

    return { triggered: true, outcome, instance };
  }

  resolveFlee(speedKmh: number, bikeCondition: number, rng?: Rng): FleeResult {
    return resolveFlee({ speedKmh, bikeCondition, rng: rng ?? this.rng });
  }

  resolveRobbery(cashOnHand: number, rng?: Rng): RobberyResult {
    return resolveRobbery(cashOnHand, rng ?? this.rng);
  }
}
