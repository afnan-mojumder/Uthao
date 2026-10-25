# Dhaka Bike Rider: Meter Chole Na

## Game Design Document and Development Blueprint

**Document type:** Game concept, narrative design, gameplay systems, and
implementation roadmap\
**Working title:** *Dhaka Bike Rider: Meter Chole Na*\
**Genre:** Open-world motorcycle simulator, ride-hailing economy,
narrative life simulation\
**Setting:** A fictionalized, Dhaka-inspired urban environment in
Bangladesh\
**Primary design goal:** Make each ride feel like a small story shaped
by driving skill, local knowledge, negotiation, and judgment.

------------------------------------------------------------------------

## 1. High Concept

The player controls one main protagonist, a motorcycle ride-hailing
rider who works across a compact but dense Dhaka-inspired city. The
player picks up passengers, bargains over fares, navigates traffic,
chooses routes, handles pickup complications, manages expenses, and
responds to unexpected encounters.

Passengers, pedestrians, other drivers, traffic police, shopkeepers,
mechanics, and potential criminals are controlled by the game.

The game should not simply be a racing game with Bangladeshi buildings.
Its distinguishing feature is the social experience of being a bike
rider in Dhaka: bargaining, negotiating pickup points, dealing with
U-turns, refusing impractical alleys, deciding whether to take off-app
rides, and balancing income against risk.

### Design pillars

1.  **Local behavior affects gameplay.** Asking a passenger to cross at
    a safe, convenient point or refusing an unsuitable alley must change
    the trip.
2.  **Player agency.** There should be several reasonable ways to handle
    most passenger situations.
3.  **A meaningful economy.** Revenue is not the same as profit; time,
    fuel, commission, maintenance, and risk matter.
4.  **A living but fair city.** Traffic can be chaotic, but the player
    needs reasonable ways to react.
5.  **Humor from recognizable situations.** Awkward bargaining,
    conflicting directions, passenger excuses, and traffic frustrations
    create humor without making every character a caricature.
6.  **Consequences and relationships.** Reputation and recurring
    characters should respond to the player's behavior.
7.  **A fun first ride.** Driving, negotiating, and completing one trip
    must be satisfying before the world expands.

------------------------------------------------------------------------

## 2. Title, Tone, and Audience

### Working title

**Dhaka Bike Rider: Meter Chole Na**

The title is provisional. It suggests local street culture and fare
negotiation, but should be checked for branding conflicts before
release.

### Tone

Grounded, lively, occasionally comedic, and socially observant. The game
should depict the pressures of city work without turning every passenger
or neighborhood into a stereotype.

### Target experience

-   Short, replayable rides.
-   A longer career mode with story missions.
-   Optional free roaming and emergent encounters.
-   A city that feels recognizably Bangladeshi through street layout,
    architecture, signs, markets, rickshaws, buses, CNGs, tea stalls,
    weather, and everyday interactions.

------------------------------------------------------------------------

## 3. Protagonist and Main Story

### Rafi Hasan

-   **Age:** 24
-   **Role:** Bike-sharing rider
-   **Starting situation:** Rafi lives in a modest rented flat in Dhaka
    and owns an aging used motorcycle.
-   **Long-term goal:** Save enough money to open a small motorcycle
    repair workshop.
-   **Strengths:** Local knowledge, practical judgment, persistence, and
    an ability to read people.
-   **Weaknesses:** Limited savings, a worn motorcycle, financial
    pressure, and occasional temptation to take risky jobs.

Rafi understands the city through experience. He knows which
intersections get blocked, which shortcuts save time, which passengers
bargain, and which roads become difficult after rain.

### Player-shaped identity

The game should not force Rafi into one personality. His identity
emerges from the player's choices:

-   **Professional rider:** safe, reliable, and highly rated.
-   **Street-smart negotiator:** skilled at profitable trip selection
    and managing difficult passengers.
-   **Reckless hustler:** willing to take shortcuts, speed, or accept
    risky jobs for quick cash.
-   **Neighborhood regular:** helps stranded people, remembers repeat
    passengers, and builds local trust.

These are behavioral tendencies, not fixed classes.

### Opening sequence: First Ride

The game begins at 7:00 AM in a fictional neighborhood inspired by
Mirpur.

