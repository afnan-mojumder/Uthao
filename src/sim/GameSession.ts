import { GameManager } from './GameManager';
import { RideManager } from './ride/RideManager';
import { RequestGenerator } from './ride/RequestGenerator';
import { TrafficManager } from './traffic/TrafficManager';
import type { RoadNetwork } from './road/RoadNetwork';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { MotorcycleController } from '../physics/MotorcycleController';
import {
  createDefaultBikeSpec,
  createDefaultBikeState,
  stepBike,
  type BikeInput,
  type BikeSpec,
  type BikeState,
  type BikeEnvironment,
} from '../physics/bikeModel';
import { SIM_DT } from '../config/constants';
import { TIME_SCALE } from '../core/clock';
import { clamp } from '../core/math';
import { receipt as buildReceipt, fuelUsed } from './economy/fuel';
import type { TripReceipt } from '../core/types';
import type { BikeCollisionSeverity } from '../core/types';

// ponytail: proximity thresholds, not measured against real bike/vehicle
// hitboxes — revisit with real collider shapes if this reads as too lenient/strict.
const TRAFFIC_COLLISION_MARGIN_M = 0.6;
const TRAFFIC_NEAR_MISS_MARGIN_M = 1.5;
const TRAFFIC_NEAR_MISS_MIN_SPEED_MS = 20 / 3.6;

export interface GameSessionOptions {
  gm: GameManager;
  road: RoadNetwork;
  physics?: PhysicsWorld;
  /** Whether RequestGenerator automatically offers rides each step. Debug/test
   * single-district boots set this false and inject a deterministic ride instead. */
  autoRequests?: boolean;
}

/**
 * Composition root for the live per-tick simulation loop. Owns the sim-side
 * objects (GameManager, RideManager, RequestGenerator, TrafficManager) and the
 * bike state, and advances them all together in `step()` so the real game,
 * Vitest, and bots drive the exact same loop.
 */
export class GameSession {
  readonly gm: GameManager;
  readonly road: RoadNetwork;
  readonly physics?: PhysicsWorld;
  readonly ride: RideManager;
  readonly requests: RequestGenerator;
  readonly traffic: TrafficManager;

  bike: BikeState;

  /** Set when `physics` is provided: real Rapier-backed stepping and static
   * collider collisions replace the direct `stepBike` call. */
  private readonly controller?: MotorcycleController;

  private autoRequests: boolean;
  private readonly bikeSpec: BikeSpec;
  private readonly env: BikeEnvironment;
  // Reused each step to keep the hot path allocation-free.
  private readonly camView: { x: number; z: number; heading: number; fovRad: number };
  private readonly pose: { x: number; z: number; speed: number };

  constructor(opts: GameSessionOptions) {
    this.gm = opts.gm;
    this.road = opts.road;
    this.physics = opts.physics;
    this.autoRequests = opts.autoRequests ?? true;

    // The requests profile (random or recurring) knows a passenger's payment
    // reliability; the seeded fork keeps NoShow rolls deterministic per seed.
    this.ride = new RideManager({
      roadNetwork: this.road,
      bus: this.gm.bus,
      rng: this.gm.rng.fork('rideManager'),
      economy: this.gm.economyManager,
      reputation: this.gm.reputationSystem,
      clock: this.gm.clock,
      paymentReliabilityOf: (req) =>
        this.requests.getProfile(req.passengerId)?.paymentReliability,
    });
    // T7.5: lets effect handlers (e.g. `endTrip`) reach the live ride state.
    this.gm.rideManager = this.ride;
    this.traffic = new TrafficManager(this.road, this.gm.seed);
    this.requests = new RequestGenerator(this.road, this.gm.rng.fork('requestGenerator'), {
      reputationSystem: this.gm.reputationSystem,
      dayProvider: () => this.gm.clock.day,
      seqProvider: () => ++this.gm.requestSeq,
      phoneBatteryProvider: () => this.gm.economy.phoneBattery,
    });

    this.bikeSpec = createDefaultBikeSpec();

    if (this.physics) {
      this.controller = new MotorcycleController({
        world: this.physics,
        bus: this.gm.bus,
        spec: this.bikeSpec,
      });
      this.bike = this.controller.state;
    } else {
      this.bike = createDefaultBikeState();
    }

    this.env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    this.camView = { x: 0, z: 0, heading: 0, fovRad: (60 * Math.PI) / 180 };
    this.pose = { x: 0, z: 0, speed: 0 };
  }

