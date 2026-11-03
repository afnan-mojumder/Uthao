import { isPickupSegment, type RoadNetwork } from '../road/RoadNetwork';
import type { Rng } from '../../core/rng';
import type {
  ArchetypeId,
  BookingType,
  CharacterDef,
  PassengerProfile,
  RideRequest,
  SpecialCircumstance,
  WeatherKind,
} from '../../core/types';
import { distance2d } from '../../core/math';
import { generateProfile } from '../passenger/profiles';
import {
  CHARACTERS,
  generateCharacterProfile,
  isWithinPreferredTimes,
} from '../passenger/PassengerAI';
import { fairFare, surgeAt } from '../negotiation/fare';
import type { ReputationSystem } from '../reputation/ReputationSystem';

// POIs where passengers gather (T8.4 demand zones).
const DEMAND_POI_KINDS: string[] = ['busStop', 'market', 'officeGate', 'school', 'hospital', 'crossing', 'teaStall'];

export function getTimeOfDayDemandMultiplier(minute: number): number {
  const m = ((minute % 1440) + 1440) % 1440;
  // Morning rush: 08:00 - 10:30 (480 - 630) -> 2.5
  if (m >= 480 && m <= 630) {
    return 2.5;
  }
  // Evening rush: 17:00 - 20:30 (1020 - 1230) -> 2.5
  if (m >= 1020 && m <= 1230) {
    return 2.5;
  }
  // Midday: 11:00 - 16:00 (660 - 960) -> 1.0
  if (m >= 660 && m <= 960) {
    return 1.0;
  }
  // Late night: 23:00 - 05:00 -> 0.3
  if (m >= 1380 || m < 300) {
    return 0.3;
  }
  // Shoulder hours
  return 1.2;
}

export function samplePoisson(lambda: number, rng: Rng): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1.0;
    do {
      k++;
      p *= rng.next();
    } while (p > L);
    return k - 1;
  }
  const u1 = Math.max(1e-10, rng.next());
  const u2 = rng.next();
  const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return Math.max(0, Math.round(lambda + Math.sqrt(lambda) * z));
}

export interface RequestGeneratorOptions {
  baseArrivalRatePerMinute?: number; // average requests per game minute
  requestRateMultiplier?: number;
  reputationSystem?: ReputationSystem;
  relationshipsProvider?: () => Record<string, number>;
  characters?: CharacterDef[];
  phoneBattery?: number;
  phoneBatteryProvider?: () => number;
  /** T8.4: when true the app offers nothing (suspended); direct and street rides continue. */
  appSuspendedProvider?: () => boolean;
  /** T8.2: request IDs are `req_<day>_<seq>`; the owner persists `seq` so a loaded game never reuses one. */
  dayProvider?: () => number;
  seqProvider?: () => number;
}

// ponytail: T8.6 placeholder share of requests from the six new archetypes; tune in T11.3.
const NEW_ARCHETYPE_SHARE = 0.15;
const NEW_ARCHETYPES: ArchetypeId[] = ['student', 'office', 'urgent', 'traveler', 'unreliable', 'family'];

export class RequestGenerator {
  readonly network: RoadNetwork;
  readonly rng: Rng;
  readonly baseArrivalRate: number;
  readonly reputationSystem?: ReputationSystem;
  readonly relationshipsProvider?: () => Record<string, number>;
  readonly characters: CharacterDef[];

  private requestRateMultiplier: number = 1.0;
  private eligibleNodeIds: string[] = [];
  private profiles: Map<string, PassengerProfile> = new Map();
  private phoneBattery: number = 100;
  private phoneBatteryProvider?: () => number;
  private appSuspendedProvider?: () => boolean;
  private demandNodeIds: Set<string> = new Set();
  private readonly dayProvider: () => number;
  private readonly seqProvider: () => number;
  // Reused each tick() call so the common zero-request case allocates nothing.
  private readonly tickScratch: RideRequest[] = [];