1.  Rafi wakes up to a phone alarm.
2.  His mother reminds him about an upcoming household expense.
3.  He checks his wallet and sees that he has limited cash.
4.  He inspects his motorcycle, notices low fuel, and starts the engine.
5.  At a nearby tea stall, a friend says demand is high around Farmgate.
6.  Rafi opens the ride app and accepts his first request.
7.  His first passenger is a university student heading toward a nearby
    campus.
8.  The passenger offers less than Rafi expects, introducing fare
    negotiation.
9.  The ride teaches pickup, route selection, traffic, drop-off, and
    payment.

The tutorial should feel like a normal workday, not a list of
disconnected instructions.

------------------------------------------------------------------------

## 4. World Design: A Compact Dhaka

The first map should be a small, dense, interconnected section of the
city---not an enormous map full of empty roads. Use a fictionalized
layout inspired by real neighborhoods. Compress distances where
necessary to preserve a good gameplay pace.

### Proposed districts

  -------------------------------------------------------------------------
  District                  Gameplay purpose        Features
  ------------------------- ----------------------- -----------------------
  Mirpur-inspired area      Starting neighborhood   Residential roads,
                                                    markets, schools,
                                                    crowded junctions

  Farmgate-inspired area    High-demand pickup zone Busy intersections,
                                                    buses, office commuters

  Dhanmondi-inspired area   Mixed passenger types   Universities,
                                                    hospitals, cafes,
                                                    residential streets

  Mohakhali-inspired area   Challenging traffic     Bus terminals, offices,
                                                    flyovers, bottlenecks

  Gulshan/Banani-inspired   Higher-value trips      Wider roads, offices,
  area                                              restaurants, security
                                                    gates

  Old Dhaka-inspired area   Advanced driving        Narrow lanes, markets,
                            challenge               pedestrians, difficult
                                                    turns

  Motijheel-inspired area   Commercial demand       Offices, crowded
                                                    crossings, rush-hour
                                                    traffic
  -------------------------------------------------------------------------

### Road types

-   **Main roads:** Multiple lanes, buses, cars, motorcycles, and
    traffic lights.
-   **Residential roads:** Parked vehicles, pedestrians, schoolchildren,
    and speed bumps.
-   **Narrow alleys:** Limited turning space and access restrictions
    where appropriate.
-   **Service roads:** Useful shortcuts with unpredictable obstructions.
-   **Flyovers and U-turns:** Route-choice challenges affecting time and
    fuel.
-   **Market roads:** Pedestrian density, vendors, rickshaws, and
    occasional blockages.

### Road-segment data

Each segment should have attributes such as: - Width and surface
condition. - Traffic density and typical speed. - Legal direction and
turn restrictions. - U-turn availability. - Pedestrian density. -
Flooding or rain sensitivity. - Risk level for designed encounters. -
Whether motorcycles can access the segment. - Whether a pickup/drop-off
is practical.

### World landmarks

Create recognizable but fictionalized locations: tea stalls, pharmacies,
schools, small garages, fuel stations, markets, apartment blocks, bus
stops, flyovers, and office entrances. Use local signage and visual
references without making the map dependent on exact real-world
geography.

------------------------------------------------------------------------

## 5. Core Gameplay Loop

1.  **Find a passenger.** Wait for app requests, cruise through demand
    zones, or accept a street pickup.
2.  **Negotiate.** Discuss fare, destination, pickup point, route, and
    payment method.
3.  **Ride.** Handle traffic, shortcuts, roadblocks, weather,
    pedestrians, and fuel.
4.  **React.** Resolve disputes, help passengers, reject unsafe detours,
    or respond to suspicious encounters.
5.  **Complete the trip.** Drop off the passenger, receive payment, and
    get a rating or review.
6.  **Manage the business.** Buy fuel, eat, repair the motorcycle, pay
    expenses, and plan the next shift.

The player should be able to ignore the main story and continue working,
exploring, meeting passengers, and improving the motorcycle. Story
missions unlock neighborhoods, characters, and opportunities rather than
forcing every ride into a fixed narrative.

------------------------------------------------------------------------

## 6. Ride Requests and Negotiation

Negotiation is the signature mechanic. It should be more sophisticated
than a dialogue box with three fare buttons.

### Passenger request fields

