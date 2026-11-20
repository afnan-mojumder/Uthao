import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { VNode } from 'preact';
import { ChoiceCardView } from '../../../src/ui/choice/ChoiceCard';
import {
  bindEventBusToStore,
  choiceSignal,
  dismissChoiceOutcome,
  encounterCueSignal,
  exitToTitle,
} from '../../../src/ui/store';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { setLanguage, t } from '../../../src/ui/i18n';

function collectText(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node));
  } else if (Array.isArray(node)) {
    for (const child of node) collectText(child, out);
  } else if (node && typeof node === 'object') {
    const v = node as VNode<Record<string, unknown>>;
    if (typeof v.type === 'function') {
      collectText((v.type as (p: unknown) => unknown)(v.props ?? {}), out);
    } else {
      collectText(v.props?.children, out);
    }
  }
  return out;
}

function collectTestIds(node: unknown, out: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) {
    for (const child of node) collectTestIds(child, out);
  } else if (node && typeof node === 'object') {
    const v = node as VNode<Record<string, unknown>>;
    const props = v.props ?? {};
    if (typeof props['data-testid'] === 'string') out.add(props['data-testid']);
    if (typeof v.type === 'function') {
      collectTestIds((v.type as (p: unknown) => unknown)(props), out);
    } else {
      collectTestIds(props.children, out);
    }
  }
  return out;
}

describe('P4.4 ChoiceCard metadata, outcome feedback, and encounter cues', () => {
  let bus: EventBus<GameEvents>;
  let unbind: () => void;

  beforeEach(() => {
    setLanguage('en');
    bus = new EventBus<GameEvents>();
    unbind = bindEventBusToStore(bus);
  });

  afterEach(() => {
    unbind();
    dismissChoiceOutcome();
    exitToTitle();
  });

  it('renders riskKey, costHint, and kind badges in both en and bn locales', () => {
    bus.emit('encounter/started', {
      instance: {
        id: 'inst_pol_1',
        encounterId: 'enc_police_signal_stop',
        lineKey: 'encounter.police_stop.title',
        choices: [
          {
            id: 'pay_fine',
            labelKey: 'encounter.police_stop.choice.pay_fine',
            kind: 'official',
            costHint: 400,
          },
          {
            id: 'offer_bribe',
            labelKey: 'encounter.police_stop.choice.offer_bribe',
            kind: 'illicit',
            costHint: 150,
            riskKey: 'encounter.police_stop.risk.bribe',
          },
        ],
      },
    });

    setLanguage('en');
    const enVnode = ChoiceCardView({ choice: choiceSignal.value });
    const enText = collectText(enVnode).join(' ');
    expect(enText).toContain(t('encounter.kind.official'));
    expect(enText).toContain(t('encounter.kind.illicit'));
    expect(enText).toContain('৳400');
    expect(enText).toContain(t('encounter.police_stop.risk.bribe'));

    setLanguage('bn');
    const bnVnode = ChoiceCardView({ choice: choiceSignal.value });
    const bnText = collectText(bnVnode).join(' ');
    expect(bnText).toContain(t('encounter.kind.official'));
    expect(bnText).toContain(t('encounter.kind.illicit'));
    expect(bnText).toContain('৳৪০০');
    expect(bnText).toContain(t('encounter.police_stop.risk.bribe'));
  });

  it('shows outcome feedback screen when encounter/resolved has outcomeLineKey and dismisses cleanly', () => {
    bus.emit('encounter/started', {
      instance: {
        id: 'inst_pol_2',
        encounterId: 'enc_police_signal_stop',
        lineKey: 'encounter.police_stop.title',
        choices: [
          {
            id: 'offer_bribe',
            labelKey: 'encounter.police_stop.choice.offer_bribe',
            kind: 'illicit',
            costHint: 150,
          },
        ],
      },
    });

    bus.emit('encounter/resolved', {
      instanceId: 'inst_pol_2',
      choiceId: 'offer_bribe',
      encounterId: 'enc_police_signal_stop',
      outcomeLineKey: 'encounter.police_stop.outcome.bribe_rejected',
    });

    expect(choiceSignal.value.active).toBe(true);
    expect(choiceSignal.value.outcomeLineKey).toBe('encounter.police_stop.outcome.bribe_rejected');

    const vnode = ChoiceCardView({ choice: choiceSignal.value });
    const ids = collectTestIds(vnode);
    expect(ids.has('choice-outcome-text')).toBe(true);
    expect(ids.has('choice-outcome-continue')).toBe(true);

    const text = collectText(vnode).join(' ');
    expect(text).toContain(t('encounter.police_stop.outcome.bribe_rejected'));
    expect(text).toContain(t('ui.continue'));

    dismissChoiceOutcome();
    expect(choiceSignal.value.active).toBe(false);
    expect(choiceSignal.value.outcomeLineKey).toBeUndefined();
  });

  it('closes immediately when encounter/resolved has no outcomeLineKey', () => {
    bus.emit('encounter/started', {
      instance: {
        id: 'inst_simple',
        encounterId: 'enc_friend_package',
        lineKey: 'encounter.friend_package.title',
        choices: [{ id: 'accept', labelKey: 'encounter.friend_package.choice.accept' }],
      },
    });
    expect(choiceSignal.value.active).toBe(true);

    bus.emit('encounter/resolved', {
      instanceId: 'inst_simple',
      choiceId: 'accept',
      encounterId: 'enc_friend_package',
    });
    expect(choiceSignal.value.active).toBe(false);
  });

  it('surfaces encounter/cue in encounterCueSignal and clears on encounter/started and exitToTitle', () => {
    bus.emit('encounter/cue', {
      encounterId: 'enc_dark_alley_blockage',
      cueKey: 'encounter.crime.dark_alley.cue',
      fireAtMinute: 1204,
    });
    expect(encounterCueSignal.value.cueKey).toBe('encounter.crime.dark_alley.cue');

    bus.emit('encounter/started', {
      instance: {
        id: 'inst_dark',
        encounterId: 'enc_dark_alley_blockage',
        lineKey: 'encounter.crime.dark_alley.title',
        choices: [{ id: 'comply', labelKey: 'encounter.crime.choice.comply' }],
      },
    });
    expect(encounterCueSignal.value.cueKey).toBeNull();

    bus.emit('encounter/cue', {
      encounterId: 'enc_robbery_attempt',
      cueKey: 'encounter.crime.robbery_attempt.cue',
      fireAtMinute: 1324,
    });
    expect(encounterCueSignal.value.cueKey).toBe('encounter.crime.robbery_attempt.cue');

    exitToTitle();
    expect(encounterCueSignal.value.cueKey).toBeNull();
  });
});
