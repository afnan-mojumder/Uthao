import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { VNode } from 'preact';
import { HudView, type HudState } from '../../../src/ui/hud/Hud';
import { SaveSlots } from '../../../src/ui/menus/SaveSlots';
import { Contacts } from '../../../src/ui/phone/Contacts';
import { activateOverlayTrap } from '../../../src/ui/focusTrap';
import { SaveSystem, MemoryStorageAdapter } from '../../../src/sim/save/SaveSystem';
import { GameManager } from '../../../src/sim/GameManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import {
  bindEventBusToStore,
  choiceSignal,
  dismissChoiceOutcome,
  phoneSignal,
} from '../../../src/ui/store';
import { setLanguage } from '../../../src/ui/i18n';
import type { RideRequest } from '../../../src/core/types';

function collectText(node: unknown): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  const vnode = node as { props?: { children?: unknown }; type?: unknown };
  if (typeof vnode.type === 'function') {
    const fn = vnode.type as (props: Record<string, unknown>) => unknown;
    return collectText(fn(vnode.props ?? {}));
  }
  return vnode.props ? collectText(vnode.props.children) : '';
}

function findByTestId(node: unknown, id: string): VNode<Record<string, unknown>> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByTestId(child, id);
      if (found) return found;
    }
    return null;
  }
  const vnode = node as VNode<Record<string, unknown>>;
  if (vnode.props?.['data-testid'] === id) return vnode;
  if (typeof vnode.type === 'function') {
    const fn = vnode.type as (props: Record<string, unknown>) => unknown;
    const rendered = fn(vnode.props ?? {});
    const found = findByTestId(rendered, id);
    if (found) return found;
  }
  return vnode.props?.children ? findByTestId(vnode.props.children, id) : null;
}

const BASE_HUD_STATE: HudState = {
  speedKmh: 28,
  fuelL: 4.5,
  fuelMaxL: 8.0,
  objectiveText: 'Cruise Mirpara',
  todayNetEarnings: 120,
  shiftClock: '08:15',
  shiftDay: 1,
  rating: 4.9,
  passengerStatus: { status: 'None' },
};

const MOCK_REQUEST: RideRequest = {
  requestId: 'req_cap_test',
  passengerId: 'p_cap',
  pickupNodeId: 'n1',
  destinationNodeId: 'n2',
  initialFare: 110,
  estimatedDistance: 1.5,
  estimatedDuration: 6,
  requestedArrivalTime: null,
  bookingType: 'app',
  status: 'Negotiating',
  surge: 1.0,
};

