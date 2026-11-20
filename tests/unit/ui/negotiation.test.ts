import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  negotiationSignal,
  choiceSignal,
  bindEventBusToStore,
  setNegotiationActionDispatcher,
  onNegotiationActionCallback,
} from '../../../src/ui/store';
import { bindUi } from '../../../src/ui/bindings';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { t, setLanguage } from '../../../src/ui/i18n';
import type { NegotiationSession, NegotiationAction } from '../../../src/sim/negotiation/NegotiationSystem';
import { Rng } from '../../../src/core/rng';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { DistrictData } from '../../../src/sim/schemas';
import { generateProfile } from '../../../src/sim/passenger/profiles';
import testloopData from '../../../data/districts/testloop.json';

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
    salt: rng.getState(),
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

  it('P4.1 opens ChoiceCard on ride/disputed and closes on ride/disputeResolved', () => {
    const bus = new EventBus<GameEvents>();
    const unbind = bindEventBusToStore(bus);

    bus.emit('ride/disputed', {
      requestId: 'req_disp_ui',
      fare: 120,
      partialFare: 60,
      bookingType: 'app',
    });

    expect(choiceSignal.value.active).toBe(true);
    expect(choiceSignal.value.instanceId).toBe('dispute:req_disp_ui');
    expect(choiceSignal.value.options.length).toBeGreaterThanOrEqual(2);

    bus.emit('ride/disputeResolved', {
      requestId: 'req_disp_ui',
      choice: 'acceptPartial',
      fare: 60,
    });

    expect(choiceSignal.value.active).toBe(false);
    unbind();
  });

  it('P4.1 closes dispute ChoiceCard cleanly if ride is cancelled mid-dispute', () => {
    const bus = new EventBus<GameEvents>();
    const unbind = bindEventBusToStore(bus);

    bus.emit('ride/disputed', {
      requestId: 'req_disp_abort',
      fare: 120,
      partialFare: 60,
      bookingType: 'app',
    });
    expect(choiceSignal.value.active).toBe(true);
    expect(choiceSignal.value.instanceId).toBe('dispute:req_disp_abort');

    bus.emit('ride/cancelled', {
      requestId: 'req_disp_abort',
      by: 'system',
      reason: 'aborted',
    });
    expect(choiceSignal.value.active).toBe(false);
    expect(choiceSignal.value.instanceId).toBeUndefined();

    // Also closes if trip state transitions out of Completing cleanly
    bus.emit('ride/disputed', {
      requestId: 'req_disp_abort2',
      fare: 120,
      partialFare: 60,
      bookingType: 'app',
    });
    expect(choiceSignal.value.active).toBe(true);
    bus.emit('trip/state', {
      requestId: 'req_disp_abort2',
      from: 'Completing',
      to: 'Cancelled',
    });
    expect(choiceSignal.value.active).toBe(false);

    unbind();
  });

  it('P4.1 bindUi does not grant discount trust/relationship bonus when fare > fairFare', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 7, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false, negotiation: true });
    const unbind = bindEventBusToStore(gm.bus);
    bindUi(session);

    const highBudget = {
      ...generateProfile('urgent', new Rng(1), 'pass_char_nabila'),
      budget: 2.0,
      urgency: 0.95,
      patience: 0.9,
      trustInRider: 0.9,
    };
    session.requests.setProfile(highBudget);
    const [a, b] = road.getAllNodes();
    session.ride.offer({
      requestId: 'req_over_disc',
      passengerId: highBudget.passengerId,
      characterId: 'char_nabila',
      pickupNodeId: a!.nodeId,
      destinationNodeId: b!.nodeId,
      initialFare: 120,
      estimatedDistance: 0.5,
      estimatedDuration: 2,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    });
    session.ride.accept('req_over_disc');
    const neg = session.beginNegotiation('req_over_disc')!;
    negotiationSignal.value = { active: true, session: neg, lastResult: null };

    const trust0 = gm.reputationSystem.getLocalTrust();
    const rel0 = gm.reputationSystem.getRelationship('char_nabila');

    // Dispatch a discount action at an overcharged fare (> fairFare)
    const overFair = neg.fairFare + 20;
    onNegotiationActionCallback?.({ kind: 'discount', amount: overFair });

    expect(gm.reputationSystem.getLocalTrust()).toBe(trust0);
    expect(gm.reputationSystem.getRelationship('char_nabila')).toBe(rel0);

    unbind();
  });

  it('P6.2: preserves destinationKey across multi-round counteroffers and renders destination label cleanly', async () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 11, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false, negotiation: true });
    const unbind = bindEventBusToStore(gm.bus);
    bindUi(session);

    const profile = {
      ...generateProfile('bargainer', new Rng(3), 'pass_p62_dest'),
      patience: 0.95,
    };
    session.requests.setProfile(profile);
    const [a, b] = road.getAllNodes();
    session.ride.offer({
      requestId: 'req_p62_dest',
      passengerId: profile.passengerId,
      pickupNodeId: a!.nodeId,
      destinationNodeId: b!.nodeId,
      destinationPlaceKey: 'poi.mirpara.bazaar',
      initialFare: 80,
      estimatedDistance: 1.5,
      estimatedDuration: 6,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    });
    session.ride.accept('req_p62_dest');
    const neg = session.beginNegotiation('req_p62_dest')!;
    negotiationSignal.value = {
      active: true,
      session: neg,
      lastResult: null,
      destinationKey: 'poi.mirpara.bazaar',
    };

    onNegotiationActionCallback?.({ kind: 'counter', amount: neg.currentPassengerOffer + 15 });
    expect(negotiationSignal.value.destinationKey).toBe('poi.mirpara.bazaar');

    const { NegotiationPanelView } = await import('../../../src/ui/negotiation/NegotiationPanel');
    const vnode = NegotiationPanelView({
      active: true,
      session: negotiationSignal.value.session!,
      lastResult: negotiationSignal.value.lastResult,
      destinationKey: negotiationSignal.value.destinationKey,
      onAction: vi.fn(),
      counterAmount: negotiationSignal.value.session!.currentPassengerOffer,
      draftCounter: String(negotiationSignal.value.session!.currentPassengerOffer),
      onStepFare: vi.fn(),
      onDraftInput: vi.fn(),
      onCommitDraft: () => negotiationSignal.value.session!.currentPassengerOffer,
    });
    const html = JSON.stringify(vnode);
    expect(html).toContain('negotiation-destination');
    expect(html).not.toContain('{destination}');
    expect(html).not.toContain('{place}');
    expect(html).toContain('মিরপাড়া কাঁচাবাজার');

    unbind();
  });
});