  /** T7.3: places the bike on the road network at `gm.homeNodeId`, aligned
   * to the nearest segment's direction, instead of the old off-road
   * `activeDistrict.nodes[0].x - 9` offset. Falls back to the network's
   * first node if the configured home node isn't in this road network
   * (e.g. a single-district debug boot whose district lacks that node). */
  spawnAtHome(): void {
    const anchor = this.road.getNode(this.gm.homeNodeId) ?? this.road.getAllNodes()[0];
    if (!anchor) return;

    const segment = this.road.segmentAt(anchor.x, anchor.z, 30);
    const startNode = segment ? this.road.getNode(segment.startNodeId) : undefined;
    const endNode = segment ? this.road.getNode(segment.endNodeId) : undefined;

    let x = anchor.x;
    let z = anchor.z;
    let heading = this.bike.heading;

    if (startNode && endNode) {
      const dx = endNode.x - startNode.x;
      const dz = endNode.z - startNode.z;
      const lenSq = dx * dx + dz * dz;
      const t =
        lenSq > 0
          ? clamp(
              ((anchor.x - startNode.x) * dx + (anchor.z - startNode.z) * dz) / lenSq,
              0,
              1
            )
          : 0;
      x = startNode.x + t * dx;
      z = startNode.z + t * dz;
      heading = Math.atan2(dx, dz);
    }

    this.bike.x = x;
    this.bike.z = z;
    this.bike.heading = heading;
    this.bike.speed = 0;

    if (this.controller) {
      this.controller.body.setTranslation({ x, y: 0.5, z }, true);
      const halfYaw = heading / 2;
      this.controller.body.setRotation(
        { x: 0, y: Math.sin(halfYaw), z: 0, w: Math.cos(halfYaw) },
        true
      );
    }
  }

  /** T7.3: traffic agents aren't Rapier colliders, so (with or without
   * physics) a bike/traffic hit is detected here by proximity rather than
   * by the physics world. Runs every tick, so it must stay allocation-free:
   * iterates the traffic Map directly instead of `getAgents()`'s array copy. */
  private checkTrafficCollisions(): void {
    const speedKmh = this.bike.speed * 3.6;
    let nearestGapM = Infinity;

    for (const agent of this.traffic.agents.values()) {
      const dx = agent.x - this.bike.x;
      const dz = agent.z - this.bike.z;
      const dist = Math.hypot(dx, dz);
      const touchRadius = Math.max(agent.length, agent.width) / 2 + TRAFFIC_COLLISION_MARGIN_M;
      const gap = dist - touchRadius;
      if (gap < nearestGapM) {
        nearestGapM = gap;
      }

      if (gap <= 0) {
        const relSpeedKmh = Math.abs(speedKmh - agent.speed * 3.6);
        let severity: BikeCollisionSeverity;
        if (relSpeedKmh > 25) {
          severity = 'crash';
          this.bike.speed = 0;
        } else if (relSpeedKmh >= 8) {
          severity = 'bump';
          this.bike.speed *= 0.4;
        } else {
          severity = 'scuff';
          this.bike.speed *= 0.95;
        }
        this.gm.bus.emit('bike/collision', { severity, relSpeedKmh, otherKind: 'traffic' });
        return;
      }
    }

    if (
      nearestGapM < TRAFFIC_NEAR_MISS_MARGIN_M &&
      this.bike.speed > TRAFFIC_NEAR_MISS_MIN_SPEED_MS
    ) {
      this.gm.bus.emit('bike/nearMiss', {
        distanceM: Math.max(0, nearestGapM),
        speedKmh,
      });
    }
  }

  setAutoRequests(on: boolean): void {
    this.autoRequests = on;
  }

  getAutoRequests(): boolean {
    return this.autoRequests;
  }

