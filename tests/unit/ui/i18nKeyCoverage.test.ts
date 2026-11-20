import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t, setLanguage, ensureLocaleLoaded } from '../../../src/ui/i18n';
import upgradesData from '../../../data/upgrades.json';

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

function loadMergedDict(lang: 'bn' | 'en'): Record<string, string> {
  const dict: Record<string, string> = {};
  for (const file of dialogueFiles(lang)) {
    Object.assign(dict, JSON.parse(readFileSync(file, 'utf8')));
  }
  return dict;
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

// Only intentional language-picker button labels in Settings.tsx are permitted as literal Bangla/English UI prose in .tsx files.
const ALLOWED_UI_LITERALS = new Set([
  'বাংলা (BN)',
  'English (EN)',
  '4G',
  'L',
  'km/h',
  'km/L',
  'cc',
  'uthao.dhaka',
]);

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
    it(`no key shows raw in ${lang}`, async () => {
      await ensureLocaleLoaded(lang);
      setLanguage(lang);
      const raw = [...keys].filter((k) => t(k) === k);
      expect(raw).toEqual([]);
    });
  }

  it('maintains 100% key parity between bn and en dialogue dictionaries', () => {
    const bn = loadMergedDict('bn');
    const en = loadMergedDict('en');
    const missingInBn = Object.keys(en).filter((k) => !(k in bn));
    const missingInEn = Object.keys(bn).filter((k) => !(k in en));
    expect(missingInBn).toEqual([]);
    expect(missingInEn).toEqual([]);
  });

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

  it('P7.2: contains zero hardcoded Bangla or English UI prose in src/ui/**/*.tsx', () => {
    const tsxFiles = uiSources(join(process.cwd(), 'src', 'ui')).filter((f) => f.endsWith('.tsx'));
    const violations: Array<{ file: string; line: number; text: string }> = [];

    for (const file of tsxFiles) {
      const rel = file.replace(`${process.cwd()}/`, '');
      const lines = readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!;
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*')) continue;

        // 1. Any Bangla script LETTERS (excluding currency symbol ৳ = \u09F3) in .tsx outside allowed language selector button
        if (/[\u0980-\u09F2\u09F4-\u09FF]/.test(line)) {
          const isAllowed = [...ALLOWED_UI_LITERALS].some((lit) => line.includes(lit));
          if (!isAllowed) {
            violations.push({ file: rel, line: i + 1, text: trimmed });
            continue;
          }
        }

        // 2. Hardcoded title="..." or aria-label="..." string literals
        const attrMatch = /\b(?:title|aria-label|ariaLabel)=\s*["']([^"']*[A-Za-z\u0980-\u09FF][^"']*)["']/.exec(line);
        if (attrMatch && !ALLOWED_UI_LITERALS.has(attrMatch[1]!.trim())) {
          violations.push({ file: rel, line: i + 1, text: trimmed });
          continue;
        }

        // 3. Hardcoded JSX text nodes between > and < containing letters
        if (!trimmed.startsWith('const ') && !trimmed.startsWith('let ')) {
          for (const m of line.matchAll(/(?<![=-])>([^<>{}=|&]+)</g)) {
            const raw = m[1]!
              .replace(/&amp;/g, '&')
              .replace(/[৳★•·✕←+\-/%[\]():"'`.,!?;]/g, ' ')
              .trim();
            if (!raw) continue;
            if (!/[A-Za-z\u0980-\u09FF]{2,}/.test(raw)) continue;
            if (ALLOWED_UI_LITERALS.has(raw) || ALLOWED_UI_LITERALS.has(m[1]!.trim())) continue;
            violations.push({ file: rel, line: i + 1, text: raw });
          }
        }

        // 4. Hardcoded JSX string props for visible copy (meta="...", continueLabel = '...', etc.)
        const propMatch = /\b(?:meta|continueLabel)\s*=\s*["']([^"']+[A-Za-z\u0980-\u09FF][^"']*)["']/.exec(line);
        if (propMatch && !ALLOWED_UI_LITERALS.has(propMatch[1]!.trim())) {
          violations.push({ file: rel, line: i + 1, text: trimmed });
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('P7.2: self-hosts Hind Siliguri woff2 (400/500/600/700) in public/fonts and removes Google Fonts links from index.html', () => {
    const indexHtml = readFileSync(join(process.cwd(), 'index.html'), 'utf8');
    expect(indexHtml).not.toContain('fonts.googleapis.com');
    expect(indexHtml).not.toContain('fonts.gstatic.com');

    const tokensCss = readFileSync(join(process.cwd(), 'src', 'ui', 'tokens.css'), 'utf8');
    for (const weight of [400, 500, 600, 700]) {
      const fontPath = join(process.cwd(), 'public', 'fonts', `hind-siliguri-${weight}.woff2`);
      expect(existsSync(fontPath), `missing ${fontPath}`).toBe(true);
      const buf = readFileSync(fontPath);
      expect(buf.byteLength).toBeGreaterThan(100);
      expect(buf.subarray(0, 4).toString('ascii')).toBe('wOF2');
      expect(tokensCss).toContain(`hind-siliguri-${weight}.woff2`);
      expect(tokensCss).toContain(`font-weight: ${weight}`);
    }
  });

  it('P7.2: upgrade copy matches data/upgrades.json (18% wet grip) and dialogue uses fictional Dhaka district names consistently', () => {
    const goodTires = (upgradesData as Array<{ id: string; effects?: { wetGripBonus?: number } }>).find(
      (u) => u.id === 'upgrade_good_tires'
    );
    expect(goodTires?.effects?.wetGripBonus).toBe(0.18);

    const bnDict = loadMergedDict('bn');
    const enDict = loadMergedDict('en');

    expect(enDict['upgrade.good_tires.desc']).toContain('18%');
    expect(enDict['upgrade.good_tires.desc']).not.toContain('25%');
    expect(bnDict['upgrade.good_tires.desc']).toContain('১৮%');
    expect(bnDict['upgrade.good_tires.desc']).not.toContain('২৫%');

    // Fictional district names (Motinagar, Gulbari, Mohakhal, Fulgate, Mirpara, Dhanbagh, Puran Para)
    // must be used consistently instead of real district names (Motijheel, Gulshan, Mohakhali, Karwan Bazar).
    const allValues = [...Object.values(bnDict), ...Object.values(enDict)].join('\n');
    expect(allValues).not.toMatch(/মতিঝিল|গুলশান|মহাখালী|কাওরান বাজার|Karwan Bazar|Motijheel|Gulshan|Mohakhali/);
  });
});

