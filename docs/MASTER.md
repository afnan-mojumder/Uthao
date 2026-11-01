# Uthao — Story and Game Logic Master Document

**Purpose:** Single source of truth for Uthao's narrative, mission progression, gameplay rules, simulation systems, consequences, UI behavior, world requirements, and implementation priorities.

**Genre:** Open-world motorcycle ride-hailing simulator, career/life simulation, narrative sandbox  
**Setting:** Fictionalized Dhaka, Bangladesh  
**Visual direction:** Optimized low-poly 3D  
**Primary recommendation:** Build a compact, complete vertical slice before expanding the city.

> This document specifies intended behavior. Inspect the actual project before implementation; do not assume a described feature already works.

## 1. High Concept

The player controls **Rafi Hasan**, a motorcycle ride-hailing rider trying to make a living in a dense Dhaka-inspired city. Each trip combines driving, local route knowledge, fare negotiation, passenger interaction, money management, and decisions under pressure.

Uthao is not simply a racing game. Its identity comes from everyday urban ride-hailing situations: bargaining, moving a passenger to a safer pickup point, explaining U-turns and detours, handling narrow alleys, choosing app or off-app rides, managing expenses, protecting passengers, and facing the consequences of reckless or unethical choices.

### Design pillars

1. Local behavior changes gameplay.
2. Most important encounters offer multiple viable choices.
3. Gross fare and net profit are different.
4. Traffic should feel busy but fair.
5. Passengers and recurring characters remember significant choices.
6. Risky actions can offer short-term benefits but must have plausible costs.
7. A small, complete ride loop matters more than a huge unfinished map.

## 2. Protagonist and Story

### Rafi Hasan
- **Age:** 24
- **Role:** Motorcycle ride-hailing rider
- **Starting situation:** Lives in a modest rented flat in Dhaka and owns an aging used motorcycle.
- **Goal:** Save enough money to open a small motorcycle repair workshop.
- **Strengths:** Local knowledge, persistence, practical judgment, ability to read people.
- **Pressures:** Limited cash, fuel costs, repairs, household expenses, unpredictable demand, and temptation to take risky jobs.

The player shapes Rafi's identity through behavior:
- **Professional rider:** prioritizes safety and reliability.
- **Street-smart negotiator:** chooses profitable trips and manages difficult passengers.
- **Reckless hustler:** takes shortcuts and high-risk jobs for quick cash.
- **Trusted neighborhood regular:** helps people and builds repeat business.

These are tendencies, not fixed classes. A lower-income but trusted and safe rider must still have a viable path to success.

### Opening sequence: First Ride
The game begins at 7:00 AM in a fictional neighborhood inspired by Mirpur.

1. Rafi wakes to a phone alarm.
2. His mother reminds him about an upcoming household expense.
3. He checks his limited cash.
4. He inspects his aging motorcycle and notices low fuel.
5. His friend Mintu says demand is high around Farmgate.
6. Rafi opens the Uthao app and accepts a request.
7. His first passenger is a university student going to a nearby campus.
8. The passenger offers less than expected, introducing negotiation.
9. The ride teaches pickup, route choice, traffic, drop-off, and payment.
10. The trip summary shows gross fare, commission, fuel cost, and net earnings.

The tutorial should feel like a normal workday, not disconnected instructions.

## 3. Campaign Chapters

The campaign covers approximately 20 in-game days; duration can be balanced during testing.

### Chapter 1 — First Gear (Days 1–3)
Rafi starts with little cash and a worn motorcycle. Learn requests, bargaining, navigation, fuel, and payment.  
**Final mission:** Cover the week's expenses without missing an important household payment.

### Chapter 2 — The Rush Hour Hustle (Days 4–6)
Rafi discovers profitable zones and repeat passengers. Congestion reveals that a high fare is not always profitable. Introduce rush-hour traffic, U-turns, divided-road pickup decisions, ratings, and trip profitability.  
**Final mission:** Complete several rides across districts before the evening rush peaks.

### Chapter 3 — Rain, Roads and Regrets (Days 7–9)
Heavy rain makes familiar routes unpredictable. One passenger pressures Rafi to drive faster, while another needs urgent help reaching a hospital or clinic. Introduce wet-road handling, flooding, accidents, urgency, and emergency choices.  
**Final mission:** Balance safety, earnings, and helping others during a traffic disruption.

