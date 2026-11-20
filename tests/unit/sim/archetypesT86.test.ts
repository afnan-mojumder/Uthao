import { describe, it, expect } from 'vitest';
import { generateProfile, getArchetypeDefinition } from '../../../src/sim/passenger/profiles';
import { Rng, hashSeed } from '../../../src/core/rng';
import type { ArchetypeId, RideRequest } from '../../../src/core/types';
import { BALANCE } from '../../../src/config/balance';
import { offAppPayout, offAppNonPayChance, disputeChance, isDisputed } from '../../../src/sim/economy/offApp';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { DistrictData } from '../../../src/sim/schemas';
import { SIM_DT } from '../../../src/config/constants';
import testloopData from '../../../data/districts/testloop.json';
import enDialogue from '../../../data/dialogue/en/dialogue.json';
import bnDialogue from '../../../data/dialogue/bn/dialogue.json';

const NEW_ARCHETYPES: ArchetypeId[] = ['student', 'office', 'urgent', 'traveler', 'unreliable', 'family'];
const PHASES = ['greeting', 'offer', 'counter', 'accept', 'reject', 'small_talk', 'drop_off'] as const;

function linesFor(dict: Record<string, string>, arch: ArchetypeId, phase: string): number {
  const prefix = `dialogue.pool.${arch}.${phase}.`;
  return Object.keys(dict).filter((k) => k.startsWith(prefix)).length;
}

describe('T8.6 new archetypes', () => {
  it('each new archetype is defined and generates a profile of that archetype', () => {
    for (const a of NEW_ARCHETYPES) {
      expect(() => getArchetypeDefinition(a)).not.toThrow();
      expect(generateProfile(a, new Rng(1)).archetype).toBe(a);
    }
  });

  it('each new archetype has at least 15 lines in both languages, and every phase has one', () => {
    for (const a of NEW_ARCHETYPES) {
      for (const dict of [enDialogue as Record<string, string>, bnDialogue as Record<string, string>]) {
        let total = 0;
        for (const ph of PHASES) {
          const n = linesFor(dict, a, ph);
          expect(n, `${a}/${ph}`).toBeGreaterThanOrEqual(1);
          total += n;
        }
        expect(total, `${a} total lines`).toBeGreaterThanOrEqual(15);
      }
    }
  });
});

