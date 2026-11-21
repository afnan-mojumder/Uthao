import { describe, it, expect, vi } from 'vitest';
import { SIM_DT } from '../../../src/config/constants';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { deriveRideView } from '../../../src/sim/ride/rideView';
import { evaluateCondition } from '../../../src/sim/events/conditions';
import type { DistrictData, EncounterDef } from '../../../src/sim/schemas';
import { WorldPassengerActor } from '../../../src/render/passengerActor';
import { RideMarkers } from '../../../src/render/props';
import {
  bindEventBusToStore,
  choiceSignal,
  screenSignal,
  pausedSignal,
  settingsOpenSignal,
  tutorialSignal,
  dayEndSignal,
  endingSignal,
  saveSlotsSignal,
  garageSignal,
  journalSignal,
  karmaPanelSignal,
  uiSheetSignal,
  tripSummarySignal,
  phoneSignal,
  negotiationSignal,
  contextLostSignal,
  rotateOverlaySignal,
  unsupportedSignal,
  runtimeCrashSignal,
} from '../../../src/ui/store';
import { uiModalOpen } from '../../../src/ui/gamepadNav';
import pickupData from '../../../data/encounters/pickup.json';
import routeData from '../../../data/encounters/route.json';
import paymentData from '../../../data/encounters/payment.json';

const NEUTRAL = { throttle: 0, brake: 0, steer: 0 };

function makeWorldDistrict(): DistrictData {
  return {
    districtId: 'mirpara',
    name: { bn: 'মিরপাড়া', en: 'Mirpara' },
    nodes: [
      { nodeId: 'n0', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'n1', x: 100, z: 0, kind: 'junction' },
      { nodeId: 'n_junc', x: 180, z: 0, kind: 'poi' },
      { nodeId: 'n_mkt', x: 260, z: 0, kind: 'poi' },
      { nodeId: 'n_pharm', x: 340, z: 0, kind: 'poi' },
      { nodeId: 'n_dest', x: 500, z: 0, kind: 'poi' },
      { nodeId: 'n_alt', x: 165, z: 65, kind: 'junction' },
    ],
    segments: [
      {
        segmentId: 'seg_0_1',
        startNodeId: 'n0',
        endNodeId: 'n1',
        width: 8,
        surfaceCondition: 0.9,
        trafficDensity: 0,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.3,
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
        segmentId: 'seg_1_junc',
        startNodeId: 'n1',
        endNodeId: 'n_junc',
        width: 8,
        surfaceCondition: 0.9,
        trafficDensity: 0,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.3,
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
        segmentId: 'seg_junc_mkt',
        startNodeId: 'n_junc',
        endNodeId: 'n_mkt',
        width: 8,
        surfaceCondition: 0.85,
        trafficDensity: 0,
        speedLimit: 35,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.4,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'market',
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'mirpara',
        tags: ['market'],
      },
      {
        segmentId: 'seg_mkt_pharm',
        startNodeId: 'n_mkt',
        endNodeId: 'n_pharm',
        width: 8,
        surfaceCondition: 0.9,
        trafficDensity: 0,
        speedLimit: 35,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.3,
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
        segmentId: 'seg_pharm_dest',
        startNodeId: 'n_pharm',
        endNodeId: 'n_dest',
        width: 8,
        surfaceCondition: 0.9,
        trafficDensity: 0,
        speedLimit: 35,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.3,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'residential',
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'mirpara',
        tags: [],
      },
      {
        segmentId: 'seg_junc_alt',
        startNodeId: 'n_junc',
        endNodeId: 'n_alt',
        width: 6,
        surfaceCondition: 0.9,
        trafficDensity: 0,
        speedLimit: 30,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.2,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 1,
        roadType: 'residential',
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'mirpara',
        tags: [],
      },
      {
        segmentId: 'seg_alt_dest',
        startNodeId: 'n_alt',
        endNodeId: 'n_dest',
        width: 6,
        surfaceCondition: 0.9,
        trafficDensity: 0,
        speedLimit: 30,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.2,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 1,
        roadType: 'residential',
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'mirpara',
        tags: [],
      },
    ],
    pois: [
      {
        id: 'poi_mkt',
        kind: 'market',
        nameKey: 'poi.mirpara.bazar',
        nodeId: 'n_mkt',
      },
      {
        id: 'poi_pharm',
        kind: 'pharmacy',
        nameKey: 'poi.mirpara.hospital',
        nodeId: 'n_pharm',
      },
    ],
    lots: [],
  };
}