  /** Advances clock/weather/encounters, bike physics, traffic and ride state
   * by one tick, then (when enabled) offers any newly generated requests. */
  step(input: BikeInput, dt: number = SIM_DT): void {
    this.gm.tick(dt);

    const activeReq = this.ride.getActiveRequest();

    const segment = this.road.segmentAt(this.bike.x, this.bike.z);
    this.env.wet = this.gm.weatherSystem.isRoadWet();
    this.env.surface = segment
      ? this.gm.weatherSystem.getSurfaceModifier(segment)
      : this.env.wet
        ? 0.85
        : 1.0;
    this.env.hasPassenger = activeReq?.status === 'OnTrip';
    this.env.conditionPct = this.gm.economy.motorcycleCondition;

    this.bike = this.controller
      ? this.controller.update(input, this.env, dt)
      : stepBike(this.bike, input, this.bikeSpec, this.env, dt, this.bike);

    this.camView.x = this.bike.x;
    this.camView.z = this.bike.z;
    this.camView.heading = this.bike.heading;
    this.pose.x = this.bike.x;
    this.pose.z = this.bike.z;
    this.pose.speed = this.bike.speed;

    this.traffic.maintainDensity(this.camView, this.gm.clock.minutes);
    this.traffic.update(dt, this.camView, this.pose);
    this.checkTrafficCollisions();

    this.ride.update(this.pose, dt);

    if (this.autoRequests) {
      const dtMinutes = (dt * TIME_SCALE) / 60;
      const newRequests = this.requests.tick(
        dtMinutes,
        this.gm.clock.minutes,
        this.gm.weather,
        this.pose
      );
      for (const req of newRequests) {
        this.ride.offer(req);
      }
    }
  }

  /** Resets story/economy state and starts the opening tutorial. Replaces the
   * inline reset previously in main.ts's onNewCareer dispatcher. */
  newCareer(): void {
    this.gm.clock.day = 1;
    this.gm.clock.minutes = 7 * 60;
    this.gm.economy.cash = 600;
    this.gm.economyManager.cash = 600;
    this.gm.economy.fuelLevel = 1.2;
    this.gm.economyManager.fuelLevel = 1.2;
    // A new career starts with a clean paid-trip record, or the tutorial ride would count as already settled.
    this.gm.economyManager.restoreLedger([], []);
    this.gm.requestSeq = 0;
    this.gm.story.branchFlags = {};
    this.gm.story.completedMissions = [];
    this.gm.story.activeMissions = ['m1_first_ride'];
    this.gm.missionManager.activateMission('m1_first_ride');
  }

  /** T8.2: settles the scripted tutorial ride through the same exactly-once path as a
   * live ride and announces `ride/completed`. If it was already settled it pays nothing
   * but still announces completion (so the tutorial and m1_first_ride cannot softlock). */
  settleTutorialRide(fare: number): TripReceipt {
    const { gm } = this;
    const base = {
      requestId: 'req_tutorial_01',
      fare,
      tip: 0,
      bonus: 0,
      bookingType: 'app' as const,
      fuelLiters: fuelUsed(0.1, 0),
      otherCosts: 0,
      penalties: 0,
      compensation: 0,
      durationMin: 3,
      distanceKm: 0.1,
      rating: gm.reputationSystem.getActiveTripRating(),
      consequences: [],
    };
    const settled =
      gm.economyManager.settleTrip({ ...base, day: gm.clock.day, minute: gm.clock.minutes }) ??
      buildReceipt(base);
    gm.bus.emit('ride/completed', { requestId: settled.requestId, receipt: settled });
    return settled;
  }

  /** T7.4: converts the running session to a true endless one (no missions,
   * no ending checks), replacing the old `screenSignal.value = 'game'` UI-only
   * hack used for both the main menu's "Endless" and post-ending "Enter
   * Endless" buttons. */
  enterEndless(): void {
    this.gm.enterEndlessMode();
  }

  /** T11.3: fast-forwards idle time (e.g. waiting for a request) without a
   * full per-frame render loop. Not yet implemented. */
  fastForwardTrip(opts: { idleMin?: number } = {}): void {
    // ponytail: stub only, this is T11.3's job — do not invent the behavior here.
    void opts;
  }
}
