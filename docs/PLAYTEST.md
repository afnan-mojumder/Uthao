# Dhaka Bike Rider (Uthao) — Quality Assurance & Playtest Matrix

> **Reference: `docs/MASTER.md` §21 (Acceptance Tests) & GDD §17 (Testing and Balancing)**  
> This document maps every acceptance criterion in `docs/MASTER.md` §21 and every design verification question in GDD §17 to live automated `GameSession`/unit/balance tests, Playwright browser E2E specs (including pure-player `vite preview` tests against built `dist/`), and manual hardware playtest protocols.

---

## 0. `docs/MASTER.md` §21 Acceptance Test Matrix

### §21.1 Driving and World

| `docs/MASTER.md` §21 Criterion | Automated Unit / `GameSession` / Balance Specs | Automated Browser E2E Specs | Verification Summary |
|---|---|---|---|
| **Player visibly rides a motorcycle.** | `tests/unit/render/renderer.test.ts`<br>`tests/unit/render/cameraLeanRoll.test.ts` | `tests/e2e/smoke.spec.ts`<br>`tests/e2e/menus.spec.ts` | `MotorcycleMesh` renders player rider + bike in 3D scene; manual `KeyW` driving moves bike and updates live speedometer on built `dist/`. |
| **Camera shows the road and avoids clipping through buildings.** | `tests/unit/render/cameraShake.test.ts`<br>`tests/unit/render/cameraReduceMotion.test.ts` | `tests/e2e/smoke.spec.ts`<br>`tests/e2e/perf.spec.ts`<br>`tests/e2e/input.spec.ts` | `CameraRig` raycasts against `PhysicsWorld` static building/wall colliders (`isCameraClipping() === false`) and toggles cleanly between chase and first-person views (`KeyC`). |
| **Roads connect and support turns, U-turns, and alleys.** | `tests/unit/sim/road.test.ts`<br>`tests/unit/sim/navigation.test.ts`<br>`tests/unit/sim/districts.test.ts` | `tests/e2e/panels.spec.ts` | All 7 Dhaka districts and world connectors form a single connected graph supporting turns, divided-road U-turn nodes, and narrow alleys. |
| **Buildings do not block roads or pedestrian paths.** | `tests/unit/sim/districts.test.ts`<br>`tests/unit/sim/districtGenerator.test.ts`<br>`tests/unit/render/cityBuilder.test.ts` | `tests/e2e/smoke.spec.ts` | `validate-data.mjs` and `districts.test.ts` enforce zero OBB overlap between building lots and road/sidewalk corridors across all 7 districts. |
| **Traffic follows roads without persistent overlap.** | `tests/unit/sim/traffic.test.ts`<br>`tests/unit/sim/trafficAwareness.test.ts`<br>`tests/unit/sim/trafficContactOnce.test.ts` | `tests/e2e/perf.spec.ts` | `TrafficManager` IDM longitudinal spacing, intersection right-of-way, and anti-deadlock resolvers maintain zero off-road spawns and `< 1.5s` overlap in 600s rush-hour simulation. |
| **Pedestrians use sidewalks and react to vehicles.** | `tests/unit/sim/pedestrians.test.ts`<br>`tests/unit/sim/trafficEvents.test.ts` | `tests/e2e/ride.spec.ts` | `PedestrianManager` keeps pedestrians on sidewalks/crossings and triggers step-back / scatter reactions to approaching vehicles and horns. |
| **Collisions and wet-road behavior are understandable.** | `tests/unit/physics/MotorcycleController.test.ts`<br>`tests/unit/physics/bikeModel.test.ts`<br>`tests/unit/sim/timeAndWeather.test.ts` | `tests/e2e/smoke.spec.ts` | Glancing bumps cause recoverable wobble + impact banner; high-speed collisions trigger crash handling; wet roads reduce lateral grip and extend braking distance predictably. |

### §21.2 Ride Lifecycle