function getDef(arr: unknown[], id: string): EncounterDef {
  return (arr as EncounterDef[]).find((d) => d.id === id)!;
}

function createIsolatedSession(defs?: EncounterDef[]) {
  const road = RoadNetwork.fromDistricts([makeWorldDistrict()]);
  const gm = new GameManager({
    seed: 23,
    mode: 'career',
    data: defs ? { encounters: defs } : {},
  });
  gm.eventDirector.enabled = true;
  gm.clock.minutes = 10 * 60;
  const session = new GameSession({
    gm,
    road,
    autoRequests: false,
    negotiation: false,
  });
  vi.spyOn(session.traffic, 'maintainDensity').mockImplementation(() => { });
  session.bike.x = 0;
  session.bike.z = 0;
  session.bike.heading = Math.PI / 2;
  return { gm, road, session };
}

function offerAndAccept(
  session: GameSession,
  pickupNodeId: string,
  destinationNodeId: string,
  reliability = 1.0
) {
  const sample = session.requests.sampleRequest(
    session.gm.clock.minutes,
    'clear',
    'app'
  )!;
  const profile = session.requests.getProfile(sample.request.passengerId)!;
  profile.paymentReliability = reliability;
  sample.request.pickupNodeId = pickupNodeId;
  sample.request.destinationNodeId = destinationNodeId;
  session.ride.offer(sample.request);
  session.ride.accept(sample.request.requestId);
  return sample.request;
}

function stepDriveEastTo(session: GameSession, targetX: number): void {
  session.bike.heading = Math.PI / 2;
  for (let i = 0; i < 1800 && session.bike.x < targetX - 3; i++) {
    session.step({ throttle: 0.9, brake: 0, steer: 0 }, SIM_DT);
  }
  session.bike.x = targetX;
  session.bike.z = 0;
  session.bike.speed = 0;
  session.step(NEUTRAL, SIM_DT);
}

