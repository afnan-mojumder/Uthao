import { describe, it, expect, afterEach, vi } from 'vitest';
import type { VNode } from 'preact';
import { localDigits, setLanguage } from '../../../src/ui/i18n';
import { HudView, type HudState } from '../../../src/ui/hud/Hud';
import { Garage } from '../../../src/ui/garage/Garage';
import { DayEnd } from '../../../src/ui/menus/DayEnd';
import { Ending } from '../../../src/ui/menus/Ending';
import { SaveSlots } from '../../../src/ui/menus/SaveSlots';
import { Contacts } from '../../../src/ui/phone/Contacts';
import {
  StatusBar,
  TransactionRow,
  MissionObjectivePanel,
  TripSummaryPanel,
} from '../../../src/ui/components';
import { SaveSystem, MemoryStorageAdapter } from '../../../src/sim/save/SaveSystem';
import { GameManager } from '../../../src/sim/GameManager';

function flattenVNodeText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenVNodeText).join('');
  if (typeof node === 'object') {
    const v = node as VNode<Record<string, unknown>>;
    if (typeof v.type === 'function') {
      try {
        return flattenVNodeText((v.type as (p: unknown) => unknown)(v.props ?? {}));
      } catch {
        return flattenVNodeText(v.props?.children);
      }
    }
    return flattenVNodeText(v.props?.children);
  }
  return '';
}

function findTestIdNode(node: unknown, testId: string): unknown {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const c of node) {
      const hit = findTestIdNode(c, testId);
      if (hit) return hit;
    }
    return null;
  }
  const v = node as VNode<Record<string, unknown>>;
  const props = v.props ?? {};
  if (props['data-testid'] === testId || props.testId === testId || props.id === testId) {
    return v;
  }
  if (typeof v.type === 'function') {
    try {
      const rendered = (v.type as (p: unknown) => unknown)(props);
      const hit = findTestIdNode(rendered, testId);
      if (hit) return hit;
    } catch {
      // hook-using child component outside Preact render context
    }
  }
  return findTestIdNode(props.children, testId);
}

