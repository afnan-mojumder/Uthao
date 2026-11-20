import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import { render, h, type ComponentChildren } from 'preact';
import { act } from 'preact/test-utils';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  resetSettingsMemoryForTest,
  settingsSignal,
  screenSignal,
  loadingSignal,
  unsupportedSignal,
  rotateOverlaySignal,
  contextLostSignal,
  pausedSignal,
  isGamepadRebindingSignal,
  exitToTitle,
  type GameSettings,
} from '../../../src/ui/store';
import { setLanguage } from '../../../src/ui/i18n';
import { makeRestInert } from '../../../src/ui/focusTrap';
import { moveFocus, confirmFocus } from '../../../src/ui/gamepadNav';
import { Contacts } from '../../../src/ui/phone/Contacts';
import { Phone } from '../../../src/ui/phone/Phone';
import { MapScreen } from '../../../src/ui/map/MapScreen';
import { SaveSlots } from '../../../src/ui/menus/SaveSlots';
import { Journal } from '../../../src/ui/journal/Journal';
import { KarmaPanel } from '../../../src/ui/karma/KarmaPanel';
import { UiSheet } from '../../../src/ui/sheet/UiSheet';
import { ChoiceCardView } from '../../../src/ui/choice/ChoiceCard';
import { SaveSystem, MemoryStorageAdapter } from '../../../src/sim/save/SaveSystem';
import { GameManager } from '../../../src/sim/GameManager';
import { Settings } from '../../../src/ui/menus/Settings';
import { Pause } from '../../../src/ui/menus/Pause';
import { DayEnd } from '../../../src/ui/menus/DayEnd';
import { Ending } from '../../../src/ui/menus/Ending';
import { Garage } from '../../../src/ui/garage/Garage';
import { TripSummary } from '../../../src/ui/trip/TripSummary';
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
  dataset: Record<string, string> = {};
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

  get disabled(): boolean {
    return this.hasAttribute('disabled');
  }

  set disabled(val: boolean) {
    if (val) this.setAttribute('disabled', '');
    else this.removeAttribute('disabled');
  }

  getContext(): null {
    return null;
  }

  getClientRects(): DOMRect[] {
    return [{ left: 0, top: 0, right: 100, bottom: 40, width: 100, height: 40 } as DOMRect];
  }

  getBoundingClientRect(): DOMRect {
    return {
      left: Number(this.dataset.left ?? 0),
      top: Number(this.dataset.top ?? 0),
      right: Number(this.dataset.left ?? 0) + 100,
      bottom: Number(this.dataset.top ?? 0) + 40,
      width: 100,
      height: 40,
      x: Number(this.dataset.left ?? 0),
      y: Number(this.dataset.top ?? 0),
      toJSON: () => ({}),
    } as DOMRect;
  }

  closest(selector: string): FakeElement | null {
    if (matchesSelector(this, selector)) return this;
    let cur: FakeElement | null = this.parentNode;
    while (cur) {
      if (matchesSelector(cur, selector)) return cur;
      cur = cur.parentNode;
    }
    return null;
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

  click(): void {
    const ev = { type: 'click', target: this, currentTarget: this } as unknown as Event;
    for (const fn of this.listeners.get('click') ?? []) {
      (fn as (this: FakeElement, e: Event) => void).call(this, ev);
    }
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
    addEventListener: (type: string, fn: EventListener) => body.addEventListener(type, fn),
    removeEventListener: (type: string, fn: EventListener) => body.removeEventListener(type, fn),
  };

  const fakeWin = {
    innerWidth: 1280,
    innerHeight: 720,
    devicePixelRatio: 1,
    location: { search: '' },
    addEventListener: (type: string, fn: EventListener) => body.addEventListener(type, fn),
    removeEventListener: (type: string, fn: EventListener) => body.removeEventListener(type, fn),
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
    act(() => {
      render(null, dom.root as unknown as Element);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    dom.cleanup();
  });

  it('includes all accessibility defaults in GameSettings', () => {
    expect(DEFAULT_SETTINGS.subtitlesSize).toBe('normal');
    expect(DEFAULT_SETTINGS.colorblindRoute).toBe(false);
    expect(DEFAULT_SETTINGS.reduceMotion).toBe(false);
    expect(DEFAULT_SETTINGS.uiScale).toBe(1);
    expect('autoCruise' in DEFAULT_SETTINGS).toBe(false);
    expect(DEFAULT_SETTINGS.pauseOnDecisions).toBe(false);
  });

  it('persists modified accessibility settings in memory and signal', () => {
    const updated: GameSettings = {
      ...DEFAULT_SETTINGS,
      subtitlesSize: 'large',
      reduceMotion: true,
      uiScale: 1.15,
      colorblindRoute: true,
    };

    saveSettings(updated);
    expect(settingsSignal.value.subtitlesSize).toBe('large');
    expect(settingsSignal.value.reduceMotion).toBe(true);
    expect(settingsSignal.value.uiScale).toBe(1.15);
    expect(settingsSignal.value.colorblindRoute).toBe(true);

    const loaded = loadSettings();
    expect(loaded.subtitlesSize).toBe('large');
    expect(loaded.reduceMotion).toBe(true);
    expect(loaded.uiScale).toBe(1.15);
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

  it('P6.2 Minor 1: TripSummary, Garage, Pause, Settings, DayEnd, and Ending all wrap cleanly with ModalPanel (single fixed backdrop)', () => {
    const receipt = {
      requestId: 'r1',
      fare: 120,
      tip: 0,
      bonus: 0,
      commission: 18,
      fuelCost: 12,
      fuelLiters: 0.1,
      otherCosts: 0,
      penalties: 0,
      compensation: 0,
      net: 90,
      distanceKm: 2,
      durationMin: 6,
      rating: 5,
      consequences: [],
    };
    const tripVnode = TripSummary({ receipt, onContinue: () => {} });
    expect(tripVnode.type).toBe(ModalPanel);
    expect(tripVnode.props.id).toBe('trip-summary-overlay');

    const garageVnode = Garage({ isOpen: true });
    expect(garageVnode?.type).toBe(ModalPanel);
    expect(garageVnode?.props['data-testid']).toBe('garage-screen');

    const pauseVnode = Pause({ isOpen: true });
    expect(pauseVnode?.type).toBe(ModalPanel);
    expect(pauseVnode?.props['data-testid']).toBe('pause-menu');

    act(() => {
      render(h(Settings, { isOpen: true, onClose: () => {} }), dom.root as unknown as Element);
    });
    const settingsDialogs = dom.root.querySelectorAll('[role="dialog"]');
    expect(settingsDialogs).toHaveLength(1);
    expect(settingsDialogs[0]?.getAttribute('data-testid')).toBe('settings-screen');
    expect(settingsDialogs[0]?.style.maxHeight).toBe('90dvh');

    const dayEndVnode = DayEnd({
      summary: {
        day: 1,
        revenue: 500,
        expenses: 180,
        net: 320,
        ratingDelta: 0.1,
        completedRides: 3,
        relationshipsDelta: {},
      },
    });
    expect(dayEndVnode?.type).toBe(ModalPanel);
    expect(dayEndVnode?.props['data-testid']).toBe('day-end-screen');

    const endingVnode = Ending({
      result: {
        endingId: 'independent_rider',
        titleKey: 'ending_independent_rider_title',
        descKey: 'ending_independent_rider_desc',
        dominantIdentity: 'professional',
        tendencies: { professional: 45, negotiator: 20, hustler: 15, regular: 20 },
        summary: { cash: 8500, savings: 22000, debt: 0, rating: 4.85, localTrust: 75, completedMissions: 4 },
      },
    });
    expect(endingVnode.type).toBe(ModalPanel);
    expect(endingVnode.props['data-testid']).toBe('ending-screen');
  });

  it('P6.2 Important 2: Settings sets isGamepadRebindingSignal while listening for a gamepad button and clears on Cancel, Save, and unmount', () => {
    expect(isGamepadRebindingSignal.value).toBe(false);
    act(() => {
      render(h(Settings, { isOpen: true, initialTab: 'controls', onClose: () => {} }), dom.root as unknown as Element);
    });

    const rebindBtn = dom.root.querySelector('[data-testid="settings-rebind-gp-hornButton"]');
    expect(rebindBtn).not.toBeNull();
    act(() => {
      rebindBtn!.click();
    });
    expect(isGamepadRebindingSignal.value).toBe(true);

    // Cancel clears it
    const cancelBtn = dom.root.querySelector('[data-testid="settings-cancel-btn"]');
    act(() => {
      cancelBtn!.click();
    });
    expect(isGamepadRebindingSignal.value).toBe(false);

    // Re-enter gamepad listening and verify Save clears it
    act(() => {
      rebindBtn!.click();
    });
    expect(isGamepadRebindingSignal.value).toBe(true);
    const saveBtn = dom.root.querySelector('[data-testid="settings-save-btn"]');
    act(() => {
      saveBtn!.click();
    });
    expect(isGamepadRebindingSignal.value).toBe(false);

    // Re-enter gamepad listening and verify unmount clears it
    act(() => {
      rebindBtn!.click();
    });
    expect(isGamepadRebindingSignal.value).toBe(true);
    act(() => {
      render(null, dom.root as unknown as Element);
    });
    expect(isGamepadRebindingSignal.value).toBe(false);
  });
});

describe('P6.5 WCAG AA Accessibility Sweep', () => {
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
    act(() => {
      render(null, dom.root as unknown as Element);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    dom.cleanup();
  });

  it('makeRestInert handles stacked modals safely without self-inerting or leaking inert, and gamepadNav skips [inert]', () => {
    const bgBtn = document.createElement('button') as unknown as FakeElement;
    bgBtn.id = 'bg-btn';
    bgBtn.dataset.top = '0';

    const modalA = document.createElement('div') as unknown as FakeElement;
    modalA.id = 'modal-a';
    const modalABtn = document.createElement('button') as unknown as FakeElement;
    modalABtn.id = 'modal-a-btn';
    modalABtn.dataset.top = '50';
    modalA.appendChild(modalABtn);

    const modalB = document.createElement('div') as unknown as FakeElement;
    modalB.id = 'modal-b';
    const modalBBtn = document.createElement('button') as unknown as FakeElement;
    modalBBtn.id = 'modal-b-btn';
    modalBBtn.dataset.top = '100';
    modalB.appendChild(modalBBtn);

    dom.root.appendChild(bgBtn as unknown as FakeNode);
    dom.root.appendChild(modalA as unknown as FakeNode);
    dom.root.appendChild(modalB as unknown as FakeNode);

    const releaseA = makeRestInert(modalA as unknown as HTMLElement);
    expect(bgBtn.hasAttribute('inert')).toBe(true);
    expect(modalA.hasAttribute('inert')).toBe(false);

    // Gamepad focus moves only to non-inert elements (modalA + modalB right now)
    (document as unknown as { activeElement: FakeElement | null }).activeElement = null;
    moveFocus('down');
    expect((document.activeElement as unknown as FakeElement)?.id).not.toBe('bg-btn');

    // Open Modal B on top of Modal A -> Modal A and bgBtn are inert; Modal B is NOT inert
    const releaseB = makeRestInert(modalB as unknown as HTMLElement);
    expect(bgBtn.hasAttribute('inert')).toBe(true);
    expect(modalA.hasAttribute('inert')).toBe(true);
    expect(modalB.hasAttribute('inert')).toBe(false);

    // Confirm gamepad focus lands only inside Modal B
    (document as unknown as { activeElement: FakeElement | null }).activeElement = null;
    let clicked = false;
    modalBBtn.addEventListener('click', () => {
      clicked = true;
    });
    confirmFocus(); // focuses modalBBtn (the only non-inert focusable)
    expect((document.activeElement as unknown as FakeElement)?.id).toBe('modal-b-btn');
    confirmFocus(); // clicks modalBBtn
    expect(clicked).toBe(true);

    // Close Modal A while Modal B is STILL open -> bgBtn must remain inert!
    releaseA();
    expect(bgBtn.hasAttribute('inert')).toBe(true);
    expect(modalB.hasAttribute('inert')).toBe(false);

    // Close Modal B -> zero inert attributes remain anywhere
    releaseB();
    expect(dom.root.querySelectorAll('[inert]')).toHaveLength(0);
  });

  it('all 13 modals expose role="dialog", aria-modal="true", and trap background with makeRestInert', () => {
    const saveSys = new SaveSystem(new MemoryStorageAdapter());
    const gm = new GameManager({ seed: 1, mode: 'career', data: {} });
    const snapshot = gm.snapshot();

    const modalCases: Array<{ name: string; vnode: ComponentChildren }> = [
      {
        name: 'SaveSlots',
        vnode: h(SaveSlots, { isOpen: true, mode: 'save', onClose: () => {}, onSelectSlot: () => {}, saveSystem: saveSys }),
      },
      {
        name: 'MapScreen',
        vnode: h(MapScreen, { isOpen: true, onClose: () => {} }),
      },
      {
        name: 'Phone',
        vnode: h(Phone, { isOpen: true, onClose: () => {} }),
      },
      {
        name: 'Journal',
        vnode: h(Journal, { snapshot, activeMissions: [], getObjectiveStates: () => [], onClose: () => {} }),
      },
      {
        name: 'KarmaPanel',
        vnode: h(KarmaPanel, {
          isOpen: true,
          data: {
            day: 1,
            meters: {
              riderIntegrity: 60,
              publicReputation: 60,
              platformStanding: 70,
              safetyRecord: 80,
              criminalExposure: 0,
              evidenceExposure: 0,
            },
            passengerTrust: {},
            promises: { kept: 0, broken: 0 },
            appWarned: false,
            appSuspended: false,
            appSuspendedUntilDay: 0,
            karmaLog: [],
          },
          onClose: () => {},
        }),
      },
      {
        name: 'UiSheet',
        vnode: h(UiSheet, {
          isOpen: true,
          onOpenMap: () => {},
          onOpenPhone: () => {},
          onOpenGarage: () => {},
          onOpenJournal: () => {},
          onOpenKarma: () => {},
          onOpenPause: () => {},
          onOpenSettings: () => {},
          onClose: () => {},
        }),
      },
      { name: 'Garage', vnode: h(Garage, { isOpen: true, onClose: () => {} }) },
      { name: 'Pause', vnode: h(Pause, { isOpen: true }) },
      { name: 'Settings', vnode: h(Settings, { isOpen: true, onClose: () => {} }) },
      {
        name: 'DayEnd',
        vnode: h(DayEnd, {
          summary: {
            day: 1,
            revenue: 500,
            expenses: 180,
            net: 320,
            ratingDelta: 0.1,
            completedRides: 3,
            relationshipsDelta: {},
          },
        }),
      },
      {
        name: 'Ending',
        vnode: h(Ending, {
          result: {
            endingId: 'independent_rider',
            titleKey: 'ending_independent_rider_title',
            descKey: 'ending_independent_rider_desc',
            dominantIdentity: 'professional',
            tendencies: { professional: 45, negotiator: 20, hustler: 15, regular: 20 },
            summary: { cash: 8500, savings: 22000, debt: 0, rating: 4.85, localTrust: 75, completedMissions: 4 },
          },
        }),
      },
      {
        name: 'TripSummary',
        vnode: h(TripSummary, {
          receipt: {
            requestId: 'r1',
            fare: 120,
            tip: 0,
            bonus: 0,
            commission: 18,
            fuelCost: 12,
            fuelLiters: 0.1,
            otherCosts: 0,
            penalties: 0,
            compensation: 0,
            net: 90,
            distanceKm: 2,
            durationMin: 6,
            rating: 5,
            consequences: [],
          },
          onContinue: () => {},
        }),
      },
      {
        name: 'ChoiceCard',
        vnode: h(ChoiceCardView, {
          choice: {
            active: true,
            prompt: 'encounter.friend_package.title',
            options: [{ id: 'a', text: 'encounter.friend_package.choice.accept' }],
            instanceId: 'inst_a11y_1',
          },
        }),
      },
    ];

    for (const mc of modalCases) {
      act(() => {
        render(
          h('div', null, [
            h('button', { id: 'bg-sentinel', type: 'button' }, 'Background'),
            mc.vnode,
          ]),
          dom.root as unknown as Element
        );
      });

      const dialog = dom.root.querySelector('[role="dialog"]');
      expect(dialog, `${mc.name} should render role="dialog"`).not.toBeNull();
      expect(dialog?.getAttribute('aria-modal'), `${mc.name} should have aria-modal="true"`).toBe('true');
      const bg = dom.root.querySelector('#bg-sentinel');
      expect(bg?.closest('[inert]') !== null, `${mc.name} should mark background inert`).toBe(true);

      act(() => {
        render(null, dom.root as unknown as Element);
      });
      expect(dom.root.querySelectorAll('[inert]'), `${mc.name} should clean up inert on unmount`).toHaveLength(0);
    }
  });

  it('Contacts entries are keyboard-activatable <button> elements with zero clickable <div> cards', () => {
    act(() => {
      render(
        h(Contacts, {
          relationships: { char_nabila: 25, char_mintu: 35 },
          onCallContact: () => {},
        }),
        dom.root as unknown as Element
      );
    });

    const nabilaItem = dom.root.querySelector('[data-testid="contact-item-char_nabila"]');
    expect(nabilaItem).not.toBeNull();
    expect(nabilaItem?.tagName.toUpperCase()).toBe('BUTTON');
    expect(nabilaItem?.getAttribute('type')).toBe('button');
    expect(nabilaItem?.getAttribute('aria-expanded')).toBe('false');

    act(() => {
      nabilaItem!.click();
    });

    const expandedItem = dom.root.querySelector('[data-testid="contact-item-char_nabila"]');
    const callBtn = dom.root.querySelector('[data-testid="call-contact-char_nabila"]');
    expect(expandedItem?.getAttribute('aria-expanded')).toBe('true');
    expect(callBtn).not.toBeNull();
    expect(callBtn?.tagName.toUpperCase()).toBe('BUTTON');
    expect(expandedItem?.contains(callBtn as unknown as FakeNode)).toBe(false);
  });

  it('tabbed panels (Phone, Garage, Settings, Journal) expose role="tablist", role="tab", and aria-selected', () => {
    const gm = new GameManager({ seed: 1, mode: 'career', data: {} });
    const snapshot = gm.snapshot();
    const checkTabs = (vnode: ComponentChildren, expectedCount: number, name: string) => {
      act(() => {
        render(vnode, dom.root as unknown as Element);
      });
      const tablist = dom.root.querySelector('[role="tablist"]');
      expect(tablist, `${name} should have role="tablist"`).not.toBeNull();
      const tabs = dom.root.querySelectorAll('[role="tab"]');
      expect(tabs.length, `${name} should have ${expectedCount} tabs`).toBe(expectedCount);
      const selectedTabs = tabs.filter((el) => el.getAttribute('aria-selected') === 'true');
      expect(selectedTabs.length, `${name} should have exactly 1 aria-selected="true" tab`).toBe(1);
    };

    checkTabs(h(Phone, { isOpen: true, onClose: () => {} }), 5, 'Phone');
    checkTabs(h(Garage, { isOpen: true, onClose: () => {} }), 4, 'Garage');
    checkTabs(h(Settings, { isOpen: true, onClose: () => {} }), 3, 'Settings');
    checkTabs(h(Journal, { snapshot, activeMissions: [], getObjectiveStates: () => [], onClose: () => {} }), 3, 'Journal');
  });

  it('all close, zoom, slider, and delete controls have localized aria-label in EN and BN', () => {
    const saveSys = new SaveSystem(new MemoryStorageAdapter());
    const gm = new GameManager({ seed: 1, mode: 'career', data: {} });
    saveSys.save(gm, 'slot1');

    for (const lang of ['en', 'bn'] as const) {
      setLanguage(lang);

      // MapScreen zoom & close
      act(() => {
        render(h(MapScreen, { isOpen: true, onClose: () => {} }), dom.root as unknown as Element);
      });
      const zoomInLabel = dom.root.querySelector('[data-testid="map-zoom-in-btn"]')?.getAttribute('aria-label') ?? '';
      const zoomOutLabel = dom.root.querySelector('[data-testid="map-zoom-out-btn"]')?.getAttribute('aria-label') ?? '';
      const mapCloseLabel = dom.root.querySelector('[data-testid="map-close-btn"]')?.getAttribute('aria-label') ?? '';
      expect(zoomInLabel.length).toBeGreaterThan(2);
      expect(zoomInLabel).not.toBe('+');
      expect(zoomOutLabel.length).toBeGreaterThan(2);
      expect(zoomOutLabel).not.toBe('-');
      expect(mapCloseLabel.length).toBeGreaterThan(2);

      // Settings audio sliders & controls
      act(() => {
        render(h(Settings, { isOpen: true, initialTab: 'audio', onClose: () => {} }), dom.root as unknown as Element);
      });
      for (const tid of ['settings-master-vol', 'settings-sfx-vol', 'settings-ambient-vol', 'settings-mute', 'settings-close-btn']) {
        const lbl = dom.root.querySelector(`[data-testid="${tid}"]`)?.getAttribute('aria-label') ?? '';
        expect(lbl.trim().length, `${tid} missing aria-label in ${lang}`).toBeGreaterThan(1);
      }

      // SaveSlots close & delete buttons
      act(() => {
        render(
          h(SaveSlots, {
            isOpen: true,
            mode: 'save',
            onClose: () => {},
            onSelectSlot: () => {},
            saveSystem: saveSys,
          }),
          dom.root as unknown as Element
        );
      });
      const closeSaveLabel = dom.root.querySelector('[data-testid="btn-close-save-slots"]')?.getAttribute('aria-label') ?? '';
      const deleteSaveLabel = dom.root.querySelector('[data-testid="btn-delete-slot1"]')?.getAttribute('aria-label') ?? '';
      expect(closeSaveLabel.trim().length).toBeGreaterThan(1);
      expect(deleteSaveLabel.trim().length).toBeGreaterThan(1);
    }
  });

  it('setLanguage() dynamically flips document.documentElement.lang between bn and en', () => {
    setLanguage('bn');
    expect(document.documentElement.lang).toBe('bn');
    setLanguage('en');
    expect(document.documentElement.lang).toBe('en');
  });

  it('index.html viewport allows pinch-zoom (no user-scalable=no or maximum-scale=1.0)', () => {
    const html = fs.readFileSync('index.html', 'utf-8');
    expect(html).toContain('name="viewport"');
    expect(html).not.toMatch(/user-scalable\s*=\s*no/i);
    expect(html).not.toMatch(/maximum-scale\s*=\s*1(\.0)?/i);
  });

  it('loadSettings() respects prefers-reduced-motion when no saved setting exists, without overwriting explicit saved choice', () => {
    const prevStorage = globalThis.localStorage;
    const store = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
        removeItem: (k: string) => store.delete(k),
      },
    });
    (globalThis.window as unknown as { matchMedia?: (q: string) => { matches: boolean } }).matchMedia = (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
    });

    try {
      // 1. Fresh state with OS prefers-reduced-motion: reduce -> defaults to true
      resetSettingsMemoryForTest();
      const initial = loadSettings();
      expect(initial.reduceMotion).toBe(true);

      // 2. Explicit user choice reduceMotion: false saved in localStorage -> never overwritten by matchMedia
      saveSettings({ ...DEFAULT_SETTINGS, reduceMotion: false });
      const loadedExplicit = loadSettings();
      expect(loadedExplicit.reduceMotion).toBe(false);
    } finally {
      Object.defineProperty(globalThis, 'localStorage', {
        configurable: true,
        value: prevStorage,
      });
    }
  });
});