| `docs/MASTER.md` §21 Criterion | Automated Unit / `GameSession` / Balance Specs | Automated Browser E2E Specs | Verification Summary |
|---|---|---|---|
| **Requests can be accepted, negotiated, declined, or cancelled.** | `tests/unit/sim/RideManager.test.ts`<br>`tests/unit/sim/NegotiationSystem.test.ts`<br>`tests/unit/sim/tripFsm.test.ts` | `tests/e2e/negotiation.spec.ts`<br>`tests/e2e/firstRide.spec.ts` | Authoritative `TripFsm` validates transitions across `Offered -> Negotiating -> Accepted` as well as `Declined` and `Cancelled`. |
| **Pickup and destination are reachable through the road network.** | `tests/unit/sim/RequestGenerator.test.ts`<br>`tests/unit/sim/navigation.test.ts`<br>`tests/unit/sim/gameSession.test.ts` | `tests/e2e/ride.spec.ts`<br>`tests/e2e/prototype.spec.ts` | `RequestGenerator` and `RoadNetwork.findRoute` validate reachability and motorcycle access for every generated request. |
| **Pickup relocation changes trip outcomes.** | `tests/unit/sim/pickupAndReroute.test.ts`<br>`tests/unit/ui/negotiationRelocation.test.ts` | `tests/e2e/negotiation.spec.ts` | Requesting pickup relocation or refusing a narrow alley updates pickup/destination node, route ETA, walking distance, and repriced fare. |
| **Old navigation clears on completion.** | `tests/unit/sim/RideManager.test.ts`<br>`tests/unit/sim/gameSession.test.ts` | `tests/e2e/ride.spec.ts`<br>`tests/e2e/prototype.spec.ts` | `RideManager` clears active route and turn instruction immediately upon trip completion before transitioning back to `Idle`. |
| **Fare, commission, fuel, expenses, and net earnings reconcile.** | `tests/unit/sim/economy.test.ts`<br>`tests/unit/sim/moneyAttribution.test.ts`<br>`tests/unit/sim/moneyFixes.test.ts` | `tests/e2e/prototype.spec.ts`<br>`tests/e2e/dayEnd.spec.ts` | `TripReceipt.net = fare + tip + bonus - commission - fuelCost - otherCosts - penalties - compensation`, reconciling 1:1 with `EconomyManager` ledger entries. |
| **Reloads and state transitions cannot pay a trip twice.** | `tests/unit/sim/saveIntegrity.test.ts`<br>`tests/unit/save/SaveSystem.test.ts` | `tests/e2e/saveLoad.spec.ts`<br>`tests/e2e/menus.spec.ts` | `EconomyManager.settledRequests` guards idempotent settlement and mid-trip saves restore cleanly to `Idle` without duplicate payout. |

### §21.3 Consequences

| `docs/MASTER.md` §21 Criterion | Automated Unit / `GameSession` / Balance Specs | Automated Browser E2E Specs | Verification Summary |
|---|---|---|---|
| **Passengers remember important choices.** | `tests/unit/sim/recurringPassengers.test.ts`<br>`tests/unit/sim/dialogue.test.ts`<br>`tests/unit/sim/reputation.test.ts` | `tests/e2e/contacts.spec.ts`<br>`tests/e2e/panels.spec.ts` | Recurring characters persist relationship & `passengerTrust` scores in `ReputationSystem`, unlocking direct bookings and memory-specific dialogue lines. |
| **Exploitation has consequences and is not a guaranteed profitable strategy.** | `tests/unit/sim/reputation.test.ts`<br>`tests/balance/rides.test.ts`<br>`tests/balance/endings.test.ts` | `tests/e2e/negotiation.spec.ts` | Overcharging or exploiting vulnerable passengers lowers `riderIntegrity`, `passengerTrust`, and `platformStanding`, risking disputes, low ratings, and app suspension. |
| **Bribery is not guaranteed and may increase exposure.** | `tests/unit/sim/police.test.ts`<br>`tests/unit/sim/signatureEncounters.test.ts` | `tests/e2e/panels.spec.ts` | Offering a bribe to a strict officer fails and increases `criminalExposure` / `evidenceExposure` + penalty in `PoliceSystem`. |
| **Police behavior varies without portraying every officer as corrupt.** | `tests/unit/sim/police.test.ts`<br>`tests/unit/sim/verticalSliceEncounters.test.ts` | `tests/e2e/smoke.spec.ts` | `PoliceSystem` models distinct officer archetypes (`by_the_book`, `pragmatic`, `lenient`, ` opportunistic`) with lawful fines, warnings, and contesting options. |
| **Accident outcomes reflect severity and response.** | `tests/unit/sim/accidents.test.ts`<br>`tests/unit/sim/surviveObjective.test.ts` | `tests/e2e/smoke.spec.ts` | `AccidentSystem` scales bike/passenger damage and consequences across `bump`, `minor`, and `major` incidents based on whether the rider checks the passenger, calls help, settles, or flees. |
| **Helpful/safe choices can create meaningful benefits.** | `tests/unit/sim/campaignChapters.test.ts`<br>`tests/unit/sim/reputation.test.ts`<br>`tests/balance/campaign.test.ts` | `tests/e2e/contacts.spec.ts` | Safe driving, emergency hospital assistance, and honest fares boost `publicReputation`, `riderIntegrity`, tips, Kamal Bhai's 20% garage discount, and regular contacts. |

