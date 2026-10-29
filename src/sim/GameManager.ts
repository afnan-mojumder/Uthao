import { EventBus, type GameEvents } from '../core/events';
import { GameClock, TIME_SCALE } from '../core/clock';
import { Rng } from '../core/rng';
import { WeatherSystem } from './world/WeatherSystem';
import {
  SIM_DT,
  MAX_FRAME_DT,
  MAX_SIM_STEPS_PER_FRAME,
} from '../config/constants';
import { BALANCE } from '../config/balance';
import type { Command, CommandResult } from '../core/commands';
import type {
  DaySummary,
  PlayerEconomy,
  StoryState,
  WeatherKind,
  TransactionKind,
} from '../core/types';
import { EventDirector } from './events/EventDirector';
import { EconomyManager } from './economy/EconomyManager';
import type { EncounterDef } from './schemas';
import type { EncounterContext } from './events/conditions';
import type { EffectContext } from './events/effects';
import routeEncounters from '../../data/encounters/route.json';
import pickupEncounters from '../../data/encounters/pickup.json';
import paymentEncounters from '../../data/encounters/payment.json';
import bikeEncounters from '../../data/encounters/bike.json';
import crimeEncounters from '../../data/encounters/crime.json';
import passengerEncounters from '../../data/encounters/passenger.json';
import { ReputationSystem } from './reputation/ReputationSystem';
import type { SafetyRecord } from '../core/types';
import { RoadEventManager, type ActiveRoadEvent } from './world/RoadEvents';
import defaultUpgrades from '../../data/upgrades.json';
import type { RepairItem, UpgradeDef } from './economy/maintenance';
import { MissionManager } from './mission/MissionManager';
import type { MissionDef, EndingDef } from './schemas';
import ch1Missions from '../../data/missions/ch1.json';
import ch2Missions from '../../data/missions/ch2.json';
import ch4Missions from '../../data/missions/ch4.json';
import endingsData from '../../data/endings.json';

const DEFAULT_ENCOUNTERS: EncounterDef[] = [
  ...routeEncounters,
  ...pickupEncounters,
  ...paymentEncounters,
  ...bikeEncounters,
  ...passengerEncounters,
  ...crimeEncounters,
] as EncounterDef[];

export interface GameData {
  districts?: unknown;
  archetypes?: unknown;
  encounters?: EncounterDef[];
  [key: string]: unknown;
}

export interface GameManagerOptions {
  seed: number;
  mode: 'career' | 'endless';
  data: GameData;
}

export interface SimSnapshot {
  seed: number;
  mode: 'career' | 'endless';
  ticks: number;
  paused: boolean;
  clock: {
    day: number;
    minutes: number;
    hhmm: string;
    isRushHour: boolean;
  };
  economy: PlayerEconomy;
  story: StoryState;
  weather: WeatherKind;
  waypointNodeId: string | null;
  reputation?: {
    rating: number;
    localTrust: number;
    safetyRecord: SafetyRecord;
    riskScore: number;
    promises: { kept: number; broken: number };
  };
  roadEvents?: ActiveRoadEvent[];
}

export class GameManager {
  readonly seed: number;
  readonly mode: 'career' | 'endless';
  readonly data: GameData;

  readonly bus: EventBus<GameEvents>;
  readonly rng: Rng;
  readonly clock: GameClock;
  readonly weatherSystem: WeatherSystem;
  readonly economyManager: EconomyManager;
  readonly eventDirector: EventDirector;
  readonly reputationSystem: ReputationSystem;
  readonly roadEvents: RoadEventManager;
  readonly missionManager: MissionManager;

  paused: boolean = false;
  accumulator: number = 0;
  ticks: number = 0;

  weather: WeatherKind = 'clear';
  waypointNodeId: string | null = null;
  isNavigating: boolean = false;
  shiftEnded: boolean = false;
  homeNodeId: string = 'res_n2_0';
  playerNodeId: string = 'res_n2_0';
  atKamalBhai: boolean = false;
  playerDistFromHomeM: number = 0;
  todayCompletedRides: number = 0;
  todayStartRating: number = 5.0;
  todayRelationshipsStart: Record<string, number> = {};

