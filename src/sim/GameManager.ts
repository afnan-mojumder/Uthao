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
import type { EncounterContext, EncounterPhase } from './events/conditions';
import type { EffectContext } from './events/effects';
import type { RideManager } from './ride/RideManager';
import routeEncounters from '../../data/encounters/route.json';
import pickupEncounters from '../../data/encounters/pickup.json';
import paymentEncounters from '../../data/encounters/payment.json';
import bikeEncounters from '../../data/encounters/bike.json';
import crimeEncounters from '../../data/encounters/crime.json';
import passengerEncounters from '../../data/encounters/passenger.json';
import { ReputationSystem } from './reputation/ReputationSystem';
import { getBikeDef } from './economy/bikes';
import { DeliveryManager } from './delivery/DeliveryManager';
import type { SafetyRecord, Transaction } from '../core/types';
import { RoadEventManager, type ActiveRoadEvent } from './world/RoadEvents';
import defaultUpgrades from '../../data/upgrades.json';
import type { RepairItem, UpgradeDef } from './economy/maintenance';
import { MissionManager } from './mission/MissionManager';
import {
  evaluateEnding,
  getAvailableCareerChoices,
  type CareerChoice,
  type EndingEvaluationContext,
} from './mission/endings';
import type { MissionDef, EndingDef } from './schemas';
import ch1Missions from '../../data/missions/ch1.json';
import ch2Missions from '../../data/missions/ch2.json';
import ch3Missions from '../../data/missions/ch3.json';
import ch4Missions from '../../data/missions/ch4.json';
import ch5Missions from '../../data/missions/ch5.json';
import ch6Missions from '../../data/missions/ch6.json';
import sideMissions from '../../data/missions/side.json';
import endingsData from '../../data/endings.json';

const DEFAULT_ENCOUNTERS: EncounterDef[] = [
  ...routeEncounters,
  ...pickupEncounters,
  ...paymentEncounters,
  ...bikeEncounters,
  ...passengerEncounters,
  ...crimeEncounters,
] as EncounterDef[];

/** The mission where the player commits to a career; its flag ends the campaign. */
const CAREER_DECISION_MISSION = 'm6_decision';

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
    ratingsHistory?: number[];
    localTrust: number;
    safetyRecord: SafetyRecord;
    riskScore: number;
    promises: { kept: number; broken: number };
  };
  roadEvents?: ActiveRoadEvent[];
  /** T8.2 (additive): paid-trip record, so a reload can never pay a trip twice. */
  ledger?: Transaction[];
  settledRequests?: string[];
  requestSeq?: number;
  negotiationHistory?: number;
  /** The day-end step already ran today; a reload must not run it again (H-12). */
  shiftEnded?: boolean;
  todayRentPosted?: number;
}

export class GameManager {
  readonly seed: number;
  /** T7.4: mutable so `enterEndlessMode()` can convert a running career session
   * into a true endless one (no missions/endings) instead of only flipping a
   * UI screen signal. */
  mode: 'career' | 'endless';
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
  readonly deliveryManager: DeliveryManager;

  /** T7.5: set by GameSession right after it constructs RideManager, so
   * effect handlers (e.g. `endTrip`) can reach the live ride state. Optional
   * because tests construct a bare GameManager with no ride loop. */
  rideManager?: RideManager;
  /** T8.3: set by GameSession. When present, buying fuel needs the bike at a
   * fuel station; without a session (bare GameManager) there is no position to gate on. */
  fuelStationNearby?: () => boolean;
  /** T8.4: set by GameSession. Charging at home or a tea stall needs the bike there. */
  phoneChargeNearby?: (location: 'home' | 'teaStall') => boolean;
  /** Provided by GameSession so encounter `spawnRequest` effects offer live rides. */
  spawnSpecialRequest?: (templateId: string) => void;

  paused: boolean = false;
  accumulator: number = 0;
  ticks: number = 0;

