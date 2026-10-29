import { signal } from '@preact/signals';
import type { EventBus, GameEvents } from '../core/events';
import type { Command } from '../core/commands';
import type { DaySummary, RideRequest } from '../core/types';
import type { TripHistoryItem } from './phone/Phone';
import type {
  NegotiationSession,
  NegotiationResult,
  NegotiationAction,
} from '../sim/negotiation/NegotiationSystem';

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

export interface PhoneState {
  open: boolean;
  unreadCount: number;
  incomingRequest: RideRequest | null;
  timeoutRemaining: number;
  tripHistory: TripHistoryItem[];
  navigationTurn: { direction: string; text: string } | null;
}

export interface NegotiationUiState {
  active: boolean;
  session: NegotiationSession | null;
  lastResult: NegotiationResult | null;
}

export interface DayEndState {
  active: boolean;
  summary: DaySummary | null;
}

export const dayEndSignal = signal<DayEndState>({
  active: false,
  summary: null,
});

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

export const phoneSignal = signal<PhoneState>({
  open: false,
  unreadCount: 0,
  incomingRequest: null,
  timeoutRemaining: 15,
  tripHistory: [],
  navigationTurn: null,
});

export const negotiationSignal = signal<NegotiationUiState>({
  active: false,
  session: null,
  lastResult: null,
});

export const choiceSignal = signal<ChoiceState>({
  active: false,
  prompt: '',
  options: [],
});

export let onChooseCallback: ((choiceId: string, instanceId: string) => void) | null = null;
export let onAcceptRequestCallback: ((requestId: string) => void) | null = null;
export let onDeclineRequestCallback: ((requestId: string) => void) | null = null;
export let onNegotiationActionCallback: ((action: NegotiationAction) => void) | null = null;
export let onSleepCallback: (() => void) | null = null;
export let onDelayRentCallback: (() => void) | null = null;
export let onAskAdvanceCallback: ((from: 'mintu' | 'ma', amount: number) => void) | null = null;

export function setChoiceDispatcher(fn: (choiceId: string, instanceId: string) => void): void {
  onChooseCallback = fn;
}

export function setRequestDispatchers(
  acceptFn: (requestId: string) => void,
  declineFn: (requestId: string) => void
): void {
  onAcceptRequestCallback = acceptFn;
  onDeclineRequestCallback = declineFn;
}

export function setNegotiationActionDispatcher(fn: (action: NegotiationAction) => void): void {
  onNegotiationActionCallback = fn;
}

export function setDayEndDispatchers(
  sleepFn: () => void,
  delayRentFn?: () => void,
  askAdvanceFn?: (from: 'mintu' | 'ma', amount: number) => void
): void {
  onSleepCallback = sleepFn;
  if (delayRentFn) onDelayRentCallback = delayRentFn;
  if (askAdvanceFn) onAskAdvanceCallback = askAdvanceFn;
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
    setRequestDispatchers(
      (requestId) => dispatch({ type: 'acceptRequest', requestId }),
      (requestId) => dispatch({ type: 'declineRequest', requestId })
    );
    setDayEndDispatchers(
      () => dispatch({ type: 'sleep' }),
      () => dispatch({ type: 'delayRent' }),
      (from, amount) => dispatch({ type: 'askAdvance', from, amount })
    );
  }
  const unsubscribers: Array<() => void> = [];

  const unsubRideRequested = bus.on('ride/requested', (ev) => {
    phoneSignal.value = {
      ...phoneSignal.value,
      incomingRequest: ev.request,
      unreadCount: phoneSignal.value.unreadCount + 1,
      timeoutRemaining: 15,
    };
  });
  unsubscribers.push(unsubRideRequested);

  const unsubRideAccepted = bus.on('ride/accepted', () => {
    phoneSignal.value = {
      ...phoneSignal.value,
      incomingRequest: null,
      unreadCount: 0,
    };
  });
  unsubscribers.push(unsubRideAccepted);

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

    const newHistoryItem: TripHistoryItem = {
      requestId: ev.requestId,
      passengerName: 'Passenger',
      fare: ev.receipt.fare,
      net: ev.receipt.net,
      rating: 5,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    phoneSignal.value = {
      ...phoneSignal.value,
      tripHistory: [newHistoryItem, ...phoneSignal.value.tripHistory],
      navigationTurn: null,
    };
  });
  unsubscribers.push(unsubComplete);

  const unsubNegRound = bus.on('negotiation/round', (ev) => {
    hudSignal.value = {
      ...hudSignal.value,
      objectiveText: `Negotiation round ${ev.round}: Offer ৳${ev.offer}`,
    };
  });
  unsubscribers.push(unsubNegRound);

  const unsubNegResult = bus.on('negotiation/result', (ev) => {
    if (ev.outcome.kind === 'accepted') {
      negotiationSignal.value = {
        ...negotiationSignal.value,
        active: false,
      };
    } else {
      negotiationSignal.value = {
        ...negotiationSignal.value,
        active: false,
      };
    }
  });
  unsubscribers.push(unsubNegResult);

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

  const unsubDayEnded = bus.on('day/ended', (ev) => {
    dayEndSignal.value = {
      active: true,
      summary: ev.summary,
    };
  });
  unsubscribers.push(unsubDayEnded);

  const unsubDayStarted = bus.on('day/started', () => {
    dayEndSignal.value = {
      active: false,
      summary: null,
    };
  });
  unsubscribers.push(unsubDayStarted);

  return () => {
    for (const unsub of unsubscribers) {
      unsub();
    }
  };
}

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const installPromptSignal = signal<boolean>(false);
let deferredInstallPrompt: BeforeInstallPromptEvent | null = null;

export function initPwaInstall(): void {
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredInstallPrompt = e as BeforeInstallPromptEvent;
      installPromptSignal.value = true;
    });
    window.addEventListener('appinstalled', () => {
      deferredInstallPrompt = null;
      installPromptSignal.value = false;
    });
  }
}

export async function promptPwaInstall(): Promise<boolean> {
  if (!deferredInstallPrompt) return false;
  try {
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    installPromptSignal.value = false;
    return choice?.outcome === 'accepted';
  } catch {
    deferredInstallPrompt = null;
    installPromptSignal.value = false;
    return false;
  }
}