describe('Audit overhaul UI & state fixes', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  afterEach(() => {
    setLanguage('en');
    dismissChoiceOutcome();
    phoneSignal.value = {
      ...phoneSignal.value,
      open: false,
      incomingRequest: null,
      requestQueue: [],
      unreadCount: 0,
    };
  });

  it('HudView renders Available/প্রস্তুত pill in Free Roam and mood percentage during active rides', () => {
    setLanguage('en');
    const freeRoamEn = HudView({ state: BASE_HUD_STATE });
    const pillEn = findByTestId(freeRoamEn, 'hud-passenger-mood');
    expect(pillEn).not.toBeNull();
    expect(collectText(pillEn).trim()).toBe('Available');

    setLanguage('bn');
    const freeRoamBn = HudView({ state: BASE_HUD_STATE });
    const pillBn = findByTestId(freeRoamBn, 'hud-passenger-mood');
    expect(collectText(pillBn).trim()).toBe('প্রস্তুত');

    setLanguage('en');
    const activeTrip = HudView({
      state: {
        ...BASE_HUD_STATE,
        passengerStatus: { status: 'OnTrip', name: 'Nabila', mood: 0.72 },
      },
    });
    const activePill = findByTestId(activeTrip, 'hud-passenger-mood');
    expect(collectText(activePill)).toContain('72%');
    expect(collectText(activePill)).not.toContain('Available');
  });

  it('caps phone unreadCount at 9 when ride requests arrive behind an active ChoiceCard', () => {
    const bus = new EventBus<GameEvents>();
    const unbind = bindEventBusToStore(bus);
    try {
      choiceSignal.value = {
        active: true,
        prompt: 'enc.test',
        options: [{ id: 'a', text: 'opt' }],
        instanceId: 'enc_unread_cap',
      };
      for (let i = 1; i <= 14; i++) {
        bus.emit('ride/requested', {
          request: { ...MOCK_REQUEST, requestId: `req_cap_${i}` },
        });
      }
      expect(phoneSignal.value.unreadCount).toBe(9);
    } finally {
      unbind();
    }
  });

  it('SaveSlots disables overwriting auto slot in save mode while allowing loading auto slot in load mode', () => {
    const memory = new MemoryStorageAdapter();
    const system = new SaveSystem(memory);
    const gm = new GameManager({ seed: 101, mode: 'career', data: {} });
    gm.clock.day = 2;
    system.save(gm, 'auto');

    const onSaveSelect = vi.fn();
    const saveView = SaveSlots({
      isOpen: true,
      mode: 'save',
      onClose: vi.fn(),
      onSelectSlot: onSaveSelect,
      saveSystem: system,
    });
    const autoRowSave = findByTestId(saveView, 'save-slot-auto');
    const autoBtnSave = findByTestId(saveView, 'btn-action-save-auto');
    expect(autoBtnSave).not.toBeNull();
    expect(autoBtnSave?.props?.disabled).toBe(true);
    (autoRowSave?.props?.onClick as (() => void) | undefined)?.();
    (autoBtnSave?.props?.onClick as ((e: { stopPropagation: () => void }) => void) | undefined)?.({
      stopPropagation: () => {},
    });
    expect(onSaveSelect).not.toHaveBeenCalled();

    const onLoadSelect = vi.fn();
    const loadView = SaveSlots({
      isOpen: true,
      mode: 'load',
      onClose: vi.fn(),
      onSelectSlot: onLoadSelect,
      saveSystem: system,
    });
    const autoRowLoad = findByTestId(loadView, 'save-slot-auto');
    expect(findByTestId(loadView, 'btn-action-load-auto')).not.toBeNull();
    (autoRowLoad?.props?.onClick as (() => void) | undefined)?.();
    expect(onLoadSelect).toHaveBeenCalledWith('auto');
  });

  it('Contacts omits duplicate role badge when character role matches character name in Bengali', () => {
    setLanguage('bn');
    const view = Contacts({ relationships: { char_ma: 85 } });
    const maBtn = findByTestId(view, 'contact-item-char_ma');
    expect(maBtn).not.toBeNull();
    const text = collectText(maBtn);
    const occurrences = text.match(/মা/g)?.length ?? 0;
    expect(occurrences).toBe(1);
  });

  it('activateOverlayTrap prioritizes [data-autofocus="true"] over earlier close/skip buttons', () => {
    const prevDoc = (globalThis as Record<string, unknown>).document;
    const focused: string[] = [];

    const mkBtn = (id: string, autofocus = false) => ({
      id,
      nodeType: 1,
      disabled: false,
      dataset: autofocus ? { autofocus: 'true' } : {},
      hasAttribute: () => false,
      setAttribute: () => {},
      removeAttribute: () => {},
      getAttribute: () => null,
      closest: () => null,
      focus: () => {
        focused.push(id);
      },
      contains: () => false,
    });

    const closeBtn = mkBtn('modal-close');
    const primaryBtn = mkBtn('modal-primary', true);
    const overlay = {
      parentElement: {
        children: [] as unknown[],
      },
      previousElementSibling: null,
      contains: () => false,
      focus: () => {
        focused.push('overlay');
      },
      querySelectorAll: () => [closeBtn, primaryBtn],
    };
    overlay.parentElement.children = [overlay];

    (globalThis as Record<string, unknown>).document = {
      activeElement: null,
      body: overlay.parentElement,
      addEventListener: () => {},
      removeEventListener: () => {},
    };

    try {
      const release = activateOverlayTrap(overlay as unknown as HTMLElement);
      expect(focused).toEqual(['modal-primary']);
      release();
    } finally {
      if (prevDoc === undefined) {
        delete (globalThis as Record<string, unknown>).document;
      } else {
        (globalThis as Record<string, unknown>).document = prevDoc;
      }
    }
  });
});