### Chapter 4 — The Narrow Lane (Days 10–12)
A high-paying trip leads toward an unfamiliar neighborhood. Conflicting directions, a suspicious pickup, or a dark-alley encounter force Rafi to choose whether to proceed, reroute, refuse, or seek help. Introduce alley constraints, robbery risk, passenger protection, police investigation, and off-app trade-offs.  
**Final mission:** Get home safely and decide whether to cooperate with a police investigation.

### Chapter 5 — The Regulars (Days 13–16)
Earlier passengers return. Choices affect loyal customers, ratings, unpaid expenses, helpful contacts, and damaged relationships. Introduce repeat passengers, direct bookings, promises, linked jobs, and reputation recovery.  
**Final mission:** Complete linked jobs arranged by regular customers, with opportunities to honor or break promises.

### Chapter 6 — Beyond the Ride (Days 17–20)
Rafi approaches his savings goal and must choose between buying a better motorcycle, investing in a repair workshop, or continuing independently.  
**Final mission:** Make a financial decision reflecting reputation, relationships, safety record, and resources.

### Endings
- **The Independent Rider:** buys a better motorcycle and builds a customer base.
- **The Workshop Owner:** opens a modest repair shop and hires or partners with a mechanic.
- **The Trusted Local:** becomes known for reliable service and community support.
- **The Fast Money Ending:** earns substantial cash through risky decisions but loses relationships and faces lasting consequences.
- **The Fresh Start:** after financial setbacks, changes neighborhoods, repairs reputation, and starts again.

Ending logic must consider finances, reputation, relationships, safety record, and key choices—not a single cash threshold.

## 4. Main Characters

- **Rafi Hasan:** Player character; identity emerges from choices.
- **Ma:** Rafi's mother; household obligations and emotional stakes. Trust responds to commitments and behavior.
- **Mintu:** Friend and source of street-level advice, demand information, shortcuts, and warnings. Advice is useful but not always perfect.
- **Kamal Bhai:** Experienced mechanic/workshop owner; provides repairs, maintenance advice, and potential partnership opportunities.
- **Nabila Rahman:** Recurring passenger whose trust depends on reliability, respectful negotiation, safety, and honored commitments.
- **General NPCs:** Passengers, pedestrians, vendors, riders, drivers, police, mechanics, and potential criminals. Most have ordinary motivations. Not every passenger is dishonest, every alley dangerous, or every police officer corrupt.

## 5. City and Environment

Build a compact, dense, connected city before expanding. Compress distances for gameplay pacing. Use the user's supplied Dhaka map as the map-screen base asset if available; preserve its district labels and legend.

| District inspiration | Gameplay role | Environment |
|---|---|---|
| Mirpur | Starting neighborhood | Residential roads, markets, schools, crowded junctions |
| Farmgate | High-demand pickup zone | Busy intersections, buses, office commuters |
| Dhanmondi | Mixed passenger types | Universities, hospitals, cafes, residential streets |
| Mohakhali | Traffic challenge | Bus terminals, offices, bottlenecks, flyovers |
| Gulshan/Banani | Higher-value trips | Wider roads, offices, restaurants, security gates |
| Old Dhaka | Advanced driving | Narrow lanes, markets, pedestrians, difficult turns |
| Motijheel | Commercial demand | Offices, crossings, rush-hour traffic |

### Road types
- Main roads: multiple lanes, buses, cars, motorcycles, traffic lights.
- Residential roads: parked vehicles, pedestrians, schools, speed bumps.
- Narrow alleys: limited turning space and access restrictions.
- Service roads: shortcuts with possible obstructions.
- Flyovers and U-turns: route-choice challenges affecting time and fuel.
- Market roads: dense pedestrians, vendors, rickshaws, and blockages.

Road-segment data should include width, surface, traffic density, typical speed, direction, turn restrictions, U-turn availability, pedestrian density, rain sensitivity, encounter risk, motorcycle access, and pickup/drop-off suitability.

### Buildings and street props
Use modular low-poly apartment blocks, shops, tea stalls, pharmacies, restaurants, workshops, markets, bus stops, garages, fuel stations, schools, office entrances, construction sites, boundary walls, streetlights, utility poles, Bengali signs, billboards, trees, drains, and respectful neighborhood landmarks. Keep buildings out of roads and pedestrian paths; avoid giant blank blocks, repeated identical facades, floating meshes, and camera obstruction.

### Traffic and pedestrians
Traffic types: motorcycles, CNG auto-rickshaws, cycle rickshaws, cars, buses, minibuses, delivery vans, and small trucks. Implement road-following, braking, turns, spacing, basic right-of-way, parked vehicles, and collision response. Pedestrians walk on sidewalks, wait at stops, gather at shops and tea stalls, cross at selected points, and react to nearby vehicles or accidents. Use pooling, distance-based simulation, LODs, shared materials, and instancing where supported.

