import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { Rng } from '../../../src/core/rng';
import { BALANCE } from '../../../src/config/balance';
import { SIM_DT } from '../../../src/config/constants';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import { EventDirector } from '../../../src/sim/events/EventDirector';
import { applyEffects } from '../../../src/sim/events/effects';
import { RIDE_PHASE_RADIUS_M } from '../../../src/sim/events/phase';
import { ReputationSystem } from '../../../src/sim/reputation/ReputationSystem';
import { migrateSave } from '../../../src/sim/save/migrations';
import {
  startNegotiation,
  respond,
  type NegotiationSession,
} from '../../../src/sim/negotiation/NegotiationSystem';
import { generateProfile } from '../../../src/sim/passenger/profiles';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { DistrictData, EncounterDef, MissionDef } from '../../../src/sim/schemas';
import type { RideRequest, TripReceipt } from '../../../src/core/types';
import {
  bindEventBusToStore,
  dialogueSubtitleSignal,
  hudSignal,
} from '../../../src/ui/store';
import { ensureLocaleLoaded, setLanguage } from '../../../src/ui/i18n';
import testloopJson from '../../../data/districts/testloop.json';
import pickupData from '../../../data/encounters/pickup.json';
import crimeData from '../../../data/encounters/crime.json';

const NEUTRAL = { throttle: 0, brake: 0, steer: 0 };

function getDef(data: unknown, id: string): EncounterDef {
  const list = data as EncounterDef[];
  const found = list.find((d) => d.id === id);
  if (!found) throw new Error(`Missing encounter ${id}`);
  return found;
}

function makeTestRequest(overrides: Partial<RideRequest> = {}): RideRequest {
  return {
    requestId: 'req_med_1',
    passengerId: 'p_med_1',
    passengerNameKey: 'passenger.name.1',
    bookingType: 'app',
    pickupNodeId: 'N1',
    destinationNodeId: 'N3',
    pickupPlaceKey: 'poi.test_pickup',
    destinationPlaceKey: 'poi.test_dest',
    initialFare: 120,
    estimatedDistance: 2.0,
    estimatedDuration: 8,
    requestedArrivalTime: null,
    status: 'WaitingForPickup',
    surge: 1,
    ...overrides,
  };
}

function makeReceipt(requestId: string, fare = 100): TripReceipt {
  return {
    requestId,
    fare,
    tip: 0,
    bonus: 0,
    commission: 0,
    fuelCost: 10,
    fuelLiters: 0.1,
    otherCosts: 0,
    penalties: 0,
    compensation: 0,
    net: fare - 10,
    durationMin: 6,
    distanceKm: 1.5,
    rating: 5,
    consequences: [],
  };
}

