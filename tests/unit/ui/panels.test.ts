import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, h } from 'preact';
import { KarmaPanel } from '../../../src/ui/karma/KarmaPanel';
import { UiSheet } from '../../../src/ui/sheet/UiSheet';
import { Journal } from '../../../src/ui/journal/Journal';
import {
  karmaPanelSignal,
  uiSheetSignal,
  journalSignal,
  karmaDataSignal,
  journalDataSignal,
  settingsSignal,
  DEFAULT_SETTINGS,
  exitToTitle,
} from '../../../src/ui/store';
import { bindUi } from '../../../src/ui/bindings';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { SaveSystem, MemoryStorageAdapter } from '../../../src/sim/save/SaveSystem';
import { CHARACTERS } from '../../../src/sim/passenger/PassengerAI';
import { setLanguage } from '../../../src/ui/i18n';
import { uiModalOpen } from '../../../src/ui/gamepadNav';
import { cloneDefaultBindings } from '../../../src/input/bindings';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

class FakeText {
  nodeType = 3;
  data: string;
  parentNode: FakeElement | null = null;
  constructor(data: string) {
    this.data = data;
  }
  get textContent(): string {
    return this.data;
  }
  set textContent(v: string) {
    this.data = v;
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

type FakeNode = FakeElement | FakeText;

class FakeElement {
  nodeType = 1;
  tagName: string;
  attributes: Record<string, string> = {};
  style: Record<string, string | number> = {};
  childNodes: FakeNode[] = [];
  parentNode: FakeElement | null = null;
  listeners: Record<string, Array<(e?: unknown) => void>> = {};
  value = '';
  checked = false;
  tabIndex = 0;

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 && idx + 1 < this.parentNode.childNodes.length
      ? this.parentNode.childNodes[idx + 1]!
      : null;
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }

  setAttribute(name: string, val: unknown): void {
    this.attributes[name] = String(val);
  }

  getAttribute(name: string): string | null {
    return name in this.attributes ? this.attributes[name]! : null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  addEventListener(type: string, cb: (e?: unknown) => void): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type]!.push(cb);
  }

  removeEventListener(type: string, cb: (e?: unknown) => void): void {
    const arr = this.listeners[type];
    if (!arr) return;
    this.listeners[type] = arr.filter((fn) => fn !== cb);
  }

  appendChild<T extends FakeNode>(child: T): T {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }

  insertBefore<T extends FakeNode>(child: T, ref: FakeNode | null): T {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    if (!ref) return this.appendChild(child);
    const idx = this.childNodes.indexOf(ref);
    if (idx === -1) return this.appendChild(child);
    this.childNodes.splice(idx, 0, child);
    child.parentNode = this;
    return child;
  }

  removeChild<T extends FakeNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  contains(target: FakeNode | null): boolean {
    if (target === this) return true;
    for (const c of this.childNodes) {
      if (c === target) return true;
      if (c instanceof FakeElement && c.contains(target)) return true;
    }
    return false;
  }

