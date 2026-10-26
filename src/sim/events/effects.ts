import type { Effect } from '../schemas';
import type { GameManager } from '../GameManager';
import type { EconomyManager } from '../economy/EconomyManager';
import type { RideManager } from '../ride/RideManager';
import type { EventBus, GameEvents } from '../../core/events';
import { clamp } from '../../core/math';

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
      ctx.economyManager.post({
        id: `tx_enc_${ctx.gameManager.clock.day}_${Math.floor(ctx.gameManager.clock.minutes)}_${rngSuffix}`,
        day: ctx.gameManager.clock.day,
        minute: ctx.gameManager.clock.minutes,
        kind: effect.kind,
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
      ctx.economyManager.reputation = clamp(
        ctx.economyManager.reputation + effect.delta,
        1.0,
        5.0
      );
      ctx.gameManager.economy.reputation = ctx.economyManager.reputation;
      ctx.eventBus.emit('reputation/changed', {
        delta: {
          rating: effect.delta,
        },
      });
      break;
    }

    case 'relationship': {
      const current =
        ctx.gameManager.story.characterRelationships[effect.characterId] ?? 0;
      const updated = current + effect.delta;
      ctx.gameManager.story.characterRelationships[effect.characterId] = updated;
      ctx.eventBus.emit('reputation/changed', {
        delta: {
          relationship: {
            characterId: effect.characterId,
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
      const active = ctx.rideManager?.getActiveRequest();
      if (active) {
        ctx.eventBus.emit('ride/cancelled', {
          requestId: active.requestId,
          by: 'system',
          reason: effect.paid ? 'Encounter paid partial' : 'Encounter cancelled',
        });
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

    case 'injury': {
      const severity = effect.severity ?? 15;
      ctx.economyManager.motorcycleCondition = Math.max(
        0,
        ctx.economyManager.motorcycleCondition - severity
      );
      ctx.gameManager.economy.motorcycleCondition =
        ctx.economyManager.motorcycleCondition;
      break;
    }
  }
}

export function applyEffects(effects: Effect[], ctx: EffectContext): void {
  for (const eff of effects) {
    applyEffect(eff, ctx);
  }
}
