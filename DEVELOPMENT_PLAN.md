# Dhaka Bike Rider: Meter Chole Na — Full Development Plan (Browser Game)

> **For agentic workers:** Don't start here. Start from your member file: **`DEV_AFNAN.md`** (Member 1, Afnan Mojumder) or **`DEV_TAFSIRUL.md`** (Member 2, Tafsirul Shuvo). That file holds your task queue, the git workflow and the autonomy loop. **This file is the shared technical spec.** It gives every task's files, interfaces, tests and done criteria. Treat it as read-only: never tick its checkboxes (the `- [ ]` lines here are step lists for you to follow). Only change it to fix the spec, and log the change in `docs/DECISIONS.md`. Also read the game design document `docs/GDD.md` in full. Use test-driven development throughout.

**Goal:** Build *Dhaka Bike Rider: Meter Chole Na*, a browser-playable 3D motorcycle ride-hailing life-sim set in a fictional Dhaka-inspired city. It runs on desktop browsers (keyboard/gamepad) and Android Chrome (touch), and covers every system, chapter, ending and expansion in the GDD.

**Architecture:** A deterministic, render-free simulation core in TypeScript (`src/sim`) holds all game rules: rides, negotiation, economy, reputation, missions, events, traffic and weather. It runs on a fixed 60 Hz tick with seeded RNG and is fully unit-testable in Node. A thin Three.js render layer reads sim state and draws it. Rapier (WASM) handles motorcycle collisions. A Preact DOM overlay draws HUD and screens, and talks to the sim only through a typed command queue and event bus. The city is generated from JSON road-graph data, not hand-placed in an editor.

**Tech Stack:** TypeScript (strict) · Vite · Three.js (WebGLRenderer, not WebGPU) · @dimforge/rapier3d-compat · Preact + @preact/signals · zod (data validation) · Vitest · Playwright · ESLint · gltf-transform CLI (asset optimisation) · vite-plugin-pwa (Milestone 5).

**Spec:** `docs/GDD.md` (a copy of `dhaka_bike_rider_game_design_document.md`). When this plan and the GDD disagree, this plan wins. It already resolves GDD §19.

---

## 0. Resolved decisions (GDD §19 and gaps)

| Decision | Value |
|---|---|
| Platform | Web browser. PC (Chrome/Edge/Firefox latest 2) **and** Android Chrome (latest 2) are both first-class from day one. iOS Safari is best-effort only. |
| Engine | Three.js + Rapier. It is the most mature browser 3D stack, and code-only with no editor, so an agent can build and test it from a CLI. |
| Visual style | Stylized, optimised low-poly 3D (GDD "stylized, optimized 3D"). Kenney/Quaternius CC0 packs plus procedural primitives. |
| Camera | Third-person chase by default. First-person rider's-eye can be toggled (key `C` / camera button). |
| Main experience | Hybrid: Career (6 chapters, 20 days) plus Endless Ride mode (sandbox, no story) from the main menu. |
| Orientation | Landscape only on mobile. Show a "rotate your phone" overlay in portrait. |
| Languages | Bangla (default for passenger dialogue) and English. UI language toggle. Every string is in both. Font: Noto Sans Bengali (OFL, self-hosted). |
| In-game ride app | **"Uthao"** (fictional). No real brand names (Pathao, Uber, Obhai, etc.) anywhere. |
| District names (fictional) | Mirpara (Mirpur-inspired, start) · Fulgate (Farmgate) · Dhanbagh (Dhanmondi) · Mohakhal (Mohakhali) · Gulbari (Gulshan/Banani) · Puran Para (Old Dhaka) · Motinagar (Motijheel) |
| Currency | ৳, fictional balance values (GDD: "not real-world averages"). |
| Player robbing NPCs | Not implemented as a mechanic. The GDD's optional moral branch is the Ch4 "join the scheme" choice, which feeds the Fast Money ending. |
| Voice acting | None. Text dialogue plus CC0 SFX/ambience only (GDD defers voice). |
| Multiplayer, multiple cities | Not built (GDD §16 "defer"). |

---

## 1. Agent operating rules (read before every session)

1. **Repo** is a git repository with `main` as the integration branch. Two members' agents work on it in parallel, each on its own task branches. Git mechanics (branching, rebasing, merging, pushing) are defined in the member files and in `scripts/agent/*.sh`. Use those scripts and don't improvise git.
2. **Standard task loop**, used for every task: write the listed failing tests → run them and see them fail → implement → run `npm run check` (green) → for render/UI tasks, also run the task's e2e/screenshot check → commit on your task branch with a conventional message that names the task (`feat(T1.2): …`, `fix(T1.2): …`, `test(…)`, `chore(…)`, `content(…)`) → when the task is done, follow "Finishing a task" in your member file.
3. **Never commit red.** `npm run check` = `tsc --noEmit && eslint . && vitest run && node scripts/validate-data.mjs`.
4. **Sim purity:** nothing under `src/sim/**` or `src/core/**` may import `three`, `preact`, `@dimforge/*`, or touch `window`/`document`. Enforce it with an ESLint `no-restricted-imports` rule from Task 0.1. All randomness goes through `core/rng.ts` (no `Math.random()` in sim, also enforced by lint).
5. **All tunable numbers** live in `src/config/balance.ts` (gameplay) or `src/config/constants.ts` (engine/time), never inline. Content lives in `data/**/*.json`, validated by zod schemas in `src/sim/schemas.ts`.
6. **Decisions you make** that this plan doesn't cover go in `docs/DECISIONS.md` (date, decision, reason). If something genuinely blocks you, write it to `docs/QUESTIONS.md`, choose the safest default, and keep going.
7. **Assets:** only CC0 (or OFL for fonts). Record every asset's source URL and licence in `docs/ASSETS.md`. If you can't download something, use procedural primitives and log it. Never block on art.
8. **Cultural tone (GDD §2, §18.5):** humour comes from situations, not caricature. No neighbourhood is "the dangerous one" (crime risk is a per-segment, time-dependent variable everywhere). Risky ≠ criminal (most `Risky` archetype rides are harmless). No real people, brands, or exact real-world geography.
9. **Safety rule (GDD §7.2, §18.9):** no system may make unsafe actions the optimal strategy. The balance tests in Task 2.9/6.2 enforce this.
10. **Keep files focused** (< ~400 lines). One responsibility per file. Tests mirror `src` paths under `tests/unit/`.

---

## 2. Global constraints

- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`. Pin exact dependency versions (no `^`/`~`), using the latest stable at scaffold time.
- Fixed simulation step `SIM_DT = 1/60` s, with an accumulator and at most 5 sim steps per frame. Clamp frame dt to 0.25 s.
- Time compression `TIME_SCALE = 20` (1 real second = 20 game seconds). A shift runs 07:00 → 23:00, which is 48 real minutes.
- Distance compression `DISTANCE_SCALE = 3` (1 map metre = 3 "virtual" metres for fare, fuel, wear and ETA). Physics and rendering use map metres.
- Performance budgets: **mobile** (mid-range Android, ~4 GB RAM) sustained ≥ 30 fps, ≤ 150 draw calls, ≤ 300k visible triangles, JS heap ≤ 300 MB. **PC** ≥ 60 fps. Initial download ≤ 15 MB gzip before first ride. Each extra district ≤ 6 MB.
- Touch targets ≥ 48 CSS px. Dialogue/negotiation buttons never overlap the steering/throttle zones (GDD §13).
- Every player-visible string is an i18n key with `bn` and `en` values.
- Deterministic replay: the same seed plus the same input log gives the same sim state (Task 0.3 tests this).

## 3. Review focus (failure modes no feature test covers; each one has a test in its owning task)

1. **Mobile tab/background interruption.** On `visibilitychange` → hidden, the sim pauses and autosaves. When it comes back, nothing jumps (dt clamp). *Test: T0.4 `pauses on hidden`, T4.9 `autosaves on hidden`.*
2. **Old, corrupt or missing save data**, or localStorage unavailable (private mode). Migrate old versions. If a save is corrupt, show "save unreadable, start new?" and keep a backup copy. With no storage, fall back to memory and show a warning. *Test: T4.9.*
3. **Absurd negotiation input**, like ৳0, ৳999999, decimals, or spamming counter. Clamp to `[MIN_FARE, 5 × fairFare]`, round to ৳5, and enforce the round limit. *Test: T2.3.*
4. **Unroutable requests**: pickup or destination on a motorcycle-inaccessible, flooded or closed segment, or a route that becomes blocked mid-trip. The generator must never emit one. Mid-trip blocks trigger a reroute. If no route exists, the passenger walks to the nearest accessible node. *Test: T2.1, T2.5.*
5. **Small/portrait screens and WebGL failure**: portrait shows the rotate overlay. `webglcontextlost` pauses and restores. No WebGL2 shows a friendly unsupported message. *Test: T3.10 e2e, T0.4.*

---

## 4. Repository layout (lock this in Task 0.1)

```
/                       index.html, package.json, tsconfig.json, vite.config.ts,
                        vitest.config.ts, playwright.config.ts, eslint.config.js
