# Uthao Master Document Update: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the v2.0.0 build, whose systems pass in isolation but are not connected in the running game, into the playable game the Master Document specifies, then add what the document newly requires (trip state machine, reconciled ledger, karma meters, police and accident systems, real endings).

**Architecture:** Extract a headless `GameSession` composition root from `src/main.ts`, so vitest, bots and the browser all run the same loop. `TripFsm` becomes the single authority for ride state; `EconomyManager` owns an exactly-once ledger; `ReputationSystem` owns event-logged bounded meters. UI reads derived views and writes only through commands. Stay on Three.js, Rapier and Preact (spec §17 forbids migrating just because Unity is mentioned).

**Tech Stack:** TypeScript 6, Three.js 0.186, Rapier 0.21, Preact and signals, zod, Vitest 5, Playwright 1.64, Vite PWA.

**Spec:** `docs/MASTER.md` (copy of `Uthao_Story_and_Game_Logic_Master.md`). Section numbers below refer to it.

## Audit: what was actually found (2026-11-02, commit 7c1fffe)

| Check | Result |
|---|---|
| `tsc`, `eslint`, `validate-data`, Vitest | Green, 360/360 tests |
| Playwright, desktop-chrome (pixel7 not run) | **7 failed, 9 passed, 1 skipped.** `ride`, `negotiation`, `firstRide`, `contacts`, `garage` and both main `menus` flows fail |
| Real game launched in headless Chrome | **Softlocks on boot.** A roaming encounter pauses the sim, and its buttons do nothing because `setChoiceDispatcher` is never called. No main menu appears (`screenSignal` defaults to `'game'`) |

**Root cause:** `npm run check` and `finish-task.sh` never run e2e, and the balance tests drive a parallel simulation in `src/sim/bot/strategies.ts`. So `docs/BALANCE.md` and the v1.0 checklist describe the bot harness, not the shipped game.

| # | Defect in the running game | Evidence |
|---|---|---|
| 1 | One hardcoded ride; `RequestGenerator` is only used by bots | `src/main.ts:356-371` |
| 2 | Rides pay nothing: a `'fare'` tx carrying net is emitted on the bus and bypasses `EconomyManager.post`, with `day: 1, minute: 0, rating: 5` hardcoded | `src/sim/ride/RideManager.ts:263-309` |
| 3 | Negotiation is debug-only; when enabled it always uses `bargainer` and `new Rng(123)` | `enableNegotiation`, `src/main.ts:336` |
| 4 | No collisions: `main.ts` calls `stepBike` directly, so `MotorcycleController` and `PhysicsWorld` are never created and `bike/collision` / `bike/nearMiss` never fire | grep |
| 5 | `bike/infraction` and `bike/puncture` have no emitter | grep |
| 6 | Fuel is never burned while riding; the only `consumeFuel` caller is the end-of-shift commute | `GameManager.ts:424` |
| 7 | Ride encounters can never fire: the phase is always `'roaming'`, `speedKmh: 0`, with no passenger or segment | `GameManager.ts:300-311` |
| 8 | `setChoice`, `setDayEnd`, `setGarage`, `setBike`, `setEnding` and `setPhoneContact` dispatchers are never bound, so those buttons are dead | grep |
| 9 | `Journal` and `TripSummary` exist but are never mounted; nothing sets `navigationTurn` | grep |
| 10 | The five endings are unreachable: live play only fires `ending_v1_first_week` at day ≥ 6; `evaluateEnding` is only called by bots | `MissionManager.ts:70`, `strategies.ts:1107` |
| 11 | Relationship IDs are split (`char_kamal` / `kamal_bhai`, `char_mintu` / `mintu`, `char_morshed` / `si_morshed`, `ma` / `char_ma`), yet the Workshop ending reads `kamal_bhai` | `data/**` |
| 12 | Insurance counted twice in `dailyExpenses` (`post` already adds it); `rating` effect is overwritten by `ReputationSystem`; `injury` effect damages the bike; `endTrip` emits an event without cancelling the trip | `GameManager.ts:432-439`, `effects.ts` |
| 13 | No ledger is stored; saves omit mission objective progress, trip state and the record of paid trips | `EconomyManager.post`, `SaveV1` |
| 14 | Rider spawns off-road facing a giant blank block; map shows Mirpara only | screenshot; `MapScreen.tsx:3` |
| 15 | `HUD` shows "Trip complete! Looking for fares..." forever and its objective strings are hardcoded English | `main.ts:526-538` |

### Spec coverage after the audit

| Spec § | State today | Task |
|---|---|---|
| 2 Opening | UI exists; bypasses ride, ledger | T7.4, T8.2, T11.2 |
| 3 Campaign, endings | Data exists; finale unreachable | T11.1-T11.3 |
| 4 Characters | Exist; IDs split | T7.5, T11.2 |
| 5 City, roads | Built; spawn, facades, buildings unverified | T7.3, T12.4 |
| 6-7 Loop, negotiation, pickup, off-app | Logic exists, unwired; order differs | T8.1-T8.5 |
| 8 Passenger AI | 5 of the 9 archetypes | T8.1, T8.6 |
| 9 Economy | Partial; no ledger | T8.2, T8.3 |
| 10 Meters | 3 of 8 | T13.1-T13.3 |
| 11 Robbery | Data only, no resolution | T10.1, T10.4 |
| 12 Police, bribery | One checkpoint, no bribe | T10.2 |
| 13 Accidents | Missing | T10.3 |
| 14 Traffic, weather | Exists, needs live fairness checks | T10.5 |
| 15 Mission, trip FSM | Different FSM | T8.1, T11.1 |
| 16 UI | Partial | T7.4, T13.2, T12.1-T12.3 |
| 18 Save | Partial | T11.4 |
| 21 Acceptance | Not met | T12.5 |

## Decisions made (log each in `docs/DECISIONS.md` when its task merges)

1. **Spec authority:** `docs/MASTER.md` supersedes `docs/GDD.md` wherever they differ. Add a banner to the GDD.
2. **Engine and platform:** stay browser/PWA on Three.js.
3. **District names stay fictional** (Mirpara, Fulgate, Dhanbagh and so on); the spec's table gives "district inspiration". Fix `world.json`, where Fulgate's Bangla name is the real "ফার্মগেট" (should be "ফুলগেট"), and Mintu's matching line.
4. **Title:** "Uthao" is the game's title. "Dhaka Bike Rider" leaves player-facing text. Trademark clearance stays a human task in `docs/QUESTIONS.md`.
5. **Hotkeys:** spec §21 says U, S, J "if configured", but `KeyS` is brake. Defaults: **U** UI Sheet, **J** Story, **K** Karma, remappable in `src/input/bindings.ts`.
6. **Negotiation moves before pickup** (spec §6 order), reversing the current arrive-then-negotiate flow. This is a contract break under `AGENT_WORKFLOW.md` §5, so old forms stay `@deprecated` until T12.5 removes them.
7. **Fuel accounting:** the tank is bought at the pump (cash); a trip's `fuelCost` is the value of fuel burned (non-cash). Settlement never posts fuel, so it cannot be double-counted. Invariant: `receipt.net + receipt.fuelCost === sum(ledger for requestId)`. Today's net on the HUD is ledger-based and cash-basis; the summary labels fuel "used on this trip".
8. **Campaign length:** finale opens on Day 20. Remove `ending_v1_first_week`; the first-week check must not end the game.
9. **Archetypes:** keep the five existing IDs and add six; `bargainer` is the spec's "Difficult negotiator", `careful` and `risky` stay as tendencies the spec doesn't forbid.
10. **Bots stay fast, not separate:** they skip physics via `GameSession.fastForwardTrip` but share all negotiation, settlement, reputation and mission code. A parity test keeps them honest.
11. **Dhaka map asset: not in the repo.** T12.3 reads `public/assets/map/dhaka.webp`; without it, the generated map renders with a visible "prototype map" label, per spec §16.
12. **Task IDs:** M2 uses T13.x, not T9.x, because `finish-task.sh` and `AGENT_WORKFLOW.md` reserve T9.n for maintenance fixes. IDs show identity, not order; the queue in `DEV_AFNAN.md` sets the order.
13. **Tafsirul's unmerged `origin/tafsirul/dark-choices-crime-ui`** shares no history with `main`, so it cannot be merged. It may be read as reference for T12.1 and T12.3 (it has a component library, a UI sheet and a Dhaka map). Copy ideas by hand and never push to it.