  constructor(
    network: RoadNetwork,
    rng: Rng,
    opts: RequestGeneratorOptions = {}
  ) {
    this.network = network;
    this.rng = rng;
    this.baseArrivalRate = opts.baseArrivalRatePerMinute ?? 0.5;
    this.reputationSystem = opts.reputationSystem;
    this.relationshipsProvider = opts.relationshipsProvider;
    this.characters = opts.characters ?? CHARACTERS;
    this.requestRateMultiplier = opts.requestRateMultiplier ?? 1.0;
    this.phoneBattery = opts.phoneBattery ?? 100;
    this.phoneBatteryProvider = opts.phoneBatteryProvider;
    this.appSuspendedProvider = opts.appSuspendedProvider;
    let localSeq = 0;
    this.dayProvider = opts.dayProvider ?? (() => 1);
    this.seqProvider = opts.seqProvider ?? (() => ++localSeq);
    this.computeEligibleNodes();
  }

  getRelationship(characterId: string): number {
    if (this.reputationSystem) {
      return this.reputationSystem.getRelationship(characterId);
    }
    if (this.relationshipsProvider) {
      return this.relationshipsProvider()[characterId] ?? 0;
    }
    return 0;
  }

  canEmitRecurringRequest(characterId: string, currentMinute?: number): boolean {
    const def = this.characters.find((c) => c.id === characterId);
    if (!def || def.canRide === false) {
      return false;
    }
    // GDD §6 / T4.3: regular requests appear only after threshold (relationship >= 15)
    const rel = this.getRelationship(characterId);
    if (rel < 15) {
      return false;
    }
    if (
      currentMinute !== undefined &&
      !isWithinPreferredTimes(def, currentMinute)
    ) {
      return false;
    }
    return true;
  }

  private nextRequestId(): string {
    return `req_${this.dayProvider()}_${this.seqProvider()}`;
  }

  setPhoneBattery(battery: number): void {
    this.phoneBattery = battery;
  }

  getPhoneBattery(): number {
    if (this.phoneBatteryProvider) {
      return this.phoneBatteryProvider();
    }
    return this.phoneBattery;
  }

  setRequestRateMultiplier(mult: number): void {
    this.requestRateMultiplier = Math.max(0, mult);
  }

  getRequestRateMultiplier(): number {
    if (this.reputationSystem) {
      return this.reputationSystem.getRequestRateMultiplier();
    }
    return this.requestRateMultiplier;
  }

  private computeEligibleNodes(): void {
    // T8.4: a pickup needs real kerb: an accessible, practical segment that is not a
    // divided carriageway (a passenger cannot wait mid-carriageway).
    const nodeSet = new Set<string>();
    for (const seg of this.network.getAllSegments()) {
      if (isPickupSegment(seg)) {
        nodeSet.add(seg.startNodeId);
        nodeSet.add(seg.endNodeId);
      }
    }
    this.eligibleNodeIds = Array.from(nodeSet);
    // Demand zones: where people gather, so street hails come from here first.
    this.demandNodeIds = new Set();
    for (const poi of this.network.getPois()) {
      if (DEMAND_POI_KINDS.includes(poi.kind) && nodeSet.has(poi.nodeId)) {
        this.demandNodeIds.add(poi.nodeId);
      }
    }
  }

  getEligibleNodeIds(): string[] {
    return [...this.eligibleNodeIds];
  }

  /** Registers a profile for a passenger created outside the generator (debug/test rides). */
  setProfile(profile: PassengerProfile): void {
    this.profiles.set(profile.passengerId, profile);
  }

  getProfile(passengerId: string): PassengerProfile | undefined {
    return this.profiles.get(passengerId);
  }

  sampleArchetype(minute: number): ArchetypeId {
    const m = ((minute % 1440) + 1440) % 1440;
    const draw = this.rng.next();
    // T8.6: a fixed share of requests comes from the six new archetypes; the rest keep the original tables.
    if (draw < NEW_ARCHETYPE_SHARE) {
      return NEW_ARCHETYPES[Math.floor((draw / NEW_ARCHETYPE_SHARE) * NEW_ARCHETYPES.length)]!;
    }
    const roll = (draw - NEW_ARCHETYPE_SHARE) / (1 - NEW_ARCHETYPE_SHARE);

    // Late night distribution
    if (m >= 1380 || m < 300) {
      if (roll < 0.4) return 'risky';
      if (roll < 0.65) return 'regular';
      if (roll < 0.8) return 'bargainer';
      if (roll < 0.9) return 'commuter';
      return 'careful';
    }

    // Rush hour distribution
    if ((m >= 480 && m <= 630) || (m >= 1020 && m <= 1230)) {
      if (roll < 0.45) return 'commuter';
      if (roll < 0.65) return 'bargainer';
      if (roll < 0.8) return 'regular';
      if (roll < 0.95) return 'careful';
      return 'risky';
    }

    // Standard distribution
    if (roll < 0.25) return 'bargainer';
    if (roll < 0.5) return 'commuter';
    if (roll < 0.7) return 'regular';
    if (roll < 0.9) return 'careful';
    return 'risky';
  }