DEVELOPMENT_PLAN.md     this file (shared spec, read-only)
DEV_AFNAN.md            Member 1 entry file: queue + workflow (only Member 1's agent edits it)
DEV_TAFSIRUL.md         Member 2 entry file: queue + workflow (only Member 2's agent edits it)
scripts/agent/          task-status.sh, wait-for.sh, start-task.sh, finish-task.sh (git automation)
docs/                   GDD.md, DECISIONS.md, QUESTIONS.md, ASSETS.md, BALANCE.md, PLAYTEST.md
docs/progress/          afnan.md, tafsirul.md (per-member log, one line per finished task)
data/
  districts/*.json      road graphs + POIs per district (generated, then hand-tuned)
  archetypes.json       passenger archetype parameter ranges
  characters.json       named recurring characters
  encounters/*.json     encounter definitions (one file per category)
  missions/ch1..ch6.json, side.json
  endings.json
  upgrades.json, bikes.json
  dialogue/{bn,en}/<area>.json   (strings split by area: ui, hud, phone, negotiation,
                        encounters, missions, characters, signs. Merged at load to cut merge conflicts)
public/assets/          models/*.glb, audio/*.ogg|mp3, fonts/, textures/
scripts/                fetch-assets.mjs, optimize-assets.mjs, validate-data.mjs,
                        gen-district.ts, balance-report.ts
src/
  main.ts               boot: capability check → load → menu
  config/constants.ts   SIM_DT, TIME_SCALE, DISTANCE_SCALE, LOD radii, budgets
  config/balance.ts     every gameplay tunable (see §6)
  core/                 rng.ts, events.ts, commands.ts, fsm.ts, clock.ts, math.ts, types.ts
  sim/
    GameManager.ts      owns all systems, tick order, day lifecycle
    schemas.ts          zod schemas for all data/*.json
    road/               RoadNetwork.ts, routing.ts, lanes.ts, spatial.ts
    ride/               RideManager.ts, passengerFsm.ts, RequestGenerator.ts
    passenger/          PassengerAI.ts, profiles.ts
    negotiation/        NegotiationSystem.ts, fare.ts
    economy/            EconomyManager.ts, fuel.ts, maintenance.ts
    reputation/         ReputationSystem.ts
    events/             EventDirector.ts, conditions.ts, effects.ts
    mission/            MissionManager.ts, objectives.ts, endings.ts
    world/              TimeOfDay.ts, WeatherSystem.ts, RoadEvents.ts
    traffic/            TrafficManager.ts, idm.ts, signals.ts, pedestrians.ts
    save/               SaveSystem.ts, migrations.ts
    bot/                strategies.ts (headless play bots for balance tests)
  physics/              PhysicsWorld.ts, bikeModel.ts (pure math), MotorcycleController.ts
  render/               Renderer.ts, CameraRig.ts, CityBuilder.ts, roadMesh.ts,
                        buildings.ts, signage.ts, props.ts, vehicles.ts, people.ts,
                        WeatherFx.ts, lod.ts, assets.ts, quality.ts, minimap.ts
  input/                InputManager.ts, keyboard.ts, gamepad.ts, touch.ts, tilt.ts, bindings.ts
  audio/                AudioManager.ts
  ui/                   App.tsx, store.ts, i18n.ts, theme.css,
                        hud/, phone/, negotiation/, choice/, map/, trip/, garage/,
                        journal/, menus/, overlays/
  debug/                debugApi.ts (window.__uthao), autopilot.ts, mapViewer.ts
tests/unit/**           mirrors src/sim, src/core, src/physics
tests/balance/**        multi-day bot simulations
tests/e2e/**            Playwright specs (desktop + Pixel 7 emulation)
```

---

## 5. Core contracts (later tasks rely on these names exactly)

### 5.1 Core utilities
- `core/rng.ts`: `class Rng { constructor(seed: number); next(): number /*[0,1)*/; range(a,b): number; int(a,b): number; pick<T>(arr: T[]): T; chance(p: number): boolean; fork(label: string): Rng }`. Mulberry32. `fork` derives a child seed from `hash(seed,label)`. Also `hashSeed(...parts: (string|number)[]): number`.
- `core/events.ts`: `class EventBus<M extends Record<string, unknown>> { on<K>(k, fn): () => void; emit<K>(k, payload): void }`. `GameEvents` map (exact keys):
  `day/started {day}`, `day/ended {day, summary: DaySummary}`, `clock/hour {hour}`, `ride/requested {request}`, `ride/accepted {requestId}`, `ride/arrivedPickup {requestId}`, `ride/started {requestId}`, `ride/completed {requestId, receipt: TripReceipt}`, `ride/cancelled {requestId, by: 'rider'|'passenger'|'system', reason}`, `negotiation/round {requestId, round, offer, response}`, `negotiation/result {requestId, outcome: NegotiationOutcome}`, `economy/transaction {tx: Transaction}`, `reputation/changed {delta: ReputationDelta}`, `encounter/started {instance}`, `encounter/resolved {instanceId, choiceId}`, `mission/objectiveUpdated {missionId, objectiveId, progress}`, `mission/completed {missionId}`, `world/weatherChanged {from, to}`, `world/roadEvent {event}`, `bike/collision {severity: 'scuff'|'bump'|'crash', relSpeedKmh, otherKind}`, `bike/nearMiss {distanceM, speedKmh}`, `bike/infraction {kind: 'speeding'|'wrongWay'|'redLight', segmentId}`, `bike/fuelEmpty {}`, `bike/puncture {}`, `story/flag {key, value}`, `ending/reached {endingId}`.
- `core/commands.ts`: UI → sim command union `Command` (`{type:'acceptRequest',requestId}` · `declineRequest` · `counterOffer {amount}` · `acceptOffer` · `proposePickupAdjust {nodeId}` · `refuseAlley` · `proposeOffApp {amount}` · `cancelRide` · `chooseEncounterOption {instanceId, choiceId}` · `buyFuel {liters}` · `repair {item}` · `buyUpgrade {upgradeId}` · `payExpense {expenseId}` · `endShift` · `sleep` · `setWaypoint {nodeId}` · `pause` · `resume`). `GameManager.dispatch(cmd: Command): CommandResult`. The UI never mutates sim state directly.
- `core/fsm.ts`: `createFsm<S extends string, E extends string>(table: Record<S, Partial<Record<E, S>>>, initial: S)` returns `{state, send(e): S, can(e): boolean}`. An illegal transition **throws** in dev and returns the unchanged state in prod.
- `core/clock.ts`: `class GameClock { day: number; minutes: number /*game minutes since 00:00*/; advance(realDt: number): void; hhmm(): string; isRushHour(): boolean }`. Rush hours are `07:30–10:00` and `17:00–20:00`.

### 5.2 Data types (`core/types.ts`)
These are the GDD §14 fields verbatim, plus the additions marked `+`.
- `PassengerProfile { passengerId; archetype: 'bargainer'|'commuter'|'careful'|'regular'|'risky'; budget; patience; urgency; bargainingTendency; safetySensitivity; trustInRider; localKnowledge; paymentReliability; relationshipLevel; +characterId?: string; +nameKey: string; +traits: { luggage: boolean; child: boolean; walkTolerance: number /*0-1*/ }; +personalBias: number /*[-0.1,0.1], fixed per passenger*/ }`. All 0–1 except `budget` (৳) and `relationshipLevel` (−100..100).
- `RideRequest { requestId; passengerId; pickupNodeId; destinationNodeId; initialFare; estimatedDistance /*virtual km*/; estimatedDuration /*game min*/; requestedArrivalTime /*game min | null*/; bookingType: 'app'|'direct'|'street'|'offApp'; status: PassengerState; +surge: number; +specialCircumstance?: 'rain'|'luggage'|'urgent'|'child' }`.
- `PassengerState = 'WaitingForPickup'|'Negotiating'|'OnTrip'|'HandlingIncident'|'Completed'|'Reviewed'|'Cancelled'` (GDD §9, exact transitions in Task 1.6).
- `RoadNode { nodeId; x; z; kind: 'junction'|'uturn'|'deadEnd'|'poi'; signal?: boolean }`.
- `RoadSegment { segmentId; startNodeId; endNodeId; width /*m*/; surfaceCondition /*0-1, 1 = perfect*/; trafficDensity /*0-1 base*/; speedLimit /*km/h*/; turnRestrictions: string[] /*disallowed next segmentIds*/; motorcycleAccessible; pedestrianDensity; riskLevel /*0-1*/; +oneWay: boolean; +divided: boolean; +lanes: number; +roadType: 'main'|'residential'|'alley'|'service'|'flyover'|'market'; +floodSensitivity: number; +pickupPractical: boolean; +district: DistrictId; +tags: string[] }`.
- `PlayerEconomy { cash; dailyRevenue; dailyExpenses; fuelLevel /*L*/; motorcycleCondition /*0-100*/; appBalance; debt; reputation /*mirror of rating*/; +savings; +phoneBattery /*0-100*/ }`.
- `StoryState { currentChapter; completedMissions: string[]; activeMissions: string[]; characterRelationships: Record<string, number>; promises: Promise[]; branchFlags: Record<string, boolean|number|string>; endingEligibility: Record<EndingId, boolean> }`.
- `Transaction { id; day; minute; kind: 'fare'|'tip'|'commission'|'fuel'|'repair'|'maintenance'|'upgrade'|'food'|'rent'|'family'|'phoneData'|'parking'|'fine'|'reward'|'robbery'|'delivery'|'medical'; amount /*+ income, − cost*/; requestId? }`.
- `TripReceipt { requestId; fare; tip; commission; fuelCost; otherCosts; net; durationMin; distanceKm; rating: number|null; consequences: string[] /*i18n keys*/ }`.
- `NegotiationOutcome = { kind: 'accepted', fare } | { kind: 'rejected', reason: ReasonCode } | { kind: 'walkedAway', reason: ReasonCode }`, where `ReasonCode = 'TOO_EXPENSIVE'|'OUT_OF_PATIENCE'|'URGENT'|'TRUSTS_YOU'|'BAD_TRAFFIC'|'WALK_TOO_FAR'|'FAIR_PRICE'`.

### 5.3 System boundaries (GDD §14, enforced)
`RideManager` owns the trip lifecycle. `NegotiationSystem` only returns decisions (pure). `RoadNetwork` owns routing and validity. `EconomyManager` owns all money mutation (everything else asks it to post a `Transaction`). `ReputationSystem` owns ratings, trust and relationships. `MissionManager` only observes events and evaluates objectives. `EventDirector` picks encounters and applies effects via the owning systems. `SaveSystem` serialises. `GameManager` tick order: `clock → weather/timeOfDay → roadEvents → requestGenerator → rideManager → eventDirector → traffic → missionManager → autosave check`.

---

## 6. Balance defaults (`src/config/balance.ts`, starting values, tuned in Task 6.2)

```
FARE: base 25, perKm 20, perMin 1.5, minFare 50, roundTo 5, maxCounterMultiple 5
SURGE: rush 1.25, rain 1.35, heavyRain 1.5, lateNight 1.2, cap 1.6
COMMISSION_APP: 0.15        OFF_APP: commission 0, policyDetectChance 0.03, strikesToSuspend 3, suspendDays 2
FUEL: pricePerL 130, tankL 8, startL 1.2, kmPerL {old100: 40, used125: 45, new150: 42}, idleLPerGameHour 0.3, engineTuneBonus 0.15
WEAR: conditionPerKm 0.4, perfPenaltyBelow 40, oilEveryKm 60, oilCost 350
PUNCTURE: basePerKm 0.004, poorSurfaceMult 2, floodedMult 3, goodTiresMult 0.5, repairFamiliar 150 (30 game-min), repairUnfamiliar 250 (10 game-min)
LIVING: foodPerDay 150, phoneDataPerDay 30, rentDueDays [7,14,20] amount 4000, familyPayment day3 1200, startCash 600
NEGOTIATION (P(accept) = sigmoid(k0 + a*(B−F)/max(B,1) + b*U + c*R + d*P − e*T)):
  k0 0.3, a 8, b 1.2, c 1.0, d 0.6, e 1.5
  rounds = 1 + round(patience*2) (+1 for bargainer); patienceDecayPerRound 0.25
  passengerCounter: next = cur + (riderAsk − cur) * (0.3 + 0.4*(1 − bargainingTendency)), capped at B*(1 + 0.3*U)
  dailyMood ∈ [−0.05,0.05] of B, seeded hash(passengerId, day)
  pickupWalk penalty per 100 m: 0.4 (×2 child or luggage, ×1.5 rain); walkTolerance scales it down
ARCHETYPES (budgetFactor × fairFare, openingFactor × B):
  bargainer 0.75/0.80 · commuter 1.00/0.95 · careful 0.95/0.95 · regular 0.90/0.90 · risky 1.30/1.10
RATING: start 5; −0.5 per 5 game-min late (urgent only); −0.3 per near-miss (×2 careful); −1 per bump; crash → 1★;
  +0.3 helpful choice; rolling average of last 50
TIP: chance = 0.1 + 0.3*(rating−4) clamp, amount 10–40
TRUST/LOCAL: localTrust 0–100 start 30; relationship −100..100
CRIME: P(encounter on segment per trip) = riskLevel*0.02 * timeMult(night 1.5, lateNight 2) * (1 + 0.5*(1−visibility)) * storyMult * playerMult(reckless 1.3)
  outcome split: harmless 0.6 / suspicious 0.3 / dangerous 0.1; robbery takes 40–70% cash-on-hand (never appBalance/savings)
TRAFFIC: IDM a 1.5, b 2.0, s0 2 m, T 1.2 s; LOD near 120 m (full + colliders), mid 300 m (visual only), far (density only)
BIKE (old100): vmax 22 m/s, accel 0→11 m/s in 4 s, brakeDecel dry 6 / wet 4.2 m/s², brakeUpgrade −20% stopping distance,
  steerMaxDeg 35 at 0 → 8 at vmax, leanMaxDeg 35, wetLateralGrip 0.7, passengerAccelMult 0.9,
  collision: <8 km/h scuff, 8–25 bump (−5…−15 condition), >25 crash (fall, −20 condition, trip ends)
WEATHER: hourly Markov clear/cloudy/lightRain/heavyRain; flooding after 30 game-min heavyRain on segments with floodSensitivity>0.6
  (speed cap 10 km/h); >0.9 impassable
UPGRADES (৳): tires 3000 · brakes 2500 · ledLight 1500 · engineTune 4000 · luggageCarrier 1200 · phone 6000 · toolkit 2000
BIKES (৳): used125 20000 (trade-in old100 = 5000) · new150 45000
GOALS: workshopDeposit 25000 · betterBike = BIKES.used125
```

---

## Milestone 0 — Foundation

### T0.1 Scaffold, tooling, docs
**Files:** create the root configs, `index.html`, `src/main.ts` (boots a blank canvas plus "Uthao" text), `docs/*` (`docs/GDD.md`, `docs/progress/*` and `scripts/agent/*` already exist; create empty DECISIONS/QUESTIONS/ASSETS/BALANCE), keep the existing `.gitignore` and `README.md` (add a "Development commands" section to the README).
- [ ] The repo already exists. Scaffold Vite (vanilla-ts template) into the root **without deleting or overwriting existing files** (generate it in a temp dir and copy the files in). Add the deps from the Tech Stack. Add `preact` and configure Vite JSX (`@preact/preset-vite`).
- [ ] Add scripts: `dev`, `build`, `preview`, `check`, `test`, `e2e`, `balance` (`vitest run tests/balance`), `assets` (fetch + optimize).
- [ ] ESLint: typescript-eslint recommended + `no-restricted-imports` for `src/sim/**` and `src/core/**` (three, preact, @dimforge/*) + `no-restricted-properties` for `Math.random` in those paths + `no-restricted-globals` window/document.
- [ ] Playwright projects: `desktop-chrome` (1280×720) and `pixel7` (devices['Pixel 7'], landscape), chromium launched with `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- [ ] Tests: `tests/unit/sanity.test.ts` (1+1). `tests/e2e/boot.spec.ts` (page loads, canvas visible, no console errors).
- **Done when:** `npm run check` and `npm run e2e` pass, and the first commit exists.

### T0.2 Core utilities
**Files:** `src/core/{rng,events,commands,fsm,clock,math,types}.ts`, tests under `tests/unit/core/`.
**Produces:** everything in §5.1–5.2.
- [ ] Tests: `rng is deterministic for a seed` (two Rngs, seed 42, first 5 `next()` equal) · `fork labels diverge` · `int stays in bounds over 10k draws` · `fsm rejects illegal transition` (throws in dev) · `clock 1 real s = 20 game s` · `clock rolls day at 23:00 only via endShift (not auto)` · `isRushHour 08:00 true 12:00 false` · `eventbus unsubscribe stops delivery`.
- **Done when:** all pass.

### T0.3 GameManager skeleton and fixed-step loop
**Files:** `src/sim/GameManager.ts`, `src/main.ts` loop, `src/debug/debugApi.ts`.
**Produces:** `class GameManager { constructor(opts: {seed: number; mode: 'career'|'endless'; data: GameData}); tick(dt: number): void /*one SIM_DT step*/; dispatch(cmd): CommandResult; snapshot(): SimSnapshot; bus: EventBus<GameEvents>; paused: boolean }`. `runFrame(gm, realDt)` accumulator helper. `window.__uthao = { gm, dispatch, snapshot, setSeed, teleport(nodeId), setTime(hhmm), setWeather(w), autopilot(on) }`. This is dev only, and is also enabled in prod builds with `?debug=1` (Playwright uses it).
- [ ] Tests: `same seed + same command log ⇒ identical snapshot after 10k ticks` · `runFrame never runs >5 steps` · `paused gm does not advance clock`.

### T0.4 App shell: capability check, lifecycle, overlays
**Files:** `src/main.ts`, `src/ui/App.tsx`, `src/ui/store.ts`, `src/ui/i18n.ts`, `src/ui/overlays/{RotateOverlay,Unsupported,Loading}.tsx`, `data/dialogue/{bn,en}/ui.json`, `public/assets/fonts/NotoSansBengali*.woff2`.
**Produces:** `t(key: string, vars?: Record<string, string|number>): string`, `setLanguage('bn'|'en')`. The store exposes signals mirrored from sim events (`hud`, `phone`, `negotiation`, `choice`, `screen`). WebGL2 check. `visibilitychange` → `gm.dispatch({type:'pause'})`. `webglcontextlost` → pause and show the overlay, `restored` → rebuild renderer resources.
- [ ] Tests (unit): `t falls back to en then key` · `missing bn key reported by validate-data`. (e2e): `pauses on hidden` (emulate visibility → `snapshot().paused === true`) · `portrait shows rotate overlay on pixel7 portrait`.

---

## Milestone 1 — Driving prototype (GDD Phase 1)
**Exit criterion (GDD):** the player completes a ride without a scripted cutscene controlling the motorcycle.

### T1.1 Bike model (pure math)
**Files:** `src/physics/bikeModel.ts`, test.
**Produces:** `interface BikeSpec` (from BALANCE.BIKE plus upgrade modifiers), `interface BikeState { x; z; heading; speed; lean; steer }`, `stepBike(s: BikeState, input: {throttle: number; brake: number; steer: number /*-1..1*/}, spec: BikeSpec, env: {wet: boolean; surface: number; hasPassenger: boolean; conditionPct: number}, dt: number): BikeState`. Steering is speed-scaled. Lean is visual and derived from yaw rate. Lateral-grip overflow → `wobble` flag plus speed loss (no fall unless above 1.5× grip, then `crashed`).
- [ ] Tests: `reaches 11 m/s in 4±0.3 s from rest` · `never exceeds vmax` · `dry stopping distance from 11 m/s ≈ 10.1 m ±10%` · `wet stopping distance longer than dry, brake upgrade shortens by ~20%` · `steer angle smaller at high speed` · `condition < 40 reduces accel` · `passenger reduces accel 10%`.

### T1.2 Physics world and MotorcycleController
**Files:** `src/physics/PhysicsWorld.ts`, `src/physics/MotorcycleController.ts`, test.
**Produces:** `PhysicsWorld.create(): Promise<PhysicsWorld>` (awaits `RAPIER.init()`); `addStaticBox`, `addStaticPolyline` (kerbs/building footprints); `addKinematicVehicle(id, halfExtents) → handle` with `setPose`. `MotorcycleController.update(input, env, dt)` uses `stepBike` for the desired motion, then a Rapier `KinematicCharacterController` (capsule) to resolve it against colliders. On contact it computes relative speed and emits `bike/collision` with severity per §6, applying the speed loss. A near miss (< 1 m clearance at > 20 km/h) emits `bike/nearMiss`.
- [ ] Tests (Node, Rapier compat): `driving into wall at 30 km/h emits crash` · `at 5 km/h emits scuff` · `slides along wall at shallow angle without stopping dead`.

### T1.3 Renderer, test scene, camera rig
**Files:** `src/render/{Renderer,CameraRig,quality}.ts`, `src/render/vehicles.ts` (procedural bike + rider from primitives until assets land).
**Produces:** `Renderer.init(canvas)`, `Renderer.render(snapshot, alpha)` (interpolated). `CameraRig` modes `'chase'|'firstPerson'`. The chase camera is spring-damped, looks ahead with speed, has FOV 60→72 with speed, and never clips into buildings (raycast pull-in). Quality presets `low|medium|high` (pixel ratio 0.75/1/min(dpr,2), shadows off/on/on, draw distance 200/300/450). Adaptive: if the 2 s average fps < 28 on low, drop resolution scale by 0.1 (floor 0.5).
- [ ] Test scene: a 400 m loop road, one junction, kerbs, a few box buildings, ground plane, hemisphere + directional light.
- [ ] e2e: `screenshot chase cam` (desktop + pixel7) saved to `tests/e2e/__screenshots__` for human review (no pixel diff assertion yet). `fps probe` logs avg fps via debugApi.

### T1.4 Input (keyboard, gamepad, touch, tilt) and bindings
**Files:** `src/input/*`.
**Produces:** `InputManager.read(): {throttle; brake; steer; horn: boolean; camera: boolean; phone: boolean; map: boolean; pause: boolean; choice: 0|1|2|3|null}`. Keyboard defaults: W/↑ throttle, S/↓ brake, A/D/←/→ steer, Space brake, H horn, C camera, Tab phone, M map, Esc pause, 1–4 choices. Gamepad: RT throttle, LT brake, left stick steer, A/B/X/Y choices. Touch: the left 35% of the screen is a horizontal steer slider (relative drag), right-bottom has big throttle and brake pads, top-right holds horn/phone/camera/pause icons. Tilt is optional (`DeviceOrientationEvent`, needs a permission prompt, off by default). Bindings are remappable and persisted in settings (`localStorage`, try/catch).
- [ ] Tests: `keyboard steer analog smoothing reaches 1 within 0.15 s` · `bindings round-trip through settings JSON` · `touch zones do not overlap choice-card area` (pure layout function `touchLayout(w,h)` returns rects; assert no intersection with `choiceCardRect(w,h)`).

### T1.5 Road network v0 and routing
**Files:** `src/sim/road/{RoadNetwork,routing,spatial}.ts`, `data/districts/testloop.json`, `src/sim/schemas.ts` (district schema).
**Produces:** `RoadNetwork.fromDistricts(d: DistrictData[])`; `nearestNode(x,z, filter?)`; `segmentAt(x,z)`; `route(fromNodeId, toNodeId, opts: {mode: 'motorcycle'|'walk'; avoid?: string[]; weather; minute}): Route | null` where `Route { nodeIds; segmentIds; lengthM; virtualKm; etaMin; uTurns: number }`. A* with cost = length / (speed × congestion(minute) × weatherMult) + turn penalty (left/right 3 s, U-turn 25 s), honouring oneWay, turnRestrictions, motorcycleAccessible, closures and flood. U-turns are only allowed at `kind:'uturn'` nodes on divided roads.
- [ ] Tests: `route respects one-way` · `no route through inaccessible alley in motorcycle mode, walk mode allowed` · `divided road requires uturn node to reverse` · `closure forces reroute` · `returns null when isolated`.

### T1.6 Passenger FSM, one passenger, pickup → drop-off
**Files:** `src/sim/ride/{passengerFsm,RideManager}.ts`, `src/render/props.ts` (pickup/drop markers), `src/ui/hud/Hud.tsx` (minimal: speed, objective text).
**Produces:** the passenger FSM table, with exactly the GDD §9 transitions plus the deliberate `Completed → HandlingIncident` (payment dispute) and `Negotiating → Cancelled` (walk away):
```
WaitingForPickup: { riderArrived: Negotiating, passengerCancel: Cancelled }
Negotiating:     { fareRejected: WaitingForPickup, fareAccepted: OnTrip, walkAway: Cancelled }
OnTrip:          { incident: HandlingIncident, arrived: Completed }
HandlingIncident:{ resume: OnTrip, endEarly: Completed, abort: Cancelled }
Completed:       { paidAndRated: Reviewed, paymentDispute: HandlingIncident }
```
`RideManager`: `offer(request)`, `accept(requestId)`, detects arrival (bike within 8 m of pickup node, speed < 2 m/s) → `ride/arrivedPickup`, then mounts the passenger (passenger mesh attached), detects destination arrival → `Completed` → pays a flat fare for now → `ride/completed`. In M1 negotiation is auto-accept.
- [ ] Tests: `full lifecycle emits events in order` · `cannot bargain after Completed except via paymentDispute` · `arrival requires low speed`.
- [ ] e2e: `ride completes via autopilot` (`__uthao.autopilot(true)` drives the route using the same input interface as a player; asserts `ride/completed`).
- **Milestone 1 exit check:** play it manually. Record feel notes in your `docs/progress/<member>.md` and tune `BIKE` values until braking and turning are predictable (GDD §17 driving tests).

---

## Milestone 2 — Simulation (GDD Phase 2)
**Exit criterion:** repeated rides produce meaningfully different outcomes (asserted by T2.9).

### T2.1 Request generator and fare model
**Files:** `src/sim/ride/RequestGenerator.ts`, `src/sim/negotiation/fare.ts`, `src/sim/passenger/profiles.ts`, `data/archetypes.json`.
**Produces:** `fairFare(virtualKm, etaMin, surge): number` (rounded to ৳5, ≥ minFare). `surgeAt(district, minute, weather): number`. `RequestGenerator.tick()`: Poisson arrivals per demand zone (λ from district `demand` and the time-of-day curve, and rain). Pickup/destination are only nodes on `pickupPractical && motorcycleAccessible` segments with a valid route (reject and resample, max 20 tries). Street hails: pedestrians with a raised hand on sidewalks inside demand zones, within 40 m of the player. `generateProfile(archetype, rng): PassengerProfile` samples within `archetypes.json` ranges.
- [ ] Tests: `fairFare monotonic in km and minutes` · `surge capped at 1.6` · `generator never emits unroutable request (10k samples)` · `rush hour produces more requests than midday (seeded)`.

### T2.2 Passenger AI
**Files:** `src/sim/passenger/PassengerAI.ts`.
**Produces:** `expectedBudget(p, fair, day): number` (= fair × budgetFactor × (1 + personalBias + dailyMood)). `openingOffer(p, B)`. `mood` 0–1, which reacts to trip events: near miss (−0.1 × safetySensitivity × 2), bump, lateness vs `requestedArrivalTime`, horn spam (> 3 per minute, −0.05), helpful choices. `localKnowledge` > 0.7 → may suggest a shortcut (feeds encounter 7.1). Regulars remember: relationship and `trustInRider` persist via ReputationSystem.
- [ ] Tests: `same passenger same day ⇒ same budget` · `bargainer opens lower than commuter for same fair fare` · `careful mood drops more on near miss than commuter`.

### T2.3 Negotiation system (signature mechanic)
**Files:** `src/sim/negotiation/NegotiationSystem.ts`, test.
**Produces (pure):** `startNegotiation(req, profile, ctx: {traffic: number; day; walkM: number; rng: Rng}): NegotiationSession`. `respond(session, action: {kind:'accept'} | {kind:'counter', amount} | {kind:'discount', amount} | {kind:'pickupAdjust', walkM, savesMin} | {kind:'explainDetour', extraMin} | {kind:'refuseAlley', walkM} | {kind:'offApp', amount} | {kind:'decline'}): { session; passengerLine: string /*i18n key*/; outcome?: NegotiationOutcome; topFactor: ReasonCode }`. Uses the §6 formula with inputs normalised to [−1,1]/[0,1]. The decision is `rng.next() < P(accept)` with an rng seeded by `hash(requestId, round)` (consistent and learnable). It clamps the amount as in Review Focus #3. Each round decays patience. When rounds run out → `walkedAway`. `explainDetour` raises acceptance of a higher fare by `0.6 × extraMin/10` (urgency-weighted). `topFactor` is the term with the largest absolute contribution, shown in the UI ("too expensive", "in a hurry").
- [ ] Tests: `accepting the passenger's own offer always succeeds` · `F far above B rejected with TOO_EXPENSIVE` · `urgent passenger accepts higher fare more often (1k trials, seeded)` · `rounds exhausted ⇒ walkedAway` · `counter clamps 0 → minFare and 999999 → 5×fair` · `same requestId+round ⇒ same decision` · `pickupAdjust with child penalised more`.