## 6. Core Gameplay Loop

1. **Find a passenger:** app request, demand-zone cruising, or street pickup.
2. **Inspect trip:** pickup, destination, estimated time, fare, and risks.
3. **Negotiate:** accept, counteroffer, discount, request a better pickup point, change route, or decline.
4. **Reach pickup:** navigate the road network and resolve inaccessible pickup points.
5. **Ride:** handle traffic, roadblocks, weather, pedestrians, fuel, and passenger directions.
6. **React:** resolve disputes, protect passengers, reject unsafe detours, or handle encounters.
7. **Complete trip:** drop off, collect payment, and calculate final transactions.
8. **Review outcomes:** ratings, trust, reputation, fines, damage, and story flags update.
9. **Manage business:** fuel, food, repairs, household expenses, and next shift.

Free roaming remains available; story missions unlock characters, areas, and opportunities rather than forcing every ride into a fixed narrative.

## 7. Ride Requests and Negotiation

### Request data
Each request may contain pickup/destination, road-network route, distance, estimated duration, initial offer/app estimate, passenger budget, patience, urgency, mood, negotiation style, willingness to walk to a better pickup point, luggage or other circumstances, payment reliability, area familiarity, and relationship history.

### Player options
- Accept the proposed fare.
- Counteroffer higher or offer a discount.
- Ask the passenger to cross to a safer or more accessible point.
- Explain the cost of a U-turn, detour, congestion, or road restriction.
- Refuse an impractical or unsafe alley.
- Choose app booking or an off-app trip.
- Cancel before pickup or decline.
- Offer a compromise based on walking distance or route change.

### Example
Passenger: “ভাই, ধানমন্ডি যাব। ৮০ টাকা হবে?”
- “আচ্ছা ভাই, ৮০ টাকায় চলেন।” — accept ৳80.
- “ভাই, ১০০ দেন। জ্যাম অনেক।” — counteroffer ৳100.
- “৯০ দেন, আপনার জন্য কম রাখলাম।” — discounted counteroffer.
- “এই ভাড়ায় হবে না ভাই।” — decline.

Figures are illustrative balancing placeholders, not claims about real-world fares.

### Negotiation variables
Let `F` = rider quote, `B` = passenger budget, `U` = urgency, `P` = patience, `T` = traffic/inconvenience, `R` = trust, `W` = pickup inconvenience, and `H` = interaction history. Acceptance should depend on these variables. Higher fares may increase revenue but also rejection, lower trust, or poor ratings. Avoid a deterministic system exploitable through one fixed fare.

### Pickup and route validity
A pickup is valid only if reachable by the road network, accessible to the motorcycle, and safe enough to stop without occupying active traffic. If inconvenient, offer a nearby safe pickup compromise. Passenger responses depend on patience, mobility, urgency, and relationship.

Routes must account for road connectivity, direction restrictions, U-turns, traffic, surface, alley width, weather, and time. Recalculate when a turn is missed instead of leaving stale instructions.

### Off-app rides
Off-app rides may avoid platform commission and allow flexible payment but reduce platform protections and increase payment/dispute uncertainty. They must be a trade-off, not a guaranteed best strategy.

## 8. Passenger AI

Archetypes:
- Commuter: time-sensitive, moderate patience.
- Student: budget-conscious, may become a repeat customer.
- Office worker: values punctuality.
- Urgent passenger: high urgency; safe driving still matters.
- Local regular: remembers interactions and may book directly.
- Unfamiliar traveler: may need landmark guidance.
- Difficult negotiator: persistent bargaining but not necessarily dishonest.
- Unreliable passenger: may cancel, delay, or dispute payment.
- Luggage/family trip: needs accessible pickup and careful driving.

Suggested passenger states:
`RequestCreated → Offered → Negotiating → Accepted → RiderEnRoute → AtPickup → OnTrip → AtDestination → Completed`

Alternative outcomes: `Declined`, `Cancelled`, `NoShow`, `Disputed`, `AbandonedForSafety`, `Failed`.

Validate transitions. A trip cannot be completed before pickup and destination arrival unless recorded as a cancellation/failure. Passenger mood, patience, trust, urgency, and history influence dialogue without making behavior perfectly predictable.

## 9. Economy and Motorcycle Condition

Track gross fare separately from net income.

