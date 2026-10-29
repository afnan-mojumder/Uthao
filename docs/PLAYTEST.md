# Dhaka Bike Rider (Uthao) — Quality Assurance & Playtest Matrix

> **Reference: GDD §17 (Testing and Balancing)**  
> This document maps every design verification question defined in the Game Design Document to its corresponding automated unit/integration test, balance simulation, and manual hardware playtest protocol.

---

## 1. Driving Systems

| GDD §17 Question | Automated Test | Manual Playtest Protocol | Pass Criteria |
|---|---|---|---|
| **Can the player brake and turn predictably?** | `tests/unit/physics/bikeModel.test.ts`<br>`tests/unit/physics/MotorcycleController.test.ts` | Accelerate to 40 km/h on an open road, then apply full brakes before an intersection white line. Steer into a 90° turn at 20 km/h. | Bike comes to a controlled stop within designated braking distance without sudden angular velocity spikes or snapping. Turning arc feels responsive and smooth. |
| **Are collisions understandable rather than arbitrary?** | `tests/unit/physics/MotorcycleController.test.ts`<br>`tests/unit/sim/verticalSliceEncounters.test.ts` | 1. Clip a rickshaw wheel at 15 km/h.<br>2. Drive directly into a concrete flyover pillar at 35 km/h. | 1. Low-speed glancing bump triggers a visual wobble, bump sound, and minor passenger patience ding.<br>2. High-speed direct collision triggers an immediate crash event with clear audio/visual feedback and position reset. |
| **Can the player recover from a missed turn?** | `tests/unit/sim/pickupAndReroute.test.ts`<br>`tests/unit/sim/road.test.ts` | Intentionally drive past a designated turn onto a divided avenue. | Turn-by-turn guidance and minimap immediately recalculate route to the nearest legal U-turn opening (within 400m) without dead-ending or directing the player across a physical median. |
| **Do wet roads feel different without becoming uncontrollable?** | `tests/unit/physics/bikeModel.test.ts`<br>`tests/unit/sim/timeAndWeather.test.ts` | Play through Day 7 monsoon weather. Attempt standard braking and cornering. | Wet braking distance increases by ~30–40% and tires show water spray particles, but steering friction clamps prevent uncontrollable fishtailing when driving cautiously. |

---

## 2. Fare Negotiation

| GDD §17 Question | Automated Test | Manual Playtest Protocol | Pass Criteria |
|---|---|---|---|
| **Do passengers have distinct behavior?** | `tests/unit/sim/PassengerAI.test.ts`<br>`tests/unit/sim/NegotiationSystem.test.ts`<br>`tests/unit/sim/dialogue.test.ts` | Negotiate rides with each of the 5 archetypes: Bargainer, Office Commuter, Careful, Local Regular, and Risky. | 1. Bargainer starts at ~75% fare and haggles for multiple rounds.<br>2. Commuter pays fair fare promptly with high urgency.<br>3. Careful prioritises steady driving and passenger helmet.<br>4. Regular uses friendly informal Dhaka slang.<br>5. Risky offers high upfront cash for speed. |
| **Can players understand why a fare was accepted or rejected?** | `tests/unit/sim/NegotiationSystem.test.ts`<br>`tests/unit/ui/negotiation.test.ts` | Counter far above passenger budget or let round timer expire. | Negotiation modal displays explicit outcome reason badge with icon (`TOO_EXPENSIVE`, `OUT_OF_PATIENCE`, `URGENT`, `TRUSTS_YOU`, `FAIR_PRICE`). |
| **Is declining a bad ride sometimes the correct decision?** | `tests/balance/rides.test.ts`<br>`tests/unit/sim/fare.test.ts` | Receive a low-budget offer heading into a flooded alley during rush hour. | Declining the ride saves time and fuel; picking up a subsequent cross-district rider yields higher net profit. SmartPro bot policy confirms declining unprofitable trips beats accepting blindly. |
| **Can the player make a reasonable profit without exploiting a single strategy?** | `tests/balance/rides.test.ts`<br>`tests/unit/sim/economy.test.ts` | Test multiple distinct playstyles: (A) short-hop market runs, (B) high-volume regular bookings, (C) selective rush-hour rides. | All three distinct playstyles yield sustainable net profit (৳800–৳1,800/day) sufficient to pay daily living expenses and save towards motorcycle upgrades. |

---

## 3. Economy and Progression

