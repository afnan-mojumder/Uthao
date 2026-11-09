import { describe, it, expect, afterEach } from 'vitest';
import { localDigits, setLanguage } from '../../../src/ui/i18n';

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
});
