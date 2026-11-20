import { describe, it, expect } from 'vitest';
import {
  evaluateEnding,
  getAvailableCareerChoices,
  type EndingEvaluationContext,
} from '../../../src/sim/mission/endings';
import type { PlayerEconomy, StoryState, SafetyRecord } from '../../../src/core/types';
import { GameManager } from '../../../src/sim/GameManager';
import endingsData from '../../../data/endings.json';
import enEndings from '../../../data/dialogue/en/endings.json';
import bnEndings from '../../../data/dialogue/bn/endings.json';

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
    characterRelationships: { char_ma: 25, char_mintu: 25, char_kamal: 20 },
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
      story: { ...baseStory, characterRelationships: { char_kamal: 35, char_ma: 30, char_mintu: 20 } },
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
          char_ma: 40,
          char_mintu: 40,
          char_kamal: 35,
          char_nabila: 30,
          char_morshed: 25,
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

  it('removes legacy ending_v1_first_week from data/endings.json and dialogue dicts', () => {
    const ids = (endingsData as Array<{ id: string }>).map((e) => e.id);
    expect(ids).not.toContain('ending_v1_first_week');
    expect(ids).toEqual([
      'independent_rider',
      'workshop_owner',
      'trusted_local',
      'fast_money',
      'fresh_start',
    ]);
    expect('ending_v1_first_week_title' in enEndings).toBe(false);
    expect('ending_v1_first_week_desc' in enEndings).toBe(false);
    expect('ending_v1_first_week_title' in bnEndings).toBe(false);
    expect('ending_v1_first_week_desc' in bnEndings).toBe(false);
  });

  it('evaluates Fast Money from live bounded karma meters (criminalExposure / evidenceExposure / low riderIntegrity)', () => {
    const ctx: EndingEvaluationContext = {
      day: 20,
      economy: { ...baseEconomy, savings: 22000, cash: 5000 },
      story: { ...baseStory },
      rating: 4.3,
      localTrust: 35,
      safetyRecord: baseSafety,
      riskScore: 0, // live game uses karma meters, not riskScore
      meters: {
        riderIntegrity: 25,
        publicReputation: 35,
        platformStanding: 65,
        criminalExposure: 48,
        evidenceExposure: 45,
        safetyRecord: 60,
      },
      promises: { kept: 2, broken: 2 },
      careerChoice: 'continue',
    };

    expect(evaluateEnding(ctx).endingId).toBe('fast_money');
  });

  it('drives all 5 endings on Day 20 through live GameManager m6_decision', () => {
    const reachEnding = (
      setup: (gm: GameManager) => void,
      choice: 'workshop' | 'bike' | 'continue'
    ): string => {
      const gm = new GameManager({ seed: 101, mode: 'career', data: {} });
      gm.clock.day = 20;
      gm.story.currentChapter = 6;
      setup(gm);
      let reached: string | null = null;
      gm.bus.on('ending/reached', (ev) => {
        if (!ev.choices) reached = ev.endingId;
      });
      gm.missionManager.activateMission('m6_decision');
      expect(gm.dispatch({ type: 'selectCareerChoice', choice }).success).toBe(true);
      expect(reached).not.toBeNull();
      return reached!;
    };

    expect(
      reachEnding((gm) => {
        gm.economyManager.savings = 30000;
        gm.economy.savings = 30000;
        gm.reputationSystem.setRelationship('char_kamal', 35);
      }, 'workshop')
    ).toBe('workshop_owner');

    expect(
      reachEnding((gm) => {
        gm.economyManager.savings = 18000;
        gm.economy.savings = 18000;
      }, 'bike')
    ).toBe('independent_rider');

    expect(
      reachEnding((gm) => {
        gm.economyManager.savings = 4000;
        gm.economy.savings = 4000;
        gm.reputationSystem.applyMeter('publicReputation', 45, 'karma.community');
        gm.reputationSystem.applyMeter('riderIntegrity', 15, 'karma.honest');
      }, 'continue')
    ).toBe('trusted_local');

    expect(
      reachEnding((gm) => {
        gm.economyManager.savings = 22000;
        gm.economy.savings = 22000;
        gm.reputationSystem.applyMeter('criminalExposure', 50, 'karma.fled');
        gm.reputationSystem.applyMeter('evidenceExposure', 45, 'karma.bribe');
        gm.reputationSystem.applyMeter('riderIntegrity', -25, 'karma.bribe');
      }, 'continue')
    ).toBe('fast_money');

    expect(
      reachEnding((gm) => {
        gm.economyManager.debt = 6000;
        gm.economy.debt = 6000;
      }, 'continue')
    ).toBe('fresh_start');
  });
});
