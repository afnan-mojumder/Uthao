import { signal } from '@preact/signals';
import { DEFAULT_VOLUMES } from '../audio/AudioManager';
import type { EventBus, GameEvents } from '../core/events';
import type { DaySummary, DeliveryJob, RideRequest, TripReceipt } from '../core/types';
import type { GameManager } from '../sim/GameManager';
import type { TripHistoryItem } from './phone/Phone';
import type {
  NegotiationSession,
  NegotiationResult,
  NegotiationAction,
} from '../sim/negotiation/NegotiationSystem';
import type { EndingResult, CareerChoiceOption, CareerChoice } from '../sim/mission/endings';
import type { SaveSlot } from '../sim/save/migrations';
import type { SaveSystem } from '../sim/save/SaveSystem';

export type ScreenId = 'title' | 'game' | 'garage' | 'map' | 'pause';

export const Z_LAYER = {
  HUD: 100,
  TOUCH: 200,
  TOAST: 300,
  PANEL: 500,
  MODAL: 700,
  CRITICAL_MODAL: 800,
  SYSTEM_OVERLAY: 900,
} as const;

export interface DialogueSubtitleState {
  text: string;
  speaker?: string;
  phase?: string;
}

export interface HudState {
  speedKmh: number;
  objectiveText: string;
  gear: number;
  fuel: number;
  dialogueSubtitle?: DialogueSubtitleState | null;
}

export interface ChoiceOption {
  id: string | number;
  text: string;
  vars?: Record<string, string | number>;
  isMission?: boolean;
  riskKey?: string;
  costHint?: number;
  kind?: 'official' | 'illicit' | 'neutral';
}

export interface ChoiceState {
  active: boolean;
  prompt: string;
  promptVars?: Record<string, string | number>;
  options: ChoiceOption[];
  instanceId?: string;
  outcomeLineKey?: string;
}

export interface EncounterCueState {
  cueKey: string | null;
  encounterId?: string;
  seq: number;
}

export interface PhoneState {
  open: boolean;
  unreadCount: number;
  incomingRequest: RideRequest | null;
  requestQueue?: RideRequest[];
  timeoutRemaining: number;
  tripHistory: TripHistoryItem[];
  navigationTurn: { direction: string; text: string } | null;
  relationships?: Record<string, number>;
  availableDeliveries?: DeliveryJob[];
  activeDeliveries?: DeliveryJob[];
}

export interface NegotiationUiState {
  active: boolean;
  session: NegotiationSession | null;
  lastResult: NegotiationResult | null;
  /** 0-1 passenger mood (drops when asked to walk). */
  mood?: number;
  /** A real relocation the sim can do now; the panel shows the button only when set. */
  pickup?: { nodeId: string; walkM: number; savesMin: number } | null;
  /** A non-alley entrance option when pickup or destination sits inside an alley. */
  alley?: { nodeId: string; walkM: number; target: 'pickup' | 'destination' } | null;
  /** Name key of the destination's place (never the raw road node id). */
  destinationKey?: string;
}

export interface DayEndState {
  active: boolean;
  summary: DaySummary | null;
}

export const dayEndSignal = signal<DayEndState>({
  active: false,
  summary: null,
});

/** T7.4: set on `ride/completed`; cleared only by TripSummary's Continue
 * button (its only exit). Not shown during the opening tutorial, which has
 * its own dedicated receipt step. */
export const tripSummarySignal = signal<TripReceipt | null>(null);

/** T7.4: toggled by the 'j' keybinding, same pattern as garage ('g') and the
 * map ('m'). */
export const journalSignal = signal<boolean>(false);
export const mapPlayerPosSignal = signal<{ x: number; z: number }>({ x: 0, z: 0 });

export interface JournalData {
  snapshot: import('../sim/GameManager').SimSnapshot;
  activeMissions: import('../sim/schemas').MissionDef[];
  getObjectiveStates: (missionId: string) => import('../sim/mission/objectives').ObjectiveState[];
}

/** T7.4: filled by main.ts's frame loop only while `journalSignal` is open,
 * same cost-when-closed tradeoff as the rest of the per-frame UI mirroring. */
export const journalDataSignal = signal<JournalData | null>(null);

