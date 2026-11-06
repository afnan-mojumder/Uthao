// A new career starts from a fresh game. The menu asks for one, then reloads
// the page so every system (debt, bikes, relationships, endings) starts from
// its defaults. The next boot checks this flag and starts the career.

const KEY = 'uthao.freshCareer';

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