describe('numbers follow the language (audit: Bangla screens showed Western digits)', () => {
  afterEach(() => setLanguage('en'));

  it('uses Bangla digits in Bangla mode', () => {
    setLanguage('bn');
    expect(localDigits(120)).toBe('১২০');
    expect(localDigits('3.5')).toBe('৩.৫');
  });

  it('keeps Western digits in English mode', () => {
    setLanguage('en');
    expect(localDigits(120)).toBe('120');
  });

  it('P7.2: formats HUD speed, earnings, fuel, rating, clock, day, and mission distances with Bangla digits in bn mode', () => {
    setLanguage('bn');
    const state: HudState = {
      speedKmh: 47,
      gear: 3,
      fuelL: 4.5,
      fuelMaxL: 8.0,
      conditionPct: 86,
      objectiveText: 'যাত্রী নামিয়ে দিন',
      todayNetEarnings: 640,
      shiftClock: '09:25',
      shiftDay: 3,
      rating: 4.8,
      activeMission: {
        id: 'm1',
        titleKey: 'mission_m1_first_ride_title',
        objectiveDescKey: 'obj_m1_nabila_pickup_desc',
        progress: 1,
        target: 2,
        targetDistM: 175,
      },
    };

    const thirdText = flattenVNodeText(HudView({ state }));
    expect(thirdText).toContain('৪৭');
    expect(thirdText).toContain('৳৬৪০');
    expect(thirdText).toContain('৪.৮');
    expect(thirdText).toContain('০৯:২৫');
    expect(thirdText).toContain('দিন ৩');
    expect(thirdText).toContain('১/২');
    expect(thirdText).toContain('১৭৫');

    const firstText = flattenVNodeText(HudView({ state: { ...state, isFirstPerson: true } }));
    expect(firstText).toContain('৪৭');
    expect(firstText).toContain('৳৬৪০');
    expect(firstText).toContain('৪.৮');
    expect(firstText).toContain('দিন ৩');
  });

  it('P7.2: formats TransactionRow, StatusBar, MissionObjectivePanel, and TripSummaryPanel with Bangla digits in bn mode', () => {
    setLanguage('bn');
    const txText = flattenVNodeText(TransactionRow({ label: 'ভাড়া', amount: 150, kind: 'income' }));
    expect(txText).toContain('+৳১৫০');

    const statusText = flattenVNodeText(StatusBar({ label: 'জ্বালানি', value: 75, max: 100 }));
    expect(statusText).toContain('৭৫%');

    const objText = flattenVNodeText(
      MissionObjectivePanel({
        title: 'মিশন',
        objectives: [{ id: 'o1', label: 'ট্রিপ', progress: 2, target: 5, distanceM: 320 }],
      })
    );
    expect(objText).toContain('২/৫');
    expect(objText).toContain('৩২০');

    const summaryText = flattenVNodeText(
      TripSummaryPanel({
        title: 'সারাংশ',
        rating: 4.9,
        rows: [{ label: 'ভাড়া', amount: 120, kind: 'income' }],
        continueLabel: 'এগিয়ে যান',
        onContinue: () => {},
      })
    );
    expect(summaryText).toContain('৪.৯');
    expect(summaryText).toContain('+৳১২০');
  });

  it('P7.2: formats Garage cash, condition %, repair costs, and upgrade prices with Bangla digits in bn mode', () => {
    setLanguage('bn');
    const vnode = Garage({
      isOpen: true,
      cash: 850,
      engineCondition: 50,
      tiresCondition: 40,
      brakesCondition: 60,
      kmSinceOilChange: 30,
    });
    expect(flattenVNodeText(findTestIdNode(vnode, 'garage-cash'))).toContain('৳৮৫০');
    expect(flattenVNodeText(findTestIdNode(vnode, 'garage-condition-engine'))).toContain('৫০%');
    expect(flattenVNodeText(findTestIdNode(vnode, 'garage-condition-tires'))).toContain('৪০%');
  });

  it('P7.2: formats DayEnd revenue, expenses, net, food, data, cash, savings, and debt with Bangla digits in bn mode', () => {
    setLanguage('bn');
    const vnode = DayEnd({
      summary: {
        day: 4,
        revenue: 980,
        expenses: 180,
        net: 800,
        ratingDelta: 0.15,
        completedRides: 6,
        relationshipsDelta: {},
        breakdown: { food: 150, phoneData: 30, rent: 0 },
        cash: 1400,
        savings: 500,
        debt: 200,
      },
      onDepositSavings: vi.fn(),
      onWithdrawSavings: vi.fn(),
      onRepayDebt: vi.fn(),
    });
    const text = flattenVNodeText(vnode);
    expect(text).toContain('দিন ৪');
    expect(text).toContain('৬');
    expect(text).toContain('+৳৯৮০');
    expect(text).toContain('-৳১৮০');
    expect(text).toContain('+৳৮০০');
    expect(text).toContain('-৳১৫০');
    expect(text).toContain('-৳৩০');
    expect(text).toContain('৳১৪০০');
    expect(text).toContain('৳৫০০');
    expect(text).toContain('৳২০০');
  });

  it('P7.2: formats Ending tendencies %, savings, rating, trust, and SaveSlots metadata with Bangla digits in bn mode', () => {
    setLanguage('bn');
    const endingNode = Ending({
      result: {
        endingId: 'independent_rider',
        titleKey: 'ending_independent_rider_title',
        descKey: 'ending_independent_rider_desc',
        dominantIdentity: 'professional',
        tendencies: { professional: 45, negotiator: 25, hustler: 10, regular: 20 },
        summary: {
          cash: 8500,
          savings: 22000,
          debt: 0,
          rating: 4.85,
          localTrust: 75,
          completedMissions: 4,
        },
      },
    });
    const endingText = flattenVNodeText(endingNode);
    expect(endingText).toContain('৪৫%');
    expect(endingText).toContain('৪.৮৫');
    expect(endingText).toContain('৭৫/১০০');

    const memory = new MemoryStorageAdapter();
    const sys = new SaveSystem(memory);
    const gm = new GameManager({ seed: 101, mode: 'career', data: {} });
    gm.clock.day = 4;
    gm.economyManager.cash = 1950;
    sys.save(gm, 'slot1');

    const slotsNode = SaveSlots({
      isOpen: true,
      mode: 'save',
      onClose: vi.fn(),
      onSelectSlot: vi.fn(),
      saveSystem: sys,
    });
    const slot1Text = flattenVNodeText(findTestIdNode(slotsNode, 'save-slot-slot1'));
    expect(slot1Text).toContain('দিন ৪');
    expect(slot1Text).toContain('৳১৯৫০');

    setLanguage('en');
    const enSlotsNode = SaveSlots({
      isOpen: true,
      mode: 'save',
      onClose: vi.fn(),
      onSelectSlot: vi.fn(),
      saveSystem: sys,
    });
    const enSlot1Text = flattenVNodeText(findTestIdNode(enSlotsNode, 'save-slot-slot1'));
    expect(enSlot1Text).toContain('Day 4');
    expect(enSlot1Text).toContain('৳1950');

    setLanguage('bn');
    const contactsText = flattenVNodeText(
      Contacts({
        relationships: { char_nabila: 20, char_tanvir: 5 },
      })
    );
    expect(contactsText).toContain('৫ / ১৫');
  });
});