  sampleRequest(
    currentMinute: number,
    weather: WeatherKind,
    bookingType: BookingType = 'app',
    forcedPickupNodeId?: string,
    characterId?: string
  ): { request: RideRequest; profile: PassengerProfile } | null {
    if (this.eligibleNodeIds.length < 2) {
      return null;
    }

    if (characterId) {
      return this.sampleRecurringRequest(
        currentMinute,
        weather,
        characterId,
        bookingType
      );
    }

    if (bookingType === 'app' && (this.getPhoneBattery() <= 0 || this.appSuspendedProvider?.())) {
      return null;
    }

    const surge = surgeAt(undefined, currentMinute, weather);
    const archetype = this.sampleArchetype(currentMinute);
    const profile = generateProfile(archetype, this.rng);

    // Reject and resample up to 20 tries to ensure valid route
    for (let tryCount = 0; tryCount < 20; tryCount++) {
      const pickupNodeId =
        forcedPickupNodeId ?? this.rng.pick(this.eligibleNodeIds);
      const destNodeId = this.rng.pick(this.eligibleNodeIds);

      if (destNodeId === pickupNodeId) {
        continue;
      }

      const r = this.network.route(pickupNodeId, destNodeId, {
        mode: 'motorcycle',
        weather,
      });

      // The pickup must also be reachable from the destination side, or the rider
      // could be stranded there with nobody to take.
      if (
        r &&
        r.nodeIds.length > 0 &&
        this.network.route(destNodeId, pickupNodeId, { mode: 'motorcycle', weather })
      ) {
        const fare = fairFare(r.virtualKm, r.etaMin, surge);
        const reqId = this.nextRequestId();

        let special: SpecialCircumstance | undefined;
        if (weather === 'lightRain' || weather === 'heavyRain') {
          special = 'rain';
        } else if (profile.traits.luggage) {
          special = 'luggage';
        } else if (profile.traits.child) {
          special = 'child';
        } else if (profile.urgency > 0.8) {
          special = 'urgent';
        }

        const requestedArrivalTime =
          profile.urgency > 0.6
            ? Math.round(
                currentMinute + r.etaMin * (1.1 - profile.urgency * 0.2)
              )
            : null;

        const request: RideRequest = {
          requestId: reqId,
          passengerId: profile.passengerId,
          pickupNodeId,
          destinationNodeId: destNodeId,
          initialFare: fare,
          estimatedDistance: r.virtualKm,
          estimatedDuration: r.etaMin,
          requestedArrivalTime,
          bookingType,
          status: 'WaitingForPickup',
          surge,
          specialCircumstance: special,
        };

        this.profiles.set(profile.passengerId, profile);
        return { request, profile };
      }
    }

    return null;
  }