Each request can include: - Pickup location and destination. - Desired
arrival time. - Initial fare offer or app estimate. - Willingness to
walk to a better pickup point. - Patience and negotiation style. -
Special circumstances: rain, luggage, an urgent appointment, or
traveling with a child. - Payment preference and reliability. -
Familiarity with the area. - Prior relationship with Rafi.

### Player options

-   Accept the proposed fare.
-   Counteroffer with a higher price.
-   Offer a discount.
-   Ask the passenger to move to the other side of a divided road.
-   Explain that a U-turn or detour increases the cost.
-   Refuse a narrow or unsafe alley.
-   Ask whether the passenger wants to book through the app or arrange a
    direct trip.
-   Cancel before pickup or decline the request.
-   Offer a compromise based on a shorter pickup walk or route change.

### Example conversation

Passenger: "ভাই, ধানমন্ডি যাব। ৮০ টাকা হবে?"

Possible responses: - "আচ্ছা ভাই, ৮০ টাকায় চলেন।" --- Accept ৳80. - "ভাই,
১০০ দেন। জ্যাম অনেক।" --- Counteroffer ৳100. - "৯০ দেন, আপনার জন্য কম
রাখলাম।" --- Offer a discounted counteroffer. - "এই ভাড়ায় হবে না ভাই।"
--- Decline.

These figures are illustrative, not claims about current real-world
fares. Actual fares should be balanced using trip distance, expected
duration, demand, traffic, and local fare assumptions.

### Negotiation model

Let: - `F` = rider's quoted fare. - `B` = passenger's expected budget. -
`U` = urgency. - `P` = patience. - `R` = trust in the rider. - `T` =
expected traffic or inconvenience.

A starting acceptance model can be:

`P(accept) = sigmoid(a * (B - F) / max(B, 1) + b*U + c*R + d*P - e*T)`

The coefficients `a`, `b`, `c`, `d`, and `e` are tunable parameters. The
model creates varied outcomes without requiring a unique script for
every passenger.

Acceptance should not be purely random. The same passenger should behave
consistently enough for players to learn their preferences, while mood
and circumstances can introduce variation.

### Off-app rides

Passengers may ask to travel outside the app in exchange for a lower
fare. The player can accept, decline, or negotiate. Direct trips may
reduce platform commission and create repeat customers, but they should
also introduce realistic risks: less formal trip tracking, payment
disputes, cancellation uncertainty, and possible account-policy
consequences. The game should communicate the trade-offs clearly.

------------------------------------------------------------------------

## 7. Signature Dhaka Situations

These encounters should arise naturally during ordinary rides. Each
needs a clear trigger, player choice, and consequence.

### 7.1 "ভাই, এই রাস্তা দিয়ে যান"

A passenger insists on a shortcut that Rafi knows is blocked by a
market.

Choices: - Follow the passenger's suggestion. - Explain the likely
delay. - Choose another route.

Systems: route planning, passenger trust, traffic prediction.

### 7.2 The U-turn problem

A passenger is waiting on the opposite side of a divided road. Picking
them up requires a long detour to a legal U-turn.

Choices: - Ask the passenger to cross at a safe, convenient crossing
point. - Travel to the designated pickup point. - Cancel the request.

Systems: pickup positioning, detour cost, safety, negotiation.

The game should not reward unsafe crossing. The goal is to find a safe
and practical meeting point without wasting unnecessary time.

### 7.3 "ভাই, গলির ভিতরে ঢুকেন"

A passenger asks Rafi to enter a narrow alley that is congested or
unsuitable for the motorcycle.

Choices: - Refuse politely and ask the passenger to walk to the main
road. - Stop at a safe nearby location. - Enter only if the alley is
accessible and the player judges the detour worthwhile.

Systems: access restrictions, walking distance, passenger mood, risk
assessment.

### 7.4 "অ্যাপের বাইরে যাবেন?"

A passenger offers a direct trip outside the app.

Choices: - Accept. - Stay on the app. - Negotiate a fare and conditions.

Systems: commission, direct-customer relationships, risk, repeat
business.

### 7.5 Sudden rain

Traffic slows, roads become slippery, demand may increase, and a
passenger asks for a fast trip.

Choices: - Drive cautiously. - Stop somewhere sheltered if conditions
are too poor. - Take unnecessary risks to try to earn more.

Systems: weather, traction, visibility, demand, accident risk.

### 7.6 Puncture at the worst time

