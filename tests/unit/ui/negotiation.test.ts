import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  negotiationSignal,
  setNegotiationActionDispatcher,
  onNegotiationActionCallback,
} from '../../../src/ui/store';
import { t, setLanguage } from '../../../src/ui/i18n';
import type { NegotiationSession, NegotiationAction } from '../../../src/sim/negotiation/NegotiationSystem';
import { Rng } from '../../../src/core/rng';

describe('T2.4 Negotiation Store & Logic', () => {
  const rng = new Rng(42);
  const mockSession: NegotiationSession = {
    req: {
      requestId: 'req_neg_01',
      passengerId: 'p_bargainer_01',
      pickupNodeId: 'node_farmgate',
      destinationNodeId: 'node_dhanmondi',
      initialFare: 100,
      estimatedDistance: 3.0,
      estimatedDuration: 12,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'Negotiating',
      surge: 1.0,
    },
    profile: {
      passengerId: 'p_bargainer_01',
      nameKey: 'char.salam_bhai',
      archetype: 'bargainer',
      budget: 120,
      patience: 0.8,
      urgency: 0.5,
      bargainingTendency: 0.8,
      safetySensitivity: 0.5,
      trustInRider: 0.5,
      localKnowledge: 0.5,
      personalBias: 0,
      paymentReliability: 0.95,
      relationshipLevel: 0,
      traits: {
        luggage: false,
        child: false,
        walkTolerance: 0.5,
      },
    },
    ctx: {
      traffic: 0.5,
      day: 1,
      walkM: 0,
      rng,
    },
    fairFare: 110,
    expectedBudget: 120,
    currentPassengerOffer: 90,
    currentRiderOffer: null,
    round: 1,
    maxRounds: 3,
    currentPatience: 0.8,
    status: 'active',
    walkM: 0,
    detourExtraMin: 0,
  };

  beforeEach(() => {
    negotiationSignal.value = {
      active: false,
      session: null,
      lastResult: null,
    };
    setLanguage('bn');
  });

  it('updates negotiation signal state on open and session update', () => {
    expect(negotiationSignal.value.active).toBe(false);
    expect(negotiationSignal.value.session).toBeNull();

    negotiationSignal.value = {
      active: true,
      session: mockSession,
      lastResult: null,
    };

    expect(negotiationSignal.value.active).toBe(true);
    expect(negotiationSignal.value.session?.req.requestId).toBe('req_neg_01');
    expect(negotiationSignal.value.session?.currentPassengerOffer).toBe(90);
  });

  it('dispatches negotiation actions correctly', () => {
    const mockDispatcher = vi.fn();
    setNegotiationActionDispatcher(mockDispatcher);

    const counterAction: NegotiationAction = {
      kind: 'counter',
      amount: 115,
    };
    onNegotiationActionCallback?.(counterAction);
    expect(mockDispatcher).toHaveBeenCalledWith(counterAction);

    const acceptAction: NegotiationAction = {
      kind: 'accept',
    };
    onNegotiationActionCallback?.(acceptAction);
    expect(mockDispatcher).toHaveBeenCalledWith(acceptAction);
  });

  it('provides bilingual negotiation UI translation keys', () => {
    setLanguage('bn');
    expect(t('negotiation.title')).toBe('ভাড়া দরকষাকষি');
    expect(t('negotiation.counter', { fare: 120 })).toBe('পাল্টা প্রস্তাব ৳120');
    expect(t('negotiation.patience')).toBe('ধৈর্য');

    setLanguage('en');
    expect(t('negotiation.title')).toBe('Fare Negotiation');
    expect(t('negotiation.counter', { fare: 120 })).toBe('Counter ৳120');
    expect(t('negotiation.patience')).toBe('Patience');
  });
});
