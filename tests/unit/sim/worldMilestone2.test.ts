import { describe, it, expect, vi } from 'vitest';
import { SIM_DT } from '../../../src/config/constants';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { DistrictData, EncounterDef } from '../../../src/sim/schemas';
import { WorldEventRenderer } from '../../../src/render/worldEvents';
import { EncounterStageRenderer } from '../../../src/render/encounterStage';
import { StreetHailRenderer } from '../../../src/render/passengerActor';
import routeData from '../../../data/encounters/route.json';
import policeData from '../../../data/encounters/police.json';
import crimeData from '../../../data/encounters/crime.json';
import passengerData from '../../../data/encounters/passenger.json';

const NEUTRAL = { throttle: 0, brake: 0, steer: 0 };

function makeCorridorDistrict(): DistrictData {
  return {
    districtId: 'mirpara',
    name: { bn: 'মিরপাড়া', en: 'Mirpara' },
    nodes: [
      { nodeId: 'n0', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'n1', x: 90, z: 0, kind: 'poi' },
      { nodeId: 'n2', x: 180, z: 0, kind: 'junction' },
      { nodeId: 'n3', x: 300, z: 0, kind: 'poi' },
      { nodeId: 'n4', x: 420, z: 0, kind: 'junction' },
      { nodeId: 'n_alley', x: 180, z: 120, kind: 'junction' },
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
        segmentId: 'seg_1_2',
        startNodeId: 'n1',
        endNodeId: 'n2',
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
        segmentId: 'seg_2_3',
        startNodeId: 'n2',
        endNodeId: 'n3',
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
        roadType: 'market',
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'mirpara',
        tags: ['market'],
      },
      {
        segmentId: 'seg_3_4',
        startNodeId: 'n3',
        endNodeId: 'n4',
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
        segmentId: 'seg_2_alley',
        startNodeId: 'n2',
        endNodeId: 'n_alley',
        width: 4.5,
        surfaceCondition: 0.7,
        trafficDensity: 0,
        speedLimit: 20,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0.85,
        oneWay: false,
        divided: false,
        lanes: 1,
        roadType: 'alley',
        floodSensitivity: 0.2,
        pickupPractical: true,
        district: 'mirpara',
        tags: [],
      },
    ],
    pois: [
      {
        id: 'poi_tea',
        kind: 'teaStall',
        nameKey: 'poi.mirpara.tea_stall',
        nodeId: 'n1',
      },
      {
        id: 'poi_mkt',
        kind: 'market',
        nameKey: 'poi.mirpara.bazar',
        nodeId: 'n3',
      },
    ],
    lots: [],
  };
}

function getDef(arr: unknown[], id: string): EncounterDef {
  return (arr as EncounterDef[]).find((d) => d.id === id)!;
}

function createSession(
  defs?: EncounterDef[],
  opts: { negotiation?: boolean; autoRequests?: boolean } = {}
) {
  const road = RoadNetwork.fromDistricts([makeCorridorDistrict()]);
  const gm = new GameManager({
    seed: 41,
    mode: 'career',
    data: defs ? { encounters: defs } : {},
  });
  gm.eventDirector.enabled = true;
  gm.clock.minutes = 10 * 60;
  const session = new GameSession({
    gm,
    road,
    autoRequests: opts.autoRequests ?? false,
    negotiation: opts.negotiation ?? false,
  });
  vi.spyOn(session.traffic, 'maintainDensity').mockImplementation(() => {});
  session.bike.x = 0;
  session.bike.z = 0;
  session.bike.heading = Math.PI / 2;
  return { gm, road, session };
}

