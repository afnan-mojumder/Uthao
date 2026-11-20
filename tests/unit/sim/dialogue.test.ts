import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { h } from 'preact';
import { DialogueManager, defaultDialogueManager } from '../../../src/sim/dialogue/DialogueManager';
import { Rng } from '../../../src/core/rng';
import type { ArchetypeId } from '../../../src/core/types';
import type { DialoguePhase } from '../../../src/sim/schemas';
import { CharacterPortrait } from '../../../src/ui/components';
import enDialogue from '../../../data/dialogue/en/dialogue.json';
import bnDialogue from '../../../data/dialogue/bn/dialogue.json';
import archetypesData from '../../../data/archetypes.json';
import charactersData from '../../../data/characters.json';

describe('DialogueManager (T5.7 & P7.3 Richer Dialogue & Character Portraits)', () => {
  const archetypes: ArchetypeId[] = [
    'bargainer',
    'commuter',
    'careful',
    'regular',
    'risky',
    'student',
    'office',
    'urgent',
    'traveler',
    'unreliable',
    'family',
  ];
  const phases: DialoguePhase[] = [
    'greeting',
    'offer',
    'counter',
    'accept',
    'reject',
    'small_talk',
    'drop_off',
  ];

  it('instantiates custom DialogueManager instance', () => {
    const custom = new DialogueManager();
    expect(custom.getAllLines().length).toBeGreaterThanOrEqual(1155);
  });

  it('contains >= 15 lines per archetype per phase in the data pool', () => {
    for (const arch of archetypes) {
      for (const ph of phases) {
        const lines = defaultDialogueManager.getLinesForArchetypeAndPhase(arch, ph);
        expect(
          lines.length,
          `Archetype ${arch} phase ${ph} should have >= 15 lines`
        ).toBeGreaterThanOrEqual(15);
      }
    }
  });

  it('enforces >= 15 unique lines per phase across ALL 11 archetypes in both EN and BN, with zero duplicate names', () => {
    const enDict = enDialogue as Record<string, string>;
    const bnDict = bnDialogue as Record<string, string>;

    for (const arch of archetypes) {
      for (const ph of phases) {
        const lines = defaultDialogueManager.getLinesForArchetypeAndPhase(arch, ph);
        expect(
          lines.length,
          `Archetype ${arch} phase ${ph} must have >= 15 entries`
        ).toBeGreaterThanOrEqual(15);

        const enTexts = new Set<string>();
        const bnTexts = new Set<string>();
        for (const line of lines) {
          const enText = enDict[line.key] ?? '';
          const bnText = bnDict[line.key] ?? '';
          expect(enText, `Missing EN text for ${line.key}`).toBeTruthy();
          expect(bnText, `Missing BN text for ${line.key}`).toBeTruthy();
          enTexts.add(enText.trim());
          bnTexts.add(bnText.trim());
        }

        expect(
          enTexts.size,
          `Archetype ${arch} phase ${ph} must have >= 15 unique EN lines`
        ).toBeGreaterThanOrEqual(15);
        expect(
          bnTexts.size,
          `Archetype ${arch} phase ${ph} must have >= 15 unique BN lines`
        ).toBeGreaterThanOrEqual(15);
      }
    }

    // Zero duplicate passenger name keys across data/archetypes.json
    const seenPassengerNames = new Set<string>();
    const duplicateNames: string[] = [];
    for (const arch of Object.values(archetypesData)) {
      for (const nameKey of arch.names) {
        if (seenPassengerNames.has(nameKey)) {
          duplicateNames.push(nameKey);
        }
        seenPassengerNames.add(nameKey);
      }
    }
    expect(duplicateNames, `Duplicate passenger name keys found: ${duplicateNames.join(', ')}`).toEqual([]);
  });

  it('enforces stylized .webp portraits for all 10 characters and 11 archetypes and wires CharacterPortrait img rendering', () => {
    const portraitsDir = path.resolve('public/assets/portraits');
    expect(fs.existsSync(portraitsDir)).toBe(true);

    for (const char of charactersData) {
      const filePath = path.join(portraitsDir, `${char.id}.webp`);
      expect(fs.existsSync(filePath), `Missing character portrait ${filePath}`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(100);
    }

    for (const arch of archetypes) {
      const filePath = path.join(portraitsDir, `${arch}.webp`);
      expect(fs.existsSync(filePath), `Missing archetype portrait ${filePath}`).toBe(true);
      const stat = fs.statSync(filePath);
      expect(stat.size).toBeGreaterThan(100);
    }

    const charVnode = h(CharacterPortrait, {
      name: 'Nabila',
      role: 'Student',
      characterId: 'char_nabila',
      archetype: 'bargainer',
    });
    const renderedChar = JSON.stringify(CharacterPortrait(charVnode.props));
    expect(renderedChar).toContain('/assets/portraits/char_nabila.webp');

    const archVnode = h(CharacterPortrait, {
      name: 'Passenger',
      archetype: 'student',
    });
    const renderedArch = JSON.stringify(CharacterPortrait(archVnode.props));
    expect(renderedArch).toContain('/assets/portraits/student.webp');

    const fallbackVnode = h(CharacterPortrait, {
      name: 'Unknown',
    });
    const renderedFallback = JSON.stringify(CharacterPortrait(fallbackVnode.props));
    expect(renderedFallback).not.toContain('.webp');
  });

  it('has 100% key parity between English and Bangla dialogue dictionaries', () => {
    const enKeys = Object.keys(enDialogue);
    const bnKeys = Object.keys(bnDialogue);

    expect(enKeys.length).toBeGreaterThanOrEqual(1155);
    expect(bnKeys.length).toBe(enKeys.length);

    for (const key of enKeys) {
      expect(bnDialogue[key as keyof typeof bnDialogue]).toBeDefined();
      expect(typeof bnDialogue[key as keyof typeof bnDialogue]).toBe('string');
      expect((bnDialogue[key as keyof typeof bnDialogue] as string).length).toBeGreaterThan(0);
    }
  });

  it('selects lines and interpolates variables correctly', () => {
    const res = defaultDialogueManager.getGreeting({
      archetype: 'commuter',
      vars: { destination: 'Motinagar' },
    });

    expect(res).not.toBeNull();
    expect(res?.key).toContain('dialogue.pool.commuter.greeting.');
    expect(res?.text).toBeDefined();
  });

  it('selects flag-conditioned lines for recurring characters when conditions are met', () => {
    // Tanvir with helpedTanvirEarly
    const resWithFlag = defaultDialogueManager.getSmallTalk({
      archetype: 'commuter',
      characterId: 'char_tanvir',
      flags: { helpedTanvirEarly: true },
    });

    expect(resWithFlag?.key).toBe('dialogue.char.tanvir.punctual');

    // Rahim with tookRahimShortcut
    const resRahim = defaultDialogueManager.getSmallTalk({
      archetype: 'regular',
      characterId: 'char_rahim',
      flags: { tookRahimShortcut: true },
    });

    expect(resRahim?.key).toBe('dialogue.char.rahim.shortcut');
  });

  it('covers cultural themes in small talk (cricket, exams, jam, rain, family)', () => {
    const allLines = defaultDialogueManager.getAllLines();
    const smallTalkLines = allLines.filter((l) => l.phase === 'small_talk');

    const categories = new Set(smallTalkLines.map((l) => l.category));
    expect(categories.has('cricket')).toBe(true);
    expect(categories.has('exams')).toBe(true);
    expect(categories.has('jam')).toBe(true);
    expect(categories.has('rain')).toBe(true);
    expect(categories.has('family')).toBe(true);
  });

  it('dialogue selection with seeded RNG is fully deterministic', () => {
    const rng1 = new Rng(12345);
    const rng2 = new Rng(12345);

    const pick1 = defaultDialogueManager.getCounter({
      archetype: 'bargainer',
      rng: rng1,
      vars: { fare: 100, counter: 80 },
    });

    const pick2 = defaultDialogueManager.getCounter({
      archetype: 'bargainer',
      rng: rng2,
      vars: { fare: 100, counter: 80 },
    });

    expect(pick1?.key).toBe(pick2?.key);
    expect(pick1?.text).toBe(pick2?.text);
  });
});