### T2.4 Negotiation and phone UI
**Files:** `src/ui/phone/{Phone,RequestCard}.tsx`, `src/ui/negotiation/NegotiationPanel.tsx`, dialogue strings.
- [ ] Phone: incoming request card (pickup, destination, distance, ETA, app fare, archetype hint icon, special circumstance) with Accept/Decline and a 15 game-sec timeout. Navigation turn arrow. Trip history list.
- [ ] Negotiation panel (only opens when the bike is stopped at pickup): passenger line in Bangla (English subtitle when language=en, and vice versa), fare stepper (±৳5/±৳10) plus quick buttons "Accept ৳X", "Counter", "Discount", "Cross to other side", "Not entering the alley", "Off-app?", "Decline". Shows the `topFactor` reaction icon after each round. Uses the GDD §6 example lines as the first passenger's lines.
- [ ] e2e: `negotiation flow`: debug-spawn a bargainer, counter twice, accept, assert the fare on the receipt.

### T2.5 Detours, U-turns, pickup adjustment, off-app
**Files:** `RideManager.ts`, `routing.ts`.
**Produces:** `pickupOptions(req, riderPos): { direct: Route; crossPoint?: {nodeId; walkM; savesMin} }`. A cross point is only a node with `tags: ['crossing']` (zebra/footbridge), so the game never rewards unsafe crossing (GDD §7.2). Mid-trip blockage → auto-reroute plus `ride` notification. Off-app booking: commission 0, `paymentReliability` × 0.85, no rating, policy detection roll per §6 → strike → at `strikesToSuspend` the app is suspended for 2 days (`branchFlags.appSuspended`). An off-app passenger becomes a direct contact (direct bookings later).
- [ ] Tests: `cross point only at crossing nodes` · `off-app has zero commission` · `3 strikes suspends app requests for 2 days` · `mid-trip closure reroutes`.

