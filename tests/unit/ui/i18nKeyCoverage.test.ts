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

function dialogueFiles(lang: 'bn' | 'en'): string[] {
  const dir = join(process.cwd(), 'data', 'dialogue', lang);
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => join(dir, f));
}

function findCjkMatches(): Array<{ file: string; match: string }> {
  const files = [
    ...dialogueFiles('bn'),
    ...dialogueFiles('en'),
    ...uiSources(join(process.cwd(), 'src', 'ui')).filter((f) => f.endsWith('.tsx')),
  ];
  const matches: Array<{ file: string; match: string }> = [];
  for (const file of files) {
    const src = readFileSync(file, 'utf8');
    const found = src.match(/[\u4e00-\u9fff]+/g);
    if (found) {
      for (const m of found) matches.push({ file, match: m });
    }
  }
  return matches;
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

  it('uses উঠাও / Uthao consistently and contains zero CJK characters in UI or dialogue', () => {
    const bnUi = JSON.parse(readFileSync(join(process.cwd(), 'data', 'dialogue', 'bn', 'ui.json'), 'utf8')) as Record<string, string>;
    const enUi = JSON.parse(readFileSync(join(process.cwd(), 'data', 'dialogue', 'en', 'ui.json'), 'utf8')) as Record<string, string>;
    expect(bnUi['menu.title']).toBe('উঠাও');
    expect(enUi['menu.title']).toBe('UTHAO');
    expect(findCjkMatches()).toEqual([]);

    const brandFiles = [
      ...dialogueFiles('bn'),
      ...dialogueFiles('en'),
      ...uiSources(join(process.cwd(), 'src', 'ui')).filter((f) => f.endsWith('.tsx')),
    ];
    const forbidden = /(?:উধাও|উথাও|UTHÃO|কমল)/g;
    const badBrandMatches: Array<{ file: string; match: string }> = [];
    for (const file of brandFiles) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(forbidden)) {
        badBrandMatches.push({ file, match: m[0] });
      }
    }
    expect(badBrandMatches).toEqual([]);
  });
});
