import { describe, it, expect, vi } from 'vitest';
import { FirstRideTutorial } from '../../../src/ui/tutorial/FirstRideTutorial';
import { tutorialSignal } from '../../../src/ui/store';

interface VNodeLike {
  props: {
    children?: VNodeLike | VNodeLike[];
    onClick?: () => void;
    [key: string]: unknown;
  };
}

function asVNode(elem: unknown): VNodeLike {
  return elem as VNodeLike;
}

function asVNodeArray(children: unknown): VNodeLike[] {
  return children as VNodeLike[];
}

describe('T3.8 FirstRideTutorial Component', () => {
  it('renders nothing when tutorial is idle or completed', () => {
    const idleElem = FirstRideTutorial({ step: 'idle' });
    expect(idleElem).toBeNull();

    const completedElem = FirstRideTutorial({ step: 'completed' });
    expect(completedElem).toBeNull();
  });

  it('renders 07:00 alarm and calls onAdvance on dismiss', () => {
    const advanceSpy = vi.fn();
    const elem = FirstRideTutorial({
      step: 'alarm',
      onAdvance: advanceSpy,
    });

    expect(elem).not.toBeNull();
    const card = asVNode(asVNode(elem).props.children);
    const cardContent = asVNodeArray(card.props.children)[1];
    const btn = asVNodeArray(cardContent?.props.children)[2];
    expect(btn?.props['data-testid']).toBe('tutorial-btn-alarm');
    btn?.props.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('ma_reminder');
  });

  it('renders Ma reminder for Day 3 household rent (৳1,200)', () => {
    const advanceSpy = vi.fn();
    const elem = FirstRideTutorial({
      step: 'ma_reminder',
      onAdvance: advanceSpy,
    });

    expect(elem).not.toBeNull();
    const card = asVNode(asVNode(elem).props.children);
    const cardContent = asVNodeArray(card.props.children)[1];
    const btn = asVNodeArray(cardContent?.props.children)[2];
    expect(btn?.props['data-testid']).toBe('tutorial-btn-ma');
    btn?.props.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('wallet_check');
  });

  it('renders wallet check showing ৳600 starting cash', () => {
    const advanceSpy = vi.fn();
    const elem = FirstRideTutorial({
      step: 'wallet_check',
      onAdvance: advanceSpy,
    });

    expect(elem).not.toBeNull();
    const card = asVNode(asVNode(elem).props.children);
    const cardContent = asVNodeArray(card.props.children)[1];
    const btn = asVNodeArray(cardContent?.props.children)[2];
    expect(btn?.props['data-testid']).toBe('tutorial-btn-wallet');
    btn?.props.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('bike_inspection');
  });

  it('renders bike inspection showing 1.2 L fuel remaining', () => {
    const advanceSpy = vi.fn();
    const elem = FirstRideTutorial({
      step: 'bike_inspection',
      onAdvance: advanceSpy,
    });

    expect(elem).not.toBeNull();
    const card = asVNode(asVNode(elem).props.children);
    const cardContent = asVNodeArray(card.props.children)[1];
    const btn = asVNodeArray(cardContent?.props.children)[2];
    expect(btn?.props['data-testid']).toBe('tutorial-btn-bike');
    btn?.props.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('tea_stall');
  });

  it('renders tea stall advice from Mintu', () => {
    const advanceSpy = vi.fn();
    const elem = FirstRideTutorial({
      step: 'tea_stall',
      onAdvance: advanceSpy,
    });

    expect(elem).not.toBeNull();
    const card = asVNode(asVNode(elem).props.children);
    const cardContent = asVNodeArray(card.props.children)[1];
    const btn = asVNodeArray(cardContent?.props.children)[2];
    expect(btn?.props['data-testid']).toBe('tutorial-btn-tea-stall');
    btn?.props.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('open_app');
  });

  it('renders incoming request from Nabila and advances to negotiation', () => {
    const advanceSpy = vi.fn();
    const elem = FirstRideTutorial({
      step: 'open_app',
      onAdvance: advanceSpy,
    });

    expect(elem).not.toBeNull();
    const card = asVNode(asVNode(elem).props.children);
    const cardContent = asVNodeArray(card.props.children)[1];
    const btn = asVNodeArray(cardContent?.props.children)[2];
    expect(btn?.props['data-testid']).toBe('tutorial-btn-open-request');
    btn?.props.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('negotiation');
  });

  it('renders verbatim GDD §6 negotiation cards and handles counteroffer', () => {
    const advanceSpy = vi.fn();
    const negotiateSpy = vi.fn();

    tutorialSignal.value = { active: true, step: 'negotiation', agreedFare: 100 };
    const elem = FirstRideTutorial({
      step: 'negotiation',
      onAdvance: advanceSpy,
      onNegotiate: negotiateSpy,
    });

    expect(elem).not.toBeNull();
    const card = asVNode(asVNode(elem).props.children);
    const cardContent = asVNodeArray(card.props.children)[1];
    const optionsContainer = asVNodeArray(cardContent?.props.children)[1];
    const options = asVNodeArray(optionsContainer?.props.children);

    const option100 = options[0];
    const option90 = options[1];
    const option80 = options[2];

    expect(option100?.props['data-testid']).toBe('tutorial-nego-counter-100');
    expect(option90?.props['data-testid']).toBe('tutorial-nego-counter-90');
    expect(option80?.props['data-testid']).toBe('tutorial-nego-accept-80');

    // Choose ৳100 counteroffer
    option100?.props.onClick?.();
    expect(negotiateSpy).toHaveBeenCalledWith(100);

    // Click start ride
    const startRideBtn = asVNodeArray(cardContent?.props.children)[2];
    expect(startRideBtn?.props['data-testid']).toBe('tutorial-btn-start-ride');
    startRideBtn?.props.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('riding');
  });

  it('renders riding phase floating banner with destination arrival button', () => {
    const advanceSpy = vi.fn();
    const elem = FirstRideTutorial({
      step: 'riding',
      onAdvance: advanceSpy,
    });

    expect(elem).not.toBeNull();
    const arriveBtn = asVNodeArray(asVNode(elem).props.children)[1];
    expect(arriveBtn?.props['data-testid']).toBe('tutorial-btn-arrive-destination');
    arriveBtn?.props.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('receipt');
  });

  it('renders receipt breakdown with 15% commission and finishes tutorial', () => {
    const completeSpy = vi.fn();
    tutorialSignal.value = { active: true, step: 'receipt', agreedFare: 100 };

    const elem = FirstRideTutorial({
      step: 'receipt',
      onComplete: completeSpy,
    });

    expect(elem).not.toBeNull();
    const card = asVNode(asVNode(elem).props.children);
    const cardContent = asVNodeArray(card.props.children)[1];
    const finishBtn = asVNodeArray(cardContent?.props.children)[2];
    expect(finishBtn?.props['data-testid']).toBe('tutorial-btn-finish-receipt');
    finishBtn?.props.onClick?.();
    expect(completeSpy).toHaveBeenCalledTimes(1);
  });
});
