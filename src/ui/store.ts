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

export interface GarageState {
  open: boolean;
  atKamalBhai: boolean;
  kamalRelationship: number;
  cash?: number;
  engineCondition?: number;
  tiresCondition?: number;
  brakesCondition?: number;
  kmSinceOilChange?: number;
  ownedUpgrades?: string[];
  installedCosmetics?: { paint?: string; seatCover?: string };
}

export const garageSignal = signal<GarageState>({
  open: false,
  atKamalBhai: true,
  kamalRelationship: 0,
});

export const garageTabSignal = signal<'repairs' | 'upgrades' | 'cosmetics'>('repairs');

export type TutorialStep =
  | 'idle'
  | 'alarm'
  | 'ma_reminder'
  | 'wallet_check'
  | 'bike_inspection'
  | 'tea_stall'
  | 'open_app'
  | 'negotiation'
  | 'riding'
  | 'receipt'
  | 'completed';

export interface TutorialState {
  active: boolean;
  step: TutorialStep;
  agreedFare?: number;
}

export const tutorialSignal = signal<TutorialState>({
  active: false,
  step: 'idle',
});

export const screenSignal = signal<ScreenId>('game');
export const pausedSignal = signal<boolean>(false);
export const rotateOverlaySignal = signal<boolean>(false);
export const unsupportedSignal = signal<string | null>(null);
export const loadingSignal = signal<boolean>(false);
export const contextLostSignal = signal<boolean>(false);

export interface GameSettings {
  language: 'bn' | 'en';
  quality: 'low' | 'medium' | 'high';
  subtitlesSize: 'normal' | 'large';
  colorblindRoute: boolean;
  pauseOnDecisions: boolean;
  tiltControls: boolean;
  masterVolume: number;
  sfxVolume: number;
  ambientVolume: number;
}

export const DEFAULT_SETTINGS: GameSettings = {
  language: 'bn',
  quality: 'medium',
  subtitlesSize: 'normal',
  colorblindRoute: false,
  pauseOnDecisions: false,
  tiltControls: false,
  masterVolume: 0.8,
  sfxVolume: 0.9,
  ambientVolume: 0.7,
};

export const SETTINGS_STORAGE_KEY = 'uthao_user_settings';
let memorySettings: GameSettings | null = null;

export function loadSettings(): GameSettings {
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (raw) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      }
    } catch {
      // fallback
    }
  }
  return memorySettings ? { ...memorySettings } : { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: GameSettings): void {
  memorySettings = { ...settings };
  settingsSignal.value = settings;
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // ignore
    }
  }
}

export const settingsSignal = signal<GameSettings>(loadSettings());

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

if (typeof window !== 'undefined') {
  (window as unknown as { __uthaoUi?: unknown }).__uthaoUi = {
    garageSignal,
    garageTabSignal,
    screenSignal,
    pausedSignal,
    settingsSignal,
    hudSignal,
    phoneSignal,
    dayEndSignal,
    negotiationSignal,
    choiceSignal,
    tutorialSignal,
    unsupportedSignal,
    rotateOverlaySignal,
  };
}

export let onChooseCallback: ((choiceId: string, instanceId: string) => void) | null = null;
export let onAcceptRequestCallback: ((requestId: string) => void) | null = null;
export let onDeclineRequestCallback: ((requestId: string) => void) | null = null;
export let onNegotiationActionCallback: ((action: NegotiationAction) => void) | null = null;
export let onSleepCallback: (() => void) | null = null;
export let onDelayRentCallback: (() => void) | null = null;
export let onAskAdvanceCallback: ((from: 'mintu' | 'ma', amount: number) => void) | null = null;
export let onRepairCallback: ((item: string) => void) | null = null;
export let onBuyUpgradeCallback: ((upgradeId: string) => void) | null = null;
export let onStartNewCareerCallback: (() => void) | null = null;
export let onContinueCareerCallback: (() => void) | null = null;
export let onStartEndlessCallback: (() => void) | null = null;
export let onResumeGameCallback: (() => void) | null = null;
export let onSetWaypointCallback: ((nodeId: string | null) => void) | null = null;

export function setMenuDispatchers(
  newCareerFn?: () => void,
  continueFn?: () => void,
  endlessFn?: () => void,
  resumeFn?: () => void,
  setWaypointFn?: (nodeId: string | null) => void
): void {
  if (newCareerFn) onStartNewCareerCallback = newCareerFn;
  if (continueFn) onContinueCareerCallback = continueFn;
  if (endlessFn) onStartEndlessCallback = endlessFn;
  if (resumeFn) onResumeGameCallback = resumeFn;
  if (setWaypointFn) onSetWaypointCallback = setWaypointFn;
}

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

export let onTutorialAdvanceCallback: ((nextStep: TutorialStep) => void) | null = null;
export let onTutorialNegotiateCallback: ((fare: number) => void) | null = null;
export let onTutorialCompleteCallback: (() => void) | null = null;

export function setTutorialDispatchers(dispatchers: {
  advance?: (nextStep: TutorialStep) => void;
  negotiate?: (fare: number) => void;
  complete?: () => void;
}): void {
  if (dispatchers.advance) onTutorialAdvanceCallback = dispatchers.advance;
  if (dispatchers.negotiate) onTutorialNegotiateCallback = dispatchers.negotiate;
  if (dispatchers.complete) onTutorialCompleteCallback = dispatchers.complete;
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

export function setGarageDispatchers(
  repairFn: (item: string) => void,
  buyUpgradeFn: (upgradeId: string) => void
): void {
  onRepairCallback = repairFn;
  onBuyUpgradeCallback = buyUpgradeFn;
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
    setGarageDispatchers(
      (item) => dispatch({ type: 'repair', item }),
      (upgradeId) => dispatch({ type: 'buyUpgrade', upgradeId })
    );
    setMenuDispatchers(
      () => {
        screenSignal.value = 'game';
        pausedSignal.value = false;
        dispatch({ type: 'resume' });
      },
      () => {
        screenSignal.value = 'game';
        pausedSignal.value = false;
        dispatch({ type: 'resume' });
      },
      () => {
        screenSignal.value = 'game';
        pausedSignal.value = false;
        dispatch({ type: 'resume' });
      },
      () => {
        screenSignal.value = 'game';
        pausedSignal.value = false;
        dispatch({ type: 'resume' });
      },
      (nodeId) => {
        dispatch({ type: 'setWaypoint', nodeId });
      }
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
