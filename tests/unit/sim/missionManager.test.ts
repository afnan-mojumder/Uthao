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
        bonus: 0,
        penalties: 0,
        compensation: 0,
        fuelLiters: 0,
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
          bonus: 0,
          penalties: 0,
          compensation: 0,
          fuelLiters: 0,
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

    // Mission is resolved and onFail flag applied AND unlocks Ch2 cleanly without trapping the player
    expect(manager.isMissionCompleted('m1_household')).toBe(true);
    expect(story.branchFlags['ma_payment_missed']).toBe(true);
    expect(story.currentChapter).toBe(2);
    expect(manager.isMissionActive('m2_rush_hustle')).toBe(true);
  });

  it('earnNet sums net operating profit (fare+tip+bonus-commission-fuel-repair-fine) and excludes transfers', () => {
    manager.completeMission('m1_first_ride');
    manager.completeMission('m1_fill_up');
    manager.refreshAvailableMissions(1, 2);
    expect(manager.isMissionActive('m1_household')).toBe(true);

    // Transfers & non-operating transactions must NOT count toward earnNet
    for (const tx of [
      { id: 't_sav_w', day: 2, minute: 480, kind: 'savings' as const, amount: 2000 },
      { id: 't_fam_a', day: 2, minute: 485, kind: 'family' as const, amount: 1000 },
      { id: 't_rent', day: 2, minute: 490, kind: 'rent' as const, amount: 1500 },
      { id: 't_evt', day: 2, minute: 495, kind: 'event' as const, amount: 900 },
    ]) {
      bus.emit('economy/transaction', { tx });
    }
    const earnAfterTransfers = manager
      .getObjectiveStates('m1_household')
      .find((s) => s.id === 'obj_m1_earn');
    expect(earnAfterTransfers?.progress).toBe(0);

    // Operating gross +1000 fare minus -150 commission and -200 fuel = +650 net
    bus.emit('economy/transaction', {
      tx: { id: 't_fare1', day: 2, minute: 500, kind: 'fare', amount: 1000 },
    });
    bus.emit('economy/transaction', {
      tx: { id: 't_comm1', day: 2, minute: 500, kind: 'commission', amount: -150 },
    });
    bus.emit('economy/transaction', {
      tx: { id: 't_fuel1', day: 2, minute: 505, kind: 'fuel', amount: -200 },
    });

    const earnAfterCosts = manager
      .getObjectiveStates('m1_household')
      .find((s) => s.id === 'obj_m1_earn');
    expect(earnAfterCosts?.progress).toBe(650);
    expect(earnAfterCosts?.completed).toBe(false);

    // +900 fare + 100 tip - 150 commission = +850 net -> cumulative 1500
    bus.emit('economy/transaction', {
      tx: { id: 't_fare2', day: 2, minute: 520, kind: 'fare', amount: 900 },
    });
    bus.emit('economy/transaction', {
      tx: { id: 't_tip2', day: 2, minute: 520, kind: 'tip', amount: 100 },
    });
    bus.emit('economy/transaction', {
      tx: { id: 't_comm2', day: 2, minute: 520, kind: 'commission', amount: -150 },
    });

    const earnFinal = manager
      .getObjectiveStates('m1_household')
      .find((s) => s.id === 'obj_m1_earn');
    expect(earnFinal?.progress).toBe(1500);
    expect(earnFinal?.completed).toBe(true);
  });

  it('retro-checks relationship objectives on activateMission (e.g. m6_kamal_offer)', async () => {
    const { ReputationSystem } = await import('../../../src/sim/reputation/ReputationSystem');
    const ch6Missions = (await import('../../../data/missions/ch6.json')).default as MissionDef[];
    const localBus = new EventBus<GameEvents>();
    const localStory: StoryState = {
      currentChapter: 6,
      completedMissions: ['m5_linked_jobs'],
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
    const rep = new ReputationSystem({
      bus: localBus,
      initialRelationships: localStory.characterRelationships,
    });
    expect(rep.getRelationship('char_kamal')).toBeGreaterThanOrEqual(15);

    const mgr = new MissionManager({
      bus: localBus,
      missions: ch6Missions,
      endings: endingsData as EndingDef[],
      storyState: localStory,
      reputationSystem: rep,
    });

    // m6_kamal_offer has day: 17; refreshing at day 17 activates and immediately completes it
    mgr.refreshAvailableMissions(6, 17);
    expect(mgr.isMissionCompleted('m6_kamal_offer')).toBe(true);
    expect(localStory.branchFlags['workshop_offered']).toBe(true);
  });

  it('m6_decision does not fire before Day 20 when m6_test_ride completes on Day 18', async () => {
    const { GameManager } = await import('../../../src/sim/GameManager');
    const gm = new GameManager({ seed: 7, mode: 'career', data: {} });
    const endings: string[] = [];
    gm.bus.on('ending/reached', ({ endingId }) => endings.push(endingId));

    gm.story.currentChapter = 6;
    gm.clock.day = 18;
    gm.missionManager.activateMission('m6_test_ride');
    gm.missionManager.completeMission('m6_test_ride');

    expect(gm.missionManager.isMissionActive('m6_decision')).toBe(false);
    expect(endings).toEqual([]);

    // Day 19 still does not open m6_decision
    gm.clock.day = 19;
    gm.bus.emit('day/started', { day: 19 });
    expect(gm.missionManager.isMissionActive('m6_decision')).toBe(false);
    expect(endings).toEqual([]);

    // Day 20 opens m6_decision cleanly
    gm.clock.day = 20;
    gm.bus.emit('day/started', { day: 20 });
    expect(gm.missionManager.isMissionActive('m6_decision')).toBe(true);
    expect(endings).toHaveLength(1);
  });

  it('payExpense enforces positive cash-backed amount and m1_household obj_m1_pay_ma requires full 1200', async () => {
    const { GameManager } = await import('../../../src/sim/GameManager');
    const gm = new GameManager({ seed: 9, mode: 'career', data: {} });
    gm.missionManager.completeMission('m1_first_ride');
    gm.missionManager.completeMission('m1_fill_up');
    gm.clock.day = 2;
    gm.missionManager.refreshAvailableMissions(1, 2);
    expect(gm.missionManager.isMissionActive('m1_household')).toBe(true);

    gm.economyManager.cash = 1000;
    expect(gm.dispatch({ type: 'payExpense', expenseId: 'family', amount: 0 }).success).toBe(false);
    expect(gm.dispatch({ type: 'payExpense', expenseId: 'family', amount: -500 }).success).toBe(false);
    expect(gm.dispatch({ type: 'payExpense', expenseId: 'family', amount: Number.NaN }).success).toBe(false);
    expect(gm.dispatch({ type: 'payExpense', expenseId: 'family', amount: 1200 }).success).toBe(false);

    // Partial payment (500) must NOT complete obj_m1_pay_ma (requires 1200)
    expect(gm.dispatch({ type: 'payExpense', expenseId: 'family', amount: 500 }).success).toBe(true);
    const payObjPartial = gm.missionManager
      .getObjectiveStates('m1_household')
      .find((s) => s.id === 'obj_m1_pay_ma');
    expect(payObjPartial?.completed).toBe(false);

    // Completing remaining 700 completes obj_m1_pay_ma
    gm.economyManager.cash = 1000;
    expect(gm.dispatch({ type: 'payExpense', expenseId: 'family', amount: 700 }).success).toBe(true);
    const payObjFull = gm.missionManager
      .getObjectiveStates('m1_household')
      .find((s) => s.id === 'obj_m1_pay_ma');
    expect(payObjFull?.completed).toBe(true);
  });

  it('changeRelationship completing m2_regular_faces still awards downstream localTrust (+15) reward', async () => {
    const { GameManager } = await import('../../../src/sim/GameManager');
    const gm = new GameManager({ seed: 21, mode: 'career', data: {} });
    gm.story.currentChapter = 2;
    gm.clock.day = 5;
    expect(gm.missionManager.activateMission('m2_regular_faces')).toBe(true);

    const trustBefore = gm.reputationSystem.getMeters().publicReputation;
    // char_tanvir starts at 5; +10 reaches min 10 and completes m2_regular_faces (+15 localTrust)
    gm.reputationSystem.changeRelationship('char_tanvir', 10);

    expect(gm.missionManager.isMissionCompleted('m2_regular_faces')).toBe(true);
    expect(gm.reputationSystem.getMeters().publicReputation).toBe(trustBefore + 15);
  });

  it('applySnapshot restores ReputationSystem before MissionManager so low char_kamal does not auto-complete m6_kamal_offer', async () => {
    const { GameManager } = await import('../../../src/sim/GameManager');
    const { serialize, deserialize } = await import('../../../src/sim/save/SaveSystem');

    const gm = new GameManager({ seed: 22, mode: 'career', data: {} });
    gm.story.currentChapter = 6;
    gm.clock.day = 17;
    gm.story.completedMissions.push('m5_linked_jobs');
    gm.reputationSystem.setRelationship('char_kamal', 5); // < 15 threshold
    gm.missionManager.syncFromStoryState();
    expect(gm.missionManager.activateMission('m6_kamal_offer')).toBe(true);
    expect(gm.missionManager.isMissionCompleted('m6_kamal_offer')).toBe(false);

    const save = serialize(gm);
    const restored = deserialize(save);
    expect(restored.reputationSystem.getRelationship('char_kamal')).toBe(5);
    expect(restored.missionManager.isMissionActive('m6_kamal_offer')).toBe(true);
    expect(restored.missionManager.isMissionCompleted('m6_kamal_offer')).toBe(false);

    // Also verify high char_kamal (>= 30) is preserved for m6_decision career choices
    const gmHigh = new GameManager({ seed: 23, mode: 'career', data: {} });
    gmHigh.story.currentChapter = 6;
    gmHigh.clock.day = 20;
    gmHigh.economyManager.savings = 30000;
    gmHigh.economy.savings = 30000;
    gmHigh.reputationSystem.setRelationship('char_kamal', 35);
    const restoredHigh = deserialize(serialize(gmHigh));
    expect(restoredHigh.reputationSystem.getRelationship('char_kamal')).toBe(35);
    restoredHigh.missionManager.activateMission('m6_decision');
    expect(restoredHigh.dispatch({ type: 'selectCareerChoice', choice: 'workshop' }).success).toBe(true);
  });

  it('no mission definition requires an upgrade', () => {
    for (const m of allMissions) {
      for (const obj of m.objectives) {
        expect(obj.type === 'buy' && obj.target === 'upgrade').toBe(false);
      }
    }
  });

  it('does not end the career on Day 6; endings come from campaign completion', () => {
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

    // The old placeholder ended the career here; the real ending now comes from campaign_completed.
    expect(endingReached).toBeNull();
  });

  it('Ruling 6: MissionManager does not directly mutate characterRelationships and never double-counts with ReputationSystem on bus', async () => {
    const { ReputationSystem } = await import('../../../src/sim/reputation/ReputationSystem');
    const localBus = new EventBus<GameEvents>();
    const localStory: StoryState = {
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
    const rep = new ReputationSystem({ bus: localBus, initialRelationships: localStory.characterRelationships });
    const nabila0 = rep.getRelationship('char_nabila');

    const mgr = new MissionManager({
      bus: localBus,
      missions: allMissions,
      endings: endingsData as EndingDef[],
      storyState: localStory,
      reputationSystem: rep,
    });

    // m1_first_ride grants +10 relationship to char_nabila
    mgr.completeMission('m1_first_ride');
    expect(rep.getRelationship('char_nabila')).toBe(nabila0 + 10);
    expect(localStory.characterRelationships['char_nabila']).toBe(nabila0 + 10);

    // Standalone MissionManager without ReputationSystem or getEffectContext does NOT bypass single-writer
    const bareBus = new EventBus<GameEvents>();
    const bareStory: StoryState = {
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
    const bareMgr = new MissionManager({
      bus: bareBus,
      missions: allMissions,
      storyState: bareStory,
    });
    bareMgr.completeMission('m1_first_ride');
    expect(bareStory.characterRelationships['char_nabila']).toBeUndefined();
  });
});
