import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VNode } from 'preact';
import {
  ChoiceCardView,
  handleChoiceCardKeyDown,
} from '../../../src/ui/choice/ChoiceCard';
import {
  bindEventBusToStore,
  choiceSignal,
  chooseChoiceOption,
  dayEndSignal,
  dismissChoiceOutcome,
  encounterCueSignal,
  endingSignal,
  exitToTitle,
  saveSlotsSignal,
  screenSignal,
} from '../../../src/ui/store';
import { startGamepadNav } from '../../../src/ui/gamepadNav';
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

  it('clears choiceSignal and encounterCueSignal on day/ended, day/started, state/restored, and encounter/cueCleared', () => {
    vi.useFakeTimers();
    screenSignal.value = 'game';
    dayEndSignal.value = { active: false, summary: null };
    endingSignal.value = { active: false, result: null, choices: undefined };

    bus.emit('encounter/cue', {
      encounterId: 'enc_dark_alley_blockage',
      cueKey: 'encounter.crime.dark_alley.cue',
      fireAtMinute: 1204,
    });
    expect(encounterCueSignal.value.cueKey).toBe('encounter.crime.dark_alley.cue');

    // encounter/cueCleared immediately clears cue banner
    (bus as unknown as { emit: (k: string, p: { encounterId: string }) => void }).emit(
      'encounter/cueCleared',
      { encounterId: 'enc_dark_alley_blockage' }
    );
    expect(encounterCueSignal.value.cueKey).toBeNull();

    // day/ended clears active choiceSignal (including dispute/outcome) and encounterCueSignal
    bus.emit('encounter/cue', {
      encounterId: 'enc_robbery_attempt',
      cueKey: 'encounter.crime.robbery_attempt.cue',
      fireAtMinute: 1324,
    });
    bus.emit('encounter/started', {
      instance: {
        id: 'inst_eod',
        encounterId: 'enc_friend_package',
        lineKey: 'encounter.friend_package.title',
        choices: [{ id: 'accept', labelKey: 'encounter.friend_package.choice.accept' }],
      },
    });
    expect(choiceSignal.value.active).toBe(true);

    bus.emit('day/ended', { day: 1, summary: {} as never });
    expect(choiceSignal.value.active).toBe(false);
    expect(encounterCueSignal.value.cueKey).toBeNull();

    // day/started clears any stale choiceSignal and cue
    choiceSignal.value = {
      active: true,
      prompt: 'encounter.dispute.body',
      options: [],
      instanceId: 'dispute:req_1',
      outcomeLineKey: 'encounter.police_stop.outcome.bribe_rejected',
    };
    encounterCueSignal.value = { cueKey: 'encounter.crime.dark_alley.cue', encounterId: 'enc_dark', seq: 2 };
    bus.emit('day/started', { day: 2 });
    expect(choiceSignal.value.active).toBe(false);
    expect(choiceSignal.value.outcomeLineKey).toBeUndefined();
    expect(encounterCueSignal.value.cueKey).toBeNull();

    // state/restored clears any stale choiceSignal and cue
    choiceSignal.value = {
      active: true,
      prompt: 'encounter.police_stop.title',
      options: [{ id: 'pay_fine', text: 'encounter.police_stop.choice.pay_fine' }],
      instanceId: 'inst_restore',
    };
    encounterCueSignal.value = { cueKey: 'encounter.crime.dark_alley.cue', encounterId: 'enc_dark', seq: 3 };
    bus.emit('state/restored', {});
    expect(choiceSignal.value.active).toBe(false);
    expect(encounterCueSignal.value.cueKey).toBeNull();
    vi.useRealTimers();
  });

  it('ignores ChoiceCard keyboard events behind DayEnd, Ending, SaveSlots, or non-game screens', () => {
    const onChoose = vi.fn();
    const onDismiss = vi.fn();

    const activeChoice = {
      active: true,
      prompt: 'encounter.friend_package.title',
      options: [{ id: 'accept', text: 'encounter.friend_package.choice.accept' }],
      instanceId: 'inst_key_guard',
    };
    const outcomeChoice = {
      active: true,
      prompt: 'encounter.police_stop.title',
      options: [],
      instanceId: 'inst_key_guard_out',
      outcomeLineKey: 'encounter.police_stop.outcome.bribe_accepted',
    };
    const makeKeyEv = (key: string) =>
      ({ key, preventDefault: vi.fn() }) as unknown as KeyboardEvent;

    // Behind DayEnd -> ignored
    screenSignal.value = 'game';
    dayEndSignal.value = { active: true, summary: {} as never };
    endingSignal.value = { active: false, result: null, choices: undefined };
    saveSlotsSignal.value = { isOpen: false, mode: 'save' };
    handleChoiceCardKeyDown(makeKeyEv('1'), activeChoice, onChoose, onDismiss);
    handleChoiceCardKeyDown(makeKeyEv('Enter'), outcomeChoice, onChoose, onDismiss);
    expect(onChoose).not.toHaveBeenCalled();
    expect(onDismiss).not.toHaveBeenCalled();

    // Behind Ending -> ignored
    dayEndSignal.value = { active: false, summary: null };
    endingSignal.value = { active: true, result: {} as never, choices: undefined };
    handleChoiceCardKeyDown(makeKeyEv('1'), activeChoice, onChoose, onDismiss);
    expect(onChoose).not.toHaveBeenCalled();

    // Behind SaveSlots -> ignored
    endingSignal.value = { active: false, result: null, choices: undefined };
    saveSlotsSignal.value = { isOpen: true, mode: 'save' };
    handleChoiceCardKeyDown(makeKeyEv('1'), activeChoice, onChoose, onDismiss);
    expect(onChoose).not.toHaveBeenCalled();

    // Non-game screen (e.g. 'title' or 'pause') -> ignored
    saveSlotsSignal.value = { isOpen: false, mode: 'save' };
    screenSignal.value = 'pause';
    handleChoiceCardKeyDown(makeKeyEv('1'), activeChoice, onChoose, onDismiss);
    expect(onChoose).not.toHaveBeenCalled();

    // Active game screen with no blocking modal -> works!
    screenSignal.value = 'game';
    handleChoiceCardKeyDown(makeKeyEv('1'), activeChoice, onChoose, onDismiss);
    expect(onChoose).toHaveBeenCalledWith('accept', 'inst_key_guard');
    handleChoiceCardKeyDown(makeKeyEv('Enter'), outcomeChoice, onChoose, onDismiss);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('dismisses ChoiceCard outcome screen via chooseChoiceOption(0) and gamepad confirm/back', () => {
    bus.emit('encounter/started', {
      instance: {
        id: 'inst_gp_1',
        encounterId: 'enc_police_signal_stop',
        lineKey: 'encounter.police_stop.title',
        choices: [
          {
            id: 'offer_bribe',
            labelKey: 'encounter.police_stop.choice.offer_bribe',
            kind: 'illicit',
          },
        ],
      },
    });
    bus.emit('encounter/resolved', {
      instanceId: 'inst_gp_1',
      choiceId: 'offer_bribe',
      encounterId: 'enc_police_signal_stop',
      outcomeLineKey: 'encounter.police_stop.outcome.bribe_accepted',
    });

    expect(choiceSignal.value.active).toBe(true);
    expect(choiceSignal.value.outcomeLineKey).toBe('encounter.police_stop.outcome.bribe_accepted');

    // chooseChoiceOption(0) dismisses outcome screen cleanly; non-0 indices do not
    expect(chooseChoiceOption(1)).toBe(false);
    expect(choiceSignal.value.active).toBe(true);
    expect(chooseChoiceOption(0)).toBe(true);
    expect(choiceSignal.value.active).toBe(false);
    expect(choiceSignal.value.outcomeLineKey).toBeUndefined();

    // Gamepad BTN_CONFIRM (button 0 = A) via startGamepadNav dismisses outcome screen
    screenSignal.value = 'game';
    dayEndSignal.value = { active: false, summary: null };
    endingSignal.value = { active: false, result: null, choices: undefined };
    saveSlotsSignal.value = { isOpen: false, mode: 'save' };

    bus.emit('encounter/started', {
      instance: {
        id: 'inst_gp_2',
        encounterId: 'enc_police_signal_stop',
        lineKey: 'encounter.police_stop.title',
        choices: [{ id: 'offer_bribe', labelKey: 'encounter.police_stop.choice.offer_bribe' }],
      },
    });
    bus.emit('encounter/resolved', {
      instanceId: 'inst_gp_2',
      choiceId: 'offer_bribe',
      encounterId: 'enc_police_signal_stop',
      outcomeLineKey: 'encounter.police_stop.outcome.bribe_rejected',
    });
    expect(choiceSignal.value.active).toBe(true);

    let pressedA = false;
    let rafCb: FrameRequestCallback | null = null;
    vi.stubGlobal('window', {
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    });
    vi.stubGlobal('navigator', {
      getGamepads: () => [
        {
          axes: [0, 0],
          buttons: Array.from({ length: 16 }, (_, i) => ({
            pressed: i === 0 && pressedA,
            value: i === 0 && pressedA ? 1 : 0,
          })),
        },
      ],
    });
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      rafCb = cb;
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});

    const stop = startGamepadNav(() => false);
    // Frame 1: idle
    rafCb!(0);
    expect(choiceSignal.value.active).toBe(true);
    // Frame 2: press A (BTN_CONFIRM)
    pressedA = true;
    rafCb!(16);
    expect(choiceSignal.value.active).toBe(false);
    expect(choiceSignal.value.outcomeLineKey).toBeUndefined();

    stop();
    vi.unstubAllGlobals();
  });
});
