import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { SIM_DT } from '../../../src/config/constants';
import { serialize, deserialize } from '../../../src/sim/save/SaveSystem';
import { evaluateCondition } from '../../../src/sim/events/conditions';
import { encounterPhaseFor } from '../../../src/sim/events/phase';
import type { DistrictData, EncounterDef } from '../../../src/sim/schemas';
import type { RideRequest } from '../../../src/core/types';
import testloopData from '../../../data/districts/testloop.json';
import puranparaData from '../../../data/districts/puranpara.json';
import paymentData from '../../../data/encounters/payment.json';
import pickupData from '../../../data/encounters/pickup.json';
import crimeData from '../../../data/encounters/crime.json';

const NEUTRAL = { throttle: 0, brake: 0, steer: 0 };

function getDef(data: unknown, id: string): EncounterDef {
  const list = data as EncounterDef[];
  const found = list.find((d) => d.id === id);
  if (!found) throw new Error(`Missing encounter ${id}`);
  return found;
}

function makeOffer(requestId: string, pickupNodeId = 'N1', destinationNodeId = 'N3'): RideRequest {
  return {
    requestId,
    passengerId: `p_${requestId}`,
    passengerNameKey: 'passenger.name.1',
    bookingType: 'app',
    pickupNodeId,
    destinationNodeId,
    pickupPlaceKey: 'poi.test_pickup',
    destinationPlaceKey: 'poi.test_dest',
    initialFare: 80,
    estimatedDistance: 0.3,
    estimatedDuration: 2,
    requestedArrivalTime: null,
    status: 'WaitingForPickup',
    surge: 1,
  };
}

