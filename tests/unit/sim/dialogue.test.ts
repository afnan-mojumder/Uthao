import { describe, it, expect } from 'vitest';
import { DialogueManager, defaultDialogueManager } from '../../../src/sim/dialogue/DialogueManager';
import { Rng } from '../../../src/core/rng';
import type { ArchetypeId } from '../../../src/core/types';
import type { DialoguePhase } from '../../../src/sim/schemas';
import enDialogue from '../../../data/dialogue/en/dialogue.json';
import bnDialogue from '../../../data/dialogue/bn/dialogue.json';

describe('DialogueManager (T5.7 Richer Dialogue)', () => {
  const archetypes: ArchetypeId[] = ['bargainer', 'commuter', 'careful', 'regular', 'risky'];
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
    expect(custom.getAllLines().length).toBeGreaterThanOrEqual(525);
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

  it('has 100% key parity between English and Bangla dialogue dictionaries', () => {
    const enKeys = Object.keys(enDialogue);
    const bnKeys = Object.keys(bnDialogue);

    expect(enKeys.length).toBeGreaterThanOrEqual(525);
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
