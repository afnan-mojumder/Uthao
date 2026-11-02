import { describe, it, expect } from 'vitest';
import type { PassengerProfile, RideRequest } from '../../../src/core/types';
import { Rng } from '../../../src/core/rng';
import { BALANCE } from '../../../src/config/balance';
import { generateProfile } from '../../../src/sim/passenger/profiles';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { DistrictData } from '../../../src/sim/schemas';
import type { ArchetypeId } from '../../../src/core/types';
import testloopData from '../../../data/districts/testloop.json';
import { readFileSync } from 'node:fs';
import {
  startNegotiation,
  evaluateFactors,
  respond,
  clampCounterFare,
  calculateWalkPenalty,
} from '../../../src/sim/negotiation/NegotiationSystem';

function mockProfile(overrides: Partial<PassengerProfile> = {}): PassengerProfile {
  return {
    passengerId: 'p_test_1',
    archetype: 'commuter',
    budget: 1.0,
    patience: 0.5,
    urgency: 0.5,
    bargainingTendency: 0.5,
    safetySensitivity: 0.5,
    trustInRider: 0.5,
    localKnowledge: 0.5,
    paymentReliability: 0.9,
    relationshipLevel: 0,
    nameKey: 'name.test',
    traits: {
      luggage: false,
      child: false,
      walkTolerance: 0.5,
    },
    personalBias: 0,
    ...overrides,
  };
}

function mockRequest(overrides: Partial<RideRequest> = {}): RideRequest {
  return {
    requestId: 'req_test_1',
    passengerId: 'p_test_1',
    pickupNodeId: 'node_1',
    destinationNodeId: 'node_2',
    initialFare: 80,
    estimatedDistance: 3.0,
    estimatedDuration: 10,
    requestedArrivalTime: null,
    bookingType: 'app',
    status: 'WaitingForPickup',
    surge: 1.0,
    ...overrides,
  };
}