describe('Milestone 2 — 3D Road Events, Checkpoints/Ambushes, Street Hails & Live Jobs', () => {
  it('Pillar A1: WorldEventRenderer stages, pulses, clears, and disposes 3D props across event kinds', () => {
    const road = RoadNetwork.fromDistricts([makeCorridorDistrict()]);
    const worldRenderer = new WorldEventRenderer();
    const { gm } = createSession();

    const initialVersion = gm.roadEvents.version;
    const evConstruction = gm.roadEvents.addEvent({
      id: 'ev_c1',
      kind: 'construction',
      segmentId: 'seg_1_2',
      closesSegment: false,
      hasWorkers: true,
      startMinute: 600,
      durationMinutes: 30,
    });
    const evBus = gm.roadEvents.addEvent({
      id: 'ev_b1',
      kind: 'stalled_vehicle',
      segmentId: 'seg_2_3',
      closesSegment: false,
      startMinute: 600,
      durationMinutes: 30,
    });
    const evVip = gm.roadEvents.addEvent({
      id: 'ev_v1',
      kind: 'vip_protocol',
      segmentId: 'seg_3_4',
      closesSegment: true,
      startMinute: 600,
      durationMinutes: 30,
    });
    const evFlood = gm.roadEvents.addEvent({
      id: 'ev_w1',
      kind: 'waterlogging',
      segmentId: 'seg_2_alley',
      closesSegment: false,
      startMinute: 600,
      durationMinutes: 30,
    });

    expect(gm.roadEvents.version).toBe(initialVersion + 4);
    expect(evConstruction.active && evBus.active && evVip.active && evFlood.active).toBe(true);

    worldRenderer.sync(gm.roadEvents.getActiveEvents(), road);
    expect(worldRenderer.getActiveCount()).toBe(4);
    const busGroup = worldRenderer.getEventGroup('ev_b1');
    expect(busGroup?.visible).toBe(true);
    expect(busGroup?.position.x).toBeCloseTo(240, 2);

    worldRenderer.update(0.1);
    worldRenderer.update(1.2);

    gm.roadEvents.removeEvent('ev_b1');
    worldRenderer.sync(gm.roadEvents.getActiveEvents(), road);
    expect(worldRenderer.getActiveCount()).toBe(3);
    expect(worldRenderer.getEventGroup('ev_b1')).toBeUndefined();

    worldRenderer.dispose();
    expect(worldRenderer.getActiveCount()).toBe(0);
  });

  it('Pillar A2: construction events spawn road workers, survive >350m camera culling, and despawn on removal', () => {
    const { gm, session } = createSession();
    gm.roadEvents.addEvent({
      id: 'ev_work',
      kind: 'construction',
      segmentId: 'seg_1_2',
      closesSegment: false,
      hasWorkers: true,
      startMinute: 600,
      durationMinutes: 30,
    });

    const workers = session.traffic.pedestrians
      .getPedestrians()
      .filter((p) => p.isRoadWorker && p.segmentId === 'seg_1_2');
    expect(workers.length).toBeGreaterThanOrEqual(2);

    // Workers remain even when player/camera moves > 400m away
    session.traffic.pedestrians.maintainDensity(
      { x: 900, z: 900, heading: 0, fovRad: 1 },
      605,
      5
    );
    expect(session.traffic.pedestrians.hasRoadWorkers('seg_1_2')).toBe(true);

    // Removing the construction event clears its workers
    gm.roadEvents.removeEvent('ev_work');
    expect(session.traffic.pedestrians.hasRoadWorkers('seg_1_2')).toBe(false);
  });

  it('Pillar A3: enc_bus_block only triggers near an active stalled_vehicle road event and clears on honk', () => {
    const busBlockDef = getDef(routeData, 'enc_bus_block');
    const { gm, session } = createSession([busBlockDef]);

    const req = session.requests.sampleRequest(600, 'clear', 'app')!;
    req.request.pickupNodeId = 'n0';
    req.request.destinationNodeId = 'n4';
    session.ride.offer(req.request);
    session.ride.accept(req.request.requestId);

    // Board at n0
    session.step(NEUTRAL, SIM_DT);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');

    // Drive east smoothly (> 35m so minTripDistanceM is met) without any stalled_vehicle event: should NOT trigger
    const fired: string[] = [];
    gm.bus.on('encounter/started', ({ instance }) => fired.push(instance.encounterId));

    for (let i = 0; i < 700 && session.bike.x < 160; i++) {
      session.step({ throttle: 0.7, brake: 0, steer: 0 }, SIM_DT);
    }
    expect(fired).toHaveLength(0);

    // Add a live stalled_vehicle road event ahead on seg_2_3 (midpoint x=240) and approach it
    gm.roadEvents.addEvent({
      id: 'ev_bus_live',
      kind: 'stalled_vehicle',
      segmentId: 'seg_2_3',
      closesSegment: false,
      startMinute: gm.clock.minutes,
      durationMinutes: 20,
    });
    session.bike.x = 190;
    session.bike.z = 0;
    session.bike.heading = Math.PI / 2;
    session.bike.speed = 5;
    for (let i = 0; i < 700 && !gm.eventDirector.activeEncounter; i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(gm.eventDirector.activeEncounter?.encounterId).toBe('enc_bus_block');

    // Resolving with 'honk' clears the visible stalled bus road event
    gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: gm.eventDirector.activeEncounter!.id,
      choiceId: 'honk',
    });
    expect(gm.roadEvents.getEventById('ev_bus_live')).toBeUndefined();
  });

  it('Pillar B: stages visible 3D police checkpoints (cue + active), violation signal stops, and locked alley ambushes', () => {
    const checkpointDef = getDef(policeData, 'enc_police_checkpoint');
    const alleyDef = getDef(crimeData, 'enc_dark_alley_blockage');
    const { gm, session } = createSession([checkpointDef, alleyDef]);
    const stageRenderer = new EncounterStageRenderer();

    // 1. Police violation flag stages policeSignalStop ahead
    gm.story.branchFlags['policeViolation'] = true;
    const violStage = session.getEncounterStageState();
    expect(violStage.kind).toBe('policeSignalStop');
    expect(violStage.urgent).toBe(false);
    stageRenderer.update(violStage, 1.0);
    expect(stageRenderer.policeGroup.visible).toBe(true);
    expect(stageRenderer.ambushGroup.visible).toBe(false);
    gm.story.branchFlags['policeViolation'] = false;

    // 2. Chapter 4+ onTrip triggers enc_police_checkpoint cue FIRST and stages checkpoint barrier ahead
    gm.story.currentChapter = 4;
    gm.story.branchFlags['puran_para_mastered'] = true;
    const req = session.requests.sampleRequest(600, 'clear', 'app')!;
    req.request.pickupNodeId = 'n0';
    req.request.destinationNodeId = 'n4';
    session.ride.offer(req.request);
    session.ride.accept(req.request.requestId);
    session.step(NEUTRAL, SIM_DT); // onboard at n0

    session.bike.x = 40;
    for (let i = 0; i < 700 && !gm.eventDirector.pendingCue; i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(gm.eventDirector.pendingCue?.encounterId).toBe('enc_police_checkpoint');
    const cueStage = { ...session.getEncounterStageState() };
    expect(cueStage.kind).toBe('policeCheckpoint');
    expect(cueStage.urgent).toBe(false);
    stageRenderer.update(cueStage, 2.0);
    expect(stageRenderer.policeGroup.visible).toBe(true);

    // Advance until enc_police_checkpoint activates — world position remains locked!
    for (let i = 0; i < 900 && !gm.eventDirector.activeEncounter; i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(gm.eventDirector.activeEncounter?.encounterId).toBe('enc_police_checkpoint');
    const activePoliceStage = session.getEncounterStageState();
    expect(activePoliceStage.kind).toBe('policeCheckpoint');
    expect(activePoliceStage.urgent).toBe(true);
    expect(activePoliceStage.worldX).toBeCloseTo(cueStage.worldX, 3);
    expect(activePoliceStage.worldZ).toBeCloseTo(cueStage.worldZ, 3);

    gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: gm.eventDirector.activeEncounter!.id,
      choiceId: 'explain_rush',
    });

    // 3. Nighttime dark alley stages alleyAmbush during cue and clears if player leaves the alley
    const { gm: gmAlley, session: alleySession } = createSession([alleyDef]);
    gmAlley.clock.minutes = 20 * 60 + 55;
    const reqAlley = alleySession.requests.sampleRequest(
      gmAlley.clock.minutes,
      'clear',
      'app'
    )!;
    reqAlley.request.pickupNodeId = 'n0';
    reqAlley.request.destinationNodeId = 'n4';
    alleySession.ride.offer(reqAlley.request);
    alleySession.ride.accept(reqAlley.request.requestId);
    alleySession.bike.x = 0;
    alleySession.bike.z = 0;
    alleySession.bike.speed = 0;
    alleySession.step(NEUTRAL, SIM_DT); // board at n0 -> EnRouteToDestination (initializes EventDirector before 21:00)
    expect(alleySession.ride.getTripState()).toBe('EnRouteToDestination');

    gmAlley.clock.minutes = 21 * 60;
    alleySession.bike.x = 180;
    alleySession.bike.z = 30;
    alleySession.bike.heading = 0; // north along seg_2_alley
    for (let i = 0; i < 700 && !gmAlley.eventDirector.pendingCue; i++) {
      alleySession.step(NEUTRAL, SIM_DT);
    }
    expect(gmAlley.eventDirector.pendingCue?.encounterId).toBe(
      'enc_dark_alley_blockage'
    );
    const ambushStage = alleySession.getEncounterStageState();
    expect(ambushStage.kind).toBe('alleyAmbush');
    stageRenderer.update(ambushStage, 3.0);
    expect(stageRenderer.ambushGroup.visible).toBe(true);

    // Player reverses back out to main road -> cue cancels and stage clears
    alleySession.bike.x = 40;
    alleySession.bike.z = 0;
    alleySession.step(NEUTRAL, SIM_DT);
    for (let i = 0; i < 60 && gmAlley.eventDirector.pendingCue; i++) {
      alleySession.step(NEUTRAL, SIM_DT);
    }
    expect(gmAlley.eventDirector.pendingCue).toBeNull();
    expect(alleySession.getEncounterStageState().kind).toBe('none');
    stageRenderer.update(alleySession.getEncounterStageState(), 4.0);
    expect(stageRenderer.ambushGroup.visible).toBe(false);
    stageRenderer.dispose();
  });

  it('Pillar C: dead phone spawns waving street-hail NPCs in 3D and stopping beside one starts a street hail ride', () => {
    const { gm, session } = createSession(undefined, { autoRequests: true });
    const hailRenderer = new StreetHailRenderer();
    gm.economyManager.phoneBattery = 0;
    gm.economy.phoneBattery = 0;
    session.bike.x = 20;
    session.bike.z = 0;

    // Step past the 2.0s scan interval while roaming
    for (let i = 0; i < 130; i++) {
      session.step(NEUTRAL, SIM_DT);
    }

    const hails = session.getStreetHailStates();
    const activeHails = hails.filter((h) => h.active);
    expect(activeHails.length).toBeGreaterThanOrEqual(1);
    hailRenderer.update(hails, 1.0);
    expect(hailRenderer.getVisibleCount()).toBe(activeHails.length);

    // Pull right up to the first waving NPC and come to a stop
    const target = activeHails[0]!;
    session.bike.x = target.worldX;
    session.bike.z = target.worldZ;
    session.bike.speed = 0;
    session.step(NEUTRAL, SIM_DT);

    const activeReq = session.ride.getActiveRequest();
    expect(activeReq).not.toBeNull();
    expect(activeReq!.bookingType).toBe('street');
    expect(activeReq!.pickupNodeId).toBe(target.nodeId);

    // Once accepted, street hail slot yields cleanly to WorldPassengerActor
    expect(session.getStreetHailStates().every((s) => !s.active)).toBe(true);
    hailRenderer.dispose();
  });

  it('Pillar D1: enc_regular_direct_call spawns a real live direct ride with Tanvir instead of instant +150 cash', () => {
    const directDef = getDef(passengerData, 'enc_regular_direct_call');
    const { gm, session } = createSession([directDef], { negotiation: true });
    const startCash = gm.economyManager.cash;

    const inst = gm.eventDirector.forceStart('enc_regular_direct_call', gm.bus)!;
    expect(inst).not.toBeNull();

    let negotiationOpened = false;
    gm.bus.on('negotiation/started', () => {
      negotiationOpened = true;
    });

    gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: inst.id,
      choiceId: 'accept',
    });

    // Cash is NOT granted upfront; real Tanvir ride enters EnRouteToPickup bypassing negotiation
    expect(gm.economyManager.cash).toBe(startCash);
    expect(negotiationOpened).toBe(false);
    const req = session.ride.getActiveRequest();
    expect(req).not.toBeNull();
    expect(req!.characterId).toBe('char_tanvir');
    expect(req!.bookingType).toBe('direct');
    expect(req!.initialFare).toBeGreaterThanOrEqual(150);
    expect(session.ride.getTripState()).toBe('Accepted');
    session.step(NEUTRAL, SIM_DT);
    expect(session.ride.getTripState()).toBe('EnRouteToPickup');

    // Complete real pickup -> dropoff -> rider receives actual earnings (100% fare minus fuel)
    const pNode = session.road.getNode(req!.pickupNodeId)!;
    const dNode = session.road.getNode(req!.destinationNodeId)!;
    session.bike.x = pNode.x;
    session.bike.z = pNode.z;
    session.bike.speed = 0;
    session.step(NEUTRAL, SIM_DT);
    expect(['PassengerOnboard', 'EnRouteToDestination']).toContain(
      session.ride.getTripState()
    );

    session.bike.x = dNode.x;
    session.bike.z = dNode.z;
    session.bike.speed = 0;
    session.step(NEUTRAL, SIM_DT);
    expect(session.ride.getTripState()).toBe('Idle');
    expect(gm.economyManager.cash).toBeGreaterThanOrEqual(startCash + 150);
  });

  it('Pillar D2: enc_friend_package spawns a real Mintu DeliveryJob with live pickup/dropoff guidance & respects active rides', () => {
    const friendDef = getDef(passengerData, 'enc_friend_package');
    const { gm, session } = createSession([friendDef]);
    const startCash = gm.economyManager.cash;
    const startMinutes = gm.clock.minutes;

    const inst = gm.eventDirector.forceStart('enc_friend_package', gm.bus)!;
    gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: inst.id,
      choiceId: 'accept',
    });

    // Cash and +12m time are NOT awarded immediately when roaming
    expect(gm.economyManager.cash).toBe(startCash);
    expect(gm.clock.minutes - startMinutes).toBeLessThan(1);

    const target1 = session.getActiveDeliveryTarget();
    expect(target1).not.toBeNull();
    expect(target1!.status).toBe('accepted');
    expect(target1!.nodeId).toBe('n1'); // Mintu's teaStall POI at n1
    expect(session.getActiveDeliveryRoute()).not.toBeNull();

    // Drive to Mintu's tea stall at n1 -> parcel picked up automatically, target switches to dropoff
    session.bike.x = 90;
    session.bike.z = 0;
    session.step(NEUTRAL, SIM_DT);

    const target2 = session.getActiveDeliveryTarget();
    expect(target2).not.toBeNull();
    expect(target2!.status).toBe('in_transit');

    const dropNode = session.road.getNode(target2!.nodeId)!;
    session.bike.x = dropNode.x;
    session.bike.z = dropNode.z;
    session.step(NEUTRAL, SIM_DT);

    expect(session.getActiveDeliveryTarget()).toBeNull();
    expect(gm.deliveryManager.completedDeliveries).toHaveLength(1);
    expect(gm.economyManager.cash).toBe(startCash + 120);

    // During an active passenger ride (e.g. prototype.spec.ts), enc_friend_package does NOT hijack with a delivery
    const sample = session.requests.sampleRequest(gm.clock.minutes, 'clear', 'app')!;
    sample.request.pickupNodeId = 'n0';
    sample.request.destinationNodeId = 'n4';
    session.ride.offer(sample.request);
    session.ride.accept(sample.request.requestId);
    session.bike.x = 0;
    session.bike.z = 0;
    session.step(NEUTRAL, SIM_DT); // EnRouteToDestination

    const midRideInst = gm.eventDirector.forceStart('enc_friend_package', gm.bus)!;
    gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: midRideInst.id,
      choiceId: 'accept',
    });
    expect(session.getActiveDeliveryTarget()).toBeNull();
  });
});