describe('Medium Batch 1 Audit Fixes (M1 - M11)', () => {
  beforeEach(() => {
    dialogueSubtitleSignal.value = null;
  });

  it('M1: MissionManager snapshots activeMissionIds so completing a mission does not double-count into newly unlocked mission', () => {
    const missions: MissionDef[] = [
      {
        id: 'm_first',
        chapter: 1,
        day: 1,
        titleKey: 'm1',
        descKey: 'm1',
        prerequisites: [],
        unlocks: ['m_second'],
        objectives: [{ id: 'obj_1', type: 'completeRides', count: 1, descKey: 'd1' }],
        rewards: [{ type: 'startMission', missionId: 'm_second' }],
      },
      {
        id: 'm_second',
        chapter: 1,
        day: 1,
        titleKey: 'm2',
        descKey: 'm2',
        prerequisites: ['m_first'],
        unlocks: [],
        objectives: [{ id: 'obj_2', type: 'completeRides', count: 1, descKey: 'd2' }],
        rewards: [],
      },
    ];
    const gm = new GameManager({
      seed: 1,
      mode: 'career',
      data: { missions },
    });
    gm.missionManager.activateMission('m_first');

    gm.bus.emit('ride/completed', {
      requestId: 'r1',
      receipt: makeReceipt('r1'),
    });

    expect(gm.missionManager.isMissionCompleted('m_first')).toBe(true);
    expect(gm.missionManager.isMissionActive('m_second')).toBe(true);
    expect(gm.missionManager.isMissionCompleted('m_second')).toBe(false);
    const snap = gm.missionManager.snapshot();
    expect(snap.objectiveStates?.['m_second']?.[0]?.progress).toBe(0);
  });

  it('M2: endTrip(paid: true) posts partial fare and EventDirector.chooseOption clears activeEncounter before effects', () => {
    const road = RoadNetwork.fromDistricts([testloopJson as unknown as DistrictData]);
    const encDef: EncounterDef = {
      id: 'enc_test_paid_end',
      category: 'route',
      trigger: {},
      weight: 1,
      cooldownMin: 0,
      oncePerDay: false,
      lineKey: 'enc.test',
      choices: [
        {
          id: 'stop_paid',
          labelKey: 'enc.test.stop',
          effects: [{ type: 'endTrip', paid: true }],
        },
      ],
    };
    const gm = new GameManager({
      seed: 2,
      mode: 'endless',
      data: { encounters: [encDef] },
    });
    const session = new GameSession({ gm, road, autoRequests: false });
    const req = makeTestRequest({ initialFare: 120 });
    session.ride.offer(req);
    session.ride.accept(req.requestId);

    const inst = gm.eventDirector.forceStart('enc_test_paid_end', gm.bus)!;
    expect(inst).not.toBeNull();

    let dismissedCount = 0;
    gm.bus.on('encounter/dismissed', () => {
      dismissedCount++;
    });

    const cashBefore = gm.economyManager.cash;
    const ok = gm.eventDirector.chooseOption(inst.id, 'stop_paid', {
      gameManager: gm,
      economyManager: gm.economyManager,
      rideManager: session.ride,
      eventBus: gm.bus,
    });

    expect(ok).toBe(true);
    expect(gm.eventDirector.activeEncounter).toBeNull();
    expect(dismissedCount).toBe(0);
    expect(gm.economyManager.cash - cashBefore).toBe(Math.max(BALANCE.FARE.minFare, 60));
    expect(session.ride.getActiveRequest()).toBeNull();
  });

  it('M3: negative time effect does not rewind GameClock', () => {
    const gm = new GameManager({ seed: 3, mode: 'endless', data: {} });
    const before = gm.clock.minutes;
    applyEffects([{ type: 'time', min: -3 }], {
      gameManager: gm,
      economyManager: gm.economyManager,
      eventBus: gm.bus,
    });
    expect(gm.clock.minutes).toBe(before);
  });

  it('M4: ui/dialogue event updates dialogueSubtitleSignal and hudSignal with translated text', async () => {
    await ensureLocaleLoaded('en');
    setLanguage('en');
    const bus = new EventBus<GameEvents>();
    const unbind = bindEventBusToStore(bus);
    try {
      bus.emit('ui/dialogue', {
        speakerKey: 'hud.passenger.waiting',
        lineKey: 'hud.street_hail_nearby',
        durationMs: 2500,
      });
      expect(dialogueSubtitleSignal.value).not.toBeNull();
      expect(dialogueSubtitleSignal.value?.speaker).toBe('hud.passenger.waiting');
      expect(dialogueSubtitleSignal.value?.text).not.toBe('hud.street_hail_nearby');
      expect(hudSignal.value.dialogueSubtitle?.text).toBe(dialogueSubtitleSignal.value?.text);
    } finally {
      unbind();
    }
  });

  it('M5: RIDE_PHASE_RADIUS_M is 8 and enc_suspicious_pickup turn_around never leaves pickupHold stuck', () => {
    expect(RIDE_PHASE_RADIUS_M).toBe(8);
    const road = RoadNetwork.fromDistricts([testloopJson as unknown as DistrictData]);
    const suspDef = getDef(crimeData, 'enc_suspicious_pickup');
    const gm = new GameManager({
      seed: 5,
      mode: 'endless',
      data: { encounters: [suspDef] },
    });
    const session = new GameSession({ gm, road, autoRequests: false });
    const req = makeTestRequest({ pickupNodeId: 'N1', destinationNodeId: 'N3' });
    session.ride.offer(req);
    session.ride.accept(req.requestId, undefined, true);

    const n1 = road.getNode('N1')!;
    // Drive >= 15m into N1 so pickupLegDistanceM >= 15 and RideManager enters pickupHold
    session.bike.x = n1.x - 25;
    session.bike.z = n1.z;
    session.bike.heading = Math.PI / 2;
    for (let i = 0; i < 300 && Math.hypot(n1.x - session.bike.x, n1.z - session.bike.z) > 5; i++) {
      session.step({ throttle: 0.6, brake: 0, steer: 0 }, SIM_DT);
    }
    session.bike.speed = 0;
    for (let i = 0; i < 10 && !session.ride.isPickupHold(); i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(session.ride.isPickupHold()).toBe(true);

    const inst =
      gm.eventDirector.activeEncounter?.encounterId === 'enc_suspicious_pickup'
        ? gm.eventDirector.activeEncounter
        : gm.eventDirector.forceStart('enc_suspicious_pickup', gm.bus, {
            phase: 'atPickup',
            minute: gm.clock.minutes,
            day: gm.clock.day,
            weather: 'clear',
            chapter: 1,
            flags: {},
            relationships: {},
            cash: gm.economyManager.cash,
            speedKmh: 0,
            bikeCondition: 90,
            activeRequest: req,
            passenger: null,
          });
    expect(inst).not.toBeNull();

    const res = gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: inst!.id,
      choiceId: 'turn_around',
    });
    expect(res.success).toBe(true);
    expect(session.ride.isPickupHold()).toBe(false);
  });

  it('M6: non-anchored inline encounter does not inherit nearbyAnchorPlaceKey', () => {
    const ed = new EventDirector({
      definitions: [
        {
          id: 'enc_inline_weather',
          category: 'world',
          presentation: 'inline',
          trigger: { phase: 'onTrip' },
          weight: 10,
          cooldownMin: 0,
          oncePerDay: false,
          lineKey: 'enc.weather',
          choices: [{ id: 'ok', labelKey: 'ok', effects: [] }],
        },
      ],
    });
    const inst = ed.forceStart('enc_inline_weather', undefined, {
      phase: 'onTrip',
      minute: 500,
      day: 1,
      weather: 'lightRain',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 500,
      speedKmh: 20,
      bikeCondition: 90,
      nearbyAnchorPlaceKey: 'poi.tea_stall',
      nearbyAnchorKinds: ['teaStall'],
      passenger: null,
    });
    expect(inst).not.toBeNull();
    expect(inst?.presentation).toBe('inline');
    expect(inst?.anchorPlaceKey).toBeUndefined();
  });

  it('M7: evaluateSegmentCrime does not overwrite activeEncounter and synthetic turn_around resolves cleanly', () => {
    const road = RoadNetwork.fromDistricts([testloopJson as unknown as DistrictData]);
    const seg = road.getSegments()[0]!;
    const highRiskSeg = { ...seg, riskLevel: 1.0, roadType: 'alley' as const };

    const crimeDefNoTurnAround: EncounterDef = {
      id: 'enc_crime_no_ta',
      category: 'crime',
      trigger: { roadType: ['alley'] },
      weight: 10,
      cooldownMin: 0,
      oncePerDay: false,
      lineKey: 'enc.crime',
      choices: [{ id: 'brave', labelKey: 'enc.crime.brave', effects: [] }],
    };

    const ed = new EventDirector({
      definitions: [crimeDefNoTurnAround],
    });
    const gm = new GameManager({ seed: 7, mode: 'endless', data: {} });
    const ctx = {
      phase: 'onTrip' as const,
      minute: 1400,
      day: 1,
      weather: 'clear' as const,
      chapter: 2,
      flags: { isReckless: true },
      relationships: {},
      cash: 500,
      speedKmh: 20,
      bikeCondition: 90,
      passenger: null,
    };

    let triggeredInstanceId: string | null = null;
    for (let i = 0; i < 400; i++) {
      const res = ed.evaluateSegmentCrime(highRiskSeg, ctx, gm.bus, new Rng(100 + i));
      if (res.instance) {
        triggeredInstanceId = res.instance.id;
        expect(res.instance.choices.some((c) => c.id === 'turn_around')).toBe(true);
        break;
      }
    }
    expect(triggeredInstanceId).not.toBeNull();

    // Calling again while active must not overwrite activeEncounter
    const second = ed.evaluateSegmentCrime(highRiskSeg, ctx, gm.bus, new Rng(999));
    expect(second.triggered).toBe(false);
    expect(ed.activeEncounter?.id).toBe(triggeredInstanceId);

    // Resolving the synthetic turn_around choice must succeed
    const resolved = ed.chooseOption(triggeredInstanceId!, 'turn_around', {
      gameManager: gm,
      economyManager: gm.economyManager,
      eventBus: gm.bus,
    });
    expect(resolved).toBe(true);
    expect(ed.activeEncounter).toBeNull();
  });

  it('M8: pauseOnDecisions pauses GameManager on direct forceStart modal encounters but not inline', () => {
    const modalDef: EncounterDef = {
      id: 'enc_modal_pause_test',
      category: 'police',
      presentation: 'modal',
      trigger: {},
      weight: 1,
      cooldownMin: 0,
      oncePerDay: false,
      lineKey: 'enc.modal',
      choices: [{ id: 'ok', labelKey: 'ok', effects: [] }],
    };
    const inlineDef: EncounterDef = {
      id: 'enc_inline_pause_test',
      category: 'world',
      presentation: 'inline',
      trigger: {},
      weight: 1,
      cooldownMin: 0,
      oncePerDay: false,
      lineKey: 'enc.inline',
      choices: [{ id: 'ok', labelKey: 'ok', effects: [] }],
    };
    const gm = new GameManager({
      seed: 8,
      mode: 'endless',
      data: { encounters: [modalDef, inlineDef] },
    });
    gm.eventDirector.pauseOnDecisions = true;

    const modalInst = gm.eventDirector.forceStart('enc_modal_pause_test', gm.bus);
    expect(modalInst).not.toBeNull();
    expect(gm.paused).toBe(true);

    gm.eventDirector.dismissActive('expired', gm.bus);
    gm.paused = false;

    const inlineInst = gm.eventDirector.forceStart('enc_inline_pause_test', gm.bus);
    expect(inlineInst).not.toBeNull();
    expect(gm.paused).toBe(false);
  });

  it('M9: enc_off_app marks ride offApp, records strike risk, and offsets prepaid cash at drop-off', () => {
    const road = RoadNetwork.fromDistricts([testloopJson as unknown as DistrictData]);
    const offAppDef = getDef(pickupData, 'enc_off_app');
    const gm = new GameManager({
      seed: 9,
      mode: 'endless',
      data: { encounters: [offAppDef] },
    });
    const session = new GameSession({ gm, road, autoRequests: false });
    const req = makeTestRequest({ initialFare: 100, bookingType: 'app' });
    session.ride.offer(req);
    session.ride.accept(req.requestId, undefined, true);

    const n1 = road.getNode('N1')!;
    // Drive >= 15m into N1 so pickupLegDistanceM >= 15 and RideManager enters pickupHold
    session.bike.x = n1.x - 25;
    session.bike.z = n1.z;
    session.bike.heading = Math.PI / 2;
    for (let i = 0; i < 300 && Math.hypot(n1.x - session.bike.x, n1.z - session.bike.z) > 5; i++) {
      session.step({ throttle: 0.6, brake: 0, steer: 0 }, SIM_DT);
    }
    session.bike.speed = 0;
    for (let i = 0; i < 10 && !session.ride.isPickupHold(); i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(session.ride.isPickupHold()).toBe(true);

    const startCash = gm.economyManager.cash;
    const inst =
      gm.eventDirector.activeEncounter?.encounterId === 'enc_off_app'
        ? gm.eventDirector.activeEncounter
        : gm.eventDirector.forceStart('enc_off_app', gm.bus, {
            phase: 'atPickup',
            minute: gm.clock.minutes,
            day: gm.clock.day,
            weather: 'clear',
            chapter: 1,
            flags: {},
            relationships: {},
            cash: startCash,
            speedKmh: 0,
            bikeCondition: 90,
            activeRequest: req,
            passenger: null,
          });
    expect(inst).not.toBeNull();

    const res = gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: inst!.id,
      choiceId: 'accept',
    });
    expect(res.success).toBe(true);
    expect(session.ride.getActiveRequest()?.bookingType).toBe('offApp');
    expect(gm.economyManager.cash - startCash).toBe(80);

    // Step through boarding walk until passenger is onboard
    for (let i = 0; i < 120 && session.ride.isPickupHold(); i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(session.ride.isPickupHold()).toBe(false);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');

    // Move to drop-off and verify prepaid 80 offsets initialFare 100 -> 20 remaining
    const n3 = road.getNode('N3')!;
    const cashBeforeDrop = gm.economyManager.cash;
    let completedReceipt: TripReceipt | null = null;
    gm.bus.on('ride/completed', (ev) => {
      completedReceipt = ev.receipt;
    });
    session.ride.update({ x: n3.x, z: n3.z, speed: 0 }, 0.1);

    expect(completedReceipt).not.toBeNull();
    expect(completedReceipt!.fare).toBe(20);
    expect(completedReceipt!.commission).toBe(0);
    expect(gm.economyManager.cash - cashBeforeDrop).toBeLessThan(80);
  });

  it('M10: refuel guards NaN/tiny free liters, restoreState resets dirty fields, and Garage uses BALANCE.WEAR.oilEveryKm', () => {
    const bus = new EventBus<GameEvents>();
    const econ = new EconomyManager(bus);
    econ.fuelLevel = 2;

    expect(econ.refuel(Number.NaN)).toBe(0);
    expect(econ.refuel(-5)).toBe(0);
    const cashBefore = econ.cash;
    const tinyAdded = econ.refuel(0.001, 120, 1, 10);
    expect(tinyAdded).toBeCloseTo(0.001);
    expect(cashBefore - econ.cash).toBeGreaterThanOrEqual(1);

    econ.advancesTaken = 2;
    econ.deferredRent = 400;
    econ.ownedUpgrades = ['upgrade_phone_mount'];
    econ.currentBikeId = 'used125';
    econ.ownedBikes = ['old100', 'used125'];
    econ.kmSinceOilChange = 75;

    econ.restoreState({ cash: 500 });
    expect(econ.cash).toBe(500);
    expect(econ.advancesTaken).toBe(0);
    expect(econ.deferredRent).toBe(0);
    expect(econ.ownedUpgrades).toEqual([]);
    expect(econ.currentBikeId).toBe('old100');
    expect(econ.ownedBikes).toEqual(['old100']);
    expect(econ.kmSinceOilChange).toBe(15);

    const garageSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/ui/garage/Garage.tsx'),
      'utf8'
    );
    expect(garageSrc).toContain('BALANCE.WEAR.oilEveryKm');
    expect(garageSrc).not.toContain('kmSinceOilChange / 60');
  });

  it('M11: v1->v2 migration preserves active off-app suspension and negotiation accepts asks <= currentPassengerOffer', () => {
    const migrated = migrateSave({
      version: 1,
      timestamp: 1000,
      slot: 'slot1',
      mode: 'career',
      seed: 1,
      ticks: 100,
      rngState: 42,
      clock: { day: 3, minutes: 500 },
      economy: {
        cash: 600,
        dailyRevenue: 0,
        dailyExpenses: 0,
        fuelLevel: 5,
        motorcycleCondition: 90,
        appBalance: 0,
        savings: 0,
        debt: 0,
        reputation: 4.9,
        phoneBattery: 90,
      },
      story: {
        currentChapter: 1,
        activeMissions: [],
        completedMissions: [],
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
      },
      reputation: {
        rating: 4.9,
        localTrust: 10,
        safetyRecord: { nearMisses: 0, bumps: 0, crashes: 0, infractions: 0 },
        riskScore: 0,
        promises: { kept: 0, broken: 0 },
        offAppStrikes: 2,
        suspendedUntilDay: 5,
      },
      bike: {
        position: { x: 0, y: 0, z: 0 },
        heading: 0,
        speed: 0,
        condition: 90,
        fuelLevel: 5,
      },
      weather: 'clear',
      waypointNodeId: null,
    });

    expect(migrated.reputation.wasSuspended).toBe(true);
    const rep = new ReputationSystem({ bus: new EventBus<GameEvents>() });
    rep.applySnapshot({
      rating: migrated.reputation.rating,
      localTrust: migrated.reputation.localTrust,
      relationships: migrated.story.characterRelationships,
      safetyRecord: migrated.reputation.safetyRecord,
      riskScore: migrated.reputation.riskScore,
      promises: migrated.reputation.promises,
      offAppStrikes: migrated.reputation.offAppStrikes,
      suspendedUntilDay: migrated.reputation.suspendedUntilDay,
      wasSuspended: migrated.reputation.wasSuspended,
    });
    expect(rep.isAppSuspended(3)).toBe(true);
    expect(rep.isAppSuspended(5)).toBe(false);

    const req = makeTestRequest({ initialFare: 120 });
    const profile = generateProfile('regular', new Rng(12));
    const started = startNegotiation(req, profile, {
      traffic: 0.3,
      day: 1,
      walkM: 0,
      rng: new Rng(12),
    });
    const finalLowPatience: NegotiationSession = {
      ...started,
      round: started.maxRounds,
      currentPatience: 0.05,
      currentPassengerOffer: 100,
    };
    const result = respond(finalLowPatience, { kind: 'counter', amount: 100 });
    expect(result.outcome?.kind).toBe('accepted');
    if (result.outcome?.kind === 'accepted') {
      expect(result.outcome.fare).toBe(100);
    }
  });
});
