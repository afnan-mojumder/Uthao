import type { RoadNetwork } from '../road/RoadNetwork';
import type { Rng } from '../../core/rng';
import type {
  ArchetypeId,
  BookingType,
  PassengerProfile,
  RideRequest,
  SpecialCircumstance,
  WeatherKind,
} from '../../core/types';
import { distance2d } from '../../core/math';
import { generateProfile } from '../passenger/profiles';
import { fairFare, surgeAt } from '../negotiation/fare';

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
}

export class RequestGenerator {
  readonly network: RoadNetwork;
  readonly rng: Rng;
  readonly baseArrivalRate: number;

  private eligibleNodeIds: string[] = [];
  private profiles: Map<string, PassengerProfile> = new Map();

  constructor(
    network: RoadNetwork,
    rng: Rng,
    opts: RequestGeneratorOptions = {}
  ) {
    this.network = network;
    this.rng = rng;
    this.baseArrivalRate = opts.baseArrivalRatePerMinute ?? 0.5;
    this.computeEligibleNodes();
  }

  private computeEligibleNodes(): void {
    const nodeSet = new Set<string>();
    for (const seg of this.network.getAllSegments()) {
      if (seg.pickupPractical && seg.motorcycleAccessible) {
        nodeSet.add(seg.startNodeId);
        nodeSet.add(seg.endNodeId);
      }
    }
    this.eligibleNodeIds = Array.from(nodeSet);
  }

  getEligibleNodeIds(): string[] {
    return [...this.eligibleNodeIds];
  }

  getProfile(passengerId: string): PassengerProfile | undefined {
    return this.profiles.get(passengerId);
  }

  sampleArchetype(minute: number): ArchetypeId {
    const m = ((minute % 1440) + 1440) % 1440;
    const roll = this.rng.next();

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
    forcedPickupNodeId?: string
  ): { request: RideRequest; profile: PassengerProfile } | null {
    if (this.eligibleNodeIds.length < 2) {
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

      if (r && r.nodeIds.length > 0) {
        const fare = fairFare(r.virtualKm, r.etaMin, surge);
        const reqId = `req_${this.rng.int(100000, 999999)}`;

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
    const pickupNodeId = this.rng.pick(nearbyNodes);
    return this.sampleRequest(currentMinute, weather, 'street', pickupNodeId);
  }

  tick(
    dtMinutes: number,
    currentMinute: number,
    weather: WeatherKind,
    playerPose?: { x: number; z: number }
  ): RideRequest[] {
    const weatherMult =
      weather === 'lightRain' ? 1.35 : weather === 'heavyRain' ? 1.5 : 1.0;
    const timeMult = getTimeOfDayDemandMultiplier(currentMinute);
    const lambda = this.baseArrivalRate * timeMult * weatherMult * dtMinutes;

    const count = samplePoisson(lambda, this.rng);
    const requests: RideRequest[] = [];

    for (let i = 0; i < count; i++) {
      const result = this.sampleRequest(currentMinute, weather, 'app');
      if (result) {
        requests.push(result.request);
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
