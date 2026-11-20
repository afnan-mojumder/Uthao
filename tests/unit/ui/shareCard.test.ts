import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, h } from 'preact';
import { act } from 'preact/test-utils';
import { buildScorecardText, ShareCard } from '../../../src/ui/share/ShareCard';
import { DayEnd } from '../../../src/ui/menus/DayEnd';
import { Ending } from '../../../src/ui/menus/Ending';
import { setLanguage, t } from '../../../src/ui/i18n';
import type { DaySummary } from '../../../src/core/types';
import type { EndingResult } from '../../../src/sim/mission/endings';

describe('P6.2 ShareCard & DayEnd / Ending scorecard integration', () => {
  const sampleDay: DaySummary = {
    day: 4,
    revenue: 1120,
    expenses: 270,
    net: 850,
    ratingDelta: 0.15,
    completedRides: 9,
    relationshipsDelta: { char_mintu: 2 },
    savings: 3400,
    cash: 920,
    debt: 0,
  };

  const sampleEnding: EndingResult = {
    endingId: 'independent_rider',
    titleKey: 'ending_independent_rider_title',
    descKey: 'ending_independent_rider_desc',
    dominantIdentity: 'professional',
    tendencies: {
      professional: 45,
      negotiator: 25,
      hustler: 10,
      regular: 20,
    },
    summary: {
      cash: 8500,
      savings: 22000,
      debt: 0,
      rating: 4.9,
      localTrust: 78,
      completedMissions: 5,
    },
  };

  beforeEach(() => {
    setLanguage('en');
  });

  it('formats bilingual DaySummary scorecard text in EN and BN', () => {
    setLanguage('en');
    const enText = buildScorecardText({ summary: sampleDay });
    expect(enText).toContain('Uthao Dhaka Scorecard');
    expect(enText).toContain('Day 4');
    expect(enText).toContain('9');
    expect(enText).toContain('850');
    expect(enText).toContain('3400');

    setLanguage('bn');
    const bnText = buildScorecardText({ summary: sampleDay });
    expect(bnText).toContain('উঠাও ঢাকা স্কোরকার্ড');
    expect(bnText).toContain('৪');
    expect(bnText).toContain('৮৫০');
  });

  it('formats bilingual EndingResult scorecard text in EN and BN', () => {
    setLanguage('en');
    const enText = buildScorecardText({ ending: sampleEnding });
    expect(enText).toContain('Career Complete');
    expect(enText).toContain('22000');
    expect(enText).toContain('4.9');

    setLanguage('bn');
    const bnText = buildScorecardText({ ending: sampleEnding });
    expect(bnText).toContain('ক্যারিয়ার সমাপ্ত');
    expect(bnText).toContain('২২০০০');
    expect(bnText).toContain('৪.৯');
  });

  it('mounts ShareCard cleanly inside DayEnd and Ending', () => {
    const containsType = (node: unknown, target: unknown): boolean => {
      if (!node || typeof node !== 'object') return false;
      if (Array.isArray(node)) return node.some((c) => containsType(c, target));
      const vn = node as { type?: unknown; props?: { children?: unknown } };
      if (vn.type === target) return true;
      return containsType(vn.props?.children, target);
    };

    const dayVnode = DayEnd({ summary: sampleDay });
    expect(containsType(dayVnode, ShareCard)).toBe(true);

    const endingVnode = Ending({ result: sampleEnding });
    expect(containsType(endingVnode, ShareCard)).toBe(true);
  });

  describe('canvas label consistency, maxWidth bounds, and async unmount guard', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    function createCanvasDom() {
      const fillTextCalls: Array<{ text: string; x: number; y: number; maxWidth?: number }> = [];
      const fakeCtx = {
        createLinearGradient: () => ({ addColorStop: () => {} }),
        fillRect: () => {},
        strokeRect: () => {},
        fillText: (text: string, x: number, y: number, maxWidth?: number) => {
          fillTextCalls.push({ text, x, y, maxWidth });
        },
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        font: '',
      };

      class FakeText {
        nodeType = 3;
        nodeName = '#text';
        parentNode: FakeEl | null = null;
        data: string;
        constructor(v: string) {
          this.data = v;
        }
        get nextSibling(): FakeText | FakeEl | null {
          if (!this.parentNode) return null;
          const idx = this.parentNode.childNodes.indexOf(this);
          return idx >= 0 && idx + 1 < this.parentNode.childNodes.length ? this.parentNode.childNodes[idx + 1]! : null;
        }
        remove() {
          this.parentNode?.removeChild(this);
        }
      }

      class FakeEl {
        nodeType = 1;
        tagName: string;
        nodeName: string;
        parentNode: FakeEl | null = null;
        childNodes: Array<FakeEl | FakeText> = [];
        attributes = new Map<string, string>();
        style: Record<string, string> = {};
        listeners = new Map<string, Set<() => void>>();
        width = 600;
        height = 320;
        constructor(tag: string) {
          this.tagName = tag.toUpperCase();
          this.nodeName = this.tagName;
        }
        get firstChild(): FakeEl | FakeText | null {
          return this.childNodes[0] ?? null;
        }
        get nextSibling(): FakeEl | FakeText | null {
          if (!this.parentNode) return null;
          const idx = this.parentNode.childNodes.indexOf(this);
          return idx >= 0 && idx + 1 < this.parentNode.childNodes.length ? this.parentNode.childNodes[idx + 1]! : null;
        }
        setAttribute(k: string, v: string) {
          this.attributes.set(k, String(v));
        }
        getAttribute(k: string) {
          return this.attributes.get(k) ?? null;
        }
        removeAttribute(k: string) {
          this.attributes.delete(k);
        }
        appendChild<T extends FakeEl | FakeText>(n: T): T {
          return this.insertBefore(n, null);
        }
        insertBefore<T extends FakeEl | FakeText>(n: T, ref: FakeEl | FakeText | null): T {
          if (n.parentNode) n.parentNode.removeChild(n);
          n.parentNode = this;
          if (!ref) this.childNodes.push(n);
          else {
            const idx = this.childNodes.indexOf(ref);
            if (idx >= 0) this.childNodes.splice(idx, 0, n);
            else this.childNodes.push(n);
          }
          return n;
        }
        removeChild<T extends FakeEl | FakeText>(n: T): T {
          const idx = this.childNodes.indexOf(n);
          if (idx >= 0) {
            this.childNodes.splice(idx, 1);
            n.parentNode = null;
          }
          return n;
        }
        remove() {
          this.parentNode?.removeChild(this);
        }
        addEventListener(type: string, fn: () => void) {
          if (!this.listeners.has(type)) this.listeners.set(type, new Set());
          this.listeners.get(type)!.add(fn);
        }
        removeEventListener(type: string, fn: () => void) {
          this.listeners.get(type)?.delete(fn);
        }
        click() {
          const ev = { type: 'click', target: this, currentTarget: this };
          for (const fn of this.listeners.get('click') ?? []) {
            (fn as (this: FakeEl, e: unknown) => void).call(this, ev);
          }
        }
        getContext(kind: string) {
          return kind === '2d' ? fakeCtx : null;
        }
        toBlob(cb: (b: Blob | null) => void) {
          cb(null);
        }
        toDataURL() {
          return 'data:image/png;base64,AAAA';
        }
        querySelector(sel: string): FakeEl | null {
          const match = /^\[data-testid="([^"]+)"\]$/.exec(sel);
          for (const c of this.childNodes) {
            if (c instanceof FakeEl) {
              if (match && c.getAttribute('data-testid') === match[1]) return c;
              const found = c.querySelector(sel);
              if (found) return found;
            }
          }
          return null;
        }
      }

      const root = new FakeEl('div');
      vi.stubGlobal('document', {
        body: root,
        createElement: (tag: string) => new FakeEl(tag),
        createElementNS: (_ns: string, tag: string) => new FakeEl(tag),
        createTextNode: (v: string) => new FakeText(v),
      });
      return { root, fillTextCalls };
    }

    it('uses dayend.revenue instead of share.savings when summary.savings is undefined and passes maxWidth bounds', async () => {
      const { root, fillTextCalls } = createCanvasDom();
      const summaryNoSavings: DaySummary = {
        day: 2,
        revenue: 940,
        expenses: 200,
        net: 740,
        ratingDelta: 0.1,
        completedRides: 5,
        relationshipsDelta: {},
      };

      setLanguage('en');
      const enText = buildScorecardText({ summary: summaryNoSavings });
      expect(enText).not.toContain(t('share.savings'));
      expect(enText).toContain('Rides: 5');

      act(() => {
        render(h(ShareCard, { summary: summaryNoSavings }), root as unknown as Element);
      });

      expect(fillTextCalls.some((c) => c.text === t('share.savings'))).toBe(false);
      expect(fillTextCalls.some((c) => c.text === t('dayend.revenue') && c.maxWidth === 160)).toBe(true);
      expect(fillTextCalls.some((c) => c.text === '৳940' && c.maxWidth === 160)).toBe(true);

      fillTextCalls.length = 0;
      setLanguage('bn');
      act(() => {
        render(h(ShareCard, { ending: sampleEnding }), root as unknown as Element);
      });

      const titleCall = fillTextCalls.find((c) => c.text === t(sampleEnding.titleKey));
      expect(titleCall?.maxWidth).toBe(516);
      expect(fillTextCalls.some((c) => c.text === t('share.savings') && c.maxWidth === 160)).toBe(true);
      act(() => {
        render(null, root as unknown as Element);
      });
    });

    it('ignores async share status updates after ShareCard unmounts mid-share', async () => {
      const { root } = createCanvasDom();
      let resolveShare!: () => void;
      vi.stubGlobal('navigator', {
        share: () =>
          new Promise<void>((res) => {
            resolveShare = res;
          }),
      });

      act(() => {
        render(h(ShareCard, { summary: sampleDay }), root as unknown as Element);
      });

      const btn = root.querySelector('[data-testid="share-scorecard-btn"]');
      expect(btn).not.toBeNull();
      btn!.click();
      await new Promise((r) => setTimeout(r, 0));

      // Unmount before navigator.share resolves
      act(() => {
        render(null, root as unknown as Element);
      });
      resolveShare();
      await new Promise((r) => setTimeout(r, 0));

      expect(root.querySelector('[data-testid="share-status"]')).toBeNull();
    });
  });
});