Rafi gets a flat tire during a busy period.

Choices: - Pay a nearby mechanic. - Slowly reach a workshop if safe. -
Call a contact for help.

A familiar mechanic may charge less; an unfamiliar one may cost more but
get the bike running faster.

### Additional encounters

-   A passenger claims to have no change at drop-off.
-   A customer requests an extra stop without offering extra payment.
-   A parent requests a short trip with a child.
-   A passenger is late for an exam or job interview.
-   A customer has entered the wrong pickup pin.
-   A street vendor asks for a discounted ride.
-   A passenger leaves a phone behind.
-   A traffic checkpoint appears on the route.
-   A bus blocks the road, forcing a detour.
-   A regular passenger calls Rafi directly for another trip.
-   A friend asks for an urgent package delivery.
-   A passenger asks Rafi to wait while they finish an errand.

Each encounter should have a small number of meaningful choices. Not
every event needs a long cutscene.

------------------------------------------------------------------------

## 8. Crime and Robbery Encounters

The city should sometimes feel unpredictable, but crime should be a
risk-management system rather than a reason to make every alley
dangerous.

Possible encounter setups: - A suspicious pickup request. - A staged
pickup or destination change. - A group blocking a narrow lane. - A
robbery attempt during a trip. - A local extortion scheme that becomes
part of a story mission.

Possible responses: - Turn around before entering a suspicious area. -
Refuse the pickup and report it. - Attempt to leave if a situation
becomes threatening. - Comply with a robbery and surrender cash or the
phone. - Call for help if the phone is usable and there is enough
time. - In a rare story mission, cooperate with police or help expose a
local extortion scheme.

If the game allows the player to rob an NPC, make it an optional moral
branch with consequences rather than a default money-making strategy.
Theft can damage reputation, attract police attention, affect recurring
characters, and close or open story paths. It should not be universally
profitable.

### Encounter probability

A road segment can carry an encounter probability based on: - Fictional
area risk. - Time of day. - Visibility. - Current story events. - Player
behavior and prior consequences.

An encounter does not automatically mean a robbery. It may be harmless,
suspicious, or dangerous. This keeps the city from feeling artificially
hostile.

------------------------------------------------------------------------

## 9. Passenger AI

Use reusable passenger archetypes with adjustable variables instead of
writing thousands of unique scripts.

### Archetype A: The Bargainer

-   Starts with a low offer.
-   Counters once or twice.
-   May walk away if the fare is too high.
-   Typical traits: low budget, moderate patience, high bargaining
    tendency.

### Archetype B: The Office Commuter

-   Values punctuality and predictable routes.
-   May accept a higher fare if the trip saves time.
-   Typical traits: medium budget, low patience during rush hour.

### Archetype C: The Careful Passenger

-   Prefers safe driving, clear communication, and accessible pickup
    points.
-   Aggressive riding damages trust.
-   Typical traits: safety-sensitive, moderate patience, preference for
    clear routes.

### Archetype D: The Local Regular

-   Knows the neighborhood.
-   Can recommend shortcuts, warn about roadblocks, or introduce future
    customers.
-   Typical traits: local knowledge and relationship-based repeat
    bookings.

### Archetype E: The Risky Customer

-   May offer an unusually high fare, request an awkward pickup, or
    change the destination.
-   Not every unusual request is criminal.
-   Typical traits: uncertain intent, variable payment reliability,
    higher potential risk.

### Passenger state machine

Suggested states: 1. `WaitingForPickup` 2. `Negotiating` 3. `OnTrip` 4.
`HandlingIncident` 5. `Completed` 6. `Reviewed` 7. `Cancelled`

Typical transitions: - `WaitingForPickup` → `Negotiating` when the rider
arrives. - `Negotiating` → `WaitingForPickup` if a fare is rejected and
the passenger continues waiting. - `Negotiating` → `OnTrip` when the
fare is accepted. - `WaitingForPickup` → `Cancelled` if the passenger
cancels. - `OnTrip` → `HandlingIncident` when an event occurs. -
`HandlingIncident` → `OnTrip` when the trip continues. -
`HandlingIncident` → `Completed` if the trip ends early. - `OnTrip` →
`Completed` when the destination is reached. - `Completed` → `Reviewed`
after payment and rating.

