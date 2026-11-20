import { GameManager, type GameData, type SimSnapshot } from '../GameManager';
import { BALANCE } from '../../config/balance';
import { isRushHourMinute } from '../../core/clock';
import type { MeterId } from '../../core/types';
import {
  type AnySave,
  type SaveSlot,
  type SaveV1,
  type SaveV2,
  CURRENT_SAVE_VERSION,
  migrateSave,
} from './migrations';

export type { SaveSlot, SaveV1, SaveV2 };

const SAVE_LEDGER_CAP = 2000;

export interface VisibilityTarget {
  addEventListener(event: string, handler: () => void): void;
  removeEventListener(event: string, handler: () => void): void;
  visibilityState: string;
}

export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  isMemoryOnly?: boolean;
}

export class LocalStorageAdapter implements StorageAdapter {
  isMemoryOnly = false;

  getItem(key: string): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  }

  setItem(key: string, value: string): void {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not defined');
    }
    localStorage.setItem(key, value);
  }

  removeItem(key: string): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  }
}

export class MemoryStorageAdapter implements StorageAdapter {
  isMemoryOnly = true;
  private readonly map = new Map<string, string>();

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  clear(): void {
    this.map.clear();
  }
}

export function createDefaultStorageAdapter(): StorageAdapter {
  try {
    if (typeof localStorage === 'undefined') {
      return new MemoryStorageAdapter();
    }
    const testKey = 'uthao_storage_test';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return new LocalStorageAdapter();
  } catch {
    return new MemoryStorageAdapter();
  }
}

/**
 * Pure serializer from GameManager to SaveV2.
 */
