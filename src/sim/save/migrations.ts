import type {
  Transaction,
  WeatherKind,
  SafetyRecord,
  PlayerEconomy,
  StoryState,
  MeterId,
  KarmaEvent,
  BikeId,
} from '../../core/types';
import { clamp } from '../../core/math';
import { BALANCE } from '../../config/balance';
import type { DeliverySnapshot } from '../delivery/DeliveryManager';
import type { ActiveRoadEvent } from '../world/RoadEvents';
import type { MissionSaveState } from '../mission/MissionManager';
import type { RideMetaSave } from '../ride/RideManager';
import type { EventDirectorState } from '../events/EventDirector';
import type { WeatherSystemState } from '../world/WeatherSystem';
import type { BikePoseSnapshot, EconomyMetaSnapshot } from '../GameManager';
import { CHARACTERS, canonicalCharacterId } from '../passenger/PassengerAI';
import { SaveV1Schema, SaveV2Schema } from '../schemas';

export type SaveSlot = 'auto' | 'slot1' | 'slot2' | 'slot3';

export const CURRENT_SAVE_VERSION = 2;

export interface SaveV1 {
  version: 1;
  timestamp: number;
  slot: SaveSlot;
  seed: number;
  mode: 'career' | 'endless';
  ticks: number;
  rngState: number;
  clock: {
    day: number;
    minutes: number;
  };
  economy: PlayerEconomy;
  story: StoryState;
  reputation: {
    rating: number;
    ratingsHistory?: number[];
    localTrust: number;
    safetyRecord: SafetyRecord;
    riskScore: number;
    promises: { kept: number; broken: number };
    meters?: Partial<Record<MeterId, number>>;
    karmaLog?: KarmaEvent[];
    passengerTrust?: Record<string, number>;
    offAppStrikes?: number;
    suspendedUntilDay?: number;
    wasWarned?: boolean;
    wasSuspended?: boolean;
    ratingSuspensionCleared?: boolean;
    karmaSeq?: number;
  };
  bike: {
    condition: number;
    fuelLevel: number;
    engineCondition?: number;
    tiresCondition?: number;
    brakesCondition?: number;
    kmSinceOilChange?: number;
    ownedUpgrades?: string[];
    installedCosmetics?: { paint?: string; seatCover?: string };
  };
  weather: WeatherKind;
  waypointNodeId: string | null;
  roadEvents?: ActiveRoadEvent[];
  ledger?: Transaction[];
  settledRequests?: string[];
  requestSeq?: number;
  negotiationHistory?: number;
  shiftEnded?: boolean;
  todayRentPosted?: number;
  todayRentDebt?: number;
  todayRentAutoFlagged?: boolean;
  rentDelayedByCommand?: boolean;
  deliveries?: DeliverySnapshot;
  missions?: MissionSaveState;
}

export interface SaveV2 {
  version: 2;
  timestamp: number;
  slot: SaveSlot;
  seed: number;
  mode: 'career' | 'endless';
  ticks: number;
  rngState: number;
  clock: {
    day: number;
    minutes: number;
  };
  economy: PlayerEconomy;
  story: StoryState;
  reputation: {
    rating: number;
    ratingsHistory: number[];
    localTrust: number;
    safetyRecord: SafetyRecord;
    riskScore: number;
    promises: { kept: number; broken: number };
    meters?: Partial<Record<MeterId, number>>;
    karmaLog?: KarmaEvent[];
    passengerTrust?: Record<string, number>;
    offAppStrikes?: number;
    suspendedUntilDay?: number;
    wasWarned?: boolean;
    wasSuspended?: boolean;
    ratingSuspensionCleared?: boolean;
    karmaSeq?: number;
  };
  bike: {
    condition: number;
    fuelLevel: number;
    engineCondition?: number;
    tiresCondition?: number;
    brakesCondition?: number;
    kmSinceOilChange?: number;
    ownedUpgrades?: string[];
    installedCosmetics?: { paint?: string; seatCover?: string };
  };
  weather: WeatherKind;
  waypointNodeId: string | null;
  karmaMeters: Record<MeterId, number>;
  karmaLog: KarmaEvent[];
  passengerTrust: Record<string, number>;
  visitedDistricts: string[];
  missions: MissionSaveState;
  rideMeta: RideMetaSave;
  economyMeta: EconomyMetaSnapshot;
  eventDirectorState: EventDirectorState;
  weatherState: WeatherSystemState;
  bikePose: BikePoseSnapshot;
  roadEvents?: ActiveRoadEvent[];
  ledger?: Transaction[];
  settledRequests?: string[];
  requestSeq?: number;
  negotiationHistory?: number;
  shiftEnded?: boolean;
  todayRentPosted?: number;
  todayRentDebt?: number;
  todayRentAutoFlagged?: boolean;
  rentDelayedByCommand?: boolean;
  todayCompletedRides?: number;
  deliveries?: DeliverySnapshot;
}

