import { EventBus, type GameEvents } from '../core/events';
import { GameClock, TIME_SCALE } from '../core/clock';
import { Rng } from '../core/rng';
import { WeatherSystem } from './world/WeatherSystem';
import {
  SIM_DT,
  MAX_FRAME_DT,
  MAX_SIM_STEPS_PER_FRAME,
} from '../config/constants';
import type { Command, CommandResult } from '../core/commands';
import type {
  PlayerEconomy,
  StoryState,
  WeatherKind,
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

const DEFAULT_ENCOUNTERS: EncounterDef[] = [
  ...routeEncounters,
  ...pickupEncounters,
  ...paymentEncounters,
  ...bikeEncounters,
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

  paused: boolean = false;
  accumulator: number = 0;
  ticks: number = 0;

  weather: WeatherKind = 'clear';
  waypointNodeId: string | null = null;

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

    const encounterDefs =
      (this.data.encounters as EncounterDef[] | undefined) ?? DEFAULT_ENCOUNTERS;
    this.eventDirector = new EventDirector({
      definitions: encounterDefs,
      seed: this.seed,
      pauseOnDecisions: true,
    });

    this.bus.on('day/started', () => {
      this.eventDirector.resetDaily();
    });
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

    if (currHour !== prevHour) {
      this.bus.emit('clock/hour', { hour: currHour % 24 });
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
        const prevDay = this.clock.day;
        this.clock.endShift();
        this.bus.emit('day/ended', {
          day: prevDay,
          summary: {
            day: prevDay,
            revenue: this.economy.dailyRevenue,
            expenses: this.economy.dailyExpenses,
            net: this.economy.dailyRevenue - this.economy.dailyExpenses,
            ratingDelta: 0,
            completedRides: 0,
            relationshipsDelta: {},
          },
        });
        this.bus.emit('day/started', { day: this.clock.day });
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
      economy: { ...this.economy },
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
    };
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
