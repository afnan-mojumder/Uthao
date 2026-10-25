import { describe, it, expect } from 'vitest';
import {
  expectedBudget,
  openingOffer,
  PassengerAI,
} from '../../../src/sim/passenger/PassengerAI';
import { generateProfile } from '../../../src/sim/passenger/profiles';
import { Rng } from '../../../src/core/rng';

describe('PassengerAI', () => {
  const rng = new Rng(100);

  it('same passenger same day ⇒ same budget', () => {
    const profile = generateProfile('commuter', rng, 'pass_fixed_01');
    const fair = 150;
    const day = 3;

    const b1 = expectedBudget(profile, fair, day);
    const b2 = expectedBudget(profile, fair, day);
    const b3 = expectedBudget(profile, fair, day);

    expect(b1).toBe(b2);
    expect(b2).toBe(b3);

    // Different day may produce small variation
    const bOtherDay = expectedBudget(profile, fair, 4);
    expect(typeof bOtherDay).toBe('number');
  });

  it('bargainer opens lower than commuter for same fair fare', () => {
    const bargainer = generateProfile('bargainer', rng, 'pass_b_01');
    const commuter = generateProfile('commuter', rng, 'pass_c_01');
    const fair = 200;
    const day = 1;

    const budgetB = expectedBudget(bargainer, fair, day);
    const budgetC = expectedBudget(commuter, fair, day);

    const offerB = openingOffer(bargainer, budgetB);
    const offerC = openingOffer(commuter, budgetC);

    expect(offerB).toBeLessThan(offerC);
  });

  it('careful mood drops more on near miss than commuter', () => {
    const carefulProfile = generateProfile('careful', rng, 'pass_careful_01');
    const commuterProfile = generateProfile('commuter', rng, 'pass_commuter_01');
    const fair = 100;
    const day = 1;

    const aiCareful = new PassengerAI(carefulProfile, fair, day);
    const aiCommuter = new PassengerAI(commuterProfile, fair, day);

    const initialMoodCareful = aiCareful.getMood();
    const initialMoodCommuter = aiCommuter.getMood();

    aiCareful.onNearMiss();
    aiCommuter.onNearMiss();

    const dropCareful = initialMoodCareful - aiCareful.getMood();
    const dropCommuter = initialMoodCommuter - aiCommuter.getMood();

    expect(dropCareful).toBeGreaterThan(dropCommuter);
  });

  it('horn spam drops mood if > 3 per minute', () => {
    const profile = generateProfile('commuter', rng, 'pass_horn_01');
    const ai = new PassengerAI(profile, 100, 1);
    const m0 = ai.getMood();

    ai.onHorn(10.1);
    ai.onHorn(10.2);
    ai.onHorn(10.3);
    // 3 horns: not yet spam
    expect(ai.getMood()).toBe(m0);

    // 4th horn in same minute
    ai.onHorn(10.4);
    expect(ai.getMood()).toBeLessThan(m0);
  });
});