  isNearKamalBhai(): boolean {
    return this.atKamalBhai || this.playerNodeId === 'poi_mirpara_garage';
  }

  economy: PlayerEconomy = {
    cash: 600,
    dailyRevenue: 0,
    dailyExpenses: 0,
    fuelLevel: 1.2,
    motorcycleCondition: 80,
    appBalance: 0,
    debt: 0,
    reputation: 5.0,
    savings: 0,
    phoneBattery: 100,
  };

  story: StoryState = {
    currentChapter: 1,
    completedMissions: [],
    activeMissions: [],
    characterRelationships: {},
    promises: [],
    branchFlags: {},
    endingEligibility: {
      independent_rider: false,
      workshop_owner: false,
      trusted_local: false,
      fast_money: false,
      fresh_start: false,
    },
  };

  constructor(opts: GameManagerOptions) {
    this.seed = opts.seed;
    this.mode = opts.mode;
    this.data = opts.data;

    this.bus = new EventBus<GameEvents>();
    this.rng = new Rng(this.seed);
    this.clock = new GameClock(1, 7 * 60);
    this.weatherSystem = new WeatherSystem({ initialWeather: this.weather });
    this.economyManager = new EconomyManager(this.bus, this.economy);
    this.reputationSystem = new ReputationSystem({
      bus: this.bus,
      initialRating: this.economy.reputation,
      initialLocalTrust: 30,
      initialRelationships: this.story.characterRelationships,
    });
    this.roadEvents = new RoadEventManager({
      bus: this.bus,
      seed: this.seed,
    });

    const encounterDefs =
      (this.data?.encounters as EncounterDef[] | undefined) ?? DEFAULT_ENCOUNTERS;
    this.eventDirector = new EventDirector({
      definitions: encounterDefs,
      seed: this.seed,
      pauseOnDecisions: true,
    });

    const missionDefs =
      (this.data.missions as MissionDef[] | undefined) ?? [
        ...ch1Missions,
        ...ch2Missions,
        ...ch4Missions,
      ] as MissionDef[];
    const endingDefs =
      (this.data.endings as EndingDef[] | undefined) ?? (endingsData as EndingDef[]);

    this.missionManager = new MissionManager({
      bus: this.bus,
      missions: missionDefs,
      endings: endingDefs,
      storyState: this.story,
      getEffectContext: () => ({
        gameManager: this,
        economyManager: this.economyManager,
        eventBus: this.bus,
      }),
    });

    this.bus.on('day/started', () => {
      this.eventDirector.resetDaily();
    });

    this.bus.on('ending/reached', ({ endingId }) => {
      if (endingId in this.story.endingEligibility) {
        this.story.endingEligibility[endingId as keyof typeof this.story.endingEligibility] = true;
      }
    });

    this.bus.on('reputation/changed', () => {
      this.economy.reputation = this.reputationSystem.getAppRating();
      this.economyManager.reputation = this.economy.reputation;
    });

    this.bus.on('ride/accepted', () => {
      this.isNavigating = true;
    });

    this.bus.on('ride/completed', () => {
      this.todayCompletedRides++;
      this.isNavigating = false;
    });

    this.bus.on('ride/cancelled', () => {
      this.isNavigating = false;
    });

    this.bus.on('economy/transaction', () => {
      this.syncEconomy();
    });

    this.todayStartRating = this.reputationSystem.getAppRating();
    this.todayRelationshipsStart = { ...this.story.characterRelationships };
  }

  private syncEconomy(): void {
    this.economy = this.economyManager.getSnapshot();
  }

