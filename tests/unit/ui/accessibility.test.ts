import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { render, h } from 'preact';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  settingsSignal,
  screenSignal,
  loadingSignal,
  unsupportedSignal,
  rotateOverlaySignal,
  contextLostSignal,
  pausedSignal,
  exitToTitle,
  type GameSettings,
} from '../../../src/ui/store';
import { setLanguage } from '../../../src/ui/i18n';
import { Settings } from '../../../src/ui/menus/Settings';
import { Loading } from '../../../src/ui/overlays/Loading';
import { App } from '../../../src/ui/App';
import {
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  ChoiceCard,
  StatusBar,
  CharacterPortrait,
  NotificationToast,
  MapMarker,
  ModalPanel,
  TransactionRow,
  MissionObjectivePanel,
  TripSummaryPanel,
} from '../../../src/ui/components/index';
import * as Icons from '../../../src/ui/components/icons';

class FakeTextNode {
  nodeType = 3;
  nodeName = '#text';
  parentNode: FakeElement | null = null;
  data: string;

  constructor(text: string) {
    this.data = text;
  }

  get textContent(): string {
    return this.data;
  }

  set textContent(val: string) {
    this.data = String(val ?? '');
  }

  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 && idx + 1 < this.parentNode.childNodes.length
      ? this.parentNode.childNodes[idx + 1]!
      : null;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }
}

type FakeNode = FakeElement | FakeTextNode;

class FakeElement {
  nodeType = 1;
  tagName: string;
  nodeName: string;
  namespaceURI: string | null;
  parentNode: FakeElement | null = null;
  childNodes: FakeNode[] = [];
  attributes = new Map<string, string>();
  style: Record<string, string> = {};
  listeners = new Map<string, Set<EventListener>>();

  constructor(tag: string, namespaceURI: string | null = null) {
    this.tagName = namespaceURI ? tag : tag.toUpperCase();
    this.nodeName = this.tagName;
    this.namespaceURI = namespaceURI;
  }

  get parentElement(): FakeElement | null {
    return this.parentNode;
  }

  get children(): FakeElement[] {
    return this.childNodes.filter((c): c is FakeElement => c instanceof FakeElement);
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }

  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 && idx + 1 < this.parentNode.childNodes.length
      ? this.parentNode.childNodes[idx + 1]!
      : null;
  }

  get id(): string {
    return this.attributes.get('id') ?? '';
  }

  set id(val: string) {
    this.setAttribute('id', val);
  }

  get className(): string {
    return this.attributes.get('class') ?? '';
  }

  set className(val: string) {
    this.setAttribute('class', val);
  }

  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(val: string) {
    for (const c of this.childNodes) c.parentNode = null;
    this.childNodes = val ? [new FakeTextNode(String(val))] : [];
    if (this.childNodes[0]) this.childNodes[0].parentNode = this;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  appendChild<T extends FakeNode>(node: T): T {
    return this.insertBefore(node, null);
  }

  insertBefore<T extends FakeNode>(node: T, ref: FakeNode | null): T {
    if (node.parentNode) node.parentNode.removeChild(node);
    node.parentNode = this;
    if (!ref) {
      this.childNodes.push(node);
    } else {
      const idx = this.childNodes.indexOf(ref);
      if (idx >= 0) this.childNodes.splice(idx, 0, node);
      else this.childNodes.push(node);
    }
    return node;
  }

  removeChild<T extends FakeNode>(node: T): T {
    const idx = this.childNodes.indexOf(node);
    if (idx >= 0) {
      this.childNodes.splice(idx, 1);
      node.parentNode = null;
    }
    return node;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  addEventListener(type: string, fn: EventListener): void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn);
  }

  removeEventListener(type: string, fn: EventListener): void {
    this.listeners.get(type)?.delete(fn);
  }

  focus(): void {
    if (typeof document !== 'undefined') {
      (document as unknown as { activeElement: FakeElement | null }).activeElement = this;
    }
  }

  contains(other: FakeNode | null): boolean {
    let cur = other;
    while (cur) {
      if (cur === this) return true;
      cur = cur.parentNode;
    }
    return false;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const out: FakeElement[] = [];
    const visit = (el: FakeElement) => {
      for (const child of el.children) {
        if (matchesSelector(child, selector)) out.push(child);
        visit(child);
      }
    };
    visit(this);
    return out;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

function matchesSelector(el: FakeElement, selector: string): boolean {
  const parts = selector.split(',').map((s) => s.trim()).filter(Boolean);
  return parts.some((part) => {
    if (part.startsWith('#')) return el.id === part.slice(1);
    const attrMatch = /^\[([^=\]]+)(?:="([^"]*)")?\]$/.exec(part);
    if (attrMatch) {
      const [, attr, expected] = attrMatch;
      if (expected !== undefined) return el.getAttribute(attr!) === expected;
      return el.hasAttribute(attr!);
    }
    return el.tagName.toLowerCase() === part.toLowerCase();
  });
}

