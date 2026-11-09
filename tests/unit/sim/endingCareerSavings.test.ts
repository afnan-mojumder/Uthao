import { describe, it, expect } from 'vitest';
import { evaluateEnding, type EndingEvaluationContext } from '../../../src/sim/mission/endings';

// Audit H-9: the career choice is paid for before the ending is judged, so the
// ending must use the savings the player had when they chose.
function ctx(over: Partial<EndingEvaluationContext>): EndingEvaluationContext {
  return {
    day: 30,
    economy: { cash: 0, savings: 5000, debt: 0 } as unknown as EndingEvaluationContext['economy'],
    story: {
      characterRelationships: { char_kamal: 40 },
      branchFlags: {},
      completedMissions: [],
    } as unknown as EndingEvaluationContext['story'],
    rating: 4.0,
    localTrust: 50,
    safetyRecord: {} as EndingEvaluationContext['safetyRecord'],
    riskScore: 0,
    promises: { kept: 0, broken: 0 },
    ...over,
  };
}

describe('career endings are judged on the savings before the choice was paid (audit H-9)', () => {
  it('buying the 125cc bike ends as Independent Rider, not A Hard Lesson', () => {
    // Arrange: 20,000 saved, the bike costs 15,000, so 5,000 is left.
    const c = ctx({ careerChoice: 'bike', careerSavings: 20000, rating: 3.9 });

    // Act
    const result = evaluateEnding(c);

    // Assert
    expect(result.endingId).toBe('independent_rider');
  });

  it('choosing the workshop with 30,000 saved ends as Workshop Owner', () => {
    // Arrange: 30,000 saved, the workshop costs 25,000, so 5,000 is left.
    const c = ctx({ careerChoice: 'workshop', careerSavings: 30000 });

    const result = evaluateEnding(c);

    expect(result.endingId).toBe('workshop_owner');
  });

  it('without a recorded choice amount, the current savings are judged as before', () => {
    const result = evaluateEnding(ctx({ careerChoice: 'bike', rating: 3.9 }));
    expect(result.endingId).toBe('fresh_start');
  });
});