export function serialize(gm: GameManager, slot: SaveSlot = 'auto'): SaveV2 {
  const snap = gm.snapshot();
  const karmaMeters: Record<MeterId, number> = {
    ...BALANCE.KARMA.starts,
    ...(snap.reputation?.meters ?? {}),
  };
  const karmaLog = snap.reputation?.karmaLog
    ? snap.reputation.karmaLog.map((e) => ({ ...e }))
    : [];
  const passengerTrust = snap.reputation?.passengerTrust
    ? { ...snap.reputation.passengerTrust }
    : {};
  const missions = snap.missions ?? gm.missionManager.exportState();
  const visitedDistricts = [...(missions.visitedDistricts ?? [])];
  const rideMeta = snap.rideMeta ?? {
    offAppStrikes: snap.reputation?.offAppStrikes ?? 0,
    appSuspendedUntilDay: snap.reputation?.suspendedUntilDay ?? 0,
    directContacts: [],
    activeBikeId: snap.economy.currentBikeId ?? 'old100',
    hadUnsettledTrip: false,
  };
  const economyMeta = snap.economyMeta ?? gm.economyManager.exportMeta();
  const eventDirectorState = snap.eventDirectorState ?? gm.eventDirector.exportState();
  const weatherState = snap.weatherState ?? gm.weatherSystem.exportState();
  const bikePose = snap.bikePose ?? { x: 0, y: 0, z: 0, heading: 0 };
  const ledger = snap.ledger ? snap.ledger.slice(-SAVE_LEDGER_CAP) : [];

  return {
    version: CURRENT_SAVE_VERSION,
    timestamp: Date.now(),
    slot,
    seed: snap.seed,
    mode: snap.mode,
    ticks: snap.ticks,
    rngState: gm.rng.getState(),
    clock: {
      day: snap.clock.day,
      minutes: snap.clock.minutes,
    },
    economy: { ...snap.economy },
    story: {
      currentChapter: snap.story.currentChapter,
      completedMissions: [...snap.story.completedMissions],
      activeMissions: [...snap.story.activeMissions],
      characterRelationships: { ...snap.story.characterRelationships },
      promises: [...snap.story.promises],
      branchFlags: { ...snap.story.branchFlags },
      endingEligibility: { ...snap.story.endingEligibility },
    },
    reputation: snap.reputation
      ? {
          rating: snap.reputation.rating,
          ratingsHistory: snap.reputation.ratingsHistory ?? [],
          localTrust: snap.reputation.localTrust,
          safetyRecord: { ...snap.reputation.safetyRecord },
          riskScore: snap.reputation.riskScore,
          promises: { ...snap.reputation.promises },
          meters: { ...karmaMeters },
          karmaLog: karmaLog.map((e) => ({ ...e })),
          passengerTrust: { ...passengerTrust },
          offAppStrikes: rideMeta.offAppStrikes,
          suspendedUntilDay: rideMeta.appSuspendedUntilDay,
          ...(snap.reputation.wasWarned !== undefined
            ? { wasWarned: snap.reputation.wasWarned }
            : {}),
          ...(snap.reputation.wasSuspended !== undefined
            ? { wasSuspended: snap.reputation.wasSuspended }
            : {}),
          ...(snap.reputation.ratingSuspensionCleared !== undefined
            ? { ratingSuspensionCleared: snap.reputation.ratingSuspensionCleared }
            : {}),
          ...(snap.reputation.karmaSeq !== undefined
            ? { karmaSeq: snap.reputation.karmaSeq }
            : {}),
        }
      : {
          rating: 5.0,
          ratingsHistory: [],
          localTrust: karmaMeters.publicReputation,
          safetyRecord: { nearMisses: 0, bumps: 0, crashes: 0, infractions: 0 },
          riskScore: 0,
          promises: { kept: 0, broken: 0 },
          meters: { ...karmaMeters },
          karmaLog: [],
          passengerTrust: {},
          offAppStrikes: rideMeta.offAppStrikes,
          suspendedUntilDay: rideMeta.appSuspendedUntilDay,
        },
    bike: {
      condition: snap.economy.motorcycleCondition,
      fuelLevel: snap.economy.fuelLevel,
      engineCondition: snap.economy.engineCondition,
      tiresCondition: snap.economy.tiresCondition,
      brakesCondition: snap.economy.brakesCondition,
      kmSinceOilChange: snap.economy.kmSinceOilChange,
      ownedUpgrades: snap.economy.ownedUpgrades ? [...snap.economy.ownedUpgrades] : [],
      installedCosmetics: snap.economy.installedCosmetics ? { ...snap.economy.installedCosmetics } : {},
    },
    weather: snap.weather,
    waypointNodeId: snap.waypointNodeId,
    karmaMeters,
    karmaLog,
    passengerTrust,
    visitedDistricts,
    missions,
    rideMeta,
    economyMeta,
    eventDirectorState,
    weatherState,
    bikePose,
    roadEvents: snap.roadEvents ? [...snap.roadEvents] : [],
    ledger,
    settledRequests: snap.settledRequests ? [...snap.settledRequests] : [],
    requestSeq: snap.requestSeq ?? 0,
    negotiationHistory: snap.negotiationHistory ?? 0,
    shiftEnded: snap.shiftEnded ?? false,
    todayRentPosted: snap.todayRentPosted ?? 0,
    todayRentDebt: snap.todayRentDebt,
    todayRentAutoFlagged: snap.todayRentAutoFlagged,
    rentDelayedByCommand: snap.rentDelayedByCommand,
    todayCompletedRides: snap.todayCompletedRides ?? 0,
    deliveries: snap.deliveries,
  };
}

/**
 * Migrates, Zod-validates, and deserializes any SaveV1/SaveV2 to GameManager.
 */
