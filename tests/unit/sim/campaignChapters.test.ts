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
import type { MissionDef, EndingDef } from '../../../src/sim/schemas';
import { GameManager } from '../../../src/sim/GameManager';

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
  });
});
