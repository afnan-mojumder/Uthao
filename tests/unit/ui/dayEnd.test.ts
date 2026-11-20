import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  dayEndSignal,
  setDayEndDispatchers,
  onSleepCallback,
  onDelayRentCallback,
  onAskAdvanceCallback,
  onDepositSavingsCallback,
  onWithdrawSavingsCallback,
  onRepayDebtCallback,
} from '../../../src/ui/store';
import { DayEnd } from '../../../src/ui/menus/DayEnd';
import { t, setLanguage } from '../../../src/ui/i18n';
import type { DaySummary } from '../../../src/core/types';

describe('T4.1 Day End Screen & Store', () => {
  const mockSummary: DaySummary = {
    day: 7,
    revenue: 1200,
    expenses: 4180,
    net: -2980,
    ratingDelta: 0.05,
    completedRides: 8,
    relationshipsDelta: { mintu: 2 },
    breakdown: {
      food: 150,
      phoneData: 30,
      rent: 4000,
    },
    livingExpenses: {
      food: 150,
      phoneData: 30,
      rent: 4000,
      family: 0,
      total: 4180,
      rentDelayed: true,
    },
    cash: 120,
    debt: 2980,
  };

  beforeEach(() => {
    dayEndSignal.value = {
      active: false,
      summary: null,
    };
    setLanguage('bn');
  });

  it('updates dayEndSignal on day ended', () => {
    expect(dayEndSignal.value.active).toBe(false);
    expect(dayEndSignal.value.summary).toBeNull();

    dayEndSignal.value = {
      active: true,
      summary: mockSummary,
    };

    expect(dayEndSignal.value.active).toBe(true);
    expect(dayEndSignal.value.summary?.day).toBe(7);
    expect(dayEndSignal.value.summary?.revenue).toBe(1200);
    expect(dayEndSignal.value.summary?.net).toBe(-2980);
  });

  it('dispatches day end actions: sleep, delayRent, askAdvance', () => {
    const mockSleep = vi.fn();
    const mockDelayRent = vi.fn();
    const mockAskAdvance = vi.fn();

    setDayEndDispatchers(mockSleep, mockDelayRent, mockAskAdvance);

    onSleepCallback?.();
    expect(mockSleep).toHaveBeenCalledTimes(1);

    onDelayRentCallback?.();
    expect(mockDelayRent).toHaveBeenCalledTimes(1);

    onAskAdvanceCallback?.('char_mintu', 500);
    expect(mockAskAdvance).toHaveBeenCalledWith('char_mintu', 500);
  });

  it('provides bilingual DayEnd strings in English and Bengali', () => {
    setLanguage('bn');
    expect(t('dayend.title')).toBe('দিনের সমাপ্তি');
    expect(t('dayend.revenue')).toBe('মোট আয়');
    expect(t('dayend.btn_sleep')).toBe('ঘুমিয়ে পড়ুন ও পরবর্তী দিন শুরু করুন');

    setLanguage('en');
    expect(t('dayend.title')).toBe('Day Complete');
    expect(t('dayend.revenue')).toBe('Total Revenue');
    expect(t('dayend.btn_sleep')).toBe('Sleep & Start Next Day');
  });

  it('renders DayEnd vnode tree with summary data and action buttons', () => {
    // When summary is null, returns null
    expect(DayEnd({ summary: null })).toBeNull();

    const onSleep = vi.fn();
    const onDelayRent = vi.fn();
    const onAskAdvance = vi.fn();

    const vnode = DayEnd({
      summary: mockSummary,
      onSleep,
      onDelayRent,
      onAskAdvance,
    });

    expect(vnode).not.toBeNull();
    expect(vnode?.props['data-testid']).toBe('day-end-screen');
  });

  it('dispatches P4.2 savings deposit/withdraw and debt repayment callbacks and bilingual strings', () => {
    const mockSleep = vi.fn();
    const mockDelayRent = vi.fn();
    const mockAskAdvance = vi.fn();
    const mockDeposit = vi.fn();
    const mockWithdraw = vi.fn();
    const mockRepayDebt = vi.fn();

    setDayEndDispatchers(
      mockSleep,
      mockDelayRent,
      mockAskAdvance,
      mockDeposit,
      mockWithdraw,
      mockRepayDebt
    );

    onDepositSavingsCallback?.(100);
    onWithdrawSavingsCallback?.(100);
    onRepayDebtCallback?.(250);

    expect(mockDeposit).toHaveBeenCalledWith(100);
    expect(mockWithdraw).toHaveBeenCalledWith(100);
    expect(mockRepayDebt).toHaveBeenCalledWith(250);

    setLanguage('en');
    expect(t('dayend.savings')).toBe('Savings');
    setLanguage('bn');
    expect(t('dayend.savings')).toBe('সঞ্চয়');

    const vnode = DayEnd({
      summary: { ...mockSummary, cash: 500, savings: 300, debt: 200 },
      onSleep: mockSleep,
      onDelayRent: mockDelayRent,
      onAskAdvance: mockAskAdvance,
      onDepositSavings: mockDeposit,
      onWithdrawSavings: mockWithdraw,
      onRepayDebt: mockRepayDebt,
    });
    expect(JSON.stringify(vnode)).toContain('day-end-savings');
    expect(JSON.stringify(vnode)).toContain('day-end-deposit-savings-btn');
    expect(JSON.stringify(vnode)).toContain('day-end-withdraw-savings-btn');
    expect(JSON.stringify(vnode)).toContain('day-end-repay-debt-btn');
  });
});
