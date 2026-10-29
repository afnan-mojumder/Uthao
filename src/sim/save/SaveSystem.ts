import { GameManager, type GameData, type SimSnapshot } from '../GameManager';
import {
  type SaveSlot,
  type SaveV1,
  migrateSave,
} from './migrations';

export type { SaveSlot, SaveV1 };

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
    const testKey = '__uthao_storage_test__';
    localStorage.setItem(testKey, '1');
    localStorage.removeItem(testKey);
    return new LocalStorageAdapter();
  } catch {
    return new MemoryStorageAdapter();
  }
}

/**
 * Pure serializer from GameManager to SaveV1.
 */
export function serialize(gm: GameManager, slot: SaveSlot = 'auto'): SaveV1 {
  const snap = gm.snapshot();
  return {
    version: 1,
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
          ratingsHistory: gm.reputationSystem.getRatingsHistory(),
          localTrust: snap.reputation.localTrust,
          safetyRecord: { ...snap.reputation.safetyRecord },
          riskScore: snap.reputation.riskScore,
          promises: { ...snap.reputation.promises },
        }
      : {
          rating: 5.0,
          ratingsHistory: [],
          localTrust: 30,
          safetyRecord: { nearMisses: 0, bumps: 0, crashes: 0, infractions: 0 },
          riskScore: 0,
          promises: { kept: 0, broken: 0 },
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
    roadEvents: snap.roadEvents ? [...snap.roadEvents] : [],
  };
}

/**
 * Pure deserializer from SaveV1 to GameManager.
 */
export function deserialize(save: SaveV1, gameData?: GameData): GameManager {
  const gm = new GameManager({
    seed: save.seed,
    mode: save.mode,
    data: gameData ?? {},
  });

  const snapshot: SimSnapshot = {
    seed: save.seed,
    mode: save.mode,
    ticks: save.ticks,
    paused: false,
    clock: {
      day: save.clock.day,
      minutes: save.clock.minutes,
      hhmm: `${String(Math.floor(save.clock.minutes / 60)).padStart(2, '0')}:${String(
        save.clock.minutes % 60
      ).padStart(2, '0')}`,
      isRushHour:
        (save.clock.minutes >= 8 * 60 && save.clock.minutes <= 11 * 60) ||
        (save.clock.minutes >= 17 * 60 && save.clock.minutes <= 20 * 60),
    },
    economy: { ...save.economy },
    story: {
      currentChapter: save.story.currentChapter,
      completedMissions: [...save.story.completedMissions],
      activeMissions: [...save.story.activeMissions],
      characterRelationships: { ...save.story.characterRelationships },
      promises: [...save.story.promises],
      branchFlags: { ...save.story.branchFlags },
      endingEligibility: { ...save.story.endingEligibility },
    },
    weather: save.weather,
    waypointNodeId: save.waypointNodeId,
    reputation: {
      rating: save.reputation.rating,
      localTrust: save.reputation.localTrust,
      safetyRecord: { ...save.reputation.safetyRecord },
      riskScore: save.reputation.riskScore,
      promises: { ...save.reputation.promises },
    },
    roadEvents: save.roadEvents ? [...save.roadEvents] : [],
  };

  gm.applySnapshot(snapshot, save.rngState);
  return gm;
}

export type SaveResult =
  | { success: true; slot: SaveSlot; timestamp: number }
  | { success: false; reason: string; error?: string };

export type LoadResult =
  | { success: true; slot: SaveSlot; save: SaveV1 }
  | {
      success: false;
      reason: 'notFound' | 'corrupt';
      corruptBackupKey?: string;
      error?: string;
    };

export class SaveSystem {
  storage: StorageAdapter;
  isMemoryOnly: boolean;

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

  save(gm: GameManager, slot: SaveSlot = 'auto'): SaveResult {
    const key = this.getSlotKey(slot);
    const saveObj = serialize(gm, slot);
    const jsonStr = JSON.stringify(saveObj);

    try {
      this.storage.setItem(key, jsonStr);
      return { success: true, slot, timestamp: saveObj.timestamp };
    } catch (err) {
      // Storage throwing -> memory fallback
      if (!this.storage.isMemoryOnly) {
        const mem = new MemoryStorageAdapter();
        this.storage = mem;
        this.isMemoryOnly = true;
        this.storage.setItem(key, jsonStr);
        return { success: true, slot, timestamp: saveObj.timestamp };
      }
      return {
        success: false,
        reason: 'storageFailed',
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  load(slot: SaveSlot): LoadResult {
    const key = this.getSlotKey(slot);
    const raw = this.storage.getItem(key);

    if (!raw) {
      return { success: false, reason: 'notFound' };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Save content is not an object');
      }
    } catch (err) {
      // Corrupt save handling: move to backup
      const corruptKey = this.getCorruptKey(slot);
      try {
        this.storage.setItem(corruptKey, raw);
        this.storage.removeItem(key);
      } catch {
        // Ignore backup store error if quota reached
      }
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
      const corruptKey = this.getCorruptKey(slot);
      try {
        this.storage.setItem(corruptKey, raw);
        this.storage.removeItem(key);
      } catch {
        // Ignore backup store error
      }
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
  ): { success: true; gm: GameManager; save: SaveV1 } | { success: false; reason: string; corruptBackupKey?: string } {
    const res = this.load(slot);
    if (!res.success) {
      return res;
    }
    const gm = deserialize(res.save, gameData);
    return { success: true, gm, save: res.save };
  }

  hasSave(slot: SaveSlot): boolean {
    const key = this.getSlotKey(slot);
    return !!this.storage.getItem(key);
  }

  hasAnySave(): boolean {
    const slots: SaveSlot[] = ['auto', 'slot1', 'slot2', 'slot3'];
    return slots.some((s) => this.hasSave(s));
  }

  hasCorruptBackup(slot: SaveSlot): boolean {
    const corruptKey = this.getCorruptKey(slot);
    return !!this.storage.getItem(corruptKey);
  }

  deleteSave(slot: SaveSlot): void {
    const key = this.getSlotKey(slot);
    this.storage.removeItem(key);
  }

  listSlots(): Record<SaveSlot, SaveV1 | null> {
    const slots: SaveSlot[] = ['auto', 'slot1', 'slot2', 'slot3'];
    const result: Partial<Record<SaveSlot, SaveV1 | null>> = {};

    for (const slot of slots) {
      const loaded = this.load(slot);
      result[slot] = loaded.success ? loaded.save : null;
    }

    return result as Record<SaveSlot, SaveV1 | null>;
  }



  /**
   * Binds autosaving on:
   * 1. ride/completed
   * 2. day/ended
   * 3. visibilitychange hidden
   */
  bindAutosave(gm: GameManager, visibilityTarget?: VisibilityTarget): () => void {
    const unsubRides = gm.bus.on('ride/completed', () => {
      this.save(gm, 'auto');
    });

    const unsubDays = gm.bus.on('day/ended', () => {
      this.save(gm, 'auto');
    });

    let onVisibilityChange: (() => void) | undefined;

    if (visibilityTarget) {
      onVisibilityChange = () => {
        if (visibilityTarget.visibilityState === 'hidden') {
          gm.paused = true;
          this.save(gm, 'auto');
        }
      };
      visibilityTarget.addEventListener('visibilitychange', onVisibilityChange);
    }

    return () => {
      unsubRides();
      unsubDays();
      if (visibilityTarget && onVisibilityChange) {
        visibilityTarget.removeEventListener('visibilitychange', onVisibilityChange);
      }
    };
  }
}
