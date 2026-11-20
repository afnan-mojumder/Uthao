import fs from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { FirstRideTutorialView } from '../../../src/ui/tutorial/FirstRideTutorial';
import { tutorialSignal } from '../../../src/ui/store';
import { setLanguage } from '../../../src/ui/i18n';

interface VNodeLike {
  type?: unknown;
  props?: {
    children?: unknown;
    onClick?: () => void;
    [key: string]: unknown;
  };
}

function findByTestId(node: unknown, testId: string): VNodeLike | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const hit = findByTestId(child, testId);
      if (hit) return hit;
    }
    return null;
  }
  const vn = node as VNodeLike;
  if (vn.props?.['data-testid'] === testId || vn.props?.testId === testId) {
    return vn;
  }
  if (typeof vn.type === 'function') {
    const rendered = (vn.type as (p: unknown) => unknown)(vn.props ?? {});
    const hit = findByTestId(rendered, testId);
    if (hit) return hit;
  }
  if (vn.props?.children !== undefined) {
    return findByTestId(vn.props.children, testId);
  }
  return null;
}

function flattenText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (typeof node === 'object') {
    const vn = node as VNodeLike;
    if (typeof vn.type === 'function') {
      return flattenText((vn.type as (p: unknown) => unknown)(vn.props ?? {}));
    }
    return flattenText(vn.props?.children);
  }
  return '';
}

function renderView(
  step: NonNullable<Parameters<typeof FirstRideTutorialView>[0]['step']>,
  overrides: Partial<Parameters<typeof FirstRideTutorialView>[0]> = {}
) {
  return FirstRideTutorialView({
    step,
    selectedOffer: 100,
    agreedPrompt: '',
    onSelectOffer: vi.fn(),
    onSetAgreedPrompt: vi.fn(),
    ...overrides,
  });
}

describe('T3.8 FirstRideTutorial Component', () => {
  it('calls useState unconditionally without wrapping hooks in try/catch (P0.2 hook safety)', () => {
    const src = fs.readFileSync('src/ui/tutorial/FirstRideTutorial.tsx', 'utf-8');
    expect(src).not.toMatch(/try\s*\{[\s\S]*useState/);
  });

  it('renders nothing when tutorial is idle or completed', () => {
    expect(renderView('idle')).toBeNull();
    expect(renderView('completed')).toBeNull();
  });

  it('renders 07:00 alarm, handles dismiss and Skip Tutorial', () => {
    setLanguage('en');
    const advanceSpy = vi.fn();
    const skipSpy = vi.fn();
    const elem = renderView('alarm', { onAdvance: advanceSpy, onSkip: skipSpy });

    expect(elem).not.toBeNull();
    const btn = findByTestId(elem, 'tutorial-btn-alarm');
    expect(btn).not.toBeNull();
    btn?.props?.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('ma_reminder');

    const skipBtn = findByTestId(elem, 'tutorial-btn-skip');
    expect(skipBtn).not.toBeNull();
    skipBtn?.props?.onClick?.();
    expect(skipSpy).toHaveBeenCalledTimes(1);
  });

  it('renders Ma reminder, wallet check (live cash & rent), bike inspection (live fuel & condition), and tea stall', () => {
    setLanguage('en');
    const advanceSpy = vi.fn();

    const ma = renderView('ma_reminder', { onAdvance: advanceSpy });
    findByTestId(ma, 'tutorial-btn-ma')?.props?.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('wallet_check');

    const wallet = renderView('wallet_check', { cash: 725, rentTarget: 1200, onAdvance: advanceSpy });
    expect(flattenText(findByTestId(wallet, 'tutorial-wallet-cash'))).toContain('725');
    expect(flattenText(findByTestId(wallet, 'tutorial-wallet-rent'))).toContain('1200');
    findByTestId(wallet, 'tutorial-btn-wallet')?.props?.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('bike_inspection');

    const bike = renderView('bike_inspection', { fuelL: 2.4, conditionPct: 92, onAdvance: advanceSpy });
    expect(flattenText(findByTestId(bike, 'tutorial-bike-fuel'))).toContain('2.4');
    expect(flattenText(findByTestId(bike, 'tutorial-bike-condition'))).toContain('92%');
    findByTestId(bike, 'tutorial-btn-bike')?.props?.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('tea_stall');

    const tea = renderView('tea_stall', { onAdvance: advanceSpy });
    findByTestId(tea, 'tutorial-btn-tea-stall')?.props?.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('open_app');
  });

  it('renders incoming request from Nabila and handles negotiation & riding', () => {
    setLanguage('en');
    const advanceSpy = vi.fn();
    const negotiateSpy = vi.fn();
    const selectOfferSpy = vi.fn();

    const openApp = renderView('open_app', { onAdvance: advanceSpy });
    findByTestId(openApp, 'tutorial-btn-open-request')?.props?.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('negotiation');

    tutorialSignal.value = { active: true, step: 'negotiation', agreedFare: 100 };
    const neg = renderView('negotiation', {
      onAdvance: advanceSpy,
      onNegotiate: negotiateSpy,
      onSelectOffer: selectOfferSpy,
    });
    expect(findByTestId(neg, 'tutorial-nego-counter-100')).not.toBeNull();
    expect(findByTestId(neg, 'tutorial-nego-counter-90')).not.toBeNull();
    expect(findByTestId(neg, 'tutorial-nego-accept-80')).not.toBeNull();

    findByTestId(neg, 'tutorial-nego-counter-100')?.props?.onClick?.();
    expect(selectOfferSpy).toHaveBeenCalledWith(100);
    expect(negotiateSpy).toHaveBeenCalledWith(100);

    const agreedNeg = renderView('negotiation', {
      agreedPrompt: 'Agreed',
      onAdvance: advanceSpy,
    });
    findByTestId(agreedNeg, 'tutorial-btn-start-ride')?.props?.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('riding');

    const riding = renderView('riding', { onAdvance: advanceSpy });
    findByTestId(riding, 'tutorial-btn-arrive-destination')?.props?.onClick?.();
    expect(advanceSpy).toHaveBeenCalledWith('receipt');
  });

  it('renders receipt breakdown with live fuel cost and finishes tutorial', () => {
    setLanguage('en');
    const completeSpy = vi.fn();
    const receipt = {
      requestId: 'req_tutorial_01',
      fare: 100,
      tip: 0,
      commission: 15,
      fuelCost: 19,
      otherCosts: 0,
      bonus: 0,
      penalties: 0,
      compensation: 0,
      fuelLiters: 0.12,
      net: 66,
      durationMin: 3,
      distanceKm: 0.1,
      rating: 5,
      consequences: [],
    };
    const elem = renderView('receipt', { receipt, onComplete: completeSpy });
    const fuelRow = findByTestId(elem, 'tutorial-receipt-fuel');
    expect(fuelRow).not.toBeNull();
    expect(flattenText(fuelRow)).toContain('19');

    findByTestId(elem, 'tutorial-btn-finish-receipt')?.props?.onClick?.();
    expect(completeSpy).toHaveBeenCalledTimes(1);
  });
});
