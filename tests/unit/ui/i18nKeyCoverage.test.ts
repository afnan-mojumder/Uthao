import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t, setLanguage } from '../../../src/ui/i18n';

/** Every .ts/.tsx file under src/ui, recursively. */
function uiSources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...uiSources(p));
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

describe('every literal UI string key resolves in both languages (audit: raw keys on screen)', () => {
  const keys = new Set<string>();
  for (const file of uiSources(join(process.cwd(), 'src', 'ui'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*['"`]([a-zA-Z0-9_.]+)['"`]/g)) keys.add(m[1]!);
  }

  it('finds the UI keys to check', () => {
    expect(keys.size).toBeGreaterThan(50);
  });

  for (const lang of ['en', 'bn'] as const) {
    it(`no key shows raw in ${lang}`, () => {
      setLanguage(lang);
      const raw = [...keys].filter((k) => t(k) === k);
      expect(raw).toEqual([]);
    });
  }
});