  tick(dt: number = SIM_DT): void {
    if (this.paused) {
      return;
    }

    this.ticks++;

    const prevHour = Math.floor(this.clock.minutes / 60);
    this.clock.advance(dt);
    const currHour = Math.floor(this.clock.minutes / 60);

    const dtMinutes = (dt * TIME_SCALE) / 60;
    this.weatherSystem.update(dtMinutes);
    this.weather = this.weatherSystem.weather;
    this.roadEvents.tick(dtMinutes, this.clock.minutes);

    if (currHour !== prevHour) {
      this.bus.emit('clock/hour', { hour: currHour % 24 });
    }

    // Phone battery drain while navigating: 3% per game hour
    if (this.isNavigating) {
      this.economyManager.drainBattery((dtMinutes / 60) * 3);
      this.economy.phoneBattery = this.economyManager.phoneBattery;
    }

    // Forced shift end at 23:00 (1380 minutes)
    if (this.clock.minutes >= 23 * 60 && !this.shiftEnded) {
      this.dispatch({ type: 'endShift' });
    }

    // Evaluate encounters (once per game minute or on phase change)
    const ctx: EncounterContext = {
      phase: 'roaming',
      minute: this.clock.minutes,
      day: this.clock.day,
      weather: this.weather,
      chapter: this.story.currentChapter,
      flags: this.story.branchFlags,
      relationships: this.story.characterRelationships,
      cash: this.economyManager.cash,
      speedKmh: 0,
      bikeCondition: this.economyManager.motorcycleCondition,
    };
    const encounter = this.eventDirector.evaluate(ctx, this.bus);
    if (encounter && this.eventDirector.pauseOnDecisions) {
      this.paused = true;
    }
  }