describe('World-Grounded Ride & Encounter Pipeline (Milestone 1)', () => {
  it('1. accepts a ride while parked without firing out-of-context pickup/route/payment/roaming events', () => {
    const { gm, session } = createIsolatedSession();
    const fired: string[] = [];
    gm.bus.on('encounter/started', ({ instance }) => fired.push(instance.encounterId));

    offerAndAccept(session, 'n_junc', 'n_dest');

    for (let i = 0; i < 300; i++) {
      session.step(NEUTRAL, SIM_DT);
    }

    expect(session.ride.getTripState()).toBe('EnRouteToPickup');
    expect(session.isPassengerOnPillion()).toBe(false);
    expect(session.getPassengerActorState().mode).toBe('waitingAtPickup');
    expect(fired).toEqual([]);
  });

  it('2. gates mid-ride stops by passenger onboard, >=30m trip distance & ahead POI anchor, then routes & dismounts passenger at shop', () => {
    const extraStop = getDef(routeData, 'enc_extra_stop');
    const waitErrand = getDef(routeData, 'enc_wait_errand');

    // Condition rejects before driving 30m, while heading to pickup, or without matching POI
    expect(
      evaluateCondition(extraStop.trigger, {
        phase: 'onTrip',
        minute: 600,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 25,
        bikeCondition: 90,
        activeRequest: { status: 'OnTrip' } as never,
        tripDistanceM: 12,
        nearbyAnchorKinds: ['market'],
      })
    ).toBe(false);
    expect(
      evaluateCondition(waitErrand.trigger, {
        phase: 'onTrip',
        minute: 600,
        day: 1,
        weather: 'clear',
        chapter: 1,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 25,
        bikeCondition: 90,
        activeRequest: { status: 'OnTrip' } as never,
        tripDistanceM: 45,
        nearbyAnchorKinds: ['fuel'],
      })
    ).toBe(false);

    const { gm, session } = createIsolatedSession([extraStop]);
    const started: string[] = [];
    let stopAdded = false;
    let stopArrived = false;
    let stopCompleted = false;
    gm.bus.on('encounter/started', ({ instance }) => started.push(instance.encounterId));
    gm.bus.on('ride/stopAdded', () => {
      stopAdded = true;
    });
    gm.bus.on('ride/stopArrived', () => {
      stopArrived = true;
    });
    gm.bus.on('ride/stopCompleted', () => {
      stopCompleted = true;
    });

    offerAndAccept(session, 'n0', 'n_dest');
    session.bike.x = 0;
    session.bike.speed = 0;
    // Board cleanly at pickup (<15m driven)
    session.step(NEUTRAL, SIM_DT);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');

    // Drive east along road toward n_mkt (260) so tripDistanceM >= 30 and POI ahead sits in 25..65m cone
    session.bike.heading = Math.PI / 2;
    for (let i = 0; i < 1200 && started.length === 0; i++) {
      session.step({ throttle: 0.9, brake: 0, steer: 0 }, SIM_DT);
    }

    expect(started).toContain('enc_extra_stop');
    const enc = gm.eventDirector.activeEncounter!;
    expect(enc.presentation).toBe('inline');
    expect(enc.anchorPlaceKey).toBe('poi.mirpara.bazar');

    const minBeforeAccept = gm.clock.minutes;
    gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: enc.id,
      choiceId: 'agree',
    });

    // Accepting inline stop adds intermediate waypoint instead of snapping clock
    expect(gm.clock.minutes - minBeforeAccept).toBeLessThan(0.5);
    expect(stopAdded).toBe(true);
    const stop = session.ride.getIntermediateStop();
    expect(stop?.nodeId).toBe('n_mkt');
    const viewBeforeStop = deriveRideView(session.ride);
    expect(viewBeforeStop.stopVisible).toBe(true);
    expect(viewBeforeStop.objectiveKey).toBe('objective.go_to_stop');
    expect(viewBeforeStop.navTargetNodeId).toBe('n_mkt');

    // Arrive at shop stop and stop the bike
    stepDriveEastTo(session, 260);
    expect(stopArrived).toBe(true);
    expect(session.ride.getActiveWait()?.kind).toBe('stopErrand');
    expect(session.isPassengerOnPillion()).toBe(false);
    expect(session.getPassengerActorState().mode).toBe('atStop');

    // Progress wait until passenger re-boards and stop completes
    for (let i = 0; i < 600 && !stopCompleted; i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(stopCompleted).toBe(true);
    expect(session.ride.getIntermediateStop()).toBeNull();
    expect(session.isPassengerOnPillion()).toBe(true);
    expect(deriveRideView(session.ride).navTargetNodeId).toBe('n_dest');
  });

  it('3. holds pickup arrival for enc_late_passenger, runs smooth staged wait, and supports cancelActiveWait()', () => {
    const lateDef = getDef(pickupData, 'enc_late_passenger');
    const { gm, session } = createIsolatedSession([lateDef]);

    let startedCount = 0;
    gm.bus.on('ride/started', () => {
      startedCount++;
    });

    offerAndAccept(session, 'n_junc', 'n_dest');
    stepDriveEastTo(session, 180);

    expect(session.ride.isPickupHold()).toBe(true);
    expect(startedCount).toBe(0);
    expect(gm.eventDirector.activeEncounter?.encounterId).toBe('enc_late_passenger');

    const minAtChoice = gm.clock.minutes;
    gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: gm.eventDirector.activeEncounter!.id,
      choiceId: 'wait',
    });

    // Wait banner starts cleanly with 5 game min over ~6.5 real sec (clock not instant-jumped)
    const wait = session.ride.getActiveWait();
    expect(wait?.kind).toBe('pickupWait');
    expect(gm.clock.minutes - minAtChoice).toBeLessThan(0.2);

    for (let i = 0; i < 600 && session.ride.getTripState() === 'EnRouteToPickup'; i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(startedCount).toBe(1);
    expect(gm.clock.minutes - minAtChoice).toBeGreaterThanOrEqual(4.8);

    // Second test: cancelActiveWait aborts cleanly without stranding ride
    const { gm: gm2, session: s2 } = createIsolatedSession([lateDef]);
    let cancelledReason: string | null = null;
    gm2.bus.on('ride/cancelled', (ev) => {
      cancelledReason = ev.reason;
    });
    offerAndAccept(s2, 'n_junc', 'n_dest');
    stepDriveEastTo(s2, 180);
    gm2.dispatch({
      type: 'chooseEncounterOption',
      instanceId: gm2.eventDirector.activeEncounter!.id,
      choiceId: 'wait',
    });
    expect(s2.ride.cancelActiveWait()).toBe(true);
    expect(cancelledReason).toBe('wait_cancelled');
    expect(s2.ride.getActiveWait()).toBeNull();
    expect(s2.ride.getTripState()).toBe('Cancelled');
    s2.step(NEUTRAL, SIM_DT);
    expect(s2.ride.getTripState()).toBe('Idle');
  });

  it('4. genuinely relocates pickup pin to nearby junction when choosing drive on enc_wrong_pickup_pin', () => {
    const wrongPinDef = getDef(pickupData, 'enc_wrong_pickup_pin');
    const { gm, session } = createIsolatedSession([wrongPinDef]);
    let relocated: { oldNodeId: string; newNodeId: string } | null = null;
    gm.bus.on('ride/pickupRelocated', (ev) => {
      relocated = { oldNodeId: ev.oldNodeId, newNodeId: ev.newNodeId };
    });

    const req = offerAndAccept(session, 'n_junc', 'n_dest');
    stepDriveEastTo(session, 180);

    expect(gm.eventDirector.activeEncounter?.encounterId).toBe('enc_wrong_pickup_pin');
    expect(session.ride.isPickupHold()).toBe(true);

    gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: gm.eventDirector.activeEncounter!.id,
      choiceId: 'drive',
    });

    const active = session.ride.getActiveRequest()!;
    expect(relocated).not.toBeNull();
    expect(active.pickupNodeId).not.toBe(req.pickupNodeId);
    expect(active.pickupNodeId).toBe(relocated!.newNodeId);
    expect(session.ride.isPickupHold()).toBe(false);
    expect(session.ride.getTripState()).toBe('EnRouteToPickup');
    expect(session.ride.currentRoute?.nodeIds.at(-1)).toBe(active.pickupNodeId);
  });

  it('5. holds destination completion when drop-off arrival triggers enc_no_change, then settles on choice', () => {
    const noChangeDef = getDef(paymentData, 'enc_no_change');
    const { gm, session } = createIsolatedSession([noChangeDef]);
    let completed = false;
    gm.bus.on('ride/completed', () => {
      completed = true;
    });

    const req = offerAndAccept(session, 'n0', 'n_dest', 1.0);
    session.bike.x = 0;
    session.bike.speed = 0;
    session.step(NEUTRAL, SIM_DT); // board at n0
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');
    session.requests.getProfile(req.passengerId)!.paymentReliability = 0.4;

    stepDriveEastTo(session, 500);

    expect(session.ride.getTripState()).toBe('Completing');
    expect(session.ride.isDropoffHold()).toBe(true);
    expect(completed).toBe(false);
    expect(gm.eventDirector.activeEncounter?.encounterId).toBe('enc_no_change');

    gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: gm.eventDirector.activeEncounter!.id,
      choiceId: 'digital',
    });

    expect(completed).toBe(true);
    expect(session.ride.isDropoffHold()).toBe(false);
    expect(session.ride.getTripState()).toBe('Idle');
  });

  it('6. triggers enc_phone_left in postDropoff and creates live return waypoint before paying reward on arrival', () => {
    const phoneDef = getDef(paymentData, 'enc_phone_left');
    const { gm, session } = createIsolatedSession([phoneDef]);

    offerAndAccept(session, 'n0', 'n_dest');
    session.bike.x = 0;
    session.bike.speed = 0;
    session.step(NEUTRAL, SIM_DT);
    stepDriveEastTo(session, 500);
    expect(session.ride.getTripState()).toBe('Idle');

    // Advance into postDropoff evaluation minute
    for (let i = 0; i < 60 && !gm.eventDirector.activeEncounter; i++) {
      session.step(NEUTRAL, SIM_DT);
    }

    const enc = gm.eventDirector.activeEncounter!;
    expect(enc?.encounterId).toBe('enc_phone_left');
    expect(enc.presentation).toBe('inline');

    const cashBefore = gm.economyManager.cash;
    gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: enc.id,
      choiceId: 'return',
    });

    // Reward is deferred until riding back to the passenger at n_dest
    expect(gm.economyManager.cash).toBe(cashBefore);
    const followUp = session.getActiveFollowUp();
    expect(followUp?.kind).toBe('phoneReturn');
    expect(followUp?.nodeId).toBe('n_dest');
    expect(session.getPassengerActorState().mode).toBe('waitingAtPickup');

    // Drive away and return to n_dest to complete handoff
    session.bike.x = 460;
    session.step(NEUTRAL, SIM_DT);
    stepDriveEastTo(session, 500);

    expect(session.getActiveFollowUp()).toBeNull();
    expect(gm.economyManager.cash).toBe(cashBefore + 100);
  });

  it('7. keeps driving unlocked for inline prompts and dismisses expired inline prompts cleanly', () => {
    screenSignal.value = 'game';
    pausedSignal.value = false;
    settingsOpenSignal.value = false;
    tutorialSignal.value = { active: false, step: 'idle' };
    dayEndSignal.value = { active: false, summary: null };
    endingSignal.value = { active: false, result: null, choices: undefined };
    saveSlotsSignal.value = { isOpen: false, mode: 'save' };
    garageSignal.value = { ...garageSignal.value, open: false };
    journalSignal.value = false;
    karmaPanelSignal.value = false;
    uiSheetSignal.value = false;
    tripSummarySignal.value = null;
    phoneSignal.value = { ...phoneSignal.value, open: false };
    negotiationSignal.value = { active: false, session: null, lastResult: null };
    contextLostSignal.value = false;
    rotateOverlaySignal.value = false;
    unsupportedSignal.value = null;
    runtimeCrashSignal.value = null;

    const { gm } = createIsolatedSession();
    const unbind = bindEventBusToStore(gm.bus);
    let dismissedReason: string | null = null;
    gm.bus.on('encounter/dismissed', (ev) => {
      dismissedReason = ev.reason;
    });

    gm.eventDirector.forceStart('enc_extra_stop', gm.bus);
    expect(choiceSignal.value.active).toBe(true);
    expect(choiceSignal.value.presentation).toBe('inline');
    expect(uiModalOpen()).toBe(false);

    gm.eventDirector.tickInlineExpiry(13, gm.bus);
    expect(dismissedReason).toBe('expired');
    expect(choiceSignal.value.active).toBe(false);

    unbind();
  });

  it('8. updates and disposes WorldPassengerActor and RideMarkers.stop cleanly without WebGL', () => {
    const actor = new WorldPassengerActor();
    const markers = new RideMarkers();

    actor.update(
      { mode: 'hidden', worldX: 10, worldZ: 20, facingRad: 0 },
      1.0
    );
    expect(actor.root.visible).toBe(false);

    actor.update(
      {
        mode: 'waitingAtPickup',
        worldX: 180,
        worldZ: 4,
        facingRad: 1.2,
        passengerSeed: 42,
        hasChild: true,
        waving: true,
        beaconVisible: true,
      },
      2.5
    );
    expect(actor.root.visible).toBe(true);
    expect(actor.root.position.x).toBe(180);
    expect(actor.root.position.z).toBe(4);

    actor.update(
      { mode: 'onPillion', worldX: 180, worldZ: 4, facingRad: 1.2 },
      3.0
    );
    expect(actor.root.visible).toBe(false);

    markers.setStop(260, 0, true);
    expect(markers.stop.root.visible).toBe(true);
    expect(markers.stop.root.position.x).toBe(260);
    markers.update(0.1);
    markers.setStop(0, 0, false);
    expect(markers.stop.root.visible).toBe(false);

    actor.dispose();
    markers.dispose();
  });
});