### T2.6 Economy: fuel, costs, receipts
**Files:** `src/sim/economy/{EconomyManager,fuel,maintenance}.ts`, `src/ui/trip/TripSummary.tsx`.
**Produces:** `EconomyManager.post(tx)` (the only money mutator; cash < 0 becomes debt). `fuelUsed(virtualKm, idleGameMin, spec)`. `receipt(ride): TripReceipt` with `net = fare + tip − commission − fuelCost − otherCosts` (GDD §10 exactly). Fuel empty → bike stops, push to the nearest station (speed cap 1.5 m/s) or call friend (−৳100, 20 game-min). The end-of-trip screen shows the receipt lines, rating and consequences.
- [ ] Tests: `net formula matches GDD` · `traffic idle increases fuel cost` · `cash never NaN; negative becomes debt` · `fuel empty event at 0 L`.

### T2.7 Lane graph and basic traffic
**Files:** `src/sim/traffic/{TrafficManager,idm,signals}.ts`, `src/sim/road/lanes.ts`, `src/render/vehicles.ts` (instanced).
**Produces:** `buildLanes(network)` → lane polylines. **Bangladesh drives on the left**, so lanes are offset to the left of the centreline. `TrafficManager` spawns cars, buses, motorcycles and CNGs within LOD-near radius, keeping the target density from `trafficDensity × timeOfDayCurve`. IDM for car-following. Signals have 30 s green per phase with gap acceptance at unsignalled junctions. Mid-LOD agents move along lanes without colliders, far LOD keeps only density stats. Spawn/despawn happens outside the camera frustum and beyond 80 m to avoid popping. Near agents mirror into Rapier kinematic bodies.
- [ ] Tests: `idm never overlaps leader` · `vehicles drive on left` · `no spawn inside frustum within 80 m` · `density follows rush-hour curve`.

