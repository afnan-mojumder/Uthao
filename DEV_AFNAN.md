# DEV_AFNAN.md: Member 1, Afnan Mojumder (≈60% of the work)

> **Agent: this is your entry point.** You work for **Afnan Mojumder**. Read this file, then `AGENT_WORKFLOW.md`, then `DEVELOPMENT_PLAN.md` in full, then `docs/GDD.md` in full. Then start the autonomy loop (`AGENT_WORKFLOW.md` §2) and keep going until your queue is done. Don't wait for further instructions. Only Afnan's agent edits this file.

## Identity

| | |
|---|---|
| Member slug (branches, scripts) | `afnan` |
| Branch pattern | `afnan/<Tx.y>-<slug>` |
| Git identity | `Afnan Mojumder` / `afnan.mojumder@gmail.com` (if `git config user.email` is empty, set this repo-locally) |
| Progress log | `docs/progress/afnan.md` |
| Other member | Tafsirul Shuvo (`tafsirul`, `DEV_TAFSIRUL.md`, never edit it) |

## Your area: engine, simulation and world

You own the simulation core, physics, rendering, the road network and city, traffic, the event director, missions/endings logic, and performance/balance. Tafsirul's agent builds on your contracts (plan §5), so **merge foundation tasks early and keep contracts stable** (additive changes only, see `AGENT_WORKFLOW.md` §5).

**Priority:** T0.1 → T0.2 → T0.3 block everything Tafsirul does. Do them first, keep them minimal, and merge each one as soon as it's green.

## Files you own

`src/core/**` · `src/sim/**` (except `src/sim/save/**`) · `src/physics/**` · `src/render/**` · `src/config/constants.ts` · `src/debug/**` · `scripts/gen-district.ts` · `scripts/validate-data.mjs` · `scripts/balance-report.ts` · `data/districts/**` · `data/world.json` · `data/archetypes.json` · `data/endings.json` · `data/encounters/crime.json` · `tests/unit/{core,sim,physics}/**` (except save) · `tests/balance/**` · `tests/e2e/perf.spec.ts` · all root configs (`tsconfig`, `vite`, `vitest`, `eslint`, `playwright`) after T0.1.

Shared with Tafsirul (union-merge, see `AGENT_WORKFLOW.md` §4): `package.json`, `src/core/{types,events,commands}.ts`, `src/sim/schemas.ts`, `src/sim/GameManager.ts`, `src/config/balance.ts`, `data/dialogue/**`, `docs/{DECISIONS,QUESTIONS,BALANCE}.md`.

## Your queue (150 of 248 points)

Work top to bottom, but **skip a task whose dependencies aren't done yet** and come back to it (`AGENT_WORKFLOW.md` §2 Step A). Dependencies marked **(T)** are Tafsirul's tasks. Task details are in `DEVELOPMENT_PLAN.md` under the same id.

Format: `- [ ] **<id>** <title> (<points>), deps: <ids>`. Tick by changing only `[ ]` → `[x]`, because `scripts/agent/*.sh` parse this exact format.

- [x] **T0.1** Scaffold, tooling, docs (3), deps: none
- [x] **T0.2** Core utilities (3), deps: T0.1
- [x] **T0.3** GameManager skeleton and fixed-step loop (3), deps: T0.2
- [x] **T1.1** Bike model, pure math (3), deps: T0.2
- [x] **T1.5** Road network v0 and routing (5), deps: T0.2
- [x] **T1.2** Physics world and MotorcycleController (5), deps: T1.1
- [x] **T1.3** Renderer, test scene, camera rig (5), deps: T0.3
- [x] **T1.6** Passenger FSM, pickup → drop-off (5), deps: T1.2, T1.3, T1.5
- [x] **T2.1** Request generator and fare model (3), deps: T1.5
- [x] **T2.2** Passenger AI (3), deps: T2.1
- [x] **T2.3** Negotiation system (5), deps: T2.2
- [x] **T2.6** Economy: fuel, costs, receipts (3), deps: T1.6
- [x] **T2.5** Detours, U-turns, pickup adjustment, off-app (5), deps: T2.3, T1.6
- [x] **T2.7** Lane graph and basic traffic (8), deps: T1.5, T1.3
- [x] **T2.9** Bots and balance test v1 (5), deps: T2.5, T2.6
- [x] **T3.2** District generator and Mirpara (8), deps: T1.5
- [x] **T3.5** Time of day and weather (5), deps: T1.3, T1.5
- [x] **T3.6** EventDirector and encounter framework (5), deps: T1.6, T0.4 (T)
- [x] **T3.3** City builder, render (8), deps: T3.2, T3.1 (T), T1.3
- [x] **T3.4** Pedestrians, rickshaws, local traffic (5), deps: T2.7
- [x] **T4.2** ReputationSystem (3), deps: T2.6
- [x] **T4.6** Crime and suspicious-pickup system (5), deps: T3.6
- [x] **T4.7** MissionManager, chapters 1–2, v1 crime mission, v1 ending (8), deps: T3.8 (T), T4.1 (T)
- [x] **T5.3** More traffic types and road events (5), deps: T3.4
- [ ] **T5.5** All five endings (5), deps: T4.7, T4.8 (T)
- [x] **T5.1** Remaining six districts (8), deps: T3.3
- [x] **T5.2** District streaming and LOD (8), deps: T5.1
- [x] **T5.9** Performance optimisation and PWA (8), deps: T5.2, T5.3
- [ ] **T6.2** Balance pass (5), deps: T5.4 (T), T5.5

## Notes specific to your tasks

- **T0.1:** the repo, `.gitignore`, `README.md`, `docs/GDD.md`, `docs/progress/*`, `scripts/agent/*`, `AGENT_WORKFLOW.md` and both member files already exist. Don't overwrite them. Also create `data/dialogue/{bn,en}/` with an empty `ui.json` (`{}`) so Tafsirul's T0.4 has a place to write.
- **T0.2/T0.3:** put the *full* §5 type and event lists into `types.ts`, `events.ts` and `commands.ts` now (types only, no implementations). Tafsirul's UI codes against them from day one.
- **T3.3** needs Tafsirul's asset loader (T3.1). If it's not merged yet, do T3.4/T4.2 first (the loop handles this).
- **T3.8 (Tafsirul)** writes a minimal linear `src/sim/mission/*` v0. **T4.7 (yours)** grows it into the full MissionManager. Keep the v0 API working.
- **T4.7**'s missions JSON (`data/missions/ch1.json`, `ch2.json`, `ch4.json`) is Tafsirul-owned content. Add to it, don't rewrite it.
- **T5.5:** bot policies may set story flags directly, so ending reachability doesn't have to wait for the full campaign (T5.4).
- **T6.2** is your last task. It tunes `balance.ts` against the full campaign.
