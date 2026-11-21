import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { render, h, type VNode } from 'preact';
import { act } from 'preact/test-utils';
import { Hud, HudView, type HudState } from '../../../src/ui/hud/Hud';
import { createHudCache, resolveHudEtaMinutes, syncHudWithCache } from '../../../src/ui/hud/hudSync';
import { ChoiceCardView } from '../../../src/ui/choice/ChoiceCard';
import {
  choiceSignal,
  dialogueSubtitleSignal,
  hudSignal,
  updateHudState,
  resetHudState,
  bindEventBusToStore,
} from '../../../src/ui/store';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { t, setLanguage } from '../../../src/ui/i18n';

describe('T2.8 & T4.10 Rider HUD and Mobile Polish', () => {
  beforeEach(() => {
    setLanguage('bn');
    resetHudState();
    choiceSignal.value = {
      active: false,
      prompt: '',
      options: [],
    };
  });

  it('initializes hudSignal with default state', () => {
    const state = hudSignal.value;

    expect(state.speedKmh).toBe(0);
    expect(state.fuelL).toBe(6.0);
    expect(state.fuelMaxL).toBe(8.0);
    expect(state.objectiveText).toBe('Waiting for ride requests...');
    expect(state.todayNetEarnings).toBe(0);
    expect(state.shiftClock).toBe('07:30');
    expect(state.rating).toBe(5.0);
    expect(state.isFirstPerson).toBe(false);
  });

  it('updates hudSignal with speed, fuel, earnings, and navigation instructions and skips identical updates', () => {
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

    expect(updateHudState(updatePayload)).toBe(true);
    const firstRef = hudSignal.value;
    expect(firstRef.speedKmh).toBe(42.5);
    expect(firstRef.fuelL).toBe(4.8);
    expect(firstRef.todayNetEarnings).toBe(350);
    expect(firstRef.shiftClock).toBe('09:15');
    expect(firstRef.shiftDay).toBe(2);
    expect(firstRef.rating).toBe(4.85);
    expect(firstRef.nextTurn?.direction).toBe('right');
    expect(firstRef.passengerStatus?.name).toBe('Salam Bhai');

    // Identical values do not reallocate hudSignal.value
    expect(updateHudState({ ...updatePayload })).toBe(false);
    expect(hudSignal.value).toBe(firstRef);
  });

  it('toggles isFirstPerson collapsed mode state', () => {
    expect(hudSignal.value.isFirstPerson).toBe(false);

    updateHudState({ isFirstPerson: true });
    expect(hudSignal.value.isFirstPerson).toBe(true);

    updateHudState({ isFirstPerson: false });
    expect(hudSignal.value.isFirstPerson).toBe(false);
  });

  it('provides bilingual HUD translations for keys', () => {
    setLanguage('bn');
    expect(t('hud.objective')).toBe('উদ্দেশ্য');
    expect(t('hud.speed_unit')).toBe('কিমি/ঘণ্টা');
    expect(t('hud.fuel')).toBe('জ্বালানি');
    expect(t('hud.earnings', { amount: 250 })).toBe('আজকের আয়: ৳250');
    expect(t('hud.fullscreen')).toBe('পূর্ণপর্দা');

    setLanguage('en');
    expect(t('hud.objective')).toBe('Objective');
    expect(t('hud.speed_unit')).toBe('KM / H');
    expect(t('hud.fuel')).toBe('Fuel');
    expect(t('hud.earnings', { amount: 250 })).toBe("Today's Net: ৳250");
    expect(t('hud.fullscreen')).toBe('Fullscreen');
  });

  it('T4.10: applies safe-area insets to standard HudView', () => {
    const vnode = HudView({
      state: {
        speedKmh: 30,
        fuelL: 5.5,
        fuelMaxL: 8.0,
        objectiveText: 'Head to Fulgate',
        todayNetEarnings: 200,
        shiftClock: '08:00',
        shiftDay: 1,
        rating: 5.0,
      },
    });

    expect(vnode).not.toBeNull();
    const style = vnode.props.style as Record<string, unknown>;
    expect(style.padding).toContain('env(safe-area-inset-top, 0px)');
    expect(style.padding).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it('T4.10: applies safe-area insets to first-person HudView', () => {
    const vnode = HudView({
      state: {
        speedKmh: 30,
        fuelL: 5.5,
        fuelMaxL: 8.0,
        objectiveText: 'Head to Fulgate',
        todayNetEarnings: 200,
        shiftClock: '08:00',
        shiftDay: 1,
        rating: 5.0,
        isFirstPerson: true,
      },
    });

    expect(vnode).not.toBeNull();
    const style = vnode.props.style as Record<string, unknown>;
    expect(style.padding).toContain('env(safe-area-inset-top, 0px)');
    expect(style.padding).toContain('env(safe-area-inset-bottom, 0px)');
  });

  it('T4.10: ChoiceCard satisfies safe area and thumb clearance constraints', () => {
    choiceSignal.value = {
      active: true,
      instanceId: 'event-1',
      prompt: 'Narrow road blocked by cattle truck',
      options: [
        { id: 'short', text: 'Take footpath shortcut' },
        { id: 'wait', text: 'Wait for clearance' },
      ],
    };

    const vnode = ChoiceCardView({ choice: choiceSignal.value, onChoose: () => {} });
    expect(vnode).not.toBeNull();
    const style = vnode?.props.style as Record<string, unknown>;
    expect(style.top).toBe('50%');
    expect(style.transform).toBe('translate(-50%, -50%)');
    expect(style.maxHeight).toContain('100dvh');
    expect(style.maxHeight).toContain('var(--safe-top, 0px)');
    expect(style.maxHeight).toContain('var(--safe-bottom, 0px)');
  });
});

describe('T8.3 fuel recovery affordances', () => {
  beforeEach(() => {
    resetHudState();
  });

  const base: HudState = {
    speedKmh: 0, fuelL: 4, fuelMaxL: 8, objectiveText: '', todayNetEarnings: 0,
    shiftClock: '08:00', shiftDay: 1, rating: 5,
  };
  /** Collects data-testid values by expanding function components (no DOM available). */
  const testIds = (s: Partial<HudState>): Set<string> => {
    const ids = new Set<string>();
    const walk = (n: unknown): void => {
      if (Array.isArray(n)) return n.forEach(walk);
      if (!n || typeof n !== 'object') return;
      const v = n as VNode<Record<string, unknown>>;
      const props = v.props ?? {};
      if (typeof props['data-testid'] === 'string') ids.add(props['data-testid']);
      if (typeof v.type === 'function') walk((v.type as (p: unknown) => unknown)(props));
      else walk(props.children);
    };
    walk(HudView({ state: { ...base, ...s } }));
    return ids;
  };

  it('shows no fuel actions with a healthy tank away from a station', () => {
    const ids = testIds({});
    expect(ids.has('hud-btn-refuel')).toBe(false);
    expect(ids.has('hud-btn-fuel-rescue')).toBe(false);
  });

  it('offers refuel only at a station and rescue only on an empty tank', () => {
    const near = testIds({ nearStation: true });
    expect(near.has('hud-btn-refuel')).toBe(true);
    expect(near.has('hud-btn-fuel-rescue')).toBe(false);

    const empty = testIds({ fuelL: 0 });
    expect(empty.has('hud-btn-fuel-rescue')).toBe(true);
    expect(empty.has('hud-fuel-empty')).toBe(true);
  });

  it('renders uturn icon ↶ in both third-person and first-person HUD views', () => {
    const collectText = (n: unknown, out: string[] = []): string[] => {
      if (typeof n === 'string' || typeof n === 'number') {
        out.push(String(n));
      } else if (Array.isArray(n)) {
        for (const c of n) collectText(c, out);
      } else if (n && typeof n === 'object') {
        const v = n as VNode<Record<string, unknown>>;
        if (typeof v.type === 'function') {
          collectText((v.type as (p: unknown) => unknown)(v.props ?? {}), out);
        } else {
          collectText(v.props?.children, out);
        }
      }
      return out;
    };

    const third = collectText(
      HudView({
        state: {
          ...base,
          isFirstPerson: false,
          nextTurn: { direction: 'uturn', text: 'Make a U-turn' },
        },
      })
    );
    expect(third).toContain('↶');

    const first = collectText(
      HudView({
        state: {
          ...base,
          isFirstPerson: true,
          nextTurn: { direction: 'uturn', text: 'Make a U-turn' },
        },
      })
    );
    expect(first).toContain('↶');
  });

  it('P4.1 subscribes HUD subtitle signal to passenger/dialogue events', () => {
    const bus = new EventBus<GameEvents>();
    const unbind = bindEventBusToStore(bus);

    bus.emit('passenger/dialogue', {
      requestId: 'req_sub_1',
      key: 'dialogue.pool.commuter.small_talk.01',
      text: 'Test subtitle line',
      phase: 'small_talk',
      speaker: 'character.tanvir.name',
    });

    expect(dialogueSubtitleSignal.value).not.toBeNull();
    expect(dialogueSubtitleSignal.value?.text).toBe('Test subtitle line');
    expect(dialogueSubtitleSignal.value?.speaker).toBe('character.tanvir.name');
    expect(hudSignal.value.dialogueSubtitle?.text).toBe('Test subtitle line');

    unbind();
  });

  it('P6.1: detects shiftDay changes even when shiftClock is identical', () => {
    expect(hudSignal.value.shiftDay).toBe(1);
    expect(updateHudState({ shiftDay: 2, shiftClock: '07:30' }, 1016)).toBe(true);
    expect(hudSignal.value.shiftDay).toBe(2);
    expect(hudSignal.value.shiftClock).toBe('07:30');
  });

  it('P6.1: applies priority lifecycle updates immediately inside the 50ms telemetry throttle window', () => {
    expect(updateHudState({ speedKmh: 25 }, 1000)).toBe(true);

    // Within 50ms window: priority fields must never be dropped
    expect(updateHudState({ objectiveText: 'Drop off at Fulgate' }, 1010)).toBe(true);
    expect(hudSignal.value.objectiveText).toBe('Drop off at Fulgate');

    expect(updateHudState({ nextTurn: { direction: 'uturn', text: 'Take U-turn' } }, 1020)).toBe(true);
    expect(hudSignal.value.nextTurn?.direction).toBe('uturn');

    expect(updateHudState({ passengerStatus: { status: 'OnTrip', name: 'Nabila' } }, 1030)).toBe(true);
    expect(hudSignal.value.passengerStatus?.status).toBe('OnTrip');

    expect(updateHudState({ roadEventAlert: { title: 'Waterlogging', kind: 'waterlogging' } }, 1040)).toBe(true);
    expect(hudSignal.value.roadEventAlert?.kind).toBe('waterlogging');
  });

  it('P6.1: throttles high-frequency numeric telemetry within 50ms and resets timer in resetHudState()', () => {
    expect(updateHudState({ speedKmh: 10 }, 1000)).toBe(true);
    expect(hudSignal.value.speedKmh).toBe(10);

    // 20ms later with only numeric telemetry change -> throttled
    expect(updateHudState({ speedKmh: 18 }, 1020)).toBe(false);
    expect(hudSignal.value.speedKmh).toBe(10);

    // 55ms after last push -> allowed
    expect(updateHudState({ speedKmh: 22 }, 1055)).toBe(true);
    expect(hudSignal.value.speedKmh).toBe(22);

    // resetHudState() resets the throttle timer so a numeric update at 1060ms (only 5ms later) succeeds
    resetHudState();
    expect(updateHudState({ speedKmh: 12 }, 1060)).toBe(true);
    expect(hudSignal.value.speedKmh).toBe(12);
  });

  it('P6.1: reattaches minimap canvas inside [data-testid="hud-minimap-host"] across 3rd -> 1st -> 3rd camera toggles', () => {
    class MiniText {
      nodeType = 3;
      nodeName = '#text';
      parentNode: MiniEl | null = null;
      data: string;
      constructor(t: string) {
        this.data = t;
      }
      get nextSibling(): MiniText | MiniEl | null {
        if (!this.parentNode) return null;
        const i = this.parentNode.childNodes.indexOf(this);
        return i >= 0 && i + 1 < this.parentNode.childNodes.length ? this.parentNode.childNodes[i + 1]! : null;
      }
      remove(): void {
        this.parentNode?.removeChild(this);
      }
    }
    class MiniEl {
      nodeType = 1;
      tagName: string;
      nodeName: string;
      parentNode: MiniEl | null = null;
      childNodes: Array<MiniEl | MiniText> = [];
      attributes = new Map<string, string>();
      style: Record<string, string> = {};
      constructor(tag: string) {
        this.tagName = tag.toUpperCase();
        this.nodeName = this.tagName;
      }
      get firstChild(): MiniEl | MiniText | null {
        return this.childNodes[0] ?? null;
      }
      get nextSibling(): MiniEl | MiniText | null {
        if (!this.parentNode) return null;
        const i = this.parentNode.childNodes.indexOf(this);
        return i >= 0 && i + 1 < this.parentNode.childNodes.length ? this.parentNode.childNodes[i + 1]! : null;
      }
      get isConnected(): boolean {
        if (this === body) return true;
        let cur: MiniEl | null = this.parentNode;
        while (cur) {
          if (cur === body) return true;
          cur = cur.parentNode;
        }
        return false;
      }
      set id(v: string) {
        this.attributes.set('id', v);
      }
      get id() {
        return this.attributes.get('id') ?? '';
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
      appendChild<T extends MiniEl | MiniText>(n: T): T {
        return this.insertBefore(n, null);
      }
      insertBefore<T extends MiniEl | MiniText>(n: T, ref: MiniEl | MiniText | null): T {
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
      removeChild<T extends MiniEl | MiniText>(n: T): T {
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
      addEventListener() {}
      removeEventListener() {}
      contains(node: MiniEl | MiniText | null): boolean {
        let cur: MiniEl | MiniText | null = node;
        while (cur) {
          if (cur === this) return true;
          cur = cur.parentNode;
        }
        return false;
      }
      querySelector(sel: string): MiniEl | null {
        const match = /^\[data-testid="([^"]+)"\]$/.exec(sel);
        for (const c of this.childNodes) {
          if (c instanceof MiniEl) {
            if (match && c.getAttribute('data-testid') === match[1]) return c;
            const found = c.querySelector(sel);
            if (found) return found;
          }
        }
        return null;
      }
    }

    const body = new MiniEl('body');
    const root = new MiniEl('div');
    body.appendChild(root);
    const fakeCanvas = new MiniEl('canvas');
    fakeCanvas.id = 'minimap-canvas';

    const prevDoc = globalThis.document;
    globalThis.document = {
      body,
      createElement: (tag: string) => new MiniEl(tag),
      createElementNS: (_ns: string, tag: string) => new MiniEl(tag),
      createTextNode: (t: string) => new MiniText(t),
    } as unknown as Document;

    try {
      act(() => {
        updateHudState({ isFirstPerson: false });
        render(
          h(Hud, { minimapCanvas: fakeCanvas as unknown as HTMLCanvasElement }),
          root as unknown as Element
        );
      });

      const host1 = root.querySelector('[data-testid="hud-minimap-host"]');
      expect(host1).not.toBeNull();
      expect(fakeCanvas.isConnected).toBe(true);
      expect(host1?.contains(fakeCanvas)).toBe(true);

      // Toggle to firstPerson
      act(() => {
        updateHudState({ isFirstPerson: true });
        render(
          h(Hud, { minimapCanvas: fakeCanvas as unknown as HTMLCanvasElement }),
          root as unknown as Element
        );
      });

      expect(root.querySelector('[data-testid="hud-first-person"]')).not.toBeNull();
      expect(fakeCanvas.isConnected).toBe(false);

      // Toggle back to thirdPerson -> minimapCanvas MUST reattach into the new host
      act(() => {
        updateHudState({ isFirstPerson: false });
        render(
          h(Hud, { minimapCanvas: fakeCanvas as unknown as HTMLCanvasElement }),
          root as unknown as Element
        );
      });

      const host2 = root.querySelector('[data-testid="hud-minimap-host"]');
      expect(host2).not.toBeNull();
      expect(fakeCanvas.isConnected).toBe(true);
      expect(host2?.contains(fakeCanvas)).toBe(true);
    } finally {
      act(() => {
        render(null, root as unknown as Element);
      });
      globalThis.document = prevDoc;
    }
  });

  it('P6.1 R1: invalidates hudCache on runtime setLanguage(bn <-> en) even when keys are unchanged, and keeps steady-state zero-alloc', () => {
    setLanguage('bn');
    const cache = createHudCache();

    const makeInput = () => ({
      now: 1000,
      simStepped: false,
      isFirstPerson: false,
      objectiveKey: 'hud.waiting_for_requests',
      placeKey: 'poi.mirpara.tea_stall',
      navKind: 'uturn',
      navTextKey: 'hud.nav.uturn',
      navDistM: 120,
      reqId: 'req_1',
      passengerStatus: 'OnTrip' as const,
      passengerNameKey: 'character.tanvir.name',
      roadEventId: 'ev_water_1',
      roadEventKind: 'waterlogging',
      roadEventTitles: { bn: 'জলাবদ্ধতা', en: 'Waterlogging' },
      activeMissionCount: 1,
      pollMissions: () => ({
        main: {
          id: 'm1',
          titleKey: 'mission_01_title',
          objectiveDescKey: 'mission_01_obj',
          progress: 0,
          target: 1,
        },
        side: [],
      }),
      fare: 120,
      etaMinutes: 8,
      nearStation: false,
      chargeSpot: null,
      todayNetEarnings: 250,
      shiftClock: '08:30',
      shiftDay: 1,
      rating: 4.9,
      dialogueSubtitle: null,
      speedKmh: 30,
      fuelL: 5.0,
      fuelMaxL: 8.0,
      conditionPct: 95,
    });

    // Initial Bangla sync
    syncHudWithCache(cache, makeInput());
    const bnState = hudSignal.value;
    expect(bnState.objectiveText).toBe(t('hud.waiting_for_requests', { place: t('poi.mirpara.tea_stall') }));
    expect(bnState.roadEventAlert?.title).toBe('জলাবদ্ধতা');
    expect(bnState.passengerStatus?.name).toBe(t('character.tanvir.name'));

    // Steady-state frame with identical state -> no signal update
    syncHudWithCache(cache, { ...makeInput(), now: 1016 });
    expect(hudSignal.value).toBe(bnState);

    // Runtime locale toggle (bn -> en) without changing keys/IDs or settingsSignal
    setLanguage('en');
    syncHudWithCache(cache, { ...makeInput(), now: 1032 });
    const enState = hudSignal.value;
    expect(enState).not.toBe(bnState);
    expect(enState.objectiveText).toBe(t('hud.waiting_for_requests', { place: t('poi.mirpara.tea_stall') }));
    expect(enState.roadEventAlert?.title).toBe('Waterlogging');
    expect(enState.passengerStatus?.name).toBe(t('character.tanvir.name'));

    // Switch back en -> bn
    setLanguage('bn');
    syncHudWithCache(cache, { ...makeInput(), now: 1048 });
    expect(hudSignal.value.roadEventAlert?.title).toBe('জলাবদ্ধতা');
  });

  it('P6.1 R1: clears minimapCanvasSignal on pagehide teardown in src/main.ts', () => {
    const mainSrc = fs.readFileSync('src/main.ts', 'utf-8');
    expect(mainSrc).toContain('minimapCanvasSignal.value = null');
  });

  it('P6.1 R1: resets hudCache on state/restored and refreshes on roadEventKind change', () => {
    setLanguage('en');
    const bus = new EventBus<GameEvents>();
    const unbind = bindEventBusToStore(bus);
    const cache = createHudCache();

    let pollCount = 0;
    const baseInput = {
      now: 1000,
      simStepped: false,
      isFirstPerson: false,
      objectiveKey: 'hud.waiting_for_requests',
      placeKey: '',
      navKind: '',
      navTextKey: '',
      navDistM: -1,
      reqId: '',
      passengerStatus: 'None' as const,
      roadEventId: 'ev_1',
      roadEventKind: 'waterlogging',
      roadEventTitles: { en: 'Waterlogging', bn: 'জলাবদ্ধতা' },
      activeMissionCount: 1,
      pollMissions: () => {
        pollCount++;
        return { main: null, side: [] };
      },
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

    syncHudWithCache(cache, baseInput);
    expect(pollCount).toBe(1);
    expect(hudSignal.value.roadEventAlert?.kind).toBe('waterlogging');

    // roadEventKind change with same roadEventId updates alert
    syncHudWithCache(cache, {
      ...baseInput,
      now: 1016,
      roadEventKind: 'roadblock',
      roadEventTitles: { en: 'Roadblock', bn: 'অবরোধ' },
    });
    expect(hudSignal.value.roadEventAlert?.kind).toBe('roadblock');
    expect(hudSignal.value.roadEventAlert?.title).toBe('Roadblock');

    // state/restored resets hudState + invalidates hudCache so missions re-poll on next sync
    bus.emit('state/restored', {});
    syncHudWithCache(cache, { ...baseInput, now: 1032 });
    expect(pollCount).toBe(2);

    unbind();
  });

  it('P6.2: syncs districtId, gear, passengerMood, canRecoverBike, and 0.01L / rescueBelowL fuel diff', () => {
    setLanguage('en');
    const cache = createHudCache();
    const baseInput = {
      now: 1000,
      simStepped: true,
      isFirstPerson: false,
      districtId: 'mirpara',
      canRecoverBike: true,
      gear: 4,
      objectiveKey: 'hud.waiting_for_requests',
      placeKey: '',
      navKind: 'uturn',
      navTextKey: 'hud.nav.turn_around',
      navDistM: 25,
      reqId: 'req_p62',
      passengerStatus: 'OnTrip' as const,
      passengerNameKey: 'character.nabila.name',
      passengerMood: 0.85,
      roadEventId: '',
      roadEventKind: '',
      activeMissionCount: 0,
      pollMissions: () => ({ main: null, side: [] }),
      fare: 120,
      etaMinutes: 4.5,
      nearStation: false,
      chargeSpot: null,
      todayNetEarnings: 0,
      shiftClock: '08:10',
      shiftDay: 1,
      rating: 4.9,
      dialogueSubtitle: { speaker: 'Nabila', text: 'Cholen!', seq: 1 },
      speedKmh: 38,
      fuelL: 4.0,
      fuelMaxL: 8.0,
      conditionPct: 74,
    };

    syncHudWithCache(cache, baseInput);
    expect(hudSignal.value.districtId).toBe('mirpara');
    expect(hudSignal.value.districtName).toBe('Mirpara');
    expect(hudSignal.value.gear).toBe(4);
    expect(hudSignal.value.passengerStatus?.mood).toBe(0.85);
    expect(hudSignal.value.canRecoverBike).toBe(true);
    expect(hudSignal.value.dialogueSubtitle?.text).toBe('Cholen!');

    // 0.02L change propagates (0.01L precision instead of 0.1L quantization)
    const refBefore = hudSignal.value;
    updateHudState({ fuelL: 3.98 });
    expect(hudSignal.value).not.toBe(refBefore);
    expect(hudSignal.value.fuelL).toBe(3.98);
  });

  it('P6.2 fix: keeps etaMinutes === 0 within 15m of target instead of reverting to estimatedDuration and renders 0 min cleanly', () => {
    expect(resolveHudEtaMinutes(true, 0, 14)).toBe(0);
    expect(resolveHudEtaMinutes(true, undefined, 14)).toBe(14);
    expect(resolveHudEtaMinutes(false, 0, 14)).toBeUndefined();

    const collectText = (n: unknown, out: string[] = []): string[] => {
      if (typeof n === 'string' || typeof n === 'number') out.push(String(n));
      else if (Array.isArray(n)) n.forEach((c) => collectText(c, out));
      else if (n && typeof n === 'object') {
        const v = n as VNode<Record<string, unknown>>;
        if (typeof v.type === 'function') collectText((v.type as (p: unknown) => unknown)(v.props ?? {}), out);
        else collectText(v.props?.children, out);
      }
      return out;
    };

    setLanguage('en');
    const enText = collectText(
      HudView({
        state: {
          ...base,
          etaMinutes: 0,
          passengerStatus: { status: 'OnTrip', name: 'Nabila' },
        },
      })
    ).join('');
    expect(enText).toContain('0 min');

    setLanguage('bn');
    const bnText = collectText(
      HudView({
        state: {
          ...base,
          etaMinutes: 0,
          passengerStatus: { status: 'OnTrip', name: 'নাবিলা' },
        },
      })
    ).join('');
    expect(bnText).toContain('০ মি.');
  });

  it('P6.2 fix: avoids wasted priorityChanged on unchanged mission poll and localizes navDistM', () => {
    setLanguage('bn');
    const cache = createHudCache();
    let missionProgress = 0;
    const makeInput = (now: number, speedKmh = 20) => ({
      now,
      simStepped: true,
      isFirstPerson: false,
      objectiveKey: 'hud.waiting_for_requests',
      placeKey: '',
      navKind: 'left',
      navTextKey: 'nav.left',
      navDistM: 120,
      reqId: '',
      passengerStatus: 'None' as const,
      roadEventId: '',
      roadEventKind: '',
      activeMissionCount: 1,
      pollMissions: () => ({
        main: {
          id: 'm1',
          titleKey: 'mission_01_title',
          objectiveDescKey: 'mission_01_obj',
          progress: missionProgress,
          target: 2,
          targetDistM: 45,
        },
        side: [],
      }),
      fare: undefined,
      etaMinutes: undefined,
      nearStation: false,
      chargeSpot: null,
      todayNetEarnings: 0,
      shiftClock: '08:00',
      shiftDay: 1,
      rating: 5.0,
      dialogueSubtitle: null,
      speedKmh,
      fuelL: 6.0,
      fuelMaxL: 8.0,
      conditionPct: 100,
    });

    expect(syncHudWithCache(cache, makeInput(1000))).toBe(true);
    expect(hudSignal.value.nextTurn?.text).toContain('১২০');
    expect(hudSignal.value.nextTurn?.text).not.toContain('120');

    const refAt1000 = hudSignal.value;
    // Push telemetry at 1070 so 1100 is inside the 50ms telemetry throttle window.
    expect(syncHudWithCache(cache, makeInput(1070, 25))).toBe(true);
    const refAt1070 = hudSignal.value;
    expect(refAt1070).not.toBe(refAt1000);

    // At 1100, mission poll fires (>= 100ms since 1000) with IDENTICAL mission and telemetry inside 50ms window -> throttled!
    expect(syncHudWithCache(cache, makeInput(1100, 30))).toBe(false);
    expect(hudSignal.value).toBe(refAt1070);

    // At 1200, mission poll fires with CHANGED mission progress while inside 50ms of a telemetry push at 1170 -> immediate priority push!
    expect(syncHudWithCache(cache, makeInput(1170, 35))).toBe(true);
    missionProgress = 1;
    expect(syncHudWithCache(cache, makeInput(1200, 35))).toBe(true);
    expect(hudSignal.value.activeMission?.progress).toBe(1);
  });
});
