# Architectural and Design Decisions

Format: `YYYY-MM-DD <member> <Tx.y>: <decision> — <reason>`

2026-11-02 afnan T7.1: `docs/MASTER.md` supersedes `docs/GDD.md` wherever they differ — Afnan supplied the master document as the new source of truth after v2.0.0 was found unwired and softlocking on boot.
2026-11-02 afnan T7.1: Stay on Three.js/Rapier/Preact; no engine migration — spec §17 forbids migrating just because Unity is mentioned.
2026-11-02 afnan T7.1: Districts stay fictional (Mirpara, Fulgate, Dhanbagh, ...); fixed `world.json`'s Fulgate Bangla name from "ফার্মগেট" to "ফুলগেট" and Mintu's matching line — the spec's district table gives inspiration, not real names.
2026-11-02 afnan T7.1: Game title stays "Uthao"; "Dhaka Bike Rider" leaves player-facing text — trademark clearance stays a human task in `docs/QUESTIONS.md`.
2026-11-02 afnan T7.1: Task IDs for the Master Document update show identity, not order (M2 uses T13.x, not T9.x, since T9.n is reserved for maintenance fixes); the order lives in `DEV_AFNAN.md`.
2026-11-02 afnan T7.1: Afnan owns the entire Master Document update (T7.1-T12.5) for now; nothing is assigned to Tafsirul, and `DEV_TAFSIRUL.md` is not touched.
2026-10-30 tafsirul T5.7: Dialogue line pools and stereotype review — implemented structured per-archetype line pools (>= 15 lines per archetype across all 7 phases: greeting, offer, counter, accept, reject, small talk, drop-off) and flag-conditioned lines for recurring characters.

### T5.7 Stereotype Review Checklist
- [x] **Neighbourhood dignity:** No dialogue line mocks or demeans any Dhaka district or neighbourhood (Mirpara, Puran Para, Motinagar, Gulbari, Uttarganj, Farmbagh). Neighbourhood pride, atmospheric realism, and local road knowledge are highlighted respectfully.
- [x] **Social class & profession:** No line patronises or mocks working-class commuters, rickshaw pullers, students, tea stall operators, market vendors, or corporate riders. Bargainers are depicted as shrewd, hardworking budget managers rather than miserly or deceitful caricatures.
- [x] **Religious sensitivity:** Traditional greetings ("Assalamu Alaikum", blessings upon departure) are treated with complete cultural reverence and dignity. No religious identity, belief, or practice is used as the butt of humour.
- [x] **Gender representation & safety:** Women passengers (e.g. Mrs. Ferdousi, student Nabila) are portrayed with full agency, respect, and dignity. Safety precautions and steady driving preferences are validated as essential, responsible riding standards rather than irrational anxiety.
- [x] **Humour authenticity:** Humour arises organically from recognizable Dhaka everyday situations: chaotic traffic jams, sudden monsoons, spirited tea stall debates, cricket nail-biters, and over-complicated GPS navigation cuts.
2026-11-02 afnan T7.3: Stopped git-tracking `tests/e2e/__screenshots__/*.png` and gitignored the directory — these are raw `page.screenshot()` debug captures for manual inspection, not `toHaveScreenshot` baselines, and their bytes differ non-deterministically every e2e run, which kept aborting `finish-task.sh`'s branch checkout on an uncommitted diff.
2026-11-02 afnan T8.1: Negotiation moves before pickup (spec §6 order) and `TripFsm` is the only authority for ride state — this reverses the old arrive-then-negotiate flow, a contract break under `AGENT_WORKFLOW.md` §5; `passengerFsm.ts`, `RideManager.completeNegotiation` and `RideRequest.status` stay as `@deprecated` forms (status kept in sync via `legacyStatusOf`) until T12.5 removes them.
2026-11-09 afnan/T9.21 H-9: decision — the career choice is paid before the ending is judged, so careerSavings records savings before paying, and the bike/workshop endings use it. Reason: bike ending (15k) and workshop ending (25k) were unreachable after paying.
2026-11-09 afnan/T9.21 money attribution: decision — positive encounter fare/tip money posts as kind 'event': it adds cash but not dailyRevenue. Reason: HUD showed it as trip earnings.
2026-11-09 afnan/T9.21 friend package: decision — relabelled as a favour paid 120 (no delivery mechanic exists yet). Reason: label promised a delivery that never happens.
2026-11-09 afnan/T9.21 tips: decision — tip roll from computeTipChance(rating), seeded by request, size 10% of fare clamped 10-40. No bonus rule is defined in the spec, so bonus stays 0.
2026-11-09 afnan/T9.21 disputes: decision — a disputed ride settles 50% of its fare (BALANCE.DISPUTE.fareKept). Reason: dispute only changed the label.
2026-11-09 afnan/T9.21 survive: decision — survive objective takes optional choiceIds; ch4 counts drive and walk, not cancel.
2026-11-09 afnan/T9.18 H-3: decision — steering is clamped to the grip budget (1.2x slide allowance) instead of bleeding speed; steering alone no longer crashes. Spec: PLAYTEST "steering friction clamps". Reason: full lock at 40 km/h dropped to ~21 km/h.
2026-11-09 afnan/T9.18 H-8/H-5: decision — a bike wedged 2 s (near stop, throttle held or just crashed, not during a breakdown stall) is recovered to the nearest road point. No reverse gear added; recovery is the escape. Reason: bike could not move, reverse or recover.
2026-11-09 afnan/T9.18 wet braking: decision — wet/dry stop ratio set to ~1.36 (old100) and ~1.39 (used125), inside PLAYTEST's 30-40% band. Reason: was 1.43 and 1.42.
2026-11-09 afnan/T9.18 coast: decision — 0.6 m/s^2 coast-down when throttle released and no brake. Reason: speed never decayed.
2026-11-09 afnan/T9.26 colorblind: decision — the palette setting was never in the UI and is removed; the high-contrast toggle is labelled "(minimap only)" because that is all it changes. Reason: audit said the setting changed one colour and nothing else.
2026-11-09 afnan/T9.26 reduce motion: decision — reduce motion holds the speed FOV kick at 60; there is no camera shake to disable, so the label no longer promises one.
2026-11-09 afnan/T9.26 deferred: text scaling beyond the subtitle, hotkeys ignoring bindings (g, j are not bindable), gamepad A with no focus, overlay focus targets, and the first-ride banner counting as a modal are NOT done in this pass.
2026-11-09 afnan/T9.28 gamepad A: decision — with nothing focused, A focuses the first control and the next A activates it. Reason: already the designed behaviour; the audit item is answered by keeping it.
2026-11-09 afnan/T9.28 text scaling: decision — the only size setting is the subtitle size, and it is labelled as such. No global text scale is added. Reason: the UI uses fixed pixel sizes, so a global scale would need a full layout pass.
2026-11-09 afnan/T9.28 reverse: decision — holding the brake while stopped (no throttle) backs the bike up at up to 1.5 m/s; releasing the brake brings it to rest. Reason: a wedged bike could not reverse (H-8).
2026-11-09 afnan/T9.28 hotkeys: decision — game hotkeys match by key code from the bindings config, and garage (G), journal (J) and mute (N) are now bindable. Touch and gamepad buttons send codes too.
