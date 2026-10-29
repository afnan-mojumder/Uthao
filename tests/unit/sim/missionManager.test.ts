import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../../../src/core/events';
import type { GameEvents } from '../../../src/core/events';
import { MissionManager } from '../../../src/sim/mission/MissionManager';
import type { StoryState } from '../../../src/core/types';
import ch1Missions from '../../../data/missions/ch1.json';
import ch2Missions from '../../../data/missions/ch2.json';
import ch4Missions from '../../../data/missions/ch4.json';
import endingsData from '../../../data/endings.json';
import type { MissionDef, EndingDef } from '../../../src/sim/schemas';

describe('MissionManager (T4.7)', () => {
  let bus: EventBus<GameEvents>;
  let story: StoryState;
  let manager: MissionManager;

  const allMissions = [
    ...ch1Missions,
    ...ch2Missions,
    ...ch4Missions,
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

  it('initializes with Chapter 1 Day 1 mission active', () => {
    const active = manager.getActiveMissions();
    expect(active.length).toBeGreaterThan(0);
    expect(active.some((m) => m.id === 'm1_first_ride')).toBe(true);
  });

  it('updates objectives from events only without driving rides', () => {
    expect(manager.isMissionActive('m1_first_ride')).toBe(true);
    const initialStates = manager.getObjectiveStates('m1_first_ride');
    expect(initialStates[0]?.completed).toBe(false);

    // Emit ride/completed
    bus.emit('ride/completed', {
      requestId: 'req_1',
      receipt: {
        requestId: 'req_1',
        fare: 100,
        tip: 0,
        commission: 15,
        fuelCost: 10,
        otherCosts: 0,
        net: 75,
        durationMin: 12,
        distanceKm: 3.5,
        rating: 5,
        consequences: [],
      },
    });

    // Objective should be marked done and mission completed
    expect(manager.isMissionCompleted('m1_first_ride')).toBe(true);
    // Unlocks m1_fill_up
    expect(manager.isMissionActive('m1_fill_up')).toBe(true);
  });

  it('handles multi-objective mission and unlocks downstream missions on completion', () => {
    // Complete first ride to unlock m1_fill_up
    manager.completeMission('m1_first_ride');
    expect(manager.isMissionActive('m1_fill_up')).toBe(true);

    const states = manager.getObjectiveStates('m1_fill_up');
    expect(states.length).toBe(2);

    // Pay fuel expense
    bus.emit('economy/transaction', {
      tx: {
        id: 'tx_fuel_1',
        day: 1,
        minute: 100,
        kind: 'fuel',
        amount: -150,
      },
    });

    const updatedStates1 = manager.getObjectiveStates('m1_fill_up');
    const fuelObj = updatedStates1.find((s) => s.id === 'obj_m1_fuel');
    expect(fuelObj?.completed).toBe(true);
    expect(manager.isMissionCompleted('m1_fill_up')).toBe(false);

    // Complete 3 rides
    for (let i = 0; i < 3; i++) {
      bus.emit('ride/completed', {
        requestId: `req_${i}`,
        receipt: {
          requestId: `req_${i}`,
          fare: 100,
          tip: 0,
          commission: 15,
          fuelCost: 10,
          otherCosts: 0,
          net: 75,
          durationMin: 10,
          distanceKm: 2,
          rating: 5,
          consequences: [],
        },
      });
    }

    expect(manager.isMissionCompleted('m1_fill_up')).toBe(true);
  });

  it('ch1 final m1_household fails gracefully if unpaid (debt/flag set, game continues)', () => {
    manager.completeMission('m1_first_ride');
    manager.completeMission('m1_fill_up');

    // Day 2 unlocks m1_household
    manager.refreshAvailableMissions(1, 2);
    expect(manager.isMissionActive('m1_household')).toBe(true);

    // Simulate Day 4 ending without meeting earn target by Day 3
    bus.emit('day/ended', {
      day: 4,
      summary: {
        day: 4,
        revenue: 200,
        expenses: 100,
        net: 100,
        ratingDelta: 0,
        completedRides: 1,
        relationshipsDelta: {},
      },
    });

    // Mission is resolved and onFail flag applied
    expect(manager.isMissionCompleted('m1_household')).toBe(true);
    expect(story.branchFlags['ma_payment_missed']).toBe(true);
  });

  it('no mission definition requires an upgrade', () => {
    for (const m of allMissions) {
      for (const obj of m.objectives) {
        expect(obj.type === 'buy' && obj.target === 'upgrade').toBe(false);
      }
    }
  });

  it('triggers end-of-week v1 ending check on Day 6 completion', () => {
    let endingReached: string | null = null;
    bus.on('ending/reached', ({ endingId }) => {
      endingReached = endingId;
    });

    bus.emit('day/ended', {
      day: 6,
      summary: {
        day: 6,
        revenue: 3000,
        expenses: 500,
        net: 2500,
        ratingDelta: 0.1,
        completedRides: 15,
        relationshipsDelta: {},
      },
    });

    expect(endingReached).toBe('ending_v1_first_week');
  });
});