### §21.4 Story and UI

| `docs/MASTER.md` §21 Criterion | Automated Unit / `GameSession` / Balance Specs | Automated Browser E2E Specs | Verification Summary |
|---|---|---|---|
| **Mission prerequisites and objectives work.** | `tests/unit/sim/missionManager.test.ts`<br>`tests/unit/sim/campaignChapters.test.ts`<br>`tests/unit/data/campaignReferences.test.ts` | `tests/e2e/firstRide.spec.ts`<br>`tests/e2e/smoke.spec.ts` | All 6 campaign chapters and side missions validate prerequisites, objective counters, reach targets, and rewards. |
| **Major choices persist and recurring characters respond to them.** | `tests/unit/sim/campaignFlags.test.ts`<br>`tests/unit/save/SaveSystem.test.ts`<br>`tests/unit/sim/encounterMissionFlow.test.ts` | `tests/e2e/saveLoad.spec.ts`<br>`tests/e2e/menus.spec.ts` | Story `branchFlags`, `promises`, `karmaLog`, and `characterRelationships` persist across `SaveV2` save/load and drive Chapter 5–6 callbacks. |
| **Multiple play styles can reach viable endings.** | `tests/unit/sim/endings.test.ts`<br>`tests/balance/endings.test.ts`<br>`tests/balance/parity.test.ts` | `tests/e2e/menus.spec.ts` | All 5 endings (`independent_rider`, `workshop_owner`, `trusted_local`, `fast_money`, `fresh_start`) are verified reachable across 8 bot policies in `tests/balance/endings.test.ts`. |
| **U, S, and J open UI Sheet, Story, and Karma panels if configured.** | `tests/unit/ui/panels.test.ts`<br>`tests/unit/ui/bindings.test.ts` | `tests/e2e/panels.spec.ts`<br>`tests/e2e/a11y.spec.ts` | `KeyU` opens `UiSheet`, `KeyJ` opens Story `Journal`, and `KeyK` opens `KarmaPanel` (while `KeyS` remains WASD brake/reverse per Pre-flight Ruling 9). |
| **All displayed buttons work.** | `tests/unit/ui/menus.test.ts`<br>`tests/unit/ui/phone.test.ts`<br>`tests/unit/ui/garage.test.ts`<br>`tests/unit/ui/dayEnd.test.ts`<br>`tests/unit/ui/ending.test.ts` | `tests/e2e/menus.spec.ts`<br>`tests/e2e/a11y.spec.ts`<br>`tests/e2e/settings.spec.ts` | Every visible button in HUD, Phone, Negotiation, Map, Pause, Garage, Journal, Karma, UiSheet, DayEnd, Ending, SaveSlots, and Settings dispatches a real bound action. |
| **Objective, passenger, navigation, and trip state stay synchronized.** | `tests/unit/ui/hud.test.ts`<br>`tests/unit/sim/gameSession.test.ts`<br>`tests/unit/sim/tripFsm.test.ts` | `tests/e2e/hud.spec.ts`<br>`tests/e2e/ride.spec.ts` | `deriveRideView(rideManager)` and `syncHudWithCache` derive HUD objective, passenger chip, 3D markers, and minimap route from the single authoritative `RideManager` state machine. |
| **Test at target resolution and on lowest target hardware.** | `tests/unit/render/resolveQuality.test.ts`<br>`tests/unit/ui/touchActions.test.ts` | `tests/e2e/perf.spec.ts`<br>`tests/e2e/input.spec.ts`<br>`tests/e2e/boot.spec.ts` | Playwright runs every E2E spec on both Desktop (`1280x720`) and Pixel 7 mobile landscape (`915x412` & `667x375`) with `>= 44px` touch targets and zero HUD overlap. |
| **Report actual test results and remaining placeholders; do not claim untested features work.** | `tests/unit/qa/testMatrix.test.ts`<br>`tests/unit/ui/mapScreen.test.ts` | `tests/e2e/panels.spec.ts`<br>`tests/e2e/menus.spec.ts` | Vector Dhaka map (`HAS_DHAKA_MAP_ASSET = false`) and Chapter 6 career choice cards explicitly display localized prototype badges (`map-prototype-badge`, `career-choice-prototype-notice`). |

