# Open Questions and Notes for Human / Other Member

Use `@tafsirul:` or `@afnan:` prefixes for agent-to-agent notes.

- [ ] `data/dialogue/bn/ui.json` needs native review for natural colloquial Dhaka idiom.
- [ ] @tafsirul: `data/dialogue/bn/characters.json` needs native review for natural colloquial Dhaka idiom (10 character bios, names, and roles).
- [ ] @tafsirul: `data/dialogue/bn/encounters.json` needs native review for natural colloquial Dhaka idiom (13 signature encounters and choice options).
- [ ] @tafsirul: **v1.0.0 Release ready to deploy**: `npm run build` static bundle generated cleanly in `dist/`. All 10 v1.0 checklist items verified in `docs/progress/tafsirul.md`. Waiting for human approval before first public deployment.

## T6.3 Native-Speaker Review Checklist for Bangla Localisation
Please have a native speaker review the following files for natural colloquial Dhaka idiom, street authenticity, and tone:
- [ ] `data/dialogue/bn/dialogue.json`: 525 per-archetype bargaining and riding dialogue lines.
- [ ] `data/dialogue/bn/characters.json`: 10 character profiles, backstories, and roles.
- [ ] `data/dialogue/bn/missions.json`: Campaign chapters 1-6 and 8 side missions titles and objectives.
- [ ] `data/dialogue/bn/encounters.json`: 13 signature encounter events, options, and outcomes.
- [ ] `data/dialogue/bn/ui.json`: HUD, menus, garage, settings, and phone UI strings.
## T6.4 Trademark Search & Branding Clearance Note (Human Task)
- [ ] **Title & Trademark Clearance (GDD §2)**: The provisional title is **"Dhaka Bike Rider: Meter Chole Na"** (in-game short title / app slug: **"Uthao"**).
  - **Trademark search is a human task**: Before commercial release or publishing on app stores (Google Play, iOS App Store, Steam), human project leads must perform a trademark and trade name clearance search in relevant jurisdictions (notably Bangladesh Department of Patents, Designs and Trademarks - DPDT, and international app store registries) to ensure no conflict with existing ride-hailing brands (e.g. *Pathao*, *Uber*, etc.).
  - **Fallback / Alternative Titles**: If clearance issues arise, consider alternative titles such as *"Dhaka Rider"*, *"Meter Chole Na"*, or *"Cholo Dhaka"*.
- [ ] **Production Deployment Approval (v2.0.0)**: Production build `dist/` is verified and ready. Awaiting human confirmation before public CDN / domain deployment.
## T7.4 Career-choice flag unwired to the live ending path (self-tracked, not blocking)
- [ ] `career_choice` (set by `selectCareerChoice`, read by `evaluateEnding()`) is only ever reached via the bot/balancing harness (`src/sim/bot/strategies.ts`); the live ending flow (`MissionManager.checkEnding()` / `data/endings.json`) never references it. T11.1/T11.2 (missions and campaign content pass) must either wire the live path to consume it or the `career-choice-prototype-notice` added in T7.4 stays as the honest label.
## T7.5 MissionManager.applyEffects fallback writes characterRelationships directly (self-tracked, not blocking)
- [ ] `MissionManager`'s private `applyEffects` fallback (used only when `getEffectContext` is omitted, exercised only by `missionManager.test.ts`/`firstRideMission.test.ts`/`campaignChapters.test.ts`) still writes `story.characterRelationships` directly and emits its own `reputation/changed`, contradicting "ReputationSystem is the only writer." Dead in production (`GameManager` always supplies `getEffectContext`) and doesn't currently double-count since those tests don't attach a live `ReputationSystem` to the bus. Worth removing or routing through `ReputationSystem` before `MissionManager` is ever wired standalone with a live reputation system.
## T8.1 Bangla objective strings need native review
- [ ] `data/dialogue/bn/hud.json`: the ten new `objective.*` strings (idle, ride available, negotiate, go to pickup, drop off, completing, emergency, no-show, cancelled, failed) are first-draft Bangla; a native speaker should check tone and idiom.
## T9.1 Kerb collider trim is symmetric (self-tracked for T12.4 world audit)
- [ ] `kerbEndTrim` (src/render/CityBuilder.ts) trims both kerbs of a road by the same amount at a junction, so at T-junctions the through-road's far-side kerb and at L-corners the outer kerbs also open up (about 4-5 m). The bike could leave the road there where no building seals the gap. Proper fix: trim only the side facing the joining road. Also: roadMesh.ts visual kerbs still cross junctions (cosmetic mismatch with collision), and the unit test only asserts trim values, not built collider geometry.
## T9.2 Negotiation not enabled in real play (tracked, owner T8.5)
- [x] (closed by T8.5) `rideManager.enableNegotiation` is only ever set by the debug helper `spawnBargainer`; in real play accepted offers still auto-agree and the negotiation panel never opens. The `negotiation/started` listener in src/main.ts also hardcodes a bargainer profile with seed 123 regardless of the passenger. T8.5 ("Negotiation with the real passenger") must remove both.

## T8.5 Bangla negotiation lines need native review
- [ ] `data/dialogue/bn/ui.json` (`tutorial.nabila.counter_100`, `counter_90`, `accept_80`, `decline_example`): the four MASTER section 6 sample lines, copied verbatim into the first-ride negotiation. A native speaker should confirm they read naturally for a rider speaking to a student.
- [ ] `data/dialogue/bn/negotiation.json`: new panel strings (`negotiation.mood`, `route`, `relocate`, `your_quote`, `custom_counter`, and the reworded `negotiation.decline`) are first-draft Bangla.

## Gate M1 sign-off (blocks M2)
- [ ] GATE-M1 signed off by Afnan: play the build on PC and on an Android phone. Can a new player accept, negotiate, ride, handle an encounter, drop off and see the summary unaided, and is it enjoyable? Protocol in `docs/PLAYTEST.md`. Do not start T13.x until this is ticked.

## T8.6 open items (from review)
- [ ] A disputed ride is recorded in the receipt (`trip.consequence.disputed`), but the ride outcome is cleared on settle, so the passenger status view never shows `Disputed`. Fix before M2, or after GATE-M1.
- [ ] Off-app non-payment and disputes have no money or reputation effect beyond the ledger row and the receipt consequence. Price them in T11.3.