export interface GarageState {
  open: boolean;
  atKamalBhai: boolean;
  kamalRelationship: number;
  cash?: number;
  savings?: number;
  currentBikeId?: import('../core/types').BikeId;
  ownedBikes?: import('../core/types').BikeId[];
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

export const garageTabSignal = signal<'repairs' | 'upgrades' | 'cosmetics' | 'bikes'>('repairs');

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

function initialScreen(): ScreenId {
  if (typeof window === 'undefined') return 'title';
  try {
    return new URLSearchParams(window.location.search).get('debug') === '1' ? 'game' : 'title';
  } catch {
    return 'title';
  }
}

// T7.1: boot on the main menu by default; `?debug=1` skips straight into the
// game world (used by every other e2e spec that doesn't test the boot flow).
export const screenSignal = signal<ScreenId>(initialScreen());
export const pausedSignal = signal<boolean>(false);
export const rotateOverlaySignal = signal<boolean>(false);
export interface LoadingState {
  active: boolean;
  stageKey: string;
  progress: number;
  error?: string;
}

export const unsupportedSignal = signal<string | null>(null);
export const loadingSignal = signal<LoadingState>({
  // Active during browser boot until bindUi() finishes; inactive in headless unit tests.
  active: typeof document !== 'undefined',
  stageKey: 'loading.boot',
  progress: 0,
});
export const contextLostSignal = signal<boolean>(false);

export interface GameSettings {
  language: 'bn' | 'en';
  quality: 'low' | 'medium' | 'high';
  subtitlesSize: 'normal' | 'large';
  colorblindRoute: boolean;
  reduceMotion: boolean;
  autoCruise: boolean;
  pauseOnDecisions: boolean;
  tiltControls: boolean;
  masterVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  /** Silences all game sound (audit: no mute control). */
  muted: boolean;
}

export const DEFAULT_SETTINGS: GameSettings = {
  language: 'bn',
  quality: 'medium',
  subtitlesSize: 'normal',
  colorblindRoute: false,
  reduceMotion: false,
  autoCruise: false,
  pauseOnDecisions: false,
  tiltControls: false,
  // One place for the volume defaults: the audio module owns them.
  masterVolume: DEFAULT_VOLUMES.master,
  sfxVolume: DEFAULT_VOLUMES.sfx,
  ambientVolume: DEFAULT_VOLUMES.ambient,
  muted: DEFAULT_VOLUMES.muted,
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

/** Mutes or unmutes all game sound and keeps the choice. */
export function toggleMute(): void {
  saveSettings({ ...settingsSignal.value, muted: !settingsSignal.value.muted });
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
  dialogueSubtitle: null,
});

export const dialogueSubtitleSignal = signal<DialogueSubtitleState | null>(null);

export const phoneSignal = signal<PhoneState>({
  open: false,
  unreadCount: 0,
  incomingRequest: null,
  requestQueue: [],
  timeoutRemaining: 15,
  tripHistory: [],
  navigationTurn: null,
  relationships: {},
  availableDeliveries: [],
  activeDeliveries: [],
});

export const phoneTabSignal = signal<'requests' | 'history' | 'contacts' | 'deliveries'>('requests');
export const contactsSelectedSignal = signal<string | null>(null);

export const negotiationSignal = signal<NegotiationUiState>({
  active: false,
  session: null,
  lastResult: null,
});

export const choiceSignal = signal<ChoiceState>({
  active: false,
  prompt: '',
  options: [],
  outcomeLineKey: undefined,
});

export const encounterCueSignal = signal<EncounterCueState>({
  cueKey: null,
  encounterId: undefined,
  seq: 0,
});

export function dismissChoiceOutcome(): void {
  choiceSignal.value = {
    active: false,
    prompt: '',
    promptVars: undefined,
    options: [],
    instanceId: undefined,
    outcomeLineKey: undefined,
  };
}

export interface EndingUiState {
  active: boolean;
  result: EndingResult | null;
  choices?: CareerChoiceOption[];
}

export const endingSignal = signal<EndingUiState>({
  active: false,
  result: null,
  choices: undefined,
});

export interface SaveSlotsState {
  isOpen: boolean;
  mode: 'save' | 'load';
}

export const saveSlotsSignal = signal<SaveSlotsState>({
  isOpen: false,
  mode: 'save',
});

if (typeof window !== 'undefined') {
  (window as unknown as { __uthaoUi?: unknown }).__uthaoUi = {
    garageSignal,
    garageTabSignal,
    screenSignal,
    pausedSignal,
    settingsSignal,
    hudSignal,
    dialogueSubtitleSignal,
    phoneSignal,
    dayEndSignal,
    negotiationSignal,
    choiceSignal,
    tutorialSignal,
    endingSignal,
    unsupportedSignal,
    loadingSignal,
    rotateOverlaySignal,
    tripSummarySignal,
    journalSignal,
    encounterCueSignal,
  };
}

export let onChooseCallback: ((choiceId: string, instanceId: string) => void) | null = null;
export let onAcceptRequestCallback: ((requestId: string) => void) | null = null;
export let onDeclineRequestCallback: ((requestId: string) => void) | null = null;
export let onNegotiationActionCallback: ((action: NegotiationAction) => void) | null = null;
export let onSleepCallback: (() => void) | null = null;
export let onDelayRentCallback: (() => void) | null = null;
export let onAskAdvanceCallback: ((from: 'char_mintu' | 'char_ma', amount: number) => void) | null = null;
export let onDepositSavingsCallback: ((amount: number) => void) | null = null;
export let onWithdrawSavingsCallback: ((amount: number) => void) | null = null;
export let onRepayDebtCallback: ((amount: number) => void) | null = null;
export let onEndShiftEarlyCallback: (() => void) | null = null;
export let onAcceptDeliveryCallback: ((jobId: string) => void) | null = null;
export let onRepairCallback: ((item: string) => void) | null = null;
export let onBuyUpgradeCallback: ((upgradeId: string) => void) | null = null;
export let onStartNewCareerCallback: (() => void) | null = null;
export let onContinueCareerCallback: (() => void) | null = null;
/** Reports whether any save slot holds a career, so the title can offer Continue. */
export let hasSaveCallback: (() => boolean) | null = null;
export let onStartEndlessCallback: (() => void) | null = null;
export let onResumeGameCallback: (() => void) | null = null;
export let onSetWaypointCallback: ((nodeId: string | null) => void) | null = null;
export let onSelectCareerChoiceCallback: ((choice: CareerChoice) => void) | null = null;
export let onRestartCareerCallback: (() => void) | null = null;
export let onEnterEndlessCallback: (() => void) | null = null;

export function setEndingDispatchers(
  selectChoiceFn?: (choice: CareerChoice) => void,
  restartCareerFn?: () => void,
  enterEndlessFn?: () => void
): void {
  if (selectChoiceFn) onSelectCareerChoiceCallback = selectChoiceFn;
  if (restartCareerFn) onRestartCareerCallback = restartCareerFn;
  if (enterEndlessFn) onEnterEndlessCallback = enterEndlessFn;
}

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

export function setHasSaveCallback(fn: () => boolean): void {
  hasSaveCallback = fn;
}

/**
 * Leaves the running game for the title screen. Clears the tutorial, pause
 * state, and every open modal or panel signal so nothing sits over the title.
 */
export function exitToTitle(): void {
  resetTransientUiState();
  tutorialSignal.value = { active: false, step: 'idle' };
  pausedSignal.value = false;
  impactSignal.value = { kind: null, seq: impactSignal.value.seq };
  deliveryNoticeSignal.value = { messageKey: null, vars: undefined, seq: deliveryNoticeSignal.value.seq };
  endShiftBlockedKeySignal.value = null;
  phoneSignal.value = {
    ...phoneSignal.value,
    open: false,
    incomingRequest: null,
    requestQueue: [],
    unreadCount: 0,
    timeoutRemaining: 15,
    tripHistory: [],
    navigationTurn: null,
    availableDeliveries: [],
    activeDeliveries: [],
  };
  dialogueSubtitleSignal.value = null;
  hudSignal.value = { ...hudSignal.value, dialogueSubtitle: null };
  negotiationSignal.value = { active: false, session: null, lastResult: null };
  garageSignal.value = { ...garageSignal.value, open: false };
  journalSignal.value = false;
  dayEndSignal.value = { active: false, summary: null };
  endingSignal.value = { active: false, result: null, choices: undefined };
  tripSummarySignal.value = null;
  choiceSignal.value = {
    active: false,
    prompt: '',
    options: [],
    instanceId: undefined,
    outcomeLineKey: undefined,
  };
  encounterCueSignal.value = { cueKey: null, encounterId: undefined, seq: encounterCueSignal.value.seq };
  saveSlotsSignal.value = { ...saveSlotsSignal.value, isOpen: false };
  screenSignal.value = 'title';
}

export function setChoiceDispatcher(fn: (choiceId: string, instanceId: string) => void): void {
  onChooseCallback = fn;
}

/**
 * Answers the open encounter with the option at `index` (0-based). Keyboard
 * digits and gamepad buttons both come through here. Returns false when no
 * card is open or the index has no option.
 */
export function chooseChoiceOption(index: number): boolean {
  const choice = choiceSignal.value;
  if (!choice.active || !choice.instanceId) return false;
  if (choice.outcomeLineKey || choice.options.length === 0) {
    if (index === 0) {
      dismissChoiceOutcome();
      return true;
    }
    return false;
  }
  const option = choice.options[index];
  if (!option || !onChooseCallback) return false;
  onChooseCallback(String(option.id), choice.instanceId);
  return true;
}

export function setRequestDispatchers(
  acceptFn: (requestId: string) => void,
  declineFn: (requestId: string) => void
): void {
  onAcceptRequestCallback = acceptFn;
  onDeclineRequestCallback = declineFn;
}

export let onCallContactCallback: ((characterId: string) => void) | null = null;
export function setPhoneContactDispatcher(
  callFn: (characterId: string) => void
): void {
  onCallContactCallback = callFn;
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
  askAdvanceFn?: (from: 'char_mintu' | 'char_ma', amount: number) => void,
  depositSavingsFn?: (amount: number) => void,
  withdrawSavingsFn?: (amount: number) => void,
  repayDebtFn?: (amount: number) => void
): void {
  onSleepCallback = sleepFn;
  if (delayRentFn) onDelayRentCallback = delayRentFn;
  if (askAdvanceFn) onAskAdvanceCallback = askAdvanceFn;
  if (depositSavingsFn) onDepositSavingsCallback = depositSavingsFn;
  if (withdrawSavingsFn) onWithdrawSavingsCallback = withdrawSavingsFn;
  if (repayDebtFn) onRepayDebtCallback = repayDebtFn;
}

export function setEndShiftEarlyDispatcher(fn: () => void): void {
  onEndShiftEarlyCallback = fn;
}

export function setDeliveryDispatcher(acceptFn: (jobId: string) => void): void {
  onAcceptDeliveryCallback = acceptFn;
}

function sameStringArray(a: readonly string[] | undefined, b: readonly string[]): boolean {
  if (!a || a.length !== b.length) return false;
  for (let i = 0; i < b.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Mirrors live GameManager economy, wear, upgrades, and Kamal proximity into `garageSignal`. */
export function syncGarageState(gm: GameManager): void {
  const em = gm?.economyManager;
  if (!em) return;
  const cur = garageSignal.value;
  const atKamalBhai =
    typeof gm.isNearKamalBhai === 'function' ? gm.isNearKamalBhai() : cur.atKamalBhai;
  const kamalRelationship =
    gm.reputationSystem?.getRelationship?.('char_kamal') ?? cur.kamalRelationship;
  const cash = em.cash;
  const savings = em.savings;
  const currentBikeId = em.currentBikeId;
  const engineCondition = Math.round(em.engineCondition);
  const tiresCondition = Math.round(em.tiresCondition);
  const brakesCondition = Math.round(em.brakesCondition);
  const kmSinceOilChange = Math.round(em.kmSinceOilChange);
  const paint = em.installedCosmetics.paint;
  const seatCover = em.installedCosmetics.seatCover;

  if (
    cur.atKamalBhai === atKamalBhai &&
    cur.kamalRelationship === kamalRelationship &&
    cur.cash === cash &&
    cur.savings === savings &&
    cur.currentBikeId === currentBikeId &&
    cur.engineCondition === engineCondition &&
    cur.tiresCondition === tiresCondition &&
    cur.brakesCondition === brakesCondition &&
    cur.kmSinceOilChange === kmSinceOilChange &&
    cur.installedCosmetics?.paint === paint &&
    cur.installedCosmetics?.seatCover === seatCover &&
    sameStringArray(cur.ownedBikes, em.ownedBikes) &&
    sameStringArray(cur.ownedUpgrades, em.ownedUpgrades)
  ) {
    return;
  }

  garageSignal.value = {
    open: cur.open,
    atKamalBhai,
    kamalRelationship,
    cash,
    savings,
    currentBikeId,
    ownedBikes: [...em.ownedBikes],
    engineCondition,
    tiresCondition,
    brakesCondition,
    kmSinceOilChange,
    ownedUpgrades: [...em.ownedUpgrades],
    installedCosmetics: { ...em.installedCosmetics },
  };
}

export function setGarageDispatchers(
  repairFn: (item: string) => void,
  buyUpgradeFn: (upgradeId: string) => void
): void {
  onRepairCallback = repairFn;
  onBuyUpgradeCallback = buyUpgradeFn;
}

/** Result of the last manual save, shown in the save slots. */
export const saveStatusSignal = signal<'saved' | 'failed' | null>(null);

/** Singleton SaveSystem shared between main.ts, bindUi(), and <SaveSlots />. */
export const activeSaveSystemSignal = signal<SaveSystem | null>(null);

export function setActiveSaveSystem(system: SaveSystem | null): void {
  activeSaveSystemSignal.value = system;
}

/**
 * Runs a manual save to a slot and reports whether it worked. A failed save
 * leaves the save panel open with its failure message (audit H-13).
 */
export function saveToSlotFromPanel(slot: SaveSlot): boolean {
  saveStatusSignal.value = null;
  onSaveGameCallback?.(slot);
  return saveStatusSignal.value !== 'failed';
}

export let onSaveGameCallback: ((slot: SaveSlot) => void) | null = null;
export let onLoadGameCallback: ((slot: SaveSlot) => void) | null = null;

export function setSaveDispatchers(
  saveFn?: (slot: SaveSlot) => void,
  loadFn?: (slot: SaveSlot) => void
): void {
  if (saveFn) onSaveGameCallback = saveFn;
  if (loadFn) onLoadGameCallback = loadFn;
}

/**
 * Subscribes to simulation event bus and mirrors updates to reactive Preact signals.
 * T7.4: dispatcher wiring (turning UI actions into Commands) now lives solely in
 * `src/ui/bindings.ts`'s `bindUi`, so this only mirrors sim events to signals.
 */
/** The latest bike impact the rider should see: a wobble or a collision. */
export interface ImpactState {
  kind: 'wobble' | 'scuff' | 'bump' | 'crash' | null;
  /** Counts every impact, so a repeat of the same kind still re-shows the banner. */
  seq: number;
}

export const impactSignal = signal<ImpactState>({ kind: null, seq: 0 });
export const endShiftBlockedKeySignal = signal<string | null>(null);

export interface DeliveryNoticeState {
  messageKey: string | null;
  vars?: Record<string, string | number>;
  seq: number;
}

export const deliveryNoticeSignal = signal<DeliveryNoticeState>({
  messageKey: null,
  vars: undefined,
  seq: 0,
});

/** How long an impact banner stays up before it clears itself. */
const IMPACT_BANNER_MS = 1200;
const DELIVERY_NOTICE_MS = 2800;
const ENCOUNTER_CUE_MS = 10000;
let impactClearTimer: ReturnType<typeof setTimeout> | undefined;
let deliveryNoticeClearTimer: ReturnType<typeof setTimeout> | undefined;
let encounterCueClearTimer: ReturnType<typeof setTimeout> | undefined;

export function showDeliveryNotice(
  messageKey: string,
  vars?: Record<string, string | number>
): void {
  deliveryNoticeSignal.value = {
    messageKey,
    vars,
    seq: deliveryNoticeSignal.value.seq + 1,
  };
  if (deliveryNoticeClearTimer !== undefined) clearTimeout(deliveryNoticeClearTimer);
  deliveryNoticeClearTimer = setTimeout(() => {
    deliveryNoticeSignal.value = { ...deliveryNoticeSignal.value, messageKey: null };
    deliveryNoticeClearTimer = undefined;
  }, DELIVERY_NOTICE_MS);
}

function showImpact(kind: NonNullable<ImpactState['kind']>): void {
  impactSignal.value = { kind, seq: impactSignal.value.seq + 1 };
  if (impactClearTimer !== undefined) clearTimeout(impactClearTimer);
  impactClearTimer = setTimeout(() => {
    impactSignal.value = { ...impactSignal.value, kind: null };
    impactClearTimer = undefined;
  }, IMPACT_BANNER_MS);
}

const MAX_PHONE_OFFER_QUEUE = 3;
const PHONE_OFFER_TIMEOUT_SEC = 15;
let activeOfferQueue: Array<{ request: RideRequest; timeoutRemaining: number }> = [];
let inActiveTrip = false;
let heldRequest: RideRequest | null = null;

const ACTIVE_TRIP_STATES = new Set([
  'Negotiating',
  'Accepted',
  'EnRouteToPickup',
  'PassengerOnboard',
  'EnRouteToDestination',
  'Completing',
  'EmergencyInterrupted',
]);

function syncPhoneOfferState(showHead: boolean): void {
  const head = activeOfferQueue[0];
  phoneSignal.value = {
    ...phoneSignal.value,
    incomingRequest: showHead && head ? head.request : null,
    requestQueue: activeOfferQueue.map((e) => e.request),
    timeoutRemaining: head ? head.timeoutRemaining : 0,
    unreadCount: showHead ? activeOfferQueue.length : 0,
  };
}

/** Ticks down all queued phone offers and expires timed-out requests cleanly. */
export function tickPhoneOffers(dtSec: number): void {
  if (dtSec <= 0 || activeOfferQueue.length === 0) return;
  for (const entry of activeOfferQueue) {
    entry.timeoutRemaining -= dtSec;
  }
  activeOfferQueue = activeOfferQueue.filter((e) => e.timeoutRemaining > 0);
  syncPhoneOfferState(!inActiveTrip && !choiceSignal.value.active);
}

const DIALOGUE_SUBTITLE_MS = 5000;
let dialogueClearTimer: ReturnType<typeof setTimeout> | undefined;

function resetTransientUiState(): void {
  if (dialogueClearTimer !== undefined) {
    clearTimeout(dialogueClearTimer);
    dialogueClearTimer = undefined;
  }
  if (impactClearTimer !== undefined) {
    clearTimeout(impactClearTimer);
    impactClearTimer = undefined;
  }
  if (deliveryNoticeClearTimer !== undefined) {
    clearTimeout(deliveryNoticeClearTimer);
    deliveryNoticeClearTimer = undefined;
  }
  if (encounterCueClearTimer !== undefined) {
    clearTimeout(encounterCueClearTimer);
    encounterCueClearTimer = undefined;
  }
  deliveryNoticeSignal.value = { messageKey: null, vars: undefined, seq: deliveryNoticeSignal.value.seq };
  encounterCueSignal.value = { cueKey: null, encounterId: undefined, seq: encounterCueSignal.value.seq };
  inActiveTrip = false;
  activeOfferQueue = [];
  heldRequest = null;
}

export function bindEventBusToStore(bus: EventBus<GameEvents>): () => void {
  const unsubscribers: Array<() => void> = [];

  resetTransientUiState();

  const closeDisputeChoiceCard = (requestId?: string): void => {
    const cur = choiceSignal.value.instanceId;
    if (!cur?.startsWith('dispute:')) return;
    if (requestId && cur !== `dispute:${requestId}`) return;
    choiceSignal.value = {
      active: false,
      prompt: '',
      promptVars: undefined,
      options: [],
      instanceId: undefined,
    };
  };

  // Audit H-4: wobble and crash feedback reaches the rider, not just the event bus.
  unsubscribers.push(bus.on('bike/collision', (ev) => showImpact(ev.severity)));
  unsubscribers.push(bus.on('bike/wobble', () => showImpact('wobble')));

  const enqueuePhoneOffer = (request: RideRequest): void => {
    const existing = activeOfferQueue.find((e) => e.request.requestId === request.requestId);
    if (existing) {
      existing.request = request;
      existing.timeoutRemaining = PHONE_OFFER_TIMEOUT_SEC;
    } else {
      activeOfferQueue.push({ request, timeoutRemaining: PHONE_OFFER_TIMEOUT_SEC });
      while (activeOfferQueue.length > MAX_PHONE_OFFER_QUEUE) {
        activeOfferQueue.shift();
      }
    }
    syncPhoneOfferState(!inActiveTrip);
  };

  const unsubRideRequested = bus.on('ride/requested', (ev) => {
    if (choiceSignal.value.active) {
      heldRequest = ev.request;
      phoneSignal.value = {
        ...phoneSignal.value,
        unreadCount: phoneSignal.value.unreadCount + 1,
      };
      return;
    }
    enqueuePhoneOffer(ev.request);
  });
  unsubscribers.push(unsubRideRequested);

  const unsubChoiceClosed = choiceSignal.subscribe((choice) => {
    if (choice.active || heldRequest === null) return;
    const request = heldRequest;
    heldRequest = null;
    enqueuePhoneOffer(request);
  });
  unsubscribers.push(unsubChoiceClosed);

  const unsubRideAccepted = bus.on('ride/accepted', (ev) => {
    activeOfferQueue = activeOfferQueue.filter((e) => e.request.requestId !== ev.requestId);
    syncPhoneOfferState(false);
  });
  unsubscribers.push(unsubRideAccepted);

  const unsubRideCancelled = bus.on('ride/cancelled', (ev) => {
    if (heldRequest?.requestId === ev.requestId) {
      heldRequest = null;
    }
    closeDisputeChoiceCard(ev.requestId);
    const prevLen = activeOfferQueue.length;
    activeOfferQueue = activeOfferQueue.filter((e) => e.request.requestId !== ev.requestId);
    if (prevLen !== activeOfferQueue.length || phoneSignal.value.incomingRequest?.requestId === ev.requestId) {
      syncPhoneOfferState(!inActiveTrip && !choiceSignal.value.active);
    }
  });
  unsubscribers.push(unsubRideCancelled);

  const unsubTripState = bus.on('trip/state', (ev) => {
    inActiveTrip = ACTIVE_TRIP_STATES.has(ev.to);
    if (ev.to !== 'Completing') {
      closeDisputeChoiceCard();
    }
    if (ev.to === 'Negotiating') {
      if (ev.requestId) {
        activeOfferQueue = activeOfferQueue.filter((e) => e.request.requestId !== ev.requestId);
      }
      syncPhoneOfferState(false);
    } else if (ev.to === 'RequestAvailable' && activeOfferQueue.length > 0 && !choiceSignal.value.active) {
      syncPhoneOfferState(true);
    }
  });
  unsubscribers.push(unsubTripState);

  const unsubPassengerDialogue = bus.on('passenger/dialogue', (ev) => {
    const subtitle: DialogueSubtitleState = {
      text: ev.text,
      speaker: ev.speaker,
      phase: ev.phase,
    };
    dialogueSubtitleSignal.value = subtitle;
    hudSignal.value = {
      ...hudSignal.value,
      dialogueSubtitle: subtitle,
    };
    if (dialogueClearTimer !== undefined) clearTimeout(dialogueClearTimer);
    dialogueClearTimer = setTimeout(() => {
      dialogueSubtitleSignal.value = null;
      hudSignal.value = { ...hudSignal.value, dialogueSubtitle: null };
      dialogueClearTimer = undefined;
    }, DIALOGUE_SUBTITLE_MS);
  });
  unsubscribers.push(unsubPassengerDialogue);

  const unsubRideDisputed = bus.on('ride/disputed', (ev) => {
    choiceSignal.value = {
      active: true,
      prompt: 'encounter.dispute.body',
      promptVars: { fare: ev.fare, partial: ev.partialFare },
      options: [
        {
          id: 'acceptPartial',
          text: 'encounter.dispute.choice.accept_partial',
          vars: { fare: ev.fare, partial: ev.partialFare },
        },
        {
          id: 'insistFull',
          text: 'encounter.dispute.choice.insist_full',
          vars: { fare: ev.fare, partial: ev.partialFare },
        },
        {
          id: 'reportSupport',
          text: 'encounter.dispute.choice.report_support',
          vars: { fare: ev.fare, partial: ev.partialFare },
        },
      ],
      instanceId: `dispute:${ev.requestId}`,
    };
  });
  unsubscribers.push(unsubRideDisputed);

  const unsubRideDisputeResolved = bus.on('ride/disputeResolved', (ev) => {
    closeDisputeChoiceCard(ev.requestId);
  });
  unsubscribers.push(unsubRideDisputeResolved);

  const unsubComplete = bus.on('ride/completed', (ev) => {
    const newHistoryItem: TripHistoryItem = {
      requestId: ev.requestId,
      passengerName: 'Passenger',
      fare: ev.receipt.fare,
      net: ev.receipt.net,
      rating: ev.receipt.rating ?? 5,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    phoneSignal.value = {
      ...phoneSignal.value,
      tripHistory: [newHistoryItem, ...phoneSignal.value.tripHistory],
      navigationTurn: null,
    };

    // T7.4: the opening tutorial has its own dedicated receipt step for this
    // same event, so skip the general TripSummary overlay while it's active.
    if (!tutorialSignal.value.active) {
      tripSummarySignal.value = ev.receipt;
    }
  });
  unsubscribers.push(unsubComplete);


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

  const clearEncounterCue = (): void => {
    if (encounterCueClearTimer !== undefined) {
      clearTimeout(encounterCueClearTimer);
      encounterCueClearTimer = undefined;
    }
    encounterCueSignal.value = {
      ...encounterCueSignal.value,
      cueKey: null,
      encounterId: undefined,
    };
  };

  const clearEncounterUi = (): void => {
    clearEncounterCue();
    dismissChoiceOutcome();
  };

  const unsubEncounterCue = bus.on('encounter/cue', (ev) => {
    if (dayEndSignal.value.active || endingSignal.value.active) return;
    encounterCueSignal.value = {
      cueKey: ev.cueKey,
      encounterId: ev.encounterId,
      seq: encounterCueSignal.value.seq + 1,
    };
    if (encounterCueClearTimer !== undefined) clearTimeout(encounterCueClearTimer);
    encounterCueClearTimer = setTimeout(() => {
      encounterCueSignal.value = { ...encounterCueSignal.value, cueKey: null, encounterId: undefined };
      encounterCueClearTimer = undefined;
    }, ENCOUNTER_CUE_MS);
  });
  unsubscribers.push(unsubEncounterCue);

  const unsubEncounterCueCleared = bus.on('encounter/cueCleared', () => {
    clearEncounterCue();
  });
  unsubscribers.push(unsubEncounterCueCleared);

  const unsubEncounterStart = bus.on('encounter/started', (ev) => {
    if (dayEndSignal.value.active || endingSignal.value.active) return;
    clearEncounterCue();
    choiceSignal.value = {
      active: true,
      prompt: ev.instance.lineKey,
      options: ev.instance.choices.map((c) => ({
        id: c.id,
        text: c.labelKey,
        isMission: c.isMission,
        riskKey: c.riskKey,
        costHint: c.costHint,
        kind: c.kind,
      })),
      instanceId: ev.instance.id,
      outcomeLineKey: undefined,
    };
  });
  unsubscribers.push(unsubEncounterStart);

  const unsubEncounterEnd = bus.on('encounter/resolved', (ev) => {
    if (ev.outcomeLineKey) {
      choiceSignal.value = {
        ...choiceSignal.value,
        active: true,
        outcomeLineKey: ev.outcomeLineKey,
        options: [],
      };
    } else {
      dismissChoiceOutcome();
    }
  });
  unsubscribers.push(unsubEncounterEnd);

  const unsubBikeSwapped = bus.on('bike/swapped', (ev) => {
    garageSignal.value = {
      ...garageSignal.value,
      currentBikeId: ev.bikeId,
    };
  });
  unsubscribers.push(unsubBikeSwapped);

  const unsubKamalProx = bus.on('player/kamalProximity', (ev) => {
    if (garageSignal.value.atKamalBhai !== ev.atKamalBhai) {
      garageSignal.value = {
        ...garageSignal.value,
        atKamalBhai: ev.atKamalBhai,
      };
    }
  });
  unsubscribers.push(unsubKamalProx);

  const unsubUpgradePurchased = bus.on('upgrade/purchased', (ev) => {
    const owned = garageSignal.value.ownedUpgrades ?? [];
    if (!owned.includes(ev.upgradeId)) {
      garageSignal.value = {
        ...garageSignal.value,
        ownedUpgrades: [...owned, ev.upgradeId],
      };
    }
  });
  unsubscribers.push(unsubUpgradePurchased);

  const unsubDeliveryOffered = bus.on('delivery/offered', (ev) => {
    const existing = phoneSignal.value.availableDeliveries ?? [];
    if (!existing.some((j) => j.id === ev.delivery.id)) {
      phoneSignal.value = {
        ...phoneSignal.value,
        availableDeliveries: [...existing, { ...ev.delivery, status: 'offered' }],
      };
    }
  });
  unsubscribers.push(unsubDeliveryOffered);

  const unsubDeliveryAccepted = bus.on('delivery/accepted', (ev) => {
    const avail = phoneSignal.value.availableDeliveries ?? [];
    const job = avail.find((j) => j.id === ev.deliveryId);
    const active = phoneSignal.value.activeDeliveries ?? [];
    phoneSignal.value = {
      ...phoneSignal.value,
      availableDeliveries: avail.filter((j) => j.id !== ev.deliveryId),
      activeDeliveries: job
        ? [...active.filter((j) => j.id !== ev.deliveryId), { ...job, status: 'accepted' }]
        : active,
    };
  });
  unsubscribers.push(unsubDeliveryAccepted);

  const unsubDeliveryPickedUp = bus.on('delivery/pickedUp', (ev) => {
    const active = phoneSignal.value.activeDeliveries ?? [];
    phoneSignal.value = {
      ...phoneSignal.value,
      activeDeliveries: active.map((j) =>
        j.id === ev.deliveryId ? { ...j, status: 'in_transit' } : j
      ),
    };
  });
  unsubscribers.push(unsubDeliveryPickedUp);

  const unsubDeliveryCompleted = bus.on('delivery/completed', (ev) => {
    const active = phoneSignal.value.activeDeliveries ?? [];
    phoneSignal.value = {
      ...phoneSignal.value,
      activeDeliveries: active.filter((j) => j.id !== ev.deliveryId),
    };
    showDeliveryNotice('delivery.completed', { amount: ev.payout });
  });
  unsubscribers.push(unsubDeliveryCompleted);

  const unsubDeliveryDamaged = bus.on('delivery/damaged', (ev) => {
    const active = phoneSignal.value.activeDeliveries ?? [];
    const job = active.find((j) => j.id === ev.deliveryId);
    const penalty = job?.damagePenalty ?? (job ? Math.round(job.basePayout * 0.6) : 0);
    if (job) {
      phoneSignal.value = {
        ...phoneSignal.value,
        activeDeliveries: active.map((j) =>
          j.id === ev.deliveryId ? { ...j, damaged: true } : j
        ),
      };
    }
    showDeliveryNotice('delivery.damaged', { penalty });
  });
  unsubscribers.push(unsubDeliveryDamaged);

  const unsubDeliveryExpired = bus.on('delivery/expired', (ev) => {
    const active = phoneSignal.value.activeDeliveries ?? [];
    phoneSignal.value = {
      ...phoneSignal.value,
      activeDeliveries: active.filter((j) => j.id !== ev.deliveryId),
    };
    if (ev.reason.toLowerCase().includes('deadline')) {
      showDeliveryNotice('delivery.expired');
    }
  });
  unsubscribers.push(unsubDeliveryExpired);

  const unsubDayEnded = bus.on('day/ended', (ev) => {
    clearEncounterUi();
    dayEndSignal.value = {
      active: true,
      summary: ev.summary,
    };
    phoneSignal.value = {
      ...phoneSignal.value,
      availableDeliveries: [],
      activeDeliveries: [],
    };
  });
  unsubscribers.push(unsubDayEnded);

  const unsubDayStarted = bus.on('day/started', () => {
    clearEncounterUi();
    dayEndSignal.value = {
      active: false,
      summary: null,
    };
  });
  unsubscribers.push(unsubDayStarted);

  const unsubStateRestored = bus.on('state/restored', () => {
    clearEncounterUi();
    negotiationSignal.value = { active: false, session: null, lastResult: null };
    tripSummarySignal.value = null;
    endingSignal.value = { active: false, result: null, choices: undefined };
    dayEndSignal.value = { active: false, summary: null };
    tutorialSignal.value = { active: false, step: 'idle' };
    garageSignal.value = { ...garageSignal.value, open: false };
    journalSignal.value = false;
  });
  unsubscribers.push(unsubStateRestored);

  const unsubEnding = bus.on('ending/reached', (ev) => {
    // Only a real evaluation from the sim opens the ending screen. There is no placeholder result.
    if (!ev.result) return;
    clearEncounterUi();
    endingSignal.value = {
      active: true,
      result: ev.result,
      choices: ev.choices,
    };
  });
  unsubscribers.push(unsubEnding);

  return () => {
    resetTransientUiState();
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

export let onRefuelCallback: (() => void) | null = null;
export let onFuelRescueCallback: (() => void) | null = null;

export function setFuelDispatchers(refuel: () => void, rescue: () => void): void {
  onRefuelCallback = refuel;
  onFuelRescueCallback = rescue;
}

export let onChargePhoneCallback: ((where: 'home' | 'teaStall') => void) | null = null;

export function setChargePhoneDispatcher(charge: (where: 'home' | 'teaStall') => void): void {
  onChargePhoneCallback = charge;
}

export let onBuyBikeCallback: ((bikeId: string, useTradeIn?: boolean) => void) | null = null;
export let onSwitchBikeCallback: ((bikeId: string) => void) | null = null;

export function setBikeDispatchers(
  onBuy: (bikeId: string, useTradeIn?: boolean) => void,
  onSwitch: (bikeId: string) => void
): void {
  onBuyBikeCallback = onBuy;
  onSwitchBikeCallback = onSwitch;
}