---

## 1. Driving Systems

| GDD §17 Question | Automated Test | Manual Playtest Protocol | Pass Criteria |
|---|---|---|---|
| **Can the player brake and turn predictably?** | `tests/unit/physics/bikeModel.test.ts`<br>`tests/unit/physics/MotorcycleController.test.ts`<br>`tests/e2e/menus.spec.ts` | Accelerate to 40 km/h on an open road, then apply full brakes before an intersection white line. Steer into a 90° turn at 20 km/h. | Bike comes to a controlled stop within designated braking distance without sudden angular velocity spikes or snapping. Turning arc feels responsive and smooth. |
| **Are collisions understandable rather than arbitrary?** | `tests/unit/physics/MotorcycleController.test.ts`<br>`tests/unit/sim/verticalSliceEncounters.test.ts`<br>`tests/unit/sim/accidents.test.ts` | 1. Clip a rickshaw wheel at 15 km/h.<br>2. Drive directly into a concrete flyover pillar at 35 km/h. | 1. Low-speed glancing bump triggers a visual wobble, bump sound, and minor passenger patience ding.<br>2. High-speed direct collision triggers an immediate crash event with clear audio/visual feedback and position reset. |
| **Can the player recover from a missed turn?** | `tests/unit/sim/pickupAndReroute.test.ts`<br>`tests/unit/sim/road.test.ts`<br>`tests/unit/sim/bikeRecovery.test.ts` | Intentionally drive past a designated turn onto a divided avenue. | Turn-by-turn guidance and minimap immediately recalculate route to the nearest legal U-turn opening (within 400m) without dead-ending or directing the player across a physical median. |
| **Do wet roads feel different without becoming uncontrollable?** | `tests/unit/physics/bikeModel.test.ts`<br>`tests/unit/sim/timeAndWeather.test.ts` | Play through Day 7 monsoon weather. Attempt standard braking and cornering. | Wet braking distance increases by ~30–40% and tires show water spray particles, but steering friction clamps prevent uncontrollable fishtailing when driving cautiously. |

---

## 2. Fare Negotiation

| GDD §17 Question | Automated Test | Manual Playtest Protocol | Pass Criteria |
|---|---|---|---|
| **Do passengers have distinct behavior?** | `tests/unit/sim/PassengerAI.test.ts`<br>`tests/unit/sim/NegotiationSystem.test.ts`<br>`tests/unit/sim/dialogue.test.ts` | Negotiate rides with each of the archetypes: Commuter, Student, Office Worker, Urgent, Local Regular, Unfamiliar Traveler, Difficult Negotiator, Unreliable, and Luggage/Family. | Each archetype exhibits distinct budget tolerance, patience decay, urgency weighting, walk tolerance, and colloquial Bangla dialogue pool. |
| **Can players understand why a fare was accepted or rejected?** | `tests/unit/sim/NegotiationSystem.test.ts`<br>`tests/unit/ui/negotiation.test.ts`<br>`tests/e2e/negotiation.spec.ts` | Counter far above passenger budget or let round timer expire. | Negotiation modal displays explicit outcome reason badge with icon (`TOO_EXPENSIVE`, `OUT_OF_PATIENCE`, `URGENT`, `TRUSTS_YOU`, `FAIR_PRICE`). |
| **Is declining a bad ride sometimes the correct decision?** | `tests/balance/rides.test.ts`<br>`tests/unit/sim/fare.test.ts` | Receive a low-budget offer heading into a flooded alley during rush hour. | Declining the ride saves time and fuel; picking up a subsequent cross-district rider yields higher net profit. SmartPro bot policy confirms declining unprofitable trips beats accepting blindly. |
| **Can the player make a reasonable profit without exploiting a single strategy?** | `tests/balance/rides.test.ts`<br>`tests/balance/endings.test.ts`<br>`tests/unit/sim/economy.test.ts` | Test multiple distinct playstyles: (A) short-hop market runs, (B) high-volume regular bookings, (C) selective rush-hour rides. | All three distinct playstyles yield sustainable net profit (৳800–৳1,800/day) sufficient to pay daily living expenses and save towards motorcycle upgrades. |