export function deserialize(save: AnySave, gameData?: GameData): GameManager {
  const validated = migrateSave(save as Record<string, unknown>);
  const gm = new GameManager({
    seed: validated.seed,
    mode: validated.mode,
    data: gameData ?? {},
  });

  const meters: Record<MeterId, number> = {
    ...BALANCE.KARMA.starts,
    ...validated.karmaMeters,
  };
  const karmaLog = validated.karmaLog.map((e) => ({ ...e }));
  const passengerTrust = { ...validated.passengerTrust };
  const visitedDistricts =
    validated.missions.visitedDistricts.length > 0
      ? [...validated.missions.visitedDistricts]
      : [...validated.visitedDistricts];

  const snapshot: SimSnapshot = {
    seed: validated.seed,
    mode: validated.mode,
    ticks: validated.ticks,
    paused: false,
    clock: {
      day: validated.clock.day,
      minutes: validated.clock.minutes,
      hhmm: `${String(Math.floor(validated.clock.minutes / 60)).padStart(2, '0')}:${String(
        validated.clock.minutes % 60
      ).padStart(2, '0')}`,
      isRushHour: isRushHourMinute(validated.clock.minutes),
    },
    economy: { ...validated.economy },
    story: {
      currentChapter: validated.story.currentChapter,
      completedMissions: [...validated.story.completedMissions],
      activeMissions: [...validated.story.activeMissions],
      characterRelationships: { ...validated.story.characterRelationships },
      promises: [...validated.story.promises],
      branchFlags: { ...validated.story.branchFlags },
      endingEligibility: { ...validated.story.endingEligibility },
    },
    weather: validated.weather,
    waypointNodeId: validated.waypointNodeId,
    reputation: {
      rating: validated.reputation.rating,
      ratingsHistory: [...validated.reputation.ratingsHistory],
      localTrust: validated.reputation.localTrust,
      safetyRecord: { ...validated.reputation.safetyRecord },
      riskScore: validated.reputation.riskScore,
      promises: { ...validated.reputation.promises },
      meters,
      karmaLog,
      passengerTrust,
      offAppStrikes: validated.rideMeta.offAppStrikes,
      suspendedUntilDay: validated.rideMeta.appSuspendedUntilDay,
      ...(validated.reputation.wasWarned !== undefined
        ? { wasWarned: validated.reputation.wasWarned }
        : {}),
      ...(validated.reputation.wasSuspended !== undefined
        ? { wasSuspended: validated.reputation.wasSuspended }
        : {}),
      ...(validated.reputation.ratingSuspensionCleared !== undefined
        ? { ratingSuspensionCleared: validated.reputation.ratingSuspensionCleared }
        : {}),
      ...(validated.reputation.karmaSeq !== undefined
        ? { karmaSeq: validated.reputation.karmaSeq }
        : {}),
    },
    roadEvents: validated.roadEvents ? [...validated.roadEvents] : [],
    ledger: validated.ledger ?? [],
    settledRequests: validated.settledRequests ?? [],
    requestSeq: validated.requestSeq ?? 0,
    negotiationHistory: validated.negotiationHistory ?? 0,
    shiftEnded: validated.shiftEnded ?? false,
    todayRentPosted: validated.todayRentPosted ?? 0,
    todayRentDebt: validated.todayRentDebt,
    todayRentAutoFlagged: validated.todayRentAutoFlagged,
    rentDelayedByCommand: validated.rentDelayedByCommand,
    todayCompletedRides: validated.todayCompletedRides ?? 0,
    deliveries: validated.deliveries,
    missions: {
      visitedDistricts,
      objectiveStates: validated.missions.objectiveStates ?? {},
      activeMissions: validated.missions.activeMissions ?? [...validated.story.activeMissions],
      completedMissions:
        validated.missions.completedMissions ?? [...validated.story.completedMissions],
      currentDay: validated.missions.currentDay ?? validated.clock.day,
    },
    rideMeta: {
      ...validated.rideMeta,
      directContacts: [...validated.rideMeta.directContacts],
    },
    economyMeta: { ...validated.economyMeta },
    eventDirectorState: {
      ...validated.eventDirectorState,
      cooldowns: { ...validated.eventDirectorState.cooldowns },
      firedToday: [...validated.eventDirectorState.firedToday],
    },
    weatherState: {
      ...validated.weatherState,
      segmentFloodLevels: { ...validated.weatherState.segmentFloodLevels },
    },
    bikePose: { ...validated.bikePose },
  };

  gm.applySnapshot(snapshot, validated.rngState);
  return gm;
}

