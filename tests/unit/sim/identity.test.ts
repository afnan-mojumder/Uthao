import { describe, it, expect } from 'vitest';
import {
  calculateIdentityTendencies,
  getDominantIdentity,
  type IdentityMetrics,
} from '../../../src/sim/reputation/identity';

describe('Identity Tendencies (T4.8)', () => {
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
      offAppTripsCount: 1,
      joinedScheme: false,
    };

    const tendencies = calculateIdentityTendencies(negotiatorMetrics);
    expect(tendencies.negotiator).toBeGreaterThan(65);
    expect(getDominantIdentity(tendencies)).toBe('negotiator');
  });
});