Use explicit state transitions to prevent contradictory behavior---for
example, a passenger bargaining after leaving the motorcycle unless the
game deliberately triggers a payment dispute.

------------------------------------------------------------------------

## 10. Economy and Progression

Money should be meaningful. The player needs to understand the
difference between revenue and actual profit.

### Income

-   App trips.
-   Direct bookings.
-   Tips.
-   Delivery jobs.
-   Special mission rewards.

### Variable costs

-   Fuel.
-   Parking.
-   App commission.
-   Trip-related expenses.

### Maintenance costs

-   Oil changes.
-   Tires.
-   Brakes.
-   General repairs.

### Living expenses

-   Food.
-   Rent.
-   Family contribution.
-   Phone data.

### Upgrades and investments

-   Better tires, brakes, lights, luggage carrier, or motorcycle.
-   Repair tools or reduced workshop costs.
-   Improved phone and navigation.
-   A local customer network.
-   Eventually, a small motorcycle workshop or delivery partnership.

### Net earnings

`Net earnings = fare + tip - commission - fuel cost - other trip costs`

A hypothetical ৳150 ride may produce much less profit if the passenger
negotiates heavily, traffic doubles the journey time, or the motorcycle
consumes more fuel than expected. These numbers must be balanced and
should not be presented as real-world average fares.

### Upgrade effects

-   Better tires improve grip on wet roads.
-   Better brakes reduce stopping distance.
-   A more efficient engine reduces fuel expense.
-   Improved lights help night visibility.
-   A better phone improves navigation and battery life.
-   Maintenance tools reduce downtime or repair costs.

Upgrades should matter mechanically, but expensive upgrades should not
be mandatory for basic story progression.

------------------------------------------------------------------------

## 11. Traffic and World Simulation

A convincing Dhaka-inspired simulator needs more than cars following
lanes.

### Traffic actors

-   Motorcycles and scooters.
-   Buses and minibuses.
-   Cars and ride-hailing vehicles.
-   CNG auto-rickshaws.
-   Cycle rickshaws.
-   Pedestrians and street vendors.
-   Traffic police and road workers.

Actors should follow basic rules while occasionally behaving
unpredictably. A bus may stop to pick up passengers, a rickshaw may turn
slowly, or a pedestrian may cross outside a designated crossing. Events
should be varied and bounded so collisions are not unavoidable.

### Dynamic world systems

**Time of day** - Morning and evening rush hours. - Quieter midday
roads. - Late-night demand and reduced visibility.

**Weather** - Rain changes traction, visibility, road speed, passenger
demand, and trip duration. - Standing water may make some routes slower
or temporarily inaccessible.

**Road events** - Construction. - Stalled vehicles. - Market
congestion. - Blocked intersections. - Diversions and temporary
closures.

**Route intelligence** - Estimate travel time. - Show legal U-turns. -
Highlight narrow or restricted roads. - Update when a route becomes
blocked.

### Simulation performance

Use different levels of fidelity: - Nearby vehicles use detailed
movement and collision behavior. - Distant traffic is simulated more
cheaply. - Pedestrians outside the active area can use simplified
logic. - Spawn and despawn actors based on distance and visibility,
while avoiding noticeable popping.

------------------------------------------------------------------------

## 12. Campaign Story: Six Chapters

The campaign can run across approximately 15--20 in-game days, with
optional rides between major missions.

### Chapter 1 --- First Gear (Days 1--3)

Rafi begins with little cash and an aging motorcycle. He learns to
accept trips, bargain, navigate, and pay for fuel.

**Final mission:** Earn enough to cover the week's expenses without
missing an important household payment.

### Chapter 2 --- The Rush Hour Hustle (Days 4--6)

Rafi discovers profitable pickup zones and meets regular passengers. He
learns that the highest fare is not always the most profitable trip once
traffic and fuel are considered.

**Final mission:** Complete several rides across districts before the
evening rush peaks.

### Chapter 3 --- Rain, Roads and Regrets (Days 7--9)

Heavy rain makes familiar routes unpredictable. One passenger pressures
Rafi to drive faster, while another needs urgent help reaching a
hospital.

**Final mission:** Make difficult choices about safety, earnings, and
helping others during a citywide traffic disruption.

### Chapter 4 --- The Narrow Lane (Days 10--12)

