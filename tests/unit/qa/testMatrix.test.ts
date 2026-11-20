import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('QA Test Matrix Verification (T12.5 / MASTER.md §21 & GDD §17)', () => {
  const playtestDocPath = path.resolve('docs/PLAYTEST.md');
  const masterDocPath = path.resolve('docs/MASTER.md');

  it('docs/PLAYTEST.md exists and covers MASTER.md §21 and all 5 GDD §17 categories', () => {
    expect(fs.existsSync(playtestDocPath)).toBe(true);
    const content = fs.readFileSync(playtestDocPath, 'utf-8');

    expect(content).toContain('## 0. `docs/MASTER.md` §21 Acceptance Test Matrix');
    expect(content).toContain('## 1. Driving Systems');
    expect(content).toContain('## 2. Fare Negotiation');
    expect(content).toContain('## 3. Economy and Progression');
    expect(content).toContain('## 4. Narrative and Identity');
    expect(content).toContain('## 5. Performance and Polish');
  });

  const master21Criteria = [
    // Driving and world
    'Player visibly rides a motorcycle.',
    'Camera shows the road and avoids clipping through buildings.',
    'Roads connect and support turns, U-turns, and alleys.',
    'Buildings do not block roads or pedestrian paths.',
    'Traffic follows roads without persistent overlap.',
    'Pedestrians use sidewalks and react to vehicles.',
    'Collisions and wet-road behavior are understandable.',
    // Ride lifecycle
    'Requests can be accepted, negotiated, declined, or cancelled.',
    'Pickup and destination are reachable through the road network.',
    'Pickup relocation changes trip outcomes.',
    'Old navigation clears on completion.',
    'Fare, commission, fuel, expenses, and net earnings reconcile.',
    'Reloads and state transitions cannot pay a trip twice.',
    // Consequences
    'Passengers remember important choices.',
    'Exploitation has consequences and is not a guaranteed profitable strategy.',
    'Bribery is not guaranteed and may increase exposure.',
    'Police behavior varies without portraying every officer as corrupt.',
    'Accident outcomes reflect severity and response.',
    'Helpful/safe choices can create meaningful benefits.',
    // Story and UI
    'Mission prerequisites and objectives work.',
    'Major choices persist and recurring characters respond to them.',
    'Multiple play styles can reach viable endings.',
    'U, S, and J open UI Sheet, Story, and Karma panels if configured.',
    'All displayed buttons work.',
    'Objective, passenger, navigation, and trip state stay synchronized.',
    'Test at target resolution and on lowest target hardware.',
    'Report actual test results and remaining placeholders; do not claim untested features work.',
  ];

  it('extracts every bullet from docs/MASTER.md §21 and maps all 27 criteria in docs/PLAYTEST.md', () => {
    expect(fs.existsSync(masterDocPath)).toBe(true);
    const masterContent = fs.readFileSync(masterDocPath, 'utf-8');
    const sec21Match = masterContent.split('## 21. Acceptance Tests')[1]?.split('## 22.')[0] ?? '';
    const extractedBullets = Array.from(sec21Match.matchAll(/^- (.+)$/gm)).map((m) => m[1]!.trim());
    expect(extractedBullets).toEqual(master21Criteria);

    const playtestContent = fs.readFileSync(playtestDocPath, 'utf-8');
    for (const item of master21Criteria) {
      expect(
        playtestContent,
        `MASTER.md §21 criterion "${item}" must be mapped in docs/PLAYTEST.md`
      ).toContain(item);
    }
  });

  const gdd17Questions = [
    // Driving
    'Can the player brake and turn predictably?',
    'Are collisions understandable rather than arbitrary?',
    'Can the player recover from a missed turn?',
    'Do wet roads feel different without becoming uncontrollable?',
    // Negotiation
    'Do passengers have distinct behavior?',
    'Can players understand why a fare was accepted or rejected?',
    'Is declining a bad ride sometimes the correct decision?',
    'Can the player make a reasonable profit without exploiting a single strategy?',
    // Economy
    'Does fuel cost scale sensibly with distance and traffic?',
    'Can a player recover after a bad day?',
    'Are repairs meaningful without becoming a constant punishment?',
    'Are off-app rides a trade-off rather than a guaranteed exploit?',
    // Narrative
    'Do recurring characters remember important choices?',
    'Are multiple endings achievable through different play styles?',
    'Does the game avoid treating every risky passenger as a criminal?',
    'Do helpful and safe choices have meaningful outcomes?',
    // Performance
    'Test on the lowest target Android hardware.',
    'Measure frame rate in dense traffic.',
    'Profile memory and loading times.',
    'Use simplified distant traffic.',
    'Avoid loading the whole city at once.',
  ];

  it('maps all 21 GDD §17 verification questions in docs/PLAYTEST.md', () => {
    const content = fs.readFileSync(playtestDocPath, 'utf-8');
    for (const q of gdd17Questions) {
      expect(content, `Question "${q}" should be documented in PLAYTEST.md`).toContain(q);
    }
  });

  it('all automated unit, balance, and E2E test files referenced in PLAYTEST.md exist on disk with real test cases', () => {
    const content = fs.readFileSync(playtestDocPath, 'utf-8');
    const unitAndBalanceMatches = content.match(/tests\/(unit|balance)\/[a-zA-Z0-9_/.-]+\.test\.ts/g) || [];
    const e2eMatches = content.match(/tests\/e2e\/[a-zA-Z0-9_/.-]+\.spec\.ts/g) || [];

    expect(unitAndBalanceMatches.length).toBeGreaterThan(25);
    expect(e2eMatches.length).toBeGreaterThan(10);

    const uniqueFiles = Array.from(new Set([...unitAndBalanceMatches, ...e2eMatches]));
    for (const file of uniqueFiles) {
      const fullPath = path.resolve(file);
      expect(fs.existsSync(fullPath), `Referenced test file "${file}" must exist`).toBe(true);
      const testSrc = fs.readFileSync(fullPath, 'utf-8');
      expect(
        /\b(it|test)\s*\(/.test(testSrc),
        `Referenced test file "${file}" must contain at least one executable it(...) or test(...) block`
      ).toBe(true);
    }
  });

  it('package.json is at v1.0.0 release candidate and browser tsconfig excludes node globals', () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf-8')) as {
      version: string;
    };
    expect(pkg.version).toBe('1.0.0');

    const tsconfig = JSON.parse(fs.readFileSync(path.resolve('tsconfig.json'), 'utf-8')) as {
      compilerOptions?: { types?: string[] };
      include?: string[];
    };
    expect(tsconfig.compilerOptions?.types ?? []).not.toContain('node');
    expect(tsconfig.include).toEqual(['src']);
  });
});