Transaction types:
- Gross fare, tip, bonus, direct-booking payment.
- Platform commission.
- Fuel.
- Food and tea.
- Repairs and maintenance.
- Official fines and in-game bribes.
- Accident compensation and medical expenses.
- Household expenses and workshop savings.

**Trip Net = Fare Collected + Tip/Bonus − Platform Commission − Incremental Fuel Cost − Trip-Specific Costs − Penalties − Compensation**

Daily net then subtracts daily overhead such as food and household payments. Do not double-count expenses. Fuel consumption varies with distance, traffic, acceleration, bike condition, passenger load, and road conditions. Repair costs reflect damage.

Track fuel, overall condition, collision damage, and optionally tire/brake condition. Poor condition may affect acceleration, braking, reliability, or risk. Warn the player clearly and provide a recovery path. Players must be able to recover from a bad day; honest and safe play must remain economically viable.

## 10. Integrity, Karma, Trust, and Reputation

Keep these systems distinct:
- `RiderIntegrity`: tendency toward honest or exploitative behavior.
- `PassengerTrust`: current or recurring passenger's trust.
- `PublicReputation`: local reputation.
- `PlatformStanding`: ratings, complaints, app access.
- `CriminalExposure`: risk of legal investigation.
- `EvidenceExposure`: witnesses, reports, or other evidence.
- `SafetyRecord`: pattern of safe or reckless driving.
- `RelationshipFlags`: promises, help, betrayal, and conflicts.

Use bounded scales (for example, 0–100) and event-based updates. Every change should be attributable to a specific action or event.

### Exploiting passengers
The player may demand unreasonable fares, mislead passengers about distance, or pressure vulnerable passengers. Short-term income may be possible, but consequences can include lower trust and ratings, complaints, reduced platform standing, lost repeat bookings, and story consequences. Some passengers refuse, report, or end the trip. Exploitation is not guaranteed to be profitable.

### Helping passengers
Honest negotiation, safe pickup choices, emergency assistance, and protection from threats can increase trust, reputation, and repeat business. Helping can cost time or money; show the trade-off clearly.

## 11. Robbery and Dark-Alley Encounters

Use authored events triggered selectively by mission, location, time, and risk flags. Do not imply every alley is dangerous.

Possible choices: protect the passenger, call for help, attempt to leave, cooperate to reduce immediate danger, or choose another context-appropriate response.

Resolution depends on motorcycle position, escape path, passenger condition/trust, witnesses, time, location, and prior choices. Outcomes may include escape, lost fare, stolen cash, damage, injury, successful protection, witness reports, or later investigation. Severe punishment must not occur without readable cues and counterplay. Do not force lengthy dialogue while the motorcycle is moving.

## 12. Police, Violations, and Bribery

Encounters may follow defined violations or story events. Do not portray every officer as corrupt, and do not make bribery automatic.

Choices may include paying an official fine, explaining/contesting, accepting a warning if allowed, offering a bribe, or attempting to leave. Outcomes depend on violation severity, history, witnesses/evidence, story context, and officer behavior.

Official fines reduce cash and may affect safety record. A bribe may avoid a fine in some authored situations but can cause financial loss, evidence exposure, further demands, or investigation. Fleeing may escalate the encounter. UI must distinguish official fines from bribes and communicate risk without guaranteeing outcomes.

## 13. Accidents and Passenger Safety

Accidents may result from reckless driving, poor braking, wet roads, traffic, poor motorcycle condition, or NPC behavior. Do not assign blame arbitrarily.

After an accident:
1. Stop or stabilize the motorcycle.
2. Show rider and passenger status.
3. Offer relevant choices: check passenger, call for help, take responsibility, exchange details, or attempt an appropriate settlement.
4. Apply repair, medical, compensation, time, and reputation consequences based on severity and response.
5. Resume, cancel, or fail the trip according to the outcome.

Track severity, injury state, bike damage, other parties involved, responsibility, witnesses/evidence, weather, and player response. Do not trivialize serious injury or make every collision fatal. Minor incidents should have fair recovery options.

## 14. Traffic, Weather, and City Simulation

Traffic density varies by district, time, and mission. Vehicles follow connected road segments, brake and turn, maintain basic spacing, and obey simplified right-of-way. Avoid persistent overlap, sidewalk driving, and impossible traffic walls. Distant traffic uses simplified simulation.

Rain reduces grip and visibility; wet surfaces and puddles affect handling; flooding may block selected roads. Passenger urgency or patience may change according to context. Pedestrians use sidewalks, bus stops, shops, and selected crossing points, and react to nearby vehicles or accidents.

