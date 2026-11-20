// Gamepad driving of the UI. Menus, dialogue choices, the phone, the map and
// pause are reached through the same keyboard command path the keys use, so
// a button and its key can never disagree.
//
// Mapping (standard gamepad layout):
//   D-pad / left stick  move focus (menus only; while driving the stick steers)
//   A                   click the focused control (menus); choice 1 (choices)
//   B                   back: Escape
//   X, Y                choices 3 and 4 (choice cards only)
//   Start               pause / resume (Escape)
//   LB                  phone (Tab)
//   RB                  map (M)
//   Select              camera (handled in main.ts from InputManager)

import { GamepadEdges, pickNeighbor, type Box, type NavDir } from '../input/gamepadNav';
import { loadBindings, SETTINGS_STORAGE_KEY } from '../input/bindings';
import type { InputBindings } from '../input/types';
import { effect } from '@preact/signals';
import {
  choiceSignal,
  contextLostSignal,
  dayEndSignal,
  endingSignal,
  garageSignal,
  isGamepadRebindingSignal,
  journalSignal,
  karmaPanelSignal,
  uiSheetSignal,
  loadingSignal,
  negotiationSignal,
  pausedSignal,
  phoneSignal,
  rotateOverlaySignal,
  saveSlotsSignal,
  screenSignal,
  settingsOpenSignal,
  settingsSignal,
  tripSummarySignal,
  tutorialSignal,
  unsupportedSignal,
  chooseChoiceOption,
} from './store';

const BTN_CONFIRM = 0;
const BTN_BACK = 1;

const FOCUSABLE =
  'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** True when any system overlay (`Z_LAYER.SYSTEM_OVERLAY`) owns the entire screen. */
export function hasSystemOverlay(): boolean {
  return (
    loadingSignal.value.active ||
    contextLostSignal.value ||
    rotateOverlaySignal.value ||
    Boolean(unsupportedSignal.value)
  );
}

/** True when a menu, panel or overlay owns the screen, so the pad navigates it. */
export function uiModalOpen(
  settingsOpen: boolean = settingsOpenSignal.value,
  opts: { ignoreTutorial?: boolean } = {}
): boolean {
  return (
    hasSystemOverlay() ||
    settingsOpen ||
    settingsOpenSignal.value ||
    screenSignal.value !== 'game' ||
    choiceSignal.value.active ||
    negotiationSignal.value.active ||
    dayEndSignal.value.active ||
    endingSignal.value.active ||
    garageSignal.value.open ||
    journalSignal.value ||
    karmaPanelSignal.value ||
    uiSheetSignal.value ||
    tripSummarySignal.value !== null ||
    (!opts.ignoreTutorial && tutorialSignal.value.active) ||
    saveSlotsSignal.value.isOpen ||
    phoneSignal.value.open
  );
}

function focusables(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    if (el.closest('[aria-hidden="true"]')) return false;
    return el.getClientRects().length > 0;
  });
}

function boxOf(el: HTMLElement): Box {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}

function isRangeSlider(el: HTMLElement | null): el is HTMLInputElement {
  return Boolean(el && el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'range');
}

function adjustRangeSlider(el: HTMLInputElement, dir: 'left' | 'right'): void {
  const min = Number.isFinite(parseFloat(el.min)) ? parseFloat(el.min) : 0;
  const max = Number.isFinite(parseFloat(el.max)) ? parseFloat(el.max) : 100;
  const stepRaw = parseFloat(el.step);
  const step = Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : 1;
  const current = Number.isFinite(parseFloat(el.value)) ? parseFloat(el.value) : min;
  const delta = dir === 'right' ? step : -step;
  const next = Math.min(max, Math.max(min, Math.round((current + delta) * 1e6) / 1e6));
  if (next === current) return;
  el.value = String(next);
  if (typeof Event === 'function') {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    el.dispatchEvent?.({ type: 'input', bubbles: true } as unknown as Event);
    el.dispatchEvent?.({ type: 'change', bubbles: true } as unknown as Event);
  }
}

export function getActiveControlsBindings(): InputBindings {
  try {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(SETTINGS_STORAGE_KEY) !== null) {
      return loadBindings();
    }
  } catch {
    // Fallback to settingsSignal below
  }
  return settingsSignal.value.controls ?? loadBindings();
}

