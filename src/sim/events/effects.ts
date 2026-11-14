import type { Effect } from '../schemas';
import type { GameManager } from '../GameManager';
import type { EconomyManager } from '../economy/EconomyManager';
import type { RideManager } from '../ride/RideManager';
import type { EventBus, GameEvents } from '../../core/events';
import { clamp } from '../../core/math';
import { canonicalCharacterId } from '../passenger/PassengerAI';

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
}

export function applyEffect(effect: Effect, ctx: EffectContext): void {
  switch (effect.type) {
    case 'money': {
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
      ctx.gameManager.clock.advance(effect.min * 60 / 20); // advance by minutes
      break;
    }

    case 'mood': {
      if (ctx.activePassenger) {
        ctx.activePassenger.mood = clamp(ctx.activePassenger.mood + effect.delta, 0, 1);
      }
      break;
    }

    case 'trust': {
      if (ctx.activePassenger) {
        ctx.activePassenger.trust = clamp(ctx.activePassenger.trust + effect.delta, 0, 100);
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
      } else if (effect.action === 'forceVia') {
        ctx.forceViaNodes?.push(effect.ref);
      } else if (effect.action === 'closeSegment') {
        ctx.avoidSegments?.add(effect.ref);
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
  }
}

export function applyEffects(effects: Effect[], ctx: EffectContext): void {
  for (const eff of effects) {
    applyEffect(eff, ctx);
  }
}
