import { GameManager } from './GameManager';
import { RideManager } from './ride/RideManager';
import { RequestGenerator } from './ride/RequestGenerator';
import { TrafficManager } from './traffic/TrafficManager';
import type { RoadNetwork } from './road/RoadNetwork';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
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

    this.ride = new RideManager({ roadNetwork: this.road, bus: this.gm.bus });
    this.traffic = new TrafficManager(this.road, this.gm.seed);
    this.requests = new RequestGenerator(this.road, this.gm.rng.fork('requestGenerator'), {
      reputationSystem: this.gm.reputationSystem,
      phoneBatteryProvider: () => this.gm.economy.phoneBattery,
    });

    this.bikeSpec = createDefaultBikeSpec();
    this.bike = createDefaultBikeState();
    this.env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    this.camView = { x: 0, z: 0, heading: 0, fovRad: (60 * Math.PI) / 180 };
    this.pose = { x: 0, z: 0, speed: 0 };
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

    this.bike = stepBike(this.bike, input, this.bikeSpec, this.env, dt, this.bike);

    this.camView.x = this.bike.x;
    this.camView.z = this.bike.z;
    this.camView.heading = this.bike.heading;
    this.pose.x = this.bike.x;
    this.pose.z = this.bike.z;
    this.pose.speed = this.bike.speed;

    this.traffic.maintainDensity(this.camView, this.gm.clock.minutes);
    this.traffic.update(dt, this.camView, this.pose);

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
    this.gm.story.branchFlags = {};
    this.gm.story.completedMissions = [];
    this.gm.story.activeMissions = ['m1_first_ride'];
    this.gm.missionManager.activateMission('m1_first_ride');
  }

  /** T11.3: fast-forwards idle time (e.g. waiting for a request) without a
   * full per-frame render loop. Not yet implemented. */
  fastForwardTrip(opts: { idleMin?: number } = {}): void {
    // ponytail: stub only, this is T11.3's job — do not invent the behavior here.
    void opts;
  }
}
