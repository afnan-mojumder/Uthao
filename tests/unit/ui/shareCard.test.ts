import { describe, it, expect, beforeEach } from 'vitest';
import { buildScorecardText, ShareCard } from '../../../src/ui/share/ShareCard';
import { DayEnd } from '../../../src/ui/menus/DayEnd';
import { Ending } from '../../../src/ui/menus/Ending';
import { setLanguage } from '../../../src/ui/i18n';
import type { DaySummary } from '../../../src/core/types';
import type { EndingResult } from '../../../src/sim/mission/endings';

describe('P6.2 ShareCard & DayEnd / Ending scorecard integration', () => {
  const sampleDay: DaySummary = {
    day: 4,
    revenue: 1120,
    expenses: 270,
    net: 850,
    ratingDelta: 0.15,
    completedRides: 9,
    relationshipsDelta: { char_mintu: 2 },
    savings: 3400,
    cash: 920,
    debt: 0,
  };

  const sampleEnding: EndingResult = {
    endingId: 'independent_rider',
    titleKey: 'ending_independent_rider_title',
    descKey: 'ending_independent_rider_desc',
    dominantIdentity: 'professional',
    tendencies: {
      professional: 45,
      negotiator: 25,
      hustler: 10,
      regular: 20,
    },
    summary: {
      cash: 8500,
      savings: 22000,
      debt: 0,
      rating: 4.9,
      localTrust: 78,
      completedMissions: 5,
    },
  };

  beforeEach(() => {
    setLanguage('en');
  });

  it('formats bilingual DaySummary scorecard text in EN and BN', () => {
    setLanguage('en');
    const enText = buildScorecardText({ summary: sampleDay });
    expect(enText).toContain('Uthao Dhaka Scorecard');
    expect(enText).toContain('Day 4');
    expect(enText).toContain('9');
    expect(enText).toContain('850');
    expect(enText).toContain('3400');

    setLanguage('bn');
    const bnText = buildScorecardText({ summary: sampleDay });
    expect(bnText).toContain('উঠাও ঢাকা স্কোরকার্ড');
    expect(bnText).toContain('৪');
    expect(bnText).toContain('৮৫০');
  });

  it('formats bilingual EndingResult scorecard text in EN and BN', () => {
    setLanguage('en');
    const enText = buildScorecardText({ ending: sampleEnding });
    expect(enText).toContain('Career Complete');
    expect(enText).toContain('22000');
    expect(enText).toContain('4.9');

    setLanguage('bn');
    const bnText = buildScorecardText({ ending: sampleEnding });
    expect(bnText).toContain('ক্যারিয়ার সমাপ্ত');
    expect(bnText).toContain('২২০০০');
    expect(bnText).toContain('৪.৯');
  });

  it('mounts ShareCard cleanly inside DayEnd and Ending', () => {
    const containsType = (node: unknown, target: unknown): boolean => {
      if (!node || typeof node !== 'object') return false;
      if (Array.isArray(node)) return node.some((c) => containsType(c, target));
      const vn = node as { type?: unknown; props?: { children?: unknown } };
      if (vn.type === target) return true;
      return containsType(vn.props?.children, target);
    };

    const dayVnode = DayEnd({ summary: sampleDay });
    expect(containsType(dayVnode, ShareCard)).toBe(true);

    const endingVnode = Ending({ result: sampleEnding });
    expect(containsType(endingVnode, ShareCard)).toBe(true);
  });
});
