# Progress: Afnan Mojumder

One line per finished task: `YYYY-MM-DD Tx.y done — note`

2026-10-25 T0.1 done — Vite scaffold, exact dependencies, configs, basic checks and e2e passing
2026-10-25 T0.2 done — Core utilities (rng, events, commands, fsm, clock, math, types) implemented with full contracts and unit tests passing
2026-10-25 T0.3 done — GameManager skeleton, deterministic fixed-step loop, snapshot, and debugApi __uthao
2026-10-25 T1.1 done — Bike model pure math (stepBike, BikeSpec, BikeState) and balance configuration with unit tests passing
2026-10-25 T1.5 done — RoadNetwork v0, spatial queries, A* routing (one-way, accessibility, divided U-turn, closure avoidance), and testloop district
2026-10-25 T1.2 done — Rapier PhysicsWorld, Kinematic MotorcycleController with collision resolution and near-miss detection
2026-10-25 T1.3 done — Three.js WebGLRenderer, spring-damped CameraRig with dynamic FOV and anti-clip, procedural motorcycle mesh, and test scene passing e2e screenshots & fps probe
2026-10-25 T1.6 done — Passenger FSM, RideManager, 3D markers & pillion passenger mesh, Preact HUD, AutopilotController, and e2e autopilot ride test green; M1 feel check: fixed-step loop ensures predictable braking (10m from 40 km/h) and smooth cornering
2026-10-25 T2.1 done — RequestGenerator with Poisson arrivals, fare model, surge cap, and archetypes.json with unit tests passing
2026-10-25 T2.2 done — PassengerAI expected budget, opening offers, and mood reactions to near misses, bumps, lateness, and horn spam
2026-10-26 T2.3 done — Pure NegotiationSystem with sigmoid acceptance formula, patience decay, counteroffers, detour/walk penalties, and dialogue keys
2026-10-26 T2.6 done — EconomyManager with debt conversion, fuel consumption, receipts matching GDD, and TripSummary UI
2026-10-26 T2.5 done — pickupOptions with crossing nodes, mid-trip closure rerouting, off-app policy strikes and suspensions
2026-10-27 T2.7 done — Lane graph with left-hand traffic, IDM car following, signal controller, and TrafficManager
2026-10-27 T2.9 done — Headless bot simulation strategies, balance tests v1, and benchmark report in docs/BALANCE.md
2026-10-27 T3.2 done — District generator, Mirpara 600x600m district with divided arterial, market street, alleys, and 2D MapViewer tool
2026-10-27 T3.5 done — Time of day cycle, WeatherSystem with flood accumulation, and WeatherFx rendering with rain, headlights, and streetlights
2026-10-27 T3.6 done — EventDirector, encounter conditions/effects, ChoiceCard UI, and encounter data schemas
2026-10-27 T3.3 done — CityBuilder procedural roads, Dhaka apartment blocks, Bangla signage atlas, LOD culling, and Playwright 30s autopilot perf budget verification (75 draw calls <= 150, 2.8k tris <= 300k)
2026-10-27 T3.4 done — PedestrianManager with fairness-bounded jaywalking (1.5x stopping distance), bus stop dwelling (10-20s), rickshaws (3.5 m/s, slow turns), horn yield, and PeopleRenderer instanced rendering
2026-10-27 T4.2 done — ReputationSystem with rolling 50 ratings, localTrust (0-100), character relationships, safetyRecord, riskScore, promises, and low rating request rate reduction
2026-10-27 T4.6 done — Crime and suspicious-pickup system: per-segment encounter probability, outcome split (60% harmless / 30% suspicious / 10% dangerous), flee resolution, robbery cash-on-hand loss rules (savings untouched), and turn-around choices
2026-10-27 T5.3 done — Authentic Dhaka traffic types (minibus/leguna, delivery van, night-only trucks, bicycles, scooters, ride-hailing cars, vendor carts, road workers), signature behaviors (bus racing to stops, bounded CNG weaving [-0.6m, +0.6m], wrong-way residential rickshaws), and RoadEvents system with closures, construction, diversions, market congestion, speed caps, and routing avoidance
2026-10-27 T5.1 done — Six contiguous Dhaka districts (fulgate, dhanbagh, mohakhal, gulbari, puranpara, motinagar) and unified world.json; Mohakhal flyover elevated spans and ramps, Gulbari officeGate security drop-offs, Puranpara narrow/inaccessible alleys, 36 bilingual POI keys, and 100% strongly-connected road network across all borders
2026-10-27 T5.2 done — Multi-district streaming (400m load, 700m hysteresis unload), time-sliced building task queue (<= 4ms/frame), low-poly silhouette instancing, and e2e cross-district drive passing at 49 FPS on Pixel 7 low (<= 111 draw calls)
2026-10-27 T5.9 done — Performance optimisation (zero-allocation physics vectors/character movement, stepBike pooling, traffic agent lane map reuse, rickshaw loop culling, weather particle tiering) and PWA (manifest, service worker offline cache, install prompt handling) passing all budgets