Use localized traffic, engine, horn, market, tea-stall, and weather audio. Avoid repetitive excessive honking. Day/night lighting must preserve visibility and performance.

## 15. Mission and Trip State Logic

Each mission declares ID/title, prerequisites, start/end locations, objective sequence, characters, success/failure/cancellation conditions, rewards/expenses, story flags, relationship changes, navigation target, UI state, and recovery behavior.

Suggested trip states:
`Idle → RequestAvailable → Negotiating → Accepted → EnRouteToPickup → PassengerOnboard → EnRouteToDestination → Completing → Completed`

Alternative states: `Declined`, `Cancelled`, `NoShow`, `Failed`, `EmergencyInterrupted`.

The state machine is authoritative. HUD, passenger status, objective, and navigation read from it rather than maintaining conflicting state independently.

### Completion consistency rule
When a trip completes:
- Clear the previous navigation target.
- Finalize the fare and transaction ledger exactly once.
- Update earnings and reputation exactly once.
- Mark the passenger dropped off.
- Show the trip summary.
- Transition to available-for-work only after completion processing.
- Generate a new request or display a clear idle objective.

Never show “Trip complete” while retaining a stale turn instruction for the previous destination.

An `EventDirector` may schedule ambient events by district, time, weather, mission state, and cooldown. Prevent duplicate, stacked, or route-blocking events.

## 16. UI and Controls

Visual style: dark slate translucent panels, Uthao Green `#22C55E`, Dhaka Amber `#F59E0B`, Danger Red `#EF4444`. Use Bangla-first colloquial dialogue with English for technical labels where useful. Keep the low-poly world readable and optimize for mobile.

### Main riding HUD
Date/time, location, today's net earnings, current objective/fare, passenger profile/mood, speedometer, fuel, minimap/compass, navigation instruction, motorcycle condition, ride status, and camera/map/phone controls.

### Uthao phone
Requests, pickup/destination, distance, duration, fare, accept/decline, chat, direct bookings, earnings, and trip history.

### Negotiation panel
Passenger offer, suggested fare, custom counteroffer, patience/mood, pickup relocation, route choices, accept/decline/walk away.

### Map/pause screen
Use the supplied Dhaka map asset if available. Preserve district labels and the road/river/waterbody/greenery legend. Add player position, route, pickup/drop-off pins, fuel stations, garages, shops, story locations, and event markers. Do not replace the supplied map with an unrelated generated map.

### Story panel
Current mission, objectives, story journal, character relationships, promises, recent decisions, and unlocked opportunities.

### Karma/consequences panel
Integrity, passenger trust, public reputation, platform standing, safety record, criminal/evidence exposure where relevant, and recent actions explaining changes.

### Encounter panels
Reusable dialogs for police, robbery, accidents, disputes, and emergencies.

### Trip summary
Gross fare, commission, fuel, trip costs, fines/compensation, tip/bonus, and net earnings. Values must reconcile with the ledger.

Reusable components: `PrimaryButton`, `SecondaryButton`, `DangerButton`, `ChoiceCard`, `StatusBar`, `CharacterPortrait`, `NotificationToast`, `MapMarker`, `ModalPanel`, `TransactionRow`, `MissionObjectivePanel`, `TripSummaryPanel`.

Every visible button must perform a real action. If a feature is not implemented, mark it as a prototype and do not show fake success.

## 17. Technical Architecture

Inspect the actual engine/project before implementation. Unity is a reasonable recommendation for Android-first 3D, but do not migrate an existing project solely because this document mentions Unity.

Suggested modules:
- `GameManager`: session state, time, initialization, save/load coordination.
- `MotorcycleController`: acceleration, steering, braking, lean, collisions.
- `CameraController`: follow camera, collision avoidance, camera modes.
- `RoadNetwork`: graph, access rules, navigation.
- `TrafficManager`: vehicle spawning, routes, density, AI.
- `PedestrianManager`: paths, idle and crossing behavior.
- `PassengerAI`: attributes, dialogue, mood, state machine.
- `NegotiationSystem`: offers, counteroffers, acceptance probability.
- `RideManager`: trip lifecycle and pickup/drop-off.
- `NavigationSystem`: route planning and instruction updates.
- `EconomyManager`: ledger, fuel, expenses, savings.
- `ReputationSystem`: trust, reputation, platform standing, safety.
- `EncounterSystem`: robbery, police, accident, dispute logic.
- `MissionManager`: campaign, objectives, unlocks, endings.
- `EventDirector`: ambient events and cooldowns.
- `UIManager`: screen state and presentation bindings.
- `SaveSystem`: player state, economy, relationships, mission flags.

