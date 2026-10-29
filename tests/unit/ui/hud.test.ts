import { describe, it, expect, beforeEach } from 'vitest';
import { Hud, type HudState } from '../../../src/ui/hud/Hud';
import { t, setLanguage } from '../../../src/ui/i18n';

describe('T2.8 Rider HUD v1', () => {
  beforeEach(() => {
    setLanguage('bn');
  });

  it('initializes Hud with default state', () => {
    // In node environment, document is mocked or not present
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

    setLanguage('en');
    expect(t('hud.objective')).toBe('Objective');
    expect(t('hud.speed_unit')).toBe('KM / H');
    expect(t('hud.fuel')).toBe('Fuel');
    expect(t('hud.earnings', { amount: 250 })).toBe("Today's Net: ৳250");
  });
});