/** Moves focus to the nearest control in `dir`; focuses the first control if none has focus. */
export function moveFocus(dir: NavDir): void {
  const els = focusables();
  if (els.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  if (!active || !els.includes(active)) {
    els[0]!.focus();
    return;
  }
  if ((dir === 'left' || dir === 'right') && isRangeSlider(active)) {
    adjustRangeSlider(active, dir);
    return;
  }
  const next = pickNeighbor(boxOf(active), els.map(boxOf), dir);
  if (next >= 0) els[next]!.focus();
}

/** Clicks the focused control, or focuses the first one when nothing has focus. */
export function confirmFocus(): void {
  const els = focusables();
  const active = document.activeElement as HTMLElement | null;
  if (active && els.includes(active)) {
    active.click();
  } else if (els.length > 0) {
    els[0]!.focus();
  }
}

/** Sends a key through the same window listeners the keyboard uses. */
export function dispatchKey(key: string, code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }));
}

function firstGamepad(): Gamepad | null {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return null;
  for (const pad of navigator.getGamepads()) {
    if (pad) return pad;
  }
  return null;
}

/**
 * Polls the gamepad once per frame. `isSettingsOpen` is read every frame
 * because Settings is local App state. Returns a stop function.
 */
export function startGamepadNav(isSettingsOpen: () => boolean): () => void {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
    return () => {};
  }
  const edges = new GamepadEdges();
  let frame = 0;
  let running = true;

  const tick = () => {
    if (!running) return;
    const gp = getActiveControlsBindings().gamepad;
    const choiceButtons = gp.choiceButtons;
    const snap = edges.poll(firstGamepad());

    if (!hasSystemOverlay() && !isGamepadRebindingSignal.value) {
      const choiceBlockedByModal =
        screenSignal.value !== 'game' ||
        dayEndSignal.value.active ||
        endingSignal.value.active ||
        saveSlotsSignal.value.isOpen;
      if (choiceSignal.value.active && !choiceBlockedByModal) {
        if (choiceSignal.value.outcomeLineKey || choiceSignal.value.options.length === 0) {
          if (snap.pressed.includes(BTN_CONFIRM) || snap.pressed.includes(BTN_BACK)) {
            chooseChoiceOption(0);
          }
        } else {
          for (const btn of snap.pressed) {
            const idx = choiceButtons.indexOf(btn);
            if (idx >= 0) chooseChoiceOption(idx);
          }
        }
      } else if (uiModalOpen(isSettingsOpen())) {
        if (snap.dir) moveFocus(snap.dir);
        if (snap.pressed.includes(BTN_CONFIRM)) confirmFocus();
        if (snap.pressed.includes(BTN_BACK)) dispatchKey('Escape', 'Escape');
      }

      if (snap.pressed.includes(gp.pauseButton)) dispatchKey('Escape', 'Escape');
      if (snap.pressed.includes(gp.phoneButton)) dispatchKey('Tab', 'Tab');
      if (snap.pressed.includes(gp.mapButton)) dispatchKey('m', 'KeyM');
    }

    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => {
    running = false;
    cancelAnimationFrame(frame);
  };
}

/**
 * When a menu, panel or overlay opens, keyboard and pad focus move into it.
 * Without this, focus stayed on whatever was behind (audit: overlays had no
 * focus target on open). Returns the function that stops watching.
 */
export function watchOverlayFocus(): () => void {
  let last = '';
  return effect(() => {
    const key = [
      screenSignal.value,
      loadingSignal.value.active,
      Boolean(unsupportedSignal.value),
      journalSignal.value,
      karmaPanelSignal.value,
      uiSheetSignal.value,
      saveSlotsSignal.value.isOpen,
      garageSignal.value.open,
      pausedSignal.value,
      choiceSignal.value.active,
      negotiationSignal.value.active,
      dayEndSignal.value.active,
      endingSignal.value.active,
      tripSummarySignal.value !== null,
    ].join('|');
    if (key === last) return;
    last = key;
    // Render first, then move focus, so the overlay's controls exist.
    setTimeout(() => {
      if (hasSystemOverlay() || !uiModalOpen(false)) return;
      const active = document.activeElement as HTMLElement | null;
      if (!active || active === document.body) focusables()[0]?.focus();
    }, 0);
  });
}
