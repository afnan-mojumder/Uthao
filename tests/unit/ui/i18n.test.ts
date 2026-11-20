import { describe, it, expect, beforeEach } from 'vitest';
import {
  t,
  setLanguage,
  getLanguage,
  getLocaleVersion,
  loadTranslations,
} from '../../../src/ui/i18n';
import { createHudCache, syncHudWithCache, type HudSyncInput } from '../../../src/ui/hud/hudSync';
import { hudSignal, resetHudState } from '../../../src/ui/store';

describe('T0.4 i18n & App Shell', () => {
  beforeEach(() => {
    setLanguage('bn');
  });

  it('translates existing keys in current language (bn)', () => {
    setLanguage('bn');
    expect(t('ui.paused')).toBe('বিরতি');
  });

  it('translates existing keys in english (en)', () => {
    setLanguage('en');
    expect(t('ui.paused')).toBe('Paused');
  });

  it('t falls back to en then key', () => {
    // Inject a key that only exists in 'en'
    loadTranslations('en', { 'test.only_in_english': 'Hello English' });

    setLanguage('bn');
    // Key missing in bn falls back to en
    expect(t('test.only_in_english')).toBe('Hello English');

    // Key missing in both bn and en falls back to the key string
    expect(t('unknown.missing_everywhere_key')).toBe('unknown.missing_everywhere_key');
  });

  it('interpolates template variables', () => {
    loadTranslations('bn', { 'fare.paid': '৳{amount} ভাড়া পাওয়া গেছে' });
    loadTranslations('en', { 'fare.paid': 'Received ৳{amount} fare' });

    setLanguage('bn');
    expect(t('fare.paid', { amount: 120 })).toBe('৳120 ভাড়া পাওয়া গেছে');

    setLanguage('en');
    expect(t('fare.paid', { amount: 120 })).toBe('Received ৳120 fare');
  });

  it('switches languages dynamically', () => {
    setLanguage('en');
    expect(getLanguage()).toBe('en');
    setLanguage('bn');
    expect(getLanguage()).toBe('bn');
  });

  it('invalidates HudSyncCache when localeVersion increments after async locale load', () => {
    resetHudState();
    setLanguage('en');
    const cache = createHudCache();
    const input: HudSyncInput = {
      now: 1000,
      simStepped: false,
      isFirstPerson: false,
      districtId: 'mirpara',
      canRecoverBike: true,
      gear: 1,
      objectiveKey: 'hud.test_async_locale_key',
      placeKey: '',
      navKind: '',
      navTextKey: '',
      navDistM: -1,
      reqId: '',
      passengerStatus: 'None',
      roadEventId: '',
      roadEventKind: '',
      activeMissionCount: 0,
      pollMissions: () => ({ main: null, side: [] }),
      fare: undefined,
      etaMinutes: undefined,
      nearStation: false,
      chargeSpot: null,
      todayNetEarnings: 0,
      shiftClock: '07:30',
      shiftDay: 1,
      rating: 5.0,
      dialogueSubtitle: null,
      speedKmh: 0,
      fuelL: 6.0,
      fuelMaxL: 8.0,
      conditionPct: 100,
    };

    // First sync before key is loaded caches raw fallback key
    syncHudWithCache(cache, input);
    expect(hudSignal.value.objectiveText).toBe('hud.test_async_locale_key');
    const v0 = getLocaleVersion();

    // Simulate async dictionary load completing for 'en'
    loadTranslations('en', { 'hud.test_async_locale_key': 'Loaded Async Objective' });
    expect(getLocaleVersion()).toBeGreaterThan(v0);

    // Next sync invalidates cache even though getLanguage() is still 'en'
    input.now = 1016;
    syncHudWithCache(cache, input);
    expect(hudSignal.value.objectiveText).toBe('Loaded Async Objective');
  });
});
