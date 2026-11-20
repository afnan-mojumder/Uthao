import type { PassengerStatus } from '../../core/types';
import { BALANCE } from '../../config/balance';
import { getLanguage, localDigits, t } from '../i18n';
import {
  getHudResetCount,
  HUD_THROTTLE_MS,
  hudSignal,
  sameHudMission,
  sameHudMissionsList,
  updateHudState,
  type DialogueSubtitleState,
  type HudMissionInfo,
  type HudState,
} from '../store';

/** Resolves displayed HUD ETA minutes while keeping 0 min intact near arrival instead of falling back to estimatedDuration. */
export function resolveHudEtaMinutes(
  hasActiveReq: boolean,
  routeEta: number | undefined,
  estimatedDuration: number | undefined
): number | undefined {
  return hasActiveReq ? (routeEta ?? estimatedDuration) : undefined;
}

export interface HudSyncCache {
  readonly patch: Partial<HudState>;
  lastLang: string;
  lastHudPushMs: number;
  lastMissionPollMs: number;
  lastObjKey: string;
  lastPlaceKey: string;
  cachedObjectiveText: string;
  lastDistrictId: string;
  cachedDistrictName: string;
  lastNavKind: string;
  lastNavTextKey: string;
  lastNavDistM: number;
  lastActiveReqId: string;
  lastPassengerView: string;
  lastPassengerMoodBucket: number;
  lastRoadEventId: string;
  lastRoadEventKind: string;
  lastMissionCount: number;
  lastHudResetCount: number;
}

export interface HudSyncInput {
  now: number;
  simStepped: boolean;
  isFirstPerson: boolean;
  districtId?: string;
  canRecoverBike?: boolean;
  gear?: number;
  objectiveKey: string;
  placeKey: string;
  navKind: string;
  navTextKey: string;
  navDistM: number;
  reqId: string;
  passengerStatus: PassengerStatus | 'None';
  passengerNameKey?: string;
  passengerMood?: number;
  roadEventId: string;
  roadEventKind: string;
  roadEventTitles?: Partial<Record<'bn' | 'en', string>>;
  activeMissionCount: number;
  pollMissions: () => { main: HudMissionInfo | null; side: HudMissionInfo[] };
  fare: number | undefined;
  etaMinutes: number | undefined;
  nearStation: boolean;
  chargeSpot: 'home' | 'teaStall' | null;
  todayNetEarnings: number;
  shiftClock: string;
  shiftDay: number;
  rating: number;
  dialogueSubtitle: DialogueSubtitleState | null;
  speedKmh: number;
  fuelL: number;
  fuelMaxL: number;
  conditionPct: number;
}

export function createHudCache(): HudSyncCache {
  return {
    patch: {},
    lastLang: '',
    lastHudPushMs: -Infinity,
    lastMissionPollMs: -Infinity,
    lastObjKey: '',
    lastPlaceKey: '',
    cachedObjectiveText: '',
    lastDistrictId: '',
    cachedDistrictName: '',
    lastNavKind: '',
    lastNavTextKey: '',
    lastNavDistM: -1,
    lastActiveReqId: '',
    lastPassengerView: '',
    lastPassengerMoodBucket: -1,
    lastRoadEventId: '',
    lastRoadEventKind: '',
    lastMissionCount: -1,
    lastHudResetCount: getHudResetCount(),
  };
}

export function resetHudCache(cache: HudSyncCache): void {
  cache.lastLang = '';
  cache.lastHudPushMs = -Infinity;
  cache.lastMissionPollMs = -Infinity;
  cache.lastObjKey = '';
  cache.lastPlaceKey = '';
  cache.cachedObjectiveText = '';
  cache.lastDistrictId = '';
  cache.cachedDistrictName = '';
  cache.lastNavKind = '';
  cache.lastNavTextKey = '';
  cache.lastNavDistM = -1;
  cache.lastActiveReqId = '';
  cache.lastPassengerView = '';
  cache.lastPassengerMoodBucket = -1;
  cache.lastRoadEventId = '';
  cache.lastRoadEventKind = '';
  cache.lastMissionCount = -1;
}

/**
 * Diffs live simulation telemetry against `hudSignal.value` using pre-allocated cache state.
 * Invalidates all cached translations immediately when runtime locale changes (`en` <-> `bn`).
 */
