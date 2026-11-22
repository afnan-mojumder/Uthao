import { GameManager } from './GameManager';
import { RideManager, type DisputeResolutionKind, type PendingDispute } from './ride/RideManager';
import { RequestGenerator } from './ride/RequestGenerator';
import { TrafficManager, VEHICLE_CONFIGS } from './traffic/TrafficManager';
import type { RoadNetwork } from './road/RoadNetwork';
import type { SegmentElevationHit } from './road/spatial';
import { encounterPhaseFor, type RidePhaseInput } from './events/phase';
import type { EncounterContext, EncounterPhase } from './events/conditions';
import { ViolationMonitor } from './events/violations';
import { assessAccident } from './events/accidents';
import { getCharacter } from './passenger/PassengerAI';
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
import { DISTANCE_SCALE, SIM_DT } from '../config/constants';
import { BALANCE } from '../config/balance';
import { hashSeed, type Rng } from '../core/rng';
import { TIME_SCALE } from '../core/clock';
import { clamp } from '../core/math';
import { receipt as buildReceipt, fuelUsed, type FuelOptions } from './economy/fuel';
import { bikeDefToSpec, getBikeDef } from './economy/bikes';
import { checkPuncture } from './economy/maintenance';
import type {
  ActiveDeliveryTarget,
  ActiveFollowUpState,
  DeliveryJob,
  EncounterStageKind,
  EncounterStageState,
  MissionBeaconKind,
  MissionBeaconState,
  StreetHailActorState,
  TripReceipt,
  PassengerProfile,
  PassengerActorState,
  IntermediateStopState,
  RoadSegment,
  RideRequest,
  BikeInfractionKind,
  EncounterInstance,
} from '../core/types';
import type { MissionWorldCue } from './mission/MissionManager';
import type { ActiveRoadEvent } from './world/RoadEvents';
import { nearestPlaceKey } from './ride/rideView';
import { getSidewalkOffset } from './traffic/pedestrians';
import type { Route } from './road/routing';
import {
  startNegotiation,
  type NegotiationResult,
  type NegotiationSession,
} from './negotiation/NegotiationSystem';
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
const PICKUP_ARRIVAL_ENCOUNTER_IDS = [
  'enc_late_passenger',
  'enc_wrong_pickup_pin',
  'enc_parent_child',
  'enc_off_app',
  'enc_alley_enter',
] as const;
const DROPOFF_ARRIVAL_ENCOUNTER_IDS = [
  'enc_no_change',
  'enc_vendor_discount',
] as const;

export interface FastForwardTripOptions {
  idleMin?: number;
  speedMultiplier?: number;
  nearMisses?: number;
  bumps?: number;
  crashed?: boolean;
  infractions?: number;
  helpfulChoice?: boolean;
  onEncounter?: (instance: EncounterInstance) => string | undefined;
  onDispute?: (dispute: PendingDispute) => DisputeResolutionKind;
}

