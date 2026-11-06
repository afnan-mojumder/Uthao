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
import { loadBindings } from '../input/bindings';
import {
  choiceSignal,
  dayEndSignal,
  endingSignal,
  garageSignal,
  journalSignal,
  negotiationSignal,
  phoneSignal,
  saveSlotsSignal,
  screenSignal,
  tripSummarySignal,
  tutorialSignal,
  chooseChoiceOption,
} from './store';

const BTN_CONFIRM = 0;
const BTN_BACK = 1;
const BTN_PHONE = 4;
const BTN_MAP = 5;
const BTN_PAUSE = 9;

const FOCUSABLE =
  'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** True when a menu, panel or overlay owns the screen, so the pad navigates it. */
export function uiModalOpen(settingsOpen: boolean): boolean {
  return (
    settingsOpen ||
    screenSignal.value !== 'game' ||
    choiceSignal.value.active ||
    negotiationSignal.value.active ||
    dayEndSignal.value.active ||
    endingSignal.value.active ||
    garageSignal.value.open ||
    journalSignal.value ||
    tripSummarySignal.value !== null ||
    tutorialSignal.value.active ||
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

/** Moves focus to the nearest control in `dir`; focuses the first control if none has focus. */
export function moveFocus(dir: NavDir): void {
  const els = focusables();
  if (els.length === 0) return;
  const active = document.activeElement as HTMLElement | null;
  if (!active || !els.includes(active)) {
    els[0]!.focus();
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
export function dispatchKey(key: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
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
  const choiceButtons = loadBindings().gamepad.choiceButtons;
  const edges = new GamepadEdges();
  let frame = 0;
  let running = true;

  const tick = () => {
    if (!running) return;
    const snap = edges.poll(firstGamepad());

    if (choiceSignal.value.active) {
      for (const btn of snap.pressed) {
        const idx = choiceButtons.indexOf(btn);
        if (idx >= 0) chooseChoiceOption(idx);
      }
    } else if (uiModalOpen(isSettingsOpen())) {
      if (snap.dir) moveFocus(snap.dir);
      if (snap.pressed.includes(BTN_CONFIRM)) confirmFocus();
      if (snap.pressed.includes(BTN_BACK)) dispatchKey('Escape');
    }

    if (snap.pressed.includes(BTN_PAUSE)) dispatchKey('Escape');
    if (snap.pressed.includes(BTN_PHONE)) dispatchKey('Tab');
    if (snap.pressed.includes(BTN_MAP)) dispatchKey('m');

    frame = requestAnimationFrame(tick);
  };

  frame = requestAnimationFrame(tick);
  return () => {
    running = false;
    cancelAnimationFrame(frame);
  };
}