export function syncHudWithCache(cache: HudSyncCache, input: HudSyncInput): boolean {
  const curResetCount = getHudResetCount();
  if (curResetCount !== cache.lastHudResetCount) {
    cache.lastHudResetCount = curResetCount;
    resetHudCache(cache);
  }

  const lang = getLanguage();
  const langChanged = lang !== cache.lastLang;
  if (langChanged) {
    resetHudCache(cache);
    cache.lastLang = lang;
  }

  const cur = hudSignal.value;

  const objChanged =
    langChanged || input.objectiveKey !== cache.lastObjKey || input.placeKey !== cache.lastPlaceKey;
  if (objChanged) {
    cache.lastObjKey = input.objectiveKey;
    cache.lastPlaceKey = input.placeKey;
    cache.cachedObjectiveText = t(input.objectiveKey, {
      place: input.placeKey ? t(input.placeKey) : '',
    });
  }

  const districtId = input.districtId ?? 'mirpara';
  const districtChanged = langChanged || districtId !== cache.lastDistrictId;
  if (districtChanged) {
    cache.lastDistrictId = districtId;
    cache.cachedDistrictName = t(`district.${districtId}`);
  }

  const navChanged =
    langChanged ||
    input.navKind !== cache.lastNavKind ||
    input.navTextKey !== cache.lastNavTextKey ||
    input.navDistM !== cache.lastNavDistM;

  const moodBucket =
    input.passengerMood !== undefined ? Math.round(Math.max(0, Math.min(1, input.passengerMood)) * 20) : -1;

  const paxChanged =
    langChanged ||
    input.reqId !== cache.lastActiveReqId ||
    input.passengerStatus !== cache.lastPassengerView ||
    moodBucket !== cache.lastPassengerMoodBucket;

  const roadEvChanged =
    langChanged ||
    input.roadEventId !== cache.lastRoadEventId ||
    input.roadEventKind !== cache.lastRoadEventKind;

  const shouldPollMissions =
    cache.lastHudPushMs === -Infinity ||
    langChanged ||
    input.activeMissionCount !== cache.lastMissionCount ||
    (input.simStepped && input.now - cache.lastMissionPollMs >= 100);

  let activeMission = cur.activeMission ?? null;
  let activeSideMissions = cur.activeSideMissions;
  let missionsChanged = false;
  if (shouldPollMissions) {
    cache.lastMissionPollMs = input.now;
    cache.lastMissionCount = input.activeMissionCount;
    const hudMissions = input.pollMissions();
    activeMission = hudMissions.main;
    activeSideMissions = hudMissions.side;
    missionsChanged =
      langChanged ||
      !sameHudMission(activeMission, cur.activeMission) ||
      !sameHudMissionsList(activeSideMissions, cur.activeSideMissions);
  }

  const nextGear = input.gear ?? 1;
  const nextCanRecover = input.canRecoverBike ?? true;

  const priorityChanged =
    cache.lastHudPushMs === -Infinity ||
    langChanged ||
    districtChanged ||
    nextGear !== cur.gear ||
    nextCanRecover !== cur.canRecoverBike ||
    input.isFirstPerson !== cur.isFirstPerson ||
    cache.cachedObjectiveText !== cur.objectiveText ||
    navChanged ||
    paxChanged ||
    roadEvChanged ||
    missionsChanged ||
    input.fare !== cur.fare ||
    input.etaMinutes !== cur.etaMinutes ||
    input.nearStation !== cur.nearStation ||
    input.chargeSpot !== cur.chargeSpot ||
    Math.round(input.todayNetEarnings) !== Math.round(cur.todayNetEarnings) ||
    input.shiftClock !== cur.shiftClock ||
    input.shiftDay !== cur.shiftDay ||
    Math.round(input.rating * 100) !== Math.round(cur.rating * 100) ||
    input.dialogueSubtitle !== cur.dialogueSubtitle;

  const telemetryChanged =
    Math.round(input.speedKmh) !== Math.round(cur.speedKmh) ||
    Math.round(input.fuelL * 100) !== Math.round(cur.fuelL * 100) ||
    (input.fuelL === 0) !== (cur.fuelL === 0) ||
    (input.fuelL < BALANCE.FUEL.rescueBelowL) !== (cur.fuelL < BALANCE.FUEL.rescueBelowL) ||
    input.fuelMaxL !== cur.fuelMaxL ||
    Math.round(input.conditionPct) !== Math.round(cur.conditionPct ?? 100);

  if (!priorityChanged && !telemetryChanged) return false;
  if (!priorityChanged && input.now - cache.lastHudPushMs < HUD_THROTTLE_MS) return false;

  let nextTurn = cur.nextTurn ?? null;
  if (navChanged) {
    cache.lastNavKind = input.navKind;
    cache.lastNavTextKey = input.navTextKey;
    cache.lastNavDistM = input.navDistM;
    nextTurn = input.navKind
      ? { direction: input.navKind, text: t(input.navTextKey, { dist: localDigits(input.navDistM) }) }
      : null;
  }

  let passengerStatus = cur.passengerStatus;
  if (paxChanged) {
    cache.lastActiveReqId = input.reqId;
    cache.lastPassengerView = input.passengerStatus;
    cache.lastPassengerMoodBucket = moodBucket;
    if (input.reqId) {
      passengerStatus = {
        status: input.passengerStatus,
        name: input.passengerNameKey ? t(input.passengerNameKey) : t('hud.passenger.on_bike'),
        mood: input.passengerMood,
      };
    } else {
      passengerStatus = undefined;
    }
  }

  let roadEventAlert = cur.roadEventAlert ?? null;
  if (roadEvChanged) {
    cache.lastRoadEventId = input.roadEventId;
    cache.lastRoadEventKind = input.roadEventKind;
    roadEventAlert = input.roadEventId
      ? { title: input.roadEventTitles?.[lang] ?? input.roadEventKind, kind: input.roadEventKind }
      : null;
  }

  const p = cache.patch;
  p.speedKmh = input.speedKmh;
  p.gear = nextGear;
  p.districtId = districtId;
  p.districtName = cache.cachedDistrictName;
  p.canRecoverBike = nextCanRecover;
  p.objectiveText = cache.cachedObjectiveText;
  p.activeMission = activeMission;
  p.activeSideMissions = activeSideMissions;
  p.roadEventAlert = roadEventAlert;
  p.dialogueSubtitle = input.dialogueSubtitle;
  p.fare = input.fare;
  p.fuelL = input.fuelL;
  p.fuelMaxL = input.fuelMaxL;
  p.nearStation = input.nearStation;
  p.conditionPct = input.conditionPct;
  p.todayNetEarnings = input.todayNetEarnings;
  p.shiftClock = input.shiftClock;
  p.shiftDay = input.shiftDay;
  p.rating = input.rating;
  p.isFirstPerson = input.isFirstPerson;
  p.nextTurn = nextTurn;
  p.chargeSpot = input.chargeSpot;
  p.passengerStatus = passengerStatus;
  p.etaMinutes = input.etaMinutes;

  if (updateHudState(p, input.now)) {
    cache.lastHudPushMs = input.now;
    return true;
  }
  return false;
}