export type SaveResult =
  | { success: true; slot: SaveSlot; timestamp: number }
  | { success: false; reason: string; error?: string };

export type LoadResult =
  | { success: true; slot: SaveSlot; save: SaveV2 }
  | {
      success: false;
      reason: 'notFound' | 'corrupt';
      corruptBackupKey?: string;
      error?: string;
    };

export class SaveSystem {
  storage: StorageAdapter;
  isMemoryOnly: boolean;
  /** In-tab fallback overlay used when backing storage refuses writes (e.g. QuotaExceededError).
   * Preserves all pre-existing readable slots in `storage` alongside in-memory saves. */
  private readonly memoryOverlay = new Map<string, string>();
  private readonly deletedKeys = new Set<string>();

  constructor(storageAdapter?: StorageAdapter) {
    this.storage = storageAdapter ?? createDefaultStorageAdapter();
    this.isMemoryOnly = !!this.storage.isMemoryOnly;
  }

  getSlotKey(slot: SaveSlot): string {
    return `uthao.save.${slot}`;
  }

  getCorruptKey(slot: SaveSlot): string {
    return `uthao.save.${slot}.corrupt`;
  }

  private readRaw(key: string): string | null {
    if (this.deletedKeys.has(key)) return null;
    if (this.memoryOverlay.has(key)) {
      return this.memoryOverlay.get(key) ?? null;
    }
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }

  private removeRaw(key: string): void {
    this.memoryOverlay.delete(key);
    this.deletedKeys.add(key);
    try {
      this.storage.removeItem(key);
    } catch {
      // Ignore removal error on restricted/quota storage
    }
  }

  private quarantineCorrupt(slot: SaveSlot, raw: string): string {
    const key = this.getSlotKey(slot);
    const corruptKey = this.getCorruptKey(slot);
    try {
      this.storage.setItem(corruptKey, raw);
      this.memoryOverlay.delete(corruptKey);
      this.deletedKeys.delete(corruptKey);
    } catch {
      // Even when quota is full, preserve corrupt copy in overlay and remove the broken slot.
      this.memoryOverlay.set(corruptKey, raw);
      this.deletedKeys.delete(corruptKey);
    }
    this.removeRaw(key);
    return corruptKey;
  }