function installDomEnv(): { root: FakeElement; cleanup: () => void } {
  const body = new FakeElement('body');
  const root = new FakeElement('div');
  root.id = 'ui-root';
  body.appendChild(root);

  const prevWindow = globalThis.window;
  const prevDocument = globalThis.document;
  const prevHTMLElement = globalThis.HTMLElement;
  const prevRaf = globalThis.requestAnimationFrame;
  const prevCaf = globalThis.cancelAnimationFrame;

  const fakeDoc = {
    body,
    documentElement: new FakeElement('html'),
    activeElement: null as FakeElement | null,
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (ns: string, tag: string) => new FakeElement(tag, ns),
    createTextNode: (text: string) => new FakeTextNode(text),
    querySelector: (sel: string) => body.querySelector(sel),
    querySelectorAll: (sel: string) => body.querySelectorAll(sel),
    getElementById: (id: string) => body.querySelector(`#${id}`),
  };

  const fakeWin = {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '' },
    addEventListener: () => {},
    removeEventListener: () => {},
  };

  globalThis.HTMLElement = FakeElement as unknown as typeof HTMLElement;
  globalThis.document = fakeDoc as unknown as Document;
  globalThis.window = fakeWin as unknown as Window & typeof globalThis;
  globalThis.requestAnimationFrame = (() => 1) as unknown as typeof requestAnimationFrame;
  globalThis.cancelAnimationFrame = (() => {}) as unknown as typeof cancelAnimationFrame;

  return {
    root,
    cleanup: () => {
      render(null, root as unknown as Element);
      globalThis.window = prevWindow;
      globalThis.document = prevDocument;
      globalThis.HTMLElement = prevHTMLElement;
      globalThis.requestAnimationFrame = prevRaf;
      globalThis.cancelAnimationFrame = prevCaf;
    },
  };
}

