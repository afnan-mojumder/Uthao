import { describe, it, expect, vi } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { SIM_DT } from '../../../src/config/constants';
import { Rng } from '../../../src/core/rng';
import type { MissionDef, EncounterDef, DistrictData } from '../../../src/sim/schemas';
import mirparaData from '../../../data/districts/mirpara.json';
import { HudView, type HudState } from '../../../src/ui/hud/Hud';
import { setLanguage, t } from '../../../src/ui/i18n';
import type { VNode } from 'preact';

function collectText(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
  } else if (Array.isArray(node)) {
    for (const c of node) collectText(c, out);
  } else if (node && typeof node === 'object') {
    const v = node as VNode<Record<string, unknown>>;
    if (typeof v.type === 'function') {
      collectText((v.type as (p: unknown) => unknown)(v.props ?? {}), out);
    } else {
      collectText(v.props?.children, out);
    }
  }
  return out;
}

describe('Encounter-to-Mission flow & reach objective', () => {
  it('activates a triggerOnly mission from an encounter choice and completes reach + ride objectives', () => {
    const mission: MissionDef = {
      id: 'side_test_mission',
      chapter: 1,
      day: 1,
      triggerOnly: true,
      titleKey: 'mission_side_test_title',
      descKey: 'mission_side_test_desc',
      prerequisites: [],
      objectives: [
        {
          id: 'obj_reach_fuel',
          descKey: 'obj_reach_fuel_desc',
          type: 'reach',
          poiId: 'poi_kind:fuel',
        },
      ],
      rewards: [{ type: 'money', amount: 150, kind: 'reward' }],
      unlocks: [],
    };

    const encounter: EncounterDef = {
      id: 'enc_test_mission_offer',
      category: 'route',
      trigger: { phase: 'roaming' },
      weight: 10,
      cooldownMin: 10,
      oncePerDay: false,
      lineKey: 'encounter.test.title',
      choices: [
        {
          id: 'accept_job',
          labelKey: 'encounter.test.accept',
          effects: [{ type: 'startMission', missionId: 'side_test_mission' }],
        },
      ],
    };

    const gm = new GameManager({
      mode: 'career',
      seed: 1,
      data: {
        missions: [mission],
        encounters: [encounter],
      },
    });

    // triggerOnly mission must NOT auto-activate at day start
    expect(gm.story.activeMissions).not.toContain('side_test_mission');

    const inst = gm.eventDirector.forceStart('enc_test_mission_offer', gm.bus);
    expect(inst).not.toBeNull();

    const res = gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: inst!.id,
      choiceId: 'accept_job',
    });
    expect(res.success).toBe(true);
    expect(gm.story.activeMissions).toContain('side_test_mission');

    // Reaching a matching POI completes the reach objective and mission
    gm.missionManager.checkNearbyPois(new Set(['poi_kind:fuel']));
    expect(gm.story.completedMissions).toContain('side_test_mission');
    expect(gm.story.activeMissions).not.toContain('side_test_mission');
  });

  it('reaches all 3 triggered side missions from real encounters and guards against infinite re-completion', () => {
    const road = RoadNetwork.fromDistricts([mirparaData as DistrictData]);

    // 1. side_puncture_patch via checkPuncture() -> enc_puncture -> limp_kamal
    const gm1 = new GameManager({ seed: 10, mode: 'career', data: {} });
    gm1.eventDirector.enabled = true;
    const s1 = new GameSession({ gm: gm1, road, autoRequests: false });
    const punctureRng = (s1 as unknown as { punctureRng: Rng }).punctureRng;
    const spy = vi.spyOn(punctureRng, 'chance').mockReturnValue(true);
    s1.bike.speed = 15;
    s1.step({ throttle: 1, brake: 0, steer: 0 }, SIM_DT);
    spy.mockRestore();

    expect(gm1.eventDirector.activeEncounter?.encounterId).toBe('enc_puncture');
    gm1.dispatch({
      type: 'chooseEncounterOption',
      instanceId: gm1.eventDirector.activeEncounter!.id,
      choiceId: 'limp_kamal',
    });
    expect(gm1.story.activeMissions).toContain('side_puncture_patch');

    gm1.missionManager.checkNearbyPois(new Set(['poi_kind:fuel']));
    gm1.bus.emit('ride/completed', {
      requestId: 'r_punc_1',
      receipt: {
        requestId: 'r_punc_1',
        fare: 100,
        tip: 0,
        commission: 15,
        fuelCost: 5,
        otherCosts: 0,
        bonus: 0,
        penalties: 0,
        compensation: 0,
        fuelLiters: 0.04,
        net: 80,
        durationMin: 5,
        distanceKm: 1,
        rating: 5,
        consequences: [],
      },
    });
    expect(gm1.story.completedMissions).toContain('side_puncture_patch');
    expect(gm1.story.activeMissions).not.toContain('side_puncture_patch');

    // Attempting to re-activate completed triggerOnly mission must return false and grant no duplicate reward
    const cashAfterComplete = gm1.economyManager.cash;
    expect(gm1.missionManager.activateMission('side_puncture_patch')).toBe(false);
    expect(gm1.story.activeMissions).not.toContain('side_puncture_patch');
    expect(gm1.economyManager.cash).toBe(cashAfterComplete);

    // 2. side_accident_inspection via crash -> enc_accident_aftermath -> check_and_settle
    const gm2 = new GameManager({ seed: 11, mode: 'career', data: {} });
    gm2.eventDirector.enabled = true;
    new GameSession({ gm: gm2, road, autoRequests: false });
    gm2.bus.emit('bike/collision', { severity: 'crash', relSpeedKmh: 34, otherKind: 'traffic' });
    expect(gm2.eventDirector.activeEncounter?.encounterId).toBe('enc_accident_aftermath');
    gm2.dispatch({
      type: 'chooseEncounterOption',
      instanceId: gm2.eventDirector.activeEncounter!.id,
      choiceId: 'check_and_settle',
    });
    expect(gm2.story.activeMissions).toContain('side_accident_inspection');
    gm2.missionManager.checkNearbyPois(new Set(['poi_kind:hospital']));
    gm2.bus.emit('ride/completed', {
      requestId: 'r_acc_1',
      receipt: {
        requestId: 'r_acc_1',
        fare: 100,
        tip: 0,
        commission: 15,
        fuelCost: 5,
        otherCosts: 0,
        bonus: 0,
        penalties: 0,
        compensation: 0,
        fuelLiters: 0.04,
        net: 80,
        durationMin: 5,
        distanceKm: 1,
        rating: 5,
        consequences: [],
      },
    });
    expect(gm2.story.completedMissions).toContain('side_accident_inspection');
    expect(gm2.missionManager.activateMission('side_accident_inspection')).toBe(false);

    // 3. side_police_clearance via violation -> enc_police_signal_stop -> explain
    const gm3 = new GameManager({ seed: 12, mode: 'career', data: {} });
    gm3.eventDirector.enabled = true;
    gm3.bus.emit('bike/infraction', { kind: 'speeding', segmentId: 'seg_1' });
    const mainSeg = road.getAllSegments().find((s) => s.roadType === 'main')!;
    let polInst = null;
    for (let m = 0; m < 60 && (!polInst || polInst.encounterId !== 'enc_police_signal_stop'); m++) {
      if (gm3.eventDirector.activeEncounter) {
        gm3.dispatch({
          type: 'chooseEncounterOption',
          instanceId: gm3.eventDirector.activeEncounter.id,
          choiceId: gm3.eventDirector.activeEncounter.choices[0]!.id,
        });
      }
      polInst = gm3.eventDirector.evaluate(
        {
          phase: 'roaming',
          minute: 10 * 60 + m,
          day: 1,
          weather: 'clear',
          chapter: 1,
          flags: gm3.story.branchFlags,
          relationships: {},
          cash: 1000,
          speedKmh: 0,
          bikeCondition: 90,
          segment: mainSeg,
        },
        gm3.bus
      );
    }
    expect(polInst?.encounterId).toBe('enc_police_signal_stop');
    gm3.dispatch({
      type: 'chooseEncounterOption',
      instanceId: polInst!.id,
      choiceId: 'explain',
    });
    expect(gm3.story.activeMissions).toContain('side_police_clearance');
    gm3.missionManager.checkNearbyPois(new Set(['poi_kind:officeGate']));
    gm3.bus.emit('ride/completed', {
      requestId: 'r_pol_1',
      receipt: {
        requestId: 'r_pol_1',
        fare: 100,
        tip: 0,
        commission: 15,
        fuelCost: 5,
        otherCosts: 0,
        bonus: 0,
        penalties: 0,
        compensation: 0,
        fuelLiters: 0.04,
        net: 80,
        durationMin: 5,
        distanceKm: 1,
        rating: 5,
        consequences: [],
      },
    });
    expect(gm3.story.completedMissions).toContain('side_police_clearance');
    expect(gm3.missionManager.activateMission('side_police_clearance')).toBe(false);
  });

  it('respects noCrash objective when a crash occurs before ride completion', () => {
    const gm = new GameManager({ seed: 15, mode: 'career', data: {} });
    expect(gm.missionManager.activateMission('side_puncture_patch')).toBe(true);
    gm.missionManager.checkNearbyPois(new Set(['poi_kind:fuel']));

    // Simulate a crash during the ride, then complete the ride
    gm.bus.emit('ride/started', { requestId: 'req_crash_ride' });
    gm.bus.emit('bike/collision', { severity: 'crash', relSpeedKmh: 35, otherKind: 'static' });
    gm.bus.emit('ride/completed', {
      requestId: 'req_crash_ride',
      receipt: {
        requestId: 'req_crash_ride',
        fare: 100,
        tip: 0,
        commission: 15,
        fuelCost: 5,
        otherCosts: 0,
        bonus: 0,
        penalties: 0,
        compensation: 0,
        fuelLiters: 0.04,
        net: 80,
        durationMin: 5,
        distanceKm: 1,
        rating: 1,
        consequences: [],
      },
    });

    // Crashed ride must NOT complete noCrash objective
    expect(gm.story.completedMissions).not.toContain('side_puncture_patch');
    expect(gm.story.activeMissions).toContain('side_puncture_patch');

    // Subsequent clean ride DOES complete it
    gm.bus.emit('ride/started', { requestId: 'req_clean_ride' });
    gm.bus.emit('ride/completed', {
      requestId: 'req_clean_ride',
      receipt: {
        requestId: 'req_clean_ride',
        fare: 100,
        tip: 0,
        commission: 15,
        fuelCost: 5,
        otherCosts: 0,
        bonus: 0,
        penalties: 0,
        compensation: 0,
        fuelLiters: 0.04,
        net: 80,
        durationMin: 5,
        distanceKm: 1,
        rating: 5,
        consequences: [],
      },
    });
    expect(gm.story.completedMissions).toContain('side_puncture_patch');
  });

  it('displays active side missions on HUD alongside main missions', () => {
    setLanguage('en');
    const gm = new GameManager({ seed: 21, mode: 'career', data: {} });
    expect(gm.story.activeMissions).toContain('m1_first_ride');
    gm.missionManager.activateMission('side_puncture_patch');
    expect(gm.story.activeMissions).toContain('side_puncture_patch');

    const hudMissions = gm.missionManager.getHudMissions();
    expect(hudMissions.main?.titleKey).toBe('mission_m1_first_ride_title');
    expect(hudMissions.side.some((s) => s.titleKey === 'mission_side_puncture_patch_title')).toBe(true);

    const state: HudState = {
      speedKmh: 0,
      fuelL: 4,
      fuelMaxL: 8,
      objectiveText: 'Looking for fares...',
      todayNetEarnings: 0,
      shiftClock: '08:00',
      shiftDay: 1,
      rating: 5,
      activeMission: hudMissions.main,
      activeSideMissions: hudMissions.side,
    };

    const text = collectText(HudView({ state })).join(' ');
    expect(text).toContain(t('mission_m1_first_ride_title'));
    expect(text).toContain(t('mission_side_puncture_patch_title'));
  });
});