Rafi accepts a high-paying trip toward an unfamiliar neighborhood.
Conflicting directions, a suspicious pickup, and a possible robbery
force him to decide when to trust his instincts.

**Final mission:** Get home safely and decide whether to cooperate with
a police investigation.

### Chapter 5 --- The Regulars (Days 13--16)

Earlier passengers begin returning. Rafi's choices determine whether he
has loyal customers, poor ratings, unpaid expenses, or helpful contacts.

**Final mission:** Complete a day of linked jobs arranged by regular
customers, with opportunities to honor or break promises.

### Chapter 6 --- Beyond the Ride (Days 17--20)

Rafi approaches his savings goal. He must choose between buying a better
motorcycle, investing in a small repair workshop, or continuing to work
independently.

**Final mission:** Make a financial decision reflecting the reputation,
relationships, and resources he has built.

### Multiple endings

**The Independent Rider:** Rafi buys a better motorcycle and continues
building his customer base.

**The Workshop Owner:** He opens a modest motorcycle repair shop and
hires a local mechanic.

**The Trusted Local:** He becomes known for reliable service and
community support.

**The Fast Money Ending:** He earns substantial cash through risky
decisions but loses relationships and faces lasting consequences.

**The Fresh Start:** After financial setbacks, he changes neighborhoods,
repairs his reputation, and starts again.

A player who earns less money but builds trust should have a legitimate
path to success. Endings should depend on more than cash: reputation,
relationships, safety record, and key story choices should matter.

------------------------------------------------------------------------

## 13. User Interface and Controls

The player needs to operate a motorcycle and make decisions quickly, so
the UI must be legible and unobtrusive.

### Main riding HUD

-   Today's net earnings.
-   Fuel level.
-   Current speed.
-   Destination and estimated time.
-   Next navigation instruction.
-   Passenger status.
-   Shift duration.
-   Reputation or rating.

### Required screens

1.  **Main riding view:** Third-person motorcycle camera, speed, fuel,
    route, nearby traffic.
2.  **Phone screen:** Ride requests, passenger details, navigation, trip
    history, direct bookings.
3.  **Negotiation screen:** Fare offer, counteroffer, pickup adjustment,
    accept, decline.
4.  **Pause/map screen:** Neighborhood map, destinations, fuel stations,
    repair shops, mission markers.
5.  **End-of-trip screen:** Fare collected, expenses, net earnings,
    rating, consequences.
6.  **Garage screen:** Bike condition, upgrades, repairs, cosmetics.
7.  **Story journal:** Recurring characters, promises, reputation,
    unlocked missions.

### Controls

**Mobile** - Left-side steering. - Right-side throttle and brake. -
Optional tilt steering. - Large dialogue buttons that do not overlap
driving controls.

**PC** - Keyboard and controller support. - Remappable controls. -
Optional first-person and third-person camera modes.

Keep the interface clean. Do not put essential negotiation controls over
a dangerous driving area where the player cannot safely make a choice.

------------------------------------------------------------------------

## 14. Technical Architecture

Build the game as independent systems so the negotiation mechanics can
be tested without completing the city.

### Recommended engine

**Unity** is the recommended starting point for a mobile-first 3D game,
given its established Android workflows, physics tools, and asset
ecosystem.

**Unreal Engine 5** is an alternative if realistic visuals and advanced
lighting are the main priority and the development team can manage its
performance and content demands.

The initial recommendation is Unity for an Android-first prototype.
Build a small map and one motorcycle before investing in realistic
graphics or a large city.

### Core modules

  -----------------------------------------------------------------------
  Module                              Responsibility
  ----------------------------------- -----------------------------------
  `GameManager`                       Session state, time,
                                      initialization, save/load
                                      coordination

  `MotorcycleController`              Acceleration, braking, steering,
                                      lean, collisions

  `TrafficManager`                    Vehicle spawning, traffic movement,
                                      congestion

  `RoadNetwork`                       Road connections, restrictions,
                                      U-turns, routefinding

  `PassengerAI`                       Passenger profiles, mood, patience,
                                      intentions

  `NegotiationSystem`                 Fare offers, counteroffers,
                                      acceptance probabilities

  `RideManager`                       Request lifecycle, pickup, trip,
                                      drop-off, cancellation

  `EconomyManager`                    Fare revenue, commission, fuel,
                                      repairs, living expenses

  `ReputationSystem`                  Ratings, repeat passengers, trust,
                                      consequences

  `MissionManager`                    Story progression, objectives,
                                      branching missions

  `EventDirector`                     Rain, roadblocks, robbery
                                      encounters, random events

  `SaveSystem`                        Player progress, money, bike
                                      condition, relationships
  -----------------------------------------------------------------------