---

## 3. Economy and Progression

| GDD §17 Question | Automated Test | Manual Playtest Protocol | Pass Criteria |
|---|---|---|---|
| **Does fuel cost scale sensibly with distance and traffic?** | `tests/unit/sim/economy.test.ts`<br>`tests/unit/sim/bikes.test.ts` | Compare fuel consumption of a 5 km open-road run vs a 5 km crawl through dense traffic. | Fuel consumption scales with distance and adds idle fuel burn during heavy traffic congestion (~30% higher fuel consumption per km in heavy jams). |
| **Can a player recover after a bad day?** | `tests/unit/sim/dayLifecycle.test.ts`<br>`tests/unit/save/SaveSystem.test.ts`<br>`tests/e2e/dayEnd.spec.ts` | Simulate a Day 3 net loss (-৳500) due to accidents and repairs. | Player enters debt gracefully with warning from Ma; completing 5 standard rides on Days 4–5 completely recovers solvency without a game-over death spiral. |
| **Are repairs meaningful without becoming a constant punishment?** | `tests/unit/sim/garage.test.ts`<br>`tests/unit/ui/garage.test.ts`<br>`tests/e2e/garage.spec.ts` | Ride 50 km across multiple days; inspect garage repair items at Kamal's workshop. | Wear scales gradually with mileage (oil at 100 km, brake pads at 200 km). Routine maintenance averages < 12% of gross revenue. Kamal's trust discount reduces costs by 20%. |
| **Are off-app rides a trade-off rather than a guaranteed exploit?** | `tests/unit/sim/NegotiationSystem.test.ts`<br>`tests/unit/sim/RideManager.test.ts`<br>`tests/balance/endings.test.ts` | Accept multiple consecutive off-app rides during career. | Off-app rides yield 100% fare without platform commission, but carry risk of detection strikes (3 strikes = platform suspension for 2 days) and payment disputes, proving it is a strategic risk rather than an exploit. |

---

## 4. Narrative and Identity

| GDD §17 Question | Automated Test | Manual Playtest Protocol | Pass Criteria |
|---|---|---|---|
| **Do recurring characters remember important choices?** | `tests/unit/sim/dialogue.test.ts`<br>`tests/unit/sim/identity.test.ts`<br>`tests/unit/sim/campaignChapters.test.ts`<br>`tests/e2e/contacts.spec.ts` | 1. Give corporate commuter Tanvir an early prompt ride.<br>2. Drive gently with Mrs. Ferdousi's child.<br>3. Inspect subsequent dialogue. | Tanvir's subsequent dialogue mentions boss commendation; Mrs. Ferdousi praises safe driving and unlocks direct phone bookings; Rahim chacha references hidden cuts. |
| **Are multiple endings achievable through different play styles?** | `tests/unit/sim/endings.test.ts`<br>`tests/unit/ui/ending.test.ts`<br>`tests/balance/endings.test.ts`<br>`tests/e2e/menus.spec.ts` | Execute headless bot playthroughs under distinct policies: SmartPro, Trust-Focused, Reckless, Off-App Heavy, Workshop Partner, and Recovery. | Each policy reaches its corresponding distinct ending: Independent Rider, Trusted Local, Fast Money, Fresh Start, or Workshop Owner. Trusted Local is reachable even with modest savings. |
| **Does the game avoid treating every risky passenger as a criminal?** | `tests/unit/sim/crime.test.ts`<br>`tests/unit/sim/dialogue.test.ts`<br>`docs/DECISIONS.md` | Interact with 10 random passengers generated with the 'risky' archetype. | Risky passengers include hurried students, night workers, and fast riders; only scripted story encounters (Ch 4 suspicious pickup) involve actual police investigations. Stereotype review verified. |
| **Do helpful and safe choices have meaningful outcomes?** | `tests/unit/sim/campaignChapters.test.ts`<br>`tests/unit/sim/reputation.test.ts`<br>`tests/balance/campaign.test.ts` | 1. Waive fare for hospital run in Ch 3.<br>2. Return lost phone in side mission.<br>3. Wear helmet and obey traffic signals. | Helpful choices reward substantial Public Reputation (+25–30), build permanent character relationships, and unlock premium direct booking contacts. |

