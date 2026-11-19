import { GameManager } from './GameManager';
import { RideManager } from './ride/RideManager';
import { RequestGenerator } from './ride/RequestGenerator';
import { TrafficManager } from './traffic/TrafficManager';
import type { RoadNetwork } from './road/RoadNetwork';
import { encounterPhaseFor, type RidePhaseInput } from './events/phase';
import type { EncounterPhase } from './events/conditions';
import type { PhysicsWorld, DynamicObb, StaticBoxHandle } from '../physics/PhysicsWorld';
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
import { SIM_DT, DISTANCE_SCALE } from '../config/constants';
import { BALANCE } from '../config/balance';
import type { Rng } from '../core/rng';
import { TIME_SCALE } from '../core/clock';
import { clamp } from '../core/math';
import { receipt as buildReceipt, fuelUsed, type FuelOptions } from './economy/fuel';
import { bikeDefToSpec, getBikeDef } from './economy/bikes';
import { checkPuncture } from './economy/maintenance';
import type { TripReceipt, PassengerProfile } from '../core/types';
import { startNegotiation, type NegotiationSession } from './negotiation/NegotiationSystem';
import { fairFare, isRushHourMinute } from './negotiation/fare';
import { generateProfile } from './passenger/profiles';
import { expectedBudget, openingOffer } from './passenger/PassengerAI';
import type { BikeCollisionSeverity } from '../core/types';

// ponytail: proximity thresholds, not measured against real bike/vehicle
// hitboxes — revisit with real collider shapes if this reads as too lenient/strict.
const TRAFFIC_COLLISION_MARGIN_M = 0.6;
/** Seconds a bike may stay wedged before it is put back on the road. */
const WEDGED_RECOVER_S = 2.0;
const TRAFFIC_NEAR_MISS_MARGIN_M = 1.5;
const TRAFFIC_NEAR_MISS_MIN_SPEED_MS = 20 / 3.6;
const TRAFFIC_NEAR_MISS_COOLDOWN_S = 1.0;
const DYNAMIC_TRAFFIC_RANGE_SQ = 80 * 80;

export interface GameSessionOptions {
  gm: GameManager;
  road: RoadNetwork;
  physics?: PhysicsWorld;
  /** Whether RequestGenerator automatically offers rides each step. Debug/test
   * single-district boots set this false and inject a deterministic ride instead. */
  autoRequests?: boolean;
  /** T8.5: accepted rides open a real negotiation (default). Headless sim drivers
   * that only want accept -> agreed fare pass false. */
  negotiation?: boolean;
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

  /** T8.3: litres burned since the current trip began; fed to `settleTrip`. */
  tripFuelLiters = 0;

  /** Set when `physics` is provided: spatial-hash swept physics and static
   * collider collisions replace the direct `stepBike` call. */
  private readonly controller?: MotorcycleController;

