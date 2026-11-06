import { describe, it, expect } from 'vitest';
import ch1 from '../../../data/missions/ch1.json';
import ch2 from '../../../data/missions/ch2.json';
import ch3 from '../../../data/missions/ch3.json';
import ch4 from '../../../data/missions/ch4.json';
import ch5 from '../../../data/missions/ch5.json';
import ch6 from '../../../data/missions/ch6.json';
import side from '../../../data/missions/side.json';
import bike from '../../../data/encounters/bike.json';
import crime from '../../../data/encounters/crime.json';
import passenger from '../../../data/encounters/passenger.json';
import payment from '../../../data/encounters/payment.json';
import pickup from '../../../data/encounters/pickup.json';
import route from '../../../data/encounters/route.json';

// Static cross-checks between the campaign content and the encounter content.
// Each rule below is a way the campaign used to softlock: a mission waiting
// for an encounter id that does not exist, a choice id that is not on the
// encounter, or a story flag that nothing in the game ever sets.

interface Objective {
  id: string;
  type: string;
  encounterId?: string;
  choiceIds?: string[];
  key?: string;
  value?: boolean | number | string;
}
interface Reward {
  type: string;
  key?: string;
  value?: boolean | number | string;
}
interface Mission {
  id: string;
  objectives: Objective[];
  rewards?: Reward[];
}
interface Effect {
  type: string;
  key?: string;
  value?: boolean | number | string;
}
interface Choice {
  id: string;
  effects?: Effect[];
}
interface Encounter {
  id: string;
  choices: Choice[];
}

const missions = [...ch1, ...ch2, ...ch3, ...ch4, ...ch5, ...ch6, ...side] as Mission[];
const encounters = [...bike, ...crime, ...passenger, ...payment, ...pickup, ...route] as Encounter[];
const encounterById = new Map(encounters.map((e) => [e.id, e]));

// Flags the engine sets itself, not through data. Each must be emitted from code.
const ENGINE_FLAG_SETTERS = [
  'ch6_decision_made=true', // GameManager, on selectCareerChoice
];

// Every (key, value) a player can set in game: mission rewards, encounter choice effects, engine emitters.
const flagSetters = new Set<string>(ENGINE_FLAG_SETTERS);
for (const m of missions) {
  for (const r of m.rewards ?? []) {
    if (r.type === 'flag') flagSetters.add(`${r.key}=${String(r.value)}`);
  }
}
for (const e of encounters) {
  for (const c of e.choices) {
    for (const x of c.effects ?? []) {
      if (x.type === 'flag') flagSetters.add(`${x.key}=${String(x.value)}`);
    }
  }
}

describe('campaign content references', () => {
  it('every encounter an objective names exists', () => {
    // Arrange
    const named = missions.flatMap((m) =>
      m.objectives
        .filter((o) => o.encounterId !== undefined)
        .map((o) => ({ mission: m.id, objective: o.id, encounterId: o.encounterId! }))
    );

    // Act
    const missing = named.filter((n) => !encounterById.has(n.encounterId));

    // Assert
    expect(missing).toEqual([]);
  });

  it('every choice an objective names is a choice of the encounter it names', () => {
    // Arrange
    const named = missions.flatMap((m) =>
      m.objectives
        .filter((o) => o.choiceIds !== undefined)
        .flatMap((o) =>
          (o.choiceIds ?? []).map((choiceId) => ({
            mission: m.id,
            objective: o.id,
            encounterId: o.encounterId ?? '',
            choiceId,
          }))
        )
    );

    // Act
    const unknown = named.filter((n) => {
      const enc = encounterById.get(n.encounterId);
      return !enc || !enc.choices.some((c) => c.id === n.choiceId);
    });

    // Assert
    expect(unknown).toEqual([]);
  });

  it('every flag objective is set by a mission reward or an encounter choice', () => {
    // Arrange
    const flagObjectives = missions.flatMap((m) =>
      m.objectives
        .filter((o) => o.type === 'flag')
        .map((o) => ({ mission: m.id, objective: o.id, key: `${o.key}=${String(o.value)}` }))
    );

    // Act
    const unset = flagObjectives.filter((f) => !flagSetters.has(f.key));

    // Assert: a flag nothing sets leaves its mission, and every later one, locked
    expect(unset).toEqual([]);
  });
});
