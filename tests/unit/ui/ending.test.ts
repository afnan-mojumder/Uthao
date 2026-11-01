import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  endingSignal,
  setEndingDispatchers,
  onSelectCareerChoiceCallback,
  onRestartCareerCallback,
  onEnterEndlessCallback,
} from '../../../src/ui/store';
import { Ending } from '../../../src/ui/menus/Ending';
import { t, setLanguage } from '../../../src/ui/i18n';
import type { EndingResult, CareerChoiceOption } from '../../../src/sim/mission/endings';

describe('T5.5 Ending UI & Store Integration', () => {
  const mockResult: EndingResult = {
    endingId: 'independent_rider',
    titleKey: 'ending_independent_rider_title',
    descKey: 'ending_independent_rider_desc',
    dominantIdentity: 'professional',
    tendencies: {
      professional: 45,
      negotiator: 20,
      hustler: 15,
      regular: 20,
    },
    summary: {
      cash: 8500,
      savings: 22000,
      debt: 0,
      rating: 4.85,
      localTrust: 75,
      completedMissions: 4,
    },
  };

  const mockChoices: CareerChoiceOption[] = [
    {
      id: 'bike',
      titleKey: 'choice_bike_title',
      descKey: 'choice_bike_desc',
      cost: 15000,
      available: true,
    },
    {
      id: 'workshop',
      titleKey: 'choice_workshop_title',
      descKey: 'choice_workshop_desc',
      cost: 25000,
      available: false,
      disabledReason: '৳25,000 সঞ্চয় প্রয়োজন',
    },
  ];

  beforeEach(() => {
    endingSignal.value = {
      active: false,
      result: null,
      choices: undefined,
    };
    setLanguage('bn');
  });

  it('updates endingSignal correctly when an ending is reached', () => {
    expect(endingSignal.value.active).toBe(false);
    expect(endingSignal.value.result).toBeNull();

    endingSignal.value = {
      active: true,
      result: mockResult,
      choices: mockChoices,
    };

    expect(endingSignal.value.active).toBe(true);
    expect(endingSignal.value.result?.endingId).toBe('independent_rider');
    expect(endingSignal.value.choices).toHaveLength(2);
  });

  it('dispatches ending callbacks: selectCareerChoice, restartCareer, enterEndless', () => {
    const mockSelectChoice = vi.fn();
    const mockRestart = vi.fn();
    const mockEndless = vi.fn();

    setEndingDispatchers(mockSelectChoice, mockRestart, mockEndless);

    onSelectCareerChoiceCallback?.('bike');
    expect(mockSelectChoice).toHaveBeenCalledWith('bike');

    onRestartCareerCallback?.();
    expect(mockRestart).toHaveBeenCalledTimes(1);

    onEnterEndlessCallback?.();
    expect(mockEndless).toHaveBeenCalledTimes(1);
  });

  it('provides bilingual ending translations for all 5 endings', () => {
    const endings = [
      'independent_rider',
      'workshop_owner',
      'trusted_local',
      'fast_money',
      'fresh_start',
    ] as const;

    for (const id of endings) {
      setLanguage('en');
      expect(t(`ending_${id}_title`)).not.toBe(`ending_${id}_title`);
      expect(t(`ending_${id}_desc`)).not.toBe(`ending_${id}_desc`);

      setLanguage('bn');
      expect(t(`ending_${id}_title`)).not.toBe(`ending_${id}_title`);
      expect(t(`ending_${id}_desc`)).not.toBe(`ending_${id}_desc`);
    }
  });

  it('renders Ending component vnode tree with stats and choices', () => {
    const onSelectChoice = vi.fn();
    const onRestart = vi.fn();

    const vnode = Ending({
      result: mockResult,
      choices: mockChoices,
      onSelectChoice,
      onRestartCareer: onRestart,
    });

    expect(vnode).not.toBeNull();
    expect(vnode.props['data-testid']).toBe('ending-screen');
  });

  function findByTestId(node: unknown, testId: string): boolean {
    if (node == null || typeof node !== 'object') return false;
    const props = (node as { props?: Record<string, unknown> }).props;
    if (!props) return false;
    if (props['data-testid'] === testId) return true;
    const children = props.children;
    const list = Array.isArray(children) ? children : [children];
    return list.some((child) => findByTestId(child, testId));
  }

  it('shows the career-choice prototype notice when a paid choice is offered (career_choice is not yet wired to the live ending)', () => {
    const vnode = Ending({
      result: mockResult,
      choices: mockChoices, // includes workshop (cost 25000) and bike (cost 15000)
      onSelectChoice: vi.fn(),
    });

    expect(findByTestId(vnode, 'career-choice-prototype-notice')).toBe(true);
  });

  it('omits the prototype notice when every offered choice is free', () => {
    const freeOnly: CareerChoiceOption[] = [
      {
        id: 'continue',
        titleKey: 'choice_continue_title',
        descKey: 'choice_continue_desc',
        cost: 0,
        available: true,
      },
    ];

    const vnode = Ending({
      result: mockResult,
      choices: freeOnly,
      onSelectChoice: vi.fn(),
    });

    expect(findByTestId(vnode, 'career-choice-prototype-notice')).toBe(false);
  });
});
