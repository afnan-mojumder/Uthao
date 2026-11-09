import { describe, it, expect } from 'vitest';
import {
  createObjectiveState,
  evaluateEncounterResolved,
} from '../../../src/sim/mission/objectives';
import type { MissionObjective } from '../../../src/sim/schemas';
import paymentEncounters from '../../../data/encounters/payment.json';

const survive = {
  id: 'obj_m4_survive',
  descKey: 'obj_m4_survive_desc',
  type: 'survive',
  encounterId: 'enc_wrong_pickup_pin',
  choiceIds: ['drive', 'walk'],
} as unknown as MissionObjective;

describe('survive objective (audit: refusing counts as surviving)', () => {
  it('does not complete when the rider cancels the trip', () => {
    const state = createObjectiveState(survive);
    const changed = evaluateEncounterResolved(survive, state, {
      encounterId: 'enc_wrong_pickup_pin',
      choiceId: 'cancel',
      success: true,
    });
    expect(changed).toBe(false);
    expect(state.completed).toBe(false);
  });

  it('completes when the rider gets through it on foot or by driving on', () => {
    for (const choiceId of ['drive', 'walk']) {
      const state = createObjectiveState(survive);
      evaluateEncounterResolved(survive, state, {
        encounterId: 'enc_wrong_pickup_pin',
        choiceId,
        success: true,
      });
      expect(state.completed, choiceId).toBe(true);
    }
  });
});

describe('vendor discount encounter (audit: Chapter 2 can stall)', () => {
  it('every choice that resolves it sets profit_lesson_done', () => {
    const vendor = (paymentEncounters as { id: string; choices: { id: string; effects: { type: string; key?: string; value?: unknown }[] }[] }[])
      .find((e) => e.id === 'enc_vendor_discount');
    expect(vendor).toBeDefined();
    for (const choice of vendor!.choices) {
      const sets = choice.effects.some(
        (e) => e.type === 'flag' && e.key === 'profit_lesson_done' && e.value === true
      );
      expect(sets, choice.id).toBe(true);
    }
  });
});