  weather: WeatherKind = 'clear';
  waypointNodeId: string | null = null;
  isNavigating: boolean = false;
  shiftEnded: boolean = false;
  /** Rent posted at this shift's end; a delay can move it to the next rent day. */
  todayRentPosted = 0;
  homeNodeId: string = 'res_n2_0';
  playerNodeId: string = 'res_n2_0';
  atKamalBhai: boolean = false;
  playerDistFromHomeM: number = 0;
  todayCompletedRides: number = 0;
  /** T8.2: last used request sequence number (persisted). */
  requestSeq: number = 0;
  /** T8.5 H: -1..1 overcharge history across the career (negative = the rider overcharged passengers); fed to negotiation. */
  negotiationHistory: number = 0;
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
      // Cards never freeze the sim: a card waits for a stopped bike and the
      // world keeps running behind it, so the driving keys stay live.
      pauseOnDecisions: false,
    });

    const allCampaignMissions = [
      ...ch1Missions,
      ...ch2Missions,
      ...ch3Missions,
      ...ch4Missions,
      ...ch5Missions,
      ...ch6Missions,
      ...sideMissions,
    ] as MissionDef[];

    const missionDefs =
      this.mode === 'endless'
        ? []
        : ((this.data.missions as MissionDef[] | undefined) ?? allCampaignMissions);

    if (this.mode === 'endless') {
      this.story.currentChapter = 6;
      this.story.activeMissions = [];
    }
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
        rideManager: this.rideManager,
        eventBus: this.bus,
        spawnSpecialRequest: this.spawnSpecialRequest,
      }),
    });

    this.deliveryManager = new DeliveryManager({
      bus: this.bus,
      economyManager: this.economyManager,
    });

    this.bus.on('day/started', () => {
      this.eventDirector.resetDaily();
    });

    this.bus.on('ending/reached', ({ endingId }) => {
      if (endingId in this.story.endingEligibility) {
        this.story.endingEligibility[endingId as keyof typeof this.story.endingEligibility] = true;
      }
    });

    // The career decision is offered as its mission starts, with the real standing.
    this.bus.on('mission/activated', ({ missionId }) => {
      if (missionId === CAREER_DECISION_MISSION) this.offerCareerDecision();
    });
    // The campaign ends on its final flag, and the ending comes from the real state.
    this.bus.on('story/flag', ({ key, value }) => {
      if (key === 'campaign_completed' && value === true) this.reachFinalEnding();
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

  /** T7.4: the real effect of "endless mode" — no missions to track or
   * endings to reach, chapter capped at the final one for district unlocks.
   * Mirrors what the constructor already does when booted with
   * `mode: 'endless'`, so starting endless from an existing career session
   * (main menu or post-ending) behaves the same as a fresh endless boot. */
  enterEndlessMode(): void {
    this.mode = 'endless';
    this.missionManager.missions.clear();
    this.story.activeMissions = [];
    this.story.currentChapter = 6;
  }

  /** Clock-driven side effects of `dt` real seconds: clock, weather, road events,
   * hour event, phone drain and the forced 23:00 shift end. Shared by `tick` and
   * waits (fuel rescue) so both are observed identically. */
  private advanceTime(dt: number): void {
    const prevHour = Math.floor(this.clock.minutes / 60);
    this.clock.advance(dt);
    const currHour = Math.floor(this.clock.minutes / 60);

    const dtMinutes = (dt * TIME_SCALE) / 60;
    this.weatherSystem.update(dtMinutes);
    this.weather = this.weatherSystem.weather;
    this.roadEvents.tick(dtMinutes, this.clock.minutes);

    if (currHour !== prevHour) {
      this.bus.emit('clock/hour', { hour: currHour % 24 });
      if (this.roadEvents.getActiveEvents().length < 2 && this.rng.next() < 0.45) {
        this.roadEvents.generateRandomEvent(this.clock.minutes, this.weather);
      }
    }

    // Phone battery drain while navigating: 3% per game hour
    if (this.isNavigating) {
      this.economyManager.drainBattery((dtMinutes / 60) * 3);
      this.economy.phoneBattery = this.economyManager.phoneBattery;
    }

    // Forced shift end at 23:00 (1380 minutes). It waits for a ride in progress,
    // so that trip's money lands in the day's summary (until midnight).
    if (this.clock.minutes >= 23 * 60 && !this.shiftEnded && (!this.rideInProgress() || this.clock.minutes >= 24 * 60)) {
      this.dispatch({ type: 'endShift' });
    }
  }

  /** Advances game time by `minutes` through the same path as `tick`, in
   * one-minute chunks, without physics. Stops if the day rolls over (shift ended). */
  private waitGameMinutes(minutes: number): void {
    const day = this.clock.day;
    let left = minutes;
    while (left > 0 && this.clock.day === day) {
      const chunk = Math.min(1, left);
      this.advanceTime((chunk * 60) / TIME_SCALE);
      left -= chunk;
    }
  }

  tick(dt: number = SIM_DT, speedKmh: number = 0, phase: EncounterPhase = 'roaming'): void {
    if (this.paused) {
      return;
    }

    this.ticks++;

    this.advanceTime(dt);

    // Evaluate encounters (once per game minute or on phase change)
    const ctx: EncounterContext = {
      phase,
      minute: this.clock.minutes,
      day: this.clock.day,
      weather: this.weather,
      chapter: this.story.currentChapter,
      flags: this.story.branchFlags,
      relationships: this.story.characterRelationships,
      cash: this.economyManager.cash,
      // The bike's real speed: an encounter card only shows once the bike is
      // stopped (EventDirector's speed gate), so a moving bike keeps its keys.
      speedKmh,
      bikeCondition: this.economyManager.motorcycleCondition,
    };
    // T7.1: ambient (roaming) encounters are suppressed while disabled (main
    // menu, tutorial, or `?encounters=0`) so they can't softlock the boot flow.
    if (this.eventDirector.enabled) {
      const encounter = this.eventDirector.evaluate(ctx, this.bus);
      if (encounter && this.eventDirector.pauseOnDecisions) {
        this.paused = true;
      }
    }
  }

  /** The real state the endings are judged on. */
  private endingContext(): EndingEvaluationContext {
    const rep = this.reputationSystem;
    return {
      day: this.clock.day,
      economy: this.economyManager.getSnapshot(),
      story: this.story,
      rating: rep.getAppRating(),
      localTrust: rep.getLocalTrust(),
      safetyRecord: rep.getSafetyRecord(),
      riskScore: rep.getRiskScore(),
      promises: rep.getPromisesRecord(),
      careerChoice: this.story.branchFlags.career_choice as CareerChoice | undefined,
      careerSavings: this.story.branchFlags.career_choice_savings as number | undefined,
      appSuspended: this.story.branchFlags.appSuspended === true,
    };
  }

  /** Shows the player's standing and the career options when the decision mission starts. */
  private offerCareerDecision(): void {
    const result = evaluateEnding(this.endingContext());
    const kamalRel = this.story.characterRelationships['char_kamal'] ?? 0;
    const choices = getAvailableCareerChoices(this.economyManager.getSnapshot().savings, kamalRel);
    this.bus.emit('ending/reached', { endingId: result.endingId, result, choices });
  }

  /** Emits the final ending once the campaign's last flag is set. */
  private reachFinalEnding(): void {
    const result = evaluateEnding(this.endingContext());
    this.bus.emit('ending/reached', { endingId: result.endingId, result });
  }

  /** A passenger has agreed to a trip and it is not yet settled: its money must
   * land before the shift ends. Offers and negotiations do not count. */
  private rideInProgress(): boolean {
    switch (this.rideManager?.getTripState()) {
      case 'Accepted':
      case 'EnRouteToPickup':
      case 'PassengerOnboard':
      case 'EnRouteToDestination':
      case 'Completing':
      case 'EmergencyInterrupted':
        return true;
      default:
        return false;
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
      case 'selectCareerChoice': {
        const kamalRel = this.reputationSystem.getRelationship('char_kamal');
        const opt = getAvailableCareerChoices(this.economy.savings, kamalRel).find(
          (o) => o.id === cmd.choice
        );
        if (!opt || !opt.available) {
          return { success: false, reason: opt?.disabledReason ?? 'Choice unavailable' };
        }
        // Record what the player had before paying, so the ending judges that (H-9).
        this.story.branchFlags.career_choice_savings = this.economy.savings;
        this.economyManager.spendSavings(opt.cost);
        this.syncEconomy();
        this.story.branchFlags.career_choice = cmd.choice;
        this.bus.emit('story/flag', { key: 'career_choice', value: cmd.choice });
        // The Chapter 6 mission waits on this flag, not on the choice id.
        this.bus.emit('story/flag', { key: 'ch6_decision_made', value: true });
        return { success: true };
      }
      case 'acceptDelivery':
        return this.deliveryManager.accept(cmd.deliveryId, this.clock.minutes);
      case 'pickupDelivery':
        return this.deliveryManager.pickup(cmd.deliveryId, this.clock.minutes);
      case 'completeDelivery': {
        const res = this.deliveryManager.complete(
          cmd.deliveryId,
          this.clock.minutes,
          this.clock.day
        );
        this.syncEconomy();
        return res;
      }
      case 'buyBike': {
        const atKamal = this.isNearKamalBhai();
        const kamalRel = this.reputationSystem.getRelationship('char_kamal');
        const res = this.economyManager.buyBike(
          cmd.bikeId,
          cmd.useTradeIn ?? true,
          atKamal,
          kamalRel,
          this.clock.day,
          this.clock.minutes
        );
        this.syncEconomy();
        return res;
      }
      case 'switchBike': {
        const res = this.economyManager.switchBike(cmd.bikeId);
        this.syncEconomy();
        return res;
      }
      case 'buyFuel':
      case 'refuelAtStation': {
        if (this.fuelStationNearby && !this.fuelStationNearby()) {
          return { success: false, reason: 'Not at a fuel station' };
        }
        const em = this.economyManager;
        // Never free and never negative: buy only what the cash covers.
        const affordable = Math.floor((em.cash / BALANCE.FUEL.pricePerL) * 100) / 100;
        const want = Math.min(Math.max(0, cmd.liters), affordable);
        const added = em.refuel(want, BALANCE.FUEL.pricePerL, this.clock.day, this.clock.minutes);
        this.syncEconomy();
        if (added <= 0) {
          return { success: false, reason: affordable <= 0 ? 'Insufficient funds' : 'Tank is full' };
        }
        return { success: true, data: { liters: added } };
      }
      case 'callFuelRescue': {
        const em = this.economyManager;
        if (em.fuelLevel >= BALANCE.FUEL.rescueBelowL) {
          return { success: false, reason: 'Tank is not empty' };
        }
        const res = em.callFriendForFuel(this.clock.day, this.clock.minutes);
        // The wait is real game time: someone has to bring the fuel.
        this.waitGameMinutes(res.timeCostMin);
        this.syncEconomy();
        return { success: true, data: res };
      }
      case 'repair': {
        const atKamal = this.isNearKamalBhai();
        const kamalRel = this.reputationSystem.getRelationship('char_kamal');
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
        const kamalRel = this.reputationSystem.getRelationship('char_kamal');
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
          rideManager: this.rideManager,
          eventBus: this.bus,
          spawnSpecialRequest: this.spawnSpecialRequest,
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
        if (this.rideInProgress() && this.clock.minutes < 24 * 60) {
          return { success: false, reason: 'Finish the active ride first' };
        }

        // A negotiation is not a ride in progress, but it must not outlive the
        // shift: the trip would stay in `Negotiating` overnight and every later
        // accept would be refused. The passenger walks away instead.
        if (this.rideManager?.getTripState() === 'Negotiating') {
          this.rideManager.walkAwayNegotiation();
        }

        // Commute home if > 1.5 km (1500m)
        if (this.playerDistFromHomeM > 1500) {
          const kmPerL = BALANCE.FUEL.kmPerL[this.economyManager.currentBikeId] ?? 40;
          const fuelNeeded = (this.playerDistFromHomeM / 1000) / kmPerL;
          this.economyManager.consumeFuel(fuelNeeded);
          this.playerDistFromHomeM = 0;
          this.playerNodeId = this.homeNodeId;
        }

        // Post bike daily insurance if applicable
        const activeBike = getBikeDef(this.economyManager.currentBikeId);
        if (activeBike.dailyInsuranceCost > 0) {
          this.economyManager.post({
            id: `tx_insurance_${this.clock.day}_${Math.floor(this.clock.minutes)}`,
            day: this.clock.day,
            minute: this.clock.minutes,
            kind: 'maintenance',
            amount: -activeBike.dailyInsuranceCost,
          });
          // T7.5: post() above already adds this to dailyExpenses — a
          // second `+=` here was double-counting insurance every day.
        }

        // Post living expenses
        const living = this.economyManager.postDailyLivingExpenses(
          this.clock.day,
          this.clock.minutes
        );

        this.todayRentPosted = living.rent;
        if (living.rentDelayed) {
          this.story.branchFlags['rentDelayedOnce'] = true;
          this.reputationSystem.changeRelationship('char_ma', -10);
        }
        if (living.evictionWarning) {
          this.story.branchFlags['rentEvictionWarning'] = true;
          this.reputationSystem.changeRelationship('char_ma', -25);
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
          return { success: false, reason: 'End the shift before sleeping' };
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
        // T8.4: every charge needs you at a named place (checked against the bike's
        // position) and takes game time. No place, or no way to check it, means no charge.
        if (!cmd.location || !this.phoneChargeNearby || !this.phoneChargeNearby(cmd.location)) {
          return { success: false, reason: 'Not at a charging spot' };
        }
        const cost = cmd.cost ?? (cmd.location === 'home' ? 0 : 10);
        if (cost > this.economyManager.cash) {
          return { success: false, reason: 'Insufficient funds' };
        }
        this.economyManager.chargeBattery(100, cost, this.clock.day, this.clock.minutes);
        this.syncEconomy();
        this.waitGameMinutes(BALANCE.PHONE.chargeWaitMin[cmd.location]);
        return { success: true };
      }
      case 'delayRent': {
        if (!BALANCE.LIVING.rentDueDays.includes(this.clock.day)) {
          return { success: false, reason: 'Rent is not due today' };
        }
        if (this.story.branchFlags['rentDelayedOnce']) {
          return { success: false, reason: 'Rent was already delayed once' };
        }
        if (!this.economyManager.delayRent(this.todayRentPosted, this.clock.day, this.clock.minutes)) {
          return { success: false, reason: 'No rent to delay' };
        }
        this.todayRentPosted = 0;
        this.story.branchFlags['rentDelayedOnce'] = true;
        this.reputationSystem.changeRelationship('char_ma', -10);
        this.syncEconomy();
        return { success: true };
      }
      case 'askAdvance': {
        const granted = this.economyManager.askAdvance(cmd.from, cmd.amount, this.clock.day, this.clock.minutes);
        this.syncEconomy();
        if (!granted) {
          return { success: false, reason: 'Family cannot advance any more money' };
        }
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
        ratingsHistory: this.reputationSystem.getRatingsHistory(),
        localTrust: this.reputationSystem.getLocalTrust(),
        safetyRecord: this.reputationSystem.getSafetyRecord(),
        riskScore: this.reputationSystem.getRiskScore(),
        promises: this.reputationSystem.getPromisesRecord(),
      },
      roadEvents: this.roadEvents.getActiveEvents(),
      ledger: [...this.economyManager.getLedger()],
      settledRequests: this.economyManager.getSettledIds(),
      requestSeq: this.requestSeq,
      negotiationHistory: this.negotiationHistory,
      shiftEnded: this.shiftEnded,
      todayRentPosted: this.todayRentPosted,
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
    // T7.5: mutate the existing object in place (don't reassign it) —
    // ReputationSystem holds this exact object by reference as its own
    // relationship store, so reassigning here would silently split them
    // back into two stores.
    for (const key of Object.keys(this.story.characterRelationships)) {
      delete this.story.characterRelationships[key];
    }
    Object.assign(this.story.characterRelationships, snap.story.characterRelationships);
    this.story.promises = [...snap.story.promises];
    this.story.branchFlags = { ...snap.story.branchFlags };
    this.story.endingEligibility = { ...snap.story.endingEligibility };

    // Restore reputation
    if (snap.reputation) {
      this.reputationSystem.restoreState({
        rating: snap.reputation.rating,
        ratingsHistory: snap.reputation.ratingsHistory ?? [],
        localTrust: snap.reputation.localTrust,
        safetyRecord: snap.reputation.safetyRecord,
        riskScore: snap.reputation.riskScore,
        promises: snap.reputation.promises,
        relationships: this.story.characterRelationships,
      });
    }

    this.economyManager.restoreLedger(snap.ledger ?? [], snap.settledRequests ?? []);
    this.requestSeq = snap.requestSeq ?? 0;
    this.negotiationHistory = snap.negotiationHistory ?? 0;
    this.shiftEnded = snap.shiftEnded ?? false;
    this.todayRentPosted = snap.todayRentPosted ?? 0;

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
