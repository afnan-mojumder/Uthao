import { afterEach, describe, it, expect, vi } from 'vitest';
import { SIM_DT } from '../../../src/config/constants';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { DistrictData, EncounterDef, MissionDef } from '../../../src/sim/schemas';
import { RideMarkers } from '../../../src/render/props';
import { uiModalOpen } from '../../../src/ui/gamepadNav';
import { tutorialSignal, mapLiveSignal, screenSignal } from '../../../src/ui/store';
import { syncMapLiveFromSession } from '../../../src/ui/bindings';
import ch1Missions from '../../../data/missions/ch1.json';
import ch4Missions from '../../../data/missions/ch4.json';
import ch5Missions from '../../../data/missions/ch5.json';
import ch6Missions from '../../../data/missions/ch6.json';
import policeData from '../../../data/encounters/police.json';
import pickupData from '../../../data/encounters/pickup.json';

const NEUTRAL = { throttle: 0, brake: 0, steer: 0 };
const THROTTLE = { throttle: 0.9, brake: 0, steer: 0 };

function makeMilestone3District(): DistrictData {
  return {
    districtId: 'mirpara',
    name: { bn: 'মিরপাড়া', en: 'Mirpara' },
    nodes: [
      { nodeId: 'res_n2_1', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'res_s2_1', x: 60, z: 0, kind: 'poi' },
      { nodeId: 'res_n1_1', x: 160, z: 0, kind: 'poi' },
      { nodeId: 'art_s_1', x: 240, z: 0, kind: 'poi' },
      { nodeId: 'res_s1_0', x: 320, z: 0, kind: 'poi' },
      { nodeId: 'res_n1_2', x: 120, z: 100, kind: 'poi', tags: ['school', 'market'] },
    ],
    segments: [
      {
        segmentId: 'seg_home_clinic',
        startNodeId: 'res_n2_1',
        endNodeId: 'res_s2_1',
        width: 8,
        surfaceCondition: 0.9,
        trafficDensity: 0,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.4,
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
        segmentId: 'seg_clinic_gate',
        startNodeId: 'res_s2_1',
        endNodeId: 'res_n1_1',
        width: 8,
        surfaceCondition: 0.9,
        trafficDensity: 0,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.4,
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
        segmentId: 'seg_gate_fuel',
        startNodeId: 'res_n1_1',
        endNodeId: 'art_s_1',
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
        segmentId: 'seg_fuel_garage',
        startNodeId: 'art_s_1',
        endNodeId: 'res_s1_0',
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
        segmentId: 'seg_clinic_school',
        startNodeId: 'res_s2_1',
        endNodeId: 'res_n1_2',
        width: 8,
        surfaceCondition: 0.9,
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
    ],
    pois: [
      { id: 'poi_mirpara_tea_stall', kind: 'teaStall', nameKey: 'poi.mirpara.tea_stall', nodeId: 'res_n2_1' },
      { id: 'poi_mirpara_clinic', kind: 'hospital', nameKey: 'poi.mirpara.clinic', nodeId: 'res_s2_1' },
      { id: 'poi_mirpara_campus_gate', kind: 'officeGate', nameKey: 'poi.mirpara.campus_gate', nodeId: 'res_n1_1' },
      { id: 'poi_mirpara_fuel', kind: 'fuel', nameKey: 'poi.mirpara.fuel', nodeId: 'art_s_1' },
      { id: 'poi_mirpara_garage', kind: 'garage', nameKey: 'poi.mirpara.garage', nodeId: 'res_s1_0' },
      { id: 'poi_mirpara_school', kind: 'school', nameKey: 'poi.mirpara.school', nodeId: 'res_n1_2' },
    ],
    lots: [],
  };
}

function makeWorldTestHarness(extraDistricts: DistrictData[] = []): {
  road: RoadNetwork;
  gm: GameManager;
  session: GameSession;
} {
  const road = RoadNetwork.fromDistricts([makeMilestone3District(), ...extraDistricts]);
  const gm = new GameManager({
    seed: 909,
    mode: 'career',
    data: {
      missions: [
        ...(ch1Missions as unknown as MissionDef[]),
        ...(ch4Missions as unknown as MissionDef[]),
        ...(ch5Missions as unknown as MissionDef[]),
        ...(ch6Missions as unknown as MissionDef[]),
      ],
      encounters: [
        ...(policeData as unknown as EncounterDef[]),
        ...(pickupData as unknown as EncounterDef[]),
      ],
    },
  });
  gm.story.currentChapter = 1;
  gm.eventDirector.enabled = true;
  gm.clock.minutes = 10 * 60;
  const session = new GameSession({
    gm,
    road,
    autoRequests: false,
    negotiation: false,
  });
  vi.spyOn(session.traffic, 'maintainDensity').mockImplementation(() => {});
  return { road, gm, session };
}

function moveBikeToNode(session: GameSession, road: RoadNetwork, nodeId: string, speed = 0): void {
  const node = road.getNode(nodeId)!;
  session.bike.x = node.x;
  session.bike.y = node.y ?? 0;
  session.bike.z = node.z;
  session.bike.speed = speed;
  session.bike.heading = Math.PI / 2;
}

describe('Milestone 3: live 3D tutorial, campaign beacons & deterministic world staging', () => {
  const initialScreen = screenSignal.value;
  const initialMapLive = mapLiveSignal.value;

  afterEach(() => {
    screenSignal.value = initialScreen;
    tutorialSignal.value = { active: false, step: 'completed', receipt: null };
    mapLiveSignal.value = initialMapLive;
  });

  it('unlocks driving in tutorial riding step and keeps modal steps locked', () => {
    screenSignal.value = 'game';
    tutorialSignal.value = { active: true, step: 'alarm', receipt: null };
    expect(uiModalOpen()).toBe(true);

    tutorialSignal.value = { active: true, step: 'riding', receipt: null };
    expect(uiModalOpen()).toBe(false);
  });

  it('runs req_tutorial_01 in 3D from Clinic to Campus Gate with Nabila on pillion and settles once', () => {
    const { road, gm, session } = makeWorldTestHarness();
    let completedCount = 0;
    let lastReqId = '';
    gm.bus.on('ride/completed', (ev) => {
      completedCount++;
      lastReqId = ev.requestId;
    });

    expect(session.startLiveTutorialRide(90)).toBe(true);
    expect(session.isTutorialRideActive()).toBe(true);
    const active = session.ride.getActiveRequest()!;
    expect(active.requestId).toBe('req_tutorial_01');
    expect(active.characterId).toBe('char_nabila');
    expect(active.pickupNodeId).toBe('res_s2_1');
    expect(active.destinationNodeId).toBe('res_n1_1');
    expect(session.ride.currentRoute?.nodeIds.length).toBeGreaterThanOrEqual(2);

    // Waiting at Clinic kerb before arrival
    expect(session.getPassengerActorState().mode).toBe('waitingAtPickup');
    expect(session.getPassengerActorState().waving).toBe(true);

    // Drive to Clinic pickup node: Nabila enters smooth boarding walk (no random dispute)
    moveBikeToNode(session, road, 'res_s2_1', 0);
    session.step(NEUTRAL, SIM_DT);
    expect(gm.eventDirector.activeEncounter).toBeNull();
    expect(session.getPassengerActorState().mode).toBe('walkingToBike');

    for (let i = 0; i < 110; i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(['PassengerOnboard', 'EnRouteToDestination']).toContain(
      session.ride.getTripState()
    );
    expect(session.isPassengerOnPillion()).toBe(true);

    // Drive to Campus Gate dropoff: completes cleanly in 3D
    moveBikeToNode(session, road, 'res_n1_1', 0);
    session.step(NEUTRAL, SIM_DT);
    expect(session.ride.getActiveRequest()).toBeNull();
    expect(completedCount).toBe(1);
    expect(lastReqId).toBe('req_tutorial_01');

    // Calling settleTutorialRide afterward does not double-pay or leave ride active
    const cashAfterLive = gm.economyManager.cash;
    session.settleTutorialRide(90);
    expect(gm.economyManager.cash).toBe(cashAfterLive);
  });

  it('cancels live tutorial ride cleanly on fast-forward settlement or skip', () => {
    const { gm, session } = makeWorldTestHarness();
    let completedCount = 0;
    gm.bus.on('ride/completed', () => {
      completedCount++;
    });

    expect(session.startLiveTutorialRide(80)).toBe(true);
    expect(session.isTutorialRideActive()).toBe(true);

    // Fast-forward finish cancels req_tutorial_01 before settling
    const receipt = session.settleTutorialRide(80);
    expect(receipt.fare).toBe(80);
    expect(session.isTutorialRideActive()).toBe(false);
    expect(completedCount).toBe(1);

    // Skip also cancels any running tutorial ride
    expect(session.startLiveTutorialRide(80)).toBe(true);
    session.cancelLiveTutorialRide();
    expect(session.isTutorialRideActive()).toBe(false);
  });

  it('grounds fuel, reach, rideWith, and Kamal relationship missions into 3D violet beacons, NPCs, and mapLiveSignal', () => {
    const { road, gm, session } = makeWorldTestHarness();
    moveBikeToNode(session, road, 'res_n2_1', 0);

    // Fuel mission -> nearest fuel POI + syncMapLiveFromSession handles poi_kind: prefix
    expect(gm.missionManager.activateMission('m1_fill_up')).toBe(true);
    const fuelBeacon = session.getActiveMissionBeaconState();
    expect(fuelBeacon.visible).toBe(true);
    expect(fuelBeacon.kind).toBe('fuel');
    expect(fuelBeacon.nodeId).toBe('art_s_1');
    expect(session.getActiveMissionRoute()?.nodeIds.length).toBeGreaterThanOrEqual(2);

    // syncMapLiveFromSession resolves fuel/reach with poi_kind: prefix
    syncMapLiveFromSession(session);
    expect(mapLiveSignal.value.storyNodeIds).toEqual(['art_s_1']);
    expect(mapLiveSignal.value.routeNodes.length).toBeGreaterThanOrEqual(2);

    // RideMarkers supports violet mission beacon
    const markers = new RideMarkers();
    markers.setMission(fuelBeacon.worldX, fuelBeacon.worldZ, true);
    expect(markers.mission.root.visible).toBe(true);
    markers.setMission(0, 0, false);
    expect(markers.mission.root.visible).toBe(false);
    markers.dispose();

    // rideWith Ferdousi -> waving story NPC on kerb + pull-up offer within 12m
    gm.missionManager.completeMission('m1_fill_up');
    gm.story.currentChapter = 5;
    gm.story.branchFlags['puran_para_mastered'] = true;
    gm.story.branchFlags['police_checkpoint_survived'] = true;
    expect(gm.missionManager.activateMission('m5_promise')).toBe(true);

    const ferdousiBeacon = session.getActiveMissionBeaconState();
    expect(ferdousiBeacon.visible).toBe(true);
    expect(ferdousiBeacon.kind).toBe('ride_with');
    expect(ferdousiBeacon.characterId).toBe('char_ferdousi');
    expect(ferdousiBeacon.nodeId).toBe('res_n1_2');

    const npcState = session.getMissionCharacterActorState();
    expect(npcState.mode).toBe('waitingAtPickup');
    expect(npcState.waving).toBe(true);
    expect(npcState.hasChild).toBe(true);

    // Move bike next to Ferdousi kerb and stop -> auto pull-up offers ride with char_ferdousi
    session.bike.x = ferdousiBeacon.worldX;
    session.bike.z = ferdousiBeacon.worldZ;
    session.bike.speed = 0;
    session.step(NEUTRAL, SIM_DT);
    expect(session.ride.getOfferedRequests().some((r) => r.characterId === 'char_ferdousi')).toBe(true);

    // Starting a tutorial ride temporarily hides the mission beacon so ride route takes precedence
    expect(session.startLiveTutorialRide(80)).toBe(true);
    expect(session.getActiveMissionBeaconState().visible).toBe(false);
    session.cancelLiveTutorialRide();

    // Kamal relationship mission -> Kamal stands waving at garage kerb when below min threshold
    gm.missionManager.completeMission('m5_promise');
    gm.reputationSystem.changeRelationship('char_kamal', -20);
    gm.story.currentChapter = 6;
    expect(gm.missionManager.activateMission('m6_kamal_offer')).toBe(true);
    const kamalBeacon = session.getActiveMissionBeaconState();
    expect(kamalBeacon.visible).toBe(true);
    expect(kamalBeacon.kind).toBe('relationship');
    expect(kamalBeacon.characterId).toBe('char_kamal');
    expect(kamalBeacon.nodeId).toBe('res_s1_0');
    expect(session.getMissionCharacterActorState().waving).toBe(true);
  });

  it('stages district-filtered rides and Chapter 4 m4_wrong_pickup encounters in live 3D play', () => {
    const puranpara: DistrictData = {
      districtId: 'puranpara',
      name: { bn: 'পুরানপাড়া', en: 'Puranpara' },
      nodes: [
        { nodeId: 'pp_1', x: 380, z: 0, kind: 'poi' },
        { nodeId: 'pp_2', x: 450, z: 0, kind: 'poi' },
      ],
      segments: [
        {
          segmentId: 'seg_link_pp',
          startNodeId: 'res_s1_0',
          endNodeId: 'pp_1',
          width: 7,
          surfaceCondition: 0.85,
          trafficDensity: 0,
          speedLimit: 35,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0.5,
          riskLevel: 0.2,
          oneWay: false,
          divided: false,
          lanes: 2,
          roadType: 'main',
          floodSensitivity: 0.2,
          pickupPractical: true,
          district: 'puranpara',
          tags: [],
        },
        {
          segmentId: 'seg_pp_inner',
          startNodeId: 'pp_1',
          endNodeId: 'pp_2',
          width: 6,
          surfaceCondition: 0.8,
          trafficDensity: 0,
          speedLimit: 30,
          turnRestrictions: [],
          motorcycleAccessible: true,
          pedestrianDensity: 0.6,
          riskLevel: 0.3,
          oneWay: false,
          divided: false,
          lanes: 2,
          roadType: 'alley',
          floodSensitivity: 0.3,
          pickupPractical: true,
          district: 'puranpara',
          tags: [],
        },
      ],
      pois: [
        { id: 'poi_pp_gate', kind: 'market', nameKey: 'poi.puranpara.bazar', nodeId: 'pp_1' },
      ],
      lots: [],
    };

    const { road, gm, session } = makeWorldTestHarness([puranpara]);
    gm.story.currentChapter = 4;
    expect(gm.missionManager.activateMission('m4_unfamiliar_ground')).toBe(true);

    // Zone/district ride filter yields a Puranpara destination
    const filter = gm.missionManager.getActiveRideObjectiveFilter();
    expect(filter).toEqual({ district: 'puranpara' });

    const sample = session.requests.sampleFilteredRequest(
      gm.clock.minutes,
      gm.weather,
      filter!,
      { x: 0, z: 0 }
    );
    expect(sample).not.toBeNull();
    expect(road.getNodeDistrict(sample!.request.destinationNodeId)).toBe('puranpara');

    // Completing m4_unfamiliar_ground unlocks m4_wrong_pickup & enc_police_checkpoint flag
    gm.missionManager.completeMission('m4_unfamiliar_ground');
    gm.story.branchFlags['puran_para_mastered'] = true;
    expect(gm.missionManager.activateMission('m4_wrong_pickup')).toBe(true);

    session.requests.setProfile({
      passengerId: 'pax_m4',
      archetype: 'commuter',
      budget: 140,
      patience: 0.8,
      urgency: 0.5,
      bargainingTendency: 0.3,
      safetySensitivity: 0.6,
      trustInRider: 0.5,
      localKnowledge: 0.5,
      paymentReliability: 0.95,
      relationshipLevel: 0,
      nameKey: 'character.nabila.name',
      traits: { luggage: false, child: false, walkTolerance: 0.6 },
      personalBias: 0,
    });
    session.ride.offer({
      requestId: 'req_m4_test',
      passengerId: 'pax_m4',
      pickupNodeId: 'res_s2_1',
      destinationNodeId: 'pp_2',
      initialFare: 120,
      estimatedDistance: 1.5,
      estimatedDuration: 6,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    });
    expect(session.ride.accept('req_m4_test', 'res_n2_1', true)).toBe(true);

    // Actually ride >= 15m along seg_home_clinic before arriving at res_s2_1
    moveBikeToNode(session, road, 'res_n2_1', 0);
    for (let i = 0; i < 240 && session.bike.x < 25; i++) {
      session.step(THROTTLE, SIM_DT);
    }
    expect(session.bike.x).toBeGreaterThan(20);
    moveBikeToNode(session, road, 'res_s2_1', 0);
    session.step(NEUTRAL, SIM_DT);

    const enc = gm.eventDirector.activeEncounter;
    expect(enc?.encounterId).toBe('enc_wrong_pickup_pin');
    const driveOk = gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: enc!.id,
      choiceId: 'drive',
    }).success;
    expect(driveOk).toBe(true);

    // Board passenger cleanly at the relocated pickup
    const relocatedPickupId = session.ride.getActiveRequest()!.pickupNodeId;
    moveBikeToNode(session, road, relocatedPickupId, 0);
    session.step(NEUTRAL, SIM_DT);
    for (let i = 0; i < 110; i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(['PassengerOnboard', 'EnRouteToDestination']).toContain(
      session.ride.getTripState()
    );

    // Follow route heading and ride >= 35m on trip to trigger enc_police_checkpoint cue
    const segNextId = session.ride.currentRoute?.nodeIds[1] ?? 'pp_1';
    const nextNode = road.getNode(segNextId)!;
    session.bike.heading = Math.atan2(
      nextNode.x - session.bike.x,
      nextNode.z - session.bike.z
    );
    for (let i = 0; i < 360 && !gm.eventDirector.pendingCue; i++) {
      session.step(THROTTLE, SIM_DT);
    }
    expect(gm.eventDirector.pendingCue?.encounterId).toBe('enc_police_checkpoint');
    expect(session.getEncounterStageState().kind).toBe('policeCheckpoint');
  });
});