## Global Constraints

- Follow `AGENT_WORKFLOW.md`: tick `DEV_AFNAN.md`, merge only through `scripts/agent/finish-task.sh`. All branches are `afnan/<Tx.y>-<slug>`. Do not edit `DEV_TAFSIRUL.md` or add `@tafsirul:` items.
- Standard loop for every task: failing test → implement → `npm run check` plus `npx playwright test tests/e2e/smoke.spec.ts --project=desktop-chrome` → commit. Every commit message ends with the attribution trailer the session prescribes.
- Money changes only through `EconomyManager`; ride state only through `TripFsm`; meters only through `ReputationSystem.applyMeter`. UI never mutates game state: it dispatches commands.
- No hardcoded user-facing strings: add keys to both `data/dialogue/bn/*` and `data/dialogue/en/*`. Bangla first; new Bangla files get a native-review line in `docs/QUESTIONS.md`.
- Every visible button performs a real action, or is labelled prototype. Never show fake success (§16).
- Colors: Uthao Green `#22C55E`, Dhaka Amber `#F59E0B`, Danger Red `#EF4444`, dark slate translucent panels.
- All bounded meters are 0-100 and each change records its reason (§10).
- Fares in data are balancing placeholders, never presented as real-world claims.
- Sim hot paths stay allocation-free (`tests/unit/sim/hotPathAllocations.test.ts`).
- Depiction rules: not every alley is dangerous, not every officer corrupt, not every risky passenger criminal; no serious injury played for laughs (§4, 11, 12, 13).
- Do not expand content in T10-T12 until **Gate M1** passes. Never deploy publicly: `docs/QUESTIONS.md` only.
- Report real test results. Do not claim an untested feature works (§21).

## Review Focus

1. **Reload or tab-hide during `Completing`:** no double pay, no lost pay. Pinned in T11.4.
2. **Fuel empty far from a pump with ৳0:** the player must have a recovery path, not a softlock. Pinned in T8.3.
3. **Encounter due during a state change** (arrival frame, trip completion, another modal open): it waits or drops, never stacks or leaves a stale objective. Pinned in T10.1.
4. **Dead phone or suspended app mid-shift:** a clear objective and another way to earn (street pickup, charging). Pinned in T8.4.
5. **Loading a v2.0.0 save or a truncated save:** split relationship IDs merge; garbage goes to `.corrupt` and the menu still works. Pinned in T11.4.

## Task order, owners, points

**Afnan does all of this update; no work is assigned to Tafsirul.** Points use the existing scale.

| Milestone | Tasks (points) |
|---|---|
| **M0 Playable shell** | T7.1 (3) → T7.2 (8) → T7.3 (5) → T7.4 (5), T7.5 (3) |
| **M1 One real ride** | T8.1 (8) → T8.2 (5) → T8.3 (3) → T8.4 (5) → T8.5 (3) → T8.6 (5) |
| **Gate M1** | T8.7 (3): spec's prototype success criterion, tested, then played by a human. **Stop and fix the feel before continuing** |
| **M2 Consequences** | T13.1 (5) → T13.2 (5), T13.3 (3) |
| **M3 Encounters** | T10.1 (5) → T10.2 (5), T10.3 (5), T10.4 (5), T10.5 (5) |
| **M4 Campaign** | T11.1 (5) → T11.2 (8) → T11.3 (5), T11.4 (5) |
| **M5 Ship** | T12.1 (5) → T12.2 (5), T12.3 (5), T12.4 (5) → T12.5 (5) |

Total: 142 points.

---

## M0: Playable shell

### Task T7.1: Real-game gate, boot flow, softlock fix

**Files:**
- Create: `docs/MASTER.md`, `tests/e2e/smoke.spec.ts`
- Modify: `scripts/agent/finish-task.sh:20`, `src/ui/store.ts:110`, `src/main.ts`, `docs/GDD.md` (banner), `DEV_AFNAN.md`, `docs/QUESTIONS.md`, `docs/DECISIONS.md`

**Interfaces:**
- Produces: `screenSignal` starts `'menu'`, or `'game'` when the URL has `debug=1`. URL `encounters=0` disables ambient encounters. The sim is paused unless the screen is `'game'`.

- [ ] **Step 1: Commit the handoff files first, per `CLAUDE.md` (spec copy, this plan, `CLAUDE.md`, the `DEV_AFNAN.md` queue). Add the GDD banner and log decisions 1-4 and 12-13, plus a `DECISIONS.md` line saying Afnan owns this whole update for now.**
- [ ] **Step 2: Write the failing smoke test**

```ts
test('new player reaches riding, and a choice card resolves', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await expect(page.getByTestId('choice-card')).toHaveCount(0);
  await page.getByTestId('menu-new-career').click();
  // Completes via tutorial steps until the HUD is interactive
  await expect(page.locator('#hud')).toBeVisible();
});
test('debug-started encounter can be answered', async ({ page }) => {
  await page.goto('/?debug=1&encounters=0');
  await page.evaluate(() => window.__uthao!.startEncounter('enc_friend_package'));
  await page.getByTestId('choice-btn-1').click();
  await expect(page.getByTestId('choice-card')).toHaveCount(0);
  expect(await page.evaluate(() => window.__uthao!.isPaused())).toBe(false);
});
```

Use the real test IDs from `MainMenu.tsx`; add any that are missing.

- [ ] **Step 3: Run, expect FAIL.** `npx playwright test tests/e2e/smoke.spec.ts --project=desktop-chrome`
- [ ] **Step 4: Implement.** Set the initial screen; call `setChoiceDispatcher((choiceId, instanceId) => gm.dispatch({ type: 'chooseEncounterOption', instanceId, choiceId }))`; add `eventDirector.enabled`; add ambient-encounter suppression while `tutorialSignal.active` or the screen isn't `'game'`. In `finish-task.sh`, run the smoke spec after `npm run check`.
- [ ] **Step 5: Run the whole desktop e2e suite.** Failures caused by the card intercepting clicks must be gone. Record any that remain in the progress log with their owning task from this plan. Restore `tests/e2e/__screenshots__` if a run rewrites it without an intended visual change.
- [ ] **Step 6: Commit.** `feat(T7.1): add real-game smoke gate and fix boot softlock`

### Task T7.2: `GameSession` composition root and live request loop

**Files:**
- Create: `src/sim/GameSession.ts`, `tests/unit/sim/gameSession.test.ts`
- Modify: `src/main.ts` (reduce to renderer, HUD and input glue; delete `sampleRequest`), `src/debug/debugApi.ts`