  private autoRequests: boolean;
  readonly bikeSpec: BikeSpec;
  private readonly env: BikeEnvironment;
  // Reused each step to keep the hot path allocation-free.
  private readonly camView: { x: number; z: number; heading: number; fovRad: number };
  private readonly pose: { x: number; z: number; speed: number; heading: number };
  // Reused every tick (the step loop is allocation-free); see currentEncounterPhase.
  private readonly phaseInput: RidePhaseInput = {
    trip: 'Idle',
    hasRequest: false,
    distToPickupM: Infinity,
    distToDropoffM: Infinity,
  };
  // T8.3 live fuel/wear state, all reused to keep step() allocation-free.
  private readonly fuelOpts: FuelOptions = {};
  private readonly breakdownRng: Rng;
  private readonly punctureRng: Rng;
  private readonly fuelStations: { x: number; z: number }[] = [];
  private readonly teaStalls: { x: number; z: number }[] = [];
  private readonly poiPositions: { id: string; kind: string; nameKey: string; x: number; z: number }[] = [];
  private readonly nearbyPoiIds = new Set<string>();
  private readonly speedBumps = new Map<string, { midX: number; midZ: number; ux: number; uz: number }>();
  private readonly recoveryAabbOut: StaticBoxHandle[] = [];
  private lastAccidentEncounterMin = -Infinity;
  private lastPunctureMin = -Infinity;
  private lastSpeedBumpSegId: string | null = null;
  private hasGoodTires = false;
  private envFlooded = false;
  private tripReqId: string | null = null;
  private warnedWorn = false;
  private stallSec = 0;
  /** Seconds the bike has been wedged against an obstacle (see recoverBike). */
  private wedgedSec = 0;
  private wobbling = false;
  private nearMissCooldownS = 0;
  /** Traffic agents the bike is currently touching (fallback when physics is omitted). */
  private readonly trafficContacts = new Set<string>();
  private readonly stalledInput: BikeInput = { throttle: 0, brake: 0.6, steer: 0 };
  private readonly dynamicVehicleScratch: DynamicObb = {
    id: '',
    kind: 'car',
    x: 0,
    z: 0,
    halfX: 0.9,
    halfZ: 2.25,
    minY: 0,
    maxY: 2.5,
    yaw: 0,
    vx: 0,
    vz: 0,
  };

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
      tripFuelLiters: () => this.tripFuelLiters,
      appStatus: () =>
        this.ride.isAppSuspended(this.gm.clock.day)
          ? 'suspended'
          : this.gm.economy.phoneBattery <= 0
            ? 'phoneDead'
            : 'ok',
      paymentReliabilityOf: (req) =>
        this.requests.getProfile(req.passengerId)?.paymentReliability,
      archetypeOf: (req) => this.requests.getProfile(req.passengerId)?.archetype,
    });
    // T7.5: lets effect handlers (e.g. `endTrip`) reach the live ride state.
    this.gm.rideManager = this.ride;
    this.ride.enableNegotiation = opts.negotiation ?? true;
    // H: an agreed fare well above fair adds an overcharge mark, a fair one slowly rebuilds goodwill.
    this.gm.bus.on('negotiation/result', (ev) => {
      if (ev.outcome.kind !== 'accepted') return;
      const req = this.ride.getActiveRequest();
      if (!req || req.requestId !== ev.requestId) return;
      const fair = fairFare(req.estimatedDistance, req.estimatedDuration, req.surge);
      const over = ev.outcome.fare / Math.max(fair, 1) - 1;
      const h = this.gm.negotiationHistory;
      this.gm.negotiationHistory = clamp(
        over > BALANCE.NEGOTIATION.overchargeMargin ? h - 0.15 : over <= 0.05 ? h + 0.05 : h,
        -1,
        1
      );
    });
    this.traffic = new TrafficManager(this.road, this.gm.seed);
    this.requests = new RequestGenerator(this.road, this.gm.rng.fork('requestGenerator'), {
      reputationSystem: this.gm.reputationSystem,
      dayProvider: () => this.gm.clock.day,
      seqProvider: () => ++this.gm.requestSeq,
      phoneBatteryProvider: () => this.gm.economy.phoneBattery,
      appSuspendedProvider: () => this.ride.isAppSuspended(this.gm.clock.day),
    });

    this.bikeSpec = createDefaultBikeSpec();

    if (this.physics) {
      this.controller = new MotorcycleController({
        world: this.physics,
        bus: this.gm.bus,
        spec: this.bikeSpec,
      });
      this.bike = this.controller.state;
      this.gm.bus.on('bike/collision', (ev) => {
        if (ev.otherKind === 'traffic' && ev.severity === 'crash') {
          this.maybeStartAccidentEncounter();
        }
      });
    } else {
      this.bike = createDefaultBikeState();
    }

    this.env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100, fuelEmpty: false };
    this.camView = { x: 0, z: 0, heading: 0, fovRad: (60 * Math.PI) / 180 };
    this.pose = { x: 0, z: 0, speed: 0, heading: 0 };

    this.breakdownRng = this.gm.rng.fork('breakdown');
    this.punctureRng = this.gm.rng.fork('puncture');
    for (const poi of this.road.getPois()) {
      const node = this.road.getNode(poi.nodeId);
      if (node) {
        this.poiPositions.push({ id: poi.id, kind: poi.kind, nameKey: poi.nameKey, x: node.x, z: node.z });
        if (poi.kind === 'fuel') this.fuelStations.push({ x: node.x, z: node.z });
        if (poi.kind === 'teaStall') this.teaStalls.push({ x: node.x, z: node.z });
      }
    }
    for (const seg of this.road.getAllSegments()) {
      if (!seg.tags || (!seg.tags.includes('speed_bump') && !seg.tags.includes('school'))) continue;
      const sNode = this.road.getNode(seg.startNodeId);
      const eNode = this.road.getNode(seg.endNodeId);
      if (!sNode || !eNode) continue;
      const dx = eNode.x - sNode.x;
      const dz = eNode.z - sNode.z;
      const len = Math.hypot(dx, dz);
      if (len <= 0) continue;
      this.speedBumps.set(seg.segmentId, {
        midX: (sNode.x + eNode.x) * 0.5,
        midZ: (sNode.z + eNode.z) * 0.5,
        ux: dx / len,
        uz: dz / len,
      });
    }
    this.gm.fuelStationNearby = () => this.nearFuelStation();
    this.gm.phoneChargeNearby = (where) => this.nearChargeSpot(where);
    this.gm.recoverBikeHandler = () => this.requestManualRecovery();
    this.gm.spawnSpecialRequest = (templateId) => {
      const res = this.requests.sampleRequest(
        this.gm.clock.minutes,
        this.gm.weather,
        templateId === 'street' ? 'street' : 'app'
      );
      if (res) this.ride.offer(res.request);
    };

    this.gm.bus.on('bike/swapped', () => this.syncBikeSpec());
    this.gm.bus.on('upgrade/purchased', () => this.syncBikeSpec());
    this.gm.bus.on('state/restored', () => {
      this.lastPunctureMin = -Infinity;
      this.syncBikeSpec();
    });
    this.syncBikeSpec();
  }

  /** Rebuilds live bike specs and upgrade modifiers from EconomyManager and pushes
   * them to Physics/MotorcycleController, RideManager, and EconomyManager. */
  syncBikeSpec(): void {
    const em = this.gm.economyManager;
    const bikeDef = getBikeDef(em.currentBikeId);
    const hasDiscBrakes = em.hasUpgrade('upgrade_disc_brakes');
    const hasGoodTires = em.hasUpgrade('upgrade_good_tires');
    const hasEngineTune = em.hasUpgrade('upgrade_engine_tune');
    const hasPhoneMount = em.hasUpgrade('upgrade_phone_mount');

    const nextSpec = bikeDefToSpec(bikeDef, hasDiscBrakes, hasGoodTires);
    Object.assign(this.bikeSpec, nextSpec);
    this.controller?.setSpec(this.bikeSpec);

    this.ride.activeBikeId = bikeDef.id;
    this.ride.hasEngineTune = hasEngineTune;
    this.hasGoodTires = hasGoodTires;
    em.setBatteryDrainMultiplier(hasPhoneMount ? 0.5 : 1);
  }

  /** T8.5: starts a negotiation with the actual passenger of `requestId`: its own profile
   * (or a seeded commuter for rides injected without one), the career's overcharge history,
   * and a fork of the session RNG, so the same seed replays the same outcome. */
  beginNegotiation(requestId: string): NegotiationSession | null {
    const req = this.ride.getActiveRequest();
    if (!req || req.requestId !== requestId) return null;
    const profile: PassengerProfile =
      this.requests.getProfile(req.passengerId) ??
      generateProfile('commuter', this.gm.rng.fork(`profile:${req.passengerId}`), req.passengerId);
    const rain = this.gm.weather === 'lightRain' || this.gm.weather === 'heavyRain';
    return startNegotiation(req, profile, {
      traffic: Math.min(1, (isRushHourMinute(this.gm.clock.minutes) ? 0.7 : 0.3) + (rain ? 0.15 : 0)),
      walkM: 0,
      day: this.gm.clock.day,
      history: this.gm.negotiationHistory,
      rng: this.gm.rng.fork(`negotiation:${requestId}`),
    });
  }

  /** T8.5: a nearer pickup the passenger could walk to (e.g. across a divided road), or
   * null. The negotiation panel offers relocation only when this is non-null. */
  pickupChoice(): { nodeId: string; walkM: number; savesMin: number } | null {
    const req = this.ride.getActiveRequest();
    if (!req || this.ride.getTripState() !== 'Negotiating') return null;
    return this.ride.pickupOptions(req, { x: this.bike.x, z: this.bike.z })?.crossPoint ?? null;
  }

  /** T8.5: after `relocatePickup` re-priced the ride, bring the live negotiation's fare
   * and budget in line with the new trip. Round, patience and walk are kept, and the
   * passenger's standing offer is never lowered by a relocation. */
  repriceNegotiation(neg: NegotiationSession): NegotiationSession {
    const req = neg.req;
    const fair = fairFare(req.estimatedDistance, req.estimatedDuration, req.surge);
    const budget = expectedBudget(neg.profile, fair, this.gm.clock.day);
    const offer = Math.max(neg.currentPassengerOffer, openingOffer(neg.profile, budget));
    return {
      ...neg,
      fairFare: fair,
      expectedBudget: budget,
      currentPassengerOffer: offer,
      currentRiderOffer: null,
    };
  }

  /** T8.5: the rider took the ride off the app: no commission, and the platform may notice. */
  markOffApp(): void {
    const req = this.ride.getActiveRequest();
    if (!req) return;
    req.bookingType = 'offApp';
    this.ride.recordOffAppRide(req.passengerId, this.gm.clock.day, this.gm.rng.fork('offApp'));
  }

  /** True when the bike is within `PHONE.chargeRangeM` of home or a tea stall. */
  nearChargeSpot(where: 'home' | 'teaStall'): boolean {
    const r2 = BALANCE.PHONE.chargeRangeM * BALANCE.PHONE.chargeRangeM;
    // Same fallback as spawnAtHome: a district without the home node uses its first node.
    const home =
      where === 'home' ? (this.road.getNode(this.gm.homeNodeId) ?? this.road.getAllNodes()[0]) : undefined;
    if (home) {
      const dx = home.x - this.bike.x;
      const dz = home.z - this.bike.z;
      return dx * dx + dz * dz <= r2;
    }
    if (where === 'home') return false;
    for (const st of this.teaStalls) {
      const dx = st.x - this.bike.x;
      const dz = st.z - this.bike.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }

  /** True when the bike is within `stationRangeM` map metres of a fuel POI. */
  nearFuelStation(): boolean {
    const r2 = BALANCE.FUEL.stationRangeM * BALANCE.FUEL.stationRangeM;
    for (const st of this.fuelStations) {
      const dx = st.x - this.bike.x;
      const dz = st.z - this.bike.z;
      if (dx * dx + dz * dz <= r2) return true;
    }
    return false;
  }

  private checkMissionPois(): void {
    const target = this.gm.missionManager.getActiveReachTarget();
    if (!target) return;
    const r2 = BALANCE.FUEL.stationRangeM * BALANCE.FUEL.stationRangeM;
    this.nearbyPoiIds.clear();
    for (const poi of this.poiPositions) {
      const dx = poi.x - this.bike.x;
      const dz = poi.z - this.bike.z;
      if (dx * dx + dz * dz <= r2) {
        this.nearbyPoiIds.add(poi.id);
        this.nearbyPoiIds.add(`poi_kind:${poi.kind}`);
      }
    }
    if (this.nearbyPoiIds.size > 0) {
      this.gm.missionManager.checkNearbyPois(this.nearbyPoiIds);
    }
  }

  /** Nearest POI matching the first active `reach` mission objective, for HUD/minimap guidance. */
  getNearestMissionTarget(): { x: number; z: number; nameKey: string; distanceM: number } | null {
    const target = this.gm.missionManager.getActiveReachTarget();
    if (!target) return null;
    const isKind = target.poiId.startsWith('poi_kind:');
    const kind = isKind ? target.poiId.slice('poi_kind:'.length) : '';
    let best: { x: number; z: number; nameKey: string; distanceM: number } | null = null;
    for (const poi of this.poiPositions) {
      if (isKind ? poi.kind !== kind : poi.id !== target.poiId) continue;
      const dist = Math.hypot(poi.x - this.bike.x, poi.z - this.bike.z);
      if (!best || dist < best.distanceM) {
        best = { x: poi.x, z: poi.z, nameKey: poi.nameKey, distanceM: dist };
      }
    }
    return best;
  }

  /** Starts a fresh fuel tally for a new trip. */
  beginTripFuel(): void {
    this.tripFuelLiters = 0;
  }

  /** Burns fuel and wears the bike for the ground covered this step. */
  private burnAndWear(
    input: BikeInput,
    dt: number,
    distM: number,
    hasRide: boolean
  ): void {
    const em = this.gm.economyManager;
    const speed = this.bike.speed;
    const km = (distM * DISTANCE_SCALE) / 1000;

    if (km > 0) {
      em.applyWear(km);
      this.rollBreakdown(km);
      this.rollPuncture(km);
    }

    if (em.fuelLevel <= 0) return;
    const idling = speed < BALANCE.FUEL.idleSpeedMs && (hasRide || input.throttle > 0);
    if (km <= 0 && !idling) return;

    const o = this.fuelOpts;
    o.model = this.ride.activeBikeId;
    o.engineTune = this.ride.hasEngineTune;
    o.loadKg = this.env.hasPassenger ? BALANCE.FUEL.passengerKg : 0;
    o.roughness = 1 - clamp(this.env.surface, 0, 1);
    o.throttleStress = clamp(input.throttle, 0, 1) * clamp(1 - speed / this.bikeSpec.vmax, 0, 1);
    o.conditionPct = em.motorcycleCondition;
    const idleMin = idling ? (dt * TIME_SCALE) / 60 : 0;
    const liters = Math.min(em.fuelLevel, fuelUsed(km, idleMin, o));
    em.consumeFuel(liters);
    this.tripFuelLiters += liters;
  }

  /** Warns once when condition drops, and only afterwards rolls for a stall. */
  private rollBreakdown(km: number): void {
    const cond = this.gm.economyManager.motorcycleCondition;
    if (cond >= BALANCE.WEAR.warnBelow) {
      this.warnedWorn = false;
      return;
    }
    if (!this.warnedWorn) {
      this.warnedWorn = true;
      this.gm.bus.emit('bike/conditionWarning', { conditionPct: cond });
      return;
    }
    if (cond >= BALANCE.WEAR.breakdownBelow || this.stallSec > 0) return;
    const perKm = BALANCE.WEAR.breakdownPerKmAtZero * (1 - cond / BALANCE.WEAR.breakdownBelow);
    if (this.breakdownRng.chance(perKm * km)) {
      this.stallSec = BALANCE.WEAR.breakdownStallSec;
      this.gm.bus.emit('bike/breakdown', { conditionPct: cond });
    }
  }

  private monotonicMinutes(): number {
    return (this.gm.clock.day - 1) * 1440 + this.gm.clock.minutes;
  }

  private rollPuncture(km: number): void {
    const nowMin = this.monotonicMinutes();
    if (nowMin - this.lastPunctureMin < 180) return;
    if (checkPuncture(km, this.env.surface, this.envFlooded, this.hasGoodTires, this.punctureRng)) {
      this.lastPunctureMin = nowMin;
      this.gm.bus.emit('bike/puncture', {});
      if (this.gm.eventDirector.enabled && this.gm.eventDirector.activeEncounter === null) {
        this.gm.eventDirector.forceStart('enc_puncture', this.gm.bus);
      }
    }
  }

  /** T7.3: places the bike on the road network at `gm.homeNodeId`, aligned
   * to the nearest segment's direction, instead of the old off-road
   * `activeDistrict.nodes[0].x - 9` offset. Falls back to the network's
   * first node if the configured home node isn't in this road network
   * (e.g. a single-district debug boot whose district lacks that node). */
  spawnAtHome(): void {
    const anchor = this.road.getNode(this.gm.homeNodeId) ?? this.road.getAllNodes()[0];
    if (!anchor) return;
    this.placeOnRoadNear(anchor.x, anchor.z);
  }

  /** Recovers a crashed or stuck bike: back onto the nearest road, stopped and
   * facing along it, so the rider keeps their place in the city (audit H-5, H-8). */
  recoverBike(): void {
    this.placeOnRoadNear(this.bike.x, this.bike.z);
  }

  /** Manual recovery triggered by `{ type: 'recoverBike' }` command. */
  requestManualRecovery(): boolean {
    if (this.road.getAllSegments().length === 0 && this.road.getAllNodes().length === 0) {
      return false;
    }
    this.wedgedSec = 0;
    this.recoverBike();
    return true;
  }

  private isClearOfStaticColliders(x: number, z: number): boolean {
    if (!this.physics) return true;
    const pad = 0.6;
    this.physics.queryAabb(x - pad, z - pad, x + pad, z + pad, this.recoveryAabbOut);
    for (let i = 0; i < this.recoveryAabbOut.length; i++) {
      const box = this.recoveryAabbOut[i]!;
      if (box.maxY <= 0 || box.minY >= 1.5) continue;
      // Local OBB containment check with bike capsule padding
      const rx = x - box.x;
      const rz = z - box.z;
      const lx = Math.abs(rx * box.cos - rz * box.sin);
      const lz = Math.abs(rx * box.sin + rz * box.cos);
      if (lx < box.halfX + 0.4 && lz < box.halfZ + 0.4) {
        return false;
      }
    }
    return true;
  }

  /** Puts the bike, stopped, on the road segment nearest (anchorX, anchorZ), aligned to it.
   * On divided roads, offsets into the nearest clear carriageway lane to avoid medians. */
  private placeOnRoadNear(anchorX: number, anchorZ: number): void {
    const segment =
      this.road.segmentAt(anchorX, anchorZ, 30) ??
      this.road.segmentAt(anchorX, anchorZ, Infinity);
    const startNode = segment ? this.road.getNode(segment.startNodeId) : undefined;
    const endNode = segment ? this.road.getNode(segment.endNodeId) : undefined;

    let x = anchorX;
    let z = anchorZ;
    let heading = this.bike.heading;

    if (segment && startNode && endNode) {
      const dx = endNode.x - startNode.x;
      const dz = endNode.z - startNode.z;
      const lenSq = dx * dx + dz * dz;
      const len = Math.sqrt(lenSq);
      const t =
        lenSq > 0
          ? clamp(
              ((anchorX - startNode.x) * dx + (anchorZ - startNode.z) * dz) / lenSq,
              0,
              1
            )
          : 0;
      const cx = startNode.x + t * dx;
      const cz = startNode.z + t * dz;
      x = cx;
      z = cz;
      heading = Math.atan2(dx, dz);

      if (segment.divided && len > 0) {
        const ux = dx / len;
        const uz = dz / len;
        const leftX = uz;
        const leftZ = -ux;
        const signedLat = (anchorX - cx) * leftX + (anchorZ - cz) * leftZ;
        let side = signedLat >= 0 ? 1 : -1;
        const laneOffset = Math.max(1.5, Math.min(segment.width * 0.25, 3.5));

        const candX = cx + leftX * side * laneOffset;
        const candZ = cz + leftZ * side * laneOffset;
        if (!this.isClearOfStaticColliders(candX, candZ)) {
          const altX = cx - leftX * side * laneOffset;
          const altZ = cz - leftZ * side * laneOffset;
          if (this.isClearOfStaticColliders(altX, altZ)) {
            side = -side;
          }
        }

        x = cx + leftX * side * laneOffset;
        z = cz + leftZ * side * laneOffset;
        if (!segment.oneWay && side < 0) {
          heading = Math.atan2(-dx, -dz);
        }
      }
    }

    this.bike.x = x;
    this.bike.z = z;
    this.bike.heading = heading;
    this.bike.speed = 0;
    this.bike.gear = 1;
    this.bike.rpmNorm = 0.15;
    this.bike.lean = 0;
    this.bike.steer = 0;
    this.bike.wobble = false;
    this.bike.crashed = false;
    this.bike.reverseHoldS = 0;
  }

  private maybeStartAccidentEncounter(): void {
    if (
      this.gm.eventDirector.enabled &&
      this.gm.eventDirector.activeEncounter === null &&
      this.gm.clock.minutes - this.lastAccidentEncounterMin >= 60
    ) {
      this.lastAccidentEncounterMin = this.gm.clock.minutes;
      this.gm.eventDirector.forceStart('enc_accident_aftermath', this.gm.bus);
    }
  }

  /** Syncs nearby traffic agents (<= 80m) as dynamic OBBs into PhysicsWorld. */
  private syncDynamicVehicles(): void {
    if (!this.physics) return;
    this.physics.clearDynamicVehicles();
    const bx = this.bike.x;
    const bz = this.bike.z;
    const obb = this.dynamicVehicleScratch;
    for (const agent of this.traffic.agents.values()) {
      const dx = agent.x - bx;
      const dz = agent.z - bz;
      if (dx * dx + dz * dz > DYNAMIC_TRAFFIC_RANGE_SQ) continue;
      const yaw = agent.heading ?? 0;
      const speed = agent.speed ?? 0;
      obb.id = agent.id;
      obb.kind = agent.kind;
      obb.x = agent.x;
      obb.z = agent.z;
      obb.halfX = agent.width * 0.5;
      obb.halfZ = agent.length * 0.5;
      obb.minY = 0;
      obb.maxY = 2.5;
      obb.yaw = yaw;
      obb.vx = Math.sin(yaw) * speed;
      obb.vz = Math.cos(yaw) * speed;
      this.physics.upsertDynamicVehicle(obb);
    }
  }

  /** Fallback proximity traffic collision for headless sessions without PhysicsWorld.
   * When PhysicsWorld is present, MotorcycleController resolves traffic OBB hits and
   * near-misses directly inside sweepCapsule/castRay2D. Runs allocation-free. */
  private checkTrafficCollisions(dt: number): void {
    this.nearMissCooldownS = Math.max(0, this.nearMissCooldownS - dt);
    const speedKmh = Math.abs(this.bike.speed) * 3.6;
    const bikeVx = Math.sin(this.bike.heading) * this.bike.speed;
    const bikeVz = Math.cos(this.bike.heading) * this.bike.speed;
    let nearestGapM = Infinity;

    let touching = false;
    for (const agent of this.traffic.agents.values()) {
      const dx = agent.x - this.bike.x;
      const dz = agent.z - this.bike.z;
      const dist = Math.hypot(dx, dz);
      const touchRadius = Math.max(agent.length, agent.width) / 2 + TRAFFIC_COLLISION_MARGIN_M;
      const gap = dist - touchRadius;
      if (gap < nearestGapM) {
        nearestGapM = gap;
      }

      if (gap > 0) {
        this.trafficContacts.delete(agent.id);
        continue;
      }
      touching = true;
      // One hit per contact: a bike that stays inside a vehicle is not hit again each tick.
      if (this.trafficContacts.has(agent.id)) continue;
      this.trafficContacts.add(agent.id);

      const agentYaw = agent.heading ?? 0;
      const agentSpeed = agent.speed ?? 0;
      const agentVx = Math.sin(agentYaw) * agentSpeed;
      const agentVz = Math.cos(agentYaw) * agentSpeed;
      const relSpeedKmh = Math.hypot(bikeVx - agentVx, bikeVz - agentVz) * 3.6;
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
      if (severity === 'crash') {
        this.maybeStartAccidentEncounter();
      }
    }
    if (touching) return;

    if (
      nearestGapM < TRAFFIC_NEAR_MISS_MARGIN_M &&
      this.bike.speed > TRAFFIC_NEAR_MISS_MIN_SPEED_MS &&
      this.nearMissCooldownS <= 0
    ) {
      this.gm.bus.emit('bike/nearMiss', {
        distanceM: Math.max(0, nearestGapM),
        speedKmh,
      });
      this.nearMissCooldownS = TRAFFIC_NEAR_MISS_COOLDOWN_S;
    }
  }

  /** T8.4: missed turns and closed roads re-plan the route (or fail the ride clearly). */
  private navigate(): void {
    const route = this.ride.currentRoute;
    if (!route || !this.ride.getActiveRequest()) return;
    const ids = route.segmentIds;
    for (let i = 0; i < ids.length; i++) {
      if (this.gm.roadEvents.isSegmentClosed(ids[i]!)) {
        this.ride.rerouteIfBlocked(ids[i]!);
        return;
      }
    }
    if (this.ride.isOffRoute(this.pose)) this.ride.reroute(this.pose);
  }

  setAutoRequests(on: boolean): void {
    this.autoRequests = on;
  }

  getAutoRequests(): boolean {
    return this.autoRequests;
  }

  /** The encounter phase the live ride is in: offer, pickup, trip, drop-off or roaming. */
  private currentEncounterPhase(): EncounterPhase {
    const s = this.phaseInput;
    const req = this.ride.getActiveRequest();
    s.trip = this.ride.getTripState();
    s.hasRequest = req !== null;
    s.distToPickupM = Infinity;
    s.distToDropoffM = Infinity;
    if (req) {
      const pickup = this.ride.roadNetwork.getNode(req.pickupNodeId);
      const dropoff = this.ride.roadNetwork.getNode(req.destinationNodeId);
      if (pickup) s.distToPickupM = Math.hypot(this.bike.x - pickup.x, this.bike.z - pickup.z);
      if (dropoff) s.distToDropoffM = Math.hypot(this.bike.x - dropoff.x, this.bike.z - dropoff.z);
    }
    return encounterPhaseFor(s);
  }

  /** Advances clock/weather/encounters, bike physics, traffic and ride state
   * by one tick, then (when enabled) offers any newly generated requests. */
  step(input: BikeInput, dt: number = SIM_DT): void {
    this.gm.tick(dt, this.bike.speed * 3.6, this.currentEncounterPhase());

    const activeReq = this.ride.getActiveRequest();

    const segment = this.road.segmentAt(this.bike.x, this.bike.z);
    this.env.wet = this.gm.weatherSystem.isRoadWet();
    this.env.surface = segment ? this.gm.weatherSystem.getSurfaceModifier(segment) : 1.0;
    this.envFlooded = segment ? this.gm.weatherSystem.isFlooded(segment.segmentId) : false;
    this.env.floodSpeedCapMs =
      segment && this.gm.weatherSystem.isSegmentFloodCapped(segment)
        ? this.gm.weatherSystem.getSpeedCap(segment) / 3.6
        : undefined;
    this.env.hasPassenger = activeReq?.status === 'OnTrip';
    this.env.conditionPct = this.gm.economyManager.motorcycleCondition;
    this.env.fuelEmpty = this.gm.economyManager.fuelLevel <= 0;

    const reqId = activeReq ? activeReq.requestId : null;
    if (reqId !== this.tripReqId) {
      this.tripReqId = reqId;
      if (reqId) this.beginTripFuel();
    }

    if (this.stallSec > 0) {
      // Broken down: no throttle until the engine catches again (or is repaired).
      this.stallSec -= dt;
      if (this.gm.economyManager.motorcycleCondition >= BALANCE.WEAR.breakdownBelow) this.stallSec = 0;
      input = this.stalledInput;
    }

    const prevX = this.bike.x;
    const prevZ = this.bike.z;
    if (this.controller) {
      this.syncDynamicVehicles();
    }
    this.bike = this.controller
      ? this.controller.update(input, this.env, dt)
      : stepBike(this.bike, input, this.bikeSpec, this.env, dt, this.bike);

    const mx = this.bike.x - prevX;
    const mz = this.bike.z - prevZ;
    const moved = Math.sqrt(mx * mx + mz * mz);
    // A jump larger than any real step (teleport, respawn) is not riding.
    const plausible = (this.bikeSpec.vmax + 1) * dt * 2;
    this.burnAndWear(input, dt, moved <= plausible ? moved : 0, activeReq !== null);

    // The tyres reaching the grip limit is reported once per slide, not every frame.
    const wobbleNow = this.bike.wobble === true;
    if (wobbleNow && !this.wobbling) {
      this.gm.bus.emit('bike/wobble', {});
    }
    this.wobbling = wobbleNow;

    // Speed bump crossing pulse (once per crossing over the segment's midpoint bump)
    const speedBump = segment ? this.speedBumps.get(segment.segmentId) : undefined;
    if (speedBump) {
      const alongDist = Math.abs(
        (this.bike.x - speedBump.midX) * speedBump.ux +
        (this.bike.z - speedBump.midZ) * speedBump.uz
      );
      if (alongDist <= 1.0 && Math.abs(this.bike.speed) > 1.5) {
        if (this.lastSpeedBumpSegId !== segment!.segmentId) {
          this.lastSpeedBumpSegId = segment!.segmentId;
          this.gm.bus.emit('bike/speedBump', {
            speedKmh: Math.abs(this.bike.speed) * 3.6,
          });
        }
      } else if (alongDist > 3.0 && this.lastSpeedBumpSegId === segment!.segmentId) {
        this.lastSpeedBumpSegId = null;
      }
    } else {
      this.lastSpeedBumpSegId = null;
    }

    // Wedged against kerb or wall: nearly stopped while the rider is still on the
    // throttle, or just crashed. After a short wait, put the bike back on the road.
    const wedged = this.bike.speed < 0.3 && (input.throttle > 0 || this.bike.crashed) && this.stallSec <= 0;
    this.wedgedSec = wedged ? this.wedgedSec + dt : 0;
    if (this.wedgedSec >= WEDGED_RECOVER_S) {
      this.wedgedSec = 0;
      this.recoverBike();
    }

    this.camView.x = this.bike.x;
    this.camView.z = this.bike.z;
    this.camView.heading = this.bike.heading;
    this.pose.x = this.bike.x;
    this.pose.z = this.bike.z;
    this.pose.speed = this.bike.speed;
    this.pose.heading = this.bike.heading;

    this.traffic.maintainDensity(this.camView, this.gm.clock.minutes);
    this.traffic.update(dt, this.camView, this.pose);
    if (!this.controller) {
      this.checkTrafficCollisions(dt);
    }

    this.ride.update(this.pose, dt);
    this.checkMissionPois();
    this.navigate();

    if (this.autoRequests) {
      const dtMinutes = (dt * TIME_SCALE) / 60;
      const eventDemandMult = this.gm.roadEvents.getDemandMultiplier();
      const newRequests = this.requests.tick(
        dtMinutes,
        this.gm.clock.minutes,
        this.gm.weather,
        this.pose,
        this.requests.getRequestRateMultiplier() * eventDemandMult
      );
      for (const req of newRequests) {
        this.ride.offer(req);
      }
    }
  }

  /** Resets story/economy state and starts the opening tutorial. Replaces the
   * inline reset previously in main.ts's onNewCareer dispatcher. */
  newCareer(): void {
    this.lastPunctureMin = -Infinity;
    this.gm.clock.day = 1;
    this.gm.clock.minutes = 7 * 60;
    this.gm.economy.cash = 600;
    this.gm.economyManager.cash = 600;
    this.gm.economy.fuelLevel = 1.2;
    this.gm.economyManager.fuelLevel = 1.2;
    // A new career starts with a clean paid-trip record, or the tutorial ride would count as already settled.
    this.gm.economyManager.restoreLedger([], []);
    this.gm.requestSeq = 0;
    this.gm.negotiationHistory = 0;
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