  dispatch(cmd: Command): CommandResult {
    switch (cmd.type) {
      case 'pause':
        this.paused = true;
        return { success: true };
      case 'resume':
        this.paused = false;
        return { success: true };
      case 'setWaypoint':
        this.waypointNodeId = cmd.nodeId;
        return { success: true };
      case 'buyFuel':
        this.economy.fuelLevel += cmd.liters;
        this.economyManager.fuelLevel = this.economy.fuelLevel;
        return { success: true };
      case 'repair': {
        const atKamal = this.isNearKamalBhai();
        const kamalRel = this.reputationSystem.getRelationship('kamal_bhai');
        const res = this.economyManager.repair(
          cmd.item as RepairItem,
          atKamal,
          kamalRel,
          this.clock.day,
          this.clock.minutes
        );
        this.syncEconomy();
        return res;
      }
      case 'buyUpgrade': {
        const upgrades = (this.data.upgrades as UpgradeDef[] | undefined) ?? (defaultUpgrades as UpgradeDef[]);
        const upgrade = upgrades.find((u) => u.id === cmd.upgradeId);
        if (!upgrade) {
          return { success: false, reason: `Unknown upgrade: ${cmd.upgradeId}` };
        }
        const atKamal = this.isNearKamalBhai();
        const kamalRel = this.reputationSystem.getRelationship('kamal_bhai');
        const res = this.economyManager.buyUpgrade(
          upgrade,
          atKamal,
          kamalRel,
          this.clock.day,
          this.clock.minutes
        );
        this.syncEconomy();
        return res;
      }
      case 'chooseEncounterOption': {
        const effectCtx: EffectContext = {
          gameManager: this,
          economyManager: this.economyManager,
          eventBus: this.bus,
        };
        const ok = this.eventDirector.chooseOption(
          cmd.instanceId,
          cmd.choiceId,
          effectCtx
        );
        if (ok && this.paused && this.eventDirector.pauseOnDecisions) {
          this.paused = false;
        }
        return { success: ok };
      }
      case 'endShift': {
        if (this.clock.minutes < 12 * 60 && !this.shiftEnded) {
          return { success: false, reason: 'Shift cannot end before 12:00' };
        }
        if (this.shiftEnded) {
          return { success: false, reason: 'Shift already ended' };
        }

        // Commute home if > 1.5 km (1500m)
        if (this.playerDistFromHomeM > 1500) {
          const kmPerL = BALANCE.FUEL.kmPerL.old100 ?? 40;
          const fuelNeeded = (this.playerDistFromHomeM / 1000) / kmPerL;
          this.economyManager.consumeFuel(fuelNeeded);
          this.playerDistFromHomeM = 0;
          this.playerNodeId = this.homeNodeId;
        }

        // Post living expenses
        const living = this.economyManager.postDailyLivingExpenses(
          this.clock.day,
          this.clock.minutes
        );

        if (living.rentDelayed) {
          this.story.branchFlags['rentDelayedOnce'] = true;
          this.reputationSystem.changeRelationship('ma', -10);
        }
        if (living.evictionWarning) {
          this.story.branchFlags['rentEvictionWarning'] = true;
          this.reputationSystem.changeRelationship('ma', -25);
        }

        const currentRating = this.reputationSystem.getAppRating();
        const ratingDelta = Math.round((currentRating - this.todayStartRating) * 100) / 100;
        const relationshipsDelta: Record<string, number> = {};
        for (const [charId, rel] of Object.entries(this.story.characterRelationships)) {
          const start = this.todayRelationshipsStart[charId] ?? 0;
          if (rel !== start) {
            relationshipsDelta[charId] = rel - start;
          }
        }

        this.syncEconomy();
        const summary: DaySummary = {
          day: this.clock.day,
          revenue: this.economyManager.dailyRevenue,
          expenses: this.economyManager.dailyExpenses,
          net: this.economyManager.dailyRevenue - this.economyManager.dailyExpenses,
          ratingDelta,
          completedRides: this.todayCompletedRides,
          relationshipsDelta,
          breakdown: {
            food: living.food,
            phoneData: living.phoneData,
            rent: living.rent,
            family: living.family,
          },
          livingExpenses: living,
          cash: this.economyManager.cash,
          debt: this.economyManager.debt,
        };

        this.shiftEnded = true;
        this.bus.emit('day/ended', { day: this.clock.day, summary });
        return { success: true, data: summary };
      }
      case 'sleep': {
        if (!this.shiftEnded) {
          this.dispatch({ type: 'endShift' });
        }
        this.clock.endShift();
        this.economyManager.resetDaily();
        this.economyManager.phoneBattery = 100;
        this.syncEconomy();
        this.shiftEnded = false;
        this.todayCompletedRides = 0;
        this.todayStartRating = this.reputationSystem.getAppRating();
        this.todayRelationshipsStart = { ...this.story.characterRelationships };
        this.bus.emit('day/started', { day: this.clock.day });
        return { success: true };
      }
      case 'chargePhone': {
        const cost = cmd.cost ?? (cmd.location === 'home' ? 0 : 10);
        this.economyManager.chargeBattery(100, cost, this.clock.day, this.clock.minutes);
        this.syncEconomy();
        return { success: true };
      }
      case 'delayRent': {
        if (!BALANCE.LIVING.rentDueDays.includes(this.clock.day)) {
          return { success: false, reason: 'Rent is not due today' };
        }
        if (!this.story.branchFlags['rentDelayedOnce']) {
          this.story.branchFlags['rentDelayedOnce'] = true;
          this.reputationSystem.changeRelationship('ma', -10);
          return { success: true };
        } else {
          this.story.branchFlags['rentEvictionWarning'] = true;
          this.reputationSystem.changeRelationship('ma', -25);
          return { success: false, reason: 'Rent cannot be delayed more than once' };
        }
      }
      case 'askAdvance': {
        this.economyManager.askAdvance(cmd.from, cmd.amount, this.clock.day, this.clock.minutes);
        this.syncEconomy();
        this.reputationSystem.changeRelationship(cmd.from, -5);
        return { success: true };
      }
      case 'payExpense': {
        const amount = cmd.amount ?? 100;
        const kind: TransactionKind =
          cmd.expenseId === 'family' || cmd.expenseId === 'rent' || cmd.expenseId === 'food' || cmd.expenseId === 'fuel'
            ? cmd.expenseId
            : 'family';
        this.economyManager.post({
          id: `tx_exp_${this.clock.day}_${Math.floor(this.clock.minutes)}_${cmd.expenseId}`,
          day: this.clock.day,
          minute: this.clock.minutes,
          kind,
          amount: -amount,
        });
        this.syncEconomy();
        return { success: true };
      }
      default:
        return { success: true };
    }
  }