Prefer data-driven passenger archetypes, event definitions, road attributes, mission data, and tuning parameters. Separate gameplay state from presentation logic.

## 18. Save Data

Persist campaign day/time, cash and savings, necessary transaction history, motorcycle fuel/condition/damage/upgrades, reputation/safety values, recurring-character relationships, completed missions, unlocked districts, choices, ending flags, and safe-to-resume trip state.

Handle invalid or partially written saves. Avoid saving transient states that duplicate payment or rewards after reload.

## 19. Version 1.0 Scope

Required:
- One protagonist and motorcycle.
- One compact connected Dhaka-inspired neighborhood.
- Roads, buildings, basic traffic, pedestrians, and collisions.
- Five passenger archetypes.
- Fare negotiation and pickup adjustments.
- Fuel, earnings, expenses, and repairs.
- U-turn, narrow-alley, and off-app scenarios.
- One robbery/suspicious-pickup event.
- Basic functional police and accident systems.
- Five story missions and at least one complete ending.
- Save/load and functional mobile HUD, phone, map, story, and karma panels.

Defer multiplayer, a huge city, advanced criminal AI, full-city traffic simulation, hundreds of missions, extensive voice acting, multiple cities, and complex vehicle licensing/customization.

## 20. Development Order

1. Inspect engine, player prefab, motorcycle, camera, and mission state.
2. Fix mounting, motorcycle control, camera follow, and collisions.
3. Build one complete neighborhood with connected roads, sidewalks, and buildings.
4. Complete one ride: request → negotiation → pickup → navigation → drop-off → payment.
5. Implement fuel, commission, expenses, and a reconciled summary.
6. Add passenger archetypes, mood, patience, and relationship persistence.
7. Add traffic AI and pedestrian behavior.
8. Add weather and road-condition effects.
9. Add police, robbery, and accident encounters.
10. Implement campaign missions, unlocks, and endings.
11. Connect HUD, phone, map, story, and karma panels to real state.
12. Profile performance and test on target hardware.

Do not expand the map before the first neighborhood and complete ride loop work reliably.

## 21. Acceptance Tests

### Driving and world
- Player visibly rides a motorcycle.
- Camera shows the road and avoids clipping through buildings.
- Roads connect and support turns, U-turns, and alleys.
- Buildings do not block roads or pedestrian paths.
- Traffic follows roads without persistent overlap.
- Pedestrians use sidewalks and react to vehicles.
- Collisions and wet-road behavior are understandable.

### Ride lifecycle
- Requests can be accepted, negotiated, declined, or cancelled.
- Pickup and destination are reachable through the road network.
- Pickup relocation changes trip outcomes.
- Old navigation clears on completion.
- Fare, commission, fuel, expenses, and net earnings reconcile.
- Reloads and state transitions cannot pay a trip twice.

### Consequences
- Passengers remember important choices.
- Exploitation has consequences and is not a guaranteed profitable strategy.
- Bribery is not guaranteed and may increase exposure.
- Police behavior varies without portraying every officer as corrupt.
- Accident outcomes reflect severity and response.
- Helpful/safe choices can create meaningful benefits.

### Story and UI
- Mission prerequisites and objectives work.
- Major choices persist and recurring characters respond to them.
- Multiple play styles can reach viable endings.
- U, S, and J open UI Sheet, Story, and Karma panels if configured.
- All displayed buttons work.
- Objective, passenger, navigation, and trip state stay synchronized.
- Test at target resolution and on lowest target hardware.
- Report actual test results and remaining placeholders; do not claim untested features work.

## 22. Final Design Rules

1. Local behavior affects gameplay.
2. The player has meaningful choices.
3. Gross fare and net profit remain distinct.
4. The city feels alive without being unfair.
5. Humor comes from recognizable situations, not caricatures.
6. Story and relationships respond to behavior.
7. Risky actions can have short-term benefits but plausible consequences.
8. Safe, honest play remains viable.
9. Build tested systems before adding large amounts of content.
10. Make the first ride satisfying before expanding the city.

**Prototype success criterion:** A player can accept a passenger, negotiate a fare, ride a short Dhaka-inspired route on a motorcycle, handle an unexpected event, drop off the passenger, and understand the resulting income, expenses, and consequences.