describe('NegotiationSystem (T2.3)', () => {
  it("accepting the passenger's own offer always succeeds", () => {
    const profile = mockProfile({ archetype: 'commuter' });
    const req = mockRequest();
    const rng = new Rng(42);
    const session = startNegotiation(req, profile, {
      traffic: 0.2,
      day: 1,
      walkM: 0,
      rng,
    });

    const res = respond(session, { kind: 'accept' });
    expect(res.outcome).toEqual({
      kind: 'accepted',
      fare: session.currentPassengerOffer,
    });
    expect(res.session.status).toBe('accepted');
    expect(res.topFactor).toBe('FAIR_PRICE');
  });

  it('F far above B rejected with TOO_EXPENSIVE', () => {
    const profile = mockProfile({ patience: 0.8 });
    const req = mockRequest();
    const rng = new Rng(42);
    const session = startNegotiation(req, profile, {
      traffic: 0.2,
      day: 1,
      walkM: 0,
      rng,
    });

    // Offer fare way above expected budget B
    const exorbitantFare = session.expectedBudget * 3;
    const res = respond(session, { kind: 'counter', amount: exorbitantFare });

    expect(res.topFactor).toBe('TOO_EXPENSIVE');
    expect(res.outcome).toBeDefined();
    expect(res.outcome?.kind).toBe('rejected');
    if (res.outcome?.kind === 'rejected') {
      expect(res.outcome.reason).toBe('TOO_EXPENSIVE');
    }
  });

  it('urgent passenger accepts higher fare more often (1k trials, seeded)', () => {
    const req = mockRequest({ estimatedDistance: 4, estimatedDuration: 15 });
    const baseP = mockProfile({ budget: 1.0, patience: 0.5 });
    const pNonUrgent = { ...baseP, urgency: 0.05 };
    const pUrgent = { ...baseP, urgency: 0.95 };

    const testFare = 160; // Higher than expected budget
    let nonUrgentAccepts = 0;
    let urgentAccepts = 0;
    const TRIALS = 1000;

    for (let i = 0; i < TRIALS; i++) {
      const trialReq = { ...req, requestId: `req_urgent_trial_${i}` };

      const sessNonUrgent = startNegotiation(trialReq, pNonUrgent, {
        traffic: 0.3,
        day: 1,
        walkM: 0,
        rng: new Rng(i),
      });
      const resNonUrgent = respond(sessNonUrgent, { kind: 'counter', amount: testFare });
      if (resNonUrgent.outcome?.kind === 'accepted') {
        nonUrgentAccepts++;
      }

      const sessUrgent = startNegotiation(trialReq, pUrgent, {
        traffic: 0.3,
        day: 1,
        walkM: 0,
        rng: new Rng(i),
      });
      const resUrgent = respond(sessUrgent, { kind: 'counter', amount: testFare });
      if (resUrgent.outcome?.kind === 'accepted') {
        urgentAccepts++;
      }
    }

    expect(urgentAccepts).toBeGreaterThan(nonUrgentAccepts);
    expect(urgentAccepts - nonUrgentAccepts).toBeGreaterThan(50);
  });

  it('rounds exhausted ⇒ walkedAway', () => {
    // patience: 0.2 -> maxRounds = 1 + round(0.2*2) = 1
    const profile = mockProfile({ patience: 0.2, archetype: 'commuter' });
    const req = mockRequest();
    const rng = new Rng(42);
    const session = startNegotiation(req, profile, {
      traffic: 0.2,
      day: 1,
      walkM: 0,
      rng,
    });

    expect(session.maxRounds).toBe(1);

    // Counter with high fare to trigger rejection on round 1
    const res = respond(session, { kind: 'counter', amount: session.expectedBudget * 2 });
    expect(res.outcome?.kind).toBe('walkedAway');
    expect(res.session.status).toBe('walkedAway');
  });

  it('counter clamps 0 → minFare and 999999 → 5×fair', () => {
    const profile = mockProfile();
    const req = mockRequest({ estimatedDistance: 5, estimatedDuration: 15 });
    const rng = new Rng(42);
    const session = startNegotiation(req, profile, {
      traffic: 0.2,
      day: 1,
      walkM: 0,
      rng,
    });

    const expectedMin = BALANCE.FARE.minFare;
    const expectedMax = 5 * session.fairFare;

    expect(clampCounterFare(0, session.fairFare)).toBe(expectedMin);
    expect(clampCounterFare(999999, session.fairFare)).toBe(expectedMax);

    const res0 = respond(session, { kind: 'counter', amount: 0 });
    expect(res0.session.currentRiderOffer).toBe(expectedMin);

    const resHuge = respond(session, { kind: 'counter', amount: 999999 });
    expect(resHuge.session.currentRiderOffer).toBe(expectedMax);
  });

  it('same requestId+round ⇒ same decision', () => {
    const profile = mockProfile({ urgency: 0.5, patience: 0.5 });
    const req = mockRequest({ requestId: 'consistent_req_42' });
    const session = startNegotiation(req, profile, {
      traffic: 0.4,
      day: 2,
      walkM: 0,
      rng: new Rng(100),
    });

    const fare = session.expectedBudget * 1.1;
    const res1 = respond(session, { kind: 'counter', amount: fare });
    const res2 = respond(session, { kind: 'counter', amount: fare });

    expect(res1.outcome).toEqual(res2.outcome);
    expect(res1.topFactor).toBe(res2.topFactor);
    expect(res1.passengerLine).toBe(res2.passengerLine);
  });

  it('pickupAdjust with child penalised more', () => {
    const base = mockProfile();
    const pWithoutChild = {
      ...base,
      traits: { child: false, luggage: false, walkTolerance: 0.5 },
    };
    const pWithChild = {
      ...base,
      traits: { child: true, luggage: false, walkTolerance: 0.5 },
    };

    const penaltyWithout = calculateWalkPenalty(100, pWithoutChild);
    const penaltyWith = calculateWalkPenalty(100, pWithChild);

    expect(penaltyWith).toBeGreaterThan(penaltyWithout);
    expect(penaltyWith).toBeCloseTo(penaltyWithout * 2, 5);

    const req = mockRequest();
    const sessWithout = startNegotiation(req, pWithoutChild, {
      traffic: 0.3,
      day: 1,
      walkM: 0,
      rng: new Rng(123),
    });
    const sessWith = startNegotiation(req, pWithChild, {
      traffic: 0.3,
      day: 1,
      walkM: 0,
      rng: new Rng(123),
    });

    const resWithout = respond(sessWithout, {
      kind: 'pickupAdjust',
      walkM: 150,
      savesMin: 2,
    });
    const resWith = respond(sessWith, {
      kind: 'pickupAdjust',
      walkM: 150,
      savesMin: 2,
    });

    expect(resWith.outcome?.kind).toBe('rejected');
    expect(resWith.topFactor).toBe('WALK_TOO_FAR');
    expect(resWithout.session.walkM).toBeGreaterThanOrEqual(0);
  });

  it('explainDetour raises acceptance of a higher fare', () => {
    const profile = mockProfile({ urgency: 0.8, patience: 0.8 });
    const req = mockRequest();
    const sess = startNegotiation(req, profile, {
      traffic: 0.5,
      day: 1,
      walkM: 0,
      rng: new Rng(99),
    });

    // Explain 15 min detour
    const explained = respond(sess, { kind: 'explainDetour', extraMin: 15 });
    expect(explained.session.detourExtraMin).toBe(15);
    expect(explained.passengerLine).toBe('dialogue.negotiation.detour_explained');
  });

  describe('T8.5 the eight spec variables F, B, U, P, T, R, W, H', () => {
    const start = (p = mockProfile(), ctx: Partial<{ traffic: number; walkM: number; history: number }> = {}) =>
      startNegotiation(mockRequest(), p, { traffic: 0.3, day: 1, walkM: 0, history: 0, rng: new Rng(5), ...ctx });
    const pAt = (s: ReturnType<typeof start>, fare = s.expectedBudget) => evaluateFactors(s, fare).pAccept;

    it('F: a higher quote lowers acceptance', () => {
      const s = start();
      expect(pAt(s, s.expectedBudget * 1.4)).toBeLessThan(pAt(s, s.expectedBudget));
    });
    it('B: a bigger budget raises acceptance of the same quote', () => {
      const lo = start(mockProfile({ budget: 0.7 }));
      const hi = start(mockProfile({ budget: 1.3 }));
      expect(pAt(hi, 100)).toBeGreaterThan(pAt(lo, 100));
    });
    it('U: urgency raises acceptance', () => {
      expect(pAt(start(mockProfile({ urgency: 0.9 })), 100)).toBeGreaterThan(pAt(start(mockProfile({ urgency: 0.1 })), 100));
    });
    it('P: patience raises acceptance', () => {
      expect(pAt(start(mockProfile({ patience: 0.9 })), 100)).toBeGreaterThan(pAt(start(mockProfile({ patience: 0.1 })), 100));
    });
    it('T: traffic/inconvenience lowers acceptance', () => {
      expect(pAt(start(mockProfile(), { traffic: 0.9 }), 100)).toBeLessThan(pAt(start(mockProfile(), { traffic: 0.1 }), 100));
    });
    it('R: trust raises acceptance', () => {
      expect(pAt(start(mockProfile({ trustInRider: 0.9 })), 100)).toBeGreaterThan(pAt(start(mockProfile({ trustInRider: 0.1 })), 100));
    });
    it('W: more pickup inconvenience (walk) lowers acceptance', () => {
      const near = start(mockProfile(), { walkM: 0 });
      const far = start(mockProfile(), { walkM: 150 });
      expect(pAt(far, 100)).toBeLessThan(pAt(near, 100));
      expect(evaluateFactors(near, 100, 120).pAccept).toBeLessThan(pAt(near, 100));
    });
    it('H: a history of overcharging lowers acceptance at the same fare', () => {
      const clean = start(mockProfile(), { history: 0.5 });
      const burned = start(mockProfile(), { history: -0.8 });
      expect(pAt(burned, 100)).toBeLessThan(pAt(clean, 100));
      expect(evaluateFactors(burned, 100).contribHistory).toBeLessThan(0);
    });
  });

  it('no fixed multiplier is best across archetypes (1000 seeded negotiations each)', () => {
    const mults = [0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
    const archetypes: ArchetypeId[] = ['bargainer', 'commuter', 'careful', 'regular', 'risky'];
    const bestOf = (arch: ArchetypeId): number => {
      let best = mults[0]!;
      let bestRev = -1;
      for (const m of mults) {
        let rev = 0;
        for (let i = 0; i < 1000; i++) {
          const p = generateProfile(arch, new Rng(i), `p${i}`);
          const sess = startNegotiation(mockRequest({ requestId: `r${i}`, passengerId: p.passengerId }), p, {
            traffic: 0.4, day: 1, walkM: 0, rng: new Rng(i),
          });
          const res = respond(sess, { kind: 'counter', amount: sess.fairFare * m });
          if (res.outcome?.kind === 'accepted') rev += res.outcome.fare;
        }
        if (rev > bestRev) { bestRev = rev; best = m; }
      }
      return best;
    };
    const best = archetypes.map(bestOf);
    expect(new Set(best).size).toBeGreaterThan(1);
  });

  describe('T8.5 live session negotiates with the request profile', () => {
    function live(seed: number) {
      const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
      const gm = new GameManager({ seed, mode: 'career', data: {} });
      return new GameSession({ gm, road, autoRequests: false });
    }
    function negotiateWith(session: GameSession, id: string, arch: ArchetypeId, sessionSeedRng: Rng) {
      const profile = generateProfile(arch, sessionSeedRng, `p_${id}`);
      session.requests.setProfile(profile);
      const [a, b] = session.road.getAllNodes();
      session.ride.offer(mockRequest({
        requestId: id, passengerId: profile.passengerId, pickupNodeId: a!.nodeId, destinationNodeId: b!.nodeId,
      }));
      expect(session.ride.accept(id)).toBe(true);
      expect(session.ride.getTripState()).toBe('Negotiating'); // not auto-agreed
      return session.beginNegotiation(id)!;
    }

    it('opens a real negotiation with the passenger of the accepted request, per archetype', () => {
      const s = live(7);
      const bargainer = negotiateWith(s, 'ra', 'bargainer', new Rng(1));
      s.ride.cancel('ra', 'rider', 'test');
      const risky = negotiateWith(s, 'rb', 'risky', new Rng(1));
      expect(bargainer.profile.archetype).toBe('bargainer');
      expect(risky.profile.archetype).toBe('risky');
      expect(bargainer.profile).toBe(s.requests.getProfile('p_ra'));
      expect(bargainer.maxRounds).not.toBe(risky.maxRounds);
      expect(bargainer.currentPassengerOffer).not.toBe(risky.currentPassengerOffer);
    });

    it('is deterministic per seed and uses the session RNG, not a fixed one', () => {
      const run = (seed: number) => {
        const s = live(seed);
        const sess = negotiateWith(s, 'rc', 'commuter', new Rng(2));
        return { salt: sess.salt, res: respond(sess, { kind: 'counter', amount: sess.fairFare * 1.2 }) };
      };
      expect(run(7)).toEqual(run(7));
      expect(run(7).salt).not.toBe(run(8).salt);
      expect(readFileSync('src/main.ts', 'utf8')).not.toMatch(/new Rng\(123\)/);
    });

    it('agreeing an overcharged fare lowers the career history, a fair one never does', () => {
      const s = live(7);
      const sess = negotiateWith(s, 'rd', 'commuter', new Rng(2));
      s.ride.agreeFare(Math.round(sess.fairFare * 1.6));
      expect(s.gm.negotiationHistory).toBeLessThan(0);
      const h = s.gm.negotiationHistory;
      s.ride.cancel('rd', 'rider', 'test');
      const sess2 = negotiateWith(s, 're', 'commuter', new Rng(3));
      expect(sess2.ctx.history).toBe(h);
      s.ride.agreeFare(sess2.fairFare);
      expect(s.gm.negotiationHistory).toBeGreaterThanOrEqual(h);
    });
  });
});
