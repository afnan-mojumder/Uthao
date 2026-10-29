import { describe, it, expect } from 'vitest';
import {
  calculateIdentityTendencies,
  getDominantIdentity,
  calculateTendenciesFromSnapshot,
  type IdentityMetrics,
} from '../../../src/sim/reputation/identity';
import {
  smartProStrategy,
  recklessStrategy,
  runHeadlessDay,
  createBalanceNetwork,
} from '../../../src/sim/bot/strategies';
import { Rng } from '../../../src/core/rng';

describe('Identity Tendencies (T4.8)', () => {
  const network = createBalanceNetwork();

  it('reckless profile results in hustler as dominant identity', () => {
    const recklessMetrics: IdentityMetrics = {
      rating: 3.8,
      safetyRecord: {
        nearMisses: 15,
        bumps: 4,
        crashes: 2,
        infractions: 5,
      },
      riskScore: 6,
      localTrust: 25,
      promisesKept: 1,
      promisesBroken: 3,
      relationships: { ma: -10, mintu: 5 },
      offAppTripsCount: 4,
      joinedScheme: true,
    };

    const tendencies = calculateIdentityTendencies(recklessMetrics);
    expect(tendencies.hustler).toBeGreaterThan(60);
    expect(getDominantIdentity(tendencies)).toBe('hustler');
  });

  it('smartPro profile results in professional as dominant identity', () => {
    const proMetrics: IdentityMetrics = {
      rating: 4.9,
      safetyRecord: {
        nearMisses: 1,
        bumps: 0,
        crashes: 0,
        infractions: 0,
      },
      riskScore: 0,
      localTrust: 45,
      promisesKept: 3,
      promisesBroken: 0,
      relationships: { ma: 15, mintu: 10, kamal_bhai: 10 },
      offAppTripsCount: 0,
      joinedScheme: false,
    };

    const tendencies = calculateIdentityTendencies(proMetrics);
    expect(tendencies.professional).toBeGreaterThan(80);
    expect(getDominantIdentity(tendencies)).toBe('professional');
  });

  it('community helper profile results in regular as dominant identity', () => {
    const regularMetrics: IdentityMetrics = {
      rating: 4.6,
      safetyRecord: {
        nearMisses: 3,
        bumps: 1,
        crashes: 0,
        infractions: 0,
      },
      riskScore: 1,
      localTrust: 85,
      promisesKept: 5,
      promisesBroken: 0,
      relationships: {
        ma: 30,
        mintu: 35,
        kamal_bhai: 25,
        nabila: 20,
        si_morshed: 15,
      },
      helpChoicesCount: 3,
      offAppTripsCount: 0,
      joinedScheme: false,
    };

    const tendencies = calculateIdentityTendencies(regularMetrics);
    expect(tendencies.regular).toBeGreaterThan(70);
    expect(getDominantIdentity(tendencies)).toBe('regular');
  });

  it('bargainer profile results in negotiator as dominant identity', () => {
    const negotiatorMetrics: IdentityMetrics = {
      rating: 4.4,
      safetyRecord: {
        nearMisses: 4,
        bumps: 1,
        crashes: 0,
        infractions: 1,
      },
      riskScore: 2,
      localTrust: 35,
      promisesKept: 6,
      promisesBroken: 0,
      relationships: { ma: 10, mintu: 15 },
      countersAcceptedCount: 8,
      fareNetRatio: 1.15,
      offAppTripsCount: 1,
      joinedScheme: false,
    };

    const tendencies = calculateIdentityTendencies(negotiatorMetrics);
    expect(tendencies.negotiator).toBeGreaterThan(65);
    expect(getDominantIdentity(tendencies)).toBe('negotiator');
  });

  it('fareNetRatio increases negotiator score', () => {
    const baseMetrics: IdentityMetrics = {
      rating: 4.5,
      safetyRecord: { nearMisses: 0, bumps: 0, crashes: 0, infractions: 0 },
      riskScore: 0,
      localTrust: 50,
      promisesKept: 2,
      promisesBroken: 0,
      relationships: {},
      countersAcceptedCount: 2,
    };

    const withoutBonus = calculateIdentityTendencies(baseMetrics);
    const withBonus = calculateIdentityTendencies({
      ...baseMetrics,
      fareNetRatio: 1.25, // 25% higher fare negotiation
    });

    expect(withBonus.negotiator).toBeGreaterThan(withoutBonus.negotiator);
  });

  it('helpChoicesCount increases regular score', () => {
    const baseMetrics: IdentityMetrics = {
      rating: 4.5,
      safetyRecord: { nearMisses: 0, bumps: 0, crashes: 0, infractions: 0 },
      riskScore: 0,
      localTrust: 40,
      promisesKept: 2,
      promisesBroken: 0,
      relationships: { mintu: 10 },
    };

    const withoutHelp = calculateIdentityTendencies(baseMetrics);
    const withHelp = calculateIdentityTendencies({
      ...baseMetrics,
      helpChoicesCount: 3,
    });

    expect(withHelp.regular).toBeGreaterThan(withoutHelp.regular);
  });

  it('reckless bot run → hustler highest', () => {
    const rng = new Rng(4001);
    const dayResult = runHeadlessDay(recklessStrategy, network, 1, 'clear', rng);
    const totalNearMisses = dayResult.rideResults.reduce((acc, r) => acc + r.nearMissCount, 0);

    const metrics: IdentityMetrics = {
      rating: dayResult.averageRating,
      safetyRecord: {
        nearMisses: totalNearMisses,
        bumps: 4,
        crashes: Math.max(1, dayResult.crashes),
        infractions: 5,
      },
      riskScore: 7,
      localTrust: 15,
      promisesKept: 0,
      promisesBroken: 2,
      relationships: {},
      offAppTripsCount: 3,
    };

    const tendencies = calculateIdentityTendencies(metrics);
    expect(tendencies.hustler).toBeGreaterThan(tendencies.professional);
    expect(tendencies.hustler).toBeGreaterThan(tendencies.regular);
    expect(getDominantIdentity(tendencies)).toBe('hustler');
  });

  it('smartPro bot → professional highest', () => {
    const rng = new Rng(5001);
    const dayResult = runHeadlessDay(smartProStrategy, network, 1, 'clear', rng);
    const totalNearMisses = dayResult.rideResults.reduce((acc, r) => acc + r.nearMissCount, 0);

    const metrics: IdentityMetrics = {
      rating: dayResult.averageRating,
      safetyRecord: {
        nearMisses: totalNearMisses,
        bumps: 0,
        crashes: dayResult.crashes,
        infractions: 0,
      },
      riskScore: 0,
      localTrust: 40,
      promisesKept: 2,
      promisesBroken: 0,
      relationships: { mintu: 10, ma: 15 },
      offAppTripsCount: 0,
    };

    const tendencies = calculateIdentityTendencies(metrics);
    expect(tendencies.professional).toBeGreaterThan(tendencies.hustler);
    expect(tendencies.professional).toBeGreaterThan(tendencies.negotiator);
    expect(getDominantIdentity(tendencies)).toBe('professional');
  });

  it('calculateTendenciesFromSnapshot correctly extracts state', () => {
    const snapshot = {
      reputation: {
        rating: 4.8,
        localTrust: 80,
        safetyRecord: { nearMisses: 1, bumps: 0, crashes: 0, infractions: 0 },
        riskScore: 0,
        promises: { kept: 4, broken: 0 },
      },
      story: {
        characterRelationships: { mintu: 25, ma: 30 },
        branchFlags: { joinedScheme: false },
      },
    };

    const tendencies = calculateTendenciesFromSnapshot(snapshot);
    expect(tendencies.regular).toBeGreaterThan(60);
    expect(tendencies.professional).toBeGreaterThan(60);
  });
});
