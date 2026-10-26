import { signal } from '@preact/signals';
import type { EventBus, GameEvents } from '../core/events';
import type { Command } from '../core/commands';

export type ScreenId = 'title' | 'game' | 'garage' | 'map' | 'pause';

export interface HudState {
  speedKmh: number;
  objectiveText: string;
  gear: number;
  fuel: number;
}

export interface ChoiceOption {
  id: string | number;
  text: string;
}

export interface ChoiceState {
  active: boolean;
  prompt: string;
  options: ChoiceOption[];
  instanceId?: string;
}

export const screenSignal = signal<ScreenId>('game');
export const pausedSignal = signal<boolean>(false);
export const rotateOverlaySignal = signal<boolean>(false);
export const unsupportedSignal = signal<string | null>(null);
export const loadingSignal = signal<boolean>(false);
export const contextLostSignal = signal<boolean>(false);

export const hudSignal = signal<HudState>({
  speedKmh: 0,
  objectiveText: '',
  gear: 1,
  fuel: 100,
});

export const phoneSignal = signal<{ open: boolean; unreadCount: number }>({
  open: false,
  unreadCount: 0,
});

export const negotiationSignal = signal<{ active: boolean; fare: number; passengerOffer: number }>({
  active: false,
  fare: 0,
  passengerOffer: 0,
});

export const choiceSignal = signal<ChoiceState>({
  active: false,
  prompt: '',
  options: [],
});

export let onChooseCallback: ((choiceId: string, instanceId: string) => void) | null = null;

export function setChoiceDispatcher(fn: (choiceId: string, instanceId: string) => void): void {
  onChooseCallback = fn;
}

/**
 * Subscribes to simulation event bus and mirrors updates to reactive Preact signals.
 */
export function bindEventBusToStore(
  bus: EventBus<GameEvents>,
  dispatch?: (cmd: Command) => void
): () => void {
  if (dispatch) {
    setChoiceDispatcher((choiceId, instanceId) => {
      dispatch({ type: 'chooseEncounterOption', choiceId, instanceId });
    });
  }
  const unsubscribers: Array<() => void> = [];

  const unsubRide = bus.on('ride/arrivedPickup', (ev) => {
    hudSignal.value = {
      ...hudSignal.value,
      objectiveText: `Pickup passenger: ${ev.requestId}`,
    };
  });
  unsubscribers.push(unsubRide);

  const unsubComplete = bus.on('ride/completed', (ev) => {
    hudSignal.value = {
      ...hudSignal.value,
      objectiveText: `Ride completed! Earned ৳${ev.receipt.fare}`,
    };
  });
  unsubscribers.push(unsubComplete);

  const unsubEncounterStart = bus.on('encounter/started', (ev) => {
    choiceSignal.value = {
      active: true,
      prompt: ev.instance.lineKey,
      options: ev.instance.choices.map((c) => ({
        id: c.id,
        text: c.labelKey,
      })),
      instanceId: ev.instance.id,
    };
  });
  unsubscribers.push(unsubEncounterStart);

  const unsubEncounterEnd = bus.on('encounter/resolved', () => {
    choiceSignal.value = {
      active: false,
      prompt: '',
      options: [],
      instanceId: undefined,
    };
  });
  unsubscribers.push(unsubEncounterEnd);

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}