  save(gm: GameManager, slot: SaveSlot = 'auto'): SaveResult {
    const key = this.getSlotKey(slot);
    const saveObj = serialize(gm, slot);
    const jsonStr = JSON.stringify(saveObj);

    try {
      this.storage.setItem(key, jsonStr);
      this.memoryOverlay.delete(key);
      this.deletedKeys.delete(key);
      return { success: true, slot, timestamp: saveObj.timestamp };
    } catch (err) {
      // The browser refused the write (quota, private window). Keep a copy in
      // the in-memory overlay so Continue works and pre-existing readable slots
      // in backing storage remain intact, while reporting the write as failed.
      this.isMemoryOnly = true;
      this.memoryOverlay.set(key, jsonStr);
      this.deletedKeys.delete(key);
      return {
        success: false,
        reason: 'storageFailed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  load(slot: SaveSlot): LoadResult {
    const key = this.getSlotKey(slot);
    const raw = this.readRaw(key);

    if (!raw) {
      return { success: false, reason: 'notFound' };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new Error('Save content is not an object');
      }
    } catch (err) {
      const corruptKey = this.quarantineCorrupt(slot, raw);
      return {
        success: false,
        reason: 'corrupt',
        corruptBackupKey: corruptKey,
        error: err instanceof Error ? err.message : String(err),
      };
    }

    try {
      const migrated = migrateSave(parsed);
      return { success: true, slot, save: migrated };
    } catch (err) {
      const corruptKey = this.quarantineCorrupt(slot, raw);
      return {
        success: false,
        reason: 'corrupt',
        corruptBackupKey: corruptKey,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  loadGame(
    slot: SaveSlot,
    gameData?: GameData
  ): { success: true; gm: GameManager; save: SaveV2 } | { success: false; reason: string; corruptBackupKey?: string } {
    const res = this.load(slot);
    if (!res.success) {
      return res;
    }
    const gm = deserialize(res.save, gameData);
    return { success: true, gm, save: res.save };
  }

  hasSave(slot: SaveSlot): boolean {
    const key = this.getSlotKey(slot);
    return !!this.readRaw(key);
  }

  hasAnySave(): boolean {
    const slots: SaveSlot[] = ['auto', 'slot1', 'slot2', 'slot3'];
    return slots.some((s) => this.hasSave(s));
  }

  /** The most recently written readable save across all slots, or null. */
  latestSave(): SaveV2 | null {
    let latest: SaveV2 | null = null;
    for (const save of Object.values(this.listSlots())) {
      if (save && (!latest || save.timestamp > latest.timestamp)) latest = save;
    }
    return latest;
  }

  /** The slot holding the most recently written readable save, or null. Continue loads this. */
  latestSlot(): SaveSlot | null {
    let best: SaveSlot | null = null;
    let bestTime = -Infinity;
    for (const [slot, save] of Object.entries(this.listSlots()) as [SaveSlot, SaveV2 | null][]) {
      if (save && save.timestamp > bestTime) {
        best = slot;
        bestTime = save.timestamp;
      }
    }
    return best;
  }

  hasCorruptBackup(slot: SaveSlot): boolean {
    const corruptKey = this.getCorruptKey(slot);
    return !!this.readRaw(corruptKey);
  }

  deleteSave(slot: SaveSlot): void {
    const key = this.getSlotKey(slot);
    this.removeRaw(key);
  }

  listSlots(): Record<SaveSlot, SaveV2 | null> {
    const slots: SaveSlot[] = ['auto', 'slot1', 'slot2', 'slot3'];
    const result: Partial<Record<SaveSlot, SaveV2 | null>> = {};

    for (const slot of slots) {
      const loaded = this.load(slot);
      result[slot] = loaded.success ? loaded.save : null;
    }

    return result as Record<SaveSlot, SaveV2 | null>;
  }

  /**
   * Autosaves on ride and day events, and when the tab is hidden. `canAutosave`
   * says whether a career is under way; on the title screen the game is blank,
   * and saving it would overwrite the real career.
   */
  bindAutosave(
    gm: GameManager,
    visibilityTarget?: VisibilityTarget,
    canAutosave: () => boolean = () => true
  ): () => void {
    const unsubRides = gm.bus.on('ride/completed', () => {
      if (gm.isRestoringSnapshot) return;
      this.save(gm, 'auto');
    });

    const unsubDays = gm.bus.on('day/ended', () => {
      if (gm.isRestoringSnapshot) return;
      this.save(gm, 'auto');
    });

    // Sleeping starts the next morning: save it, so a reload does not land on last night.
    const unsubMorning = gm.bus.on('day/started', () => {
      if (gm.isRestoringSnapshot) return;
      this.save(gm, 'auto');
    });

    let onVisibilityChange: (() => void) | undefined;

    if (visibilityTarget) {
      onVisibilityChange = () => {
        if (visibilityTarget.visibilityState === 'hidden') {
          gm.paused = true;
          if (canAutosave()) this.save(gm, 'auto');
        }
      };
      visibilityTarget.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      unsubRides();
      unsubDays();
      unsubMorning();
      if (visibilityTarget && onVisibilityChange) {
        visibilityTarget.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }
}