Keep these systems loosely coupled. For example, the negotiation system
should return a decision; it should not directly control the motorcycle
or deduct fuel.

### Suggested data structures

**PassengerProfile** - `passengerId` - `archetype` - `budget` -
`patience` - `urgency` - `bargainingTendency` - `safetySensitivity` -
`trustInRider` - `localKnowledge` - `paymentReliability` -
`relationshipLevel`

**RideRequest** - `requestId` - `passengerId` - `pickupNodeId` -
`destinationNodeId` - `initialFare` - `estimatedDistance` -
`estimatedDuration` - `requestedArrivalTime` - `bookingType` - `status`

**RoadSegment** - `segmentId` - `startNodeId` - `endNodeId` - `width` -
`surfaceCondition` - `trafficDensity` - `speedLimit` -
`turnRestrictions` - `motorcycleAccessible` - `pedestrianDensity` -
`riskLevel`

**PlayerEconomy** - `cash` - `dailyRevenue` - `dailyExpenses` -
`fuelLevel` - `motorcycleCondition` - `appBalance` - `debt` -
`reputation`

**StoryState** - `currentChapter` - `completedMissions` -
`activeMissions` - `characterRelationships` - `promises` -
`branchFlags` - `endingEligibility`

### Core system boundaries

-   `RideManager` owns the trip lifecycle.
-   `NegotiationSystem` determines whether an offer is accepted.
-   `RoadNetwork` handles route validity and navigation.
-   `EconomyManager` calculates costs and earnings.
-   `ReputationSystem` processes ratings and trust changes.
-   `MissionManager` observes events and updates objectives.
-   `EventDirector` chooses suitable events and sends them to the
    relevant system.
-   `SaveSystem` serializes persistent state.

------------------------------------------------------------------------

## 15. Development Roadmap

Build and test the game incrementally. The first objective is to prove
that one ride is fun.

### Phase 1 --- Driving prototype

Implement: - Motorcycle controller. - Camera. - Collision. - A small
road network. - One passenger. - Pickup and drop-off.

**Exit criterion:** The player can complete a ride without a scripted
cutscene controlling the motorcycle.

### Phase 2 --- Simulation

Implement: - Passenger archetypes. - Fare negotiation. - Fuel use. -
Detours and route choices. - Basic AI traffic.

**Exit criterion:** Repeated rides produce meaningfully different
outcomes.

### Phase 3 --- Vertical slice

Build a polished 10--15 minute session: - One compact Dhaka-inspired
neighborhood. - Recognizable buildings and signs. - A tea stall, fuel
station, repair shop. - Weather. - Five varied encounters.

**Exit criterion:** A new player understands the game and enjoys a
complete session.

### Phase 4 --- Campaign

Add: - Recurring passengers. - Household expenses. - Reputation. - Bike
upgrades. - A crime encounter. - The first campaign chapters.

**Exit criterion:** The player has a reason to return beyond earning
more money.

### Phase 5 --- Expansion

Add: - More districts. - More traffic types. - Side missions. -
Additional motorcycles. - Richer dialogue. - Mobile performance
optimization.

**Exit criterion:** New content reuses stable systems rather than
introducing fragile one-off scripts.

------------------------------------------------------------------------

## 16. Version 1.0 Scope

Keep the first release limited enough to finish.

-   [ ] One playable protagonist and motorcycle.
-   [ ] One compact Dhaka-inspired neighborhood.
-   [ ] Basic traffic, pedestrians, and collisions.
-   [ ] Five passenger archetypes.
-   [ ] Fare negotiation and pickup adjustments.
-   [ ] Fuel, earnings, expenses, and repairs.
-   [ ] U-turn, narrow alley, and off-app scenarios.
-   [ ] One robbery or suspicious-pickup event.
-   [ ] Five story missions and one ending.
-   [ ] Save/load and a functional mobile HUD.

### Defer until later

