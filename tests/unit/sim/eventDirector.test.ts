import { describe, it, expect, vi } from 'vitest';
import { EventDirector } from '../../../src/sim/events/EventDirector';
import { GameManager } from '../../../src/sim/GameManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import type { EncounterDef } from '../../../src/sim/schemas';
import type { EncounterContext } from '../../../src/sim/events/conditions';
import type { EffectContext } from '../../../src/sim/events/effects';
import { SIM_DT } from '../../../src/config/constants';

describe('EventDirector and Encounter Framework (T3.6)', () => {
  const dummyEncounter: EncounterDef = {
    id: 'enc_test_weather',
    category: 'world',
    trigger: {
      phase: 'roaming',
      weather: ['heavyRain'],
      minCash: 500,
    },
    weight: 10,
    cooldownMin: 30,
    oncePerDay: false,
    lineKey: 'encounter.test.title',
    choices: [
      {
        id: 'opt_shelter',
        labelKey: 'encounter.test.choice.shelter',
        effects: [
          { type: 'time', min: 10 },
          { type: 'mood', delta: 0.1 },
        ],
      },
    ],
  };

  const cooldownEncounter: EncounterDef = {
    id: 'enc_test_cooldown',
    category: 'route',
    trigger: {
      phase: 'onTrip',
    },
    weight: 20,
    cooldownMin: 45,
    oncePerDay: true,
    lineKey: 'encounter.cooldown.title',
    choices: [
      {
        id: 'opt_ok',
        labelKey: 'encounter.cooldown.choice.ok',
        effects: [
          { type: 'money', amount: -50, kind: 'fare' },
        ],
      },
    ],
  };

  const choiceFilteredEncounter: EncounterDef = {
    id: 'enc_test_choice_requires',
    category: 'bike',
    trigger: {
      phase: 'roaming',
    },
    weight: 10,
    cooldownMin: 10,
    lineKey: 'encounter.choice.title',
    choices: [
      {
        id: 'opt_expensive_fix',
        labelKey: 'encounter.choice.expensive',
        requires: {
          minCash: 300,
        },
        effects: [
          { type: 'money', amount: -300, kind: 'repair' },
        ],
      },
      {
        id: 'opt_free_wait',
        labelKey: 'encounter.choice.free',
        effects: [
          { type: 'time', min: 20 },
        ],
      },
    ],
  };

  it('ineligible encounter never fires', () => {
    const director = new EventDirector({
      definitions: [dummyEncounter],
      seed: 42,
    });

    // Case 1: Wrong weather ('clear' instead of 'heavyRain')
    const ctx1: EncounterContext = {
      phase: 'roaming',
      minute: 60,
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 600,
      speedKmh: 0,
      bikeCondition: 100,
    };
    expect(director.evaluate(ctx1)).toBeNull();

    // Case 2: Correct weather, but insufficient cash (100 < 500)
    const ctx2: EncounterContext = {
      ...ctx1,
      minute: 61,
      weather: 'heavyRain',
      cash: 100,
    };
    expect(director.evaluate(ctx2)).toBeNull();

    // Case 3: Correct weather and cash, but wrong phase ('atPickup' instead of 'roaming')
    const ctx3: EncounterContext = {
      ...ctx1,
      minute: 62,
      weather: 'heavyRain',
      cash: 600,
      phase: 'atPickup',
    };
    expect(director.evaluate(ctx3)).toBeNull();

    // Case 4: All conditions met -> fires successfully
    const ctx4: EncounterContext = {
      ...ctx1,
      minute: 63,
      weather: 'heavyRain',
      cash: 600,
      phase: 'roaming',
    };
    const inst = director.evaluate(ctx4);
    expect(inst).not.toBeNull();
    expect(inst?.encounterId).toBe('enc_test_weather');
  });

  it('cooldown respected', () => {
    const director = new EventDirector({
      definitions: [cooldownEncounter],
      seed: 123,
    });

    const baseCtx: EncounterContext = {
      phase: 'onTrip',
      minute: 100,
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 500,
      speedKmh: 0,
      bikeCondition: 100,
    };

    // First evaluation: fires at minute 100, cooldown is 45 mins -> readyAt = 145
    const inst1 = director.evaluate(baseCtx);
    expect(inst1).not.toBeNull();

    // Resolve encounter so director has no active encounter blocking it
    const dummyGm = new GameManager({
      seed: 123,
      mode: 'career',
      data: { encounters: [] },
    });
    const effectCtx: EffectContext = {
      gameManager: dummyGm,
      economyManager: dummyGm.economyManager,
      eventBus: dummyGm.bus,
    };
    director.chooseOption(inst1!.id, 'opt_ok', effectCtx);
    expect(director.activeEncounter).toBeNull();

    // Evaluate at minute 120 (120 < 145, still in cooldown) -> must NOT fire
    const ctxAt120: EncounterContext = { ...baseCtx, minute: 120 };
    expect(director.evaluate(ctxAt120)).toBeNull();

    // Evaluate at minute 144 (still in cooldown) -> must NOT fire
    const ctxAt144: EncounterContext = { ...baseCtx, minute: 144 };
    expect(director.evaluate(ctxAt144)).toBeNull();

    // But note cooldownEncounter has oncePerDay: true. So on the same day it won't fire even after cooldown:
    const ctxAt150: EncounterContext = { ...baseCtx, minute: 150 };
    expect(director.evaluate(ctxAt150)).toBeNull();

    // Calling resetDaily (next day) allows it to fire at minute 151+
    director.resetDaily();
    const ctxAt151: EncounterContext = { ...baseCtx, day: 2, minute: 151 };
    const inst2 = director.evaluate(ctxAt151);
    expect(inst2).not.toBeNull();
    expect(inst2?.encounterId).toBe('enc_test_cooldown');
  });

  it('effects routed to owning systems (money only via EconomyManager)', () => {
    const bus = new EventBus<GameEvents>();
    const economyManager = new EconomyManager(bus, { cash: 100 });
    const gm = new GameManager({
      seed: 42,
      mode: 'career',
      data: { encounters: [] },
    });
    // Link gm economy to economyManager
    gm.economy.cash = economyManager.cash;

    const director = new EventDirector({
      definitions: [cooldownEncounter],
      seed: 42,
    });

    const ctx: EncounterContext = {
      phase: 'onTrip',
      minute: 200,
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 100,
      speedKmh: 0,
      bikeCondition: 80,
    };

    const inst = director.evaluate(ctx, bus);
    expect(inst).not.toBeNull();

    const txSpy = vi.fn();
    bus.on('economy/transaction', txSpy);

    const effectCtx: EffectContext = {
      gameManager: gm,
      economyManager,
      eventBus: bus,
    };

    // Choose opt_ok which costs 50 fare
    const resolved = director.chooseOption(inst!.id, 'opt_ok', effectCtx);
    expect(resolved).toBe(true);

    // Verified: money routed through EconomyManager
    expect(txSpy).toHaveBeenCalledTimes(1);
    expect(economyManager.cash).toBe(50);
    expect(gm.economy.cash).toBe(50);

    // Negative money converts to debt via EconomyManager
    const deficitEncounter: EncounterDef = {
      id: 'enc_deficit',
      category: 'payment',
      trigger: { phase: 'onTrip' },
      weight: 1,
      cooldownMin: 0,
      lineKey: 'enc.deficit',
      choices: [
        {
          id: 'pay_too_much',
          labelKey: 'enc.deficit.pay',
          effects: [{ type: 'money', amount: -200, kind: 'fine' }],
        },
      ],
    };

    const directorDeficit = new EventDirector({
      definitions: [deficitEncounter],
      seed: 42,
    });
    const instDeficit = directorDeficit.evaluate({ ...ctx, minute: 205 }, bus);
    expect(instDeficit).not.toBeNull();

    directorDeficit.chooseOption(instDeficit!.id, 'pay_too_much', effectCtx);
    // 50 cash - 200 = -150 => cash: 0, debt: 150
    expect(economyManager.cash).toBe(0);
    expect(economyManager.debt).toBe(150);
  });

  it('deterministic selection per seed', () => {
    const encA: EncounterDef = {
      id: 'enc_A',
      category: 'world',
      trigger: { phase: 'roaming' },
      weight: 30,
      cooldownMin: 5,
      lineKey: 'title.a',
      choices: [{ id: 'c1', labelKey: 'lbl', effects: [] }],
    };
    const encB: EncounterDef = {
      id: 'enc_B',
      category: 'world',
      trigger: { phase: 'roaming' },
      weight: 70,
      cooldownMin: 5,
      lineKey: 'title.b',
      choices: [{ id: 'c1', labelKey: 'lbl', effects: [] }],
    };

    const director1 = new EventDirector({ definitions: [encA, encB], seed: 7777 });
    const director2 = new EventDirector({ definitions: [encA, encB], seed: 7777 });

    const ctx: EncounterContext = {
      phase: 'roaming',
      minute: 10,
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 500,
      speedKmh: 0,
      bikeCondition: 100,
    };

    const result1 = director1.evaluate(ctx);
    const result2 = director2.evaluate(ctx);

    expect(result1?.encounterId).toBe(result2?.encounterId);
  });

  it('filters choices using requires condition', () => {
    const director = new EventDirector({
      definitions: [choiceFilteredEncounter],
      seed: 42,
    });

    // Player only has 100 cash (< 300 required for opt_expensive_fix)
    const ctxPoor: EncounterContext = {
      phase: 'roaming',
      minute: 50,
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 100,
      speedKmh: 0,
      bikeCondition: 100,
    };

    const inst1 = director.evaluate(ctxPoor);
    expect(inst1).not.toBeNull();
    // Only opt_free_wait should be available
    expect(inst1?.choices.map((c) => c.id)).toEqual(['opt_free_wait']);

    // Player has 500 cash (>= 300)
    const directorRich = new EventDirector({
      definitions: [choiceFilteredEncounter],
      seed: 42,
    });
    const ctxRich: EncounterContext = {
      ...ctxPoor,
      cash: 500,
    };
    const inst2 = directorRich.evaluate(ctxRich);
    expect(inst2?.choices.map((c) => c.id)).toEqual([
      'opt_expensive_fix',
      'opt_free_wait',
    ]);
  });

  it('pauses sim when encounter triggers and resumes when choice is resolved', () => {
    const gm = new GameManager({
      seed: 42,
      mode: 'career',
      data: {
        encounters: [
          {
            id: 'enc_pause_test',
            category: 'world',
            trigger: { phase: 'roaming' },
            weight: 100,
            cooldownMin: 10,
            lineKey: 'encounter.pause.title',
            choices: [
              {
                id: 'choice_continue',
                labelKey: 'encounter.pause.continue',
                effects: [{ type: 'time', min: 1 }],
              },
            ],
          },
        ],
      },
    });

    expect(gm.paused).toBe(false);

    // Tick gm: encounter should evaluate and trigger pause
    gm.tick(SIM_DT);
    expect(gm.eventDirector.activeEncounter).not.toBeNull();
    expect(gm.paused).toBe(true);

    const activeId = gm.eventDirector.activeEncounter!.id;

    // Further ticks do not advance clock while paused
    const minBefore = gm.clock.minutes;
    gm.tick(SIM_DT);
    expect(gm.clock.minutes).toBe(minBefore);

    // Resolve encounter via command
    const res = gm.dispatch({
      type: 'chooseEncounterOption',
      instanceId: activeId,
      choiceId: 'choice_continue',
    });
    expect(res.success).toBe(true);
    expect(gm.eventDirector.activeEncounter).toBeNull();
    expect(gm.paused).toBe(false);

    // Ticks resume advancing clock
    gm.tick(SIM_DT);
    expect(gm.clock.minutes).toBeGreaterThan(minBefore);
  });

  it('respects speed check when pauseOnDecisions is false', () => {
    const director = new EventDirector({
      definitions: [dummyEncounter],
      seed: 42,
      pauseOnDecisions: false,
    });

    const ctxFast: EncounterContext = {
      phase: 'roaming',
      minute: 70,
      day: 1,
      weather: 'heavyRain',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 600,
      speedKmh: 25, // >= 10 km/h blocks card
      bikeCondition: 100,
    };

    expect(director.evaluate(ctxFast)).toBeNull();

    const ctxSlow: EncounterContext = {
      ...ctxFast,
      minute: 71,
      speedKmh: 8, // < 10 km/h allows card
    };

    const inst = director.evaluate(ctxSlow);
    expect(inst).not.toBeNull();
  });
});
