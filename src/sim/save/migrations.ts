import type { WeatherKind, SafetyRecord, PlayerEconomy, StoryState } from '../../core/types';
import type { ActiveRoadEvent } from '../world/RoadEvents';

export type SaveSlot = 'auto' | 'slot1' | 'slot2' | 'slot3';

export const CURRENT_SAVE_VERSION = 1;

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
}

export type AnySave = SaveV1 | Record<string, unknown>;

export const migrations: Record<number, (legacy: Record<string, unknown>) => SaveV1> = {
  /**
   * Migration 0 -> 1:
   * Migrates unversioned or v0 prototype saves to SaveV1.
   * Guarantees default fallbacks for missing economy, story, bike, and reputation fields.
   */
  0: (legacy: Record<string, unknown>): SaveV1 => {
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
};

/**
 * Migrates any raw save data up to CURRENT_SAVE_VERSION.
 */
export function migrateSave(raw: Record<string, unknown>): SaveV1 {
  let current: Record<string, unknown> = { ...raw };
  let ver = typeof current.version === 'number' ? current.version : 0;

  while (ver < CURRENT_SAVE_VERSION) {
    const migrationFn = migrations[ver];
    if (!migrationFn) {
      throw new Error(`No migration registered for version ${ver}`);
    }
    const migrated = migrationFn(current);
    current = migrated as unknown as Record<string, unknown>;
    ver = migrated.version;
  }

  return current as unknown as SaveV1;
}
