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
