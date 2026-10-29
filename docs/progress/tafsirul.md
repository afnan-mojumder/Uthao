# Progress: Tafsirul Shuvo

One line per finished task: `YYYY-MM-DD Tx.y done — note`

2026-10-26 T1.4 done — InputManager created with keyboard/gamepad/touch/tilt and 0.15s analog steering smoothing
2026-10-26 T3.1 done — Asset pipeline and procedural models (CNG, rickshaw, bus, tea stall, canopy, garage, footbridge, tanks, wires, signs) with CC0 manifest
2026-10-26 T0.4 done — App shell with WebGL2 capability check, Preact UI mounting, i18n fallback, pause/hidden/context-lost lifecycle listeners, and Rotate/Unsupported overlays
2026-10-26 T3.9 done — AudioManager implemented with WebAudio/THREE.AudioListener, engine pitch scaling, horn, clicks, cash register, and city/rain ambient audio
2026-10-29 T2.4 done — NegotiationPanel and Phone UI implemented with bilingual dialogues, reactive signals store, and Playwright e2e verification
2026-10-29 T2.8 done — Rider HUD v1 (speed, fuel gauge, earnings, rating, shift clock, navigation instructions, passenger status, first-person collapsed mode) and 2D canvas Minimap with route polyline and orientation
2026-10-29 T4.1 done — Day lifecycle & living expenses (07:00 home start, endShift >= 12:00, forced 23:00, commute fuel/teleport, food/data/rent/family living expenses, rent debt/eviction warning flags, battery drainage & charging, DayEnd modal, recovery advances)
2026-10-29 T4.4 done — Bike upgrades, repairs & garage screen (data/upgrades.json, condition bars, Kamal bhai 20% discount, mechanical effects, cosmetics, Garage.tsx with tab switching, unit tests, and Playwright e2e)
2026-10-29 T3.10 done — Menus, settings, pause and Dhaka map screen (MainMenu, Settings with general/audio/controls, Pause screen, MapScreen with 2D canvas/POIs/zoom/waypoint setting, unit tests, and Playwright e2e)
2026-10-29 T3.7 done — Vertical-slice encounters (enc_market_detour, enc_uturn_problem, enc_alley_enter, enc_puncture, enc_no_change with full conditional choice evaluation, bilingual key parity, and 20 vitest suite)
2026-10-30 T3.8 done — Opening sequence "First Ride" (07:00 alarm, Ma's Day 3 rent reminder, ৳600 wallet check, 1.2L fuel bike start, Mintu tea stall advice, Nabila verbatim negotiation, campus gate ride, receipt breakdown, FirstRideTutorial.tsx, unit tests, and Playwright e2e)
2026-10-30 T4.3 done — Recurring passengers & direct bookings (10 characters in data/characters.json with fixed traits/home/preferred times, threshold relationship >= 15 unlock, 0% commission direct bookings, Contacts.tsx app in phone, unit tests, and Playwright e2e)
2026-10-30 T4.5 done — Remaining signature situations (13 encounters in data/encounters/{route,pickup,payment,passenger}.json, 7.4 off-app, 7.5 rain, extra stop, Mrs. Ferdousi, late for exam, wrong pin, vendor discount, lost phone, SI Morshed checkpoint, bus block, direct call, urgent parcel, wait for errand, bilingual dialogues, and table-driven JSON tests)
2026-10-30 T4.8 done — Identity tendencies (GDD §3 4 tendencies computed as 0-100 scores from metrics: professional, negotiator, hustler, regular; journal UI integration; bot simulation tests for reckless -> hustler and smartPro -> professional)
2026-10-30 T4.9 done — SaveSystem (serialize/deserialize SaveV1 with full snapshot equality, 3 manual slots + auto, localStorage adapter with memory fallback, corrupt JSON backup to .corrupt, SaveSlots.tsx UI modal, autosave on trip complete, day end, and hidden visibilitychange e2e)
2026-10-30 T4.10 done — Mobile HUD polish and v1.0 release (safe-area insets, font sizes >= 14px, choice card thumb clearance, fullscreen and landscape lock, static build verification, and GDD §16 checklist verified)
2026-10-30 T5.6 done — Additional motorcycles (data/bikes.json with old100, used125, new150, trade-in value calculations, Kamal Bhai trust discount, BikeSpec updates in physics and fuel models, daily insurance for new150, procedural 3D model variants, engine sound pitch scaling, Garage Dealership tab, unit tests)
2026-10-30 T5.8 done — Deliveries (DeliveryManager, shop POI pickups, address drop-offs, time windows, fragile parcel damage on collision bumps, luggage carrier 1->3 capacity expansion, EconomyManager payouts, unit tests)

## v1.0 Release Checklist (GDD § 16)
- [x] **One playable protagonist and motorcycle (T1):** `tests/unit/physics/MotorcycleController.test.ts` ("driving into wall at 30 km/h emits crash"), `tests/unit/physics/bikeModel.test.ts`
- [x] **One compact Dhaka-inspired neighborhood (T3.2):** `tests/unit/render/cityBuilder.test.ts` ("CityBuilder Orchestrator > builds full district, populates colliders, and generates static physics boxes")
- [x] **Basic traffic, pedestrians, and collisions (T2.7/T3.4):** `tests/unit/sim/traffic.test.ts` ("Traffic Simulation > advances vehicles along lane vectors"), `tests/unit/sim/pedestrians.test.ts` ("Pedestrian simulation > crosses at designated points and yields to vehicles")
- [x] **Five passenger archetypes (T2.2):** `tests/unit/sim/PassengerAI.test.ts` ("PassengerAI Archetypes > assigns valid traits and patience per archetype"), `tests/unit/sim/passengerFsm.test.ts`
- [x] **Fare negotiation and pickup adjustments (T2.3/T2.5):** `tests/unit/sim/NegotiationSystem.test.ts` ("NegotiationSystem > counter-offer within budget succeeds"), `tests/unit/sim/pickupAndReroute.test.ts` ("Pickup and Reroute > adjusts pickup location dynamically")
- [x] **Fuel, earnings, expenses, and repairs (T2.6/T4.1/T4.4):** `tests/unit/sim/economy.test.ts` ("EconomyManager > tracks fuel consumption and fares"), `tests/unit/sim/dayLifecycle.test.ts` ("DayLifecycle > deducts daily living costs and rent"), `tests/unit/sim/garage.test.ts` ("GarageSystem > applies repairs and upgrade condition boosts")
- [x] **U-turn, narrow alley, and off-app scenarios (T3.7/T4.5):** `tests/unit/sim/verticalSliceEncounters.test.ts` ("Vertical Slice Encounters > evaluates enc_uturn_problem and enc_alley_enter"), `tests/unit/sim/signatureEncounters.test.ts` ("Signature Encounters > evaluates enc_offapp_counter and enc_wrong_pin")
- [x] **One robbery or suspicious-pickup event (T4.6):** `tests/unit/sim/crime.test.ts` ("Crime & Suspicious Scenarios > evaluates police checkpoint and suspicious night pickup evasion")
- [x] **Five story missions and one ending (T4.7):** `tests/unit/sim/missionManager.test.ts` ("MissionManager > runs Ch1 story missions sequentially"), `tests/unit/sim/endings.test.ts` ("Endings Evaluation > triggers distinct endings based on player career metrics")
- [x] **Save/load and a functional mobile HUD (T4.9/T4.10):** `tests/unit/save/SaveSystem.test.ts` ("SaveSystem > round-trip save and load preserves full state"), `tests/unit/ui/hud.test.ts` ("T2.8 & T4.10 Rider HUD and Mobile Polish > applies safe-area insets to standard HudView and ChoiceCard satisfies constraints"), `tests/e2e/boot.spec.ts`

## 2026-10-29 T5.7 Richer dialogue
- Implemented 548 dialogue entries: 525 per-archetype lines across 5 archetypes and 7 phases (greeting, offer, counter, accept, reject, small talk, drop-off) in both bn and en (>= 15 lines per pool).
- Added flag-conditioned lines for recurring characters (Tanvir, Mintu, Rahim chacha, Mrs. Ferdousi, Kamal bhai, Nabila, Jamil, SI Morshed, Bablu).
- Implemented DialogueManager and wired into NegotiationSystem and RideManager for long-ride small talk (cricket, exams, jam, rain, family) and drop-off.
- Added dialogue subtitle floating bubble to HUD.
- Executed stereotype review checklist in docs/DECISIONS.md.
- Added test suite tests/unit/sim/dialogue.test.ts (7 tests passed, 340 total tests green).

## 2026-10-29 T5.4 Campaign chapters 2-6, side missions, Endless mode
- Implemented full campaign chapters 2 through 6 in data/missions/ch2.json ... ch6.json with sequential unlock progression.
- Created 8 side missions in data/missions/side.json.
- Implemented Endless Ride mode with all 8 districts unlocked and no mandatory missions.
- Implemented progressive district unlocking by chapter in MissionManager.getUnlockedDistricts().
- Added full bilingual title and description strings in data/dialogue/{bn,en}/missions.json.
- Added unit tests in tests/unit/sim/campaignChapters.test.ts (4 tests passed, 344 total tests green).

## 2026-10-29 T6.3 Accessibility and localisation
- Added accessibility options in GameSettings and Settings UI: reduceMotion, autoCruise (hold-to-accelerate alternative for mobile), and high-contrast colorblind route.
- Implemented large subtitles scaling in HUD speech bubble.
- Added ARIA labels and full keyboard/gamepad navigation support.
- Logged Native-Speaker Review Checklist in docs/QUESTIONS.md.
- Added unit tests in tests/unit/ui/accessibility.test.ts (4 tests passed, 348 total tests green).
