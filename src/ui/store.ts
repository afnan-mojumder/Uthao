import { signal } from '@preact/signals';
import type { EventBus, GameEvents } from '../core/events';

export type ScreenId = 'title' | 'game' | 'garage' | 'map' | 'pause';

export interface HudState {
  speedKmh: number;
  objectiveText: string;
  gear: number;
  fuel: number;
}

export interface ChoiceOption {
  id: number;
  text: string;
}

export interface ChoiceState {
  active: boolean;
  prompt: string;
  options: ChoiceOption[];
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

/**
 * Subscribes to simulation event bus and mirrors updates to reactive Preact signals.
 */
export function bindEventBusToStore(bus: EventBus<GameEvents>): () => void {
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

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}
