import { describe, it, expect, beforeEach, vi } from 'vitest';
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
    // T7.5: mutate in place (not reassign) — ReputationSystem holds this
    // exact object by reference as its own relationship store.
    Object.assign(gm.story.characterRelationships, {
      char_mintu: 25,
      char_kamal: 15,
      char_ma: 30,
    });
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
    gm.reputationSystem.applyMeter('riderIntegrity', -12, 'karma.test_save', 'char_nabila');
    gm.reputationSystem.changePassengerTrust('char_nabila', -15);
    gm.reputationSystem.addOffAppStrike(2);

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
    expect(restoredSnapshot.reputation?.meters).toEqual(originalSnapshot.reputation?.meters);
    expect(restoredSnapshot.reputation?.karmaLog).toEqual(originalSnapshot.reputation?.karmaLog);
    expect(restoredSnapshot.reputation?.passengerTrust).toEqual(originalSnapshot.reputation?.passengerTrust);
    expect(restoredSnapshot.reputation?.offAppStrikes).toBe(originalSnapshot.reputation?.offAppStrikes);
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

    expect(migrated.version).toBe(CURRENT_SAVE_VERSION);
    expect(migrated.version).toBe(2);
    expect(migrated.clock.day).toBe(2);
    expect(migrated.clock.minutes).toBe(540);
    expect(migrated.economy.cash).toBe(1500);
    expect(migrated.economy.savings).toBe(0);
    expect(migrated.economy.ownedUpgrades).toEqual(['led_headlight']);
    expect(migrated.story.characterRelationships.char_mintu).toBe(15);
    expect(migrated.story.characterRelationships.mintu).toBeUndefined();
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

  it('storage throwing → memory copy kept, but the save is reported as failed', () => {
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

    // The save did not reach storage, so it must not report success. A copy is
    // kept in memory so Continue still works in this session.
    const saveResult = throwingSaveSystem.save(gm, 'slot1');

    expect(saveResult.success).toBe(false);
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
        bonus: 0,
        penalties: 0,
        compensation: 0,
        fuelLiters: 0,
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

  it('latestSave picks the newest readable slot, and null when there is none', () => {
    expect(saveSystem.latestSave()).toBeNull();
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    gm.clock.day = 2;
    saveSystem.save(gm, 'auto');
    now.mockReturnValue(2000);
    gm.clock.day = 5;
    saveSystem.save(gm, 'slot2');
    now.mockRestore();
    memoryStorage.setItem(saveSystem.getSlotKey('slot3'), '{not json');

    const latest = saveSystem.latestSave();
    expect(latest?.slot).toBe('slot2');
    expect(latest?.clock.day).toBe(5);
  });

  it('round-trips DeliveryManager offered/active jobs and loads legacy saves without deliveries', () => {
    gm.economyManager.ownedUpgrades.push('upgrade_luggage_carrier');
    gm.clock.minutes = 600;
    gm.deliveryManager.offer({
      id: 'deliv_save_offered',
      senderNameKey: 'poi.mirpara.tea_stall',
      pickupPoiId: 'poi_mirpara_tea_stall',
      pickupNodeId: 'res_n2_1',
      dropoffNodeId: 'res_n3_0',
      itemType: 'parcel',
      fragile: false,
      basePayout: 140,
      timeLimitMinutes: 20,
      status: 'offered',
    });
    gm.deliveryManager.offer({
      id: 'deliv_save_active',
      senderNameKey: 'poi.mirpara.pharmacy',
      pickupPoiId: 'poi_mirpara_pharmacy',
      pickupNodeId: 'res_n1_2',
      dropoffNodeId: 'res_n2_0',
      itemType: 'medicine',
      fragile: true,
      basePayout: 220,
      timeLimitMinutes: 18,
      status: 'offered',
    });
    expect(gm.dispatch({ type: 'acceptDelivery', jobId: 'deliv_save_active' }).success).toBe(true);

    expect(saveSystem.save(gm, 'slot1').success).toBe(true);
    const loaded = saveSystem.loadGame('slot1');
    expect(loaded.success).toBe(true);
    if (loaded.success) {
      expect(loaded.gm.deliveryManager.getAvailableJobs().map((j) => j.id)).toEqual([
        'deliv_save_offered',
      ]);
      const active = loaded.gm.deliveryManager.getActiveJobs();
      expect(active).toHaveLength(1);
      expect(active[0]?.id).toBe('deliv_save_active');
      expect(active[0]?.pickupDeadlineMinute).toBe(615);
    }

    // Legacy save lacking deliveries property loads cleanly with empty delivery pools
    const rawKey = saveSystem.getSlotKey('slot2');
    const legacy = serialize(gm, 'slot2') as unknown as Record<string, unknown>;
    delete legacy.deliveries;
    memoryStorage.setItem(rawKey, JSON.stringify(legacy));
    const legacyLoaded = saveSystem.loadGame('slot2');
    expect(legacyLoaded.success).toBe(true);
    if (legacyLoaded.success) {
      expect(legacyLoaded.gm.deliveryManager.getAvailableJobs()).toHaveLength(0);
      expect(legacyLoaded.gm.deliveryManager.getActiveJobs()).toHaveLength(0);
    }
  });

  it('validates SaveV2 with SaveV2Schema and preserves all Phase 4/5.1/5.2 subsystems across round-trip', async () => {
    const { SaveV2Schema } = await import('../../../src/sim/schemas');
    const { RoadNetwork } = await import('../../../src/sim/road/RoadNetwork');
    const { GameSession } = await import('../../../src/sim/GameSession');
    const { default: mirparaData } = await import('../../../data/districts/mirpara.json');
    const { default: ch1Missions } = await import('../../../data/missions/ch1.json');

    const road = RoadNetwork.fromDistricts([mirparaData as never]);
    const liveGm = new GameManager({
      seed: 55511,
      mode: 'career',
      data: { missions: ch1Missions as never },
    });
    const session = new GameSession({ gm: liveGm, road, autoRequests: false });

    // Mutate Phase 4/5.1/5.2 state
    liveGm.clock.day = 4;
    liveGm.clock.minutes = 14 * 60;
    liveGm.economyManager.rentMissedCount = 1;
    liveGm.economyManager.refuel(1, 130, 4, 840);
    liveGm.reputationSystem.addOffAppStrike(4);
    liveGm.reputationSystem.setLocalTrust(68);
    liveGm.reputationSystem.applyMeter('riderIntegrity', -10, 'karma.test', 'char_kamal');
    liveGm.reputationSystem.changePassengerTrust('char_nabila', -8);

    // Advance m1_household earnNet partial rawProgress and visitedDistricts
    liveGm.missionManager.activateMission('m1_household');
    liveGm.economyManager.post({
      id: 'tx_earn_partial',
      day: 4,
      minute: 840,
      kind: 'fare',
      amount: 320,
    });
    liveGm.bus.emit('ride/completed', {
      requestId: 'req_visited_test',
      receipt: {
        requestId: 'req_visited_test',
        fare: 120,
        tip: 0,
        commission: 18,
        fuelCost: 5,
        otherCosts: 0,
        bonus: 0,
        penalties: 0,
        compensation: 0,
        fuelLiters: 0.1,
        net: 102,
        durationMin: 4,
        distanceKm: 1,
        rating: 5,
        consequences: [],
      },
      pickupDistrict: 'mirpara',
      destinationDistrict: 'fulgate',
    });

    session.ride.directContacts.add('char_mintu');
    session.ride.activeBikeId = 'used125';
    liveGm.economyManager.currentBikeId = 'used125';
    liveGm.economyManager.ownedBikes = ['old100', 'used125'];

    liveGm.weatherSystem.setWeather('heavyRain');
    liveGm.weatherSystem.update(20, road.getAllSegments(), 4, 840, 3);
    liveGm.eventDirector.evaluate(
      {
        phase: 'roaming',
        minute: 840,
        day: 4,
        weather: 'heavyRain',
        chapter: 2,
        flags: {},
        relationships: {},
        cash: 600,
        speedKmh: 0,
        bikeCondition: 80,
        segment: null,
        activeRequest: null,
        passenger: null,
      },
      liveGm.bus
    );

    const node = road.getAllNodes()[1]!;
    session.bike.x = node.x;
    session.bike.y = 4.5;
    session.bike.z = node.z;
    session.bike.heading = 1.25;

    const saveV2 = serialize(liveGm, 'slot1');
    expect(saveV2.version).toBe(2);
    expect(SaveV2Schema.safeParse(saveV2).success).toBe(true);
    expect(saveV2.economyMeta.rentMissedCount).toBe(1);
    expect(saveV2.economyMeta.txSeq).toBeGreaterThan(0);
    expect(saveV2.rideMeta.offAppStrikes).toBe(1);
    expect(saveV2.rideMeta.directContacts).toContain('char_mintu');
    expect(saveV2.rideMeta.activeBikeId).toBe('used125');
    expect(saveV2.visitedDistricts).toEqual(expect.arrayContaining(['mirpara', 'fulgate']));
    expect(saveV2.bikePose).toEqual({ x: node.x, y: 4.5, z: node.z, heading: 1.25 });

    // Restore into a fresh session with a different mode & seed first
    const freshGm = new GameManager({
      seed: 999,
      mode: 'endless',
      data: { missions: ch1Missions as never },
    });
    const freshSession = new GameSession({ gm: freshGm, road, autoRequests: false });
    const parsed = JSON.parse(JSON.stringify(saveV2));
    const loaded = deserialize(parsed, { missions: ch1Missions as never });
    freshGm.applySnapshot(loaded.snapshot(), parsed.rngState);

    expect(freshGm.mode).toBe('career');
    expect(freshGm.seed).toBe(55511);
    expect(freshGm.economyManager.rentMissedCount).toBe(1);
    expect(freshGm.economyManager.exportMeta().txSeq).toBe(saveV2.economyMeta.txSeq);
    expect(freshSession.ride.offAppStrikes).toBe(1);
    expect(freshSession.ride.directContacts.has('char_mintu')).toBe(true);
    expect(freshSession.ride.activeBikeId).toBe('used125');
    expect(freshGm.missionManager.getVisitedDistricts()).toEqual(
      expect.arrayContaining(['mirpara', 'fulgate'])
    );
    const exportedMissions = freshGm.missionManager.exportState();
    const householdStates = exportedMissions.objectiveStates['m1_household'];
    expect(householdStates?.find((s) => s.id === 'obj_m1_earn')?.rawProgress).toBe(320);
    expect(freshGm.weatherSystem.weather).toBe('heavyRain');
    expect(freshGm.weatherSystem.rainDurationMinutes).toBeCloseTo(20, 4);
    expect(freshSession.bike.x).toBe(node.x);
    expect(freshSession.bike.z).toBe(node.z);
    expect(freshSession.bike.heading).toBe(1.25);
  });

  it('v1 -> v2 migration merges legacy character IDs and seeds missing karma meters & defaults', () => {
    const legacyV1: Record<string, unknown> = {
      version: 1,
      timestamp: 1700000000000,
      slot: 'slot1',
      seed: 777,
      mode: 'career',
      ticks: 240,
      rngState: 888,
      clock: { day: 3, minutes: 615 },
      economy: {
        cash: 950,
        dailyRevenue: 400,
        dailyExpenses: 100,
        fuelLevel: 2.5,
        motorcycleCondition: 78,
        appBalance: 0,
        debt: 200,
        reputation: 4.5,
        savings: 1000,
        phoneBattery: 85,
      },
      story: {
        currentChapter: 2,
        completedMissions: ['m1_first_ride'],
        activeMissions: ['m1_household'],
        characterRelationships: {
          kamal_bhai: 15,
          char_kamal: 25,
          mintu: 50,
          si_morshed: 10,
        },
        promises: [],
        branchFlags: { metPolice: true },
        endingEligibility: {
          independent_rider: false,
          workshop_owner: false,
          trusted_local: false,
          fast_money: false,
          fresh_start: false,
        },
      },
      reputation: {
        rating: 4.5,
        localTrust: 62,
        safetyRecord: { nearMisses: 1, bumps: 0, crashes: 0, infractions: 0 },
        riskScore: 2,
        promises: { kept: 1, broken: 0 },
      },
      bike: { condition: 78, fuelLevel: 2.5 },
      weather: 'cloudy',
      waypointNodeId: null,
    };

    const migrated = migrateSave(legacyV1);
    expect(migrated.version).toBe(2);
    expect(migrated.story.characterRelationships.char_kamal).toBe(40);
    expect(migrated.story.characterRelationships.kamal_bhai).toBeUndefined();
    expect(migrated.story.characterRelationships.char_mintu).toBe(50);
    expect(migrated.story.characterRelationships.mintu).toBeUndefined();
    expect(migrated.story.characterRelationships.char_morshed).toBe(10);
    expect(migrated.story.characterRelationships.char_ma).toBe(80);
    expect(migrated.karmaMeters.publicReputation).toBe(62);
    expect(migrated.karmaMeters.riderIntegrity).toBe(50);
    expect(migrated.karmaMeters.platformStanding).toBe(80);
    expect(migrated.karmaMeters.safetyRecord).toBe(70);
    expect(migrated.karmaLog).toEqual([]);
    expect(migrated.passengerTrust.char_nabila).toBe(70);
    expect(migrated.rideMeta.activeBikeId).toBe('old100');
    expect(migrated.economyMeta).toEqual({ rentMissedCount: 0, txSeq: 0 });
  });

  it('quarantines truncated version 1 and unsupported version 99 saves to .corrupt without crashing listSlots or deserialize', () => {
    saveSystem.save(gm, 'slot1');

    const truncatedV1 = JSON.stringify({ version: 1, timestamp: 123, slot: 'slot2' });
    const unsupportedV99 = JSON.stringify({ version: 99, timestamp: 456, slot: 'slot3', clock: { day: 1, minutes: 420 } });
    memoryStorage.setItem(saveSystem.getSlotKey('slot2'), truncatedV1);
    memoryStorage.setItem(saveSystem.getSlotKey('slot3'), unsupportedV99);

    const res2 = saveSystem.loadGame('slot2');
    expect(res2.success).toBe(false);
    if (!res2.success) {
      expect(res2.reason).toBe('corrupt');
    }
    expect(saveSystem.hasCorruptBackup('slot2')).toBe(true);
    expect(memoryStorage.getItem(saveSystem.getSlotKey('slot2'))).toBeNull();

    const slots = saveSystem.listSlots();
    expect(slots.slot1).not.toBeNull();
    expect(slots.slot2).toBeNull();
    expect(slots.slot3).toBeNull();
    expect(saveSystem.hasCorruptBackup('slot3')).toBe(true);
    expect(memoryStorage.getItem(saveSystem.getSlotKey('slot3'))).toBeNull();
    expect(memoryStorage.getItem(saveSystem.getCorruptKey('slot3'))).toBe(unsupportedV99);
  });

  it('loading a mid-trip save cancels unsettled live ride cleanly to Idle with no double-pay or penalty', async () => {
    const { RoadNetwork } = await import('../../../src/sim/road/RoadNetwork');
    const { GameSession } = await import('../../../src/sim/GameSession');
    const { default: mirparaData } = await import('../../../data/districts/mirpara.json');

    const road = RoadNetwork.fromDistricts([mirparaData as never]);
    const session = new GameSession({ gm, road, autoRequests: false, negotiation: false });
    const nodes = road.getAllNodes();
    const req = {
      requestId: 'req_mid_trip_1',
      passengerId: 'p_mid_1',
      pickupNodeId: nodes[0]!.nodeId,
      destinationNodeId: nodes[1]!.nodeId,
      initialFare: 180,
      estimatedDistance: 1.5,
      estimatedDuration: 6,
      requestedArrivalTime: null,
      bookingType: 'app' as const,
      status: 'WaitingForPickup' as const,
      surge: 1.0,
    };

    session.ride.offer(req);
    expect(session.ride.accept(req.requestId)).toBe(true);
    session.ride.update({ x: nodes[0]!.x, z: nodes[0]!.z, speed: 0, heading: 0 }, 0.016);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');

    const cashBefore = gm.economyManager.cash;
    const ratingBefore = gm.reputationSystem.getAppRating();
    const safetyBefore = gm.reputationSystem.getMeters().safetyRecord;

    const midTripSave = serialize(gm, 'auto');
    expect(midTripSave.rideMeta.hadUnsettledTrip).toBe(true);

    // Reload into live session
    const loaded = deserialize(JSON.parse(JSON.stringify(midTripSave)));
    gm.applySnapshot(loaded.snapshot(), midTripSave.rngState);

    expect(session.ride.getTripState()).toBe('Idle');
    expect(session.ride.getActiveRequest()).toBeNull();
    expect(gm.economyManager.cash).toBe(cashBefore);
    expect(gm.reputationSystem.getAppRating()).toBe(ratingBefore);
    expect(gm.reputationSystem.getMeters().safetyRecord).toBe(safetyBefore);
  });

  it('restores bikePose safely on elevated flyover vs ground segments via segmentAtElevation', async () => {
    const { RoadNetwork } = await import('../../../src/sim/road/RoadNetwork');
    const { GameSession } = await import('../../../src/sim/GameSession');

    const stackedRoad = RoadNetwork.fromDistricts([
      {
        districtId: 'mirpara',
        name: { bn: 'মিরপাড়া', en: 'Mirpara' },
        nodes: [
          { nodeId: 'g1', x: 0, y: 0, z: 0, kind: 'junction' },
          { nodeId: 'g2', x: 100, y: 0, z: 0, kind: 'junction' },
          { nodeId: 'f1', x: 0, y: 6, z: 0, kind: 'junction' },
          { nodeId: 'f2', x: 100, y: 6, z: 0, kind: 'junction' },
        ],
        segments: [
          {
            segmentId: 'seg_ground',
            startNodeId: 'g1',
            endNodeId: 'g2',
            width: 10,
            surfaceCondition: 1,
            trafficDensity: 0.3,
            speedLimit: 40,
            turnRestrictions: [],
            motorcycleAccessible: true,
            pedestrianDensity: 0.2,
            riskLevel: 0.1,
            oneWay: false,
            divided: false,
            lanes: 2,
            roadType: 'main',
            floodSensitivity: 0.1,
            pickupPractical: true,
            district: 'mirpara',
            tags: [],
          },
          {
            segmentId: 'seg_flyover',
            startNodeId: 'f1',
            endNodeId: 'f2',
            width: 10,
            surfaceCondition: 1,
            trafficDensity: 0.3,
            speedLimit: 60,
            turnRestrictions: [],
            motorcycleAccessible: true,
            pedestrianDensity: 0,
            riskLevel: 0.1,
            oneWay: false,
            divided: false,
            lanes: 2,
            roadType: 'flyover',
            floodSensitivity: 0,
            pickupPractical: false,
            district: 'mirpara',
            tags: [],
          },
        ],
        pois: [],
      },
    ]);

    const session = new GameSession({ gm, road: stackedRoad, autoRequests: false });
    session.bike.x = 50;
    session.bike.y = 6;
    session.bike.z = 0;
    session.bike.heading = 0.75;

    const flyoverSave = serialize(gm, 'slot1');
    session.bike.y = 0;
    session.bike.x = 0;
    gm.applySnapshot(deserialize(flyoverSave).snapshot(), flyoverSave.rngState);

    expect(session.bike.x).toBe(50);
    expect(session.bike.y).toBeCloseTo(6, 3);
    expect(session.bike.heading).toBe(0.75);

    // Without y (legacy/partial pose), resolves cleanly against ground elevation
    const groundSave = JSON.parse(JSON.stringify(flyoverSave));
    delete groundSave.bikePose.y;
    gm.applySnapshot(deserialize(groundSave).snapshot(), groundSave.rngState);
    expect(session.bike.y).toBeCloseTo(0, 3);
  });

  it('quota fallback retains existing readable slots and surfaces memory warning banner in SaveSlots', async () => {
    const { SaveSlots } = await import('../../../src/ui/menus/SaveSlots');
    const preExisting = new Map<string, string>();
    const existingSave = serialize(gm, 'slot1');
    preExisting.set('uthao.save.slot1', JSON.stringify(existingSave));

    const quotaStorage: StorageAdapter = {
      isMemoryOnly: false,
      getItem: (k) => preExisting.get(k) ?? null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: (k) => {
        preExisting.delete(k);
      },
    };

    const quotaSystem = new SaveSystem(quotaStorage);
    const res = quotaSystem.save(gm, 'slot2');
    expect(res.success).toBe(false);
    expect(quotaSystem.isMemoryOnly).toBe(true);

    // Existing slot1 remains readable alongside in-memory slot2
    const slots = quotaSystem.listSlots();
    expect(slots.slot1).not.toBeNull();
    expect(slots.slot2).not.toBeNull();

    const vnode = SaveSlots({
      isOpen: true,
      mode: 'save',
      onClose: vi.fn(),
      onSelectSlot: vi.fn(),
      saveSystem: quotaSystem,
    });
    expect(JSON.stringify(vnode)).toContain('memory-warning-banner');
  });

  it('applySnapshot closes stale choiceSignal and negotiationSignal modals, and New Career uses random seed unless ?seed= is set', async () => {
    const { bindEventBusToStore, choiceSignal, negotiationSignal } = await import('../../../src/ui/store');
    const { resolveCareerSeed } = await import('../../../src/ui/freshCareer');

    const unbind = bindEventBusToStore(gm.bus);
    choiceSignal.value = {
      active: true,
      prompt: 'stale.prompt',
      options: [{ id: 'ok', text: 'ok' }],
      instanceId: 'inst_stale',
    };
    negotiationSignal.value = {
      active: true,
      session: { status: 'active' } as never,
      lastResult: null,
    };

    const save = serialize(gm, 'auto');
    gm.applySnapshot(deserialize(save).snapshot(), save.rngState);
    expect(choiceSignal.value.active).toBe(false);
    expect(negotiationSignal.value.active).toBe(false);
    unbind();

    // Seed resolution: ?seed= wins in dev/tests; otherwise randomizes
    expect(resolveCareerSeed('?seed=1337')).toBe(1337);
    const rand1 = resolveCareerSeed('', () => 10101);
    const rand2 = resolveCareerSeed('', () => 20202);
    expect(rand1).toBe(10101);
    expect(rand2).toBe(20202);
    expect(resolveCareerSeed('')).not.toBe(42);
  });
});
