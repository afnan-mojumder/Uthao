import { describe, it, expect, afterEach, vi } from 'vitest';
import { SignageAtlas, setDefaultSignLanguage } from '../../../src/render/signage';
import signsBn from '../../../data/dialogue/bn/signs.json';
import signsEn from '../../../data/dialogue/en/signs.json';

// Storefront signs follow the game language. Before this, every sign in the
// city was Bangla, even in English mode.
describe('storefront signs follow the language', () => {
  afterEach(() => {
    setDefaultSignLanguage('bn');
    vi.unstubAllGlobals();
  });

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

  it('applies sign UVs to the front face (+Z) only and collapses side/back faces', () => {
    const atlas = new SignageAtlas();
    const mesh = atlas.createSignboardMesh('sign.tea_stall', 3.6, 0.9, 0.08);
    const uv = mesh.geometry.getAttribute('uv')!;
    const expected = atlas.getUv('sign.tea_stall');

    // Front face (+Z, vertices 16..19) uses full sign UV rectangle
    expect(uv.getX(16)).toBeCloseTo(expected.uMin, 5);
    expect(uv.getX(17)).toBeCloseTo(expected.uMax, 5);
    expect(uv.getY(16)).toBeCloseTo(expected.vMax, 5);
    expect(uv.getY(18)).toBeCloseTo(expected.vMin, 5);

    // Side and back faces (0..15, 20..23) collapse to a single border point (zero UV area)
    const sideU = uv.getX(0);
    const sideV = uv.getY(0);
    for (let i = 0; i < 24; i++) {
      if (i >= 16 && i <= 19) continue;
      expect(uv.getX(i)).toBeCloseTo(sideU, 5);
      expect(uv.getY(i)).toBeCloseTo(sideV, 5);
    }
  });

  it('draws with Hind Siliguri font and waits for document.fonts.ready when available', async () => {
    const fillTextCalls: Array<{ text: string; font: string }> = [];
    const fakeCtx = {
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      textBaseline: 'alphabetic',
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn((text: string) => {
        fillTextCalls.push({ text, font: fakeCtx.font });
      }),
    };
    const fakeCanvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => fakeCtx),
    };
    let resolveFonts!: () => void;
    const readyPromise = new Promise<void>((res) => {
      resolveFonts = res;
    });
    const loadSpy = vi.fn().mockResolvedValue([]);

    vi.stubGlobal('document', {
      createElement: vi.fn(() => fakeCanvas),
      fonts: {
        load: loadSpy,
        ready: readyPromise,
      },
    });

    const atlas = new SignageAtlas();
    expect(fillTextCalls.length).toBeGreaterThan(0);
    expect(fillTextCalls.every((c) => c.font.includes('Hind Siliguri'))).toBe(true);
    expect(atlas.material.userData.shared).toBe(true);

    const beforeCount = fillTextCalls.length;
    resolveFonts();
    await atlas.ready;
    expect(fillTextCalls.length).toBeGreaterThan(beforeCount);
  });

  it('includes varied authentic fictional Dhaka shop names', () => {
    const bnValues = Object.values(signsBn);
    const enKeys = Object.keys(signsEn);
    expect(bnValues.length).toBeGreaterThanOrEqual(12);
    expect(Object.keys(signsBn).length).toBe(enKeys.length);
    expect(bnValues.some((v) => v.includes('ফুলগেট'))).toBe(true);
  });
});