  snapshot(): SimSnapshot {
    return {
      seed: this.seed,
      mode: this.mode,
      ticks: this.ticks,
      paused: this.paused,
      clock: {
        day: this.clock.day,
        minutes: this.clock.minutes,
        hhmm: this.clock.hhmm(),
        isRushHour: this.clock.isRushHour(),
      },
      economy: this.economyManager.getSnapshot(),
      story: {
        currentChapter: this.story.currentChapter,
        completedMissions: [...this.story.completedMissions],
        activeMissions: [...this.story.activeMissions],
        characterRelationships: { ...this.story.characterRelationships },
        promises: [...this.story.promises],
        branchFlags: { ...this.story.branchFlags },
        endingEligibility: { ...this.story.endingEligibility },
      },
      weather: this.weather,
      waypointNodeId: this.waypointNodeId,
      reputation: {
        rating: this.reputationSystem.getAppRating(),
        localTrust: this.reputationSystem.getLocalTrust(),
        safetyRecord: this.reputationSystem.getSafetyRecord(),
        riskScore: this.reputationSystem.getRiskScore(),
        promises: this.reputationSystem.getPromisesRecord(),
      },
      roadEvents: this.roadEvents.getActiveEvents(),
    };
  }

  applySnapshot(snap: SimSnapshot, rngState?: number): void {
    this.ticks = snap.ticks;
    this.paused = snap.paused;
    this.clock.day = snap.clock.day;
    this.clock.minutes = snap.clock.minutes;
    this.weather = snap.weather;
    this.weatherSystem.setWeather(snap.weather);
    this.waypointNodeId = snap.waypointNodeId;

    if (rngState !== undefined) {
      this.rng.setState(rngState);
    }

    // Restore economy
    this.economyManager.restoreState(snap.economy);
    this.syncEconomy();

    // Restore story
    this.story.currentChapter = snap.story.currentChapter;
    this.story.completedMissions = [...snap.story.completedMissions];
    this.story.activeMissions = [...snap.story.activeMissions];
    this.story.characterRelationships = { ...snap.story.characterRelationships };
    this.story.promises = [...snap.story.promises];
    this.story.branchFlags = { ...snap.story.branchFlags };
    this.story.endingEligibility = { ...snap.story.endingEligibility };

    // Restore reputation
    if (snap.reputation) {
      this.reputationSystem.restoreState({
        rating: snap.reputation.rating,
        localTrust: snap.reputation.localTrust,
        safetyRecord: snap.reputation.safetyRecord,
        riskScore: snap.reputation.riskScore,
        promises: snap.reputation.promises,
        relationships: snap.story.characterRelationships,
      });
    }

    // Restore road events
    this.roadEvents.clearEvents();
    if (snap.roadEvents) {
      for (const ev of snap.roadEvents) {
        this.roadEvents.addEvent(ev);
      }
    }
  }
}

export function runFrame(gm: GameManager, realDt: number): number {
  if (gm.paused) {
    return 0;
  }
  const dt = Math.min(realDt, MAX_FRAME_DT);
  gm.accumulator += dt;
  let steps = 0;
  while (gm.accumulator >= SIM_DT && steps < MAX_SIM_STEPS_PER_FRAME) {
    gm.tick(SIM_DT);
    gm.accumulator -= SIM_DT;
    steps++;
  }
  if (gm.accumulator > SIM_DT * MAX_SIM_STEPS_PER_FRAME) {
    gm.accumulator = 0;
  }
  return steps;
}