| GDD §17 Question | Automated Test | Manual Playtest Protocol | Pass Criteria |
|---|---|---|---|
| **Does fuel cost scale sensibly with distance and traffic?** | `tests/unit/sim/economy.test.ts`<br>`tests/unit/sim/bikes.test.ts` | Compare fuel consumption of a 5 km open-road run vs a 5 km crawl through dense traffic. | Fuel consumption scales with distance and adds idle fuel burn during heavy traffic congestion (~30% higher fuel consumption per km in heavy jams). |
| **Can a player recover after a bad day?** | `tests/unit/sim/dayLifecycle.test.ts`<br>`tests/unit/save/SaveSystem.test.ts` | Simulate a Day 3 net loss (-৳500) due to accidents and repairs. | Player enters debt gracefully with warning from Ma; completing 5 standard rides on Days 4–5 completely recovers solvency without a game-over death spiral. |
| **Are repairs meaningful without becoming a constant punishment?** | `tests/unit/sim/garage.test.ts`<br>`tests/unit/ui/garage.test.ts` | Ride 50 km across multiple days; inspect garage repair items at Kamal's workshop. | Wear scales gradually with mileage (oil at 100 km, brake pads at 200 km). Routine maintenance averages < 12% of gross revenue. Kamal's trust discount reduces costs by 20%. |
| **Are off-app rides a trade-off rather than a guaranteed exploit?** | `tests/unit/sim/NegotiationSystem.test.ts`<br>`tests/unit/sim/RideManager.test.ts` | Accept multiple consecutive off-app rides during career. | Off-app rides yield 100% fare without platform commission, but carry risk of detection strikes (3 strikes = platform suspension for 2 days), proving it is a strategic risk rather than an exploit. |

---

## 4. Narrative and Identity

| GDD §17 Question | Automated Test | Manual Playtest Protocol | Pass Criteria |
|---|---|---|---|
| **Do recurring characters remember important choices?** | `tests/unit/sim/dialogue.test.ts`<br>`tests/unit/sim/identity.test.ts`<br>`tests/unit/sim/campaignChapters.test.ts` | 1. Give corporate commuter Tanvir an early prompt ride.<br>2. Drive gently with Mrs. Ferdousi's child.<br>3. Inspect subsequent dialogue. | Tanvir's subsequent dialogue mentions boss commendation; Mrs. Ferdousi praises safe driving and unlocks direct phone bookings; Rahim chacha references hidden cuts. |
| **Are multiple endings achievable through different play styles?** | `tests/unit/sim/endings.test.ts`<br>`tests/unit/ui/ending.test.ts` | Execute headless bot playthroughs under 5 distinct policies: SmartPro, Trust-Focused, Reckless, Off-App Heavy, and Balanced. | Each policy reaches its corresponding distinct ending: Independent Rider, Trusted Local, Fast Money, Fresh Start, or Workshop Owner. Trusted Local is reachable even with modest savings. |
| **Does the game avoid treating every risky passenger as a criminal?** | `tests/unit/sim/crime.test.ts`<br>`tests/unit/sim/dialogue.test.ts`<br>`docs/DECISIONS.md` | Interact with 10 random passengers generated with the 'risky' archetype. | Risky passengers include hurried students, night workers, and fast riders; only scripted story encounters (Ch 4 suspicious package) involve actual police investigations. Stereotype review verified. |
| **Do helpful and safe choices have meaningful outcomes?** | `tests/unit/sim/campaignChapters.test.ts`<br>`tests/unit/sim/reputation.test.ts` | 1. Waive fare for hospital run in Ch 3.<br>2. Return lost phone in side mission.<br>3. Wear helmet and obey traffic signals. | Helpful choices reward substantial Local Trust (+25–30), build permanent character relationships, and unlock premium direct booking contacts. |

---

## 5. Performance and Polish

| GDD §17 Question | Automated Test | Manual Playtest Protocol | Pass Criteria |
|---|---|---|---|
| **Test on the lowest target Android hardware.** | `tests/unit/physics/MotorcycleController.test.ts`<br>`package.json` (PWA build) | Deploy static build on entry-level Android phone in landscape mode. | Application boots into interactive 3D scene in < 3.0s; touch controls and orientation lock respond immediately. |
| **Measure frame rate in dense traffic.** | `tests/unit/sim/hotPathAllocations.test.ts`<br>`tests/unit/sim/traffic.test.ts` | Drive through Mirpara commercial market during morning rush hour (15+ active vehicles, pedestrians, rickshaws). | Frame rate remains steady at or above 30 FPS without frame drops > 100 ms. Hot-path vectors are pooled with zero allocations. |
| **Profile memory and loading times.** | `tests/unit/render/assets.test.ts`<br>`tests/unit/render/lodStreaming.test.ts` | Run a 20-minute continuous driving session across 4 districts; monitor JavaScript heap. | JS heap memory remains stable below 100 MB without leaks; texture memory is managed via shared atlases. |
| **Use simplified distant traffic.** | `tests/unit/render/cityBuilder.test.ts`<br>`tests/unit/render/lodStreaming.test.ts` | Observe incoming traffic vehicles at 100m distance. | Distant vehicles render as lightweight bounding silhouettes or low-poly proxies, transitioning seamlessly to detailed geometry at < 60m. |
| **Avoid loading the whole city at once.** | `tests/unit/render/lodStreaming.test.ts`<br>`tests/unit/sim/districts.test.ts` | Drive from Mirpara to Puran Para. Monitor district streaming logs. | WorldBuilder streams districts progressively in time-sliced async chunks; distant districts remain unbuilt until proximity threshold is crossed. |

---

## 6. Verification Status Summary

- **Total GDD §17 Questions:** 21
- **Automated Tests Mapped:** 21 / 21 (100% test coverage)
- **Manual Hardware Protocols Defined:** 21 / 21 (100% protocol coverage)
- **Automated QA Test Suite:** `tests/unit/qa/testMatrix.test.ts`
