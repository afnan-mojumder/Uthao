import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../../src/core/events';
import type { GameEvents } from '../../../src/core/events';
import { MissionManager } from '../../../src/sim/mission/MissionManager';
import type { StoryState } from '../../../src/core/types';
import ch1Missions from '../../../data/missions/ch1.json';
import ch2Missions from '../../../data/missions/ch2.json';
import ch3Missions from '../../../data/missions/ch3.json';
import ch4Missions from '../../../data/missions/ch4.json';
import ch5Missions from '../../../data/missions/ch5.json';
import ch6Missions from '../../../data/missions/ch6.json';
import sideMissions from '../../../data/missions/side.json';
import endingsData from '../../../data/endings.json';
import type { MissionDef, EndingDef, DistrictData, WorldData } from '../../../src/sim/schemas';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { RideRequest } from '../../../src/core/types';
import worldJson from '../../../data/world.json';
import mirparaJson from '../../../data/districts/mirpara.json';
import fulgateJson from '../../../data/districts/fulgate.json';
import dhanbaghJson from '../../../data/districts/dhanbagh.json';
import mohakhalJson from '../../../data/districts/mohakhal.json';
import gulbariJson from '../../../data/districts/gulbari.json';
import puranparaJson from '../../../data/districts/puranpara.json';
import motinagarJson from '../../../data/districts/motinagar.json';
import bikeEnc from '../../../data/encounters/bike.json';
import crimeEnc from '../../../data/encounters/crime.json';
import passengerEnc from '../../../data/encounters/passenger.json';
import paymentEnc from '../../../data/encounters/payment.json';
import pickupEnc from '../../../data/encounters/pickup.json';
import routeEnc from '../../../data/encounters/route.json';
import policeEnc from '../../../data/encounters/police.json';
import accidentEnc from '../../../data/encounters/accident.json';

const allDistricts: DistrictData[] = [
  mirparaJson,
  fulgateJson,
  dhanbaghJson,
  mohakhalJson,
  gulbariJson,
  puranparaJson,
  motinagarJson,
] as DistrictData[];
const allEncounters = [
  ...bikeEnc,
  ...crimeEnc,
  ...passengerEnc,
  ...paymentEnc,
  ...pickupEnc,
  ...routeEnc,
  ...policeEnc,
  ...accidentEnc,
];

