import { h, type JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

const FOCUSABLE_SELECTOR =
  'button, [role="button"], a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

interface TrapEntry {
  id: number;
  overlay: HTMLElement;
  order: number;
}

let nextTrapId = 1;
const activeTraps: TrapEntry[] = [];
const managedInert = new Set<HTMLElement>();
let tabListenerAttached = false;

function isConnected(el: HTMLElement): boolean {
  return el.parentElement !== null;
}

function getAncestors(el: HTMLElement): HTMLElement[] {
  const chain: HTMLElement[] = [];
  let cur: HTMLElement | null = el;
  while (cur) {
    chain.push(cur);
    cur = cur.parentElement;
  }
  return chain;
}

function isHigherInDom(a: HTMLElement, b: HTMLElement): boolean {
  if (b.contains(a)) return true;
  if (a.contains(b)) return false;
  const chainA = getAncestors(a);
  const chainB = getAncestors(b);
  let idxA = chainA.length - 1;
  let idxB = chainB.length - 1;
  while (idxA >= 0 && idxB >= 0 && chainA[idxA] === chainB[idxB]) {
    idxA--;
    idxB--;
  }
  if (idxA >= 0 && idxB >= 0) {
    const lca = chainA[idxA + 1];
    if (lca) {
      const children = Array.from(lca.children);
      const posA = children.indexOf(chainA[idxA]!);
      const posB = children.indexOf(chainB[idxB]!);
      if (posA !== -1 && posB !== -1 && posA !== posB) {
        return posA > posB;
      }
    }
  }
  return false;
}

function getTopmostTrap(): TrapEntry | null {
  const connected = activeTraps.filter((t) => isConnected(t.overlay));
  if (connected.length === 0) return null;
  let top = connected[0]!;
  for (let i = 1; i < connected.length; i++) {
    const candidate = connected[i]!;
    if (candidate.overlay === top.overlay) {
      if (candidate.order > top.order) top = candidate;
    } else if (isHigherInDom(candidate.overlay, top.overlay)) {
      top = candidate;
    } else if (!isHigherInDom(top.overlay, candidate.overlay) && candidate.order > top.order) {
      top = candidate;
    }
  }
  return top;
}

function getFocusableInside(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((el) => {
    if ((el as HTMLButtonElement).disabled) return false;
    if (el.closest('[inert], [aria-hidden="true"]')) return false;
    if (typeof el.getClientRects === 'function' && el.getClientRects().length === 0) return false;
    return true;
  });
}

function handleTabTrap(e: KeyboardEvent): void {
  if (e.key !== 'Tab' || e.defaultPrevented) return;
  const top = getTopmostTrap();
  if (!top) return;
  const focusables = getFocusableInside(top.overlay);
  if (focusables.length === 0) {
    e.preventDefault();
    top.overlay.focus?.();
    return;
  }
  const active =
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  const idx = active ? focusables.indexOf(active) : -1;
  e.preventDefault();
  if (idx === -1) {
    (e.shiftKey ? focusables[focusables.length - 1]! : focusables[0]!).focus();
    return;
  }
  const nextIdx = e.shiftKey
    ? (idx - 1 + focusables.length) % focusables.length
    : (idx + 1) % focusables.length;
  focusables[nextIdx]!.focus();
}

function syncTabListener(): void {
  if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') return;
  if (activeTraps.length > 0 && !tabListenerAttached) {
    document.addEventListener('keydown', handleTabTrap);
    tabListenerAttached = true;
  } else if (activeTraps.length === 0 && tabListenerAttached) {
    document.removeEventListener('keydown', handleTabTrap);
    tabListenerAttached = false;
  }
}

function recomputeInert(): void {
  for (const el of managedInert) {
    el.removeAttribute('inert');
  }
  managedInert.clear();

  const top = getTopmostTrap();
  if (!top) return;

  let node: HTMLElement = top.overlay;
  while (node.parentElement) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling !== node && sibling instanceof HTMLElement && !sibling.hasAttribute('inert')) {
        sibling.setAttribute('inert', '');
        managedInert.add(sibling);
      }
    }
    node = node.parentElement;
  }
}

/**
 * Makes everything outside the topmost active `overlay` inert, traps Tab and
 * Shift+Tab inside it, and safely handles stacked/nested modals without leaking
 * `inert` on unmount. Returns the function that releases this trap.
 */
export function makeRestInert(overlay: HTMLElement): () => void {
  const id = nextTrapId++;
  const entry: TrapEntry = { id, overlay, order: id };
  activeTraps.push(entry);
  recomputeInert();
  syncTabListener();

  let released = false;
  return () => {
    if (released) return;
    released = true;
    const idx = activeTraps.findIndex((t) => t.id === id);
    if (idx !== -1) activeTraps.splice(idx, 1);
    recomputeInert();
    syncTabListener();
  };
}

function activateOverlayTrap(overlay: HTMLElement): () => void {
  const opener =
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  const release = makeRestInert(overlay);
  const currentActive =
    typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
  if (!currentActive || !overlay.contains(currentActive)) {
    const firstFocusable = getFocusableInside(overlay)[0];
    if (firstFocusable) {
      firstFocusable.focus?.();
    } else {
      overlay.focus?.();
    }
  }
  return () => {
    release();
    if (opener && opener.parentElement !== null && !opener.closest?.('[inert]')) {
      opener.focus?.();
    }
  };
}

/**
 * Hook that activates focus trapping, `makeRestInert`, initial focus, and opener
 * focus restoration for `overlayRef.current` while `active` is true.
 */
export function useModalFocusTrap(
  overlayRef: { current: HTMLElement | null },
  active = true
): void {
  useEffect(() => {
    if (!active) return undefined;
    const overlay = overlayRef.current;
    if (!overlay) return undefined;
    return activateOverlayTrap(overlay);
  }, [active]);
}

/**
 * Child guard that binds focus trapping to the enclosing `[role="dialog"]`
 * element on mount (keeps parent view functions hook-free when invoked directly).
 */
export function ModalFocusGuard(): JSX.Element | null {
  if (typeof document === 'undefined') return null;
  try {
    const markerRef = useRef<HTMLSpanElement | null>(null);
    useEffect(() => {
      const dialog = markerRef.current?.closest?.('[role="dialog"]') as HTMLElement | null;
      if (!dialog) return undefined;
      return activateOverlayTrap(dialog);
    }, []);
    return h('span', {
      ref: markerRef,
      style: { display: 'none' },
      'aria-hidden': 'true',
    });
  } catch {
    return null;
  }
}