export type AnySave = SaveV1 | SaveV2 | Record<string, unknown>;

const VALID_METER_IDS = new Set<MeterId>([
  'riderIntegrity',
  'publicReputation',
  'platformStanding',
  'criminalExposure',
  'evidenceExposure',
  'safetyRecord',
]);

function isMeterId(val: string): val is MeterId {
  return VALID_METER_IDS.has(val as MeterId);
}

function normalizePassengerTrustKey(rawId: string): string {
  const stripped = rawId.startsWith('pass_char_') ? rawId.slice(5) : rawId;
  return canonicalCharacterId(stripped);
}

function mergeCharacterRelationships(rawRels: Record<string, number>): Record<string, number> {
  const merged: Record<string, number> = {};
  const legacyAcc: Record<string, number> = {};

  for (const [rawId, val] of Object.entries(rawRels)) {
    if (typeof val !== 'number' || !Number.isFinite(val)) continue;
    const canon = canonicalCharacterId(rawId);
    if (canon === rawId) {
      merged[canon] = clamp(val, BALANCE.TRUST.relationshipMin, BALANCE.TRUST.relationshipMax);
    } else {
      legacyAcc[canon] = (legacyAcc[canon] ?? 0) + val;
    }
  }

  for (const [canon, legacyVal] of Object.entries(legacyAcc)) {
    if (canon in merged) {
      merged[canon] = clamp(
        merged[canon]! + legacyVal,
        BALANCE.TRUST.relationshipMin,
        BALANCE.TRUST.relationshipMax
      );
    } else {
      merged[canon] = clamp(
        legacyVal,
        BALANCE.TRUST.relationshipMin,
        BALANCE.TRUST.relationshipMax
      );
    }
  }

  for (const def of CHARACTERS) {
    if (!(def.id in merged)) {
      merged[def.id] = clamp(
        def.initialRelationship ?? 0,
        BALANCE.TRUST.relationshipMin,
        BALANCE.TRUST.relationshipMax
      );
    }
  }

  return merged;
}

function seedKarmaMeters(
  localTrust: number,
  rawMeters?: Partial<Record<MeterId, number>>
): Record<MeterId, number> {
  const meters: Record<MeterId, number> = {
    ...BALANCE.KARMA.starts,
    publicReputation: clamp(localTrust, BALANCE.KARMA.min, BALANCE.KARMA.max),
  };
  if (rawMeters) {
    for (const [k, v] of Object.entries(rawMeters)) {
      if (isMeterId(k) && typeof v === 'number' && Number.isFinite(v)) {
        meters[k] = clamp(v, BALANCE.KARMA.min, BALANCE.KARMA.max);
      }
    }
  }
  return meters;
}

function seedPassengerTrust(rawTrust?: Record<string, number>): Record<string, number> {
  const trust: Record<string, number> = {};
  for (const def of CHARACTERS) {
    if (typeof def.trustInRider === 'number' && Number.isFinite(def.trustInRider)) {
      trust[def.id] = clamp(
        Math.round(def.trustInRider * 100),
        BALANCE.KARMA.min,
        BALANCE.KARMA.max
      );
    }
  }
  if (rawTrust) {
    for (const [k, v] of Object.entries(rawTrust)) {
      if (typeof v === 'number' && Number.isFinite(v)) {
        trust[normalizePassengerTrustKey(k)] = clamp(v, BALANCE.KARMA.min, BALANCE.KARMA.max);
      }
    }
  }
  return trust;
}

function hasRecognizableV0Fields(legacy: Record<string, unknown>): boolean {
  return (
    'clock' in legacy ||
    'economy' in legacy ||
    'cash' in legacy ||
    'story' in legacy ||
    'reputation' in legacy ||
    'day' in legacy
  );
}