### T2.8 Rider HUD v1
**Files:** `src/ui/hud/*`.
- [ ] HUD (GDD §13): today's net earnings, fuel bar, speed, destination and ETA, next turn instruction, passenger status chip, shift clock, rating. Collapses in first-person. Minimap (top-left, `render/minimap.ts`, 2D canvas of the road graph with route line).

### T2.9 Bots and balance test v1
**Files:** `src/sim/bot/strategies.ts`, `tests/balance/rides.test.ts`, `scripts/balance-report.ts`.
**Produces:** headless bots that drive by teleport-along-route at the route ETA (no rendering), playing strategies `acceptAll`, `alwaysMaxCounter`, `smartPro` (counter to fair, cross-points, safe), `reckless` (speeds: shorter ETA, plus near-miss/crash rolls).
- [ ] Tests: `outcome variety`: 200 rides with `smartPro`, the std-dev of net per ride > 15% of the mean, and ≥ 3 distinct ReasonCodes seen · `declining is sometimes right`: there exist requests where the expected net < 0 (long jam + low offer) · `no dominant greedy strategy`: `alwaysMaxCounter` daily net < `smartPro` daily net · `reckless not optimal`: reckless mean daily net (after crash/repair/rating effects) ≤ smartPro. Write the numbers to `docs/BALANCE.md`.

---

## Milestone 3 — Vertical slice (GDD Phase 3)
**Exit criterion:** a new player understands the game and enjoys a complete 10–15 minute session. **Also the GDD §20 success criterion:** pick up, negotiate, navigate a short Dhaka-inspired route, handle one unexpected event, drop off, and understand money earned or lost.

