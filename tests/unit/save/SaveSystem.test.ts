import { describe, it, expect, beforeEach } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import {
  SaveSystem,
  serialize,
  deserialize,
  MemoryStorageAdapter,
  type StorageAdapter,
  type VisibilityTarget,
} from '../../../src/sim/save/SaveSystem';
import type { DaySummary } from '../../../src/core/types';
import { migrateSave, CURRENT_SAVE_VERSION } from '../../../src/sim/save/migrations';

describe('SaveSystem (T4.9)', () => {
  let gm: GameManager;
  let memoryStorage: MemoryStorageAdapter;
  let saveSystem: SaveSystem;

  beforeEach(() => {
    gm = new GameManager({
      seed: 98765,
      mode: 'career',
      data: {},
    });
    memoryStorage = new MemoryStorageAdapter();
    saveSystem = new SaveSystem(memoryStorage);
  });

  it('round-trip preserves snapshot equality', () => {
    // Advance simulation state
    gm.clock.day = 3;
    gm.clock.minutes = 10 * 60 + 30; // 10:30 AM
    gm.ticks = 1500;
    gm.paused = false;
    gm.weather = 'lightRain';
    gm.weatherSystem.setWeather('lightRain');
    gm.waypointNodeId = 'node_farmgate_1';

    // Modify economy
    gm.economyManager.cash = 3450;
    gm.economyManager.savings = 5000;
    gm.economyManager.debt = 1200;
    gm.economyManager.fuelLevel = 3.5;
    gm.economyManager.engineCondition = 75;
    gm.economyManager.tiresCondition = 70;
    gm.economyManager.brakesCondition = 82;
    gm.economyManager.kmSinceOilChange = 45;
    gm.economyManager.ownedUpgrades = ['led_headlight', 'suspension_shocks'];
    gm.economyManager.installedCosmetics = { paint: '#10b981', seatCover: 'leather' };

    // Modify story & reputation
    gm.story.currentChapter = 2;
    gm.story.completedMissions = ['m0_first_ride', 'm1_fuel_up'];
    gm.story.activeMissions = ['m2_delivery'];
    gm.story.characterRelationships = { mintu: 25, kamal_bhai: 15, ma: 30 };
    gm.story.branchFlags = { joinedScheme: false, metPolice: true };

    gm.reputationSystem.recordTripRating(4.8);
    gm.reputationSystem.recordTripRating(4.6);
    gm.reputationSystem.setLocalTrust(65);
    gm.reputationSystem.recordNearMiss();
    gm.reputationSystem.recordCollision('bump');
    gm.reputationSystem.recordInfraction();
    gm.reputationSystem.addRiskScore(3);
    gm.reputationSystem.recordPromiseKept();
    gm.reputationSystem.recordPromiseKept();

    const originalSnapshot = gm.snapshot();

    // Serialize
    const saveV1 = serialize(gm, 'slot1');
    expect(saveV1.version).toBe(CURRENT_SAVE_VERSION);
    expect(saveV1.slot).toBe('slot1');

    // Deserialize into fresh GameManager
    const restoredGm = deserialize(saveV1, {});
    const restoredSnapshot = restoredGm.snapshot();

    // Round-trip snapshot equality check
    expect(restoredSnapshot.seed).toBe(originalSnapshot.seed);
    expect(restoredSnapshot.mode).toBe(originalSnapshot.mode);
    expect(restoredSnapshot.ticks).toBe(originalSnapshot.ticks);
    expect(restoredSnapshot.clock.day).toBe(originalSnapshot.clock.day);
    expect(restoredSnapshot.clock.minutes).toBe(originalSnapshot.clock.minutes);
    expect(restoredSnapshot.clock.hhmm).toBe(originalSnapshot.clock.hhmm);
    expect(restoredSnapshot.weather).toBe(originalSnapshot.weather);
    expect(restoredSnapshot.waypointNodeId).toBe(originalSnapshot.waypointNodeId);

    // Economy equality
    expect(restoredSnapshot.economy.cash).toBe(originalSnapshot.economy.cash);
    expect(restoredSnapshot.economy.savings).toBe(originalSnapshot.economy.savings);
    expect(restoredSnapshot.economy.debt).toBe(originalSnapshot.economy.debt);
    expect(restoredSnapshot.economy.fuelLevel).toBe(originalSnapshot.economy.fuelLevel);
    expect(restoredSnapshot.economy.ownedUpgrades).toEqual(originalSnapshot.economy.ownedUpgrades);
    expect(restoredSnapshot.economy.installedCosmetics).toEqual(originalSnapshot.economy.installedCosmetics);

    // Story equality
    expect(restoredSnapshot.story.currentChapter).toBe(originalSnapshot.story.currentChapter);
    expect(restoredSnapshot.story.completedMissions).toEqual(originalSnapshot.story.completedMissions);
    expect(restoredSnapshot.story.activeMissions).toEqual(originalSnapshot.story.activeMissions);
    expect(restoredSnapshot.story.characterRelationships).toEqual(originalSnapshot.story.characterRelationships);
    expect(restoredSnapshot.story.branchFlags).toEqual(originalSnapshot.story.branchFlags);

    // Reputation equality
    expect(restoredSnapshot.reputation?.rating).toBe(originalSnapshot.reputation?.rating);
    expect(restoredSnapshot.reputation?.localTrust).toBe(originalSnapshot.reputation?.localTrust);
    expect(restoredSnapshot.reputation?.riskScore).toBe(originalSnapshot.reputation?.riskScore);
    expect(restoredSnapshot.reputation?.promises).toEqual(originalSnapshot.reputation?.promises);
    expect(restoredSnapshot.reputation?.safetyRecord).toEqual(originalSnapshot.reputation?.safetyRecord);
  });

  it('v0 fixture migrates to current', () => {
    // Legacy v0 prototype save (missing several v1 fields like savings, installedCosmetics, ratingsHistory)
    const v0Fixture = {
      timestamp: 1698000000000,
      slot: 'auto',
      seed: 42,
      mode: 'career',
      ticks: 800,
      clock: { day: 2, minutes: 540 },
      cash: 1500,
      rating: 4.75,
      localTrust: 40,
      characters: { mintu: 15 },
      bike: {
        condition: 85,
        fuelLevel: 2.1,
      },
      upgrades: ['led_headlight'],
    };

    const migrated = migrateSave(v0Fixture);

    expect(migrated.version).toBe(1);
    expect(migrated.clock.day).toBe(2);
    expect(migrated.clock.minutes).toBe(540);
    expect(migrated.economy.cash).toBe(1500);
    expect(migrated.economy.savings).toBe(0);
    expect(migrated.economy.ownedUpgrades).toEqual(['led_headlight']);
    expect(migrated.story.characterRelationships).toEqual({ mintu: 15 });
    expect(migrated.reputation.rating).toBe(4.75);
    expect(migrated.reputation.localTrust).toBe(40);
    expect(migrated.bike.fuelLevel).toBe(2.1);
  });

  it('corrupt JSON → backup + error result, no throw', () => {
    const slot = 'slot2';
    const corruptPayload = '{"version": 1, "invalid_json": true, incomplete...';

    // Directly insert corrupt payload into storage
    memoryStorage.setItem(saveSystem.getSlotKey(slot), corruptPayload);

    // Must not throw error
    const result = saveSystem.load(slot);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe('corrupt');
      expect(result.corruptBackupKey).toBe(saveSystem.getCorruptKey(slot));
    }

    // Verify corrupt data was moved to .corrupt backup key
    expect(memoryStorage.getItem(saveSystem.getCorruptKey(slot))).toBe(corruptPayload);
    // And original key was cleared
    expect(memoryStorage.getItem(saveSystem.getSlotKey(slot))).toBeNull();
    expect(saveSystem.hasCorruptBackup(slot)).toBe(true);
  });

  it('storage throwing → memory fallback', () => {
    // Failing storage adapter simulating localStorage quota limit exceeded
    const failingStorage: StorageAdapter = {
      isMemoryOnly: false,
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError: localStorage limit reached');
      },
      removeItem: () => {},
    };

    const throwingSaveSystem = new SaveSystem(failingStorage);
    expect(throwingSaveSystem.isMemoryOnly).toBe(false);

    // Save should catch throw, switch adapter to memory fallback, and succeed
    const saveResult = throwingSaveSystem.save(gm, 'slot1');

    expect(saveResult.success).toBe(true);
    expect(throwingSaveSystem.isMemoryOnly).toBe(true);
    expect(throwingSaveSystem.hasSave('slot1')).toBe(true);
  });

  it('autosaves on ride completed and day end', () => {
    saveSystem.bindAutosave(gm);

    expect(saveSystem.hasSave('auto')).toBe(false);

    // Trigger ride/completed event
    gm.bus.emit('ride/completed', {
      requestId: 'req_123',
      receipt: {
        requestId: 'req_123',
        fare: 150,
        tip: 20,
        rating: 5,
        commission: 22,
        fuelCost: 15,
        otherCosts: 0,
        net: 140,
        durationMin: 10,
        distanceKm: 2.5,
        consequences: [],
      },
    });

    expect(saveSystem.hasSave('auto')).toBe(true);
    let loaded = saveSystem.load('auto');
    expect(loaded.success).toBe(true);

    // Clear auto save
    saveSystem.deleteSave('auto');
    expect(saveSystem.hasSave('auto')).toBe(false);

    const daySummary: DaySummary = {
      day: 1,
      revenue: 150,
      expenses: 50,
      net: 100,
      ratingDelta: 0,
      completedRides: 1,
      relationshipsDelta: {},
    };

    // Trigger day/ended event
    gm.bus.emit('day/ended', {
      day: 1,
      summary: daySummary,
    });

    expect(saveSystem.hasSave('auto')).toBe(true);
    loaded = saveSystem.load('auto');
    expect(loaded.success).toBe(true);
  });

  it('bindAutosave pauses sim and autosaves on hidden visibilitychange', () => {
    // Mock Document with visibilityState
    let visibilityState = 'visible';
    const listeners: Record<string, () => void> = {};

    const mockTarget: VisibilityTarget = {
      get visibilityState() {
        return visibilityState;
      },
      addEventListener: (event: string, fn: () => void) => {
        listeners[event] = fn;
      },
      removeEventListener: (event: string) => {
        delete listeners[event];
      },
    };

    const unbind = saveSystem.bindAutosave(gm, mockTarget);

    gm.paused = false;
    expect(saveSystem.hasSave('auto')).toBe(false);

    // Switch visibility to hidden
    visibilityState = 'hidden';
    listeners['visibilitychange']?.();

    // Verify simulation paused and autosaved
    expect(gm.paused).toBe(true);
    expect(saveSystem.hasSave('auto')).toBe(true);

    unbind();
  });
});