describe('Accessibility & Localisation (T6.3 + P6.1)', () => {
  let dom: { root: FakeElement; cleanup: () => void };

  beforeEach(() => {
    dom = installDomEnv();
    setLanguage('en');
    exitToTitle();
    loadingSignal.value = { active: false, stageKey: 'loading.boot', progress: 0 };
    unsupportedSignal.value = null;
    rotateOverlaySignal.value = false;
    contextLostSignal.value = false;
    pausedSignal.value = false;
  });

  afterEach(async () => {
    exitToTitle();
    render(null, dom.root as unknown as Element);
    await new Promise((resolve) => setTimeout(resolve, 0));
    dom.cleanup();
  });

  it('includes all accessibility defaults in GameSettings', () => {
    expect(DEFAULT_SETTINGS.subtitlesSize).toBe('normal');
    expect(DEFAULT_SETTINGS.colorblindRoute).toBe(false);
    expect(DEFAULT_SETTINGS.reduceMotion).toBe(false);
    expect(DEFAULT_SETTINGS.autoCruise).toBe(false);
    expect(DEFAULT_SETTINGS.pauseOnDecisions).toBe(false);
  });

  it('persists modified accessibility settings in memory and signal', () => {
    const updated: GameSettings = {
      ...DEFAULT_SETTINGS,
      subtitlesSize: 'large',
      reduceMotion: true,
      autoCruise: true,
      colorblindRoute: true,
    };

    saveSettings(updated);
    expect(settingsSignal.value.subtitlesSize).toBe('large');
    expect(settingsSignal.value.reduceMotion).toBe(true);
    expect(settingsSignal.value.autoCruise).toBe(true);
    expect(settingsSignal.value.colorblindRoute).toBe(true);

    const loaded = loadSettings();
    expect(loaded.subtitlesSize).toBe('large');
    expect(loaded.reduceMotion).toBe(true);
    expect(loaded.autoCruise).toBe(true);
  });

  it('renders Settings via real Preact render when open', () => {
    render(h(Settings, { isOpen: true, onClose: () => {} }), dom.root as unknown as Element);
    const settingsEl = dom.root.querySelector('[data-testid="settings-screen"]');
    expect(settingsEl).not.toBeNull();
  });

  it('records Native-Speaker Review Checklist in docs/QUESTIONS.md', () => {
    const questions = fs.readFileSync('docs/QUESTIONS.md', 'utf-8');
    expect(questions).toContain('T6.3 Native-Speaker Review Checklist');
    expect(questions).toContain('data/dialogue/bn/dialogue.json');
    expect(questions).toContain('data/dialogue/bn/characters.json');
    expect(questions).toContain('data/dialogue/bn/missions.json');
    expect(questions).toContain('data/dialogue/bn/encounters.json');
    expect(questions).toContain('data/dialogue/bn/ui.json');
  });

  it('P6.1: src/ui/tokens.css defines MASTER §16 palette, animations, :focus-visible, and Hind Siliguri font stack', () => {
    const css = fs.readFileSync('src/ui/tokens.css', 'utf-8');
    expect(css).toContain('--uthao-green: #22C55E');
    expect(css).toContain('--dhaka-amber: #F59E0B');
    expect(css).toContain('--danger-red: #EF4444');
    expect(css).toContain('@keyframes choiceSlideDown');
    expect(css).toContain(':focus-visible');
    expect(css).toContain('Hind Siliguri');
  });

  it('P6.1: ModalPanel renders role="dialog", aria-modal="true", pointerEvents auto, maxHeight 90dvh, overflowY auto', () => {
    render(
      h(ModalPanel, {
        title: 'Test Dialog',
        onClose: () => {},
        testId: 'test-modal',
        children: h('p', null, 'Modal content'),
      }),
      dom.root as unknown as Element
    );

    const dialog = dom.root.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBe('true');
    expect(dialog?.style.pointerEvents).toBe('auto');
    expect(dialog?.style.maxHeight).toBe('90dvh');
    expect(dialog?.style.overflowY).toBe('auto');
  });

  it('P6.1: HUD is NOT mounted when screenSignal is title and mounts cleanly when screenSignal is game inside single <App /> root', () => {
    screenSignal.value = 'title';
    render(h(App, null), dom.root as unknown as Element);

    expect(dom.root.querySelector('[data-testid="main-menu"]')).not.toBeNull();
    expect(dom.root.querySelector('#hud')).toBeNull();

    screenSignal.value = 'game';
    render(h(App, null), dom.root as unknown as Element);

    expect(dom.root.querySelector('#hud')).not.toBeNull();
    expect(dom.root.querySelector('[data-testid="main-menu"]')).toBeNull();

    // Ensure no separate hud-root dual Preact root exists in src/ui/hud/Hud.tsx or src/main.ts
    const hudSrc = fs.readFileSync('src/ui/hud/Hud.tsx', 'utf-8');
    const mainSrc = fs.readFileSync('src/main.ts', 'utf-8');
    expect(hudSrc).not.toContain('hud-root');
    expect(mainSrc).not.toContain('new Hud(');
  });

  it('P6.1: all 12 MASTER §16 primitives and inline SVG icons render cleanly via real Preact render', () => {
    render(
      h('div', null, [
        h(PrimaryButton, { onClick: () => {}, testId: 'prim-btn' }, 'Primary'),
        h(SecondaryButton, { onClick: () => {}, testId: 'sec-btn' }, 'Secondary'),
        h(DangerButton, { onClick: () => {}, testId: 'danger-btn' }, 'Danger'),
        h(ChoiceCard, {
          prompt: 'Choose a route',
          options: [
            { id: '1', label: 'Main Road', kind: 'official', shortcut: '1' },
            { id: '2', label: 'Shortcut', kind: 'illicit', costHint: '৳50', riskText: 'Risky', shortcut: '2' },
          ],
          onSelect: () => {},
          testId: 'prim-choice',
        }),
        h(StatusBar, { label: 'Fuel', value: 60, max: 100, tone: 'green', testId: 'prim-status' }),
        h(CharacterPortrait, { name: 'Rafi', role: 'Rider', mood: 'happy', testId: 'prim-portrait' }),
        h(NotificationToast, { message: 'Saved', tone: 'success', testId: 'prim-toast' }),
        h(MapMarker, { kind: 'fuel', label: 'Fuel Pump', onClick: () => {}, testId: 'prim-marker' }),
        h(ModalPanel, { title: 'Dialog', onClose: () => {}, testId: 'prim-modal' }, h('span', null, 'Body')),
        h(TransactionRow, { label: 'Fare', amount: 120, kind: 'income', testId: 'prim-tx' }),
        h(MissionObjectivePanel, {
          title: 'First Ride',
          objectives: [{ id: 'obj1', label: 'Pick up Nabila', progress: 1, target: 1, completed: true }],
          testId: 'prim-mission',
        }),
        h(TripSummaryPanel, {
          title: 'Trip Summary',
          rows: [{ label: 'Gross Fare', amount: 100, kind: 'income' }],
          continueLabel: 'Continue',
          onContinue: () => {},
          testId: 'prim-summary',
        }),
        h(Icons.IconMotorcycle, { size: 20 }),
        h(Icons.IconFuel, { size: 20 }),
        h(Icons.IconWarning, { size: 20 }),
        h(Icons.IconClose, { size: 20 }),
      ]),
      dom.root as unknown as Element
    );

    const expectedTestIds = [
      'prim-btn',
      'sec-btn',
      'danger-btn',
      'prim-choice',
      'prim-status',
      'prim-portrait',
      'prim-toast',
      'prim-marker',
      'prim-modal',
      'prim-tx',
      'prim-mission',
      'prim-summary',
    ];
    for (const id of expectedTestIds) {
      expect(dom.root.querySelector(`[data-testid="${id}"]`)).not.toBeNull();
    }

    const svgs = dom.root.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(4);
  });

  it('P6.1 / P0.3: Loading progressbar has an accessible aria-label', () => {
    loadingSignal.value = { active: true, stageKey: 'loading.physics', progress: 50 };
    render(h(Loading, { message: undefined }), dom.root as unknown as Element);

    const progressEl = dom.root.querySelector('[data-testid="loading-progress"]');
    expect(progressEl).not.toBeNull();
    expect(progressEl?.getAttribute('role')).toBe('progressbar');
    const ariaLabel = progressEl?.getAttribute('aria-label');
    expect(typeof ariaLabel).toBe('string');
    expect((ariaLabel ?? '').trim().length).toBeGreaterThan(0);
  });
});
