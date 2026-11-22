import type { Effect } from '../schemas';
import type { GameManager } from '../GameManager';
import type { EconomyManager } from '../economy/EconomyManager';
import type { RideManager } from '../ride/RideManager';
import type { EventBus, GameEvents } from '../../core/events';
import type { Rng } from '../../core/rng';
import { clamp } from '../../core/math';
import { BALANCE } from '../../config/balance';
import { TIME_SCALE } from '../../config/constants';
import { canonicalCharacterId } from '../passenger/PassengerAI';
import { evaluateCondition, type EncounterContext } from './conditions';
import { resolveRobbery } from './flee';

export interface EffectContext {
  gameManager: GameManager;
  economyManager: EconomyManager;
  rideManager?: RideManager;
  eventBus: EventBus<GameEvents>;
  avoidSegments?: Set<string>;
  forceViaNodes?: string[];
  activePassenger?: {
    trust: number;
    mood: number;
  } | null;
  spawnSpecialRequest?: (templateId: string) => void;
  encounterContext?: EncounterContext;
  rng?: Rng;
  outcomeLineKey?: string;
  deferTimeToWait?: boolean;
  deferredWaitMin?: number;
  onRouteEffect?: (
    action: 'avoid' | 'forceVia' | 'closeSegment',
    ref: string
  ) => void;
  deferPhoneReturn?: boolean;
  deferredPhoneReward?: { cash: number; trust: number } | null;
  deferRoamingJob?: boolean;
  deferredJobCash?: number;
}

function resolveEncounterContext(ctx: EffectContext): EncounterContext {
  if (ctx.encounterContext) return ctx.encounterContext;
  const gm = ctx.gameManager;
  return {
    phase: 'roaming',
    minute: gm.clock.minutes,
    day: gm.clock.day,
    weather: gm.weather,
    chapter: gm.story.currentChapter,
    flags: gm.story.branchFlags,
    relationships: gm.reputationSystem.getRelationshipsView(),
    cash: ctx.economyManager.cash,
    speedKmh: 0,
    bikeCondition: ctx.economyManager.motorcycleCondition,
    activeRequest: ctx.rideManager?.getActiveRequest() ?? null,
    meters: gm.reputationSystem.getMetersView(),
    passenger: ctx.activePassenger
      ? {
          id: ctx.rideManager?.getActiveRequest()?.passengerId ?? 'active',
          trust: ctx.activePassenger.trust,
          mood: ctx.activePassenger.mood,
        }
      : null,
  };
}