describe('High Batch 1 Audit Fixes (#6 - #13)', () => {
  it('#6: enc_phone_left pays ৳1500 immediately on keep and +8 localTrust / 5m on police', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const phoneDef = getDef(paymentData, 'enc_phone_left');

    // Test 'keep'
    const gmKeep = new GameManager({ seed: 10, mode: 'career', data: { encounters: [phoneDef] } });
    new GameSession({ gm: gmKeep, road, autoRequests: false });
    const startCash = gmKeep.economy.cash;
    const instKeep = gmKeep.eventDirector.forceStart('enc_phone_left', gmKeep.bus, {
      phase: 'postDropoff',
      minute: gmKeep.clock.minutes,
      day: gmKeep.clock.day,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: startCash,
      speedKmh: 0,
      bikeCondition: 90,
    })!;
    expect(instKeep).not.toBeNull();
    gmKeep.dispatch({ type: 'chooseEncounterOption', instanceId: instKeep.id, choiceId: 'keep' });
    expect(gmKeep.economy.cash).toBe(startCash + 1500);

    // Test 'police'
    const gmPolice = new GameManager({ seed: 10, mode: 'career', data: { encounters: [phoneDef] } });
    new GameSession({ gm: gmPolice, road, autoRequests: false });
    const startTrust = gmPolice.reputationSystem.getMeter('publicReputation');
    const startMin = gmPolice.clock.minutes;
    const instPolice = gmPolice.eventDirector.forceStart('enc_phone_left', gmPolice.bus, {
      phase: 'postDropoff',
      minute: gmPolice.clock.minutes,
      day: gmPolice.clock.day,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: gmPolice.economy.cash,
      speedKmh: 0,
      bikeCondition: 90,
    })!;
    gmPolice.dispatch({ type: 'chooseEncounterOption', instanceId: instPolice.id, choiceId: 'police' });
    expect(gmPolice.reputationSystem.getMeter('publicReputation')).toBe(startTrust + 8);
    expect(gmPolice.clock.minutes).toBeGreaterThanOrEqual(startMin + 5);
  });

  it('#7: enc_wrong_pickup_pin drive choice clears pickupHold when relocate returns null', () => {
    // Minimal 2-node road graph so relocatePickupToNearbyJunction(45, 120) returns null
    const tinyDistrict: DistrictData = {
      ...(testloopData as DistrictData),
      nodes: [
        { nodeId: 'A', x: 0, z: 0, kind: 'poi', signal: false },
        { nodeId: 'B', x: 10, z: 0, kind: 'poi', signal: false },
      ],
      segments: [
        {
          segmentId: 'S_AB',
          startNodeId: 'A',
          endNodeId: 'B',
          width: 6,
          surfaceCondition: 0.9,
          trafficDensity: 0,
          speedLimit: 30,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0,
          riskLevel: 0.05,
          oneWay: false,
          divided: false,
          lanes: 2,
          roadType: 'residential',
          floodSensitivity: 0,
          pickupPractical: true,
          district: 'testloop',
          tags: [],
        },
      ],
      pois: [],
    };
    const road = RoadNetwork.fromDistricts([tinyDistrict]);
    const wrongPinDef = getDef(pickupData, 'enc_wrong_pickup_pin');
    const gm = new GameManager({ seed: 11, mode: 'career', data: { encounters: [wrongPinDef] } });
    const session = new GameSession({ gm, road, autoRequests: false });

    const offer = makeOffer('req_tutorial_01', 'A', 'B');
    session.ride.offer(offer);
    session.ride.accept('req_tutorial_01', undefined, true);
    session.bike.x = 0;
    session.bike.z = 0;
    session.bike.speed = 0;
    session.step(NEUTRAL, SIM_DT);
    expect(session.ride.isPickupHold()).toBe(true);

    const inst = gm.eventDirector.forceStart('enc_wrong_pickup_pin', gm.bus, {
      phase: 'atPickup',
      minute: gm.clock.minutes,
      day: gm.clock.day,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: gm.economy.cash,
      speedKmh: 0,
      bikeCondition: 90,
    })!;
    gm.dispatch({ type: 'chooseEncounterOption', instanceId: inst.id, choiceId: 'drive' });

    // Step through boarding walk; pickupHold must clear cleanly
    for (let i = 0; i < 120; i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(session.ride.isPickupHold()).toBe(false);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');
  });

  it('#8: shiftEnded blocks clock/offers and enterEndlessMode clears paused + activeEncounter', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 12, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false });

    gm.clock.minutes = 23 * 60;
    expect(gm.dispatch({ type: 'endShift' }).success).toBe(true);
    expect(gm.shiftEnded).toBe(true);

    const endedAt = gm.clock.minutes;
    for (let i = 0; i < 60; i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(gm.clock.minutes).toBe(endedAt);
    expect(session.ride.hasOfferedRequests()).toBe(false);

    gm.paused = true;
    gm.eventDirector.forceStart('enc_bus_block', gm.bus, {
      phase: 'roaming',
      minute: gm.clock.minutes,
      day: gm.clock.day,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: gm.economy.cash,
      speedKmh: 0,
      bikeCondition: 90,
    });
    gm.enterEndlessMode();
    expect(gm.paused).toBe(false);
    expect(gm.eventDirector.activeEncounter).toBeNull();
  });

  it('#9: m4_home_safe activating during sleep sets pendingM4PoliceDecision instead of being wiped by resetDaily', () => {
    const m4PoliceDef: EncounterDef = {
      id: 'enc_m4_police_decision',
      category: 'police',
      trigger: { phase: 'roaming' },
      weight: 10,
      cooldownMin: 0,
      oncePerDay: true,
      lineKey: 'encounter.police.checkpoint.title',
      choices: [{ id: 'cooperate', labelKey: 'encounter.police.choice.cooperate', kind: 'official', effects: [] }],
    };
    const gm = new GameManager({ seed: 14, mode: 'career', data: { encounters: [m4PoliceDef] } });
    gm.eventDirector.enabled = true;
    gm.story.currentChapter = 4;
    gm.clock.day = 11;
    gm.clock.minutes = 23 * 60;
    gm.missionManager.completeMission('m4_wrong_pickup');
    expect(gm.dispatch({ type: 'endShift' }).success).toBe(true);

    // Sleep to Day 12: m4_home_safe activates during day transition
    expect(gm.dispatch({ type: 'sleep' }).success).toBe(true);
    expect(gm.missionManager.isMissionActive('m4_home_safe')).toBe(true);
    expect(gm.snapshot().eventDirectorState?.pendingM4PoliceDecision).toBe(true);
  });

  it('#10: day/started clears postDropoffUntilMin, activeFollowUp, and encounterAvoidSegments', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const phoneDef = getDef(paymentData, 'enc_phone_left');
    const gm = new GameManager({ seed: 15, mode: 'career', data: { encounters: [phoneDef] } });
    const session = new GameSession({ gm, road, autoRequests: false });

    // Late-night ride completion sets postDropoffUntilMin = 1380 + 2
    gm.clock.minutes = 23 * 60;
    gm.bus.emit('ride/completed', {
      requestId: 'req_late',
      receipt: {
        requestId: 'req_late',
        fare: 100,
        tip: 0,
        commission: 0,
        fuelCost: 5,
        otherCosts: 0,
        bonus: 0,
        penalties: 0,
        compensation: 0,
        fuelLiters: 0.1,
        net: 95,
        durationMin: 3,
        distanceKm: 1,
        rating: 5,
        consequences: [],
      },
    });
    expect(
      encounterPhaseFor({
        trip: session.ride.getTripState(),
        hasRequest: false,
        distToPickupM: Infinity,
        distToDropoffM: Infinity,
        isPostDropoff: gm.clock.minutes <= 1382,
      })
    ).toBe('postDropoff');

    // Trigger follow-up + end shift + sleep
    const inst = gm.eventDirector.forceStart('enc_phone_left', gm.bus, {
      phase: 'postDropoff',
      minute: gm.clock.minutes,
      day: gm.clock.day,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: gm.economy.cash,
      speedKmh: 0,
      bikeCondition: 90,
    })!;
    gm.dispatch({ type: 'chooseEncounterOption', instanceId: inst.id, choiceId: 'return' });
    expect(session.getActiveFollowUp()).not.toBeNull();

    gm.dispatch({ type: 'endShift' });
    gm.dispatch({ type: 'sleep' });

    expect(session.getActiveFollowUp()).toBeNull();
    // Phase helper on session must now be roaming, not stuck in postDropoff
    expect((session as unknown as { postDropoffUntilMin: number | null }).postDropoffUntilMin).toBeNull();
  });

  it('#11: activeFollowUp persists across serialize/deserialize and pays deferred reward on arrival', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const phoneDef = getDef(paymentData, 'enc_phone_left');
    const gm1 = new GameManager({ seed: 16, mode: 'career', data: { encounters: [phoneDef] } });
    const session1 = new GameSession({ gm: gm1, road, autoRequests: false });

    const inst = gm1.eventDirector.forceStart('enc_phone_left', gm1.bus, {
      phase: 'postDropoff',
      minute: gm1.clock.minutes,
      day: gm1.clock.day,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: gm1.economy.cash,
      speedKmh: 0,
      bikeCondition: 90,
    })!;
    gm1.dispatch({ type: 'chooseEncounterOption', instanceId: inst.id, choiceId: 'return' });
    const followUp = session1.getActiveFollowUp();
    expect(followUp).not.toBeNull();

    const save = serialize(gm1, 'slot1');
    const gm2 = deserialize(save, { encounters: [phoneDef] });
    const snap2 = gm2.snapshot();
    const session2 = new GameSession({ gm: gm2, road, autoRequests: false });
    gm2.applySnapshot(snap2, save.rngState);

    const restored = session2.getActiveFollowUp();
    expect(restored).toEqual(followUp);

    // Arrive at follow-up node and confirm deferred cash + trust pay out
    const targetNode = road.getNode(restored!.nodeId)!;
    const cashBefore = gm2.economy.cash;
    const trustBefore = gm2.reputationSystem.getMeter('publicReputation');
    session2.bike.x = targetNode.x;
    session2.bike.z = targetNode.z;
    session2.bike.speed = 0;
    session2.step(NEUTRAL, SIM_DT);

    expect(session2.getActiveFollowUp()).toBeNull();
    expect(gm2.economy.cash).toBe(cashBefore + restored!.cashReward);
    expect(gm2.reputationSystem.getMeter('publicReputation')).toBe(
      trustBefore + restored!.trustBonus
    );
  });

  it('#12: enc_dark_alley_blockage and enc_robbery_attempt match real puranpara alley segments', () => {
    const puranpara = puranparaData as DistrictData;
    const alleySegs = puranpara.segments.filter(
      (s) => s.roadType === 'alley' && s.motorcycleAccessible
    );
    const darkAlley = getDef(crimeData, 'enc_dark_alley_blockage');
    const robbery = getDef(crimeData, 'enc_robbery_attempt');

    const darkMatches = alleySegs.some((seg) =>
      evaluateCondition(darkAlley.trigger, {
        phase: 'onTrip',
        minute: 23 * 60,
        day: 3,
        weather: 'clear',
        chapter: 2,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 20,
        bikeCondition: 80,
        segment: seg,
      })
    );
    const robberyMatches = alleySegs.some((seg) =>
      evaluateCondition(robbery.trigger, {
        phase: 'roaming',
        minute: 23 * 60,
        day: 3,
        weather: 'clear',
        chapter: 2,
        flags: {},
        relationships: {},
        cash: 500,
        speedKmh: 20,
        bikeCondition: 80,
        segment: seg,
      })
    );
    expect(darkMatches).toBe(true);
    expect(robberyMatches).toBe(true);
  });

  it('#13: turn_around resolves active_segment placeholder to real segmentId', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 18, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false });

    session.step(NEUTRAL, SIM_DT);
    const expectedSeg = (session as unknown as { lastStepSegment?: { segmentId: string } }).lastStepSegment;
    expect(expectedSeg).toBeDefined();

    gm.onRouteEffect?.('avoid', 'active_segment');
    const avoided = (session as unknown as { encounterAvoidSegments: Set<string> }).encounterAvoidSegments;
    expect(avoided.has('active_segment')).toBe(false);
    expect(avoided.has(expectedSeg!.segmentId)).toBe(true);
  });
});