**Interfaces:**
- Consumes: `GameManager`, `RideManager`, `RequestGenerator`, `TrafficManager`, `RoadNetwork`
- Produces:

```ts
class GameSession {
  constructor(opts: { gm: GameManager; road: RoadNetwork; physics?: PhysicsWorld; autoRequests?: boolean });
  readonly gm: GameManager; readonly ride: RideManager; readonly requests: RequestGenerator; readonly traffic: TrafficManager;
  bike: BikeState;
  step(input: BikeInput, dt?: number): void; // advances clock, bike, traffic, ride, encounters in that order
  newCareer(): void;                         // replaces the inline reset in main.ts
  fastForwardTrip(opts: { idleMin?: number }): void; // implemented in T11.3
}
```

- [ ] **Step 1: Write failing tests**

```ts
it('offers real generated requests with no hardcoded ride', () => {
  const s = makeSession({ seed: 7 });
  stepMinutes(s, 30);
  expect(s.ride.getOfferedRequests().length).toBeGreaterThan(0);
  expect(s.ride.getOfferedRequests().some(r => r.requestId === 'req_tutorial_01')).toBe(false);
});
it('the same seed and inputs give identical snapshots', () => {
  expect(run(9).economy).toEqual(run(9).economy);
});
```

- [ ] **Step 2: Run `npx vitest run tests/unit/sim/gameSession.test.ts`, expect FAIL.**
- [ ] **Step 3: Implement.** Move the per-tick logic from `main.ts:409-476` into `step`, reusing `camView` and pose objects rather than allocating them. Offered-request cards replace the auto-accept. Do not lose the single-district URL mode that `ride.spec` needs: it passes `autoRequests: false` and uses a new debug `spawnRequest`.
- [ ] **Step 4: Run check and smoke, confirm `ride.spec` passes, commit.** `feat(T7.2): extract GameSession and drive rides from RequestGenerator`

### Task T7.3: Mounted bike, spawn, collisions, camera

