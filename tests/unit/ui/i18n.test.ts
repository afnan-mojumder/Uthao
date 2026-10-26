import { describe, it, expect, beforeEach } from 'vitest';
import {
  t,
  setLanguage,
  getLanguage,
  loadTranslations,
} from '../../../src/ui/i18n';

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
});