describe('T8.6 off-app trade-off', () => {
  it('non-payment chance rises as payment reliability falls, and is capped', () => {
    expect(offAppNonPayChance(1)).toBe(0);
    expect(offAppNonPayChance(0.5)).toBeGreaterThan(offAppNonPayChance(0.9));
    expect(offAppNonPayChance(0)).toBeLessThanOrEqual(BALANCE.OFF_APP.nonPayMaxChance);
  });

  it('a non-payment roll pays nothing and reports unpaid', () => {
    expect(offAppPayout(100, 0, 0)).toEqual({ paid: 0, unpaid: true });
    expect(offAppPayout(100, 1, 0.99)).toEqual({ paid: 100, unpaid: false });
  });

  it('off-app is a trade-off: mean net within 10% of app, worst case worse (200 seeds)', () => {
    const archetypes: ArchetypeId[] = ['bargainer', 'commuter', 'careful', 'regular', 'risky', ...NEW_ARCHETYPES];
    const app: number[] = [];
    const off: number[] = [];
    for (let seed = 0; seed < 200; seed++) {
      const rng = new Rng(seed + 1);
      const profile = generateProfile(archetypes[seed % archetypes.length]!, rng);
      const fare = 80 + (seed % 7) * 10;
      app.push(fare - fare * BALANCE.COMMISSION_APP);
      off.push(offAppPayout(fare, profile.paymentReliability, rng.next()).paid);
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(mean(off)).toBeLessThanOrEqual(mean(app) * 1.1);
    expect(mean(off)).toBeGreaterThanOrEqual(mean(app) * 0.9);
    expect(Math.min(...off)).toBeLessThan(Math.min(...app));
  });
});

describe('T8.6 unreliable passengers dispute', () => {
  it('only unreliable passengers can dispute, and reliability lowers the chance', () => {
    expect(disputeChance('unreliable', 0.3)).toBeGreaterThan(0);
    expect(disputeChance('commuter', 0)).toBe(0);
    expect(disputeChance('unreliable', 0.3)).toBeGreaterThan(disputeChance('unreliable', 0.9));
  });

  it('a dispute roll below the chance is a dispute, and above it is not', () => {
    const chance = disputeChance('unreliable', 0.3);
    expect(isDisputed('unreliable', 0.3, chance / 2)).toBe(true);
    expect(isDisputed('unreliable', 0.3, 0.999)).toBe(false);
    expect(isDisputed('commuter', 0.3, 0)).toBe(false);
  });

  it('P4.1 interactive dispute resolution waits in Completing until player resolves it', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const [pickup, dest] = [road.getAllNodes()[0]!, road.getAllNodes()[1]!];
    // Find a requestId whose seeded dispute roll triggers dispute for paymentReliability 0.35
    let disputedReqId = '';
    for (let i = 1; i < 200; i++) {
      const id = `req_disp_${i}`;
      if (isDisputed('unreliable', 0.35, new Rng(hashSeed(id, 'dispute')).next())) {
        disputedReqId = id;
        break;
      }
    }
    expect(disputedReqId).not.toBe('');

    const gm = new GameManager({ seed: 55, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false, negotiation: false });
    const profile = { ...generateProfile('unreliable', new Rng(3), 'p_unrel'), paymentReliability: 0.35 };
    session.requests.setProfile(profile);

    const disputedEvents: Array<{ requestId: string; fare: number; partialFare: number }> = [];
    const completedEvents: Array<{ requestId: string; fare: number }> = [];
    gm.bus.on('ride/disputed', (e) => disputedEvents.push(e));
    gm.bus.on('ride/completed', (e) => completedEvents.push({ requestId: e.requestId, fare: e.receipt.fare }));

    const req: RideRequest = {
      requestId: disputedReqId,
      passengerId: profile.passengerId,
      pickupNodeId: pickup.nodeId,
      destinationNodeId: dest.nodeId,
      initialFare: 120,
      estimatedDistance: 0.5,
      estimatedDuration: 3,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    };

    session.ride.offer(req);
    session.ride.accept(req.requestId);
    session.ride.update({ x: pickup.x, z: pickup.z, speed: 0 }, SIM_DT);
    session.ride.update({ x: dest.x, z: dest.z, speed: 0 }, SIM_DT);

    // Must wait interactively in Completing (not auto-settled yet)
    expect(session.ride.getTripState()).toBe('Completing');
    expect(session.ride.getPendingDispute()).not.toBeNull();
    expect(disputedEvents).toHaveLength(1);
    expect(completedEvents).toHaveLength(0);

    // Resolve interactively with 'acceptPartial'
    const receipt = session.ride.resolveDispute('acceptPartial');
    expect(receipt).not.toBeNull();
    expect(receipt!.fare).toBe(Math.round(120 * BALANCE.DISPUTE.fareKept));
    expect(completedEvents).toHaveLength(1);
    expect(session.ride.getTripState()).toBe('Idle');
    expect(session.ride.getPendingDispute()).toBeNull();
  });

  it('P4.1 does not mark a ride as disputed when offAppPay already zeroed paidFare', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const [pickup, dest] = [road.getAllNodes()[0]!, road.getAllNodes()[1]!];
    let targetId = '';
    for (let i = 1; i < 1500; i++) {
      const id = `req_unpaid_disp_${i}`;
      const off = offAppPayout(120, 0.25, new Rng(hashSeed(id, 'offAppPay')).next());
      const disp = isDisputed('unreliable', 0.25, new Rng(hashSeed(id, 'dispute')).next());
      if (off.unpaid && disp) {
        targetId = id;
        break;
      }
    }
    expect(targetId).not.toBe('');

    const gm = new GameManager({ seed: 55, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false, negotiation: false });
    const profile = { ...generateProfile('unreliable', new Rng(3), 'p_unrel_unpaid'), paymentReliability: 0.25 };
    session.requests.setProfile(profile);

    let disputedFired = false;
    gm.bus.on('ride/disputed', () => {
      disputedFired = true;
    });

    session.ride.offer({
      requestId: targetId,
      passengerId: profile.passengerId,
      pickupNodeId: pickup.nodeId,
      destinationNodeId: dest.nodeId,
      initialFare: 120,
      estimatedDistance: 0.5,
      estimatedDuration: 3,
      requestedArrivalTime: null,
      bookingType: 'offApp',
      status: 'WaitingForPickup',
      surge: 1,
    });
    session.ride.accept(targetId);
    session.ride.update({ x: pickup.x, z: pickup.z, speed: 0 }, SIM_DT);
    session.ride.update({ x: dest.x, z: dest.z, speed: 0 }, SIM_DT);

    expect(disputedFired).toBe(false);
    expect(session.ride.getPendingDispute()).toBeNull();
    expect(session.ride.getTripState()).toBe('Idle');
  });
});
