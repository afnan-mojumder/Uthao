import type { EncounterDef, EncounterChoiceDef } from '../schemas';
import type { EncounterInstance, EncounterChoice, RoadSegment } from '../../core/types';
import type { EncounterContext, EncounterPhase } from './conditions';
import { evaluateCondition } from './conditions';
import type { EffectContext } from './effects';
import { applyEffects } from './effects';
import { Rng } from '../../core/rng';
import type { EventBus, GameEvents } from '../../core/events';
import {
  type CrimeOutcome,
  type FleeResult,
  type RobberyResult,
  calculateSegmentEncounterProbability,
  sampleCrimeOutcome,
  resolveFlee,
  resolveRobbery,
} from './flee';

export interface EventDirectorOptions {
  definitions?: EncounterDef[];
  seed?: number;
  pauseOnDecisions?: boolean;
}

export class EventDirector {
  readonly definitions: EncounterDef[];
  private rng: Rng;
  pauseOnDecisions: boolean;

  activeEncounter: EncounterInstance | null = null;
  activeEncounterDef: EncounterDef | null = null;

  private cooldowns: Map<string, number> = new Map();
  private firedToday: Set<string> = new Set();
  private lastEvaluationMinute: number = -1;
  private currentPhase: EncounterPhase = 'roaming';

  constructor(opts: EventDirectorOptions = {}) {
    this.definitions = opts.definitions ?? [];
    this.rng = new Rng(opts.seed ?? 42);
    this.pauseOnDecisions = opts.pauseOnDecisions ?? true;
  }

  setPauseOnDecisions(val: boolean): void {
    this.pauseOnDecisions = val;
  }

  resetDaily(): void {
    this.firedToday.clear();
  }

  /**
   * Evaluates encounters. Called once per game minute and at phase changes.
   */
  evaluate(
    ctx: EncounterContext,
    bus?: EventBus<GameEvents>
  ): EncounterInstance | null {
    const isMinuteTick =
      Math.floor(ctx.minute) !== Math.floor(this.lastEvaluationMinute);
    const isPhaseChange = ctx.phase !== this.currentPhase;

    if (!isMinuteTick && !isPhaseChange) {
      return null;
    }

    this.lastEvaluationMinute = ctx.minute;
    this.currentPhase = ctx.phase;

    // Max 1 active encounter at a time
    if (this.activeEncounter !== null) {
      return null;
    }

    // When pauseOnDecisions is OFF, bike must be under 10 km/h for the card to appear
    if (!this.pauseOnDecisions && ctx.speedKmh >= 10) {
      return null;
    }

    // Filter eligible encounters
    const eligible: EncounterDef[] = [];
    for (const def of this.definitions) {
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

      eligible.push(def);
    }

    if (eligible.length === 0) {
      return null;
    }

    // Seeded weighted selection
    const totalWeight = eligible.reduce((acc, e) => acc + e.weight, 0);
    const roll = this.rng.next() * totalWeight;
    let sum = 0;
    let selected: EncounterDef = eligible[0]!;

    for (const def of eligible) {
      sum += def.weight;
      if (roll < sum) {
        selected = def;
        break;
      }
    }

    // Mark cooldown and daily tracking
    this.cooldowns.set(selected.id, ctx.minute + selected.cooldownMin);
    if (selected.oncePerDay) {
      this.firedToday.add(selected.id);
    }

    // Filter available choices by requires condition
    const validChoices: EncounterChoiceDef[] = [];
    for (const choice of selected.choices) {
      if (!choice.requires || evaluateCondition(choice.requires, ctx)) {
        validChoices.push(choice);
      }
    }

    // Fallback if no choice meets requires: include all choices
    const finalChoices = validChoices.length > 0 ? validChoices : selected.choices;

    const instanceChoices: EncounterChoice[] = finalChoices.map((c) => ({
      id: c.id,
      labelKey: c.labelKey,
    }));

    const instance: EncounterInstance = {
      id: `inst_${selected.id}_${Math.floor(ctx.minute)}_${this.rng.int(1000, 9999)}`,
      encounterId: selected.id,
      lineKey: selected.lineKey,
      choices: instanceChoices,
    };

    this.activeEncounter = instance;
    this.activeEncounterDef = selected;

    if (bus) {
      bus.emit('encounter/started', { instance });
    }

    return instance;
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

    const choice = def.choices.find((c) => c.id === choiceId);
    if (!choice) {
      return false;
    }

    // Apply effects to owning systems
    applyEffects(choice.effects, ctx);

    // Emit resolved event
    ctx.eventBus.emit('encounter/resolved', {
      instanceId,
      choiceId,
    });

    this.activeEncounter = null;
    this.activeEncounterDef = null;

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
    let matchingDef = crimeDefs.find((d) =>
      evaluateCondition(d.trigger, { ...ctx, segment })
    );
    if (!matchingDef && crimeDefs.length > 0) {
      matchingDef = crimeDefs[0];
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
        choices: validChoices.map((c) => ({ id: c.id, labelKey: c.labelKey })),
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
