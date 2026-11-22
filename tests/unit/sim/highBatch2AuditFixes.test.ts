import { describe, it, expect } from 'vitest';
import { h } from 'preact';
import { GameManager } from '../../../src/sim/GameManager';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import { ReputationSystem } from '../../../src/sim/reputation/ReputationSystem';
import { DeliveryManager } from '../../../src/sim/delivery/DeliveryManager';
import { DialogueManager, defaultDialogueManager } from '../../../src/sim/dialogue/DialogueManager';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { Rng } from '../../../src/core/rng';
import { BALANCE } from '../../../src/config/balance';
import { NegotiationPanelView } from '../../../src/ui/negotiation/NegotiationPanel';
import { setLanguage } from '../../../src/ui/i18n';
import type { DistrictData } from '../../../src/sim/schemas';
import type { NegotiationSession, NegotiationResult } from '../../../src/sim/negotiation/NegotiationSystem';
import mirparaData from '../../../data/districts/mirpara.json';

describe('High Batch 2 Audit Fixes (#14 - #19)', () => {
  it('#14: prevents re-buying owned bikes, blocks trading down to old100, and clamps fuel on bike swap', () => {
    const bus = new EventBus<GameEvents>();
    const eco = new EconomyManager(bus, { cash: 100000 });

    // Buy used125 without trade-in so old100 and used125 are both owned
    expect(eco.buyBike('used125', false).success).toBe(true);
    expect(eco.currentBikeId).toBe('used125');

    // Re-buying owned old100 must fail
    const rebuy = eco.buyBike('old100', false);
    expect(rebuy.success).toBe(false);

    // Fill tank to 12L on used125, then switch to old100 (8L tank): fuelLevel clamps to 8L
    eco.fuelLevel = 12;
    expect(eco.switchBike('old100').success).toBe(true);
    expect(eco.fuelLevel).toBeLessThanOrEqual(eco.maxFuelL());
    expect(eco.fuelLevel).toBe(8);

    // Now trade-in old100 for new150 (removing old100 from ownedBikes), then try trading down to old100
    const ecoTrade = new EconomyManager(bus, { cash: 100000 });
    expect(ecoTrade.buyBike('new150', true).success).toBe(true);
    expect(ecoTrade.ownedBikes).not.toContain('old100');
    const tradeDown = ecoTrade.buyBike('old100', true);
    expect(tradeDown.success).toBe(false);
    expect(ecoTrade.currentBikeId).toBe('new150');
  });

  it('#15: rent shortfall checks total rent (including deferredRent) and manual delayRent increments rentMissedCount', () => {
    // Case A: Day 7 manual delayRent with cash >= 4000 increments rentMissedCount so Day 14 miss warns eviction
    const gm = new GameManager({ seed: 20, mode: 'career', data: {} });
    gm.clock.day = 7;
    gm.economyManager.cash = 10000;
    gm.clock.minutes = 13 * 60;
    expect(gm.dispatch({ type: 'endShift' }).success).toBe(true);
    expect(gm.dispatch({ type: 'delayRent' }).success).toBe(true);
    expect(gm.economyManager.getSnapshot().deferredRent).toBe(BALANCE.LIVING.rentAmount);

    // Day 14 with 0 cash -> second missed rent must trigger evictionWarning
    gm.economyManager.cash = 0;
    const day14 = gm.economyManager.postDailyLivingExpenses(14, 13 * 60);
    expect(day14.evictionWarning).toBe(true);

    // Case B: Day 14 with 5000 cash (< 8000 total rent) still counts as shortfall/missed
    const bus2 = new EventBus<GameEvents>();
    const eco2 = new EconomyManager(bus2, { cash: 5000, deferredRent: 4000 });
    const res = eco2.postDailyLivingExpenses(14, 13 * 60);
    expect(res.rent).toBe(8000);
    expect(res.rentDelayed).toBe(true);
  });

  it('#16: adjustRating preserves sign and applies delta without 1/N dilution', () => {
    const rep = new ReputationSystem();
    for (let i = 0; i < 9; i++) {
      rep.recordTripRating(5.0);
    }
    rep.recordTripRating(1.0);
    const before = rep.getAppRating(); // 4.60
    expect(before).toBe(4.6);

    const afterPenalty = rep.adjustRating(-0.3);
    expect(afterPenalty).toBeLessThan(before);
    expect(afterPenalty).toBeCloseTo(4.33, 2);

    const repUniform = new ReputationSystem();
    for (let i = 0; i < 20; i++) {
      repUniform.recordTripRating(5.0);
    }
    expect(repUniform.adjustRating(-0.3)).toBe(4.7);
  });

  it('#17: DialogueManager rejects flag/weather-gated lines when omitted, matches WeatherKind, and buyBike sets boughtBike', () => {
    // Without flags, flag-gated char_kamal line must not be selected
    const noFlags = defaultDialogueManager.getSmallTalk({
      archetype: 'regular',
      characterId: 'char_kamal',
    });
    expect(noFlags?.key).not.toBe('dialogue.char.kamal.mechanic_review');

    // With boughtBike: true, it is selected
    const withFlag = defaultDialogueManager.getSmallTalk({
      archetype: 'regular',
      characterId: 'char_kamal',
      flags: { boughtBike: true },
    });
    expect(withFlag?.key).toBe('dialogue.char.kamal.mechanic_review');

    // Runtime WeatherKind 'heavyRain' matches schema 'monsoon'
    const custom = new DialogueManager([
      {
        id: 'test_monsoon',
        phase: 'greeting',
        key: 'dialogue.pool.commuter.greeting.01',
        requires: { weather: 'monsoon' },
      },
    ]);
    expect(custom.selectLine({ phase: 'greeting', weather: 'heavyRain' })?.lineDef.id).toBe(
      'test_monsoon'
    );
    expect(custom.selectLine({ phase: 'greeting', weather: 'clear' })).toBeNull();
    expect(custom.selectLine({ phase: 'greeting' })).toBeNull();

    // GameManager buyBike sets story.branchFlags.boughtBike = true
    const gm = new GameManager({ seed: 22, mode: 'career', data: {} });
    gm.economyManager.cash = 50000;
    expect(gm.dispatch({ type: 'buyBike', bikeId: 'used125', useTradeIn: false }).success).toBe(true);
    expect(gm.story.branchFlags['boughtBike']).toBe(true);
  });

  it('#18: NegotiationPanel binds {fare} to rider ask and {counter} to passenger offer without live stepper mutation', () => {
    setLanguage('en');
    const session = {
      req: {
        requestId: 'req_1',
        passengerId: 'p1',
        pickupNodeId: 'res_n1_0',
        destinationNodeId: 'res_n2_0',
        destinationPlaceKey: 'poi.mirpara.bazaar',
        initialFare: 100,
        estimatedDistance: 1,
        estimatedDuration: 5,
        requestedArrivalTime: null,
        bookingType: 'app',
        status: 'Negotiating',
        surge: 1,
      },
      profile: {
        passengerId: 'p1',
        archetype: 'bargainer',
        budget: 120,
        patience: 0.7,
        urgency: 0.5,
        bargainingTendency: 0.7,
        safetySensitivity: 0.5,
        trustInRider: 0.5,
        localKnowledge: 0.5,
        paymentReliability: 0.9,
        relationshipLevel: 0,
        nameKey: 'passenger.name.1',
        traits: { luggage: false, child: false, walkTolerance: 0.5 },
        personalBias: 0,
      },
      status: 'active',
      round: 2,
      maxRounds: 3,
      fairFare: 100,
      currentRiderOffer: 140,
      currentPassengerOffer: 110,
      currentPatience: 0.6,
      walkM: 0,
      alleyRefused: false,
      discountApplied: false,
      ctx: {
        hasDetour: false,
        traffic: 0,
        weather: 'clear',
        rain: false,
        lateNight: false,
      },
    } as unknown as NegotiationSession;

    const lastResult = {
      session,
      passengerLine: 'dialogue.pool.bargainer.counter.01',
      outcome: { kind: 'rejected', reason: 'TOO_EXPENSIVE' },
      topFactor: 'TOO_EXPENSIVE',
    } as unknown as NegotiationResult;

    const vnode1 = h(NegotiationPanelView, {
      active: true,
      session,
      lastResult,
      mood: 0.6,
      counterAmount: 110,
      draftCounter: '110',
      onAction: () => {},
      onStepFare: () => {},
      onDraftInput: () => {},
      onCommitDraft: () => 110,
    });
    const rendered1 = JSON.stringify(NegotiationPanelView(vnode1.props));
    expect(rendered1).toContain('140');
    expect(rendered1).toContain('110');

    // Stepping counterAmount to 160 must NOT mutate the passenger's speech bubble
    const vnode2 = h(NegotiationPanelView, {
      ...vnode1.props,
      counterAmount: 160,
      draftCounter: '160',
    });
    const rendered2 = JSON.stringify(NegotiationPanelView(vnode2.props));
    expect(rendered2).toContain('৳140');
    expect(rendered2).toContain('at ৳110');
    expect(rendered2).not.toContain('at ৳160');
  });

  it('#19: DeliveryManager scales timeLimitMinutes and pickupTimeLimitMinutes with TIME_SCALE', () => {
    const road = RoadNetwork.fromDistricts([mirparaData as DistrictData]);
    const bus = new EventBus<GameEvents>();
    const eco = new EconomyManager(bus, { cash: 500 });
    eco.ownedUpgrades.push('upgrade_luggage_carrier');
    const dm = new DeliveryManager({ bus, economyManager: eco });

    const job = dm.generateOffer(road, new Rng(77), 1, {
      playerPos: { x: 300, z: 300 },
      unlockedDistricts: ['mirpara'],
    });
    expect(job).not.toBeNull();
    expect(job!.timeLimitMinutes).toBeGreaterThanOrEqual(45);
    expect(job!.pickupTimeLimitMinutes).toBeGreaterThanOrEqual(45);

    expect(dm.accept(job!.id, 500).success).toBe(true);
    const active = dm.activeDeliveries.get(job!.id)!;
    expect(active.pickupDeadlineMinute).toBe(500 + job!.pickupTimeLimitMinutes!);
  });
});