  click(): void {
    for (const cb of this.listeners.click ?? []) {
      cb.call(this, {
        type: 'click',
        target: this,
        currentTarget: this,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    }
  }

  focus(): void {}

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join('');
  }

  set textContent(v: string) {
    this.childNodes = v ? [new FakeText(String(v))] : [];
    for (const c of this.childNodes) c.parentNode = this;
  }

  querySelectorAll(selector: string): FakeElement[] {
    const results: FakeElement[] = [];
    const testIdMatch = /^\[data-testid="([^"]+)"\]$/.exec(selector);
    const visit = (el: FakeElement) => {
      if (testIdMatch) {
        if (el.getAttribute('data-testid') === testIdMatch[1]) {
          results.push(el);
        }
      } else if (el.tagName === selector.toUpperCase()) {
        results.push(el);
      }
      for (const c of el.childNodes) {
        if (c instanceof FakeElement) visit(c);
      }
    };
    for (const c of this.childNodes) {
      if (c instanceof FakeElement) visit(c);
    }
    return results;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

async function withFakeDom(fn: (root: FakeElement) => Promise<void> | void): Promise<void> {
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const fakeDoc = {
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
    createTextNode: (txt: string) => new FakeText(txt),
    activeElement: null,
  };
  (globalThis as Record<string, unknown>).document = fakeDoc;
  const root = new FakeElement('div');
  try {
    await fn(root);
  } finally {
    render(null, root as unknown as Element);
    (globalThis as Record<string, unknown>).document = prevDoc;
  }
}

function makeTestSession() {
  const net = RoadNetwork.fromDistricts([testloopData as unknown as DistrictData]);
  const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
  const session = new GameSession({ road: net, gm });
  const saveSystem = new SaveSystem(new MemoryStorageAdapter());
  return { gm, session, saveSystem };
}

describe('P6.3 KarmaPanel, UiSheet, Journal & Bindings', () => {
  beforeEach(() => {
    setLanguage('en');
    karmaPanelSignal.value = false;
    uiSheetSignal.value = false;
    journalSignal.value = false;
    karmaDataSignal.value = null;
    journalDataSignal.value = null;
    settingsSignal.value = {
      ...DEFAULT_SETTINGS,
      controls: cloneDefaultBindings(),
    };
  });

  it('KarmaPanel hides criminalExposure and evidenceExposure until > 0 and renders bounded meters, trust & last 20 events', async () => {
    await withFakeDom((root) => {
      const log = Array.from({ length: 24 }, (_, idx) => ({
        id: `karma_${idx + 1}`,
        day: 1,
        minute: 480 + idx * 10,
        meter: 'riderIntegrity' as const,
        delta: idx % 2 === 0 ? 4 : -2,
        applied: idx % 2 === 0 ? 4 : -2,
        reasonKey: 'karma.safe_trip',
      }));

      render(
        h(KarmaPanel, {
          isOpen: true,
          onClose: vi.fn(),
          relationships: { char_nabila: 25 },
          data: {
            meters: {
              riderIntegrity: 62,
              publicReputation: 45,
              platformStanding: 80,
              safetyRecord: 70,
              criminalExposure: 0,
              evidenceExposure: 0,
            },
            passengerTrust: { p_nabila: 68, p_farida: 40 },
            karmaLog: log,
            day: 2,
            appWarned: false,
            appSuspended: false,
            appSuspendedUntilDay: 0,
            promises: { kept: 2, broken: 0 },
          },
        }),
        root as unknown as Element
      );

      expect(root.querySelector('[data-testid="karma-panel"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="karma-meter-riderIntegrity"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="karma-meter-publicReputation"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="karma-meter-platformStanding"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="karma-meter-safetyRecord"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="karma-meter-criminalExposure"]')).toBeNull();
      expect(root.querySelector('[data-testid="karma-meter-evidenceExposure"]')).toBeNull();
      expect(root.querySelectorAll('[data-testid="karma-event-item"]').length).toBe(20);
      expect(root.querySelector('[data-testid="karma-passenger-trust"]')?.textContent).toContain('Nabila');

      // Now reveal both criminalExposure and evidenceExposure when > 0
      render(
        h(KarmaPanel, {
          isOpen: true,
          onClose: vi.fn(),
          data: {
            meters: {
              riderIntegrity: 50,
              publicReputation: 30,
              platformStanding: 75,
              safetyRecord: 60,
              criminalExposure: 15,
              evidenceExposure: 25,
            },
            passengerTrust: { p_nabila: 68 },
            karmaLog: [
              {
                id: 'karma_99',
                day: 2,
                minute: 615,
                meter: 'criminalExposure',
                delta: 15,
                applied: 15,
                reasonKey: 'karma.fled_police',
              },
            ],
            day: 2,
            appWarned: true,
            appSuspended: false,
            appSuspendedUntilDay: 0,
            promises: { kept: 2, broken: 1 },
          },
        }),
        root as unknown as Element
      );

      expect(root.querySelector('[data-testid="karma-meter-criminalExposure"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="karma-meter-evidenceExposure"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="karma-event-item"]')?.textContent).toContain('+15');
      expect(root.querySelector('[data-testid="karma-event-item"]')?.textContent).toContain('Fled police checkpoint');
    });
  });

  it('bindUi keeps karmaDataSignal live across karma/changed, reputation/changed, day/started, and state/restored', () => {
    const { gm, session, saveSystem } = makeTestSession();
    const cleanup = bindUi(session, saveSystem);

    try {
      expect(karmaDataSignal.value).not.toBeNull();
      const baseSafety = karmaDataSignal.value!.meters.safetyRecord;

      gm.reputationSystem.applyMeter('safetyRecord', 5, 'karma.safe_trip');
      expect(karmaDataSignal.value!.meters.safetyRecord).toBe(baseSafety + 5);
      expect(karmaDataSignal.value!.karmaLog[0]?.reasonKey).toBe('karma.safe_trip');

      gm.reputationSystem.applyMeter(
        'criminalExposure',
        12,
        'karma.fled_accident'
      );
      expect(karmaDataSignal.value!.meters.criminalExposure).toBe(12);

      // Save & restore resets/restores karma state synchronously via state/restored
      saveSystem.save(gm, 'slot1');
      gm.reputationSystem.applyMeter('riderIntegrity', -10, 'karma.overcharge');
      expect(karmaDataSignal.value!.meters.riderIntegrity).not.toBe(50);

      const loaded = saveSystem.loadGame('slot1', gm.data);
      expect(loaded.success).toBe(true);
      if (loaded.success) {
        gm.applySnapshot(loaded.gm.snapshot(), loaded.save.rngState);
      }
      expect(karmaPanelSignal.value).toBe(false);
      expect(uiSheetSignal.value).toBe(false);
      expect(karmaDataSignal.value!.meters.criminalExposure).toBe(12);

      gm.clock.day = 3;
      gm.bus.emit('day/started', { day: 3 });
      expect(karmaDataSignal.value!.day).toBe(3);
    } finally {
      cleanup();
    }
  });

  it('UiSheet links all overlays and reads dynamic settingsSignal.value.controls', async () => {
    await withFakeDom((root) => {
      const callbacks = {
        onOpenMap: vi.fn(),
        onOpenPhone: vi.fn(),
        onOpenGarage: vi.fn(),
        onOpenJournal: vi.fn(),
        onOpenKarma: vi.fn(),
        onOpenPause: vi.fn(),
        onOpenSettings: vi.fn(),
        onClose: vi.fn(),
      };

      const customControls = cloneDefaultBindings();
      customControls.keyboard.horn = ['KeyH'];
      customControls.keyboard.karma = ['KeyC'];
      settingsSignal.value = {
        ...DEFAULT_SETTINGS,
        controls: customControls,
        tiltControls: true,
      };

      render(h(UiSheet, { isOpen: true, ...callbacks }), root as unknown as Element);

      expect(root.querySelector('[data-testid="ui-sheet"]')).not.toBeNull();
      expect(root.querySelector('[data-testid="sheet-control-horn"]')?.textContent).toContain('H');
      expect(root.querySelector('[data-testid="sheet-control-karma"]')?.textContent).toContain('C');

      root.querySelector('[data-testid="sheet-link-map"]')?.click();
      root.querySelector('[data-testid="sheet-link-phone"]')?.click();
      root.querySelector('[data-testid="sheet-link-garage"]')?.click();
      root.querySelector('[data-testid="sheet-link-journal"]')?.click();
      root.querySelector('[data-testid="sheet-link-karma"]')?.click();
      root.querySelector('[data-testid="sheet-link-pause"]')?.click();
      root.querySelector('[data-testid="sheet-link-settings"]')?.click();

      expect(callbacks.onOpenMap).toHaveBeenCalledTimes(1);
      expect(callbacks.onOpenPhone).toHaveBeenCalledTimes(1);
      expect(callbacks.onOpenGarage).toHaveBeenCalledTimes(1);
      expect(callbacks.onOpenJournal).toHaveBeenCalledTimes(1);
      expect(callbacks.onOpenKarma).toHaveBeenCalledTimes(1);
      expect(callbacks.onOpenPause).toHaveBeenCalledTimes(1);
      expect(callbacks.onOpenSettings).toHaveBeenCalledTimes(1);
    });
  });

  it('Journal wraps in ModalPanel, lists all 10 characters, active promises, decisions, and unlocked opportunities', async () => {
    const { gm } = makeTestSession();
    gm.story.currentChapter = 3;
    gm.story.promises.push({
      id: 'promise_ch2_ma_rent',
      characterId: 'char_ma',
      descriptionKey: 'promise.ma_rent',
      dueDay: 3,
    });
    gm.story.branchFlags.ch1_completed = true;
    gm.story.branchFlags.ch2_regulars_known = true;
    gm.reputationSystem.changeRelationship('char_nabila', 20);
    const snap = gm.snapshot();

    await withFakeDom(async (root) => {
      render(
        h(Journal, {
          snapshot: snap,
          activeMissions: [],
          getObjectiveStates: () => [],
          onClose: vi.fn(),
        }),
        root as unknown as Element
      );

      const panel = root.querySelector('[data-testid="journal-panel"]');
      expect(panel).not.toBeNull();

      // Switch to Relationships tab -> all 10 characters must be present
      root.querySelector('[data-testid="journal-tab-relations"]')?.click();
      await new Promise((r) => setTimeout(r, 15));
      for (const charDef of CHARACTERS) {
        expect(root.querySelector(`[data-testid="journal-char-${charDef.id}"]`)).not.toBeNull();
      }
      expect(CHARACTERS.length).toBe(10);

      // Switch to Records tab -> active promises, recent decisions, unlocked opportunities (no testloop)
      root.querySelector('[data-testid="journal-tab-records"]')?.click();
      await new Promise((r) => setTimeout(r, 15));
      const promisesSec = root.querySelector('[data-testid="journal-promises-section"]');
      const decisionsSec = root.querySelector('[data-testid="journal-decisions-section"]');
      const oppsSec = root.querySelector('[data-testid="journal-opportunities-section"]');
      expect(promisesSec?.textContent).toBeTruthy();
      expect(decisionsSec?.textContent).toBeTruthy();
      expect(oppsSec?.textContent).toBeTruthy();
      expect(oppsSec?.textContent?.toLowerCase()).not.toContain('testloop');
    });
  });

  it('uiModalOpen blocks during karmaPanelSignal/uiSheetSignal and exitToTitle resets both', () => {
    karmaPanelSignal.value = true;
    expect(uiModalOpen(false)).toBe(true);
    karmaPanelSignal.value = false;

    uiSheetSignal.value = true;
    expect(uiModalOpen(false)).toBe(true);

    karmaPanelSignal.value = true;
    journalSignal.value = true;
    exitToTitle();
    expect(karmaPanelSignal.value).toBe(false);
    expect(uiSheetSignal.value).toBe(false);
    expect(journalSignal.value).toBe(false);
  });
});
