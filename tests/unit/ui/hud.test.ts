import { describe, it, expect, beforeEach } from 'vitest';
import { Hud, HudView, type HudState } from '../../../src/ui/hud/Hud';
import { ChoiceCardView } from '../../../src/ui/choice/ChoiceCard';
import { choiceSignal } from '../../../src/ui/store';
import { t, setLanguage } from '../../../src/ui/i18n';

describe('T2.8 & T4.10 Rider HUD and Mobile Polish', () => {
  beforeEach(() => {
    setLanguage('bn');
    choiceSignal.value = {
      active: false,
      prompt: '',
      options: [],
    };
  });

  it('initializes Hud with default state', () => {
    const hud = new Hud({ appendChild: () => {}, removeChild: () => {} } as unknown as HTMLElement);
    const state = hud.getState();

    expect(state.speedKmh).toBe(0);
    expect(state.fuelL).toBe(6.0);
    expect(state.fuelMaxL).toBe(8.0);
    expect(state.objectiveText).toBe('Waiting for ride requests...');
    expect(state.todayNetEarnings).toBe(0);
    expect(state.shiftClock).toBe('07:30');
    expect(state.rating).toBe(5.0);
    expect(state.isFirstPerson).toBe(false);
  });

  it('updates state with speed, fuel, earnings, and navigation instructions', () => {
    const hud = new Hud({ appendChild: () => {}, removeChild: () => {} } as unknown as HTMLElement);

    const updatePayload: Partial<HudState> = {
      speedKmh: 42.5,
      fuelL: 4.8,
      objectiveText: 'Drop off passenger at N2',
      todayNetEarnings: 350,
      shiftClock: '09:15',
      shiftDay: 2,
      rating: 4.85,
      nextTurn: { direction: 'right', text: 'Turn right into alley' },
      passengerStatus: {
        status: 'OnTrip',
        name: 'Salam Bhai',
      },
    };

    hud.update(updatePayload);
    const state = hud.getState();

    expect(state.speedKmh).toBe(42.5);
    expect(state.fuelL).toBe(4.8);
    expect(state.todayNetEarnings).toBe(350);
    expect(state.shiftClock).toBe('09:15');
    expect(state.shiftDay).toBe(2);
    expect(state.rating).toBe(4.85);
    expect(state.nextTurn?.direction).toBe('right');
    expect(state.passengerStatus?.name).toBe('Salam Bhai');
  });

  it('toggles isFirstPerson collapsed mode state', () => {
    const hud = new Hud({ appendChild: () => {}, removeChild: () => {} } as unknown as HTMLElement);
    expect(hud.getState().isFirstPerson).toBe(false);

    hud.update({ isFirstPerson: true });
    expect(hud.getState().isFirstPerson).toBe(true);

    hud.update({ isFirstPerson: false });
    expect(hud.getState().isFirstPerson).toBe(false);
  });

  it('provides bilingual HUD translations for keys', () => {
    setLanguage('bn');
    expect(t('hud.objective')).toBe('উদ্দেশ্য');
    expect(t('hud.speed_unit')).toBe('কিমি/ঘণ্টা');
    expect(t('hud.fuel')).toBe('জ্বালানি');
    expect(t('hud.earnings', { amount: 250 })).toBe('আজকের আয়: ৳250');
    expect(t('hud.fullscreen')).toBe('পূর্ণপর্দা');

    setLanguage('en');
    expect(t('hud.objective')).toBe('Objective');
    expect(t('hud.speed_unit')).toBe('KM / H');
    expect(t('hud.fuel')).toBe('Fuel');
    expect(t('hud.earnings', { amount: 250 })).toBe("Today's Net: ৳250");
    expect(t('hud.fullscreen')).toBe('Fullscreen');
  });

  it('T4.10: applies safe-area insets to standard HudView', () => {
    const vnode = HudView({
      state: {
        speedKmh: 30,
        fuelL: 5.5,
        fuelMaxL: 8.0,
        objectiveText: 'Head to Fulgate',
        todayNetEarnings: 200,
        shiftClock: '08:00',
        shiftDay: 1,
        rating: 5.0,
      },
    });

    expect(vnode).not.toBeNull();
    const style = vnode.props.style as Record<string, unknown>;
    expect(style.padding).toContain('env(safe-area-inset-top, 0px)');
    expect(style.padding).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it('T4.10: applies safe-area insets to first-person HudView', () => {
    const vnode = HudView({
      state: {
        speedKmh: 30,
        fuelL: 5.5,
        fuelMaxL: 8.0,
        objectiveText: 'Head to Fulgate',
        todayNetEarnings: 200,
        shiftClock: '08:00',
        shiftDay: 1,
        rating: 5.0,
        isFirstPerson: true,
      },
    });

    expect(vnode).not.toBeNull();
    const style = vnode.props.style as Record<string, unknown>;
    expect(style.padding).toContain('env(safe-area-inset-top, 0px)');
    expect(style.padding).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it('T4.10: ChoiceCard satisfies safe area and thumb clearance constraints', () => {
    choiceSignal.value = {
      active: true,
      instanceId: 'event-1',
      prompt: 'Narrow road blocked by cattle truck',
      options: [
        { id: 'short', text: 'Take footpath shortcut' },
        { id: 'wait', text: 'Wait for clearance' },
      ],
    };

    const vnode = ChoiceCardView({ choice: choiceSignal.value, onChoose: () => {} });
    expect(vnode).not.toBeNull();
    const style = vnode?.props.style as Record<string, unknown>;
    expect(style.top).toContain('env(safe-area-inset-top, 0px)');
    expect(style.maxHeight).toBe('calc(100vh - 180px)');
  });
});
