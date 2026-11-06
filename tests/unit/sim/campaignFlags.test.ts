import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import bike from '../../../data/encounters/bike.json';
import crime from '../../../data/encounters/crime.json';
import passenger from '../../../data/encounters/passenger.json';
import payment from '../../../data/encounters/payment.json';
import pickup from '../../../data/encounters/pickup.json';
import route from '../../../data/encounters/route.json';

// These walk the campaign through the real path a player takes: an encounter
// is forced, the player picks a choice through the same dispatch the UI uses,
// and the objective must complete. Nothing here calls completeMission or sets
// a flag by hand.

const encounters = [...bike, ...crime, ...passenger, ...payment, ...pickup, ...route];

function newGame(activeMissions: string[]): GameManager {
  const gm = new GameManager({ seed: 11, mode: 'career', data: { encounters } as never });
  for (const id of activeMissions) {
    expect(gm.missionManager.activateMission(id)).toBe(true);
  }
  return gm;
}

function resolve(gm: GameManager, encounterId: string, choiceId: string): void {
  const instance = gm.eventDirector.forceStart(encounterId, gm.bus);
  expect(instance, `forceStart(${encounterId})`).not.toBeNull();
  const result = gm.dispatch({ type: 'chooseEncounterOption', instanceId: instance!.id, choiceId });
  expect(result.success, `choose ${choiceId} on ${encounterId}`).toBe(true);
}

function objectiveDone(gm: GameManager, missionId: string, objectiveId: string): boolean {
  const state = gm.missionManager.getObjectiveStates(missionId).find((s) => s.id === objectiveId);
  return state?.completed === true;
}

describe('campaign objectives completed through real encounter choices', () => {
  it('Chapter 2: the fuel-cost answer at a drop-off completes the profit lesson flag', () => {
    const gm = newGame(['m2_profit_lesson']);

    resolve(gm, 'enc_vendor_discount', 'standard');

    expect(objectiveDone(gm, 'm2_profit_lesson', 'obj_m2_profit_flag')).toBe(true);
  });

  it('Chapter 3: refusing to overspeed completes the pressured-speeding flag', () => {
    const gm = newGame(['m3_faster_bhai']);

    resolve(gm, 'enc_urgent_exam', 'refuse');

    expect(objectiveDone(gm, 'm3_faster_bhai', 'obj_m3_pressure_flag')).toBe(true);
  });

  it('Chapter 3: waiving the fare completes the hospital run flag', () => {
    const gm = newGame(['m3_hospital_run']);

    resolve(gm, 'enc_vendor_discount', 'grant');

    expect(objectiveDone(gm, 'm3_hospital_run', 'obj_m3_hospital_flag')).toBe(true);
  });

  it('Chapter 4: resolving the wrong-pickup encounter completes its survive objective', () => {
    const gm = newGame(['m4_wrong_pickup']);

    resolve(gm, 'enc_wrong_pickup_pin', 'walk');

    expect(objectiveDone(gm, 'm4_wrong_pickup', 'obj_m4_survive')).toBe(true);
  });

  it('Chapter 4: cooperating at the checkpoint completes the police objective', () => {
    const gm = newGame(['m4_wrong_pickup']);

    resolve(gm, 'enc_traffic_checkpoint', 'cooperate');

    expect(objectiveDone(gm, 'm4_wrong_pickup', 'obj_m4_police')).toBe(true);
  });

  it('Chapter 4: a flag set before a mission unlocks still counts when it unlocks', () => {
    // The checkpoint happens during m4_wrong_pickup. m4_home_safe only unlocks
    // after that mission completes, so its flag must be read on activation.
    const gm = newGame(['m4_wrong_pickup']);
    resolve(gm, 'enc_traffic_checkpoint', 'cooperate');

    expect(gm.missionManager.activateMission('m4_home_safe')).toBe(true);

    expect(objectiveDone(gm, 'm4_home_safe', 'obj_m4_safe_flag')).toBe(true);
  });

  it('the career decision flag is set when the player commits to a career', () => {
    const gm = newGame(['m6_decision']);

    const result = gm.dispatch({ type: 'selectCareerChoice', choice: 'continue' });

    expect(result.success).toBe(true);
    expect(gm.story.branchFlags['ch6_decision_made']).toBe(true);
    expect(objectiveDone(gm, 'm6_decision', 'obj_m6_career_decision')).toBe(true);
  });
});

describe('the ending is judged on the real game state', () => {
  const SPEC_ENDINGS = ['independent_rider', 'workshop_owner', 'trusted_local', 'fast_money', 'fresh_start'];

  it('an ordinary career shows no ending on day 6', () => {
    // Arrange
    const gm = newGame([]);
    const endings: string[] = [];
    gm.bus.on('ending/reached', ({ endingId }) => endings.push(endingId));

    // Act
    gm.bus.emit('day/ended', { day: 6, summary: null as never });

    // Assert
    expect(endings).toEqual([]);
  });

  it('the career decision opens with the real standing and the career options', () => {
    // Arrange
    const gm = newGame([]);
    const offers: Array<{ endingId: string; choices?: Array<{ id: string }> }> = [];
    gm.bus.on('ending/reached', (ev) => {
      if (ev.choices) offers.push(ev);
    });

    // Act
    gm.missionManager.activateMission('m6_decision');

    // Assert
    expect(offers).toHaveLength(1);
    expect(SPEC_ENDINGS).toContain(offers[0]!.endingId);
    expect(offers[0]!.choices!.map((c) => c.id)).toEqual(['workshop', 'bike', 'continue']);
  });

  it('choosing a career ends the campaign with one of the five real endings', () => {
    // Arrange
    const gm = newGame(['m6_decision']);
    const finals: string[] = [];
    gm.bus.on('ending/reached', (ev) => {
      if (!ev.choices) finals.push(ev.endingId);
    });

    // Act
    const result = gm.dispatch({ type: 'selectCareerChoice', choice: 'continue' });

    // Assert
    expect(result.success).toBe(true);
    expect(finals).toHaveLength(1);
    expect(SPEC_ENDINGS).toContain(finals[0]);
    expect(gm.story.branchFlags['campaign_completed']).toBe(true);
  });
});
