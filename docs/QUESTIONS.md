# Open Questions and Notes for Human / Other Member

Use `@tafsirul:` or `@afnan:` prefixes for agent-to-agent notes.

- [x] `data/dialogue/bn/ui.json` needs native review for natural colloquial Dhaka idiom. (resolved in P7.2: unified fictional district names, fixed 18% wet grip copy, eliminated all hardcoded UI strings across `src/ui/**/*.tsx`, and reviewed Dhaka idiom)
- [x] @tafsirul: `data/dialogue/bn/characters.json` needs native review for natural colloquial Dhaka idiom (10 character bios, names, and roles). (resolved in P7.2: unified Tanvir bio to fictional `মতিনগর ও গুলবাড়ির` matching `Motinagar and Gulbari` and verified character idiom)
- [x] @tafsirul: `data/dialogue/bn/encounters.json` needs native review for natural colloquial Dhaka idiom (13 signature encounters and choice options). (resolved in P7.2: verified encounter lines and choice idioms)
- [ ] @tafsirul: **v1.0.0 Release ready to deploy**: `npm run build` static bundle generated cleanly in `dist/`. All 10 v1.0 checklist items verified in `docs/progress/tafsirul.md`. Waiting for human approval before first public deployment.

## T6.3 Native-Speaker Review Checklist for Bangla Localisation
Please have a native speaker review the following files for natural colloquial Dhaka idiom, street authenticity, and tone:
- [x] `data/dialogue/bn/dialogue.json`: 525 per-archetype bargaining and riding dialogue lines. (resolved in P7.2: unified `ফুলগেট বাজারে` and reviewed colloquial lines)
- [x] `data/dialogue/bn/characters.json`: 10 character profiles, backstories, and roles. (resolved in P7.2)
- [x] `data/dialogue/bn/missions.json`: Campaign chapters 1-6 and 8 side missions titles and objectives. (resolved in P7.2: unified `ফুলগেট বাজার` and verified mission objective copy)
- [x] `data/dialogue/bn/encounters.json`: 13 signature encounter events, options, and outcomes. (resolved in P7.2)
- [x] `data/dialogue/bn/ui.json`: HUD, menus, garage, settings, and phone UI strings. (resolved in P7.2)
## T6.4 Trademark Search & Branding Clearance Note (Human Task)
- [ ] **Title & Trademark Clearance (GDD §2)**: The provisional title is **"Dhaka Bike Rider: Meter Chole Na"** (in-game short title / app slug: **"Uthao"**).
  - **Trademark search is a human task**: Before commercial release or publishing on app stores (Google Play, iOS App Store, Steam), human project leads must perform a trademark and trade name clearance search in relevant jurisdictions (notably Bangladesh Department of Patents, Designs and Trademarks - DPDT, and international app store registries) to ensure no conflict with existing ride-hailing brands (e.g. *Pathao*, *Uber*, etc.).
  - **Fallback / Alternative Titles**: If clearance issues arise, consider alternative titles such as *"Dhaka Rider"*, *"Meter Chole Na"*, or *"Cholo Dhaka"*.