describe('Campaign Chapters 2–6, Side Missions, and Endless Mode (T5.4)', () => {
  let bus: EventBus<GameEvents>;
  let story: StoryState;
  let manager: MissionManager;

  const allMissions = [
    ...ch1Missions,
    ...ch2Missions,
    ...ch3Missions,
    ...ch4Missions,
    ...ch5Missions,
    ...ch6Missions,
    ...sideMissions,
  ] as MissionDef[];

  beforeEach(() => {
    bus = new EventBus<GameEvents>();
    story = {
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

    manager = new MissionManager({
      bus,
      missions: allMissions,
      endings: endingsData as EndingDef[],
      storyState: story,
    });
  });

  it('loads all 6 chapters and >= 8 side missions with no upgrade prerequisites', () => {
    expect(ch2Missions.length).toBeGreaterThanOrEqual(4);
    expect(ch3Missions.length).toBeGreaterThanOrEqual(3);
    expect(ch4Missions.length).toBeGreaterThanOrEqual(3);
    expect(ch5Missions.length).toBeGreaterThanOrEqual(4);
    expect(ch6Missions.length).toBeGreaterThanOrEqual(3);
    expect(sideMissions.length).toBeGreaterThanOrEqual(8);

    for (const m of allMissions) {
      for (const obj of m.objectives) {
        expect(obj.type === 'buy' && obj.target === 'upgrade').toBe(false);
      }
    }
  });

  it('chapter unlocks next chapter\'s districts progressively', () => {
    // Ch 1
    const d1 = manager.getUnlockedDistricts(1);
    expect(d1).toEqual(['mirpara']);

    // Ch 2
    const d2 = manager.getUnlockedDistricts(2);
    expect(d2).toContain('mirpara');
    expect(d2).toContain('fulgate');
    expect(d2).toContain('motinagar');

    // Ch 3
    const d3 = manager.getUnlockedDistricts(3);
    expect(d3).toContain('dhanbagh');

    // Ch 4
    const d4 = manager.getUnlockedDistricts(4);
    expect(d4).toContain('puranpara');

    // Ch 5
    const d5 = manager.getUnlockedDistricts(5);
    expect(d5).toContain('gulbari');
    expect(d5).toContain('mohakhal');

    // Ch 6 / Endings
    const d6 = manager.getUnlockedDistricts(6);
    expect(d6).toContain('puranpara');
    expect(d6).toContain('gulbari');
    expect(d6).toContain('testloop');
    expect(d6.length).toBe(8);
  });

  it('each chapter final is reachable sequentially by bot policies', () => {
    // Ch 1 final
    manager.completeMission('m1_first_ride');
    manager.completeMission('m1_fill_up');
    manager.completeMission('m1_household');
    expect(story.currentChapter).toBe(2);

    // Ch 2 final
    manager.completeMission('m2_rush_hustle');
    manager.completeMission('m2_profit_lesson');
    manager.completeMission('m2_regular_faces');
    manager.completeMission('m2_evening_rush');
    expect(story.currentChapter).toBe(3);

    // Ch 3 final
    manager.completeMission('m3_first_monsoon');
    manager.completeMission('m3_faster_bhai');
    manager.completeMission('m3_hospital_run');
    expect(story.currentChapter).toBe(4);

    // Ch 4 final
    manager.completeMission('m4_unfamiliar_ground');
    manager.completeMission('m4_wrong_pickup');
    manager.completeMission('m4_home_safe');
    expect(story.currentChapter).toBe(5);

    // Ch 5 final
    manager.completeMission('m5_calls');
    manager.completeMission('m5_promise');
    manager.completeMission('m5_package');
    manager.completeMission('m5_linked_jobs');
    expect(story.currentChapter).toBe(6);

    // Ch 6 final
    manager.completeMission('m6_kamal_offer');
    manager.completeMission('m6_test_ride');
    manager.completeMission('m6_decision');
    expect(story.branchFlags['campaign_completed']).toBe(true);
  });

  it('supports Endless Ride mode with all districts unlocked and no mandatory missions', () => {
    const gm = new GameManager({
      seed: 42,
      mode: 'endless',
      data: {},
    });

    expect(gm.mode).toBe('endless');
    expect(gm.missionManager.getActiveMissions().length).toBe(0);
    const districts = gm.missionManager.getUnlockedDistricts();
    expect(districts.length).toBe(8);
    expect(districts).toContain('mirpara');
    expect(districts).toContain('puranpara');
    expect(districts).toContain('gulbari');

    // Advancing past Day 20 in Endless mode NEVER triggers m6_decision or ending/reached
    const endings: string[] = [];
    gm.bus.on('ending/reached', ({ endingId }) => endings.push(endingId));
    for (let d = 2; d <= 22; d++) {
      gm.clock.day = d;
      gm.bus.emit('day/started', { day: d });
    }
    expect(gm.missionManager.isMissionActive('m6_decision')).toBe(false);
    expect(endings).toEqual([]);
  });

  it('walks all 6 chapters (ch1-ch6) through live GameSession and reaches Day 20 finale without softlocks', () => {
    const network = RoadNetwork.fromWorld(worldJson as WorldData, allDistricts);
    const gm = new GameManager({
      seed: 42,
      mode: 'career',
      data: { encounters: allEncounters as never },
    });
    const session = new GameSession({ gm, road: network, autoRequests: false, negotiation: false });
    gm.eventDirector.enabled = false;

    const completeLiveRide = (
      pickupNodeId: string,
      destinationNodeId: string,
      opts: {
        fare?: number;
        characterId?: string;
        bookingType?: 'app' | 'direct' | 'street';
      } = {}
    ) => {
      const reqId = `req_live_${++gm.requestSeq}`;
      const req: RideRequest = {
        requestId: reqId,
        passengerId: opts.characterId ? `pass_${opts.characterId}` : `pass_${reqId}`,
        ...(opts.characterId ? { characterId: opts.characterId } : {}),
        pickupNodeId,
        destinationNodeId,
        initialFare: opts.fare ?? 600,
        estimatedDistance: 3.0,
        estimatedDuration: 8,
        requestedArrivalTime: null,
        bookingType: opts.bookingType ?? 'app',
        status: 'WaitingForPickup',
        surge: 1.0,
      };
      session.ride.offer(req);
      expect(session.ride.accept(reqId, pickupNodeId)).toBe(true);

      const pNode = network.getNode(pickupNodeId)!;
      session.bike.x = pNode.x;
      session.bike.z = pNode.z;
      session.bike.speed = 0;
      session.ride.update({ x: pNode.x, z: pNode.z, speed: 0 }, 0.1);

      const dNode = network.getNode(destinationNodeId)!;
      session.bike.x = dNode.x;
      session.bike.z = dNode.z;
      session.bike.speed = 0;
      session.ride.update({ x: dNode.x, z: dNode.z, speed: 0 }, 0.1);
    };

    const resolveEnc = (encounterId: string, choiceId: string) => {
      const inst = gm.eventDirector.forceStart(encounterId, gm.bus);
      expect(inst, `forceStart(${encounterId})`).not.toBeNull();
      expect(
        gm.dispatch({ type: 'chooseEncounterOption', instanceId: inst!.id, choiceId }).success
      ).toBe(true);
    };

    const advanceToDay = (day: number, minute = 480) => {
      gm.clock.day = day;
      gm.clock.minutes = minute;
      gm.bus.emit('day/started', { day });
    };

    // --- Chapter 1 ---
    expect(gm.missionManager.isMissionActive('m1_first_ride')).toBe(true);
    session.settleTutorialRide(100);
    expect(gm.missionManager.isMissionCompleted('m1_first_ride')).toBe(true);
    expect(gm.missionManager.isMissionActive('m1_fill_up')).toBe(true);

    // Refuel at Mirpara fuel station (poi_mirpara_fuel -> find node) + 3 rides
    const fuelPoi = network.getPois().find((p) => p.kind === 'fuel')!;
    const fuelNode = network.getNode(fuelPoi.nodeId)!;
    session.bike.x = fuelNode.x;
    session.bike.z = fuelNode.z;
    expect(gm.dispatch({ type: 'refuelAtStation', liters: 1 }).success).toBe(true);

    for (let i = 0; i < 3; i++) {
      completeLiveRide('art_n_1', 'art_n_2', { fare: 200 });
    }
    expect(gm.missionManager.isMissionCompleted('m1_fill_up')).toBe(true);

    // Day 2: m1_household
    advanceToDay(2, 480);
    expect(gm.missionManager.isMissionActive('m1_household')).toBe(true);
    completeLiveRide('art_n_1', 'art_n_2', { fare: 1000 });
    completeLiveRide('art_n_1', 'art_n_2', { fare: 1000 });
    expect(gm.dispatch({ type: 'payExpense', expenseId: 'family', amount: 1200 }).success).toBe(true);
    expect(gm.missionManager.isMissionCompleted('m1_household')).toBe(true);
    expect(gm.story.currentChapter).toBe(2);

    // --- Chapter 2 ---
    advanceToDay(4, 480); // 08:00 AM (before 10:00 AM = 600)
    expect(gm.missionManager.isMissionActive('m2_rush_hustle')).toBe(true);
    // Non-market ride at 08:00 must NOT advance m2_rush_hustle
    completeLiveRide('art_n_0', 'art_n_1', { fare: 150 });
    expect(
      gm.missionManager.getObjectiveStates('m2_rush_hustle').find((s) => s.id === 'obj_m2_rush_rides')
        ?.progress
    ).toBe(0);
    // Market ride AFTER 10:00 AM must NOT advance m2_rush_hustle
    gm.clock.minutes = 650;
    completeLiveRide('res_s1_1', 'res_s1_2', { fare: 150 });
    expect(
      gm.missionManager.getObjectiveStates('m2_rush_hustle').find((s) => s.id === 'obj_m2_rush_rides')
        ?.progress
    ).toBe(0);
    // 4 market rides before 600 complete m2_rush_hustle
    gm.clock.minutes = 500;
    for (let i = 0; i < 4; i++) {
      completeLiveRide('res_s1_1', 'res_s1_2', { fare: 150 });
    }
    expect(gm.missionManager.isMissionCompleted('m2_rush_hustle')).toBe(true);
    expect(gm.missionManager.isMissionActive('m2_profit_lesson')).toBe(true);

    // m2_profit_lesson
    completeLiveRide('art_n_1', 'art_n_2', { fare: 150 });
    completeLiveRide('art_n_1', 'art_n_2', { fare: 150 });
    resolveEnc('enc_vendor_discount', 'standard');
    expect(gm.missionManager.isMissionCompleted('m2_profit_lesson')).toBe(true);

    // Day 5: m2_regular_faces
    advanceToDay(5, 500);
    expect(gm.missionManager.isMissionActive('m2_regular_faces')).toBe(true);
    gm.reputationSystem.changeRelationship('char_tanvir', 10);
    expect(gm.missionManager.isMissionCompleted('m2_regular_faces')).toBe(true);

    // Day 6: m2_evening_rush (count: 5, distinctDistricts: 3, beforeMinute: 1050)
    advanceToDay(6, 900);
    expect(gm.missionManager.isMissionActive('m2_evening_rush')).toBe(true);
    // 5 rides all inside mirpara should NOT complete without 3 distinct districts
    // (note earlier rides only touched mirpara so visitedDistricts only has mirpara)
    completeLiveRide('art_n_1', 'fulgate_art_n_0', { fare: 200 }); // visits fulgate (2 districts)
    completeLiveRide('art_n_1', 'motinagar_art_n_0', { fare: 250 }); // visits motinagar (3 districts)
    completeLiveRide('art_n_1', 'art_n_2', { fare: 150 });
    completeLiveRide('art_n_1', 'art_n_2', { fare: 150 });
    completeLiveRide('art_n_1', 'art_n_2', { fare: 150 });
    expect(gm.missionManager.isMissionCompleted('m2_evening_rush')).toBe(true);
    expect(gm.story.currentChapter).toBe(3);

    // --- Chapter 3 ---
    advanceToDay(7, 600);
    expect(gm.missionManager.isMissionActive('m3_first_monsoon')).toBe(true);
    gm.weatherSystem.setWeather('clear');
    gm.weather = 'clear';
    completeLiveRide('art_n_1', 'art_n_2', { fare: 150 });
    expect(
      gm.missionManager.getObjectiveStates('m3_first_monsoon')[0]?.progress
    ).toBe(0);

    gm.weatherSystem.setWeather('heavyRain');
    gm.weather = 'heavyRain';
    for (let i = 0; i < 3; i++) {
      completeLiveRide('art_n_1', 'art_n_2', { fare: 150 });
    }
    expect(gm.missionManager.isMissionCompleted('m3_first_monsoon')).toBe(true);

    // Day 8: m3_faster_bhai
    advanceToDay(8, 600);
    expect(gm.missionManager.isMissionActive('m3_faster_bhai')).toBe(true);
    completeLiveRide('art_n_1', 'art_n_2', { fare: 150 });
    resolveEnc('enc_urgent_exam', 'refuse');
    expect(gm.missionManager.isMissionCompleted('m3_faster_bhai')).toBe(true);

    // Day 9: m3_hospital_run (district: dhanbagh + helpedHospitalFree)
    advanceToDay(9, 600);
    expect(gm.missionManager.isMissionActive('m3_hospital_run')).toBe(true);
    const dhanbaghHospital = network.getPois().find((p) => p.kind === 'hospital' && network.getNodeDistrict(p.nodeId) === 'dhanbagh')!;
    completeLiveRide('art_n_1', dhanbaghHospital.nodeId, { fare: 250 });
    resolveEnc('enc_vendor_discount', 'grant');
    expect(gm.missionManager.isMissionCompleted('m3_hospital_run')).toBe(true);
    expect(gm.story.currentChapter).toBe(4);

    // --- Chapter 4 ---
    advanceToDay(10, 600);
    expect(gm.missionManager.isMissionActive('m4_unfamiliar_ground')).toBe(true);
    const puranSeg = network.getAllSegments().find((s) => s.district === 'puranpara')!;
    completeLiveRide('art_n_1', puranSeg.startNodeId, { fare: 300 });
    expect(gm.missionManager.isMissionCompleted('m4_unfamiliar_ground')).toBe(true);

    // Day 11: m4_wrong_pickup
    advanceToDay(11, 600);
    expect(gm.missionManager.isMissionActive('m4_wrong_pickup')).toBe(true);
    resolveEnc('enc_wrong_pickup_pin', 'walk');
    resolveEnc('enc_police_checkpoint', 'explain_rush');
    expect(gm.missionManager.isMissionCompleted('m4_wrong_pickup')).toBe(true);

    // Day 12: m4_home_safe explicit police cooperation decision beat
    advanceToDay(12, 600);
    expect(gm.missionManager.isMissionActive('m4_home_safe')).toBe(true);
    resolveEnc('enc_m4_police_decision', 'decline');
    expect(gm.story.branchFlags['cooperatedPolice']).toBe(false);
    expect(gm.story.branchFlags['m4_police_decision_made']).toBe(true);
    expect(gm.missionManager.isMissionCompleted('m4_home_safe')).toBe(true);
    expect(gm.story.currentChapter).toBe(5);

    // --- Chapter 5 ---
    advanceToDay(13, 500);
    expect(gm.missionManager.isMissionActive('m5_calls')).toBe(true);
    for (let i = 0; i < 3; i++) {
      completeLiveRide('art_n_1', 'art_n_2', { fare: 200, bookingType: 'direct' });
    }
    expect(gm.missionManager.isMissionCompleted('m5_calls')).toBe(true);

    // Day 14: m5_promise MUST trigger char_ferdousi offer even when initial relationship < 15
    advanceToDay(14, 480); // 08:00 <= 540
    expect(gm.missionManager.isMissionActive('m5_promise')).toBe(true);
    const ferdousiOffer = session.ride.getOfferedRequests().find((r) => r.characterId === 'char_ferdousi');
    expect(ferdousiOffer).toBeDefined();
    expect(session.ride.accept(ferdousiOffer!.requestId, ferdousiOffer!.pickupNodeId)).toBe(true);
    const fp = network.getNode(ferdousiOffer!.pickupNodeId)!;
    session.ride.update({ x: fp.x, z: fp.z, speed: 0 }, 0.1);
    const fd = network.getNode(ferdousiOffer!.destinationNodeId)!;
    session.ride.update({ x: fd.x, z: fd.z, speed: 0 }, 0.1);
    expect(gm.missionManager.isMissionCompleted('m5_promise')).toBe(true);

    // Day 15: m5_package triggers char_mintu
    advanceToDay(15, 600);
    expect(gm.missionManager.isMissionActive('m5_package')).toBe(true);
    const mintuOffer = session.ride.getOfferedRequests().find((r) => r.characterId === 'char_mintu');
    expect(mintuOffer).toBeDefined();
    expect(session.ride.accept(mintuOffer!.requestId, mintuOffer!.pickupNodeId)).toBe(true);
    const mp = network.getNode(mintuOffer!.pickupNodeId)!;
    session.ride.update({ x: mp.x, z: mp.z, speed: 0 }, 0.1);
    const md = network.getNode(mintuOffer!.destinationNodeId)!;
    session.ride.update({ x: md.x, z: md.z, speed: 0 }, 0.1);
    expect(gm.missionManager.isMissionCompleted('m5_package')).toBe(true);

    // Day 16: m5_linked_jobs
    advanceToDay(16, 600);
    expect(gm.missionManager.isMissionActive('m5_linked_jobs')).toBe(true);
    for (let i = 0; i < 4; i++) {
      completeLiveRide('art_n_1', 'art_n_2', { fare: 200 });
    }
    expect(gm.missionManager.isMissionCompleted('m5_linked_jobs')).toBe(true);
    expect(gm.story.currentChapter).toBe(6);

    // --- Chapter 6 ---
    advanceToDay(17, 600);
    // m6_kamal_offer retro-checked and auto-completed (char_kamal rel >= 15)
    expect(gm.missionManager.isMissionCompleted('m6_kamal_offer')).toBe(true);

    // Day 18: m6_test_ride completes, m6_decision must NOT fire on Day 18
    advanceToDay(18, 600);
    expect(gm.missionManager.isMissionActive('m6_test_ride')).toBe(true);
    const endings: string[] = [];
    gm.bus.on('ending/reached', (ev) => {
      if (!ev.choices) endings.push(ev.endingId);
    });
    completeLiveRide('art_n_1', 'art_n_2', { fare: 200 });
    completeLiveRide('art_n_1', 'art_n_2', { fare: 200 });
    expect(gm.missionManager.isMissionCompleted('m6_test_ride')).toBe(true);
    expect(gm.missionManager.isMissionActive('m6_decision')).toBe(false);
    expect(endings).toEqual([]);

    // Day 20: m6_decision opens and career choice completes campaign
    advanceToDay(20, 600);
    expect(gm.missionManager.isMissionActive('m6_decision')).toBe(true);
    expect(gm.dispatch({ type: 'selectCareerChoice', choice: 'continue' }).success).toBe(true);
    expect(gm.story.branchFlags['campaign_completed']).toBe(true);
    expect(endings).toHaveLength(1);
  });
});
