import { describe, it, expect, vi } from 'vitest';
import { MissionManager } from '../../../src/sim/mission/MissionManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import ch1Missions from '../../../data/missions/ch1.json';
import type { MissionDef } from '../../../src/sim/schemas';
import type { StoryState } from '../../../src/core/types';

describe('T3.8 First Ride Mission m1_first_ride Integration', () => {
  it('loads m1_first_ride from ch1.json with Nabila ride objective', () => {
    const firstRide = (ch1Missions as MissionDef[]).find((m) => m.id === 'm1_first_ride');
    expect(firstRide).toBeDefined();
    expect(firstRide?.chapter).toBe(1);
    expect(firstRide?.day).toBe(1);
    expect(firstRide?.objectives.length).toBe(1);

    const objIds = firstRide!.objectives.map((o) => o.id);
    expect(objIds).toContain('obj_m1_nabila_pickup');
  });

  it('tracks tutorial opening flags and completes mission upon ride drop-off', () => {
    const bus = new EventBus<GameEvents>();
    const storyState: StoryState = {
      currentChapter: 1,
      completedMissions: [],
      activeMissions: ['m1_first_ride'],
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

    const objUpdatedSpy = vi.fn();
    const missionCompletedSpy = vi.fn();
    bus.on('mission/objectiveUpdated', objUpdatedSpy);
    bus.on('mission/completed', missionCompletedSpy);

    const manager = new MissionManager({
      bus,
      missions: ch1Missions as MissionDef[],
      storyState,
    });

    expect(manager.isMissionActive('m1_first_ride')).toBe(true);

    // Opening sequence steps emit story flags
    bus.emit('story/flag', { key: 'tutorial_alarm_dismissed', value: true });
    expect(storyState.branchFlags['tutorial_alarm_dismissed']).toBe(true);

    bus.emit('story/flag', { key: 'tutorial_ma_reminder_heard', value: true });
    expect(storyState.branchFlags['tutorial_ma_reminder_heard']).toBe(true);

    bus.emit('story/flag', { key: 'tutorial_bike_started', value: true });
    expect(storyState.branchFlags['tutorial_bike_started']).toBe(true);

    bus.emit('story/flag', { key: 'tutorial_mintu_advice', value: true });
    expect(storyState.branchFlags['tutorial_mintu_advice']).toBe(true);

    bus.emit('story/flag', { key: 'tutorial_nabila_negotiated', value: true });
    expect(storyState.branchFlags['tutorial_nabila_negotiated']).toBe(true);

    expect(manager.isMissionActive('m1_first_ride')).toBe(true);

    // Ride completion with Nabila
    bus.emit('ride/completed', {
      requestId: 'req_tutorial_01',
      receipt: {
        requestId: 'req_tutorial_01',
        fare: 100,
        tip: 0,
        commission: 15,
        fuelCost: 5,
        otherCosts: 0,
        net: 85,
        durationMin: 3,
        distanceKm: 0.1,
        rating: 5,
        consequences: [],
      },
    });

    expect(objUpdatedSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        missionId: 'm1_first_ride',
        objectiveId: 'obj_m1_nabila_pickup',
      })
    );

    // Verified: mission completed
    expect(missionCompletedSpy).toHaveBeenCalledWith({ missionId: 'm1_first_ride' });
    expect(manager.isMissionActive('m1_first_ride')).toBe(false);
    expect(manager.isMissionCompleted('m1_first_ride')).toBe(true);
    expect(storyState.completedMissions).toContain('m1_first_ride');

    // Verified: unlocks m1_fill_up
    expect(manager.isMissionActive('m1_fill_up')).toBe(true);
  });
});
