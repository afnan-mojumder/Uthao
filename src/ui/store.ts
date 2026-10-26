import { signal } from '@preact/signals';
import type { EventBus, GameEvents } from '../core/events';
import type {
  CrimeEncounter,
  PoliceCase,
  AccidentRecord,
} from '../sim/darkChoices/types';
import { ConductManager } from '../sim/darkChoices/ConductManager';
import type { DayAccounting } from './menus/DaySummaryModal';

export type ScreenId = 'title' | 'game' | 'garage' | 'map' | 'pause';

export interface HudState {
  speedKmh: number;
  fuelPct: number;
  todaysNet: number;
  currentDistrict: string;
  timeString: string;
  objectiveText: string;
  gear: number;
  fuel: number;
  passenger?: {
    name: string;
    mood: 'happy' | 'neutral' | 'frustrated';
    status: 'WaitingForPickup' | 'OnTrip' | 'Completed' | 'None';
  };
  navigation?: {
    instruction: string;
    distanceText: string;
    etaText: string;
  };
  headlightsOn?: boolean;
  hazardOn?: boolean;
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

// Interactive Panels Signals
export const isMapOpenSignal = signal<boolean>(false);
export const isPhoneOpenSignal = signal<boolean>(false);
export const isJournalOpenSignal = signal<boolean>(false);
export const isStoryModalOpenSignal = signal<boolean>(false);
export const isShowcaseModalOpenSignal = signal<boolean>(false);

// Dark Choices & Encounters Signals
export const activeCrimeEncounterSignal = signal<CrimeEncounter | null>(null);
export const activePoliceCaseSignal = signal<PoliceCase | null>(null);
export const activeAccidentSignal = signal<AccidentRecord | null>(null);
export const daySummarySignal = signal<DayAccounting | null>(null);

// Conduct Manager Signal
export const conductSignal = signal<ConductManager>(new ConductManager());

export const hudSignal = signal<HudState>({
  speedKmh: 32,
  fuelPct: 80,
  todaysNet: 650,
  currentDistrict: 'Farmgate',
  timeString: 'Tue, 12 Nov • 4:25 PM',
  objectiveText: 'Drop off passenger at Dhanmondi 27',
  gear: 2,
  fuel: 80,
});

export const phoneSignal = signal<{ open: boolean; unreadCount: number }>({
  open: false,
  unreadCount: 1,
});

export const negotiationSignal = signal<{ active: boolean; fare: number; passengerOffer: number }>({
  active: false,
  fare: 120,
  passengerOffer: 120,
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
      todaysNet: hudSignal.value.todaysNet + ev.receipt.net,
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
