import { describe, it, expect, vi } from 'vitest';
import { bindUi } from '../../../src/ui/bindings';
import { negotiationSignal, onNegotiationActionCallback } from '../../../src/ui/store';
import {
  startNegotiation,
  respond,
  type NegotiationSession,
} from '../../../src/sim/negotiation/NegotiationSystem';
import { generateProfile } from '../../../src/sim/passenger/profiles';
import { Rng } from '../../../src/core/rng';
import type { GameSession } from '../../../src/sim/GameSession';
import type { PassengerProfile, RideRequest } from '../../../src/core/types';

const request: RideRequest = {
  requestId: 'req_reloc',
  passengerId: 'p_reloc',
  pickupNodeId: 'N1',
  destinationNodeId: 'N2',
  initialFare: 100,
  estimatedDistance: 3,
  estimatedDuration: 10,
  requestedArrivalTime: null,
  bookingType: 'app',
  status: 'Negotiating',
  surge: 1,
};

/** A session whose next pickupAdjust is accepted by the passenger (no outcome). */
function acceptedRelocation(walkM: number): NegotiationSession {
  const base = generateProfile('bargainer', new Rng(1), request.passengerId);
  const profile: PassengerProfile = {
    ...base,
    urgency: 1,
    trustInRider: 1,
    traits: { ...base.traits, walkTolerance: 1 },
  };
  for (let seed = 0; seed < 500; seed++) {
    const session = startNegotiation(request, profile, {
      traffic: 0,
      day: 1,
      walkM: 0,
      rng: new Rng(seed),
    });
    const result = respond(session, { kind: 'pickupAdjust', walkM, savesMin: 10 });
    if (result.outcome === undefined && result.session.walkM > 0) return session;
  }
  throw new Error('no seed produced an accepted pickupAdjust');
}

function bindFakeSession(relocated: boolean) {
  const relocatePickup = vi.fn(() => relocated);
  const repriceNegotiation = vi.fn((s: NegotiationSession) => ({ ...s, fairFare: 123 }));
  const agreeFare = vi.fn();
  const walkAwayNegotiation = vi.fn();
  const rideManager = {
    getActiveRequest: () => request,
    relocatePickup,
    repriceNegotiation,
    agreeFare,
    walkAwayNegotiation,
    cancel: vi.fn(),
    getPassengerMood: () => 1,
  };
  const choice = { nodeId: 'N3', walkM: 25, savesMin: 10 };
  const session = {
    gm: { dispatch: vi.fn() },
    ride: rideManager,
    requests: {},
    pickupChoice: () => choice,
    repriceNegotiation,
    markOffApp: vi.fn(),
  } as unknown as GameSession;
  bindUi(session);
  return { relocatePickup, repriceNegotiation, agreeFare, choice };
}

describe('T8.5 accepted pickup relocation', () => {
  it('moves the pickup and re-prices without ending the negotiation', () => {
    const { relocatePickup, repriceNegotiation, agreeFare, choice } = bindFakeSession(true);
    const neg = acceptedRelocation(choice.walkM);
    negotiationSignal.value = { active: true, session: neg, lastResult: null };

    onNegotiationActionCallback?.({ kind: 'pickupAdjust', walkM: choice.walkM, savesMin: choice.savesMin });

    expect(relocatePickup).toHaveBeenCalledWith(choice.nodeId, choice.walkM);
    expect(repriceNegotiation).toHaveBeenCalledTimes(1);
    expect(agreeFare).not.toHaveBeenCalled();
    expect(negotiationSignal.value.active).toBe(true);
    expect(negotiationSignal.value.session?.walkM).toBe(choice.walkM);
    expect(negotiationSignal.value.pickup).toBeDefined();
  });

  it('does not keep the walk penalty when the pickup cannot actually move', () => {
    const { relocatePickup, repriceNegotiation, agreeFare } = bindFakeSession(false);
    const neg = acceptedRelocation(25);
    negotiationSignal.value = { active: true, session: neg, lastResult: null };

    onNegotiationActionCallback?.({ kind: 'pickupAdjust', walkM: 25, savesMin: 10 });

    expect(relocatePickup).toHaveBeenCalledTimes(1);
    expect(repriceNegotiation).not.toHaveBeenCalled();
    expect(agreeFare).not.toHaveBeenCalled();
    // The passenger never walked, so their patience may drop but walkM must stay.
    expect(negotiationSignal.value.session?.walkM).toBe(0);
    expect(negotiationSignal.value.session?.currentPatience).toBeLessThan(neg.currentPatience);
  });
});