export function applyEffect(effect: Effect, ctx: EffectContext): void {
  switch (effect.type) {
    case 'money': {
      if (ctx.deferPhoneReturn && effect.amount > 0) {
        if (!ctx.deferredPhoneReward) {
          ctx.deferredPhoneReward = { cash: 0, trust: 0 };
        }
        ctx.deferredPhoneReward.cash += effect.amount;
        break;
      }
      if (ctx.deferRoamingJob && effect.amount > 0) {
        ctx.deferredJobCash = (ctx.deferredJobCash ?? 0) + effect.amount;
        break;
      }
      // Money changes MUST ONLY route through EconomyManager
      const rngSuffix = ctx.gameManager.rng ? ctx.gameManager.rng.int(1000, 9999) : 1000;
      // A positive fare or tip from an encounter is not a trip: book it as event income.
      const isEventIncome = effect.amount > 0 && (effect.kind === 'fare' || effect.kind === 'tip');
      ctx.economyManager.post({
        id: `tx_enc_${ctx.gameManager.clock.day}_${Math.floor(ctx.gameManager.clock.minutes)}_${rngSuffix}`,
        day: ctx.gameManager.clock.day,
        minute: ctx.gameManager.clock.minutes,
        kind: isEventIncome ? 'event' : effect.kind,
        amount: effect.amount,
      });
      // Synchronize economy snapshot
      ctx.gameManager.economy.cash = ctx.economyManager.cash;
      ctx.gameManager.economy.debt = ctx.economyManager.debt;
      ctx.gameManager.economy.dailyRevenue = ctx.economyManager.dailyRevenue;
      ctx.gameManager.economy.dailyExpenses = ctx.economyManager.dailyExpenses;
      break;
    }

    case 'time': {
      if (ctx.deferTimeToWait) {
        ctx.deferredWaitMin =
          (ctx.deferredWaitMin ?? 0) + Math.max(0, effect.min);
        break;
      }
      if (effect.min > 0) {
        ctx.gameManager.clock.advance((effect.min * 60) / TIME_SCALE); // advance by minutes
      } else if (effect.min < 0) {
        // Time saved relaxes any active trip's arrival deadline without rewinding wall-clock time.
        const active = ctx.rideManager?.getActiveRequest();
        if (active && active.requestedArrivalTime !== null) {
          active.requestedArrivalTime += Math.abs(effect.min);
        }
      }
      break;
    }

    case 'mood': {
      if (ctx.activePassenger) {
        ctx.activePassenger.mood = clamp(ctx.activePassenger.mood + effect.delta, 0, 1);
      }
      ctx.rideManager?.adjustPassengerMood?.(effect.delta);
      break;
    }

    case 'trust': {
      if (ctx.activePassenger) {
        ctx.activePassenger.trust = clamp(ctx.activePassenger.trust + effect.delta, 0, 100);
      }
      const req = ctx.rideManager?.getActiveRequest?.();
      const subjectId = req
        ? (req.characterId ?? req.passengerId)
        : ctx.encounterContext?.passenger?.id;
      if (subjectId) {
        ctx.gameManager.reputationSystem.changePassengerTrust(subjectId, effect.delta);
      }
      break;
    }

    case 'rating': {
      // T7.5: route through ReputationSystem's own rolling history instead
      // of poking economyManager.reputation directly — GameManager's
      // reputation/changed listener always resyncs economy.reputation from
      // reputationSystem.getAppRating(), so a direct write here was
      // silently overwritten the moment the event below fired.
      ctx.gameManager.reputationSystem.adjustRating(effect.delta);
      break;
    }

    case 'relationship': {
      // T7.5: ReputationSystem is the only writer of characterRelationships
      // (it IS gameManager.story.characterRelationships by reference) —
      // just ask for the change via the event it already listens for,
      // instead of also writing the story object directly here.
      const characterId = canonicalCharacterId(effect.characterId);
      ctx.eventBus.emit('reputation/changed', {
        delta: {
          relationship: {
            characterId,
            delta: effect.delta,
          },
        },
      });
      break;
    }

    case 'localTrust': {
      if (ctx.deferPhoneReturn && effect.delta > 0) {
        if (!ctx.deferredPhoneReward) {
          ctx.deferredPhoneReward = { cash: 0, trust: 0 };
        }
        ctx.deferredPhoneReward.trust += effect.delta;
        break;
      }
      ctx.eventBus.emit('reputation/changed', {
        delta: {
          localTrust: effect.delta,
        },
      });
      break;
    }

    case 'flag': {
      ctx.gameManager.story.branchFlags[effect.key] = effect.value;
      ctx.eventBus.emit('story/flag', {
        key: effect.key,
        value: effect.value,
      });
      break;
    }

    case 'route': {
      if (effect.action === 'avoid') {
        ctx.avoidSegments?.add(effect.ref);
        ctx.onRouteEffect?.('avoid', effect.ref);
      } else if (effect.action === 'forceVia') {
        ctx.forceViaNodes?.push(effect.ref);
        ctx.onRouteEffect?.('forceVia', effect.ref);
      } else if (effect.action === 'closeSegment') {
        ctx.avoidSegments?.add(effect.ref);
        ctx.onRouteEffect?.('closeSegment', effect.ref);
        ctx.eventBus.emit('world/roadEvent', {
          event: {
            id: `closure_${effect.ref}`,
            kind: 'closure',
            segmentId: effect.ref,
            active: true,
          },
        });
      }
      break;
    }

    case 'endTrip': {
      // T7.5: actually cancel the trip through RideManager (which clears
      // the active request and advances its FSM) instead of only emitting
      // the notification event — the old code emitted `ride/cancelled`
      // without ever calling `cancel()`, so nothing downstream actually
      // ended.
      const active = ctx.rideManager?.getActiveRequest();
      if (active) {
        if (effect.paid) {
          const partialFare = Math.max(
            BALANCE.FARE.minFare,
            Math.round(active.initialFare * 0.5)
          );
          const rngSuffix = ctx.gameManager.rng ? ctx.gameManager.rng.int(1000, 9999) : 1000;
          ctx.economyManager.post({
            id: `tx_endtrip_${ctx.gameManager.clock.day}_${Math.floor(ctx.gameManager.clock.minutes)}_${rngSuffix}`,
            day: ctx.gameManager.clock.day,
            minute: ctx.gameManager.clock.minutes,
            kind: 'fare',
            amount: partialFare,
          });
          ctx.gameManager.economy.cash = ctx.economyManager.cash;
          ctx.gameManager.economy.debt = ctx.economyManager.debt;
          ctx.gameManager.economy.dailyRevenue = ctx.economyManager.dailyRevenue;
          ctx.gameManager.economy.dailyExpenses = ctx.economyManager.dailyExpenses;
        }
        ctx.rideManager!.cancel(
          active.requestId,
          'system',
          effect.paid ? 'Encounter paid partial' : 'Encounter cancelled'
        );
      }
      break;
    }

    case 'startMinigame': {
      ctx.eventBus.emit('world/roadEvent', {
        event: {
          id: `minigame_${effect.kind}`,
          kind: effect.kind,
          active: true,
        },
      });
      break;
    }

    case 'spawnRequest': {
      if (ctx.spawnSpecialRequest) {
        ctx.spawnSpecialRequest(effect.templateId);
      }
      break;
    }

    case 'startMission': {
      ctx.gameManager.missionManager.activateMission(effect.missionId);
      break;
    }

    case 'injury': {
      // T7.5: only damage the bike when that's actually the target; bare
      // (no target) data predates this field and is read as 'bike' for
      // back-compat. ponytail: rider/passenger have no health stat yet, so
      // those targets are correctly a no-op here — add a meter for them
      // when the game needs one, don't invent it to fill this case.
      const target = effect.target ?? 'bike';
      if (target === 'bike') {
        const severity = effect.severity ?? 15;
        ctx.economyManager.motorcycleCondition = Math.max(
          0,
          ctx.economyManager.motorcycleCondition - severity
        );
        ctx.gameManager.economy.motorcycleCondition =
          ctx.economyManager.motorcycleCondition;
      }
      break;
    }

    case 'robbery': {
      const rng = ctx.rng ?? ctx.gameManager.rng;
      const res = resolveRobbery(ctx.economyManager.cash, rng);
      if (res.cashLost > 0) {
        const rngSuffix = rng.int(1000, 9999);
        ctx.economyManager.post({
          id: `tx_rob_${ctx.gameManager.clock.day}_${Math.floor(ctx.gameManager.clock.minutes)}_${rngSuffix}`,
          day: ctx.gameManager.clock.day,
          minute: ctx.gameManager.clock.minutes,
          kind: 'robbery',
          amount: -res.cashLost,
        });
        ctx.gameManager.economy.cash = ctx.economyManager.cash;
        ctx.gameManager.economy.debt = ctx.economyManager.debt;
        ctx.gameManager.economy.dailyRevenue = ctx.economyManager.dailyRevenue;
        ctx.gameManager.economy.dailyExpenses = ctx.economyManager.dailyExpenses;
      }
      break;
    }

    case 'meter': {
      ctx.gameManager.reputationSystem.applyMeter(
        effect.meter,
        effect.delta,
        effect.reasonKey,
        effect.subjectId
      );
      break;
    }

    case 'outcome': {
      const encCtx = resolveEncounterContext(ctx);
      let totalWeight = 0;
      const eligible = [];
      for (let i = 0; i < effect.table.length; i++) {
        const entry = effect.table[i]!;
        if (entry.requires && !evaluateCondition(entry.requires, encCtx)) {
          continue;
        }
        if (entry.weight > 0) {
          eligible.push(entry);
          totalWeight += entry.weight;
        }
      }
      if (eligible.length === 0 || totalWeight <= 0) break;

      const rng = ctx.rng ?? ctx.gameManager.rng;
      const roll = rng.next() * totalWeight;
      let sum = 0;
      let selected = eligible[0]!;
      for (let i = 0; i < eligible.length; i++) {
        const entry = eligible[i]!;
        sum += entry.weight;
        if (roll < sum) {
          selected = entry;
          break;
        }
      }
      ctx.outcomeLineKey = selected.lineKey;
      applyEffects(selected.effects, ctx);
      break;
    }
  }
}

export function applyEffects(effects: Effect[], ctx: EffectContext): void {
  for (const eff of effects) {
    applyEffect(eff, ctx);
  }
}
