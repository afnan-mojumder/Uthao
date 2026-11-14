import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import type { MissionDef, EncounterDef } from '../../../src/sim/schemas';

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
});
