// A new career starts from a fresh game. The menu asks for one, then reloads
// the page so every system (debt, bikes, relationships, endings) starts from
// its defaults. The next boot checks this flag and starts the career.

const KEY = 'uthao.freshCareer';

function defaultRandomSeed(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return (buf[0]! & 0x7fffffff) || 1;
  }
  return Math.floor(Math.random() * 0x7ffffffe) + 1;
}

/**
 * Resolves the career RNG seed: honors `?seed=<int>` in dev/tests for
 * deterministic runs, otherwise generates a fresh random career seed.
 */
export function resolveCareerSeed(
  search?: string,
  randomFn: () => number = defaultRandomSeed
): number {
  const query =
    search ?? (typeof window !== 'undefined' && window.location ? window.location.search : '');
  if (query) {
    try {
      const raw = new URLSearchParams(query).get('seed');
      if (raw !== null && raw.trim() !== '') {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          return (Math.floor(Math.abs(parsed)) >>> 0) || 1;
        }
      }
    } catch {
      // ignore malformed search string
    }
  }
  const generated = randomFn();
  return Number.isFinite(generated) ? ((Math.floor(Math.abs(generated)) >>> 0) || 1) : 1;
}

/** Asks the next page load to start a new career. False if session storage is unavailable. */
export function requestFreshCareer(): boolean {
  try {
    sessionStorage.setItem(KEY, '1');
    return true;
  } catch {
    return false;
  }
}

/** Reads and clears the request. True only on the page load that should start the career. */
export function consumeFreshCareer(): boolean {
  try {
    if (sessionStorage.getItem(KEY) === null) return false;
    sessionStorage.removeItem(KEY);
    return true;
  } catch {
    return false;
  }
}