---

## 5. Performance and Polish

| GDD §17 Question | Automated Test | Manual Playtest Protocol | Pass Criteria |
|---|---|---|---|
| **Test on the lowest target Android hardware.** | `tests/unit/physics/MotorcycleController.test.ts`<br>`tests/e2e/input.spec.ts`<br>`tests/e2e/boot.spec.ts` | Deploy static build on entry-level Android phone in landscape mode. | Application boots into interactive 3D scene in < 3.0s; touch controls and orientation lock respond immediately. |
| **Measure frame rate in dense traffic.** | `tests/unit/sim/hotPathAllocations.test.ts`<br>`tests/unit/sim/traffic.test.ts`<br>`tests/e2e/perf.spec.ts` | Drive through Mirpara commercial market during morning rush hour (15+ active vehicles, pedestrians, rickshaws). | Frame rate remains steady at or above 30 FPS without frame drops > 100 ms. Hot-path vectors are pooled with zero allocations. |
| **Profile memory and loading times.** | `tests/unit/render/assets.test.ts`<br>`tests/unit/render/lodStreaming.test.ts` | Run a 20-minute continuous driving session across 4 districts; monitor JavaScript heap. | JS heap memory remains stable below 100 MB without leaks; texture memory is managed via shared atlases; initial entry JS shell `<= 400 KB` gzipped. |
| **Use simplified distant traffic.** | `tests/unit/render/cityBuilder.test.ts`<br>`tests/unit/render/lodStreaming.test.ts` | Observe incoming traffic vehicles at 100m distance. | Distant vehicles render as lightweight bounding silhouettes or low-poly proxies, transitioning seamlessly to detailed geometry at < 60m. |
| **Avoid loading the whole city at once.** | `tests/unit/render/lodStreaming.test.ts`<br>`tests/unit/sim/districts.test.ts` | Drive from Mirpara to Puran Para. Monitor district streaming logs. | `loadAllDistricts()` splits non-Mirpara districts into lazy chunks and `CityBuilder` streams districts progressively in time-sliced stages; distant districts remain unbuilt until proximity threshold is crossed. |

---

## 6. Verification Status Summary

- **Total `docs/MASTER.md` §21 Acceptance Criteria:** 27 / 27 mapped & automated (100%)
- **Total GDD §17 Questions:** 21 / 21 mapped & automated (100%)
- **Automated QA Test Suite:** `tests/unit/qa/testMatrix.test.ts`
- **Production Bundle & Preview E2E Gate:** `node scripts/verify-prod-bundle.mjs` + `PLAYWRIGHT_PREVIEW=1 npx playwright test --grep-invert @dev-only`

## Gate M1: the prototype protocol (T8.7)

Automated: `tests/e2e/prototype.spec.ts` runs accept, negotiate, autopilot ride, one debug encounter, drop off, summary-to-ledger reconciliation and continue, on desktop and pixel7, and `tests/e2e/menus.spec.ts` + `tests/e2e/firstRide.spec.ts` + `tests/e2e/panels.spec.ts` verify pure-player UI flows against built `dist/` via `vite preview`. Passing automated tests does not replace human playtesting sign-off.

Play it by hand on a fresh career, on PC and then on an Android phone:

1. Start a new career from the main menu. Without help, reach the first ride.
2. Accept a fare, then negotiate with the passenger. Does the panel make the passenger's mood and the fare choice clear?
3. Ride to pickup, then to drop-off. Do the navigation and objective text say what to do next?
4. When an encounter appears, answer it. Does the sim resume cleanly?
5. At drop-off, read the summary. Do its rows match what your money did? Continue, then find the next fare.
6. Repeat on the phone. Is it enjoyable, and is anything unplayable?

Record in one line per point: pass, or what broke and how it felt. Then tick `GATE-M1` in `docs/QUESTIONS.md`.