-   Multiplayer.
-   A huge city.
-   Advanced criminal AI.
-   Complex traffic simulation across the whole map.
-   Hundreds of missions.
-   Large-scale voice acting.
-   Multiple cities.
-   Extensive vehicle licensing and customization systems.

None is necessary to validate the core concept.

------------------------------------------------------------------------

## 17. Testing and Balancing

Test more than whether the game runs. Test whether its systems produce
fair, understandable outcomes.

### Driving tests

-   Can the player brake and turn predictably?
-   Are collisions understandable rather than arbitrary?
-   Can the player recover from a missed turn?
-   Do wet roads feel different without becoming uncontrollable?

### Negotiation tests

-   Do passengers have distinct behavior?
-   Can players understand why a fare was accepted or rejected?
-   Is declining a bad ride sometimes the correct decision?
-   Can the player make a reasonable profit without exploiting a single
    strategy?

### Economy tests

-   Does fuel cost scale sensibly with distance and traffic?
-   Can a player recover after a bad day?
-   Are repairs meaningful without becoming a constant punishment?
-   Are off-app rides a trade-off rather than a guaranteed exploit?

### Narrative tests

-   Do recurring characters remember important choices?
-   Are multiple endings achievable through different play styles?
-   Does the game avoid treating every risky passenger as a criminal?
-   Do helpful and safe choices have meaningful outcomes?

### Performance tests

-   Test on the lowest target Android hardware.
-   Measure frame rate in dense traffic.
-   Profile memory and loading times.
-   Use simplified distant traffic.
-   Avoid loading the whole city at once.

------------------------------------------------------------------------

## 18. Final Design Principles

1.  **Local behavior must affect gameplay.** Crossing requests, U-turns,
    alley access, and bargaining must change outcomes.
2.  **The player must have agency.** Most interactions should offer more
    than one viable choice.
3.  **The economy must be consistent.** A high fare is not automatically
    a high-profit trip.
4.  **The city must feel alive without being unfair.** Traffic can be
    unpredictable, but not impossible to respond to.
5.  **Humor should come from recognizable situations.** Avoid
    caricaturing passengers or neighborhoods.
6.  **The story must respond to behavior.** A reckless rider, a trusted
    local, and a money-focused hustler should not all receive the same
    ending.
7.  **Start small.** A polished ride loop is more valuable than a huge
    unfinished map.
8.  **Build systems, not one-off scripts.** Reusable passengers, road
    events, and state machines make the game expandable.
9.  **Keep safety choices meaningful.** The game can depict risk without
    making dangerous actions the optimal strategy.
10. **Make the first ride fun.** If driving, negotiating, and completing
    a trip are not satisfying, adding buildings will not fix the game.

------------------------------------------------------------------------

## 19. Decisions to Finalize Before Implementation

These four choices will shape the initial technical plan:

### Primary platform

-   Android mobile first.
-   PC first.
-   PC and Android together.

### Visual style

-   Realistic, detailed Dhaka.
-   Stylized, optimized 3D.
-   Low-poly, lightweight 3D.

### Camera

-   Third-person behind the rider.
-   First-person / rider's-eye.
-   Both perspectives.

### Main experience

-   Story-driven career with free roaming.
-   Open-world sandbox with emergent events.
-   Hybrid: career missions and endless ride mode.

### Recommended default

Android-first, optimized 3D, third-person camera, and a hybrid
career/sandbox mode. This gives the project a manageable starting point
while preserving the larger vision of a living Dhaka motorcycle-riding
game.

------------------------------------------------------------------------

## 20. Immediate Next Steps

1.  Choose the engine and target device.
2.  Create a test scene with a simple road, a motorcycle, and a follow
    camera.
3.  Tune acceleration, steering, braking, and collisions before adding
    traffic.
4.  Add a passenger pickup marker and one destination marker.
5.  Implement a single ride from request to payment.
6.  Add fare negotiation with three passenger archetypes.
7.  Track fare, fuel, trip time, and net earnings.
8.  Play-test repeated rides and revise the core loop.
9.  Only then add more roads, characters, traffic, weather, and story
    content.

**Success criterion for the first prototype:** A player can pick up a
passenger, negotiate a fare, navigate a short Dhaka-inspired route,
handle one unexpected event, drop off the passenger, and understand how
much money was earned or lost.

That is the smallest complete version of the game's central promise.