export const migrations: Record<number, (legacy: Record<string, unknown>) => AnySave> = {
  /**
   * Migration 0 -> 1:
   * Migrates unversioned or v0 prototype saves to SaveV1.
   * Guarantees default fallbacks for missing economy, story, bike, and reputation fields.
   */
  0: (legacy: Record<string, unknown>): SaveV1 => {
    if (!hasRecognizableV0Fields(legacy)) {
      throw new Error('Unrecognized v0 save payload');
    }

    const clock = (legacy.clock as { day?: number; minutes?: number } | undefined) ?? {};
    const legacyEconomy = (legacy.economy as Partial<PlayerEconomy> | undefined) ?? {};
    const legacyBike = (legacy.bike as { condition?: number; fuelLevel?: number } | undefined) ?? {};
    const legacyStory = (legacy.story as Partial<StoryState> | undefined) ?? {};
    const legacyRep = (legacy.reputation as Record<string, unknown> | undefined) ?? {};

    const economy: PlayerEconomy = {
      cash: legacyEconomy.cash ?? (legacy.cash as number) ?? 600,
      dailyRevenue: legacyEconomy.dailyRevenue ?? 0,
      dailyExpenses: legacyEconomy.dailyExpenses ?? 0,
      fuelLevel: legacyEconomy.fuelLevel ?? legacyBike.fuelLevel ?? 1.2,
      motorcycleCondition: legacyEconomy.motorcycleCondition ?? legacyBike.condition ?? 80,
      appBalance: legacyEconomy.appBalance ?? 0,
      debt: legacyEconomy.debt ?? 0,
      reputation: legacyEconomy.reputation ?? (legacy.rating as number) ?? 5.0,
      savings: legacyEconomy.savings ?? (legacy.savings as number) ?? 0,
      phoneBattery: legacyEconomy.phoneBattery ?? 100,
      engineCondition: legacyEconomy.engineCondition ?? 80,
      tiresCondition: legacyEconomy.tiresCondition ?? 80,
      brakesCondition: legacyEconomy.brakesCondition ?? 80,
      kmSinceOilChange: legacyEconomy.kmSinceOilChange ?? 0,
      ownedUpgrades: legacyEconomy.ownedUpgrades ?? (legacy.upgrades as string[]) ?? [],
      installedCosmetics: legacyEconomy.installedCosmetics ?? {},
    };

    const story: StoryState = {
      currentChapter: legacyStory.currentChapter ?? 1,
      completedMissions: legacyStory.completedMissions ? [...legacyStory.completedMissions] : [],
      activeMissions: legacyStory.activeMissions ? [...legacyStory.activeMissions] : [],
      characterRelationships: legacyStory.characterRelationships
        ? { ...legacyStory.characterRelationships }
        : ((legacy.characters as Record<string, number>) ?? {}),
      promises: legacyStory.promises ? [...legacyStory.promises] : [],
      branchFlags: legacyStory.branchFlags ? { ...legacyStory.branchFlags } : {},
      endingEligibility: legacyStory.endingEligibility
        ? { ...legacyStory.endingEligibility }
        : {
            independent_rider: false,
            workshop_owner: false,
            trusted_local: false,
            fast_money: false,
            fresh_start: false,
          },
    };

    const safetyRecord: SafetyRecord = {
      nearMisses: ((legacyRep.safetyRecord as SafetyRecord | undefined)?.nearMisses) ?? 0,
      bumps: ((legacyRep.safetyRecord as SafetyRecord | undefined)?.bumps) ?? 0,
      crashes: ((legacyRep.safetyRecord as SafetyRecord | undefined)?.crashes) ?? 0,
      infractions: ((legacyRep.safetyRecord as SafetyRecord | undefined)?.infractions) ?? 0,
    };

    const reputation = {
      rating: (legacyRep.rating as number) ?? (legacy.rating as number) ?? 5.0,
      ratingsHistory: (legacyRep.ratingsHistory as number[]) ?? [],
      localTrust: (legacyRep.localTrust as number) ?? (legacy.localTrust as number) ?? 30,
      safetyRecord,
      riskScore: (legacyRep.riskScore as number) ?? 0,
      promises: (legacyRep.promises as { kept: number; broken: number }) ?? { kept: 0, broken: 0 },
    };

    return {
      version: 1,
      timestamp: (legacy.timestamp as number) ?? Date.now(),
      slot: (legacy.slot as SaveSlot) ?? 'auto',
      seed: (legacy.seed as number) ?? 12345,
      mode: (legacy.mode as 'career' | 'endless') ?? 'career',
      ticks: (legacy.ticks as number) ?? 0,
      rngState: (legacy.rngState as number) ?? (legacy.seed as number) ?? 12345,
      clock: {
        day: clock.day ?? (legacy.day as number) ?? 1,
        minutes: clock.minutes ?? (legacy.minutes as number) ?? 420,
      },
      economy,
      story,
      reputation,
      bike: {
        condition: economy.motorcycleCondition,
        fuelLevel: economy.fuelLevel,
        engineCondition: economy.engineCondition,
        tiresCondition: economy.tiresCondition,
        brakesCondition: economy.brakesCondition,
        kmSinceOilChange: economy.kmSinceOilChange,
        ownedUpgrades: economy.ownedUpgrades,
        installedCosmetics: economy.installedCosmetics,
      },
      weather: (legacy.weather as WeatherKind) ?? 'clear',
      waypointNodeId: (legacy.waypointNodeId as string | null) ?? null,
      roadEvents: (legacy.roadEvents as ActiveRoadEvent[]) ?? [],
    };
  },

  /**
   * Migration 1 -> 2:
   * Validates v1 structure with SaveV1Schema, merges legacy character IDs
   * (e.g. `kamal_bhai` -> `char_kamal`), seeds missing karma meters & passengerTrust
   * from BALANCE.KARMA and data/characters.json, and fills SaveV2 metadata defaults.
   */
  1: (rawV1: Record<string, unknown>): SaveV2 => {
    const v1 = SaveV1Schema.parse(rawV1) as SaveV1;
    const mergedRelationships = mergeCharacterRelationships(v1.story.characterRelationships);
    const karmaMeters = seedKarmaMeters(v1.reputation.localTrust, v1.reputation.meters);
    const passengerTrust = seedPassengerTrust(v1.reputation.passengerTrust);
    const karmaLog: KarmaEvent[] = (v1.reputation.karmaLog ?? []).map((e) => ({
      ...e,
      ...(e.subjectId ? { subjectId: canonicalCharacterId(e.subjectId) } : {}),
    }));
    const visitedDistricts = [...(v1.missions?.visitedDistricts ?? [])];
    const activeBikeId: BikeId = v1.economy.currentBikeId ?? 'old100';

    return {
      version: 2,
      timestamp: v1.timestamp,
      slot: v1.slot,
      seed: v1.seed,
      mode: v1.mode,
      ticks: v1.ticks,
      rngState: v1.rngState,
      clock: { ...v1.clock },
      economy: {
        ...v1.economy,
        currentBikeId: activeBikeId,
        ownedBikes: v1.economy.ownedBikes ? [...v1.economy.ownedBikes] : [activeBikeId],
      },
      story: {
        currentChapter: v1.story.currentChapter,
        completedMissions: [...v1.story.completedMissions],
        activeMissions: [...v1.story.activeMissions],
        characterRelationships: mergedRelationships,
        promises: v1.story.promises.map((p) => ({
          ...p,
          characterId: canonicalCharacterId(p.characterId),
        })),
        branchFlags: { ...v1.story.branchFlags },
        endingEligibility: {
          independent_rider: v1.story.endingEligibility?.independent_rider ?? false,
          workshop_owner: v1.story.endingEligibility?.workshop_owner ?? false,
          trusted_local: v1.story.endingEligibility?.trusted_local ?? false,
          fast_money: v1.story.endingEligibility?.fast_money ?? false,
          fresh_start: v1.story.endingEligibility?.fresh_start ?? false,
        },
      },
      reputation: {
        rating: v1.reputation.rating,
        ratingsHistory: v1.reputation.ratingsHistory ? [...v1.reputation.ratingsHistory] : [],
        localTrust: karmaMeters.publicReputation,
        safetyRecord: { ...v1.reputation.safetyRecord },
        riskScore: v1.reputation.riskScore,
        promises: { ...v1.reputation.promises },
        meters: { ...karmaMeters },
        karmaLog: karmaLog.map((e) => ({ ...e })),
        passengerTrust: { ...passengerTrust },
        offAppStrikes: v1.reputation.offAppStrikes ?? 0,
        suspendedUntilDay: v1.reputation.suspendedUntilDay ?? 0,
        wasWarned: v1.reputation.wasWarned ?? false,
        wasSuspended: v1.reputation.wasSuspended ?? false,
        ratingSuspensionCleared: v1.reputation.ratingSuspensionCleared ?? false,
        karmaSeq: v1.reputation.karmaSeq ?? karmaLog.length,
      },
      bike: { ...v1.bike },
      weather: v1.weather,
      waypointNodeId: v1.waypointNodeId,
      karmaMeters,
      karmaLog,
      passengerTrust,
      visitedDistricts,
      missions: {
        visitedDistricts: [...visitedDistricts],
        objectiveStates: v1.missions?.objectiveStates ? { ...v1.missions.objectiveStates } : {},
        activeMissions: v1.missions?.activeMissions
          ? [...v1.missions.activeMissions]
          : [...v1.story.activeMissions],
        completedMissions: v1.missions?.completedMissions
          ? [...v1.missions.completedMissions]
          : [...v1.story.completedMissions],
        currentDay: v1.missions?.currentDay ?? v1.clock.day,
      },
      rideMeta: {
        offAppStrikes: v1.reputation.offAppStrikes ?? 0,
        appSuspendedUntilDay: v1.reputation.suspendedUntilDay ?? 0,
        directContacts: [],
        activeBikeId,
        hadUnsettledTrip: false,
      },
      economyMeta: {
        rentMissedCount: 0,
        txSeq: 0,
      },
      eventDirectorState: {
        cooldowns: {},
        firedToday: [],
        lastEvaluationMinute: -1,
        hasEvaluatedOnce: false,
        nextGlobalEncounterMinute: 0,
      },
      weatherState: {
        weather: v1.weather,
        roadWetness: v1.weather === 'lightRain' || v1.weather === 'heavyRain' ? 1.0 : 0.0,
        rainDurationMinutes: v1.weather === 'heavyRain' ? 30 : 0,
        segmentFloodLevels: {},
        manualOverride: false,
      },
      bikePose: { x: 0, y: 0, z: 0, heading: 0 },
      roadEvents: v1.roadEvents ? [...v1.roadEvents] : [],
      ledger: v1.ledger ? [...v1.ledger] : [],
      settledRequests: v1.settledRequests ? [...v1.settledRequests] : [],
      requestSeq: v1.requestSeq ?? 0,
      negotiationHistory: v1.negotiationHistory ?? 0,
      shiftEnded: v1.shiftEnded ?? false,
      todayRentPosted: v1.todayRentPosted ?? 0,
      todayRentDebt: v1.todayRentDebt,
      todayRentAutoFlagged: v1.todayRentAutoFlagged,
      rentDelayedByCommand: v1.rentDelayedByCommand,
      todayCompletedRides: 0,
      deliveries: v1.deliveries,
    };
  },
};

/**
 * Migrates and Zod-validates any raw save data up to CURRENT_SAVE_VERSION.
 * Rejects unsupported versions (e.g. > CURRENT_SAVE_VERSION) and malformed payloads.
 */
export function migrateSave(raw: Record<string, unknown>): SaveV2 {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Save payload must be a plain object');
  }

  let current: Record<string, unknown> = { ...raw };
  let ver: number;
  if (current.version === undefined) {
    ver = 0;
  } else if (
    typeof current.version === 'number' &&
    Number.isInteger(current.version) &&
    current.version >= 0 &&
    current.version <= CURRENT_SAVE_VERSION
  ) {
    ver = current.version;
  } else {
    throw new Error(`Unsupported save version: ${String(current.version)}`);
  }

  while (ver < CURRENT_SAVE_VERSION) {
    const migrationFn = migrations[ver];
    if (!migrationFn) {
      throw new Error(`No migration registered for version ${ver}`);
    }
    const migrated = migrationFn(current);
    current = migrated as unknown as Record<string, unknown>;
    ver = (migrated as { version: number }).version;
  }

  return SaveV2Schema.parse(current) as SaveV2;
}