### T3.1 Asset pipeline
**Files:** `scripts/fetch-assets.mjs`, `scripts/optimize-assets.mjs`, `assets.manifest.json`, `src/render/assets.ts`, `docs/ASSETS.md`.
- [ ] Manifest-driven download of CC0 packs (verify each pack's License.txt says CC0). Candidates: Kenney *City Kit (Roads)*, *City Kit (Commercial)*, *City Kit (Suburban)*, *Car Kit*, *Mini Characters / Blocky Characters*, *Impact Sounds*, *Interface Sounds*, *UI Audio*. Quaternius CC0 city/vehicle packs. Search poly.pizza for CC0 only for a motorcycle. Ambient city/rain/horn loops from CC0 sources (freesound filtered CC0, or OpenGameArt CC0).
- [ ] `optimize-assets`: `gltf-transform optimize --compress meshopt --texture-compress webp`, generate LODs (`simplify`) for buildings. Output to `public/assets/models`.
- [ ] `assets.ts`: `loadModel(id)`, cached, with `MeshoptDecoder`. **Every asset id has a procedural fallback** so a missing file never crashes.
- **Bangladesh-specific models to build procedurally** in `render/vehicles.ts` and `render/props.ts`: CNG auto-rickshaw (green cabin, caged sides), cycle rickshaw (canopy, painted panels via canvas texture), local bus (dented, coloured stripes), tea stall (tong) with kettle and benches, fuel station canopy, mechanic garage shutter, footbridge, rooftop water tanks, tangled overhead wires (line segments), shop signboards.

### T3.2 District generator and the Mirpara district
**Files:** `scripts/gen-district.ts`, `data/districts/mirpara.json`, `src/debug/mapViewer.ts` (`/?tool=map` renders graph + POIs in 2D canvas).
**Produces:** `genDistrict(style: DistrictStyle, seed): DistrictData`, where `DistrictStyle { origin; size; blockM: [min,max]; arterial: {divided: boolean; uturnEveryM}; alleyDensity; marketStreets; organic: number /*0 grid → 1 old-town*/; demandZones; riskBase }`. Output nodes, segments with all §5.2 attributes, POIs (`teaStall`, `fuel`, `garage`, `pharmacy`, `school`, `market`, `busStop`, `apartment`, `officeGate`, `hospital`, `home`, `crossing`), and building lots.
- [ ] Mirpara (~600 × 600 m): one divided arterial with U-turns every 300 m and a footbridge crossing, a market street (high pedestrians, vendors), residential lanes with speed bumps, 3+ narrow alleys (some `motorcycleAccessible:false`), Rafi's home, tea stall (friend Mintu), fuel station, Kamal bhai's garage, school, pharmacy, a campus gate (first passenger's destination), and flood-sensitive low segments.
- [ ] `validate-data` checks: graph strongly connected for motorcycles (excluding inaccessible), every POI on a `pickupPractical` segment, every divided road has a U-turn node every ≤ 400 m, every string key exists in bn + en.
- [ ] Tests: `generator deterministic per seed` · `mirpara passes validation`.

### T3.3 City builder (render)
**Files:** `src/render/{CityBuilder,roadMesh,buildings,signage,lod}.ts`.
- [ ] Road ribbons from segments (width, lane markings, kerbs, medians on divided roads, potholes/puddle decals by `surfaceCondition`), speed bumps, zebra at crossing nodes.
- [ ] Buildings on lots: Kenney buildings plus procedural 4–8 storey apartment blocks (balconies, grills, water tanks), with ground-floor shops. Use `InstancedMesh` per building variant. Merge static geometry per 100 m chunk.
- [ ] `signage.ts`: canvas-texture signboards with Bangla text from `data/dialogue/bn/signs.json` keys `sign.*` (fictional shop names: "মায়ের দোয়া ফার্মেসি", "রহমান টি স্টল", etc.), packed into an atlas.
- [ ] Physics: static colliders for kerbs and building footprints.
- [ ] Performance check (e2e `perf.spec.ts`, pixel7 profile, low quality): log draw calls (`renderer.info.render.calls` ≤ 150) and triangles (≤ 300k) during a 30 s autopilot drive. Fail if over budget.

### T3.4 Pedestrians, rickshaws, local traffic behaviour
**Files:** `src/sim/traffic/pedestrians.ts`, `TrafficManager.ts`, `src/render/people.ts`.
- [ ] Pedestrians walk sidewalks, cross at crossings, and occasionally jaywalk. **Fairness rule:** a jaywalk only starts if the player is farther than `1.5 × stoppingDistance(playerSpeed)` (GDD §11 "bounded"). Buses stop at `busStop` POIs for 10–20 s (block the lane). Rickshaws are slow (3–4 m/s) and turn slowly. The horn makes pedestrians/rickshaws within 15 m yield slightly.
- [ ] Tests: `jaywalker never spawns inside 1.5× stopping distance` · `bus dwells at stop` · `horn yield`.

### T3.5 Time of day and weather
**Files:** `src/sim/world/{TimeOfDay,WeatherSystem}.ts`, `src/render/WeatherFx.ts`.
- [ ] Sun/sky colour by game minute, streetlights after 18:30, headlight cone (LED upgrade widens it), night visibility value. Rain: particle streaks (GPU points), wet road roughness/reflection, puddles, fog. `wet` feeds `bikeModel`. Flooded segments show a water plane and speed cap. Rain raises demand and surge (§6).
- [ ] Tests: `heavy rain 30 min floods sensitive segments` · `flooded >0.9 excluded from routing` · `visibility lower at night`.

### T3.6 EventDirector and the encounter framework
**Files:** `src/sim/events/{EventDirector,conditions,effects}.ts`, `data/encounters/*.json`, schema.
**Produces:** `EncounterDef { id; category: 'route'|'pickup'|'payment'|'passenger'|'bike'|'world'|'crime'|'story'; trigger: Condition /*phase: 'requestOffered'|'atPickup'|'onTrip'|'dropOff'|'roaming'; tags; weather; hours; chapter; flags; minRelationship…*/; weight; cooldownMin; oncePerDay?; lineKey; choices: { id; labelKey; requires?: Condition; effects: Effect[] }[] }`. `Effect` union: `money {amount, kind}`, `time {min}`, `mood {delta}`, `trust {delta}`, `rating {delta}`, `relationship {characterId, delta}`, `localTrust {delta}`, `flag {key, value}`, `route {action:'avoid'|'forceVia'|'closeSegment', ref}`, `endTrip {paid: boolean}`, `startMinigame {kind:'flee'|'pushBike'}`, `spawnRequest {templateId}`, `injury`. EventDirector evaluates once per game minute and at phase changes, picks by weight among eligible ones, respects cooldowns, max 1 active, and **pauses the sim while a choice card is open** (setting "pause on decisions", default ON; when OFF, the bike must be < 10 km/h for the card to appear). Choice card UI: `src/ui/choice/ChoiceCard.tsx` at top-centre (outside the touch zones), 2–4 large buttons, number keys 1–4.
- [ ] Tests: `ineligible encounter never fires` · `cooldown respected` · `effects routed to owning systems (money only via EconomyManager)` · `deterministic selection per seed`.

### T3.7 Vertical-slice encounters (5)
**Files:** `data/encounters/route.json`, `pickup.json`, `payment.json`, `bike.json`.
Implement these with exact choices and default effects (tune later):
- [ ] **7.1 "ভাই, এই রাস্তা দিয়ে যান"** (onTrip, passenger localKnowledge > 0.5, the suggested route passes a market segment): *Follow* → forceVia market (slow, mood +0.1, trust +5) · *Explain delay* → if trust ≥ 40 passenger agrees (mood 0), else mood −0.1 · *Own route* → mood −0.15 unless faster by ≥ 5 min (then +0.1 at drop-off "you were right").
- [ ] **7.2 U-turn problem** (requestOffered on divided road, opposite side): *Ask to cross at crossing* (only if a crossing node ≤ 250 m away; uses pickupAdjust) · *Go to designated pickup via U-turn* (time + fuel) · *Cancel* (rating 0, small cancel counter, 3/day → −0.1 rating).
- [ ] **7.3 "ভাই, গলির ভিতরে ঢুকেন"** (dropOff/atPickup, the target is on an alley): *Refuse politely, walk to main road* (mood −0.05 ×2 if luggage/child) · *Stop at safe nearby spot* · *Enter* (only if `motorcycleAccessible`; risk: scrape chance by width, time cost).
- [ ] **7.6 Puncture** (onTrip/roaming, from the puncture roll): *Nearby unfamiliar mechanic* (৳250, 10 min) · *Limp to Kamal bhai if ≤ 600 m* (৳150, speed cap 2 m/s, condition −3) · *Call Mintu* (৳0, 25 min, relationship +2, needs phone battery > 5). The passenger may leave (patience-based, then `endTrip paid partial`).
- [ ] **"No change" at drop-off** (dropOff, fare ends in 0/5 not divisible by 50/100, passenger paymentReliability < 0.6): *Waive the remainder* (−৳10–40, mood +, tip chance +) · *Wait while they get change* (5 min) · *Accept app/mobile-wallet transfer* (if app booking: fine; if off-app: 10% chance never arrives).

### T3.8 Opening sequence: "First Ride" (GDD §3)
**Files:** `data/missions/ch1.json` (mission `m1_first_ride`), `src/sim/mission/*` v0 (enough for linear objectives), `src/ui/menus/MainMenu.tsx`.
- [ ] Steps exactly per GDD §3: 07:00 alarm on phone UI → Ma's reminder (household payment, Day 3, ৳1,200) → wallet check (৳600) → bike inspection (low fuel 1.2 L) → start engine → tea stall: Mintu says "Fulgate-e demand beshi" (in Ch1 it points to the Mirpara market zone) → open Uthao → first request: university student Nabila (bargainer-lite, fixed seed) → offers ৳80 vs fair ৳100 → negotiation tutorial using the GDD example lines verbatim → ride to campus gate (one route choice, light traffic) → drop-off → payment → receipt explained. Tips appear contextually, as a normal workday, not as a checklist.
- [ ] e2e: `first ride tutorial completes via autopilot + scripted choices`.

### T3.9 Audio
**Files:** `src/audio/AudioManager.ts`.
- [ ] WebAudio via `THREE.AudioListener`. Engine loop with playbackRate by speed, horn, indicators, ambient city bed by district density, rain bed, UI clicks, cash register on payment (no voice lines). Master/music/sfx volume sliders. Audio unlocks on first user gesture (mobile).

### T3.10 Menus, settings, pause/map screen
**Files:** `src/ui/menus/{MainMenu,Settings,Pause}.tsx`, `src/ui/map/MapScreen.tsx`.
- [ ] Main menu: Continue / New Career / Endless Ride / Settings / Credits (from ASSETS.md). Settings: language, quality, controls remap, tilt toggle, pause-on-decisions, subtitles size, colour-blind-safe route colour, volume. Pause/map: district map with destinations, fuel stations, garages, mission markers, set waypoint.
- [ ] e2e: `menu navigation` · `portrait overlay` · `webgl unsupported message` (launch with `--disable-gpu --disable-software-rasterizer` in a dedicated test).
- **Milestone 3 exit check:** run a 15-minute manual session in Endless and the tutorial. Do it on a real Android phone if one is available via `npm run dev -- --host`, otherwise on Pixel 7 emulation. Log findings in your `docs/progress/<member>.md` and fix the top 5 friction points.

---

## Milestone 4 — Campaign and v1.0 scope (GDD Phase 4 and §16)
**Exit criterion:** the player has a reason to return beyond money. Every §16 checkbox is satisfied.

### T4.1 Day lifecycle and living expenses
**Files:** `GameManager.ts`, `EconomyManager.ts`, `src/ui/menus/DayEnd.tsx`.
- [ ] Day starts 07:00 at home. `endShift` (any time ≥ 12:00, forced at 23:00) → ride home (or auto-teleport if > 1.5 km, costing fuel) → day summary (revenue, expenses breakdown, net, rating change, relationships changed) → pay due expenses (food daily, phone data daily, rent on rent days, family payments from missions) → `sleep` → next day. Phone battery: drains 3%/game-hour while navigating, charges at home/tea stall (৳10). 0% = no app requests or navigation.
- [ ] Recovery after a bad day (GDD §17): small advances from Ma/Mintu (debt), and rent can be delayed once with a relationship penalty.
- [ ] Tests: `expenses posted at day end` · `missed rent once → debt + flag, twice → story consequence flag` · `battery 0 blocks requests`.

### T4.2 ReputationSystem
**Files:** `src/sim/reputation/ReputationSystem.ts`, test.
**Produces:** app rating (rolling 50), `localTrust`, per-character relationship, `safetyRecord {nearMisses; bumps; crashes; infractions}`, `riskScore` (count of risky choices), `promisesKept/broken`. Rating computed per §6. Low rating (< 4.0) reduces request rate (×0.7), below 3.5 → app warning, below 3.0 → suspension (feeds Fresh Start).
- [ ] Tests: `rating rolling window` · `careful passenger penalises near miss double` · `low rating reduces request rate`.

### T4.3 Recurring passengers and direct bookings
**Files:** `data/characters.json`, `PassengerAI.ts`, `RequestGenerator.ts`, `src/ui/phone/Contacts.tsx`.
- [ ] Characters (fictional): **Ma** (mother, home), **Mintu** (tea-stall friend), **Kamal bhai** (mechanic), **Nabila** (student, bargainer-lite), **Tanvir** (office commuter, Motinagar/Gulbari), **Rahim chacha** (local regular, shortcuts), **Mrs. Ferdousi** (careful parent with child), **Jamil** (risky customer, recurring, ambiguous), **SI Morshed** (traffic/police, fair), **Bablu** (street vendor). Each has fixed profile traits, a home node and preferred times.
- [ ] After a ride with relationship ≥ 15 the character can add Rafi as a contact and later send direct bookings via phone (calls with accept/decline). The Contacts app lists them.
- [ ] Tests: `regular requests appear only after threshold` · `relationship persists across days`.

### T4.4 Bike upgrades, repairs, garage screen
**Files:** `data/upgrades.json`, `maintenance.ts`, `src/ui/garage/Garage.tsx`.
- [ ] The garage (Kamal bhai's or any garage POI) shows condition bars (engine, tires, brakes, oil), repair costs (cheaper at Kamal bhai with relationship ≥ 20: −20%), upgrades from §6 with their mechanical effects (GDD §10 list), and cosmetics (paint colour, seat cover, cheap). The luggage carrier unlocks luggage passengers and deliveries. Upgrades are never required for story progress (validate-data checks that no mission `requires` an upgrade).
- [ ] Tests: `tires upgrade halves puncture chance and raises wet grip` · `engine tune lowers fuel per km 15%` · `no mission requires upgrade`.

### T4.5 Remaining signature situations
**Files:** `data/encounters/*.json`.
- [ ] **7.4 "অ্যাপের বাইরে যাবেন?"**: *Accept* (offApp booking, T2.5 rules) · *Stay on app* · *Negotiate fare/conditions* (opens negotiation with offApp action).
- [ ] **7.5 Sudden rain**: *Drive cautiously* (ETA +20%, safety ok) · *Shelter at tea stall/bus stop* (wait for rain to drop to light, passenger mood −, may cancel) · *Push on fast* (accident risk ×2, possible tip if on time, careful archetypes −trust).
- [ ] Additional (GDD §7 list), each with 2–3 choices and consequences: extra stop without pay, parent with child (Mrs. Ferdousi), late for exam/interview (urgent + time bonus), wrong pickup pin (walk vs drive back), street vendor discount (Bablu, relationship), phone left behind (return it: localTrust +10, relationship; keep: riskScore +, flag), traffic checkpoint (SI Morshed: delay 2–5 min, fine ৳500 only if `infractions ≥ 3` this day), bus blocking road (detour or wait), regular calls directly (T4.3), friend urgent package (delivery job, luggage carrier optional: else small parcels only), passenger asks to wait for errand (waiting fee negotiation, risk of no-show).
- [ ] Tests: per encounter, `eligible only under its trigger` and `each choice applies its effects` (table-driven test over the JSON).

### T4.6 Crime and suspicious-pickup system (GDD §8)
**Files:** `data/encounters/crime.json`, `EventDirector.ts`, `src/sim/events/flee.ts`.
- [ ] Per-segment encounter probability per §6, rolled when entering a segment while on trip or at pickup. Outcome split harmless/suspicious/dangerous. **Cues before danger**: suspicious requests show subtle tells (fare ≥ 1.6× fair, pickup on a deadEnd alley after 21:00, destination change to a dark alley). If `localKnowledge` hints are on, Rafi's thought bubble says "kichu ekta thik lagche na".
- [ ] Responses: *Turn around before entering* (always available before entering the segment) · *Refuse pickup and report* (in-app report: harmless → small rating risk, suspicious/dangerous → localTrust +) · *Try to leave* (flee: if bike speed > 15 km/h and condition > 50, success 80%, else 40%; failure → forced comply) · *Comply* (lose 40–70% cash-on-hand, maybe phone: ৳3000 replacement or 1 day without app) · *Call for help* (needs battery and ≥ 1 game-min before contact).
- [ ] The game never offers a "fight" option. Robbery never touches savings/appBalance.
- [ ] Tests: `most risky-archetype rides are harmless (≥ 55% over 1k)` · `turn-around always offered before dangerous segment` · `robbery never touches savings` · `encounter rate scales with riskLevel × night`.

### T4.7 MissionManager and campaign chapters 1–2 + v1 crime mission
**Files:** `src/sim/mission/{MissionManager,objectives}.ts`, `data/missions/ch1.json`, `ch2.json`, `ch4.json` (crime mission only for v1), `src/ui/journal/Journal.tsx`.
**Produces:** `ObjectiveDef` union: `earnNet {amount, byDay, byMinute?}` · `completeRides {count, district?, zoneTag?, distinctDistricts?, beforeMinute?, weather?, noCrash?}` · `rideWith {characterId}` · `reach {poiId}` · `payExpense {expenseId}` · `choose {encounterId, choiceIds?}` · `relationship {characterId, min}` · `flag {key, value}` · `buy {upgradeId|bikeId}` · `survive {encounterId}`. `MissionDef { id; chapter; day; titleKey; descKey; prerequisites; objectives; rewards: Effect[]; failConditions?; onFail?: Effect[]; unlocks: string[] }`. Missions are observers: they listen to `GameEvents` and never drive rides. The journal shows characters, relationships, promises, reputation and missions.
- [ ] Missions, v1 set (GDD §16 needs 5):
  - `m1_first_ride` (T3.8) · `m1_fill_up`: buy fuel and complete 3 rides · `m1_household` (**Ch1 final**): earn ৳1,500 net by end of Day 3 and pay Ma ৳1,200 · `m2_rush_hustle`: 4 rides in demand zones during morning rush (v1: Mirpara market zone) · `m4_wrong_pickup` (**crime mission for v1**): Jamil's high fare to a dead-end lane at 21:30, with full §8 response set and SI Morshed follow-up choice (`cooperatedPolice`).
- [ ] **v1 ending "First Week"** in `data/endings.json` is reached at the end of Day 6 in v1 builds (`BUILD_SCOPE=v1`). It summarises identity tendencies (professional / negotiator / hustler / neighbourhood regular, from metrics) and points to "full campaign coming".
- [ ] Tests: `objectives update from events only` · `ch1 final fails gracefully if unpaid (debt + flag, game continues)` · `mission never requires an upgrade`.

### T4.8 Identity tendencies
**Files:** `src/sim/reputation/identity.ts`.
- [ ] Compute the four GDD §3 tendencies as 0–100 scores from metrics: professional (rating, safety record), negotiator (avg net/fare ratio, successful counters), hustler (riskScore, infractions, off-app count), regular (relationships, help choices, promises kept). Shown in the journal. Feeds endings.
- [ ] Tests: `reckless bot run ⇒ hustler highest` · `smartPro bot ⇒ professional highest`.

### T4.9 SaveSystem
**Files:** `src/sim/save/{SaveSystem,migrations}.ts`, `src/ui/menus/SaveSlots.tsx`.
**Produces:** `serialize(gm): SaveV1` (economy, story, reputation, characters, bike + upgrades, day/minute, rng states, settings separate) and `deserialize(save): GameManager`. Storage adapter: localStorage key `uthao.save.<slot>` with JSON + `version`, 3 manual slots + `auto`. Autosave on trip completed, day end and `visibilitychange` hidden. `migrations: Record<number, (s) => s>`. A corrupt save is moved to `uthao.save.<slot>.corrupt` with a prompt. Without storage → memory adapter + banner.
- [ ] Tests: `round-trip preserves snapshot equality` · `v0 fixture migrates to current` · `corrupt JSON ⇒ backup + error result, no throw` · `storage throwing ⇒ memory fallback` · `autosaves on hidden` (e2e).

### T4.10 Mobile HUD polish and v1.0 release
- [ ] Mobile HUD pass: safe-area insets, thumb reach, font sizes ≥ 14 px, the choice card never under the thumbs, a fullscreen + orientation lock button (`screen.orientation.lock('landscape')` inside fullscreen, try/catch).
- [ ] `npm run build` with `BUILD_SCOPE=v1` and deploy the static `dist/` (GitHub Pages / Cloudflare Pages / Netlify: document the chosen one in README; **ask the user before the first public deploy**).
- [ ] **v1.0 checklist (GDD §16):** one protagonist + bike ✔ T1 · one district ✔ T3.2 · traffic, pedestrians, collisions ✔ T2.7/T3.4 · 5 archetypes ✔ T2.2 · negotiation + pickup adjust ✔ T2.3/T2.5 · fuel, earnings, expenses, repairs ✔ T2.6/T4.1/T4.4 · U-turn, alley, off-app ✔ T3.7/T4.5 · one robbery/suspicious event ✔ T4.6 · five missions + one ending ✔ T4.7 · save/load + mobile HUD ✔ T4.9/T4.10. Record each item with its test name in `docs/progress/tafsirul.md`.
- [ ] Git tag `v1.0.0`.

---

## Milestone 5 — Expansion (GDD Phase 5: full campaign, all districts, all endings)
**Exit criterion:** new content reuses stable systems rather than fragile one-off scripts. Check: every mission/encounter added in M5 is pure JSON data, with zero new mission-specific code paths (grep for mission ids in `src/` must return nothing except tests).

### T5.1 Remaining six districts
**Files:** `data/districts/{fulgate,dhanbagh,mohakhal,gulbari,puranpara,motinagar}.json`, `data/world.json` (district placement + arterial connectors + Mohakhal flyover).
- [ ] Styles (GDD §4 table): **Fulgate**: high-demand pickup hub, big signalled junction, many buses, footbridges. **Dhanbagh**: universities, hospital (Ch3), cafes, lake road, mixed passengers. **Mohakhal**: bus terminal, flyover (on-ramp/off-ramp segments, `roadType:'flyover'`, no stopping), bottlenecks. **Gulbari**: wide roads, office/restaurant POIs, `officeGate` with security-gate drop-off rules (no entry, stop at gate), higher-value trips (budgetFactor ×1.2 zone mod). **Puran Para**: organic narrow lanes (organic 0.9), many inaccessible alleys, dense markets, difficult turns, the hardest driving. **Motinagar**: commercial offices, crowded crossings, strongest rush hour.
- [ ] Layout: districts adjacent on a ~2.4 × 2.4 km map, compressed. Arterials connect them. Each must pass validate-data, and the whole world graph must be strongly connected.

### T5.2 District streaming and LOD
**Files:** `src/render/CityBuilder.ts`, `src/render/lod.ts`, `src/render/assets.ts`.
- [ ] The sim road graph holds all districts at all times (it's small). Render meshes/colliders load for the current district plus neighbours within 400 m of the player, built asynchronously across frames (≤ 4 ms/frame budget) and disposed when 700 m away. Distant districts show as low-poly silhouettes (merged boxes). Loading a new district must not hitch > 50 ms (measure in e2e perf).
- [ ] Tests: `streaming set by position` (pure function `districtsToLoad(pos, world)`), plus e2e `cross-district drive keeps fps ≥ 30 on pixel7 low`.

### T5.3 More traffic types and behaviours
- [ ] Add minibuses (leguna), delivery vans, trucks (night only), bicycles, scooters, ride-hailing cars, road workers at construction, vendor carts on market roads. Behaviours: buses racing to stops, CNGs weaving (bounded), wrong-way rickshaws on residential lanes (rare, visible early). Road events (`RoadEvents.ts`): construction, stalled vehicle, market congestion, blocked intersection, diversions, temporary closure (schedule + random, reflected in routing and on the map).
- [ ] Tests: `road event closes segment and routing avoids it` · `new actor types obey left-hand lanes`.

### T5.4 Campaign chapters 2–6 (full)
**Files:** `data/missions/ch2.json … ch6.json`, dialogue strings.
- [ ] **Ch2 The Rush Hour Hustle (Days 4–6):** `m2_rush_hustle` (now Fulgate) · `m2_profit_lesson` (choose: one long ৳300 jam ride vs two short ৳120 rides, the receipt comparison is shown) · `m2_regular_faces` (relationship ≥ 10 with Tanvir or Rahim chacha) · **final** `m2_evening_rush`: 5 rides across ≥ 3 districts before 17:30.
- [ ] **Ch3 Rain, Roads and Regrets (Days 7–9):** forced monsoon weather · `m3_first_monsoon` (3 rides in rain, no crash) · `m3_faster_bhai` (passenger pressures speeding: choice flag `pressuredSpeeding: 'refused'|'complied'`) · **final** `m3_hospital_run`: citywide disruption (multiple closures + flooding), urgent passenger to Dhanbagh hospital. Choices: charge/free (`helpedHospitalFree`), flooded shortcut vs safe route. If late, the outcome softens (no death or graphic content: "they got there, the doctor saw them").
- [ ] **Ch4 The Narrow Lane (Days 10–12):** `m4_unfamiliar_ground` (high-paying trip into Puran Para, Rahim chacha's conflicting directions vs the app) · `m4_wrong_pickup` (from v1) · **final** `m4_home_safe`: get home safely, then choose to cooperate with SI Morshed's investigation into a local extortion scheme (`cooperatedPolice`) or stay out. The optional moral branch: Jamil offers a cut of the scheme (`joinedScheme`, +৳8000, riskScore +5, closes the Morshed path, opens the Fast Money path, lasting consequences in Ch5).
- [ ] **Ch5 The Regulars (Days 13–16):** content assembled from relationships/flags · `m5_calls` (direct bookings from contacts made, with different callers per relationship) · `m5_promise` (an 08:00 pickup promise to Mrs. Ferdousi, tracked in `promises`) · `m5_package` (Mintu's urgent delivery) · **final** `m5_linked_jobs`: a day of chained jobs from regulars with conflicting times. Honour/break promises (relationship ±20). If `joinedScheme`: extortion pressure jobs replace one regular.
- [ ] **Ch6 Beyond the Ride (Days 17–20):** `m6_kamal_offer` (workshop partnership, requires Kamal relationship ≥ 30 to be offered on good terms; otherwise a worse deal) · `m6_test_ride` (try used125 on a short course) · **final** `m6_decision`: buy better bike / invest in workshop (needs `GOALS.workshopDeposit`) / continue independently → ending evaluation.
- [ ] Side missions (`side.json`, ≥ 8, repeatable or one-off, data only): lost-phone owner hunt, school-run week for Mrs. Ferdousi, Bablu's market supply runs, night delivery partnership (luggage carrier), tea-stall rain shelter favours, Rahim chacha's shortcut tour (reveals hidden service roads on the map), Eid rush day (surge ×1.5, family-visit passengers), garage helper day with Kamal bhai.
- [ ] Endless Ride mode: no missions, random characters, all districts unlocked, endless days.
- [ ] Tests: `each chapter final reachable by smartPro bot and by reckless bot` (the headless bot plays choices via a policy table) · `chapter unlocks next chapter's districts`.

### T5.5 Endings (all five, GDD §12)
**Files:** `data/endings.json`, `src/sim/mission/endings.ts`, `src/ui/menus/Ending.tsx` (illustrated card sequence + stats).
- [ ] Evaluation order (first match wins). Conditions read savings, choice, localTrust, rating, flags and identity scores:
  1. **Fresh Start**: `appSuspended at Day 20` OR `debt ≥ 5000` OR `rating < 3.5` → changes neighbourhood, repairs reputation.
  2. **Fast Money**: `joinedScheme` OR (`riskScore ≥ 8` AND `localTrust < 40` AND `savings ≥ 20000`) → cash but lost relationships.
  3. **Workshop Owner**: choice `workshop` AND `savings ≥ 25000` AND `relationship.kamal ≥ 30`.
  4. **Independent Rider**: choice `bike` AND `savings ≥ BIKES.used125 − tradeIn`.
  5. **Trusted Local**: `localTrust ≥ 70` AND `rating ≥ 4.6` (any choice, including "continue independently", and **reachable with low savings**: GDD "less money but trust is a legitimate path").
  6. Fallback: Independent Rider (with "continue independently" choice) / Fresh Start if broke.
- [ ] Ending choice UI greys out unaffordable choices and explains why.
- [ ] Tests: `each ending reachable by a designated bot policy` (5 policies, seeded) · `trusted local reachable with savings < 10000` · `fast money ending not the highest score on combined metrics` (its relationships/trust stats shown lower).

### T5.6 Additional motorcycles
- [ ] `data/bikes.json`: old100 (start), used125 (better accel/vmax 25 m/s, efficiency 45), new150 (vmax 28, better brakes, efficiency 42, insurance cost ৳50/day). Bought at the garage with trade-in. Each has a procedural/CC0 model variant and an engine sound pitch.
- [ ] Tests: `bike swap updates BikeSpec and fuel model`.

### T5.7 Richer dialogue
- [ ] Per-archetype line pools (≥ 15 lines per archetype per phase: greeting, offer, counter, accept, reject, small talk, drop-off) in bn + en. Small talk lines are triggered on long rides (cricket, exams, jam complaints, rain, family). Recurring characters reference past choices via flag-conditioned lines (`requires` conditions on lines). Humour from situations. Run a stereotype review checklist in DECISIONS.md: no line mocks a neighbourhood, class, religion or gender.
- [ ] validate-data: every line key in both languages, no orphan keys.

### T5.8 Deliveries
- [ ] Delivery jobs (GDD §10 income): parcel pickup from shop POIs → drop at addresses, time windows, fragile flag (bump = damage claim). Luggage carrier increases capacity. Delivery partnership (side mission) unlocks a steady delivery stream.
- [ ] Tests: `fragile parcel damaged on bump` · `delivery pays via EconomyManager`.

### T5.9 Performance optimisation and PWA
- [ ] Profile the pixel7-low profile across all districts, with dense rush-hour traffic and rain. Apply in order until the budgets hold: instancing everywhere, merged static chunks, texture atlases, shadow cascade off on low, frustum + distance culling for traffic, rain particle count by quality, half-res post, object pools (no per-frame allocations in sim hot paths: check with a heap snapshot test).
- [ ] `vite-plugin-pwa`: manifest (name "Dhaka Bike Rider", landscape, icons generated from a simple procedural logo), offline cache of the core bundle + current district assets, "Install" prompt on Android.
- [ ] e2e perf gate: `perf.spec.ts` runs the 3-minute autopilot route across 3 districts on pixel7-low and asserts avg fps ≥ 30 (headless SwiftShader is slower than real devices: calibrate the threshold once and record it in BALANCE.md), draw calls ≤ 150, no frame > 100 ms after warm-up.

---

## Milestone 6 — Release hardening

### T6.1 Full test matrix (GDD §17)
- [ ] Map each GDD §17 question to a named test or a manual playtest checklist item in `docs/PLAYTEST.md`. Driving: predictable braking/turning, understandable collisions, recover from a missed turn (U-turn routing + reroute), wet feels different but controllable. Negotiation: distinct archetypes, understandable accept/reject (topFactor UI), declining is sometimes correct, no single exploit. Economy: fuel scales with distance and traffic, recovery after a bad day, repairs meaningful not punishing, off-app a trade-off. Narrative: characters remember choices, multiple endings via styles, risky ≠ criminal, helpful/safe choices matter. Performance: low-end Android, dense traffic fps, memory, load times, simplified distant traffic, no whole-city load.

### T6.2 Balance pass
- [ ] `tests/balance/campaign.test.ts`: 50 seeded 20-day campaigns per bot policy. Bands (tune `balance.ts` until true, record final numbers in BALANCE.md):
  - smartPro reaches savings ≥ 20,000 by Day 20 in ≥ 70% of runs.
  - The trust-focused policy reaches Trusted Local in ≥ 60% of runs with savings < 15,000.
  - reckless has the highest crash/infraction count and its mean net ≤ smartPro ×1.15 (risk is not dominant).
  - off-app-heavy policy: mean net ≤ smartPro ×1.1 and suspension in ≥ 30% of runs (trade-off, not exploit).
  - From a bad day (net −৳500) a recovery to positive weekly net is possible within 3 days in ≥ 80% of runs.
  - Repairs average ≤ 12% of revenue for smartPro.

### T6.3 Accessibility and localisation
- [ ] Remappable controls ✔, subtitle size, colour-blind route palette, reduce-motion (disables camera shake/FOV kick), pause-on-decisions ✔, hold-to-accelerate alternative (auto-cruise toggle on mobile), all UI keyboard/gamepad navigable. Native-speaker review checklist for Bangla text (log in QUESTIONS.md for the user to review: the agent cannot verify idiom quality itself).

### T6.4 Branding, credits, deploy
- [ ] GDD §2: title branding check, a note in QUESTIONS.md for the user (trademark search is a human task). The credits screen lists all CC0/OFL assets. Final `npm run build` (full scope), deploy (after user confirmation), tag `v2.0.0`.

---

## 7. Spec coverage map (GDD section → tasks)

§1 pillars → enforced by T2.9/T6.2 balance and the rules in §1 · §2 tone → rule 8, T5.7 · §3 Rafi, identity, opening → T3.8, T4.8 · §4 districts, road types, segment data, landmarks → T1.5, T3.2, T3.3, T5.1 · §5 loop → T1.6–T2.6, T4.1 · §6 requests, negotiation, model, off-app → T2.1–T2.5 · §7 situations → T3.7, T4.5 · §8 crime → T4.6, T5.4 Ch4 · §9 passenger AI, FSM → T1.6, T2.2 · §10 economy, upgrades → T2.6, T4.1, T4.4, T5.6, T5.8 · §11 traffic, world, LOD → T2.7, T3.4, T3.5, T5.2, T5.3 · §12 chapters, endings → T4.7, T5.4, T5.5 · §13 UI, controls → T1.4, T2.4, T2.8, T3.10, T4.7 journal, T4.4 garage, T4.10 · §14 architecture, data structures, boundaries → §4–5 of this plan, T0.3 · §15 roadmap → Milestones 1–5 · §16 v1 scope → T4.10 checklist · §17 testing → T6.1, T6.2 · §18 principles → §1 rules + balance tests · §19 decisions → §0 · §20 next steps / prototype success criterion → Milestone 1–3 exit checks.

## 8. Verification (end-to-end)

1. `npm run check` is green (types, lint, unit, data validation).
2. `npm run balance` is green (all T2.9/T6.2 bands).
3. `npm run e2e` is green on `desktop-chrome` and `pixel7` (boot, tutorial, negotiation, menus, save/autosave, perf gate).
4. Manual: `npm run dev -- --host`, open on an Android phone in landscape, play the First Ride tutorial plus 15 minutes of Endless. On desktop, play Days 1–3 with keyboard and gamepad.
5. GDD §20 success criterion, checked in one session: pick up a passenger, negotiate, navigate, handle one event, drop off, and read the receipt showing net earned or lost.
6. Ending reachability: `vitest run tests/balance/endings.test.ts` shows all 5 endings reached by their bot policies.
