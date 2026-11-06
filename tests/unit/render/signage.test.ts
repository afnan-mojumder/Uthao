import { describe, it, expect, afterEach } from 'vitest';
import { SignageAtlas, setDefaultSignLanguage } from '../../../src/render/signage';

// Storefront signs follow the game language. Before this, every sign in the
// city was Bangla, even in English mode.
describe('storefront signs follow the language', () => {
  afterEach(() => setDefaultSignLanguage('bn'));

  it('an atlas built in English mode shows the English sign names', () => {
    setDefaultSignLanguage('en');

    const atlas = new SignageAtlas();

    expect(atlas.signs['sign.pharmacy']).toBe('Mayer Doa Pharmacy');
  });

  it('a live language change switches the sign names of an existing atlas', () => {
    const atlas = new SignageAtlas();
    expect(atlas.signs['sign.pharmacy']).not.toBe('Mayer Doa Pharmacy');

    atlas.setLanguage('en');

    expect(atlas.signs['sign.pharmacy']).toBe('Mayer Doa Pharmacy');
  });
});