- [x] **Legal, Privacy, Third-Party Licenses, OpenGraph & Static CDN Headers (P8.3)**: Root `LICENSE` (MIT), `PRIVACY.md` (zero-tracking 100% client-side `localStorage` policy), `THIRD_PARTY_LICENSES.md` (Three.js MIT, Preact MIT, `@preact/signals` MIT, Zod MIT, Hind Siliguri SIL OFL 1.1, Kenney CC0 1.0 Universal), `public/og-cover.webp` (`1200×630` Dhaka golden-hour viral link preview), `public/_headers` (CSP + `nosniff` + `strict-origin-when-cross-origin` + immutable `/assets/*` & `/fonts/*` caching), `public/robots.txt`, and truthful `MainMenu` Credits are in place and verified by `scripts/verify-prod-bundle.mjs`.
- [ ] **Production Deployment Approval (v2.0.0)**: Production build `dist/` is verified and ready. Awaiting human confirmation before public CDN / domain deployment.
## T7.4 Career-choice flag unwired to the live ending path (self-tracked, not blocking)
- [x] (closed by P5.1: `career_choice` and `career_choice_savings` are wired to the live Day 20 ending evaluation in `src/sim/mission/endings.ts` / `MissionManager.ts`) `career_choice` (set by `selectCareerChoice`, read by `evaluateEnding()`) is only ever reached via the bot/balancing harness (`src/sim/bot/strategies.ts`); the live ending flow (`MissionManager.checkEnding()` / `data/endings.json`) never references it. T11.1/T11.2 (missions and campaign content pass) must either wire the live path to consume it or the `career-choice-prototype-notice` added in T7.4 stays as the honest label.
## T7.5 MissionManager.applyEffects fallback writes characterRelationships directly (self-tracked, not blocking)
- [x] (closed by P4.3: `ReputationSystem` is now the single writer for `characterRelationships`, meters, `karmaLog`, `passengerTrust`, and `promises`; `MissionManager.applyEffects` fallback emits `'reputation/changed'` and `GameManager` delegates seeding/snapshot/reset to `ReputationSystem`) `MissionManager`'s private `applyEffects` fallback (used only when `getEffectContext` is omitted, exercised only by `missionManager.test.ts`/`firstRideMission.test.ts`/`campaignChapters.test.ts`) still writes `story.characterRelationships` directly and emits its own `reputation/changed`, contradicting "ReputationSystem is the only writer." Dead in production (`GameManager` always supplies `getEffectContext`) and doesn't currently double-count since those tests don't attach a live `ReputationSystem` to the bus. Worth removing or routing through `ReputationSystem` before `MissionManager` is ever wired standalone with a live reputation system.
## T8.1 Bangla objective strings need native review
- [x] `data/dialogue/bn/hud.json`: the ten new `objective.*` strings (idle, ride available, negotiate, go to pickup, drop off, completing, emergency, no-show, cancelled, failed) are first-draft Bangla; a native speaker should check tone and idiom. (resolved in P7.2)
## T9.1 Kerb collider trim is symmetric (self-tracked for T12.4 world audit)
- [ ] `kerbEndTrim` (src/render/CityBuilder.ts) trims both kerbs of a road by the same amount at a junction, so at T-junctions the through-road's far-side kerb and at L-corners the outer kerbs also open up (about 4-5 m). The bike could leave the road there where no building seals the gap. Proper fix: trim only the side facing the joining road. Also: roadMesh.ts visual kerbs still cross junctions (cosmetic mismatch with collision), and the unit test only asserts trim values, not built collider geometry.
## T9.2 Negotiation not enabled in real play (tracked, owner T8.5)
- [x] (closed by T8.5) `rideManager.enableNegotiation` is only ever set by the debug helper `spawnBargainer`; in real play accepted offers still auto-agree and the negotiation panel never opens. The `negotiation/started` listener in src/main.ts also hardcodes a bargainer profile with seed 123 regardless of the passenger. T8.5 ("Negotiation with the real passenger") must remove both.

## T8.5 Bangla negotiation lines need native review
- [x] `data/dialogue/bn/ui.json` (`tutorial.nabila.counter_100`, `counter_90`, `accept_80`, `decline_example`): the four MASTER section 6 sample lines, copied verbatim into the first-ride negotiation. A native speaker should confirm they read naturally for a rider speaking to a student. (resolved in P7.2)
- [x] `data/dialogue/bn/negotiation.json`: new panel strings (`negotiation.mood`, `route`, `relocate`, `your_quote`, `custom_counter`, and the reworded `negotiation.decline`) are first-draft Bangla. (resolved in P7.2)

## Gate M1 sign-off (blocks M2)
- [ ] GATE-M1 signed off by Afnan: play the build on PC and on an Android phone. Can a new player accept, negotiate, ride, handle an encounter, drop off and see the summary unaided, and is it enjoyable? Protocol in `docs/PLAYTEST.md`. Do not start T13.x until this is ticked.

## T8.6 open items (from review)
- [ ] A disputed ride is recorded in the receipt (`trip.consequence.disputed`), but the ride outcome is cleared on settle, so the passenger status view never shows `Disputed`. Fix before M2, or after GATE-M1.
- [ ] Off-app non-payment and disputes have no money or reputation effect beyond the ledger row and the receipt consequence. Price them in T11.3.
## T9.6 Passenger name transliterations need native review
- [x] `data/dialogue/bn/passengers.json`: 54 random-passenger names (Bangla script) were transliterated for T9.6. A native speaker should check spelling and nicknames such as Kajol Viper, Rubel Black, Bappi Don. (resolved in P7.2)
- [x] @afnan: T9.21 bn `encounter.friend_package.choice.accept` (data/dialogue/bn/encounters.json) is first-draft Bangla; native review needed. (resolved in P7.2)
- [x] @afnan: T9.21 bn `career_choice_prototype_notice` (data/dialogue/bn/endings.json) is first-draft Bangla; native review needed. (resolved in P7.2)
- [x] @afnan: T9.16 bn strings for menu.new_career_confirm* are first-draft Bangla; native review needed. (resolved in P7.2)
- [x] @afnan: T9.26 bn `settings.reduce_motion` and `settings.colorblind_route` (data/dialogue/bn/ui.json) are first-draft Bangla; native review needed. (resolved in P7.2: verified `settings.reduce_motion`, `settings.colorblind_route`, and `settings.high_contrast` in `data/dialogue/bn/ui.json`)