export interface FastForwardTripResult {
  status: 'completed' | 'noShow' | 'cancelled' | 'disputed' | 'idle';
  receipt: TripReceipt | null;
  durationMin: number;
  fuelLiters: number;
  distanceKm: number;
  encountersResolved: number;
}

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
  private readonly pose: { x: number; y: number; z: number; speed: number; heading: number };
  // Reused every tick (the step loop is allocation-free); see currentEncounterPhase.
  private readonly phaseInput: RidePhaseInput = {
    trip: 'Idle',
    hasRequest: false,
    distToPickupM: Infinity,
    distToDropoffM: Infinity,
    isPostDropoff: false,
  };
  // T8.3 live fuel/wear state, all reused to keep step() allocation-free.
  private readonly fuelOpts: FuelOptions = {};
  private readonly breakdownRng: Rng;
  private readonly punctureRng: Rng;
  private readonly deliveryRng: Rng;
  private readonly fuelStations: { x: number; z: number }[] = [];
  private readonly teaStalls: { x: number; z: number }[] = [];
  private readonly homePos: { x: number; z: number } | null;
  private readonly kamalGaragePos: { x: number; z: number } | null;
  private readonly poiPositions: {
    id: string;
    nodeId: string;
    kind: string;
    nameKey: string;
    x: number;
    z: number;
  }[] = [];
  private readonly nearbyPoiIds = new Set<string>();
  private readonly nearbyAnchorKindsScratch: string[] = [];
  private nearbyAnchorPlaceKeyScratch = '';
  private nearbyAnchorNodeIdScratch: string | null = null;
  private inlineAnchorNodeId: string | null = null;
  private readonly nearbyRoadEventKindsScratch: string[] = [];
  private tempBusBlockEventId: string | null = null;
  private readonly encounterAvoidSegments = new Set<string>();
  private inFastForward = false;
  private pickupLegDistanceM = 0;
  private tripLegDistanceM = 0;
  private roamDistanceSinceLastEncM = 0;
  private hasChildPassenger = false;
  private passengerWalkPhase: 'none' | 'boarding' = 'none';
  private passengerWalkElapsedSec = 0;
  private activeRideRequestId: string | null = null;
  private activeFollowUp: ActiveFollowUpState | null = null;
  private followUpRoute: Route | null = null;
  private postDropoffUntilMin: number | null = null;
  private postDropoffDropNodeId: string | null = null;
  private readonly kerbsScratch = { x: 0, z: 0, facingRad: 0 };
  private readonly stagePoseScratch = { x: 0, y: 0, z: 0, facingRad: 0 };
  private stagedEncounterKey = '';
  private stagedEncounterAnchorTag = '';
  private stagedX = 0;
  private stagedY = 0;
  private stagedZ = 0;
  private stagedFacing = 0;
  private readonly encounterStageScratch: EncounterStageState = {
    kind: 'none',
    worldX: 0,
    worldY: 0,
    worldZ: 0,
    facingRad: 0,
    urgent: false,
  };
  private readonly streetHailSlots: Array<
    StreetHailActorState & { ttlSec: number; offeredRequestId: string | null }
  > = [
      {
        active: false,
        nodeId: '',
        worldX: 0,
        worldZ: 0,
        facingRad: 0,
        seed: 0,
        placeKey: '',
        ttlSec: 0,
        offeredRequestId: null,
      },
      {
        active: false,
        nodeId: '',
        worldX: 0,
        worldZ: 0,
        facingRad: 0,
        seed: 0,
        placeKey: '',
        ttlSec: 0,
        offeredRequestId: null,
      },
    ];
  private streetHailScanAccumSec = 0;
  private nearbyHailNotifiedNodeId: string | null = null;
  private roamingDeliverySeq = 0;
  private cachedDeliveryTarget: ActiveDeliveryTarget | null = null;
  private cachedDeliveryRoute: Route | null = null;
  private cachedDeliveryKey = '';
  private cachedDeliveryFromNodeId = '';
  private readonly missionBeaconScratch: MissionBeaconState = {
    visible: false,
    missionId: '',
    kind: 'reach',
    nodeId: '',
    placeKey: '',
    worldX: 0,
    worldZ: 0,
    characterId: undefined,
  };
  private readonly missionCharacterScratch: PassengerActorState = {
    mode: 'hidden',
    worldX: 0,
    worldZ: 0,
    facingRad: 0,
  };
  private cachedMissionId = '';
  private cachedMissionKind: MissionBeaconKind | '' = '';
  private cachedMissionPoiId = '';
  private cachedMissionCharId = '';
  private cachedMissionDistrict = '';
  private cachedMissionZoneTag = '';
  private cachedMissionFromNodeId = '';
  private cachedMissionNodeId = '';
  private cachedMissionPlaceKey = '';
  private cachedMissionWorldX = 0;
  private cachedMissionWorldZ = 0;
  private cachedMissionRoute: Route | null = null;
  private missionPullUpOfferedCharId: string | null = null;
  private missionZoneOfferCooldownSec = 0;
  private stagedWrongPickupReqId: string | null = null;
  private readonly passengerActorScratch: PassengerActorState = {
    mode: 'hidden',
    worldX: 0,
    worldZ: 0,
    facingRad: 0,
  };
  private readonly speedBumps = new Map<string, { midX: number; midZ: number; ux: number; uz: number }>();
  private readonly recoveryAabbOut: StaticBoxHandle[] = [];
  private readonly segElevScratch: SegmentElevationHit = {
    segment: null,
    y: 0,
    t: 0,
    distXZ: Infinity,
  };
  private lastAccidentEncounterMin = -Infinity;
  private lastPunctureMin = -Infinity;
  private accidentSeq = 0;
  private lastStepSegment: RoadSegment | null = null;
  private readonly violationMonitor = new ViolationMonitor();
  private readonly onInfraction = (kind: BikeInfractionKind, segmentId: string): void => {
    this.gm.bus.emit('bike/infraction', { kind, segmentId });
  };
  private readonly encounterPassengerScratch = {
    id: '',
    trust: 50,
    mood: 1.0,
    localKnowledge: 0.5,
    paymentReliability: 1.0,
    archetype: 'commuter',
    hasChild: false,
  };
  private readonly encounterCtxScratch: EncounterContext = {
    phase: 'roaming',
    minute: 420,
    day: 1,
    weather: 'clear',
    chapter: 1,
    flags: {},
    relationships: {},
    cash: 600,
    speedKmh: 0,
    bikeCondition: 80,
    segment: null,
    activeRequest: null,
    tripDistanceM: 0,
    pickupDistanceM: 0,
    roamDistanceM: 0,
    nearbyAnchorKinds: [],
    nearbyAnchorPlaceKey: '',
    passenger: null,
  };
  private offAppSeq = 0;
  private lastSpeedBumpSegId: string | null = null;
  private hasGoodTires = false;
  private envFlooded = false;
  private tripReqId: string | null = null;
  private warnedWorn = false;
  private stallSec = 0;
  private missionRideOfferCooldownSec = 0;
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
      roadEvents: this.gm.roadEvents,
      weatherSystem: this.gm.weatherSystem,
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
      profileOf: (req) => this.requests.getProfile(req.passengerId),
      onPickupArrival: (req) => this.handlePickupArrival(req),
      onDropoffArrival: (req) => this.handleDropoffArrival(req),
      advanceClockMin: (gameMin) => {
        if (gameMin > 0) {
          this.gm.clock.advance((gameMin * 60) / TIME_SCALE);
        }
      },
      getStoryFlags: () => this.gm.story.branchFlags,
    });
    // T7.5: lets effect handlers (e.g. `endTrip`) reach the live ride state.
    this.gm.rideManager = this.ride;
    this.gm.setRoadNetwork(this.road);
    this.gm.onRouteEffect = (action, ref) => {
      if (action === 'forceVia') {
        this.ride.rerouteViaTag(ref);
      } else if (action === 'avoid' || action === 'closeSegment') {
        const resolvedRef =
          ref === 'active_segment' ? (this.lastStepSegment?.segmentId ?? '') : ref;
        if (!resolvedRef) return;
        this.encounterAvoidSegments.add(resolvedRef);
        this.ride.rerouteAvoiding(this.encounterAvoidSegments);
      }
    };
    this.gm.onEncounterOptionChosen = (info) => this.handleEncounterOptionChosen(info);
    this.gm.bus.on('encounter/started', ({ instance }) => {
      this.roamDistanceSinceLastEncM = 0;
      this.inlineAnchorNodeId =
        instance.presentation === 'inline' ? this.nearbyAnchorNodeIdScratch : null;
      if (
        instance.encounterId === 'enc_bus_block' &&
        !this.inFastForward &&
        !this.nearbyRoadEventKindsScratch.includes('stalled_vehicle') &&
        this.lastStepSegment
      ) {
        this.tempBusBlockEventId = 'evt_enc_bus_block';
        this.gm.roadEvents.addEvent({
          id: this.tempBusBlockEventId,
          kind: 'stalled_vehicle',
          segmentId: this.lastStepSegment.segmentId,
          closesSegment: false,
          speedCapKmh: 8,
          congestionMultiplier: 2.5,
          startMinute: this.gm.clock.minutes,
          durationMinutes: 15,
          title: { bn: 'গাড়ি বিকল', en: 'Stalled Vehicle' },
        });
      }
      this.syncEncounterStage(this.lastStepSegment);
    });
    this.gm.bus.on('encounter/resolved', (ev) => {
      if (
        ev.encounterId === 'enc_bus_block' &&
        (ev.choiceId === 'honk' || ev.choiceId === 'wait')
      ) {
        if (this.tempBusBlockEventId) {
          this.gm.roadEvents.removeEvent(this.tempBusBlockEventId);
          this.tempBusBlockEventId = null;
        } else {
          const removeId = this.findNearestStalledEventId();
          if (removeId) this.gm.roadEvents.removeEvent(removeId);
        }
      }
      this.syncEncounterStage(this.lastStepSegment);
    });
    this.gm.bus.on('ride/accepted', () => {
      for (let i = 0; i < this.streetHailSlots.length; i++) {
        const slot = this.streetHailSlots[i]!;
        slot.active = false;
        slot.offeredRequestId = null;
      }
      this.nearbyHailNotifiedNodeId = null;
    });
    this.gm.bus.on('world/roadEvent', ({ event }) => {
      if (!event.segmentId) return;
      if (event.active) {
        const full = this.gm.roadEvents.getEventById(event.id);
        if (full?.hasWorkers && !this.traffic.pedestrians.hasRoadWorkers(event.segmentId)) {
          this.traffic.pedestrians.spawnRoadWorkers(event.segmentId, 2);
        }
      } else if (!this.gm.roadEvents.hasActiveWorkerEventOnSegment(event.segmentId)) {
        this.traffic.pedestrians.clearRoadWorkers(event.segmentId);
      }
    });
    this.gm.bus.on('ride/accepted', (ev) => {
      this.activeRideRequestId = ev.requestId;
    });
    this.gm.bus.on('ride/started', (ev) => {
      this.activeRideRequestId = ev.requestId;
    });
    this.gm.bus.on('ride/completed', (ev) => {
      const doneReq = this.ride.getActiveRequest();
      if (!this.activeRideRequestId || this.activeRideRequestId === ev.requestId) {
        this.activeRideRequestId = null;
      }
      this.missionPullUpOfferedCharId = null;
      this.stagedWrongPickupReqId = null;
      if (!this.inFastForward) {
        this.postDropoffUntilMin = this.gm.clock.minutes + 2.0;
        this.postDropoffDropNodeId =
          doneReq?.destinationNodeId ??
          this.road.nearestNode(this.bike.x, this.bike.z)?.nodeId ??
          null;
      }
      const act = this.gm.eventDirector.activeEncounter;
      if (act?.presentation === 'inline' && act.encounterId !== 'enc_phone_left') {
        this.gm.eventDirector.dismissActive('rideEnded', this.gm.bus);
      }
    });
    this.gm.bus.on('ride/cancelled', (ev) => {
      const currentActiveId = this.ride.getActiveRequest()?.requestId ?? this.activeRideRequestId;
      if (currentActiveId !== ev.requestId) return;
      this.activeRideRequestId = null;
      this.passengerWalkPhase = 'none';
      this.passengerWalkElapsedSec = 0;
      this.missionPullUpOfferedCharId = null;
      this.stagedWrongPickupReqId = null;
      const act = this.gm.eventDirector.activeEncounter;
      if (act?.presentation === 'inline' && act.encounterId !== 'enc_phone_left') {
        this.gm.eventDirector.dismissActive('rideEnded', this.gm.bus);
      }
    });
    this.ride.enableNegotiation = opts.negotiation ?? true;
    // H: an agreed fare well above fair adds an overcharge mark, a fair one or explicit discount rebuilds goodwill.
    this.gm.bus.on('negotiation/result', (ev) => {
      if (ev.outcome.kind !== 'accepted') return;
      const req = this.ride.getActiveRequest();
      if (!req || req.requestId !== ev.requestId) return;
      const trustSubjectId = req.characterId ?? req.passengerId;
      if (ev.discount) {
        this.gm.reputationSystem.applyMeter(
          'publicReputation',
          2,
          'karma.negotiation_discount',
          trustSubjectId
        );
        this.gm.reputationSystem.changePassengerTrust(trustSubjectId, 4);
        if (req.characterId) {
          this.gm.reputationSystem.changeRelationship(req.characterId, 3);
        }
        this.gm.negotiationHistory = clamp(this.gm.negotiationHistory + 0.05, -1, 1);
        return;
      }
      const fair = fairFare(req.estimatedDistance, req.estimatedDuration, req.surge);
      const over = ev.outcome.fare / Math.max(fair, 1) - 1;
      const h = this.gm.negotiationHistory;
      if (over > BALANCE.NEGOTIATION.overchargeMargin) {
        this.gm.reputationSystem.applyMeter(
          'riderIntegrity',
          -4,
          'karma.overcharge',
          trustSubjectId
        );
        this.gm.reputationSystem.changePassengerTrust(trustSubjectId, -5);
      }
      this.gm.negotiationHistory = clamp(
        over > BALANCE.NEGOTIATION.overchargeMargin ? h - 0.15 : over <= 0.05 ? h + 0.05 : h,
        -1,
        1
      );
    });
    this.traffic = new TrafficManager(this.road, this.gm.seed, this.gm.roadEvents);
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
    } else {
      this.bike = createDefaultBikeState();
    }

    this.gm.bus.on('bike/collision', (ev) => {
      if (ev.severity !== 'crash') return;
      this.traffic.pedestrians.reportAccident(this.bike.x, this.bike.z);
      const report = assessAccident(ev, {
        id: `acc_${this.gm.clock.day}_${Math.floor(this.gm.clock.minutes)}_${++this.accidentSeq}`,
        bikeSpeedKmh: ev.bikeSpeedKmh ?? Math.abs(this.bike.speed) * 3.6,
        otherSpeedKmh: ev.otherSpeedKmh,
        hasPassenger: this.env.hasPassenger,
        wet: this.env.wet,
        bikeCondition: this.gm.economyManager.motorcycleCondition,
        pedestrianDensity: this.lastStepSegment?.pedestrianDensity ?? 0.3,
      });

      const nextCond = Math.max(0, this.gm.economyManager.motorcycleCondition - report.bikeDamage);
      this.gm.economyManager.motorcycleCondition = nextCond;
      this.gm.economy.motorcycleCondition = nextCond;

      const isSerious =
        report.severity === 'serious' || report.riderInjury >= 2 || report.passengerInjury >= 2;
      this.gm.story.branchFlags['accident'] = true;
      this.gm.story.branchFlags['accidentSeverity'] = report.severity;
      this.gm.story.branchFlags['accidentSerious'] = isSerious;
      this.gm.story.branchFlags['accidentOtherParty'] = report.otherParty;
      this.gm.story.branchFlags['accidentResponsibility'] = report.responsibility;

      const started = this.maybeStartAccidentEncounter();
      if (started) {
        this.ride.interrupt();
      } else if (isSerious) {
        this.gm.economyManager.post({
          id: `tx_med_${report.id}`,
          day: this.gm.clock.day,
          minute: this.gm.clock.minutes,
          kind: 'medical',
          amount: -250,
        });
        const req = this.ride.getActiveRequest();
        if (req) {
          this.ride.cancel(req.requestId, 'system', 'accident');
        }
      } else if (
        this.ride.getTripState() === 'EmergencyInterrupted' &&
        this.gm.eventDirector.activeEncounter?.encounterId !== 'enc_accident_aftermath'
      ) {
        this.ride.resumeTrip();
      }
    });

    this.gm.bus.on('encounter/resolved', (ev) => {
      if (ev.encounterId !== 'enc_accident_aftermath') return;
      this.gm.story.branchFlags['accident'] = false;
      if (this.ride.getTripState() === 'EmergencyInterrupted') {
        if (this.gm.story.branchFlags['accidentSerious']) {
          const req = this.ride.getActiveRequest();
          if (req) {
            this.ride.cancel(req.requestId, 'system', 'accident');
          }
        } else {
          this.ride.resumeTrip();
        }
      }
    });

    this.env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100, fuelEmpty: false };
    this.camView = { x: 0, z: 0, heading: 0, fovRad: (60 * Math.PI) / 180 };
    this.pose = { x: 0, y: 0, z: 0, speed: 0, heading: 0 };

    this.breakdownRng = this.gm.rng.fork('breakdown');
    this.punctureRng = this.gm.rng.fork('puncture');
    this.deliveryRng = this.gm.rng.fork('delivery');
    for (const poi of this.road.getPois()) {
      const node = this.road.getNode(poi.nodeId);
      if (node) {
        this.poiPositions.push({
          id: poi.id,
          nodeId: poi.nodeId,
          kind: poi.kind,
          nameKey: poi.nameKey,
          x: node.x,
          z: node.z,
        });
        if (poi.kind === 'fuel') this.fuelStations.push({ x: node.x, z: node.z });
        if (poi.kind === 'teaStall') this.teaStalls.push({ x: node.x, z: node.z });
      }
    }
    const homeNode = this.road.getNode(this.gm.homeNodeId) ?? this.road.getAllNodes()[0];
    this.homePos = homeNode ? { x: homeNode.x, z: homeNode.z } : null;
    const kamalPoi =
      this.poiPositions.find(
        (p) => p.id === 'poi_mirpara_garage' || p.nameKey === 'poi.mirpara.garage'
      ) ??
      this.poiPositions.find((p) => p.kind === 'garage' && p.id !== 'poi_mohakhal_garage');
    this.kamalGaragePos = kamalPoi ? { x: kamalPoi.x, z: kamalPoi.z } : null;
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
    this.gm.getBikePose = () => ({
      x: this.bike.x,
      y: this.bike.y,
      z: this.bike.z,
      heading: this.bike.heading,
    });
    this.gm.restoreBikePose = (pose) => this.restoreBikePose(pose);
    this.gm.getActiveFollowUp = () =>
      this.activeFollowUp ? { ...this.activeFollowUp } : null;
    this.gm.restoreActiveFollowUp = (followUp) => {
      this.activeFollowUp = followUp ? { ...followUp } : null;
      if (this.activeFollowUp) {
        const fromId = this.road.nearestNode(this.bike.x, this.bike.z)?.nodeId;
        this.followUpRoute = fromId
          ? this.road.route(fromId, this.activeFollowUp.nodeId, { mode: 'motorcycle' })
          : null;
      } else {
        this.followUpRoute = null;
      }
    };
    this.gm.spawnSpecialRequest = (templateId) => {
      const res = templateId.startsWith('char_')
        ? this.requests.sampleRecurringRequest(
          this.gm.clock.minutes,
          this.gm.weather,
          templateId,
          'direct',
          true
        )
        : this.requests.sampleRequest(
          this.gm.clock.minutes,
          this.gm.weather,
          templateId === 'street' ? 'street' : 'app'
        );
      if (res) this.ride.offer(res.request);
    };

    this.gm.bus.on('mission/activated', ({ missionId }) => {
      const def = this.gm.missionManager.missions.get(missionId);
      if (!def) return;
      for (const obj of def.objectives) {
        if (obj.type === 'rideWith') {
          this.offerMissionRideWith(obj.characterId);
        }
      }
    });

    this.gm.bus.on('bike/swapped', () => this.syncBikeSpec());
    this.gm.bus.on('upgrade/purchased', (ev) => {
      this.syncBikeSpec();
      if (
        ev.upgradeId === 'upgrade_luggage_carrier' &&
        this.gm.deliveryManager.offeredDeliveries.size === 0
      ) {
        this.gm.deliveryManager.generateOffer(this.road, this.deliveryRng, this.gm.clock.day, {
          playerPos: this.pose,
          unlockedDistricts: this.gm.missionManager.getUnlockedDistricts(),
        });
      }
    });
    this.gm.bus.on('day/started', () => {
      this.lastAccidentEncounterMin = -Infinity;
      this.missionRideOfferCooldownSec = 0;
      this.postDropoffUntilMin = null;
      this.postDropoffDropNodeId = null;
      this.activeFollowUp = null;
      this.followUpRoute = null;
      this.encounterAvoidSegments.clear();
      this.inlineAnchorNodeId = null;
      this.violationMonitor.reset();
      this.resetWorldEventStageState();
      this.reconcileRoadEventWorkers();
      if (this.ride.getTripState() === 'EmergencyInterrupted') {
        this.ride.resumeTrip();
      }
      this.spawnAtHome();
      for (const charId of this.gm.missionManager.getPendingRideWithCharacterIds()) {
        this.offerMissionRideWith(charId);
      }
    });
    this.gm.bus.on('day/ended', () => {
      this.gm.story.branchFlags['accident'] = false;
      if (this.ride.getTripState() === 'EmergencyInterrupted') {
        if (this.gm.story.branchFlags['accidentSerious']) {
          const req = this.ride.getActiveRequest();
          if (req) this.ride.cancel(req.requestId, 'system', 'accident');
        } else {
          this.ride.resumeTrip();
        }
      }
    });
    this.gm.bus.on('state/restored', () => {
      this.lastPunctureMin = -Infinity;
      this.lastAccidentEncounterMin = -Infinity;
      this.tripReqId = null;
      this.tripFuelLiters = 0;
      this.wedgedSec = 0;
      this.stallSec = 0;
      this.warnedWorn = false;
      this.trafficContacts.clear();
      this.violationMonitor.reset();
      this.encounterAvoidSegments.clear();
      this.activeFollowUp = null;
      this.followUpRoute = null;
      this.postDropoffUntilMin = null;
      this.postDropoffDropNodeId = null;
      this.pickupLegDistanceM = 0;
      this.tripLegDistanceM = 0;
      this.roamDistanceSinceLastEncM = 0;
      this.passengerWalkPhase = 'none';
      this.passengerWalkElapsedSec = 0;
      this.inlineAnchorNodeId = null;
      this.resetWorldEventStageState();
      this.reconcileRoadEventWorkers();
      if (this.ride.getTripState() === 'EmergencyInterrupted') {
        this.ride.resumeTrip();
      }
      this.syncBikeSpec();
      this.syncLocation();
    });
    this.reconcileRoadEventWorkers();
    this.syncBikeSpec();
    this.syncLocation();
  }

  /** Updates GameManager's node, virtual home distance, and Kamal garage proximity without allocating. */
  private syncLocation(): void {
    if (this.gm.shiftEnded) return;
    const nearest = this.road.nearestNode(this.bike.x, this.bike.z);
    const nodeId = nearest ? nearest.nodeId : this.gm.playerNodeId;
    let distFromHomeM = 0;
    if (this.homePos) {
      const dx = this.bike.x - this.homePos.x;
      const dz = this.bike.z - this.homePos.z;
      distFromHomeM = Math.hypot(dx, dz) * DISTANCE_SCALE;
    }
    let atKamal = false;
    if (this.kamalGaragePos) {
      const gx = this.bike.x - this.kamalGaragePos.x;
      const gz = this.bike.z - this.kamalGaragePos.z;
      const r = BALANCE.FUEL.stationRangeM;
      atKamal = gx * gx + gz * gz <= r * r;
    }
    this.gm.syncPlayerLocation(nodeId, distFromHomeM, atKamal);
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
    const tripRoute = this.road.route(req.pickupNodeId, req.destinationNodeId, {
      mode: 'motorcycle',
      roadEvents: this.gm.roadEvents,
      weather: this.gm.weather,
      minute: this.gm.clock.minutes,
    });
    const hasDetour =
      (this.ride.currentRoute?.uTurns ?? 0) > 0 ||
      (tripRoute?.uTurns ?? 0) > 0 ||
      this.gm.roadEvents.getClosedSegmentIds().length > 0 ||
      this.gm.weather === 'heavyRain';
    return startNegotiation(req, profile, {
      traffic: Math.min(1, (isRushHourMinute(this.gm.clock.minutes) ? 0.7 : 0.3) + (rain ? 0.15 : 0)),
      walkM: 0,
      day: this.gm.clock.day,
      history: this.gm.negotiationHistory,
      hasDetour,
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

  /** Non-alley entrance option when the pickup or destination sits inside an alley. */
  alleyChoice(): { nodeId: string; walkM: number; target: 'pickup' | 'destination' } | null {
    const req = this.ride.getActiveRequest();
    if (!req || this.ride.getTripState() !== 'Negotiating') return null;
    return this.ride.alleyEntranceOption(req);
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
    this.ride.recordOffAppRide(
      req.passengerId,
      this.gm.clock.day,
      this.gm.rng.fork(`offApp:${++this.offAppSeq}`)
    );
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

  /** Nearest POI matching an active `reach` mission objective, for HUD/minimap guidance. */
  getNearestMissionTarget(
    poiIdOverride?: string
  ): { x: number; z: number; nameKey: string; distanceM: number } | null {
    const targetPoiId = poiIdOverride ?? this.gm.missionManager.getActiveReachTarget()?.poiId;
    if (!targetPoiId) return null;
    const isKind = targetPoiId.startsWith('poi_kind:');
    const kind = isKind ? targetPoiId.slice('poi_kind:'.length) : '';
    let best: { x: number; z: number; nameKey: string; distanceM: number } | null = null;
    for (const poi of this.poiPositions) {
      if (isKind ? poi.kind !== kind : poi.id !== targetPoiId) continue;
      const dist = Math.hypot(poi.x - this.bike.x, poi.z - this.bike.z);
      if (!best || dist < best.distanceM) {
        best = { x: poi.x, z: poi.z, nameKey: poi.nameKey, distanceM: dist };
      }
    }
    return best;
  }

  private resolveMissionTargetNode(cue: MissionWorldCue): {
    nodeId: string;
    placeKey: string;
    worldX: number;
    worldZ: number;
  } | null {
    if (cue.poiId) {
      const isKind = cue.poiId.startsWith('poi_kind:');
      const target = isKind ? cue.poiId.slice('poi_kind:'.length) : cue.poiId;
      let bestPoi: (typeof this.poiPositions)[number] | null = null;
      let bestDist = Infinity;
      for (let i = 0; i < this.poiPositions.length; i++) {
        const poi = this.poiPositions[i]!;
        if (isKind ? poi.kind !== target : poi.id !== target) continue;
        if (!this.road.getNode(poi.nodeId)) continue;
        const d = Math.hypot(poi.x - this.bike.x, poi.z - this.bike.z);
        if (d < bestDist) {
          bestDist = d;
          bestPoi = poi;
        }
      }
      if (bestPoi) {
        return {
          nodeId: bestPoi.nodeId,
          placeKey: bestPoi.nameKey,
          worldX: bestPoi.x,
          worldZ: bestPoi.z,
        };
      }
    }

    if (cue.characterId) {
      const charDef = getCharacter(cue.characterId);
      let nodeId = charDef?.homeNodeId ?? '';
      if (!nodeId || !this.road.getNode(nodeId)) {
        if (cue.characterId === 'char_kamal' && this.kamalGaragePos) {
          nodeId = this.road.nearestNode(this.kamalGaragePos.x, this.kamalGaragePos.z)?.nodeId ?? '';
        }
      }
      const node = nodeId ? this.road.getNode(nodeId) : undefined;
      if (node) {
        let worldX = node.x;
        let worldZ = node.z;
        if (this.resolveNodeKerbPose(node.nodeId, this.kerbsScratch)) {
          worldX = this.kerbsScratch.x;
          worldZ = this.kerbsScratch.z;
        }
        return {
          nodeId: node.nodeId,
          placeKey: nearestPlaceKey(this.ride, node.nodeId),
          worldX,
          worldZ,
        };
      }
    }

    if (cue.district || cue.zoneTag) {
      const eligible = this.requests.getEligibleNodeIdsReadonly();
      let bestNode: { nodeId: string; x: number; z: number } | null = null;
      let bestDist = Infinity;
      for (let i = 0; i < eligible.length; i++) {
        const id = eligible[i]!;
        if (cue.district && this.road.getNodeDistrict(id) !== cue.district) continue;
        if (cue.zoneTag && !this.road.getNodeZoneTags(id).includes(cue.zoneTag)) continue;
        const n = this.road.getNode(id);
        if (!n) continue;
        const d = Math.hypot(n.x - this.bike.x, n.z - this.bike.z);
        if (d < bestDist) {
          bestDist = d;
          bestNode = n;
        }
      }
      if (!bestNode) {
        for (const n of this.road.getAllNodes()) {
          if (cue.district && this.road.getNodeDistrict(n.nodeId) !== cue.district) continue;
          if (cue.zoneTag && !this.road.getNodeZoneTags(n.nodeId).includes(cue.zoneTag)) continue;
          const d = Math.hypot(n.x - this.bike.x, n.z - this.bike.z);
          if (d < bestDist) {
            bestDist = d;
            bestNode = n;
          }
        }
      }
      if (bestNode) {
        return {
          nodeId: bestNode.nodeId,
          placeKey: nearestPlaceKey(this.ride, bestNode.nodeId),
          worldX: bestNode.x,
          worldZ: bestNode.z,
        };
      }
    }

    return null;
  }

  /** Allocation-free live 3D beacon state for the active mission objective when not in a ride. */
  getActiveMissionBeaconState(): MissionBeaconState {
    const out = this.missionBeaconScratch;
    if (
      this.ride.getActiveRequest() !== null ||
      this.activeFollowUp !== null ||
      this.gm.deliveryManager.activeDeliveries.size > 0
    ) {
      out.visible = false;
      return out;
    }

    const cue = this.gm.missionManager.getPrimaryWorldMissionCue();
    if (!cue) {
      if (this.cachedMissionId !== '') {
        this.cachedMissionId = '';
        this.cachedMissionKind = '';
        this.cachedMissionNodeId = '';
        this.cachedMissionRoute = null;
      }
      out.visible = false;
      return out;
    }

    const fromNodeId = this.road.nearestNode(this.bike.x, this.bike.z)?.nodeId ?? '';
    const cuePoi = cue.poiId ?? '';
    const cueChar = cue.characterId ?? '';
    const cueDist = cue.district ?? '';
    const cueZone = cue.zoneTag ?? '';
    const sameCue =
      cue.missionId === this.cachedMissionId &&
      cue.kind === this.cachedMissionKind &&
      cuePoi === this.cachedMissionPoiId &&
      cueChar === this.cachedMissionCharId &&
      cueDist === this.cachedMissionDistrict &&
      cueZone === this.cachedMissionZoneTag &&
      fromNodeId === this.cachedMissionFromNodeId;

    if (!sameCue) {
      const resolved = this.resolveMissionTargetNode(cue);
      this.cachedMissionId = cue.missionId;
      this.cachedMissionKind = cue.kind;
      this.cachedMissionPoiId = cuePoi;
      this.cachedMissionCharId = cueChar;
      this.cachedMissionDistrict = cueDist;
      this.cachedMissionZoneTag = cueZone;
      this.cachedMissionFromNodeId = fromNodeId;
      if (resolved) {
        this.cachedMissionNodeId = resolved.nodeId;
        this.cachedMissionPlaceKey = resolved.placeKey;
        this.cachedMissionWorldX = resolved.worldX;
        this.cachedMissionWorldZ = resolved.worldZ;
        this.cachedMissionRoute =
          fromNodeId && resolved.nodeId && fromNodeId !== resolved.nodeId
            ? this.road.route(fromNodeId, resolved.nodeId, {
                mode: 'motorcycle',
                roadEvents: this.gm.roadEvents,
                weather: this.gm.weather,
                minute: this.gm.clock.minutes,
              })
            : null;
      } else {
        this.cachedMissionNodeId = '';
        this.cachedMissionPlaceKey = '';
        this.cachedMissionWorldX = 0;
        this.cachedMissionWorldZ = 0;
        this.cachedMissionRoute = null;
      }
    }

    if (!this.cachedMissionNodeId) {
      out.visible = false;
      return out;
    }

    out.visible = true;
    out.missionId = this.cachedMissionId;
    out.kind = cue.kind;
    out.nodeId = this.cachedMissionNodeId;
    out.placeKey = this.cachedMissionPlaceKey;
    out.worldX = this.cachedMissionWorldX;
    out.worldZ = this.cachedMissionWorldZ;
    out.characterId = cue.characterId;
    return out;
  }

  /** Route from the player's current nearest road node to the active mission target (if roaming). */
  getActiveMissionRoute(): Route | null {
    const beacon = this.getActiveMissionBeaconState();
    return beacon.visible ? this.cachedMissionRoute : null;
  }

  /** Allocation-free 3D waving story character actor state for active `rideWith` / `relationship` missions. */
  getMissionCharacterActorState(): PassengerActorState {
    const out = this.missionCharacterScratch;
    const beacon = this.getActiveMissionBeaconState();
    if (
      !beacon.visible ||
      (beacon.kind !== 'ride_with' && beacon.kind !== 'relationship') ||
      !beacon.characterId
    ) {
      out.mode = 'hidden';
      out.waving = false;
      out.beaconVisible = false;
      return out;
    }

    const hasKerb = this.resolveNodeKerbPose(beacon.nodeId, this.kerbsScratch);
    const wx = hasKerb ? this.kerbsScratch.x : beacon.worldX;
    const wz = hasKerb ? this.kerbsScratch.z : beacon.worldZ;
    const dx = this.bike.x - wx;
    const dz = this.bike.z - wz;
    const dist = Math.hypot(dx, dz);
    out.mode = 'waitingAtPickup';
    out.worldX = wx;
    out.worldZ = wz;
    out.facingRad =
      dist < 45 && dist > 1e-3
        ? Math.atan2(dx, dz)
        : hasKerb
          ? this.kerbsScratch.facingRad
          : 0;
    out.passengerId = beacon.characterId;
    out.passengerSeed = hashSeed(beacon.characterId, 'appearance');
    out.hasChild = Boolean(getCharacter(beacon.characterId)?.fixedTraits.child);
    out.waving = true;
    out.beaconVisible = false;
    return out;
  }

  private updateMissionPullUpOffer(): void {
    if (
      this.inFastForward ||
      this.gm.shiftEnded ||
      this.ride.getActiveRequest() !== null ||
      this.gm.eventDirector.activeEncounter !== null
    ) {
      return;
    }
    const beacon = this.getActiveMissionBeaconState();
    if (!beacon.visible || beacon.kind !== 'ride_with' || !beacon.characterId) {
      return;
    }
    const dist = Math.hypot(beacon.worldX - this.bike.x, beacon.worldZ - this.bike.z);
    if (dist > 25) {
      if (this.missionPullUpOfferedCharId === beacon.characterId) {
        this.missionPullUpOfferedCharId = null;
      }
      return;
    }
    if (
      dist <= 12.0 &&
      Math.abs(this.bike.speed) < 3.5 &&
      this.missionPullUpOfferedCharId !== beacon.characterId
    ) {
      this.missionPullUpOfferedCharId = beacon.characterId;
      this.offerMissionRideWith(beacon.characterId);
    }
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
        const ctx = this.buildEncounterContext(this.lastStepSegment, this.ride.getActiveRequest());
        this.gm.eventDirector.forceStart('enc_puncture', this.gm.bus, ctx);
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
    this.placeOnRoadNear(anchor.x, anchor.z, anchor.y ?? 0);
    this.syncLocation();
  }

  /** Restores bike coordinates and heading safely against road/flyover elevation and static colliders. */
  restoreBikePose(pose?: { x: number; y?: number; z: number; heading: number }): void {
    if (
      !pose ||
      !Number.isFinite(pose.x) ||
      !Number.isFinite(pose.z) ||
      !Number.isFinite(pose.heading)
    ) {
      this.spawnAtHome();
      return;
    }

    const refY = typeof pose.y === 'number' && Number.isFinite(pose.y) ? pose.y : 0;
    const hit = this.road.segmentAtElevation(pose.x, pose.z, refY, 10, this.segElevScratch);
    const resolvedY = hit.segment !== null ? hit.y : refY;

    this.bike.x = pose.x;
    this.bike.y = resolvedY;
    this.bike.z = pose.z;
    this.bike.heading = pose.heading;
    this.bike.speed = 0;
    this.bike.gear = 1;
    this.bike.rpmNorm = 0.15;
    this.bike.lean = 0;
    this.bike.steer = 0;
    this.bike.wobble = false;
    this.bike.crashed = false;
    this.bike.reverseHoldS = 0;

    if (!this.isClearOfStaticColliders(this.bike.x, this.bike.z, this.bike.y)) {
      this.placeOnRoadNear(this.bike.x, this.bike.z, this.bike.y);
    }
    this.syncLocation();
  }

  /** Recovers a crashed or stuck bike: back onto the nearest road, stopped and
   * facing along it, so the rider keeps their place in the city (audit H-5, H-8). */
  recoverBike(): void {
    this.placeOnRoadNear(this.bike.x, this.bike.z, this.bike.y);
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

  private isClearOfStaticColliders(x: number, z: number, y: number = this.bike.y): boolean {
    if (!this.physics) return true;
    const pad = 0.6;
    this.physics.queryAabb(x - pad, z - pad, x + pad, z + pad, this.recoveryAabbOut);
    for (let i = 0; i < this.recoveryAabbOut.length; i++) {
      const box = this.recoveryAabbOut[i]!;
      if (box.maxY <= y || box.minY >= y + 1.5) continue;
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
  private placeOnRoadNear(
    anchorX: number,
    anchorZ: number,
    anchorY: number = this.bike.y
  ): void {
    let hit = this.road.segmentAtElevation(anchorX, anchorZ, anchorY, 30, this.segElevScratch);
    if (!hit.segment) {
      hit = this.road.segmentAtElevation(anchorX, anchorZ, anchorY, Infinity, this.segElevScratch);
    }
    const segment = hit.segment;
    const startNode = segment ? this.road.getNode(segment.startNodeId) : undefined;
    const endNode = segment ? this.road.getNode(segment.endNodeId) : undefined;

    let x = anchorX;
    let y = anchorY;
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
      y = (startNode.y ?? 0) + t * ((endNode.y ?? 0) - (startNode.y ?? 0));
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
        if (!this.isClearOfStaticColliders(candX, candZ, y)) {
          const altX = cx - leftX * side * laneOffset;
          const altZ = cz - leftZ * side * laneOffset;
          if (this.isClearOfStaticColliders(altX, altZ, y)) {
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
    this.bike.y = y;
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

  private maybeStartAccidentEncounter(): boolean {
    if (
      this.gm.eventDirector.enabled &&
      this.gm.eventDirector.activeEncounter === null &&
      this.gm.clock.minutes - this.lastAccidentEncounterMin >= 60
    ) {
      this.lastAccidentEncounterMin = this.gm.clock.minutes;
      const ctx = this.buildEncounterContext(this.lastStepSegment, this.ride.getActiveRequest());
      return this.gm.eventDirector.forceStart('enc_accident_aftermath', this.gm.bus, ctx) !== null;
    }
    return false;
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
      const y = this.traffic.getAgentY(agent);
      const height = VEHICLE_CONFIGS[agent.kind]?.height ?? 2.5;
      obb.id = agent.id;
      obb.kind = agent.kind;
      obb.x = agent.x;
      obb.z = agent.z;
      obb.halfX = agent.width * 0.5;
      obb.halfZ = agent.length * 0.5;
      obb.minY = y;
      obb.maxY = y + height;
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
      if (Math.abs(this.traffic.getAgentY(agent) - this.bike.y) > 2.5) {
        this.trafficContacts.delete(agent.id);
        continue;
      }
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
      this.gm.bus.emit('bike/collision', {
        severity,
        relSpeedKmh,
        otherKind: 'traffic',
        otherParty: true,
        bikeSpeedKmh: speedKmh,
        otherSpeedKmh: Math.abs(agentSpeed) * 3.6,
      });
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
    const isHeavyRain = this.gm.weatherSystem.weather === 'heavyRain';
    for (let i = 0; i < ids.length; i++) {
      const segId = ids[i]!;
      const seg = this.road.getSegment(segId);
      const floodedImpassable =
        this.gm.weatherSystem.getFloodLevel(segId) > 0.9 ||
        (isHeavyRain && seg !== undefined && seg.floodSensitivity > 0.9);
      if (this.gm.roadEvents.isSegmentClosed(segId) || floodedImpassable) {
        this.ride.rerouteIfBlocked(segId);
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

  /** The encounter phase the live ride is in: offer, en-route pickup, pickup, trip, drop-off, post-dropoff or roaming. */
  private currentEncounterPhase(): EncounterPhase {
    const s = this.phaseInput;
    const req = this.ride.getActiveRequest();
    s.trip = this.ride.getTripState();
    s.hasRequest = req !== null;
    s.distToPickupM = Infinity;
    s.distToDropoffM = Infinity;
    if (this.postDropoffUntilMin !== null && this.gm.clock.minutes > this.postDropoffUntilMin) {
      this.postDropoffUntilMin = null;
    }
    s.isPostDropoff = !req && this.postDropoffUntilMin !== null;
    if (req) {
      this.postDropoffUntilMin = null;
      const pickup = this.ride.roadNetwork.getNode(req.pickupNodeId);
      const dropoff = this.ride.roadNetwork.getNode(req.destinationNodeId);
      if (pickup) s.distToPickupM = Math.hypot(this.bike.x - pickup.x, this.bike.z - pickup.z);
      if (dropoff) s.distToDropoffM = Math.hypot(this.bike.x - dropoff.x, this.bike.z - dropoff.z);
    }
    return encounterPhaseFor(s);
  }

  private scanAheadAnchors(): void {
    this.nearbyAnchorKindsScratch.length = 0;
    this.nearbyAnchorPlaceKeyScratch = '';
    this.nearbyAnchorNodeIdScratch = null;
    const speed = Math.abs(this.bike.speed);
    if (speed < 1.5 && !this.inFastForward) return;
    const fwdX = Math.sin(this.bike.heading);
    const fwdZ = Math.cos(this.bike.heading);
    let bestDist = Infinity;
    for (let i = 0; i < this.poiPositions.length; i++) {
      const p = this.poiPositions[i]!;
      const dx = p.x - this.bike.x;
      const dz = p.z - this.bike.z;
      const d = Math.hypot(dx, dz);
      if (d < 25 || d > 65) continue;
      if (!this.inFastForward) {
        const forward = (dx * fwdX + dz * fwdZ) / d;
        if (forward < 0.25) continue;
      }
      if (!this.nearbyAnchorKindsScratch.includes(p.kind)) {
        this.nearbyAnchorKindsScratch.push(p.kind);
      }
      if (d < bestDist) {
        bestDist = d;
        this.nearbyAnchorPlaceKeyScratch = p.nameKey;
        this.nearbyAnchorNodeIdScratch = p.nodeId;
      }
    }
  }

  private resolveNodeKerbPose(
    nodeId: string,
    out: { x: number; z: number; facingRad: number }
  ): boolean {
    const node = this.road.getNode(nodeId);
    if (!node) return false;
    const segs = this.road.getAllSegments();
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i]!;
      if (seg.startNodeId !== nodeId && seg.endNodeId !== nodeId) continue;
      const sNode = this.road.getNode(seg.startNodeId);
      const eNode = this.road.getNode(seg.endNodeId);
      if (!sNode || !eNode) continue;
      const dx = eNode.x - sNode.x;
      const dz = eNode.z - sNode.z;
      const len = Math.hypot(dx, dz);
      if (len <= 0) continue;
      const nx = -dz / len;
      const nz = dx / len;
      const offset = getSidewalkOffset(seg);
      out.x = node.x + nx * offset;
      out.z = node.z + nz * offset;
      out.facingRad = Math.atan2(-nx, -nz);
      return true;
    }
    out.x = node.x + 2.8;
    out.z = node.z;
    out.facingRad = -Math.PI / 2;
    return true;
  }

  private findAheadStopPoi(
    kinds: readonly string[]
  ): { nodeId: string; placeKey: string; kind: string } | null {
    if (this.inlineAnchorNodeId) {
      for (let i = 0; i < this.poiPositions.length; i++) {
        const p = this.poiPositions[i]!;
        if (p.nodeId === this.inlineAnchorNodeId && kinds.includes(p.kind)) {
          return { nodeId: p.nodeId, placeKey: p.nameKey, kind: p.kind };
        }
      }
    }
    const fwdX = Math.sin(this.bike.heading);
    const fwdZ = Math.cos(this.bike.heading);
    let bestAhead: { nodeId: string; placeKey: string; kind: string } | null = null;
    let bestAheadScore = Infinity;
    let bestAny: { nodeId: string; placeKey: string; kind: string } | null = null;
    let bestAnyDist = Infinity;

    for (let i = 0; i < this.poiPositions.length; i++) {
      const p = this.poiPositions[i]!;
      if (!kinds.includes(p.kind)) continue;
      const dx = p.x - this.bike.x;
      const dz = p.z - this.bike.z;
      const d = Math.hypot(dx, dz);
      if (d < bestAnyDist) {
        bestAnyDist = d;
        bestAny = { nodeId: p.nodeId, placeKey: p.nameKey, kind: p.kind };
      }
      if (d >= 12 && d <= 200) {
        const dot = (dx * fwdX + dz * fwdZ) / d;
        if (dot >= 0 && d < bestAheadScore) {
          bestAheadScore = d;
          bestAhead = { nodeId: p.nodeId, placeKey: p.nameKey, kind: p.kind };
        }
      }
    }
    return bestAhead ?? bestAny;
  }

  private handlePickupArrival(req: RideRequest): 'hold' | 'proceed' {
    if (this.inFastForward) {
      return 'proceed';
    }
    if (req.requestId === 'req_tutorial_01') {
      this.passengerWalkPhase = 'boarding';
      this.passengerWalkElapsedSec = 0;
      return 'hold';
    }
    if (this.pickupLegDistanceM < 15) {
      return 'proceed';
    }
    const activeId = this.gm.eventDirector.activeEncounter?.encounterId;
    if (
      activeId &&
      (PICKUP_ARRIVAL_ENCOUNTER_IDS as readonly string[]).includes(activeId)
    ) {
      return 'hold';
    }
    if (this.gm.eventDirector.enabled && !this.ride.getPendingDispute()) {
      const ctx = this.buildEncounterContext(this.lastStepSegment, req);
      ctx.phase = 'atPickup';
      if (
        this.stagedWrongPickupReqId !== req.requestId &&
        this.gm.missionManager.hasIncompleteEncounterObjective('enc_wrong_pickup_pin')
      ) {
        this.stagedWrongPickupReqId = req.requestId;
        const wrongPinEnc = this.gm.eventDirector.forceStart(
          'enc_wrong_pickup_pin',
          this.gm.bus,
          ctx
        );
        if (wrongPinEnc) {
          return 'hold';
        }
      }
      const arrivalEnc = this.gm.eventDirector.evaluateArrivalEncounter(
        PICKUP_ARRIVAL_ENCOUNTER_IDS,
        ctx,
        this.gm.bus
      );
      if (arrivalEnc) {
        return 'hold';
      }
    }
    this.passengerWalkPhase = 'boarding';
    this.passengerWalkElapsedSec = 0;
    return 'hold';
  }

  private handleDropoffArrival(req: RideRequest): 'hold' | 'proceed' {
    if (this.inFastForward || req.requestId === 'req_tutorial_01' || this.tripLegDistanceM < 15) {
      return 'proceed';
    }
    const activeId = this.gm.eventDirector.activeEncounter?.encounterId;
    if (
      activeId &&
      (DROPOFF_ARRIVAL_ENCOUNTER_IDS as readonly string[]).includes(activeId)
    ) {
      return 'hold';
    }
    if (!this.gm.eventDirector.enabled || this.ride.getPendingDispute()) {
      return 'proceed';
    }
    const ctx = this.buildEncounterContext(this.lastStepSegment, req);
    ctx.phase = 'dropOff';
    const arrivalEnc = this.gm.eventDirector.evaluateArrivalEncounter(
      DROPOFF_ARRIVAL_ENCOUNTER_IDS,
      ctx,
      this.gm.bus
    );
    return arrivalEnc ? 'hold' : 'proceed';
  }

  private handleEncounterOptionChosen(info: {
    encounterId: string;
    choiceId: string;
    instanceId: string;
    anchorPlaceKey?: string;
    deferredWaitMin: number;
    deferredPhoneReward: { cash: number; trust: number } | null;
    deferredJobCash: number;
  }): void {
    if (this.inFastForward) {
      this.inlineAnchorNodeId = null;
      return;
    }
    const {
      encounterId,
      choiceId,
      anchorPlaceKey,
      deferredWaitMin,
      deferredPhoneReward,
      deferredJobCash,
    } = info;
    if (encounterId === 'enc_wrong_pickup_pin') {
      if (choiceId === 'drive') {
        const relocated = this.ride.relocatePickupToNearbyJunction(45, 120);
        if (!relocated && this.ride.isPickupHold()) {
          this.passengerWalkPhase = 'boarding';
          this.passengerWalkElapsedSec = 0;
        }
      } else if (choiceId === 'walk') {
        this.ride.startPickupWait(Math.max(2, deferredWaitMin || 2));
      } else if (choiceId !== 'cancel' && this.ride.isPickupHold()) {
        this.passengerWalkPhase = 'boarding';
        this.passengerWalkElapsedSec = 0;
      }
      return;
    }

    if (encounterId === 'enc_late_passenger') {
      if (choiceId === 'wait' || choiceId === 'hurry') {
        this.ride.startPickupWait(
          Math.max(1, deferredWaitMin || (choiceId === 'wait' ? 5 : 2))
        );
      }
      return;
    }

    if (
      encounterId === 'enc_parent_child' ||
      encounterId === 'enc_alley_enter' ||
      encounterId === 'enc_off_app'
    ) {
      if (this.ride.isPickupHold() && this.ride.getTripState() === 'EnRouteToPickup') {
        if (deferredWaitMin > 0) {
          this.ride.startPickupWait(deferredWaitMin);
        } else {
          this.passengerWalkPhase = 'boarding';
          this.passengerWalkElapsedSec = 0;
        }
      }
      return;
    }

    if (
      (encounterId === 'enc_extra_stop' && (choiceId === 'agree' || choiceId === 'fee')) ||
      (encounterId === 'enc_wait_errand' && (choiceId === 'fee' || choiceId === 'free'))
    ) {
      const stopKinds =
        encounterId === 'enc_extra_stop'
          ? ['market', 'teaStall']
          : ['pharmacy', 'hospital', 'market'];
      const target = this.findAheadStopPoi(stopKinds);
      if (target) {
        const stop: IntermediateStopState = {
          nodeId: target.nodeId,
          placeKey: target.placeKey || anchorPlaceKey || '',
          kind: target.kind,
          arrived: false,
          waitGameMin: Math.max(
            1,
            deferredWaitMin || (encounterId === 'enc_extra_stop' ? 3 : 5)
          ),
          labelKey: 'hud.wait.stop_errand',
        };
        this.ride.setIntermediateStop(stop);
      }
      this.inlineAnchorNodeId = null;
      return;
    }

    if (encounterId === 'enc_no_change' || encounterId === 'enc_vendor_discount') {
      if (this.ride.isDropoffHold() && this.ride.getTripState() === 'Completing') {
        if (
          encounterId === 'enc_no_change' &&
          choiceId === 'wait' &&
          deferredWaitMin > 0
        ) {
          this.ride.startDropoffWait(deferredWaitMin);
        } else {
          this.ride.resumeDropoffSettlement();
        }
      }
      return;
    }

    if (encounterId === 'enc_phone_left') {
      this.postDropoffUntilMin = null;
      if (choiceId === 'return') {
        const targetNodeId =
          this.postDropoffDropNodeId ??
          this.road.nearestNode(this.bike.x, this.bike.z)?.nodeId ??
          null;
        if (targetNodeId) {
          this.activeFollowUp = {
            kind: 'phoneReturn',
            nodeId: targetNodeId,
            placeKey: anchorPlaceKey || nearestPlaceKey(this.ride, targetNodeId),
            encounterId: 'enc_phone_left',
            choiceId: 'return',
            cashReward: deferredPhoneReward?.cash ?? 100,
            trustBonus: deferredPhoneReward?.trust ?? 10,
          };
          const fromId = this.road.nearestNode(this.bike.x, this.bike.z)?.nodeId;
          this.followUpRoute = fromId
            ? this.road.route(fromId, targetNodeId, { mode: 'motorcycle' })
            : null;
        }
      }
      this.inlineAnchorNodeId = null;
      return;
    }

    if (encounterId === 'enc_regular_direct_call' && choiceId === 'accept') {
      if (!this.ride.getActiveRequest()) {
        const sample = this.requests.sampleRecurringRequest(
          this.gm.clock.minutes,
          this.gm.weather,
          'char_tanvir',
          'direct',
          true
        );
        if (sample) {
          sample.request.initialFare = Math.max(
            sample.request.initialFare,
            deferredJobCash || 150
          );
          this.ride.offer(sample.request);
          if (this.ride.accept(sample.request.requestId, undefined, true)) {
            this.inlineAnchorNodeId = null;
            return;
          }
        }
      }
      if (deferredJobCash > 0) {
        this.creditDeferredEncounterCash('direct_fallback', deferredJobCash);
      }
      this.inlineAnchorNodeId = null;
      return;
    }

    if (encounterId === 'enc_friend_package' && choiceId === 'accept') {
      if (!this.ride.getActiveRequest()) {
        const started = this.startMintuParcelDelivery(deferredJobCash || 120);
        if (started) {
          this.inlineAnchorNodeId = null;
          return;
        }
      }
      if (deferredJobCash > 0) {
        this.creditDeferredEncounterCash('delivery_fallback', deferredJobCash);
      }
      if (deferredWaitMin > 0) {
        this.gm.clock.advance((deferredWaitMin * 60) / TIME_SCALE);
      }
      this.inlineAnchorNodeId = null;
      return;
    }

    this.inlineAnchorNodeId = null;
  }

  private creditDeferredEncounterCash(tag: string, amount: number): void {
    if (amount <= 0) return;
    this.gm.economyManager.post({
      id: `tx_enc_${tag}_${this.gm.clock.day}_${Math.floor(this.gm.clock.minutes)}_${++this.roamingDeliverySeq}`,
      day: this.gm.clock.day,
      minute: this.gm.clock.minutes,
      kind: 'event',
      amount,
    });
    this.gm.economy.cash = this.gm.economyManager.cash;
    this.gm.economy.dailyRevenue = this.gm.economyManager.dailyRevenue;
  }

  private startMintuParcelDelivery(basePayout: number): boolean {
    if (this.gm.deliveryManager.activeDeliveries.size >= this.gm.deliveryManager.getMaxCapacity()) {
      return false;
    }
    const eligible = this.requests.getEligibleNodeIdsReadonly();
    if (eligible.length < 2) return false;

    let teaPoi: { id: string; nodeId: string; dist: number } | null = null;
    for (let i = 0; i < this.poiPositions.length; i++) {
      const p = this.poiPositions[i]!;
      if (p.kind !== 'teaStall' || !this.road.getNode(p.nodeId)) continue;
      const d = Math.hypot(p.x - this.bike.x, p.z - this.bike.z);
      if (!teaPoi || d < teaPoi.dist) {
        teaPoi = { id: p.id, nodeId: p.nodeId, dist: d };
      }
    }

    let pickupNodeId = teaPoi?.nodeId ?? '';
    if (!pickupNodeId) {
      let bestDist = Infinity;
      for (let i = 0; i < eligible.length; i++) {
        const id = eligible[i]!;
        const node = this.road.getNode(id);
        if (!node) continue;
        const d = Math.hypot(node.x - this.bike.x, node.z - this.bike.z);
        if (d >= 25 && d < bestDist) {
          bestDist = d;
          pickupNodeId = id;
        }
      }
      pickupNodeId = pickupNodeId || (this.road.nearestNode(this.bike.x, this.bike.z)?.nodeId ?? eligible[0]!);
    }

    const pickupNode = this.road.getNode(pickupNodeId);
    if (!pickupNode) return false;

    let dropoffNodeId = '';
    let bestFulgateDist = Infinity;
    let fallbackNodeId = '';
    let fallbackScore = Infinity;

    for (let i = 0; i < eligible.length; i++) {
      const id = eligible[i]!;
      if (id === pickupNodeId) continue;
      const node = this.road.getNode(id);
      if (!node) continue;
      const r = this.road.route(pickupNodeId, id, { mode: 'motorcycle' });
      if (!r || r.nodeIds.length < 2) continue;
      const d = Math.hypot(node.x - pickupNode.x, node.z - pickupNode.z);
      if (this.road.getNodeDistrict(id) === 'fulgate') {
        if (d < bestFulgateDist) {
          bestFulgateDist = d;
          dropoffNodeId = id;
        }
      } else {
        const score = d >= 100 && d <= 650 ? d : d + 1000;
        if (score < fallbackScore) {
          fallbackScore = score;
          fallbackNodeId = id;
        }
      }
    }

    const finalDropoffId = dropoffNodeId || fallbackNodeId;
    if (!finalDropoffId || finalDropoffId === pickupNodeId) return false;

    const pickupDistM = Math.hypot(pickupNode.x - this.bike.x, pickupNode.z - this.bike.z);
    const dropoffRoute = this.road.route(pickupNodeId, finalDropoffId, { mode: 'motorcycle' });
    const pickupTimeLimitMinutes = Math.max(
      45,
      Math.ceil((((pickupDistM / 10.5 + 12) * TIME_SCALE) / 60) * 1.8 + 15)
    );
    const timeLimitMinutes = Math.max(
      60,
      Math.ceil((((((dropoffRoute?.lengthM ?? 400) / 10.5) + 10) * TIME_SCALE) / 60) * 1.8 + 15)
    );

    const job: DeliveryJob = {
      id: `deliv_mintu_${this.gm.clock.day}_${++this.roamingDeliverySeq}`,
      senderNameKey: 'character.mintu.name',
      pickupPoiId: teaPoi?.id ?? pickupNodeId,
      pickupNodeId,
      dropoffNodeId: finalDropoffId,
      pickupPlaceKey: nearestPlaceKey(this.ride, pickupNodeId) || undefined,
      dropoffPlaceKey: nearestPlaceKey(this.ride, finalDropoffId) || undefined,
      itemType: 'parcel',
      fragile: false,
      basePayout,
      timeLimitMinutes,
      pickupTimeLimitMinutes,
      status: 'offered',
    };
    this.gm.deliveryManager.offer(job);
    const res = this.gm.deliveryManager.accept(job.id, this.gm.clock.minutes);
    if (!res.success) {
      this.gm.deliveryManager.offeredDeliveries.delete(job.id);
      return false;
    }
    this.cachedDeliveryKey = '';
    return true;
  }

  getActiveFollowUp(): ActiveFollowUpState | null {
    return this.activeFollowUp;
  }

  getFollowUpRoute(): Route | null {
    return this.followUpRoute;
  }

  private resetWorldEventStageState(): void {
    this.activeRideRequestId = null;
    this.tempBusBlockEventId = null;
    this.stagedEncounterKey = '';
    this.stagedEncounterAnchorTag = '';
    this.stagedX = 0;
    this.stagedY = 0;
    this.stagedZ = 0;
    this.stagedFacing = 0;
    this.encounterStageScratch.kind = 'none';
    this.encounterStageScratch.worldX = 0;
    this.encounterStageScratch.worldY = 0;
    this.encounterStageScratch.worldZ = 0;
    this.encounterStageScratch.facingRad = 0;
    this.encounterStageScratch.urgent = false;
    for (let i = 0; i < this.streetHailSlots.length; i++) {
      const slot = this.streetHailSlots[i]!;
      slot.active = false;
      slot.nodeId = '';
      slot.ttlSec = 0;
      slot.offeredRequestId = null;
    }
    this.streetHailScanAccumSec = 0;
    this.nearbyHailNotifiedNodeId = null;
    this.cachedDeliveryTarget = null;
    this.cachedDeliveryRoute = null;
    this.cachedDeliveryKey = '';
    this.cachedDeliveryFromNodeId = '';
    this.cachedMissionId = '';
    this.cachedMissionKind = '';
    this.cachedMissionPoiId = '';
    this.cachedMissionCharId = '';
    this.cachedMissionDistrict = '';
    this.cachedMissionZoneTag = '';
    this.cachedMissionFromNodeId = '';
    this.cachedMissionNodeId = '';
    this.cachedMissionPlaceKey = '';
    this.cachedMissionWorldX = 0;
    this.cachedMissionWorldZ = 0;
    this.cachedMissionRoute = null;
    this.missionPullUpOfferedCharId = null;
    this.missionZoneOfferCooldownSec = 0;
    this.stagedWrongPickupReqId = null;
  }

  private reconcileRoadEventWorkers(): void {
    this.traffic.pedestrians.clearRoadWorkers();
    this.gm.roadEvents.forEachActiveEvent(this.reconcileWorkerCb);
  }

  private readonly reconcileWorkerCb = (ev: ActiveRoadEvent): void => {
    if (
      ev.hasWorkers &&
      ev.segmentId &&
      !this.traffic.pedestrians.hasRoadWorkers(ev.segmentId)
    ) {
      this.traffic.pedestrians.spawnRoadWorkers(ev.segmentId, 2);
    }
  };

  private readonly scanRoadEventCb = (ev: ActiveRoadEvent): void => {
    if (!ev.segmentId) return;
    let matched = false;
    if (ev.segmentId === this.lastStepSegment?.segmentId) {
      matched = true;
    } else {
      const seg = this.road.getSegment(ev.segmentId);
      const sNode = seg ? this.road.getNode(seg.startNodeId) : undefined;
      const eNode = seg ? this.road.getNode(seg.endNodeId) : undefined;
      if (sNode && eNode) {
        const mx = (sNode.x + eNode.x) * 0.5;
        const mz = (sNode.z + eNode.z) * 0.5;
        const dx = mx - this.bike.x;
        const dz = mz - this.bike.z;
        const dist = Math.hypot(dx, dz);
        if (dist <= 85) {
          if (dist <= 22) {
            matched = true;
          } else {
            const forward =
              (dx * Math.sin(this.bike.heading) + dz * Math.cos(this.bike.heading)) /
              dist;
            if (forward >= 0.05) matched = true;
          }
        }
      }
    }
    if (!matched) return;
    if (!this.nearbyRoadEventKindsScratch.includes(ev.kind)) {
      this.nearbyRoadEventKindsScratch.push(ev.kind);
    }
  };

  private scanNearbyRoadEvents(): void {
    this.nearbyRoadEventKindsScratch.length = 0;
    if (this.inFastForward) return;
    this.gm.roadEvents.forEachActiveEvent(this.scanRoadEventCb);
  }

  private findNearestStalledEventId(): string | null {
    let bestId: string | null = null;
    let bestDist = Infinity;
    this.gm.roadEvents.forEachActiveEvent((ev) => {
      if (ev.kind !== 'stalled_vehicle' || !ev.segmentId) return;
      if (ev.segmentId === this.lastStepSegment?.segmentId) {
        bestId = ev.id;
        bestDist = 0;
        return;
      }
      const seg = this.road.getSegment(ev.segmentId);
      const sNode = seg ? this.road.getNode(seg.startNodeId) : undefined;
      const eNode = seg ? this.road.getNode(seg.endNodeId) : undefined;
      if (!sNode || !eNode) return;
      const d = Math.hypot(
        (sNode.x + eNode.x) * 0.5 - this.bike.x,
        (sNode.z + eNode.z) * 0.5 - this.bike.z
      );
      if (d <= 95 && d < bestDist) {
        bestDist = d;
        bestId = ev.id;
      }
    });
    return bestId;
  }

  private resolveAheadRoadPose(
    distAheadM: number,
    segOverride: RoadSegment | null,
    out: { x: number; y: number; z: number; facingRad: number }
  ): void {
    const seg = segOverride ?? this.lastStepSegment;
    const fwdX = Math.sin(this.bike.heading);
    const fwdZ = Math.cos(this.bike.heading);
    if (seg) {
      const sNode = this.road.getNode(seg.startNodeId);
      const eNode = this.road.getNode(seg.endNodeId);
      if (sNode && eNode) {
        const dx = eNode.x - sNode.x;
        const dz = eNode.z - sNode.z;
        const lenSq = dx * dx + dz * dz;
        const len = Math.sqrt(lenSq);
        if (len >= 12) {
          const curT = clamp(
            ((this.bike.x - sNode.x) * dx + (this.bike.z - sNode.z) * dz) / lenSq,
            0,
            1
          );
          const dirSign = (dx * fwdX + dz * fwdZ) >= 0 ? 1 : -1;
          const targetT = clamp(curT + dirSign * (distAheadM / len), 0.1, 0.9);
          out.x = sNode.x + dx * targetT;
          out.y = (sNode.y ?? 0) + ((eNode.y ?? 0) - (sNode.y ?? 0)) * targetT;
          out.z = sNode.z + dz * targetT;
          out.facingRad = Math.atan2(-dirSign * dx, -dirSign * dz);
          return;
        }
      }
    }
    out.x = this.bike.x + fwdX * distAheadM;
    out.y = this.bike.y;
    out.z = this.bike.z + fwdZ * distAheadM;
    out.facingRad = this.bike.heading + Math.PI;
  }

  private syncEncounterStage(segOverride: RoadSegment | null = this.lastStepSegment): void {
    const out = this.encounterStageScratch;
    const active = this.gm.eventDirector.activeEncounter;
    const cue = this.gm.eventDirector.pendingCue;

    let kind: EncounterStageKind = 'none';
    let key = '';
    let anchorTag = '';
    let urgent = false;

    if (active) {
      switch (active.encounterId) {
        case 'enc_police_checkpoint':
          kind = 'policeCheckpoint';
          anchorTag = 'enc_police_checkpoint';
          key = `act:${active.id}`;
          urgent = true;
          break;
        case 'enc_police_signal_stop':
          kind = 'policeSignalStop';
          anchorTag = 'enc_police_signal_stop';
          key = `act:${active.id}`;
          urgent = true;
          break;
        case 'enc_dark_alley_blockage':
        case 'enc_robbery_attempt':
          kind = 'alleyAmbush';
          anchorTag = active.encounterId;
          key = `act:${active.id}`;
          urgent = true;
          break;
        case 'enc_suspicious_pickup':
          kind = 'suspiciousPickup';
          anchorTag = 'enc_suspicious_pickup';
          key = `act:${active.id}`;
          urgent = true;
          break;
      }
    } else if (cue) {
      switch (cue.encounterId) {
        case 'enc_police_checkpoint':
          kind = 'policeCheckpoint';
          anchorTag = 'enc_police_checkpoint';
          key = `cue:enc_police_checkpoint:${cue.startedAtMinute}`;
          urgent = false;
          break;
        case 'enc_dark_alley_blockage':
        case 'enc_robbery_attempt':
          kind = 'alleyAmbush';
          anchorTag = cue.encounterId;
          key = `cue:${cue.encounterId}:${cue.startedAtMinute}`;
          urgent = false;
          break;
      }
    } else if (!this.inFastForward && Boolean(this.gm.story.branchFlags['policeViolation'])) {
      kind = 'policeSignalStop';
      anchorTag = 'flag:policeViolation';
      key = 'flag:policeViolation';
      urgent = false;
    }

    if (kind === 'none') {
      this.stagedEncounterKey = '';
      this.stagedEncounterAnchorTag = '';
      out.kind = 'none';
      out.urgent = false;
      return;
    }

    const tooFarPastFlagAnchor =
      key === 'flag:policeViolation' &&
      this.stagedEncounterKey === 'flag:policeViolation' &&
      Math.hypot(this.bike.x - this.stagedX, this.bike.z - this.stagedZ) > 85;

    if (key !== this.stagedEncounterKey || tooFarPastFlagAnchor) {
      const keepSameCueAnchor =
        !tooFarPastFlagAnchor &&
        anchorTag !== '' &&
        anchorTag === this.stagedEncounterAnchorTag;
      if (!keepSameCueAnchor) {
        const req = this.ride.getActiveRequest();
        if (
          kind === 'suspiciousPickup' &&
          req &&
          this.resolveNodeKerbPose(req.pickupNodeId, this.kerbsScratch)
        ) {
          this.stagedX = this.kerbsScratch.x;
          this.stagedY = this.bike.y;
          this.stagedZ = this.kerbsScratch.z;
          this.stagedFacing = this.kerbsScratch.facingRad;
        } else {
          const resolvedSeg =
            segOverride ??
            this.road.segmentAtElevation(
              this.bike.x,
              this.bike.z,
              this.bike.y,
              10,
              this.segElevScratch
            ).segment;
          this.resolveAheadRoadPose(26, resolvedSeg, this.stagePoseScratch);
          this.stagedX = this.stagePoseScratch.x;
          this.stagedY = this.stagePoseScratch.y;
          this.stagedZ = this.stagePoseScratch.z;
          this.stagedFacing = this.stagePoseScratch.facingRad;
        }
      }
      this.stagedEncounterKey = key;
      this.stagedEncounterAnchorTag = anchorTag;
    }

    out.kind = kind;
    out.worldX = this.stagedX;
    out.worldY = this.stagedY;
    out.worldZ = this.stagedZ;
    out.facingRad = this.stagedFacing;
    out.urgent = urgent;
  }

  getEncounterStageState(): EncounterStageState {
    this.syncEncounterStage(this.lastStepSegment);
    return this.encounterStageScratch;
  }

  getStreetHailStates(): readonly StreetHailActorState[] {
    return this.streetHailSlots;
  }

  private anchorStreetHailForRequest(req: RideRequest): void {
    for (let i = 0; i < this.streetHailSlots.length; i++) {
      const slot = this.streetHailSlots[i]!;
      if (
        slot.active &&
        (slot.offeredRequestId === req.requestId || slot.nodeId === req.pickupNodeId)
      ) {
        slot.offeredRequestId = req.requestId;
        slot.ttlSec = Math.max(slot.ttlSec, 45);
        return;
      }
    }
    let targetSlot = this.streetHailSlots[0]!;
    for (let i = 0; i < this.streetHailSlots.length; i++) {
      if (!this.streetHailSlots[i]!.active) {
        targetSlot = this.streetHailSlots[i]!;
        break;
      }
    }
    if (!this.resolveNodeKerbPose(req.pickupNodeId, this.kerbsScratch)) return;
    targetSlot.active = true;
    targetSlot.nodeId = req.pickupNodeId;
    targetSlot.worldX = this.kerbsScratch.x;
    targetSlot.worldZ = this.kerbsScratch.z;
    targetSlot.facingRad = this.kerbsScratch.facingRad;
    targetSlot.seed = hashSeed(req.passengerId, 'hail');
    targetSlot.placeKey = req.pickupPlaceKey ?? '';
    targetSlot.ttlSec = 45;
    targetSlot.offeredRequestId = req.requestId;
  }

  private updateStreetHails(dt: number): void {
    if (this.gm.shiftEnded || this.ride.getActiveRequest() !== null) {
      for (let i = 0; i < this.streetHailSlots.length; i++) {
        const slot = this.streetHailSlots[i]!;
        slot.active = false;
        slot.offeredRequestId = null;
      }
      return;
    }

    const canPullUp = this.gm.eventDirector.activeEncounter === null;
    const phoneUnavailable =
      this.gm.economy.phoneBattery <= 0 || this.ride.isAppSuspended(this.gm.clock.day);

    let activeCount = 0;
    for (let i = 0; i < this.streetHailSlots.length; i++) {
      const slot = this.streetHailSlots[i]!;
      if (!slot.active) continue;

      if (slot.offeredRequestId && !this.ride.hasOfferedRequest(slot.offeredRequestId)) {
        slot.offeredRequestId = null;
        slot.active = false;
        continue;
      }

      slot.ttlSec -= dt;
      const dx = this.bike.x - slot.worldX;
      const dz = this.bike.z - slot.worldZ;
      const dist = Math.hypot(dx, dz);
      if (slot.ttlSec <= 0 || dist > 140) {
        slot.active = false;
        slot.offeredRequestId = null;
        continue;
      }

      activeCount++;
      if (dist < 45 && dist > 1e-3) {
        slot.facingRad = Math.atan2(dx, dz);
      }

      if (canPullUp) {
        if (dist <= 22 && this.nearbyHailNotifiedNodeId !== slot.nodeId) {
          this.nearbyHailNotifiedNodeId = slot.nodeId;
          this.gm.bus.emit('ui/dialogue', {
            speakerKey: 'hud.passenger.waiting',
            lineKey: 'hud.street_hail_nearby',
            durationMs: 2600,
          });
        }
        if (dist <= 10.0 && Math.abs(this.bike.speed) < 3.5) {
          if (slot.offeredRequestId !== null) {
            if (phoneUnavailable && this.ride.accept(slot.offeredRequestId)) {
              if (this.ride.getActiveRequest()) return;
            }
          } else {
            const hail = this.requests.sampleStreetHail(
              this.pose,
              this.gm.clock.minutes,
              this.gm.weather,
              slot.nodeId
            );
            if (hail) {
              this.ride.offer(hail.request);
              slot.offeredRequestId = hail.request.requestId;
              if (phoneUnavailable) {
                this.ride.accept(hail.request.requestId);
                if (this.ride.getActiveRequest()) return;
              }
            }
          }
        }
      }
    }

    if (!this.autoRequests) return;
    this.streetHailScanAccumSec += dt;
    if (this.streetHailScanAccumSec < 2.0) return;
    this.streetHailScanAccumSec = 0;

    const targetCount = phoneUnavailable ? 2 : 1;
    if (activeCount >= targetCount) return;

    const eligible = this.requests.getEligibleNodeIdsReadonly();
    if (eligible.length < 2) return;

    const fwdX = Math.sin(this.bike.heading);
    const fwdZ = Math.cos(this.bike.heading);

    for (let s = 0; s < this.streetHailSlots.length && activeCount < targetCount; s++) {
      const slot = this.streetHailSlots[s]!;
      if (slot.active) continue;
      const otherSlot = this.streetHailSlots[1 - s]!;
      const usedNodeId = otherSlot.active ? otherSlot.nodeId : '';

      let bestFwdId = '';
      let bestFwdScore = Infinity;
      let bestAnyId = '';
      let bestAnyScore = Infinity;

      for (let i = 0; i < eligible.length; i++) {
        const nodeId = eligible[i]!;
        if (nodeId === usedNodeId) continue;
        const node = this.road.getNode(nodeId);
        if (!node) continue;
        const dx = node.x - this.bike.x;
        const dz = node.z - this.bike.z;
        const d = Math.hypot(dx, dz);
        if (d < 28 || d > 110) continue;
        const score = this.requests.isDemandNode(nodeId) ? d / 1.5 : d;
        const dot = (dx * fwdX + dz * fwdZ) / d;
        if (dot >= 0.1 && score < bestFwdScore) {
          bestFwdScore = score;
          bestFwdId = nodeId;
        } else if (score < bestAnyScore) {
          bestAnyScore = score;
          bestAnyId = nodeId;
        }
      }

      const chosenId = bestFwdId || bestAnyId;
      if (!chosenId || !this.resolveNodeKerbPose(chosenId, this.kerbsScratch)) break;

      slot.active = true;
      slot.nodeId = chosenId;
      slot.worldX = this.kerbsScratch.x;
      slot.worldZ = this.kerbsScratch.z;
      slot.facingRad = this.kerbsScratch.facingRad;
      slot.seed = hashSeed(chosenId, 'hail');
      slot.placeKey = nearestPlaceKey(this.ride, chosenId);
      slot.ttlSec = 55;
      slot.offeredRequestId = null;
      activeCount++;
    }
  }

  getActiveDeliveryTarget(): ActiveDeliveryTarget | null {
    if (this.gm.deliveryManager.activeDeliveries.size === 0) {
      if (this.cachedDeliveryKey !== '') {
        this.cachedDeliveryTarget = null;
        this.cachedDeliveryRoute = null;
        this.cachedDeliveryKey = '';
        this.cachedDeliveryFromNodeId = '';
      }
      return null;
    }

    let firstJob: DeliveryJob | undefined;
    for (const job of this.gm.deliveryManager.activeDeliveries.values()) {
      firstJob = job;
      break;
    }
    if (!firstJob || (firstJob.status !== 'accepted' && firstJob.status !== 'in_transit')) {
      return null;
    }

    const targetNodeId =
      firstJob.status === 'accepted' ? firstJob.pickupNodeId : firstJob.dropoffNodeId;
    const placeKey =
      firstJob.status === 'accepted'
        ? (firstJob.pickupPlaceKey ?? nearestPlaceKey(this.ride, targetNodeId))
        : (firstJob.dropoffPlaceKey ?? nearestPlaceKey(this.ride, targetNodeId));
    const key = `${firstJob.id}:${firstJob.status}`;
    const fromNodeId = this.road.nearestNode(this.bike.x, this.bike.z)?.nodeId ?? '';

    if (
      key !== this.cachedDeliveryKey ||
      fromNodeId !== this.cachedDeliveryFromNodeId ||
      !this.cachedDeliveryTarget
    ) {
      this.cachedDeliveryKey = key;
      this.cachedDeliveryFromNodeId = fromNodeId;
      this.cachedDeliveryTarget = {
        deliveryId: firstJob.id,
        status: firstJob.status,
        nodeId: targetNodeId,
        placeKey,
        basePayout: firstJob.basePayout,
      };
      this.cachedDeliveryRoute = fromNodeId
        ? this.road.route(fromNodeId, targetNodeId, {
          mode: 'motorcycle',
          roadEvents: this.gm.roadEvents,
          weather: this.gm.weather,
          minute: this.gm.clock.minutes,
        })
        : null;
    }

    return this.cachedDeliveryTarget;
  }

  getActiveDeliveryRoute(): Route | null {
    this.getActiveDeliveryTarget();
    return this.cachedDeliveryRoute;
  }

  getPassengerActorState(): PassengerActorState {
    const out = this.passengerActorScratch;
    const req = this.ride.getActiveRequest();
    const trip = this.ride.getTripState();

    if (!req) {
      if (
        this.activeFollowUp &&
        this.resolveNodeKerbPose(this.activeFollowUp.nodeId, this.kerbsScratch)
      ) {
        out.mode = 'waitingAtPickup';
        out.worldX = this.kerbsScratch.x;
        out.worldZ = this.kerbsScratch.z;
        const dx = this.bike.x - out.worldX;
        const dz = this.bike.z - out.worldZ;
        out.facingRad =
          Math.hypot(dx, dz) < 45 ? Math.atan2(dx, dz) : this.kerbsScratch.facingRad;
        out.passengerId = 'phoneReturn';
        out.passengerSeed = hashSeed(this.activeFollowUp.encounterId, 'pax');
        out.hasChild = false;
        out.waving = true;
        out.beaconVisible = true;
        return out;
      }
      out.mode = 'hidden';
      out.worldX = 0;
      out.worldZ = 0;
      out.facingRad = 0;
      out.passengerId = undefined;
      out.passengerSeed = 0;
      out.hasChild = false;
      out.waving = false;
      out.beaconVisible = false;
      return out;
    }

    const paxId = req.characterId ?? req.passengerId;
    out.passengerId = paxId;
    out.passengerSeed = hashSeed(paxId, 'appearance');
    out.hasChild = this.hasChildPassenger;

    if (
      trip === 'Negotiating' ||
      trip === 'Accepted' ||
      trip === 'EnRouteToPickup'
    ) {
      const hasKerb = this.resolveNodeKerbPose(req.pickupNodeId, this.kerbsScratch);
      const kx = hasKerb ? this.kerbsScratch.x : this.bike.x;
      const kz = hasKerb ? this.kerbsScratch.z : this.bike.z;
      const kFacing = hasKerb ? this.kerbsScratch.facingRad : 0;

      if (this.passengerWalkPhase === 'boarding') {
        const t = clamp(this.passengerWalkElapsedSec / 1.6, 0, 1);
        const sideX = this.bike.x - Math.cos(this.bike.heading) * 0.7;
        const sideZ = this.bike.z + Math.sin(this.bike.heading) * 0.7;
        out.mode = 'walkingToBike';
        out.worldX = kx + (sideX - kx) * t;
        out.worldZ = kz + (sideZ - kz) * t;
        out.facingRad = Math.atan2(sideX - kx, sideZ - kz);
        out.waving = false;
        out.beaconVisible = false;
        return out;
      }

      const wait = this.ride.getActiveWait();
      out.mode = 'waitingAtPickup';
      out.worldX = kx;
      out.worldZ = kz;
      const dx = this.bike.x - kx;
      const dz = this.bike.z - kz;
      out.facingRad = Math.hypot(dx, dz) < 45 ? Math.atan2(dx, dz) : kFacing;
      out.waving = wait === null;
      out.beaconVisible = true;
      return out;
    }

    if (trip === 'PassengerOnboard' || trip === 'EnRouteToDestination') {
      const stop = this.ride.getIntermediateStop();
      const wait = this.ride.getActiveWait();
      if (stop && stop.arrived && wait) {
        const hasKerb = this.resolveNodeKerbPose(stop.nodeId, this.kerbsScratch);
        const kx = hasKerb ? this.kerbsScratch.x : this.bike.x;
        const kz = hasKerb ? this.kerbsScratch.z : this.bike.z;
        const kFacing = hasKerb ? this.kerbsScratch.facingRad : 0;
        const sideX = this.bike.x - Math.cos(this.bike.heading) * 0.7;
        const sideZ = this.bike.z + Math.sin(this.bike.heading) * 0.7;
        if (wait.remainingSimSec <= 1.2) {
          const t = clamp(1 - wait.remainingSimSec / 1.2, 0, 1);
          out.mode = 'walkingBackToBike';
          out.worldX = kx + (sideX - kx) * t;
          out.worldZ = kz + (sideZ - kz) * t;
          out.facingRad = Math.atan2(sideX - kx, sideZ - kz);
        } else {
          out.mode = 'atStop';
          out.worldX = kx;
          out.worldZ = kz;
          out.facingRad = kFacing;
        }
        out.waving = false;
        out.beaconVisible = true;
        return out;
      }

      out.mode = 'onPillion';
      out.worldX = this.bike.x;
      out.worldZ = this.bike.z;
      out.facingRad = this.bike.heading;
      out.waving = false;
      out.beaconVisible = false;
      return out;
    }

    if (trip === 'Completing') {
      const hasKerb = this.resolveNodeKerbPose(
        req.destinationNodeId,
        this.kerbsScratch
      );
      out.mode = 'atDropoff';
      out.worldX = hasKerb ? this.kerbsScratch.x : this.bike.x + 2;
      out.worldZ = hasKerb ? this.kerbsScratch.z : this.bike.z;
      out.facingRad = hasKerb ? this.kerbsScratch.facingRad : 0;
      out.waving = false;
      out.beaconVisible = false;
      return out;
    }

    out.mode = 'hidden';
    out.waving = false;
    out.beaconVisible = false;
    return out;
  }

  isPassengerOnPillion(): boolean {
    return this.getPassengerActorState().mode === 'onPillion';
  }

  private buildEncounterContext(
    segment: RoadSegment | null,
    activeReq: RideRequest | null
  ): EncounterContext {
    this.scanAheadAnchors();
    this.scanNearbyRoadEvents();
    const ctx = this.encounterCtxScratch;
    ctx.phase = this.currentEncounterPhase();
    ctx.minute = this.gm.clock.minutes;
    ctx.day = this.gm.clock.day;
    ctx.weather = this.gm.weather;
    ctx.chapter = this.gm.story.currentChapter;
    ctx.flags = this.gm.story.branchFlags;
    ctx.relationships = this.gm.reputationSystem.getRelationshipsView();
    ctx.cash = this.gm.economyManager.cash;
    ctx.speedKmh = Math.abs(this.bike.speed) * 3.6;
    ctx.bikeCondition = this.gm.economyManager.motorcycleCondition;
    ctx.segment = segment;
    ctx.activeRequest = activeReq;
    ctx.tripDistanceM = this.tripLegDistanceM;
    ctx.pickupDistanceM = this.pickupLegDistanceM;
    ctx.roamDistanceM = this.roamDistanceSinceLastEncM;
    ctx.nearbyAnchorKinds = this.nearbyAnchorKindsScratch;
    ctx.nearbyAnchorPlaceKey = this.nearbyAnchorPlaceKeyScratch;
    ctx.nearbyRoadEventKinds = this.inFastForward
      ? undefined
      : this.nearbyRoadEventKindsScratch;
    ctx.inFastForward = this.inFastForward;
    ctx.meters = this.gm.reputationSystem.getMetersView();
    ctx.witnesses = segment ? Math.round(clamp(segment.pedestrianDensity, 0, 1) * 5) : 0;
    if (!segment) {
      ctx.hasEscapePath = true;
    } else {
      const sNode = this.road.getNode(segment.startNodeId);
      const eNode = this.road.getNode(segment.endNodeId);
      ctx.hasEscapePath =
        !segment.tags.includes('deadend') &&
        sNode?.kind !== 'deadEnd' &&
        eNode?.kind !== 'deadEnd';
    }
    if (activeReq) {
      const p = this.encounterPassengerScratch;
      const profile = this.requests.getProfile(activeReq.passengerId);
      const charDef = activeReq.characterId ? getCharacter(activeReq.characterId) : undefined;
      const trustSubjectId = activeReq.characterId ?? activeReq.passengerId;
      p.id = trustSubjectId;
      p.trust = this.gm.reputationSystem.getPassengerTrust(trustSubjectId);
      p.mood = this.ride.getPassengerMood();
      p.localKnowledge = profile?.localKnowledge ?? charDef?.localKnowledge ?? 0.5;
      p.paymentReliability = profile?.paymentReliability ?? charDef?.paymentReliability ?? 1.0;
      p.archetype = profile?.archetype ?? charDef?.archetype ?? 'commuter';
      p.hasChild = this.hasChildPassenger;
      ctx.passenger = p;
    } else {
      ctx.passenger = null;
    }
    return ctx;
  }

  /** Advances clock/weather/encounters, bike physics, traffic and ride state
   * by one tick, then (when enabled) offers any newly generated requests. */
  step(input: BikeInput, dt: number = SIM_DT): void {
    this.syncLocation();
    const activeReq = this.ride.getActiveRequest();
    const segHit = this.road.segmentAtElevation(
      this.bike.x,
      this.bike.z,
      this.bike.y,
      10,
      this.segElevScratch
    );
    const segment = segHit.segment;
    this.lastStepSegment = segment;

    const phase = this.currentEncounterPhase();
    this.gm.tick(dt, Math.abs(this.bike.speed) * 3.6, phase, false);
    const encCtx = this.buildEncounterContext(segment, activeReq);
    const deferAtPickupForWrongPin =
      encCtx.phase === 'atPickup' &&
      activeReq !== null &&
      this.stagedWrongPickupReqId !== activeReq.requestId &&
      this.gm.missionManager.hasIncompleteEncounterObjective('enc_wrong_pickup_pin');
    if (activeReq?.requestId !== 'req_tutorial_01' && !deferAtPickupForWrongPin) {
      this.gm.evaluateEncounters(encCtx);
    }
    if (
      !this.inFastForward &&
      this.gm.eventDirector.enabled &&
      activeReq &&
      activeReq.requestId !== 'req_tutorial_01' &&
      (this.ride.getTripState() === 'PassengerOnboard' ||
        this.ride.getTripState() === 'EnRouteToDestination') &&
      this.tripLegDistanceM >= 35 &&
      this.gm.missionManager.hasIncompleteEncounterObjective('enc_police_checkpoint')
    ) {
      this.gm.eventDirector.startCueIfEligible('enc_police_checkpoint', encCtx, this.gm.bus);
    }
    this.syncEncounterStage(segment);
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
      this.pickupLegDistanceM = 0;
      this.tripLegDistanceM = 0;
      this.passengerWalkPhase = 'none';
      this.passengerWalkElapsedSec = 0;
      this.encounterAvoidSegments.clear();
      this.hasChildPassenger = reqId
        ? activeReq!.characterId === 'char_ferdousi' || hashSeed(reqId, 'child') % 5 === 0
        : false;
      if (reqId) {
        this.activeFollowUp = null;
        this.followUpRoute = null;
        this.postDropoffUntilMin = null;
        this.beginTripFuel();
      }
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

    const postSegHit = this.road.segmentAtElevation(
      this.bike.x,
      this.bike.z,
      this.bike.y,
      10,
      this.segElevScratch
    );
    if (postSegHit.segment !== null) {
      this.bike.y = postSegHit.y;
    }

    this.violationMonitor.step(
      this.bike,
      postSegHit.segment ?? segment,
      this.traffic.signals,
      dt,
      this.road.getNodesMap(),
      this.onInfraction
    );

    const mx = this.bike.x - prevX;
    const mz = this.bike.z - prevZ;
    const moved = Math.sqrt(mx * mx + mz * mz);
    // A jump larger than any real step (teleport, respawn) is not riding.
    const plausible = (this.bikeSpec.vmax + 1) * dt * 2;
    const stepDist = moved <= plausible ? moved : 0;
    this.burnAndWear(input, dt, stepDist, activeReq !== null);
    if (activeReq) {
      const ts = this.ride.getTripState();
      if (ts === 'Accepted' || ts === 'EnRouteToPickup') {
        this.pickupLegDistanceM += stepDist;
      } else if (ts === 'PassengerOnboard' || ts === 'EnRouteToDestination') {
        this.tripLegDistanceM += stepDist;
      }
    } else {
      this.roamDistanceSinceLastEncM += stepDist;
    }

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
    this.pose.y = this.bike.y;
    this.pose.z = this.bike.z;
    this.pose.speed = this.bike.speed;
    this.pose.heading = this.bike.heading;

    this.traffic.maintainDensity(this.camView, this.gm.clock.minutes);
    this.traffic.update(dt, this.camView, this.pose, this.env.wet);
    if (!this.controller) {
      this.checkTrafficCollisions(dt);
    }

    this.ride.update(this.pose, dt);
    if (
      this.ride.isPickupHold() &&
      this.passengerWalkPhase === 'boarding' &&
      this.gm.eventDirector.activeEncounter === null &&
      !this.ride.getActiveWait()
    ) {
      this.passengerWalkElapsedSec += dt;
      if (this.passengerWalkElapsedSec >= 1.6) {
        this.passengerWalkPhase = 'none';
        this.passengerWalkElapsedSec = 0;
        this.ride.resumePickupBoarding();
      }
    }
    if (this.activeFollowUp) {
      const fNode = this.road.getNode(this.activeFollowUp.nodeId);
      if (
        fNode &&
        Math.hypot(this.bike.x - fNode.x, this.bike.z - fNode.z) <= 10.0 &&
        Math.abs(this.bike.speed) < 2.5
      ) {
        const fu = this.activeFollowUp;
        this.activeFollowUp = null;
        this.followUpRoute = null;
        if (fu.cashReward > 0) {
          this.gm.economyManager.post({
            id: `tx_phone_ret_${this.gm.clock.day}_${Math.floor(this.gm.clock.minutes)}`,
            day: this.gm.clock.day,
            minute: this.gm.clock.minutes,
            kind: 'tip',
            amount: fu.cashReward,
          });
          this.gm.economy.cash = this.gm.economyManager.cash;
          this.gm.economy.dailyRevenue = this.gm.economyManager.dailyRevenue;
        }
        if (fu.trustBonus > 0) {
          this.gm.bus.emit('reputation/changed', {
            delta: { localTrust: fu.trustBonus },
          });
        }
        this.gm.bus.emit('ui/dialogue', {
          speakerKey: 'hud.passenger.on_bike',
          lineKey: 'encounter.phone_left.choice.return',
          durationMs: 3200,
        });
      }
    }
    const activeEnc = this.gm.eventDirector.activeEncounter;
    if (activeEnc?.presentation === 'inline') {
      this.gm.eventDirector.tickInlineExpiry(dt, this.gm.bus);
      if (
        this.gm.eventDirector.activeEncounter?.id === activeEnc.id &&
        this.inlineAnchorNodeId
      ) {
        const anchorNode = this.road.getNode(this.inlineAnchorNodeId);
        if (anchorNode) {
          const adx = anchorNode.x - this.bike.x;
          const adz = anchorNode.z - this.bike.z;
          const adist = Math.hypot(adx, adz);
          if (adist > 25) {
            const dot = (adx * Math.sin(this.bike.heading) + adz * Math.cos(this.bike.heading)) / adist;
            if (dot < -0.25) {
              this.gm.eventDirector.dismissActive('overshot', this.gm.bus);
            }
          }
        }
      }
    }
    this.syncLocation();
    if (!this.gm.shiftEnded) {
      this.gm.deliveryManager.updateProximity(
        this.bike.x,
        this.bike.z,
        this.road,
        this.gm.clock.minutes,
        this.gm.clock.day
      );
    }
    this.checkMissionPois();
    this.navigate();
    if (!this.inFastForward) {
      this.updateStreetHails(dt);
      this.updateMissionPullUpOffer();
    }

    if (this.autoRequests) {
      this.missionRideOfferCooldownSec = Math.max(0, this.missionRideOfferCooldownSec - dt);
      this.missionZoneOfferCooldownSec = Math.max(0, this.missionZoneOfferCooldownSec - dt);
      if (
        !this.gm.shiftEnded &&
        !this.ride.getActiveRequest() &&
        !this.ride.hasOfferedRequests()
      ) {
        const pendingChar = this.gm.missionManager.getFirstPendingRideWithCharacterId();
        if (pendingChar !== null && this.missionRideOfferCooldownSec <= 0) {
          this.missionRideOfferCooldownSec = 5;
          this.offerMissionRideWith(pendingChar);
        } else if (
          !this.inFastForward &&
          pendingChar === null &&
          this.missionZoneOfferCooldownSec <= 0
        ) {
          const rideFilter = this.gm.missionManager.getActiveRideObjectiveFilter();
          if (rideFilter) {
            const filtered = this.requests.sampleFilteredRequest(
              this.gm.clock.minutes,
              this.gm.weather,
              rideFilter,
              this.pose
            );
            if (filtered) {
              this.missionZoneOfferCooldownSec = 6;
              this.ride.offer(filtered.request);
            }
          }
        }
      }

      const dtMinutes = (dt * TIME_SCALE) / 60;
      if (!this.gm.shiftEnded) {
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
          if (req.bookingType === 'street' && !this.inFastForward) {
            this.anchorStreetHailForRequest(req);
          }
        }
      }

      if (
        !this.gm.shiftEnded &&
        this.gm.deliveryManager.isUnlocked() &&
        this.gm.economyManager.phoneBattery > 0 &&
        this.gm.deliveryManager.offeredDeliveries.size < 2 &&
        this.deliveryRng.chance(0.15 * dtMinutes)
      ) {
        this.gm.deliveryManager.generateOffer(this.road, this.deliveryRng, this.gm.clock.day, {
          playerPos: this.pose,
          unlockedDistricts: this.gm.missionManager.getUnlockedDistricts(),
        });
      }
    }
  }

  /** Resets story/economy/ride state and starts the opening tutorial. */
  newCareer(nextSeed?: number): void {
    this.lastPunctureMin = -Infinity;
    this.lastAccidentEncounterMin = -Infinity;
    this.lastStepSegment = null;
    this.offAppSeq = 0;
    this.tripReqId = null;
    this.tripFuelLiters = 0;
    this.wedgedSec = 0;
    this.stallSec = 0;
    this.warnedWorn = false;
    this.trafficContacts.clear();
    this.violationMonitor.reset();
    this.encounterAvoidSegments.clear();
    this.activeFollowUp = null;
    this.followUpRoute = null;
    this.postDropoffUntilMin = null;
    this.postDropoffDropNodeId = null;
    this.pickupLegDistanceM = 0;
    this.tripLegDistanceM = 0;
    this.roamDistanceSinceLastEncM = 0;
    this.passengerWalkPhase = 'none';
    this.passengerWalkElapsedSec = 0;
    this.inlineAnchorNodeId = null;
    this.resetWorldEventStageState();
    this.ride.resetCareer();
    this.gm.resetCareerState(nextSeed);
    this.reconcileRoadEventWorkers();
    this.breakdownRng.setState(this.gm.rng.fork('breakdown').getState());
    this.punctureRng.setState(this.gm.rng.fork('puncture').getState());
    this.deliveryRng.setState(this.gm.rng.fork('delivery').getState());
    this.syncBikeSpec();
    this.spawnAtHome();
    this.gm.bus.emit('state/restored', {});
  }

  /** Applies karma, passenger trust, relationship, and rating effects from a negotiation step. */
  applyNegotiationResult(result: NegotiationResult): void {
    const req = result.session.req;
    const subjectId = req.characterId ?? req.passengerId;
    if (result.karmaEffects) {
      for (const eff of result.karmaEffects) {
        this.gm.reputationSystem.applyMeter(
          eff.meter,
          eff.delta,
          eff.reasonKey,
          subjectId
        );
      }
    }
    if (result.trustDelta !== undefined && result.trustDelta !== 0) {
      this.gm.reputationSystem.changePassengerTrust(subjectId, result.trustDelta);
    }
    if (
      result.relationshipDelta !== undefined &&
      result.relationshipDelta !== 0 &&
      req.characterId
    ) {
      this.gm.reputationSystem.changeRelationship(
        req.characterId,
        result.relationshipDelta
      );
    }
    if (result.ratingDelta !== undefined && result.ratingDelta !== 0) {
      this.gm.reputationSystem.adjustRating(result.ratingDelta);
    }
  }

  private offerMissionRideWith(characterId: string): boolean {
    if (this.ride.getActiveRequest()?.characterId === characterId) {
      return false;
    }
    if (this.ride.getOfferedRequests().some((r) => r.characterId === characterId)) {
      return false;
    }
    const res = this.requests.sampleRecurringRequest(
      this.gm.clock.minutes,
      this.gm.weather,
      characterId,
      'direct',
      true
    );
    if (!res) return false;
    this.ride.offer(res.request);
    return true;
  }

  isTutorialRideActive(): boolean {
    return this.ride.getActiveRequest()?.requestId === 'req_tutorial_01';
  }

  /** Starts the scripted first-ride tutorial as a live 3D ride from Clinic to Campus Gate. */
  startLiveTutorialRide(fare: number = 80): boolean {
    if (this.ride.getActiveRequest()?.requestId === 'req_tutorial_01') {
      return true;
    }
    if (this.ride.getActiveRequest() !== null) {
      return false;
    }

    const clinicPoi = this.poiPositions.find((p) => p.id === 'poi_mirpara_clinic');
    const gatePoi = this.poiPositions.find((p) => p.id === 'poi_mirpara_campus_gate');
    const eligible = this.requests.getEligibleNodeIdsReadonly();

    let pickupNodeId =
      clinicPoi?.nodeId ??
      (this.road.getNode('res_s2_1') ? 'res_s2_1' : eligible[0] ?? '');
    let destNodeId =
      gatePoi?.nodeId ??
      (this.road.getNode('res_n1_1') ? 'res_n1_1' : eligible[eligible.length - 1] ?? '');

    if (!pickupNodeId || !destNodeId || pickupNodeId === destNodeId) {
      for (let i = 0; i < eligible.length && (!pickupNodeId || !destNodeId || pickupNodeId === destNodeId); i++) {
        const cand = eligible[i]!;
        if (!pickupNodeId) pickupNodeId = cand;
        else if (cand !== pickupNodeId) destNodeId = cand;
      }
    }
    if (!pickupNodeId || !destNodeId || pickupNodeId === destNodeId) {
      return false;
    }

    const route = this.road.route(pickupNodeId, destNodeId, { mode: 'motorcycle' });
    if (!route || route.nodeIds.length === 0) {
      return false;
    }

    if (!this.requests.getProfile('char_nabila')) {
      const nabilaChar = getCharacter('char_nabila');
      this.requests.setProfile({
        passengerId: 'char_nabila',
        characterId: 'char_nabila',
        nameKey: 'character.nabila.name',
        archetype: nabilaChar?.archetype ?? 'commuter',
        budget: Math.max(fare, nabilaChar?.budget ?? 100),
        patience: nabilaChar?.patience ?? 0.9,
        urgency: nabilaChar?.urgency ?? 0.4,
        bargainingTendency: nabilaChar?.bargainingTendency ?? 0.3,
        safetySensitivity: nabilaChar?.safetySensitivity ?? 0.7,
        trustInRider: nabilaChar?.trustInRider ?? 0.65,
        localKnowledge: nabilaChar?.localKnowledge ?? 0.85,
        paymentReliability: nabilaChar?.paymentReliability ?? 0.98,
        relationshipLevel: nabilaChar?.initialRelationship ?? 10,
        traits: {
          luggage: false,
          child: false,
          walkTolerance: nabilaChar?.fixedTraits.walkTolerance ?? 0.7,
        },
        personalBias: 0,
      });
    }

    const req: RideRequest = {
      requestId: 'req_tutorial_01',
      passengerId: 'char_nabila',
      characterId: 'char_nabila',
      passengerNameKey: 'character.nabila.name',
      pickupNodeId,
      destinationNodeId: destNodeId,
      pickupPlaceKey: clinicPoi?.nameKey ?? (nearestPlaceKey(this.ride, pickupNodeId) || 'poi.mirpara.clinic'),
      destinationPlaceKey:
        gatePoi?.nameKey ?? (nearestPlaceKey(this.ride, destNodeId) || 'poi.mirpara.campus_gate'),
      initialFare: fare,
      estimatedDistance: route.virtualKm,
      estimatedDuration: route.etaMin,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    };

    this.ride.offer(req);
    return this.ride.accept('req_tutorial_01', undefined, true);
  }

  cancelLiveTutorialRide(): void {
    if (this.ride.getActiveRequest()?.requestId === 'req_tutorial_01') {
      this.ride.cancel('req_tutorial_01', 'system', 'tutorial_skipped');
    }
  }

  /** T8.2: settles the scripted tutorial ride through the same exactly-once path as a
   * live ride and announces `ride/completed`. If it was already settled it pays nothing
   * but still announces completion (so the tutorial and m1_first_ride cannot softlock). */
  settleTutorialRide(fare: number): TripReceipt {
    if (this.ride.getActiveRequest()?.requestId === 'req_tutorial_01') {
      this.ride.cancel('req_tutorial_01', 'system', 'tutorial_fast_forward');
    }
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
    gm.bus.emit('ride/completed', {
      requestId: settled.requestId,
      receipt: settled,
      passengerCharacterId: 'char_nabila',
      district: 'mirpara',
      pickupDistrict: 'mirpara',
      destinationDistrict: 'mirpara',
      zoneTags: [],
      weather: gm.weather,
      minute: gm.clock.minutes,
    });
    return settled;
  }

  /** T7.4: converts the running session to a true endless one (no missions,
   * no ending checks), replacing the old `screenSignal.value = 'game'` UI-only
   * hack used for both the main menu's "Endless" and post-ending "Enter
   * Endless" buttons. */
  enterEndless(): void {
    this.gm.enterEndlessMode();
  }

  private resolveEncounterIfAny(
    onEncounter?: (instance: EncounterInstance) => string | undefined
  ): number {
    let resolved = 0;
    const defaultFallbacks = ['decline', 'refuse', 'cancel', 'stay_app', 'continue', 'wait', 'standard'];
    while (this.gm.eventDirector.activeEncounter) {
      const inst = this.gm.eventDirector.activeEncounter;
      let picked = onEncounter ? onEncounter(inst) : undefined;
      if (!picked) {
        for (const id of defaultFallbacks) {
          if (inst.choices.some((c) => c.id === id)) {
            picked = id;
            break;
          }
        }
      }
      picked ??=
        inst.choices.find((c) => c.kind === 'neutral')?.id ?? inst.choices[0]?.id;
      if (!picked) break;
      const ok = this.gm.dispatch({
        type: 'chooseEncounterOption',
        instanceId: inst.id,
        choiceId: picked,
      }).success;
      if (!ok) break;
      resolved++;
    }
    return resolved;
  }

  private advanceMacroMinutes(
    gameMinutes: number,
    phase: EncounterPhase,
    speedKmh: number,
    onEncounter?: (instance: EncounterInstance) => string | undefined
  ): number {
    let left = Math.max(0, gameMinutes);
    let resolved = 0;
    while (left > 1e-6 && !this.gm.shiftEnded) {
      const chunkMin = Math.min(1, left);
      const chunkDt = (chunkMin * 60) / TIME_SCALE;
      this.gm.ticks++;
      this.gm.tick(chunkDt, speedKmh, phase, false);
      this.gm.evaluateEncounters(
        this.buildEncounterContext(this.lastStepSegment, this.ride.getActiveRequest())
      );
      resolved += this.resolveEncounterIfAny(onEncounter);
      left -= chunkMin;
    }
    return resolved;
  }

  private traverseMacroLeg(
    fromNodeId: string,
    toNodeId: string,
    hasPassenger: boolean,
    speedMultiplier: number,
    extraIdleMin: number,
    onEncounter?: (instance: EncounterInstance) => string | undefined
  ): { distanceKm: number; encountersResolved: number } {
    const em = this.gm.economyManager;
    let totalKm = 0;
    let encountersResolved = 0;

    const targetNode = this.road.getNode(toNodeId);
    const activeRoute = this.ride.currentRoute;
    const useActive =
      activeRoute &&
      activeRoute.nodeIds.length > 0 &&
      activeRoute.nodeIds[activeRoute.nodeIds.length - 1] === toNodeId;
    const route = useActive
      ? activeRoute
      : this.road.route(fromNodeId, toNodeId, {
        mode: 'motorcycle',
        weather: this.gm.weather,
        minute: this.gm.clock.minutes,
        roadEvents: this.gm.roadEvents,
        isFlooded: (s) => this.gm.weatherSystem.isFlooded(s.segmentId),
        getFloodLevel: (id) => this.gm.weatherSystem.getFloodLevel(id),
      });

    this.env.hasPassenger = hasPassenger;
    this.env.wet = this.gm.weatherSystem.isRoadWet();

    const stepAlongSegment = (
      x0: number,
      z0: number,
      y0: number,
      x1: number,
      z1: number,
      y1: number,
      seg: RoadSegment | null,
      isLaunch: boolean
    ): void => {
      const dx = x1 - x0;
      const dz = z1 - z0;
      const segLenM = Math.hypot(dx, dz);
      if (segLenM <= 1e-6) return;
      const heading = Math.atan2(dx, dz);
      this.lastStepSegment = seg;

      const surface = seg ? this.gm.weatherSystem.getSurfaceModifier(seg) : 1.0;
      const flooded = seg ? this.gm.weatherSystem.isFlooded(seg.segmentId) : false;
      const floodCap =
        seg && this.gm.weatherSystem.isSegmentFloodCapped(seg)
          ? this.gm.weatherSystem.getSpeedCap(seg) / 3.6
          : Infinity;
      this.env.surface = surface;
      this.envFlooded = flooded;
      this.env.conditionPct = em.motorcycleCondition;
      this.env.fuelEmpty = em.fuelLevel <= 0;

      const condVmaxMult =
        em.motorcycleCondition < this.bikeSpec.conditionPenaltyThreshold
          ? BALANCE.WEAR.wornVmaxMult
          : 1.0;
      const effectiveVmax = this.bikeSpec.vmax * condVmaxMult;
      const baseCruise = Math.min(11.3 * speedMultiplier, effectiveVmax, floodCap);
      const cruiseMs = em.fuelLevel <= 0 ? BALANCE.FUEL.pushSpeedMs : Math.max(1.0, baseCruise);
      const segRealSec = segLenM / cruiseMs;
      const maxChunkS = 60 / TIME_SCALE;
      const numChunks = Math.max(1, Math.ceil(segRealSec / maxChunkS));
      const chunkDt = segRealSec / numChunks;
      const chunkDistM = segLenM / numChunks;

      for (let c = 0; c < numChunks; c++) {
        const frac = (c + 1) / numChunks;
        this.bike.x = x0 + dx * frac;
        this.bike.z = z0 + dz * frac;
        this.bike.y = y0 + (y1 - y0) * frac;
        this.bike.heading = heading;
        this.bike.speed = cruiseMs;
        this.pose.x = this.bike.x;
        this.pose.y = this.bike.y;
        this.pose.z = this.bike.z;
        this.pose.heading = heading;
        this.pose.speed = cruiseMs;

        this.syncLocation();
        if (!this.gm.shiftEnded) {
          this.gm.deliveryManager.updateProximity(
            this.bike.x,
            this.bike.z,
            this.road,
            this.gm.clock.minutes,
            this.gm.clock.day
          );
        }
        this.checkMissionPois();
        if (hasPassenger) {
          this.tripLegDistanceM += chunkDistM;
        } else {
          this.pickupLegDistanceM += chunkDistM;
        }
        const phase: EncounterPhase = this.currentEncounterPhase();
        this.gm.tick(chunkDt, cruiseMs * 3.6, phase, false);
        this.gm.evaluateEncounters(this.buildEncounterContext(seg, this.ride.getActiveRequest()));
        encountersResolved += this.resolveEncounterIfAny(onEncounter);

        const km = (chunkDistM * DISTANCE_SCALE) / 1000;
        totalKm += km;
        em.applyWear(km);
        this.rollBreakdown(km);
        if (this.stallSec > 0) {
          const stallMin = (this.stallSec * TIME_SCALE) / 60;
          this.stallSec = 0;
          encountersResolved += this.advanceMacroMinutes(stallMin, phase, 0, onEncounter);
        }
        this.rollPuncture(km);
        encountersResolved += this.resolveEncounterIfAny(onEncounter);

        if (em.fuelLevel > 0) {
          const o = this.fuelOpts;
          o.model = this.ride.activeBikeId;
          o.engineTune = this.ride.hasEngineTune;
          o.loadKg = hasPassenger ? BALANCE.FUEL.passengerKg : 0;
          o.roughness = 1 - clamp(surface, 0, 1);
          o.throttleStress = isLaunch && c === 0 ? 0.45 : 0.12;
          o.conditionPct = em.motorcycleCondition;
          const liters = Math.min(em.fuelLevel, fuelUsed(km, 0, o));
          em.consumeFuel(liters);
          this.tripFuelLiters += liters;
        }

        if (!this.ride.getActiveRequest()) break;
      }
    };

    const hadTravel =
      (route && route.nodeIds.length >= 2 && route.lengthM > 1) ||
      (targetNode !== undefined &&
        Math.hypot(targetNode.x - this.bike.x, targetNode.z - this.bike.z) > 8.0);

    if (route && route.nodeIds.length >= 2) {
      for (let i = 0; i < route.nodeIds.length - 1; i++) {
        if (!this.ride.getActiveRequest()) break;
        const n1 = this.road.getNode(route.nodeIds[i]!);
        const n2 = this.road.getNode(route.nodeIds[i + 1]!);
        const segId = route.segmentIds[i];
        const seg = segId ? (this.road.getSegment(segId) ?? null) : null;
        if (!n1 || !n2) continue;
        const startX = i === 0 ? this.bike.x : n1.x;
        const startZ = i === 0 ? this.bike.z : n1.z;
        const startY = i === 0 ? this.bike.y : (n1.y ?? 0);
        stepAlongSegment(startX, startZ, startY, n2.x, n2.z, n2.y ?? 0, seg, i === 0);
      }
    } else if (targetNode && hadTravel) {
      stepAlongSegment(
        this.bike.x,
        this.bike.z,
        this.bike.y,
        targetNode.x,
        targetNode.z,
        targetNode.y ?? 0,
        this.lastStepSegment,
        true
      );
    }

    // Account for autopilot launch + final approach deceleration overhead + idle time
    const approachRealSec = hadTravel ? 5.8 / Math.max(0.5, speedMultiplier) : 0;
    const approachIdleMin = hadTravel ? (0.5 * TIME_SCALE) / 60 / Math.max(0.5, speedMultiplier) : 0;
    const totalIdleMin = Math.max(0, extraIdleMin) + approachIdleMin;
    const approachGameMin = (approachRealSec * TIME_SCALE) / 60 + Math.max(0, extraIdleMin);

    if (approachGameMin > 0 && this.ride.getActiveRequest()) {
      this.bike.speed = 0;
      this.pose.speed = 0;
      const phase: EncounterPhase = this.currentEncounterPhase();
      encountersResolved += this.advanceMacroMinutes(approachGameMin, phase, 0, onEncounter);
      if (totalIdleMin > 0 && em.fuelLevel > 0) {
        const o = this.fuelOpts;
        o.model = this.ride.activeBikeId;
        o.engineTune = this.ride.hasEngineTune;
        o.loadKg = hasPassenger ? BALANCE.FUEL.passengerKg : 0;
        o.roughness = 0;
        o.throttleStress = 0;
        o.conditionPct = em.motorcycleCondition;
        const idleLiters = Math.min(em.fuelLevel, fuelUsed(0, totalIdleMin, o));
        em.consumeFuel(idleLiters);
        this.tripFuelLiters += idleLiters;
      }
    }

    return { distanceKm: totalKm, encountersResolved };
  }

  /**
   * T11.3: fast-forwards an active trip (or idle wait) through the real
   * TripFsm/RideManager, EconomyManager, ReputationSystem, EventDirector,
   * and MissionManager without per-frame 60 Hz physics steps.
   */
  fastForwardTrip(opts: FastForwardTripOptions = {}): FastForwardTripResult {
    const startDay = this.gm.clock.day;
    const startMin = this.gm.clock.minutes;
    const startFuel = this.gm.economyManager.fuelLevel;
    const speedMultiplier = Math.max(0.25, opts.speedMultiplier ?? 1.0);
    let encountersResolved = 0;
    let totalDistanceKm = 0;

    let completedReceipt: TripReceipt | null = null;
    let cancelledReason: string | null = null;
    const unsubComp = this.gm.bus.on('ride/completed', (ev) => {
      completedReceipt = ev.receipt;
    });
    const unsubCanc = this.gm.bus.on('ride/cancelled', (ev) => {
      if (this.tripReqId && ev.requestId === this.tripReqId) {
        cancelledReason = ev.reason;
      }
    });

    this.inFastForward = true;
    this.gm.inFastForward = true;
    try {
      const activeReq = this.ride.getActiveRequest();
      if (!activeReq) {
        const idleMin = opts.idleMin ?? 0;
        if (idleMin > 0) {
          let left = idleMin;
          while (left > 1e-6 && !this.gm.shiftEnded) {
            const chunk = Math.min(1, left);
            encountersResolved += this.advanceMacroMinutes(chunk, 'roaming', 0, opts.onEncounter);
            if (this.autoRequests && !this.ride.getActiveRequest() && !this.gm.shiftEnded) {
              const eventDemandMult = this.gm.roadEvents.getDemandMultiplier();
              const newReqs = this.requests.tick(
                chunk,
                this.gm.clock.minutes,
                this.gm.weather,
                this.pose,
                this.requests.getRequestRateMultiplier() * eventDemandMult
              );
              for (const req of newReqs) {
                this.ride.offer(req);
              }
            }
            left -= chunk;
          }
        }
        return {
          status: 'idle',
          receipt: null,
          durationMin: (this.gm.clock.day - startDay) * 1440 + this.gm.clock.minutes - startMin,
          fuelLiters: Math.max(0, startFuel - this.gm.economyManager.fuelLevel),
          distanceKm: 0,
          encountersResolved,
        };
      }

      if (this.tripReqId !== activeReq.requestId) {
        this.tripReqId = activeReq.requestId;
        this.beginTripFuel();
      }

      this.pose.x = this.bike.x;
      this.pose.y = this.bike.y;
      this.pose.z = this.bike.z;
      this.pose.heading = this.bike.heading;
      this.pose.speed = 0;

      if (this.ride.getTripState() === 'Accepted') {
        this.ride.update(this.pose, SIM_DT);
      }

      // Leg 1: EnRouteToPickup -> Pickup arrival
      if (this.ride.getTripState() === 'EnRouteToPickup') {
        const fromNodeId =
          this.road.nearestNode(this.bike.x, this.bike.z)?.nodeId ?? activeReq.pickupNodeId;
        const leg1 = this.traverseMacroLeg(
          fromNodeId,
          activeReq.pickupNodeId,
          false,
          speedMultiplier,
          0,
          opts.onEncounter
        );
        totalDistanceKm += leg1.distanceKm;
        encountersResolved += leg1.encountersResolved;

        const pickupNode = this.road.getNode(activeReq.pickupNodeId);
        if (pickupNode && this.ride.getActiveRequest()) {
          this.bike.x = pickupNode.x;
          this.bike.z = pickupNode.z;
          this.bike.y = pickupNode.y ?? this.bike.y;
          this.bike.speed = 0;
          this.pose.x = this.bike.x;
          this.pose.y = this.bike.y;
          this.pose.z = this.bike.z;
          this.pose.speed = 0;
          this.syncLocation();
          this.ride.update(this.pose, SIM_DT);
          if (this.ride.getActiveRequest()) {
            this.gm.evaluateEncounters(
              this.buildEncounterContext(this.lastStepSegment, this.ride.getActiveRequest())
            );
            encountersResolved += this.resolveEncounterIfAny(opts.onEncounter);
          }
        }
      }

      // Leg 2: EnRouteToDestination -> Destination arrival & settlement
      if (this.ride.getTripState() === 'EnRouteToDestination') {
        const nmCount = Math.max(0, Math.floor(opts.nearMisses ?? 0));
        for (let i = 0; i < nmCount; i++) {
          this.gm.bus.emit('bike/nearMiss', { distanceM: 0.8, speedKmh: 45 });
        }
        const bumpCount = Math.max(0, Math.floor(opts.bumps ?? 0));
        for (let i = 0; i < bumpCount; i++) {
          this.gm.bus.emit('bike/collision', {
            severity: 'bump',
            relSpeedKmh: 15,
            otherKind: 'traffic',
            otherParty: true,
            bikeSpeedKmh: 25,
            otherSpeedKmh: 10,
          });
        }
        const infCount = Math.max(0, Math.floor(opts.infractions ?? 0));
        for (let i = 0; i < infCount; i++) {
          this.gm.bus.emit('bike/infraction', {
            kind: 'speeding',
            segmentId: this.lastStepSegment?.segmentId ?? 'seg_1',
          });
        }
        if (opts.helpfulChoice) {
          this.gm.reputationSystem.recordHelpfulChoice();
        }

        const leg2 = this.traverseMacroLeg(
          activeReq.pickupNodeId,
          activeReq.destinationNodeId,
          true,
          speedMultiplier,
          opts.idleMin ?? 0,
          opts.onEncounter
        );
        totalDistanceKm += leg2.distanceKm;
        encountersResolved += leg2.encountersResolved;

        if (opts.crashed && this.ride.getActiveRequest()) {
          this.gm.bus.emit('bike/collision', {
            severity: 'crash',
            relSpeedKmh: 35,
            otherKind: 'traffic',
            otherParty: true,
            bikeSpeedKmh: 45,
            otherSpeedKmh: 20,
          });
          encountersResolved += this.resolveEncounterIfAny(opts.onEncounter);
        }

        if (this.ride.getTripState() === 'EmergencyInterrupted') {
          encountersResolved += this.resolveEncounterIfAny(opts.onEncounter);
          if (this.ride.getTripState() === 'EmergencyInterrupted') {
            const req = this.ride.getActiveRequest();
            if (this.gm.story.branchFlags['accidentSerious'] && req) {
              this.ride.cancel(req.requestId, 'system', 'accident');
            } else {
              this.ride.resumeTrip();
            }
          }
        }

        const destNode = this.road.getNode(activeReq.destinationNodeId);
        if (destNode && this.ride.getActiveRequest() && this.ride.getTripState() === 'EnRouteToDestination') {
          this.bike.x = destNode.x;
          this.bike.z = destNode.z;
          this.bike.y = destNode.y ?? this.bike.y;
          this.bike.speed = 0;
          this.pose.x = this.bike.x;
          this.pose.y = this.bike.y;
          this.pose.z = this.bike.z;
          this.pose.speed = 0;
          this.syncLocation();
          this.ride.update(this.pose, 4.5);

          const pendingDispute = this.ride.getPendingDispute();
          if (pendingDispute && opts.onDispute) {
            const choice = opts.onDispute(pendingDispute);
            this.ride.resolveDispute(choice);
          }
        }
      }

      // Ensure no encounter or EmergencyInterrupted state remains dangling at exit
      encountersResolved += this.resolveEncounterIfAny(opts.onEncounter);
      if (this.ride.getTripState() === 'EmergencyInterrupted') {
        const req = this.ride.getActiveRequest();
        if (req) {
          this.ride.cancel(req.requestId, 'system', 'accident');
        }
      }

      // Allow post-dropoff / roaming encounters (e.g. enc_phone_left or policeViolation) at drop-off stop
      if (!this.ride.getActiveRequest() && opts.onEncounter && !this.gm.shiftEnded) {
        this.bike.speed = 0;
        this.pose.speed = 0;
        if (completedReceipt) {
          this.postDropoffUntilMin = this.gm.clock.minutes + 2.0;
          encountersResolved += this.advanceMacroMinutes(
            1,
            this.currentEncounterPhase(),
            0,
            opts.onEncounter
          );
          this.postDropoffUntilMin = null;
        } else {
          encountersResolved += this.advanceMacroMinutes(1, 'roaming', 0, opts.onEncounter);
        }
      }

      const durationMin =
        (this.gm.clock.day - startDay) * 1440 + this.gm.clock.minutes - startMin;
      const fuelLiters = Math.max(0, startFuel - this.gm.economyManager.fuelLevel);

      let status: FastForwardTripResult['status'];
      if (completedReceipt) {
        status = 'completed';
      } else if (this.ride.getPendingDispute()) {
        status = 'disputed';
      } else if (cancelledReason === 'noShow') {
        status = 'noShow';
      } else {
        status = 'cancelled';
      }

      return {
        status,
        receipt: completedReceipt,
        durationMin,
        fuelLiters,
        distanceKm: totalDistanceKm,
        encountersResolved,
      };
    } finally {
      this.inFastForward = false;
      this.gm.inFastForward = false;
      this.postDropoffUntilMin = null;
      unsubComp();
      unsubCanc();
    }
  }
}