**Files:**
- Modify: `src/sim/GameSession.ts`, `src/main.ts`, `src/render/Renderer.ts`, `src/render/CameraRig.ts`, `src/physics/MotorcycleController.ts`
- Test: `tests/unit/sim/gameSession.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:** Produces `session.spawnAtHome(): void`. `MotorcycleController` replaces direct `stepBike` when `physics` is given; without it, the session emits collisions from `TrafficManager` agent proximity only.

- [ ] **Step 1: Write failing tests**

```ts
it('spawns on a road, aligned to it, in Mirpara', () => {
  const s = makeSession(); s.spawnAtHome();
  expect(s.road.segmentAt(s.bike.x, s.bike.z)).not.toBeNull();
  expect(headingError(s.bike, s.road.segmentAt(s.bike.x, s.bike.z)!)).toBeLessThan(0.1);
});
it('driving into a building stops the bike and emits a collision', async () => {
  const s = await makeSessionWithPhysics(); const hits = spy(s.gm.bus, 'bike/collision');
  driveInto(s, nearestBuilding(s), 5);
  expect(hits).toHaveBeenCalled(); expect(s.bike.speed).toBeLessThan(2);
});
it('touching a traffic agent emits a collision', () => { /* place an agent ahead, throttle, assert */ });
```

Add an e2e screenshot assertion that the bike mesh is in frame and the camera sits outside every collider after a turn beside a wall.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Init Rapier before the first frame in `main.ts`. Pass `physics` to `renderer.loadWorld` so `CityBuilder` adds colliders for streamed districts. Spawn from `gm.homeNodeId`, not `activeDistrict.nodes[0].x - 9`. If the mesh doesn't read as a rider on a motorcycle, fix `src/render/vehicles.ts` and the seat offset. Add near-miss and collision events for traffic agents.
- [ ] **Step 4: Run check and smoke; capture a screenshot and inspect it; commit.** `feat(T7.3): ride with real physics, road spawn and camera collision`

### Task T7.4: Bind every UI action; mount TripSummary and Journal

**Files:**
- Create: `src/ui/bindings.ts`, `tests/unit/ui/bindings.test.ts`
- Modify: `src/main.ts`, `src/ui/App.tsx`, `src/ui/store.ts`
- Test: `tests/e2e/{garage,contacts,dayEnd,menus}.spec.ts`

**Interfaces:** Consumes `GameSession`. Produces `bindUi(session: GameSession): void`, which calls all 11 `set*Dispatcher` functions, including `setDayEnd`, `setGarage`, `setBike`, `setEnding` and `setPhoneContact`.

- [ ] **Step 1: Write the failing test**

```ts
it('binds every exported on*Callback', () => {
  bindUi(makeSession());
  for (const [name, value] of Object.entries(store))
    if (/^on[A-Z].*Callback$/.test(name)) expect(value, name).toBeTypeOf('function');
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `bindUi`.** Each binding dispatches a `Command`; add a command when one is missing. Mount `TripSummary` from a new `tripSummarySignal`, set on `ride/completed`. Its Continue button is the only exit. Mount `Journal` with live snapshot props. Replace `screenSignal.value = 'game'` for Endless with a true `mode: 'endless'` session.
- [ ] **Step 4: Run check and the four e2e specs (all must pass), commit.** `feat(T7.4): connect every UI action to the running session`

### Task T7.5: One relationship store, one ID scheme, effect bugs

**Files:**
- Modify: `data/encounters/*.json`, `data/missions/*.json`, `src/sim/GameManager.ts:344,366,384,432-439,450,454`, `src/sim/events/effects.ts`, `src/sim/mission/MissionManager.ts`, `src/sim/mission/endings.ts:106`, `src/sim/reputation/ReputationSystem.ts`, `scripts/validate-data.mjs`
- Test: `tests/unit/sim/reputation.test.ts`, `tests/unit/sim/economy.test.ts`

**Interfaces:** Produces `canonicalCharacterId(id: string): string`, exported from `src/sim/passenger/PassengerAI.ts`, mapping legacy IDs (`kamal_bhai`, `mintu`, `ma`, `si_morshed`, `ferdousi`, `tanvir`, `rahim`, `nabila`, `bablu`) to `char_*`. `ReputationSystem` is the only writer; `story.characterRelationships` is written from it.

- [ ] **Step 1: Write failing tests**

```ts
it('a relationship effect changes the value once', () => { apply({type:'relationship',characterId:'char_kamal',delta:5}); expect(rep.getRelationship('char_kamal')).toBe(start + 5); expect(story.characterRelationships.char_kamal).toBe(start + 5); });
it('rating effect survives the next reputation/changed', ...);
it('insurance counts once in dailyExpenses', () => { /* buy new150, endShift, assert expenses equal ledger sum */ });
it('endTrip effect cancels the active trip', ...);
it('injury no longer damages the bike unless target is bike', ...);
```

In `validate-data.mjs`, fail on any `characterId` not in `data/characters.json`.

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Rewrite data IDs. Remove `GameManager.ts:439`. Route `rating` through `ReputationSystem.recordTripRating` or a new `adjustRating`. Pass `rideManager` in the effect context. Change `injury` to `{ target: 'rider'|'passenger'|'bike', severity }`, reading the old form as `bike`.
- [ ] **Step 4: Run check, commit.** `fix(T7.5): unify relationship IDs and repair effect handlers`

---

## M1: One real ride

### Task T8.1: Authoritative `TripFsm`, negotiate-before-pickup

**Files:**
- Create: `src/sim/ride/tripFsm.ts`, `src/sim/ride/rideView.ts`, `tests/unit/sim/tripFsm.test.ts`
- Modify: `src/core/types.ts`, `src/core/events.ts`, `src/sim/ride/RideManager.ts`, `src/main.ts`, `src/ui/store.ts`, `src/sim/ride/passengerFsm.ts` (`@deprecated`), `tests/unit/sim/RideManager.test.ts`

**Interfaces:**

```ts
export type TripState = 'Idle'|'RequestAvailable'|'Negotiating'|'Accepted'|'EnRouteToPickup'|'PassengerOnboard'
  |'EnRouteToDestination'|'Completing'|'Completed'|'Declined'|'Cancelled'|'NoShow'|'Failed'|'EmergencyInterrupted';
export type TripOutcome = 'disputed'|'abandonedForSafety'|'passengerCancelled'|'riderCancelled'|'accident'|'robbery';
export type PassengerStatus = 'RequestCreated'|'Offered'|'Negotiating'|'Accepted'|'RiderEnRoute'|'AtPickup'|'OnTrip'|'AtDestination'
  |'Completed'|'Declined'|'Cancelled'|'NoShow'|'Disputed'|'AbandonedForSafety'|'Failed';
export function createTripFsm(): Fsm<TripState, TripEvent>;
export function passengerStatusOf(s: TripState, outcome?: TripOutcome): PassengerStatus;
export interface RideView { trip: TripState; passenger: PassengerStatus; objectiveKey: string; objectiveVars: Record<string,string|number>;
  navTargetNodeId: string|null; pickupVisible: boolean; dropoffVisible: boolean; }
export function deriveRideView(ride: RideManager): RideView; // the ONLY source for HUD, minimap and markers
// RideManager gains: openNegotiation(id), agreeFare(fare), getTripState(), getOutcome(), interrupt(), resumeTrip()
```

Transitions: `Idle → RequestAvailable → Negotiating → Accepted → EnRouteToPickup → PassengerOnboard → EnRouteToDestination → Completing → Completed → Idle`. Alternatives: `Declined`, `Cancelled` (before onboard, or with an outcome), `NoShow` (from `EnRouteToPickup`), `Failed` (any active state), `EmergencyInterrupted ↔ prior state`. `RideRequest.status` stays updated through a mapping for older readers.

- [ ] **Step 1: Write failing tests**

```ts
it('cannot complete before pickup and arrival', () => { const f = createTripFsm(); expect(f.can('settle')).toBe(false); });
it('table: each illegal event from each state is rejected', ...);
it('a full ride walks the states in order, negotiating before pickup', () => {
  expect(walkRide(session)).toEqual(['RequestAvailable','Negotiating','Accepted','EnRouteToPickup','PassengerOnboard','EnRouteToDestination','Completing','Completed','Idle']);
});
it('after completion, the view has no nav target or stale objective', () => {
  completeRide(session); const v = deriveRideView(session.ride);
  expect(v.navTargetNodeId).toBeNull(); expect(v.dropoffVisible).toBe(false); expect(v.objectiveKey).toBe('objective.idle_find_ride');
});
it('a passenger who no-shows ends in NoShow, pays nothing, clears navigation and posts no ledger row', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Replace the markers, objective and `passengerStatus` code at `main.ts:478-568` with `RideView` readers. Objective strings become i18n keys. NoShow chance derives from `paymentReliability` using the session's seeded RNG. Update `RideManager.test.ts` and log decision 6.
- [ ] **Step 4: Run check and smoke, commit.** `feat(T8.1): make TripFsm authoritative and negotiate before pickup`

### Task T8.2: Exactly-once settlement and ledger

**Files:**
- Modify: `src/sim/economy/EconomyManager.ts`, `src/sim/economy/fuel.ts`, `src/core/types.ts`, `src/sim/ride/RideManager.ts:263-316`, `src/ui/trip/TripSummary.tsx`, `src/main.ts:291-318` (tutorial settles through the same path), `src/sim/ride/RequestGenerator.ts`
- Test: `tests/unit/sim/economy.test.ts`, `tests/unit/sim/RideManager.test.ts`

**Interfaces:**

```ts
// TransactionKind adds: 'bonus'|'bribe'|'compensation'|'tea'|'savings'
// TripReceipt adds: bonus: number; penalties: number; compensation: number; fuelLiters: number;
interface TripSettlement { requestId: string; fare: number; tip: number; bonus: number; bookingType: BookingType; fuelLiters: number;
  otherCosts: number; penalties: number; compensation: number; durationMin: number; distanceKm: number; rating: number; day: number; minute: number; consequences: string[]; }
EconomyManager.settleTrip(s: TripSettlement): TripReceipt | null; // null if requestId already settled
EconomyManager.getLedger(): readonly Transaction[];
EconomyManager.ledgerFor(requestId: string): Transaction[];
EconomyManager.restoreLedger(ledger: Transaction[], settled: string[]): void;
```

Request IDs become `req_<day>_<seq>` with `seq` persisted, so a loaded game can't reuse an ID.

Completion order (§15): clear nav target → settle → update reputation → mark dropped off → emit `ride/completed` (summary) → `Completed`. On Continue → `Idle` → next request or idle objective.

- [ ] **Step 1: Write failing tests**

```ts
it('net matches the formula', () => {
  const r = eco.settleTrip(trip({ fare:150,tip:10,bonus:5,otherCosts:4,penalties:3,compensation:2,fuelLiters:0.1 }))!;
  expect(r.net).toBe(150+10+5-r.commission-r.fuelCost-4-3-2);
});
it('the ledger reconciles: net + fuelCost equals ledger sum for the request', () => {
  const r = eco.settleTrip(trip())!;
  expect(r.net + r.fuelCost).toBe(sum(eco.ledgerFor(r.requestId)));
});
it('settling twice pays once', () => { eco.settleTrip(t); const c = eco.cash; expect(eco.settleTrip(t)).toBeNull(); expect(eco.cash).toBe(c); });
it('a completed live ride changes cash and uses real day, minute and rating', ...);
it('a rough ride rates below 5', () => { /* two bumps during the trip */ });
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** One tx per component (`fare +`, `tip +`, `commission −`, and so on). Start `ReputationSystem.startTrip` on onboard; rating comes from `getActiveTripRating`. Replace the tutorial's fake numbers at `main.ts:292-317`. Mark `RideManager`'s direct `economy/transaction` emit gone. Summary rows come from the receipt, labelled per decision 7.
- [ ] **Step 4: Run check and smoke, commit.** `feat(T8.2): settle trips exactly once into a reconciled ledger`

### Task T8.3: Live fuel, wear, and recovery

**Files:**
- Modify: `src/sim/GameSession.ts`, `src/sim/economy/fuel.ts`, `src/sim/economy/maintenance.ts`, `src/physics/bikeModel.ts` (condition effects), `src/ui/hud/Hud.tsx`
- Test: `tests/unit/sim/gameSession.test.ts`

**Interfaces:** Extend `fuelUsed` options with `{ loadKg?: number; roughness?: number; throttleStress?: number }`. `session.tripFuelLiters` accumulates for `settleTrip`. Commands: `refuelAtStation`, `callFuelRescue`.

- [ ] **Step 1: Write failing tests**

```ts
it('riding burns fuel by distance; a jam burns more per km than open road', ...);
it('a passenger and worn condition increase consumption', ...);
it('empty tank with zero cash can still recover', () => {
  const s = sessionAt({ cash: 0, fuelLevel: 0, farFromPump: true });
  expect(s.gm.dispatch({ type: 'callFuelRescue' }).success).toBe(true); // debt or favour, with time cost
  expect(s.gm.economyManager.fuelLevel).toBeGreaterThan(0);
});
it('low condition raises breakdown risk, warns first, and is repairable', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Per-step fuel and km-based wear; empty tank cuts throttle to a push speed; `buyFuel` must charge money via `refuel` (`GameManager.ts:361` currently gives it free). Fuel stations come from district POIs.
- [ ] **Step 4: Run check and balance (record the shift for T11.3, don't tune yet), commit.** `feat(T8.3): burn fuel and wear while riding, with recovery paths`

### Task T8.4: Pickup validity, navigation, reroute, phone states

**Files:**
- Create: `src/sim/road/navigation.ts`, `tests/unit/sim/navigation.test.ts`
- Modify: `src/sim/ride/RideManager.ts`, `src/sim/ride/RequestGenerator.ts`, `src/sim/GameSession.ts`, `src/ui/store.ts`

**Interfaces:**

```ts
export function nextInstruction(route: Route, pose: {x:number;z:number;heading:number}): NavInstruction | null;
export interface NavInstruction { kind: 'left'|'right'|'straight'|'uturn'|'arrive'; distanceM: number; textKey: string }
RideManager.relocatePickup(nodeId: string, walkM: number): boolean; // re-prices via negotiation and updates the route
RideManager.isOffRoute(pose): boolean; // > 25 m off the current route for 2 s
```

- [ ] **Step 1: Write failing tests**

```ts
it('all generated requests have reachable, motorcycle-accessible, pickup-practical pickups', () => { /* 500 seeds */ });
it('a pickup across a divided road offers a safe alternative', ...);
it('relocating changes the route, ETA and passenger mood', ...);
it('a missed turn recalculates; instruction never points to the old route', ...);
it('a blocked segment reroutes, or fails the trip clearly if no route remains', ...);
it('no instruction after completion', ...);
it('dead phone: no app requests, objective tells the player to charge, street pickups remain', ...);
it('suspended app: objective explains and direct or street rides remain', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** on top of `route`, `pickupOptions` and `rerouteIfBlocked`. `accept` must route from the bike's nearest node to pickup, not pickup to destination. Add `street` requests in demand zones.
- [ ] **Step 4: Run check and smoke, commit.** `feat(T8.4): live navigation, reroute and pickup relocation`

### Task T8.5: Negotiation with the real passenger

**Files:**
- Modify: `src/ui/bindings.ts`, `src/sim/negotiation/NegotiationSystem.ts:101-195`, `src/ui/negotiation/NegotiationPanel.tsx`, `src/ui/phone/RequestCard.tsx`
- Test: `tests/unit/sim/NegotiationSystem.test.ts`, `tests/e2e/negotiation.spec.ts`

**Interfaces:** `startNegotiation` context adds `history: number /* -1..1 */` and receives the session RNG. Spec variables F, B, U, P, T, R, W, H must all affect `evaluateFactors`. The panel shows the passenger's offer, suggested fare, custom counter, mood and patience, relocation, route choices, accept, decline, walk away (§16).

- [ ] **Step 1: Write failing tests**

```ts
it('H: a history of overcharging lowers acceptance at the same fare', ...);
it('W: more pickup inconvenience lowers acceptance', ...);
it('no fixed multiplier is best across archetypes', () => {
  // For multipliers 0.9..1.5 over 1000 seeded negotiations, per archetype: the best multiplier differs by archetype or context
});
it('the live session uses the request profile, not a fixed bargainer', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Fetch via `requests.getProfile`. Remove `new Rng(123)`. Bind accept and decline from the phone card through `openNegotiation` and `agreeFare`. Add the spec's four Bangla sample lines verbatim to the first ride.
- [ ] **Step 4: Run check and `negotiation.spec`, commit.** `feat(T8.5): negotiate with real passengers including history and walk factors`

### Task T8.6: Six new archetypes and live off-app rides

**Files:**
- Modify: `data/archetypes.json`, `src/core/types.ts`, `src/sim/passenger/profiles.ts`, `data/dialogue/{bn,en}/dialogue.json`, `scripts/generate-dialogue.mjs`, `src/sim/GameSession.ts`
- Test: `tests/unit/sim/PassengerAI.test.ts`, `tests/unit/sim/dialogue.test.ts`, `tests/balance/rides.test.ts`

**Interfaces:** `ArchetypeId` adds `'student'|'office'|'urgent'|'traveler'|'unreliable'|'family'`. `risky` and `unreliable` are distinct: neither is criminal by default. `family` sets `luggage` or `child` and needs accessible pickup; `traveler` uses landmark direction lines; `unreliable` can cancel, delay or dispute.

- [ ] **Step 1: Write failing tests**

```ts
it('each new archetype has at least 15 lines across phases in both languages', ...);
it('unreliable may dispute; settlement records Disputed', ...);
it('off-app avoids commission but risks non-payment and strikes', ...);
it('off-app is a trade-off', () => { /* 200 seeds: mean off-app net <= app net * 1.1 and worst case < app worst case */ });
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Add the off-app choice to the live panel; call `recordOffAppRide`. Add new Bangla lines to `docs/QUESTIONS.md` for native review.
- [ ] **Step 4: Run check and balance, commit.** `feat(T8.6): add spec archetypes and real off-app trade-offs`

### Task T8.7: Gate M1, prototype success criterion

- [ ] Add `tests/e2e/prototype.spec.ts`: from the menu, accept → negotiate → ride with autopilot → one debug-started encounter → drop off → summary rows equal ledger rows → next request appears. Run on both projects.
- [ ] Add the human protocol to `docs/PLAYTEST.md`: "Can a new player do this unaided on PC and on an Android phone, and is it enjoyable?" Add an unticked line `- [ ] GATE-M1 signed off by Afnan` to `docs/QUESTIONS.md`. **Do not begin M2 until Afnan has ticked it.** This overrides "never block on a human playtest" in `AGENT_WORKFLOW.md`; spec §22 rule 10 is the reason.

---

## M2: Consequences

### Task T13.1: Bounded, attributed meters

**Files:**
- Modify: `src/sim/reputation/ReputationSystem.ts`, `src/core/types.ts`, `src/core/events.ts`, `src/sim/schemas.ts`, `src/sim/events/effects.ts`, `src/config/balance.ts`
- Test: `tests/unit/sim/reputation.test.ts`

**Interfaces:**

```ts
export type MeterId = 'riderIntegrity'|'publicReputation'|'platformStanding'|'criminalExposure'|'evidenceExposure'|'safetyRecord';
export interface KarmaEvent { id: string; day: number; minute: number; meter: MeterId; delta: number; applied: number; reasonKey: string; subjectId?: string; }
ReputationSystem.applyMeter(meter: MeterId, delta: number, reasonKey: string, subjectId?: string): void;
ReputationSystem.getMeters(): Record<MeterId, number>;
ReputationSystem.getKarmaLog(limit?: number): readonly KarmaEvent[]; // newest first, ring of 200
ReputationSystem.getPassengerTrust(passengerId: string): number;      // 0-100; persisted for recurring characters
// Effect adds: { type: 'meter'; meter: MeterId; delta: number; reasonKey: string }
// Event adds: 'karma/changed': { event: KarmaEvent }
```

`publicReputation` replaces `localTrust` (`getLocalTrust` stays as a deprecated alias). Starts: integrity 50, public 30, platform 80, criminal 0, evidence 0, safety 70. Keep `riskScore` until T11.1 moves endings to meters.

- [ ] **Step 1: Write failing tests**

```ts
it('clamps to 0..100 and logs the applied delta', () => { rep.applyMeter('evidenceExposure', 500, 'r'); expect(rep.getMeters().evidenceExposure).toBe(100); expect(rep.getKarmaLog(1)[0].applied).toBe(100); });
it('every meter change has a reason', ...);
it('collisions, infractions and safe trips move safetyRecord through applyMeter', ...);
it('complaints lower platformStanding; below 20 suspends the app', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Convert existing direct mutations.
- [ ] **Step 4: Run check, commit.** `feat(T13.1): add bounded attributed karma meters`

### Task T13.2: Karma panel, Story panel, UI Sheet, hotkeys

**Files:**
- Create: `src/ui/karma/KarmaPanel.tsx`, `src/ui/sheet/UiSheet.tsx`, `tests/e2e/panels.spec.ts`
- Modify: `src/ui/App.tsx:71-106`, `src/input/bindings.ts`, `src/ui/journal/Journal.tsx`, `src/ui/hud/Hud.tsx`

**Interfaces:** Consumes `getMeters`, `getKarmaLog`. Keys U, J, K per decision 5, with touch buttons on the HUD.

- [ ] **Step 1: Write failing e2e**

```ts
test('U, J and K open panels and Escape closes them', ...);
test('typing "uj" in the counteroffer field opens no panel', ...);
test('after a choice, the Karma panel shows the change and its reason', ...);
test('criminal and evidence meters stay hidden until non-zero', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Handle hotkeys in `App` and ignore events from `input`/`textarea`. Journal gains recent decisions and unlocked opportunities (§16). Open panels pause the sim only when the bike is stopped; while moving, they refuse with a toast.
- [ ] **Step 4: Run check and panels spec, commit.** `feat(T13.2): add karma panel, story panel, UI sheet and hotkeys`

### Task T13.3: Exploitation and help as real choices

**Files:**
- Modify: `data/encounters/payment.json`, `data/encounters/route.json`, `src/sim/negotiation/NegotiationSystem.ts`, `src/sim/GameSession.ts`
- Test: `tests/unit/sim/signatureEncounters.test.ts`, `tests/balance/rides.test.ts`

**Interfaces:** New `NegotiationAction`s `misleadDistance` and `pressure`. Effects use `meter`.

- [ ] **Step 1: Write failing tests**

```ts
it('misleading can raise a single fare but drops integrity and may trigger complaint or refusal', ...);
it('a recurring passenger you overcharged stops direct-booking, and says why', ...);
it('exploiting is not reliably profitable', () => { /* 200 seeds, 20 days: exploit net <= honest net * 1.1, variance higher */ });
it('helping costs time or money, shown up front, and raises trust and repeat business', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Vulnerable passengers (`urgent`, `traveler`, `family`) add a larger integrity loss.
- [ ] **Step 4: Run check and balance, commit.** `feat(T13.3): add exploitation and help consequences`

---

## M3: Encounters

### Task T10.1: Encounters on real context, reusable panel, outcome tables

**Files:**
- Modify: `src/sim/GameSession.ts`, `src/sim/GameManager.ts:299-315`, `src/sim/events/EventDirector.ts`, `src/sim/schemas.ts`, `src/sim/events/effects.ts`, `src/ui/choice/ChoiceCard.tsx`
- Test: `tests/unit/sim/eventDirector.test.ts`, `tests/unit/sim/gameSession.test.ts`

**Interfaces:**

```ts
// Effect adds: { type:'outcome'; table: { weight:number; requires?:Condition; lineKey:string; effects:Effect[] }[] }
// EncounterChoice adds: riskKey?: string; costHint?: number; kind?: 'official'|'illicit'|'neutral';
// EncounterDef adds: cueKey?: string  (readable warning shown before severe events)
// 'encounter/resolved' adds outcomeLineKey?: string
GameManager.evaluateEncounters(ctx: EncounterContext): void; // called by the session, replacing the tick's stub
```

Session builds the context from `RideView`, current segment, passenger, speed. Directed by `segment.riskLevel`, time, weather, mission, cooldown.

- [ ] **Step 1: Write failing tests**

```ts
it('onTrip, atPickup, dropOff and requestOffered encounters all fire in a live session', ...);
it('encounters never stack; none starts during Completing, a modal, or with another active', ...);
it('a blocking event never blocks the only route to the active target', ...);
it('decisions only appear with the sim paused or the bike stopped', ...);
it('an outcome table uses the seeded RNG and respects requires', ...);
it('a severe event shows its cue at least 10 s of sim time before it resolves', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** using the `pauseOnDecisions` path that already exists. The card shows the outcome line on a second screen.
- [ ] **Step 4: Run check and smoke, commit.** `feat(T10.1): run encounters on real ride context with outcome tables`

### Task T10.2: Police, violations, fines, bribery

**Files:**
- Create: `src/sim/events/violations.ts`, `data/encounters/police.json`, `tests/unit/sim/police.test.ts`
- Modify: `src/sim/GameSession.ts`, `src/sim/GameManager.ts:48`, `data/encounters/route.json` (retire `enc_traffic_checkpoint`), `data/dialogue/{bn,en}/encounters.json`

**Interfaces:** `detectViolations(bike, segment, signals, out: BikeInfractionKind[]): void` (allocation-free). Emits `bike/infraction`. Encounters use `{kind:'official'}` for fine and `{kind:'illicit'}` for bribe, styled differently.

Choices: pay official fine (`fine` tx, safety down), explain or contest, accept warning (only if `requires` allows), offer bribe (`bribe` tx), leave. Officer behaviour table: `by_the_book` 55, `lenient` 30, `opportunist` 15, placeholder weights in `balance.ts`. An encounter requires a prior violation or story event.

- [ ] **Step 1: Write failing tests**

```ts
it('speeding, wrong-way and red-light are each detected once per offence', ...);
it('no stop without a violation or story flag', ...);
it('a bribe is not guaranteed', () => { /* 1000 seeds: some rejected, some repeat demands */ });
it('a bribe can raise evidenceExposure; fines never do', ...);
it('fine posts kind fine, bribe posts kind bribe', ...);
it('most officers refuse bribes', () => { /* accepted share < 50% */ });
it('fleeing escalates criminalExposure and can fail', ...);
it('repeat violations raise severity', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run check, commit.** `feat(T10.2): add violations, police encounters, fines and bribery`

### Task T10.3: Accident system

**Files:**
- Create: `src/sim/events/accidents.ts`, `data/encounters/accident.json`, `tests/unit/sim/accidents.test.ts`
- Modify: `src/sim/GameSession.ts`, `src/sim/ride/RideManager.ts`, `src/core/types.ts`

**Interfaces:**

```ts
export interface AccidentReport { id: string; severity: 'minor'|'moderate'|'serious'; riderInjury: 0|1|2; passengerInjury: 0|1|2; bikeDamage: number;
  otherParty: boolean; responsibility: number /* 0..1 */; witnesses: number; wet: boolean; }
export function assessAccident(ev: BikeCollisionEvent, ctx: AccidentContext): AccidentReport; // pure
```

`responsibility` derives from speed over limit, infraction in the last 5 s, wet road, brake condition, and whether an NPC was at fault. It is never random blame. Severity follows impact speed. No outcome is automatically fatal.

- [ ] **Step 1: Write failing tests**

```ts
it('bump at low speed is minor, offers a quick recovery and the trip can resume', ...);
it('a high-speed crash stops the bike, shows status and interrupts the trip', ...);
it('an NPC-fault collision gives low responsibility and no compensation demand', ...);
it('taking responsibility costs money but reduces reputation loss vs. leaving', ...);
it('medical and compensation post ledger rows and appear on the receipt', ...);
it('serious injury cancels or fails the trip; never continues as if nothing happened', ...);
it('a bad accident leaves a recovery path', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Flow from §13: stabilize → `EmergencyInterrupted` → status → choices → resume, cancel or fail.
- [ ] **Step 4: Run check, commit.** `feat(T10.3): add accident assessment, response and consequences`

### Task T10.4: Robbery and dark-alley resolution

**Files:**
- Modify: `data/encounters/crime.json`, `src/sim/events/flee.ts`, `src/sim/events/conditions.ts`, `data/dialogue/{bn,en}/encounters.json`
- Test: `tests/unit/sim/crime.test.ts`

**Interfaces:** `Condition` adds `hasEscapePath`, `witnessesMin`, `passengerTrustMin`, `meterMax`. Choices: protect passenger, call for help, attempt to leave, cooperate.

- [ ] **Step 1: Write failing tests**

```ts
it('fires only from mission, location, time and risk flags', () => { /* 5000 ordinary alley visits, chapter 1: 0 robberies */ });
it('cue precedes the event, and turning back avoids it', ...);
it('no escape path removes the leave option or makes it costly', ...);
it('cooperating reduces harm, loses cash and creates no reputation penalty', ...);
it('protecting a trusted passenger raises their trust and public reputation', ...);
it('witnesses or a report can open a later investigation flag', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Stay non-graphic.
- [ ] **Step 4: Run check, commit.** `feat(T10.4): resolve robbery encounters from position, trust and witnesses`

### Task T10.5: Live traffic, pedestrian and weather fairness

**Files:**
- Modify: `src/sim/traffic/TrafficManager.ts`, `src/sim/traffic/pedestrians.ts`, `src/sim/world/WeatherSystem.ts`, `src/sim/world/RoadEvents.ts`, `src/sim/GameSession.ts`
- Test: `tests/unit/sim/traffic.test.ts`, `tests/unit/sim/pedestrians.test.ts`, `tests/unit/sim/gameSession.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
it('10 game minutes in the live session: no agent pair overlaps > 3 s, none off-road', ...);
it('density varies by district, time and mission', ...);
it('pedestrians cross at selected points and react to a nearby accident', ...);
it('rain cuts grip and visibility and changes demand and patience', ...);
it('flooded segments reroute active trips and never leave the destination unreachable without notice', ...);
it('at most one route-blocking event per active route', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Fix what fails.** Do not rewrite systems whose tests pass.
- [ ] **Step 4: Run check and `perf.spec`, compare with the pre-task FPS, commit.** `fix(T10.5): make live traffic, pedestrians and weather fair`

---

## M4: Campaign

### Task T11.1: Missions and real finale in live play

**Files:**
- Modify: `src/sim/mission/MissionManager.ts`, `src/sim/mission/objectives.ts`, `src/sim/mission/endings.ts`, `data/endings.json`, `src/sim/GameSession.ts`, `src/ui/bindings.ts`
- Test: `tests/unit/sim/missionManager.test.ts`, `tests/unit/sim/endings.test.ts`, `tests/unit/sim/campaignChapters.test.ts`

**Interfaces:**

```ts
MissionManager.exportState(): MissionSaveState;
MissionManager.importState(s: MissionSaveState): void;
GameSession.beginFinale(): void;  // on Day 20: career choices → evaluateEnding → ending/reached
// EndingEvaluationContext gains meters: Record<MeterId, number>; keyFlags are read from story.branchFlags
```

`minute: 0` at `MissionManager.ts:90` becomes the real minute. Every mission declares recovery and cancellation; validation enforces the fields of §15.

- [ ] **Step 1: Write failing tests**

```ts
it('no ending fires before Day 20; Day 6 no longer ends the game', ...);
it('a low-cash, high-trust, safe rider reaches Trusted Local', ...);
it('Fast Money requires risky choices and carries relationship losses', ...);
it('Workshop reads char_kamal', ...);
it('cash alone never decides: same cash with different meters gives different endings', ...);
it('a mission whose objective cannot complete after a failure offers recovery', ...);
it('Endless mode has no finale', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Bind `setEndingDispatchers`. Migrate `riskScore`, `localTrust` conditions to meters.
- [ ] **Step 4: Run check, commit.** `feat(T11.1): run missions and all five endings in live play`

### Task T11.2: Campaign content pass against the spec

**Files:**
- Modify: `data/missions/ch{1..6}.json`, `data/dialogue/{bn,en}/{missions,characters,dialogue,ui}.json`, `data/world.json`, `src/ui/tutorial/FirstRideTutorial.tsx`
- Test: `tests/unit/sim/campaignChapters.test.ts`, `tests/unit/sim/firstRideMission.test.ts`, `tests/e2e/firstRide.spec.ts`

Required beats, one test per row:

| Chapter | Must exist |
|---|---|
| Opening | The 10 steps of §2, in order; first passenger is a student offering below fair; real summary |
| 1 (days 1-3) | Household payment deadline; failure recoverable |
| 2 (4-6) | High fare that loses money to congestion; several districts before evening peak |
| 3 (7-9) | Pressured-to-speed passenger; hospital or clinic emergency; disruption finale |
| 4 (10-12) | Conflicting directions; proceed, reroute, refuse or seek help; **explicit police cooperation decision**, which `m4_home_safe` lacks today |
| 5 (13-16) | Returning passengers react to flags; linked jobs with honor-or-break promises |
| 6 (17-20) | Bike vs. workshop vs. independent decision |

Also: Ma's trust responds to payments; Nabila's trust to reliability, respect and safety; Mintu's tips are sometimes wrong; Kamal offers a partnership. Fix decision 3's name. Remove "Dhaka Bike Rider" from player-facing strings.

- [ ] **Step 1: Write the table-driven failing tests** (`expect(mission('m4_police_decision').objectives).toContainChoice('cooperate')`, and so on).
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Write content;** add native-review lines to `docs/QUESTIONS.md`.
- [ ] **Step 4: Run check and `firstRide.spec`, commit.** `feat(T11.2): align campaign content with the master document`

### Task T11.3: Bots on real code, rebalance

**Files:**
- Modify: `src/sim/bot/strategies.ts` (shrink), `src/sim/GameSession.ts`, `src/config/balance.ts`, `docs/BALANCE.md`
- Test: `tests/balance/*`, new `tests/balance/parity.test.ts`

**Interfaces:** `fastForwardTrip` runs real `TripFsm`, negotiation, `settleTrip`, reputation and mission code, skipping only per-frame physics; fuel and duration come from route, traffic and weather. `runCampaign(policy, seed): CampaignResult`.

- [ ] **Step 1: Write the failing parity test**

```ts
it('fast-forward and a real autopilot ride agree within 15% on fuel, duration and net', ...);
it('strategies.ts imports no parallel fare or settlement logic', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Port the policies, then tune `balance.ts`** until §21 consequences and the T6.2 invariants pass. Add the policies `exploiter` and `briber`. Honest and safe play must stay viable; a bad day must be recoverable. Regenerate `docs/BALANCE.md` from real output, and state that earlier figures came from the old harness.
- [ ] **Step 4: Run `npm run balance` and check, commit.** `feat(T11.3): run bots on shared game code and rebalance`

### Task T11.4: Save v2 and safe resume

**Files:**
- Modify: `src/sim/save/migrations.ts`, `src/sim/save/SaveSystem.ts`, `src/sim/GameManager.ts:553-633`, `src/main.ts:248-281`
- Test: `tests/unit/save/SaveSystem.test.ts`, `tests/e2e/smoke.spec.ts`

**Interfaces:**

```ts
// SaveV2 = SaveV1 & { version: 2; ledger: Transaction[]; settledRequestIds: string[]; nextRequestSeq: number;
//   missions: MissionSaveState; meters: Record<MeterId, number>; karmaLog: KarmaEvent[]; passengerTrust: Record<string, number>;
//   unlockedDistricts: DistrictId[]; bike: {...; pose: {x,z,heading}}; trip: null | { requestId: string; resumeAs: 'cancelNoPenalty' } }
```

Rule: only `Idle` is saved as resumable. An unfinished, unsettled trip on load is cancelled without pay or penalty and explained by a toast. Autosave runs after settlement, not on the `ride/completed` listener order by chance. The ledger is trimmed to 2000 rows, with `settledRequestIds` kept whole.

- [ ] **Step 1: Write failing tests**

```ts
it('v1 save migrates: char_kamal and kamal_bhai merge, meters seeded from old values', ...);
it('reload during Completing pays exactly once', () => { saveInMidSettlement(); load(); expect(cash).toBe(expected); expect(ledgerFor(id).filter(fare)).toHaveLength(1); });
it('a mid-trip save loads to Idle with the trip cancelled and no pay', ...);
it('mission objective progress survives a reload', ...);
it('truncated JSON goes to .corrupt; the menu still works; other slots are intact', ...);
it('load restores position and RNG; request IDs do not collide', ...);
it('applySnapshot rewires listeners, with no duplicated handler', ...);
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.** Continue and Load use the live session in one code path.
- [ ] **Step 4: Run check and smoke, commit.** `feat(T11.4): add save v2 with exactly-once resume`

---

## M5: Ship

### Task T12.1: Design tokens and reusable components

**Files:**
- Create: `src/ui/components/index.tsx` (`PrimaryButton`, `SecondaryButton`, `DangerButton`, `ChoiceCard` re-export, `StatusBar`, `CharacterPortrait`, `NotificationToast`, `MapMarker`, `ModalPanel`, `TransactionRow`, `MissionObjectivePanel`, `TripSummaryPanel`), `src/ui/tokens.css`
- Modify: `index.html`, screens as touched in T12.2 and T12.3
- Test: `tests/unit/ui/accessibility.test.ts`

- [ ] **Step 1: Write failing tests:** three spec colors defined; a button without `onClick` or `prototype` fails in dev; text scaling and `reduceMotion` honoured; gamepad and keyboard focus reachable.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement,** moving repeated inline styles into tokens only where a screen is already being changed.
- [ ] **Step 4: Run check, commit.** `feat(T12.1): add spec design tokens and shared components`

### Task T12.2: HUD and phone completeness

**Files:** Modify `src/ui/hud/Hud.tsx`, `src/ui/phone/Phone.tsx`, `src/ui/phone/RequestCard.tsx`, `src/ui/trip/TripSummary.tsx`. Test: `tests/e2e/hud.spec.ts`, `tests/e2e/ride.spec.ts`.

- [ ] **Step 1: Write failing e2e:** HUD shows date and time, district, today's net, objective and fare, passenger and mood, speed, fuel, minimap, instruction, condition, ride status, camera/map/phone buttons (§16). Objective, passenger, navigation and trip status stay in sync at every `TripState`. Phone shows risks, trip history, earnings, direct bookings and chat. Every button has an effect, at 915×412 and 1280×720.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** from `RideView` and ledger. Replace the static `estimatedDuration` ETA with one computed from the remaining route.
- [ ] **Step 4: Run check and specs, commit.** `feat(T12.2): complete HUD and phone against real state`

### Task T12.3: World map

**Files:** Modify `src/ui/map/MapScreen.tsx`, `src/ui/App.tsx`, `src/ui/bindings.ts`; create `tests/unit/ui/mapScreen.test.ts`; optional asset `public/assets/map/dhaka.webp` plus calibration in `data/world.json`. Test: `tests/e2e/menus.spec.ts`.

**Interfaces:** `worldToMap(x, z, calibration): {u, v}`. Calibration is an affine transform in `world.json`, tunable by hand.

- [ ] **Step 1: Write failing tests:** all 7 districts present (not Mirpara only); player, route, pickup and drop-off pins come from live state; fuel, garage, shops, story and event markers; with no asset, the "prototype map" label is visible; with an asset, labels and legend are not covered.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** using `RoadNetwork.fromWorld` data. Waypoint dispatches `setWaypoint`.
- [ ] **Step 4: Run check and `menus.spec`, commit.** `feat(T12.3): show the whole city and live markers on the map`

### Task T12.4: World audit

**Files:** Modify `scripts/gen-district.ts`, `data/districts/*.json`, `src/render/buildings.ts`, `src/render/CityBuilder.ts`, `scripts/validate-data.mjs`. Test: `tests/unit/sim/districts.test.ts`, `tests/unit/render/cityBuilder.test.ts`.

- [ ] **Step 1: Write failing tests:** no building footprint intersects any road or sidewalk; no floating meshes (base y = 0); every segment has all §5 attributes; all pickup POIs are reachable across the whole world; a district has at least 4 distinct facades, no block over the configured footprint without detail; flyover, U-turn, alley and market all reachable from Mirpara.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Fix the generator, regenerate, and inspect screenshots of each district.** Do not add districts.
- [ ] **Step 4: Run check and `perf.spec` with before and after numbers, commit.** `fix(T12.4): keep buildings off roads and vary city blocks`

### Task T12.5: Acceptance matrix, hardware, release candidate

**Files:** Modify `docs/PLAYTEST.md`, `tests/unit/qa/testMatrix.test.ts`, `README.md`, `package.json` (`2.1.0`), `index.html`, `docs/QUESTIONS.md`; remove `@deprecated` ride forms.

- [ ] **Step 1: Rewrite the matrix against spec §21.** One row per acceptance line, naming a test that really exercises `GameSession` or the browser. `testMatrix.test.ts` fails if a named test file is missing.
- [ ] **Step 2: Run all gates on both projects.** `npm run check && npm run balance && npx playwright test`. Expected: all pass, or each failure listed with output.
- [ ] **Step 3: Test on Android.** Run `adb devices -l`; when a device is attached, use ARTEMIS to drive one ride on the lowest target phone and record FPS, memory and load times. If several are connected, ask which. If none is, add a human checklist to `docs/PLAYTEST.md` and say this was not run.
- [ ] **Step 4: Write the report in `docs/progress/afnan.md`:** real results and remaining placeholders (§21). Add a "ready to deploy, awaiting approval" line to `docs/QUESTIONS.md`; do not deploy.
- [ ] **Step 5: Commit and tag per T6.4.** `feat(T12.5): verify master document acceptance and prepare v2.1.0`

---

## Deferred (spec §19 and YAGNI)

Multiplayer, more cities or districts, advanced criminal AI, full-city traffic simulation, voice acting, licensing and deep customization. Existing delivery jobs, extra bikes, cosmetics and side missions stay, but get no new work unless a bug blocks a task above.

## Needs a human

- The Dhaka map asset (T12.3 runs without it, labelled prototype).
- Sign-off at Gate M1, Android playtests, native Bangla review, trademark search, public deployment.
