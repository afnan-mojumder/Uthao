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

    // GameManager defaults to non-pausing cards; this test covers the pause path explicitly.
    gm.eventDirector.pauseOnDecisions = true;
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

  it('resetDaily() clears cooldowns and nextGlobalEncounterMinute for Day 2 rollover', () => {
    const lateEnc: EncounterDef = {
      id: 'enc_late_night',
      category: 'world',
      trigger: { phase: 'roaming' },
      weight: 10,
      cooldownMin: 180,
      oncePerDay: false,
      lineKey: 'encounter.late.title',
      choices: [{ id: 'ok', labelKey: 'encounter.late.ok', effects: [] }],
    };

    const director = new EventDirector({
      definitions: [lateEnc],
      seed: 42,
      globalCooldownMin: 30,
    });

    const day1LateCtx: EncounterContext = {
      phase: 'roaming',
      minute: 22 * 60 + 50, // 1370 -> cooldown until 1550, global until 1400
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 500,
      speedKmh: 0,
      bikeCondition: 100,
    };

    const inst1 = director.evaluate(day1LateCtx);
    expect(inst1).not.toBeNull();

    const gm = new GameManager({ seed: 42, mode: 'career', data: { encounters: [] } });
    director.chooseOption(inst1!.id, 'ok', {
      gameManager: gm,
      economyManager: gm.economyManager,
      eventBus: gm.bus,
    });

    // Day 2 morning (minute 425) after resetDaily(): cooldowns and global cooldown must be cleared
    director.resetDaily();
    const day2MorningCtx: EncounterContext = {
      ...day1LateCtx,
      day: 2,
      minute: 7 * 60 + 5, // 425 < 1550 and < 1400
    };
    const inst2 = director.evaluate(day2MorningCtx);
    expect(inst2).not.toBeNull();
    expect(inst2?.encounterId).toBe('enc_late_night');
  });

  it('forceStart() filters choice.requires and prevents unaffordable choices or empty-choice softlocks', () => {
    const director = new EventDirector({
      definitions: [
        choiceFilteredEncounter,
        {
          id: 'enc_all_expensive',
          category: 'bike',
          trigger: { phase: 'roaming' },
          weight: 10,
          cooldownMin: 10,
          lineKey: 'encounter.expensive.title',
          choices: [
            {
              id: 'pay_300',
              labelKey: 'encounter.expensive.pay',
              requires: { minCash: 300 },
              effects: [{ type: 'money', amount: -300, kind: 'repair' }],
            },
          ],
        },
      ],
      seed: 42,
    });

    const brokeCtx: EncounterContext = {
      phase: 'roaming',
      minute: 50,
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 50,
      speedKmh: 0,
      bikeCondition: 100,
    };

    // Never offers minCash: 300 when broke
    const inst = (director.forceStart as (id: string, b?: EventBus<GameEvents>, c?: EncounterContext) => ReturnType<EventDirector['forceStart']>)(
      'enc_test_choice_requires',
      undefined,
      brokeCtx
    );
    expect(inst).not.toBeNull();
    expect(inst?.choices.map((c) => c.id)).toEqual(['opt_free_wait']);

    // Edge case: all choices fail requires -> safely returns null without softlocking activeEncounter
    const gm = new GameManager({ seed: 42, mode: 'career', data: { encounters: [] } });
    gm.economyManager.cash = 0;
    const directorAllExpensive = new EventDirector({
      definitions: [director.definitions[1]!],
      seed: 42,
    });
    const blocked = (directorAllExpensive.forceStart as (id: string, b?: EventBus<GameEvents>, c?: EncounterContext) => ReturnType<EventDirector['forceStart']>)(
      'enc_all_expensive',
      gm.bus,
      brokeCtx
    );
    expect(blocked).toBeNull();
    expect(directorAllExpensive.activeEncounter).toBeNull();
    expect(directorAllExpensive.evaluate(brokeCtx)).toBeNull();
  });

  it('severe events emit cueKey >= 10s of sim time before firing and can be avoided via counterplay', () => {
    const bus = new EventBus<GameEvents>();
    const cues: Array<{ encounterId: string; cueKey: string }> = [];
    const started: string[] = [];
    (bus as unknown as { on: (k: string, fn: (p: { encounterId: string; cueKey: string }) => void) => void }).on(
      'encounter/cue',
      (p) => cues.push(p)
    );
    bus.on('encounter/started', ({ instance }) => started.push(instance.encounterId));

    const severeEnc = {
      id: 'enc_severe_alley',
      category: 'crime' as const,
      trigger: { phase: 'onTrip' as const, roadType: ['alley'] },
      weight: 10,
      cooldownMin: 60,
      lineKey: 'encounter.severe.title',
      cueKey: 'encounter.severe.cue',
      choices: [
        { id: 'comply', labelKey: 'encounter.severe.comply', effects: [] },
      ],
    } as EncounterDef;

    const director = new EventDirector({
      definitions: [severeEnc],
      seed: 42,
    });

    const alleySeg = {
      segmentId: 'seg_alley',
      startNodeId: 'a',
      endNodeId: 'b',
      width: 4,
      surfaceCondition: 0.7,
      trafficDensity: 0.1,
      speedLimit: 20,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.2,
      riskLevel: 0.8,
      oneWay: false,
      divided: false,
      lanes: 1,
      roadType: 'alley' as const,
      floodSensitivity: 0.5,
      pickupPractical: true,
      district: 'mirpara' as const,
      tags: ['alley'],
    };

    const alleyCtx: EncounterContext = {
      phase: 'onTrip',
      minute: 1200,
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 500,
      speedKmh: 0,
      bikeCondition: 100,
      segment: alleySeg,
    };

    // Initial tick emits cueKey, does NOT fire immediately
    expect(director.evaluate(alleyCtx, bus)).toBeNull();
    expect(cues).toHaveLength(1);
    expect(cues[0]?.cueKey).toBe('encounter.severe.cue');
    expect(started).toHaveLength(0);

    // < 10s of sim time (TIME_SCALE = 80 -> 10s = 13.333 game minutes): still waiting
    expect(director.evaluate({ ...alleyCtx, minute: 1210 }, bus)).toBeNull();
    expect(started).toHaveLength(0);

    // >= 10s of sim time (minute 1214 -> +14 game min = 10.5s sim time): fires!
    const inst = director.evaluate({ ...alleyCtx, minute: 1214 }, bus);
    expect(inst?.encounterId).toBe('enc_severe_alley');
    expect(started).toEqual(['enc_severe_alley']);

    // Counterplay: leaving the alley before 10s cancels the pending cue
    const director2 = new EventDirector({ definitions: [severeEnc], seed: 42 });
    const bus2 = new EventBus<GameEvents>();
    const cues2: unknown[] = [];
    const started2: string[] = [];
    (bus2 as unknown as { on: (k: string, fn: (p: unknown) => void) => void }).on('encounter/cue', (p) =>
      cues2.push(p)
    );
    bus2.on('encounter/started', ({ instance }) => started2.push(instance.encounterId));
    expect(director2.evaluate(alleyCtx, bus2)).toBeNull();
    expect(cues2).toHaveLength(1);
    const mainCtx: EncounterContext = {
      ...alleyCtx,
      minute: 1215,
      segment: { ...alleySeg, roadType: 'main', tags: [] },
    };
    expect(director2.evaluate(mainCtx, bus2)).toBeNull();
    expect(started2).toHaveLength(0);
  });

  it('evaluates seeded outcome tables, respects entry.requires, and emits outcomeLineKey', () => {
    const outcomeEnc = {
      id: 'enc_outcome_test',
      category: 'route' as const,
      trigger: { phase: 'roaming' as const },
      weight: 10,
      cooldownMin: 10,
      lineKey: 'encounter.outcome.title',
      choices: [
        {
          id: 'gamble',
          labelKey: 'encounter.outcome.gamble',
          riskKey: 'encounter.outcome.risk',
          costHint: 150,
          kind: 'illicit' as const,
          effects: [
            {
              type: 'outcome' as const,
              table: [
                {
                  weight: 50,
                  requires: { minCash: 500 },
                  lineKey: 'encounter.outcome.rich_win',
                  effects: [{ type: 'money' as const, amount: 100, kind: 'event' as const }],
                },
                {
                  weight: 50,
                  lineKey: 'encounter.outcome.accepted',
                  effects: [{ type: 'money' as const, amount: -150, kind: 'bribe' as const }],
                },
              ],
            },
          ],
        },
      ],
    } as EncounterDef;

    const gm1 = new GameManager({ seed: 99, mode: 'career', data: { encounters: [outcomeEnc] } });
    gm1.economyManager.cash = 200; // < 500 so rich_win entry is filtered out by requires!
    const resolvedEvents: Array<{ outcomeLineKey?: string }> = [];
    gm1.bus.on('encounter/resolved', (ev) => resolvedEvents.push(ev as { outcomeLineKey?: string }));

    // First evaluation arms the 3-min initial grace on GameManager; evaluate again after 3 min
    const baseOutcomeCtx: EncounterContext = {
      phase: 'roaming',
      minute: 95,
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 200,
      speedKmh: 0,
      bikeCondition: 100,
    };
    expect(gm1.eventDirector.evaluate(baseOutcomeCtx, gm1.bus)).toBeNull();
    const inst = gm1.eventDirector.evaluate({ ...baseOutcomeCtx, minute: 100 }, gm1.bus);
    expect(inst).not.toBeNull();
    expect((inst!.choices[0] as { kind?: string }).kind).toBe('illicit');
    expect((inst!.choices[0] as { costHint?: number }).costHint).toBe(150);
    expect((inst!.choices[0] as { riskKey?: string }).riskKey).toBe('encounter.outcome.risk');

    gm1.dispatch({ type: 'chooseEncounterOption', instanceId: inst!.id, choiceId: 'gamble' });
    expect(gm1.economyManager.cash).toBe(50);
    expect(resolvedEvents[0]?.outcomeLineKey).toBe('encounter.outcome.accepted');
  });

  it('resetDaily() clears activeEncounter, activeEncounterDef, and pendingCue alongside cooldowns', () => {
    const severeEnc = {
      id: 'enc_reset_active',
      category: 'crime' as const,
      trigger: { phase: 'roaming' as const },
      weight: 10,
      cooldownMin: 120,
      lineKey: 'encounter.reset.title',
      cueKey: 'encounter.reset.cue',
      choices: [{ id: 'ok', labelKey: 'encounter.reset.ok', effects: [] }],
    } as EncounterDef;

    const director = new EventDirector({ definitions: [severeEnc], seed: 7 });
    const ctx: EncounterContext = {
      phase: 'roaming',
      minute: 1200,
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 500,
      speedKmh: 0,
      bikeCondition: 100,
    };

    // Pending cue gets cleared by resetDaily()
    expect(director.evaluate(ctx)).toBeNull();
    expect(director.pendingCue).not.toBeNull();
    director.resetDaily();
    expect(director.pendingCue).toBeNull();

    // Active encounter gets cleared by resetDaily()
    const inst = director.forceStart('enc_reset_active');
    expect(inst).not.toBeNull();
    expect(director.activeEncounter).not.toBeNull();
    expect(director.activeEncounterDef).not.toBeNull();
    director.resetDaily();
    expect(director.activeEncounter).toBeNull();
    expect(director.activeEncounterDef).toBeNull();
  });

  it('emits encounter/cueCleared when counterplay cancels a pendingCue and preserves metadata in evaluateSegmentCrime', () => {
    const bus = new EventBus<GameEvents>();
    const cleared: Array<{ encounterId: string }> = [];
    (bus as unknown as { on: (k: string, fn: (p: { encounterId: string }) => void) => void }).on(
      'encounter/cueCleared',
      (p) => cleared.push(p)
    );

    const crimeEnc = {
      id: 'enc_crime_meta',
      category: 'crime' as const,
      trigger: { phase: 'onTrip' as const, roadType: ['alley'] },
      weight: 10,
      cooldownMin: 60,
      lineKey: 'encounter.crime.title',
      cueKey: 'encounter.crime.cue',
      choices: [
        {
          id: 'try_flee',
          labelKey: 'encounter.crime.flee',
          kind: 'illicit' as const,
          riskKey: 'encounter.crime.risk',
          costHint: 50,
          effects: [{ type: 'startMinigame' as const, kind: 'flee' as const }],
        },
      ],
    } as EncounterDef;

    const alleySeg = {
      segmentId: 'seg_a',
      startNodeId: 'n1',
      endNodeId: 'n2',
      width: 4,
      surfaceCondition: 0.7,
      trafficDensity: 0.1,
      speedLimit: 20,
      turnRestrictions: [],
      motorcycleAccessible: true,
      pedestrianDensity: 0.2,
      riskLevel: 1.0,
      oneWay: false,
      divided: false,
      lanes: 1,
      roadType: 'alley' as const,
      floodSensitivity: 0.5,
      pickupPractical: true,
      district: 'mirpara' as const,
      tags: ['alley'],
    };

    const director = new EventDirector({ definitions: [crimeEnc], seed: 42 });
    const alleyCtx: EncounterContext = {
      phase: 'onTrip',
      minute: 1200,
      day: 1,
      weather: 'clear',
      chapter: 1,
      flags: {},
      relationships: {},
      cash: 500,
      speedKmh: 0,
      bikeCondition: 100,
      segment: alleySeg,
    };

    expect(director.evaluate(alleyCtx, bus)).toBeNull();
    expect(director.pendingCue?.encounterId).toBe('enc_crime_meta');

    // Leaving alley emits encounter/cueCleared immediately
    director.evaluate(
      { ...alleyCtx, minute: 1201, segment: { ...alleySeg, roadType: 'main', tags: [] } },
      bus
    );
    expect(cleared).toEqual([{ encounterId: 'enc_crime_meta' }]);

    // evaluateSegmentCrime preserves cueKey and choice metadata
    const fakeRng = { next: () => 0.75, chance: () => true, int: () => 1234 };
    const crimeRes = director.evaluateSegmentCrime(alleySeg, alleyCtx, bus, fakeRng as never);
    expect(crimeRes.instance?.cueKey).toBe('encounter.crime.cue');
    const fleeChoice = crimeRes.instance?.choices.find((c) => c.id === 'try_flee');
    expect(fleeChoice?.kind).toBe('illicit');
    expect(fleeChoice?.riskKey).toBe('encounter.crime.risk');
    expect(fleeChoice?.costHint).toBe(50);
  });
});
