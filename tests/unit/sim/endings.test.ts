import { describe, it, expect } from 'vitest';
import {
  evaluateEnding,
  getAvailableCareerChoices,
  type EndingEvaluationContext,
} from '../../../src/sim/mission/endings';
import type { PlayerEconomy, StoryState, SafetyRecord } from '../../../src/core/types';

describe('All Five Endings Evaluation (T5.5)', () => {
  const baseEconomy: PlayerEconomy = {
    cash: 1000,
    dailyRevenue: 500,
    dailyExpenses: 200,
    fuelLevel: 4.0,
    motorcycleCondition: 85,
    appBalance: 0,
    debt: 0,
    reputation: 4.8,
    savings: 10000,
    phoneBattery: 80,
  };

  const baseStory: StoryState = {
    currentChapter: 6,
    completedMissions: ['m1_first_ride', 'm1_fill_up', 'm1_household'],
    activeMissions: [],
    characterRelationships: { ma: 25, mintu: 25, kamal_bhai: 20 },
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

  const baseSafety: SafetyRecord = {
    nearMisses: 2,
    bumps: 0,
    crashes: 0,
    infractions: 0,
  };

  it('evaluates Fresh Start when debt >= 5000 or app suspended', () => {
    const ctx: EndingEvaluationContext = {
      day: 20,
      economy: { ...baseEconomy, debt: 6000, savings: 0 },
      story: { ...baseStory },
      rating: 3.2,
      localTrust: 20,
      safetyRecord: { nearMisses: 10, bumps: 5, crashes: 3, infractions: 4 },
      riskScore: 5,
      promises: { kept: 1, broken: 4 },
    };

    const res = evaluateEnding(ctx);
    expect(res.endingId).toBe('fresh_start');
  });

  it('evaluates Fast Money when joinedScheme is true', () => {
    const ctx: EndingEvaluationContext = {
      day: 20,
      economy: { ...baseEconomy, savings: 35000, cash: 8000 },
      story: { ...baseStory, branchFlags: { joinedScheme: true } },
      rating: 4.0,
      localTrust: 30,
      safetyRecord: { nearMisses: 12, bumps: 2, crashes: 0, infractions: 3 },
      riskScore: 9,
      promises: { kept: 2, broken: 3 },
    };

    const res = evaluateEnding(ctx);
    expect(res.endingId).toBe('fast_money');
    // Verify fast money has lower regular score despite high money
    expect(res.tendencies.hustler).toBeGreaterThan(60);
    expect(res.summary.localTrust).toBeLessThan(40);
  });

  it('evaluates Workshop Owner when chosen and savings >= 25k & Kamal relationship >= 30', () => {
    const ctx: EndingEvaluationContext = {
      day: 20,
      economy: { ...baseEconomy, savings: 28000 },
      story: { ...baseStory, characterRelationships: { kamal_bhai: 35, ma: 30, mintu: 20 } },
      rating: 4.7,
      localTrust: 55,
      safetyRecord: baseSafety,
      riskScore: 1,
      promises: { kept: 5, broken: 0 },
      careerChoice: 'workshop',
    };

    const res = evaluateEnding(ctx);
    expect(res.endingId).toBe('workshop_owner');
  });

  it('evaluates Independent Rider when chosen and savings >= 15k', () => {
    const ctx: EndingEvaluationContext = {
      day: 20,
      economy: { ...baseEconomy, savings: 16000 },
      story: { ...baseStory },
      rating: 4.7,
      localTrust: 50,
      safetyRecord: baseSafety,
      riskScore: 2,
      promises: { kept: 4, broken: 0 },
      careerChoice: 'bike',
    };

    const res = evaluateEnding(ctx);
    expect(res.endingId).toBe('independent_rider');
  });

  it('evaluates Trusted Local with low savings (< 10000) when trust >= 70 & rating >= 4.6', () => {
    const ctx: EndingEvaluationContext = {
      day: 20,
      economy: { ...baseEconomy, savings: 6000 }, // Low savings!
      story: {
        ...baseStory,
        characterRelationships: {
          ma: 40,
          mintu: 40,
          kamal_bhai: 35,
          nabila: 30,
          si_morshed: 25,
        },
      },
      rating: 4.85,
      localTrust: 78,
      safetyRecord: { nearMisses: 1, bumps: 0, crashes: 0, infractions: 0 },
      riskScore: 0,
      promises: { kept: 8, broken: 0 },
      careerChoice: 'continue',
    };

    const res = evaluateEnding(ctx);
    expect(res.endingId).toBe('trusted_local');
    expect(res.summary.savings).toBeLessThan(10000);
    expect(res.tendencies.regular).toBeGreaterThan(65);
  });

  it('disables unaffordable career choices with clear reasons', () => {
    const choices = getAvailableCareerChoices(12000, 20); // ৳12k savings, 20 relationship

    const workshop = choices.find((c) => c.id === 'workshop');
    expect(workshop?.available).toBe(false);
    expect(workshop?.disabledReason).toContain('25,000');

    const bike = choices.find((c) => c.id === 'bike');
    expect(bike?.available).toBe(false);
    expect(bike?.disabledReason).toContain('15,000');

    const cont = choices.find((c) => c.id === 'continue');
    expect(cont?.available).toBe(true);
  });
});
