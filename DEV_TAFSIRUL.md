# DEV_TAFSIRUL.md: Member 2, Tafsirul Shuvo (≈40% of the work)

> **Agent: this is your entry point.** You work for **Tafsirul Shuvo**. Read this file, then `AGENT_WORKFLOW.md`, then `DEVELOPMENT_PLAN.md` in full, then `docs/GDD.md` in full. Then start the autonomy loop (`AGENT_WORKFLOW.md` §2) and keep going until your queue is done. Don't wait for further instructions. Only Tafsirul's agent edits this file.

## Identity

| | |
|---|---|
| Member slug (branches, scripts) | `tafsirul` |
| Branch pattern | `tafsirul/<Tx.y>-<slug>` |
| Git identity | `Tafsirul Shuvo` / use the email already in `git config user.email`. If none is set, ask your human once (`AGENT_WORKFLOW.md` §6) and set it repo-locally. |
| Progress log | `docs/progress/tafsirul.md` |
| Other member | Afnan Mojumder (`afnan`, `DEV_AFNAN.md`, never edit it) |

Note: the tea-stall friend character in the game is **Mintu**, not Shuvo, which avoids any mix-up with your name.

## Your area: player experience, content and release

You own input, every UI screen and the HUD, i18n, audio, the asset pipeline, encounter/mission/character content, dialogue, save/load, the garage/economy UX, the campaign story content, accessibility, testing documentation and releases. You build against Afnan's sim contracts (plan §5). If a contract you need isn't merged yet, the loop skips that task until it is.

**Starting out:** your first ready tasks need only Afnan's T0.1 (scaffold). Until T0.1 is on `main`, the loop's `wait-for.sh T0.1` waits. That's expected.

## Files you own

`src/ui/**` · `src/input/**` · `src/audio/**` · `src/sim/save/**` · `data/dialogue/**` (shared registry, union-merge) · `data/encounters/**` (except `crime.json`) · `data/missions/**` · `data/characters.json` · `data/upgrades.json` · `data/bikes.json` · `scripts/fetch-assets.mjs` · `scripts/optimize-assets.mjs` · `assets.manifest.json` · `public/assets/**` · `docs/ASSETS.md` · `docs/PLAYTEST.md` · `README.md` (player/dev instructions, after T0.1) · `tests/unit/{ui,input,save}/**` · `tests/e2e/**` (except `perf.spec.ts`).

Shared with Afnan (union-merge, see `AGENT_WORKFLOW.md` §4): `package.json`, `src/core/{types,events,commands}.ts`, `src/sim/schemas.ts`, `src/sim/GameManager.ts`, `src/config/balance.ts`, `docs/{DECISIONS,QUESTIONS,BALANCE}.md`.

## Your queue (98 of 248 points)

Work top to bottom, but **skip a task whose dependencies aren't done yet** and come back to it (`AGENT_WORKFLOW.md` §2 Step A). Dependencies marked **(A)** are Afnan's tasks. Task details are in `DEVELOPMENT_PLAN.md` under the same id.

Format: `- [ ] **<id>** <title> (<points>), deps: <ids>`. Tick by changing only `[ ]` → `[x]`, because `scripts/agent/*.sh` parse this exact format.

- [x] **T1.4** Input: keyboard, gamepad, touch, tilt, bindings (5), deps: T0.1 (A)
- [x] **T3.1** Asset pipeline (5), deps: T0.1 (A)
- [x] **T0.4** App shell: capability check, lifecycle, overlays, i18n (3), deps: T0.3 (A)
- [x] **T3.9** Audio (3), deps: T1.3 (A)
- [x] **T2.4** Negotiation and phone UI (5), deps: T2.3 (A), T0.4
- [ ] **T2.8** Rider HUD v1 and minimap (3), deps: T1.6 (A), T2.6 (A), T0.4
- [ ] **T4.1** Day lifecycle and living expenses (3), deps: T2.6 (A)
- [ ] **T4.4** Upgrades, repairs, garage screen (5), deps: T2.6 (A), T0.4
- [ ] **T3.10** Menus, settings, pause/map screen (3), deps: T0.4, T3.3 (A)
- [ ] **T3.7** Vertical-slice encounters, 5 (5), deps: T3.6 (A), T2.5 (A)
- [ ] **T3.8** Opening sequence "First Ride" plus mission v0 (5), deps: T3.7, T2.4, T3.3 (A)
- [ ] **T4.3** Recurring passengers and direct bookings (3), deps: T4.2 (A), T2.2 (A)
- [ ] **T4.5** Remaining signature situations (5), deps: T3.6 (A), T2.5 (A)
- [ ] **T4.8** Identity tendencies (2), deps: T4.2 (A)
- [ ] **T4.9** SaveSystem (5), deps: T4.2 (A), T4.7 (A)
- [ ] **T4.10** Mobile HUD polish and v1.0 release (3), deps: T4.9, T4.6 (A), T4.5, T4.4, T3.10, T2.8
- [ ] **T5.6** Additional motorcycles (3), deps: T4.4
- [ ] **T5.8** Deliveries (3), deps: T4.4
- [ ] **T5.7** Richer dialogue (8), deps: T4.3
- [ ] **T5.4** Campaign chapters 2–6, side missions, Endless mode (13), deps: T4.7 (A), T5.1 (A)
- [ ] **T6.3** Accessibility and localisation (3), deps: T4.10
- [ ] **T6.1** Full test matrix (3), deps: T5.4, T5.5 (A), T5.9 (A)
- [ ] **T6.4** Branding, credits, final build (2), deps: T6.1, T6.2 (A), T6.3

## Notes specific to your tasks

- **T1.4 / T3.1** need only the scaffold. Do them first, even before T0.4.
- **T0.4:** `data/dialogue/{bn,en}/` is split by area (`ui.json`, `hud.json`, `phone.json`, `negotiation.json`, `encounters.json`, `missions.json`, `characters.json`, `signs.json`). `i18n.ts` merges all files per language at load. Always add keys to the file for your area. Never reformat whole files, which keeps merges with Afnan clean.
- **T3.8:** write the *minimal* linear mission runner in `src/sim/mission/` (Afnan-owned folder; this task's Files list allows it). Keep it small. Afnan's T4.7 grows it.
- **T4.1** touches `GameManager.ts` and `EconomyManager.ts` (Afnan's). Keep edits additive: new methods and new event handlers.
- **T4.10** and **T6.4** are the release tasks: `git tag v1.0.0` / `v2.0.0` on `main` after the merge (`git tag vX && git push origin vX`). **Don't deploy publicly.** Add a "ready to deploy" entry to `docs/QUESTIONS.md` for the humans.
- **Bangla text:** write natural, colloquial Dhaka Bangla. Add a "needs native review" entry to `docs/QUESTIONS.md` for each new dialogue file, since only a human can sign off on idiom quality.
- **T6.4** is your last task.
