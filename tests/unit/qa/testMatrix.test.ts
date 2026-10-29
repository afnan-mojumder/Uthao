import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('QA Test Matrix Verification (T6.1 / GDD §17)', () => {
  const playtestDocPath = path.resolve('docs/PLAYTEST.md');

  it('docs/PLAYTEST.md exists and covers all 5 GDD §17 categories', () => {
    expect(fs.existsSync(playtestDocPath)).toBe(true);
    const content = fs.readFileSync(playtestDocPath, 'utf-8');

    expect(content).toContain('## 1. Driving Systems');
    expect(content).toContain('## 2. Fare Negotiation');
    expect(content).toContain('## 3. Economy and Progression');
    expect(content).toContain('## 4. Narrative and Identity');
    expect(content).toContain('## 5. Performance and Polish');
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

  it('all automated test files referenced in PLAYTEST.md exist on disk', () => {
    const content = fs.readFileSync(playtestDocPath, 'utf-8');
    const testFileMatches = content.match(/tests\/[a-zA-Z0-9_/.-]+\.test\.ts/g) || [];

    expect(testFileMatches.length).toBeGreaterThan(10);

    const uniqueFiles = Array.from(new Set(testFileMatches));
    for (const file of uniqueFiles) {
      const fullPath = path.resolve(file);
      expect(fs.existsSync(fullPath), `Referenced test file "${file}" must exist`).toBe(true);
    }
  });
});