  sampleRecurringRequest(
    currentMinute: number,
    weather: WeatherKind,
    forcedCharacterId?: string,
    bookingType: BookingType = 'direct'
  ): { request: RideRequest; profile: PassengerProfile } | null {
    if (this.eligibleNodeIds.length < 2) {
      return null;
    }

    let charDef: CharacterDef | undefined;
    if (forcedCharacterId) {
      if (!this.canEmitRecurringRequest(forcedCharacterId, currentMinute)) {
        return null;
      }
      charDef = this.characters.find((c) => c.id === forcedCharacterId);
    } else {
      const eligible = this.characters.filter((c) =>
        this.canEmitRecurringRequest(c.id, currentMinute)
      );
      if (eligible.length === 0) {
        return null;
      }
      charDef = this.rng.pick(eligible);
    }

    if (!charDef) {
      return null;
    }

    const rel = this.getRelationship(charDef.id);
    const profile = generateCharacterProfile(charDef, rel);

    // Home node as preferred pickup if present in network, else pick an eligible node
    const homeNodeExists =
      this.network.getNode(charDef.homeNodeId) !== undefined &&
      this.eligibleNodeIds.includes(charDef.homeNodeId);
    const pickupNodeId = homeNodeExists
      ? charDef.homeNodeId
      : this.rng.pick(this.eligibleNodeIds);

    for (let tryCount = 0; tryCount < 20; tryCount++) {
      const destNodeId = this.rng.pick(this.eligibleNodeIds);
      if (destNodeId === pickupNodeId) continue;

      const r = this.network.route(pickupNodeId, destNodeId, {
        mode: 'motorcycle',
        weather,
      });

      if (r && r.nodeIds.length > 0) {
        const surge =
          bookingType === 'direct'
            ? 1.0
            : surgeAt(undefined, currentMinute, weather);
        const fare = fairFare(r.virtualKm, r.etaMin, surge);
        const reqId = this.nextRequestId();

        let special: SpecialCircumstance | undefined;
        if (weather === 'lightRain' || weather === 'heavyRain') {
          special = 'rain';
        } else if (profile.traits.luggage) {
          special = 'luggage';
        } else if (profile.traits.child) {
          special = 'child';
        } else if (profile.urgency > 0.8) {
          special = 'urgent';
        }

        const requestedArrivalTime =
          profile.urgency > 0.6
            ? Math.round(
                currentMinute + r.etaMin * (1.1 - profile.urgency * 0.2)
              )
            : null;

        const request: RideRequest = {
          requestId: reqId,
          passengerId: profile.passengerId,
          characterId: charDef.id,
          pickupNodeId,
          destinationNodeId: destNodeId,
          initialFare: fare,
          estimatedDistance: r.virtualKm,
          estimatedDuration: r.etaMin,
          requestedArrivalTime,
          bookingType,
          status: 'WaitingForPickup',
          surge,
          specialCircumstance: special,
        };

        this.profiles.set(profile.passengerId, profile);
        return { request, profile };
      }
    }

    return null;
  }

  sampleStreetHail(
    playerPose: { x: number; z: number },
    currentMinute: number,
    weather: WeatherKind
  ): { request: RideRequest; profile: PassengerProfile } | null {
    const nearbyNodes = this.eligibleNodeIds.filter((id) => {
      const node = this.network.getNode(id);
      if (!node) return false;
      return distance2d(playerPose.x, playerPose.z, node.x, node.z) <= 40;
    });

    if (nearbyNodes.length === 0) return null;
    // Hails come from demand zones when the rider is in one, else any nearby kerb.
    const inZone = nearbyNodes.filter((id) => this.demandNodeIds.has(id));
    const pickupNodeId = this.rng.pick(inZone.length > 0 ? inZone : nearbyNodes);
    return this.sampleRequest(currentMinute, weather, 'street', pickupNodeId);
  }

  tick(
    dtMinutes: number,
    currentMinute: number,
    weather: WeatherKind,
    playerPose?: { x: number; z: number },
    rateMultiplier?: number
  ): RideRequest[] {
    const weatherMult =
      weather === 'lightRain' ? 1.35 : weather === 'heavyRain' ? 1.5 : 1.0;
    const timeMult = getTimeOfDayDemandMultiplier(currentMinute);
    const demandMultiplier = rateMultiplier ?? this.getRequestRateMultiplier();
    const lambda =
      this.baseArrivalRate * timeMult * weatherMult * demandMultiplier * dtMinutes;

    const count = samplePoisson(lambda, this.rng);
    const requests = this.tickScratch;
    requests.length = 0;

    // Direct bookings are off-app: only a dead phone stops them. A suspended app stops app rides only.
    if (this.getPhoneBattery() > 0) {
      // Direct bookings from recurring regulars (threshold relationship >= 15)
      if (this.rng.chance(0.08 * dtMinutes)) {
        const direct = this.sampleRecurringRequest(
          currentMinute,
          weather,
          undefined,
          'direct'
        );
        if (direct) {
          requests.push(direct.request);
        }
      }

      const appOpen = !this.appSuspendedProvider?.();
      for (let i = 0; appOpen && i < count; i++) {
        const result = this.sampleRequest(currentMinute, weather, 'app');
        if (result) {
          requests.push(result.request);
        }
      }
    }

    // Street hails: pedestrians near player within 40m
    if (playerPose) {
      const streetHailProb = 0.2 * timeMult * dtMinutes;
      if (this.rng.chance(streetHailProb)) {
        const hail = this.sampleStreetHail(playerPose, currentMinute, weather);
        if (hail) {
          requests.push(hail.request);
        }
      }
    }

    return requests;
  }
}
