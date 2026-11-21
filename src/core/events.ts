import type { CareerChoiceOption, EndingResult } from '../sim/mission/endings';
import type {
  BikeCollisionSeverity,
  BikeId,
  BikeInfractionKind,
  BookingType,
  DaySummary,
  DeliveryJob,
  DistrictId,
  EncounterInstance,
  EndingId,
  KarmaEvent,
  NegotiationOutcome,
  ReputationDelta,
  RideRequest,
  RoadEvent,
  Transaction,
  TripReceipt,
  TripState,
  WeatherKind,
} from './types';

export interface GameEvents extends Record<string, unknown> {
  'day/started': { day: number };
  'day/ended': { day: number; summary: DaySummary };
  'clock/hour': { hour: number };
  'ride/requested': { request: RideRequest };
  'ride/accepted': { requestId: string };
  'ride/arrivedPickup': { requestId: string };
  'ride/started': { requestId: string };
  'ride/completed': {
    requestId: string;
    receipt: TripReceipt;
    crashed?: boolean;
    passengerCharacterId?: string;
    passengerNameKey?: string;
    district?: DistrictId;
    pickupDistrict?: DistrictId;
    destinationDistrict?: DistrictId;
    zoneTags?: string[];
    weather?: WeatherKind;
    minute?: number;
  };
  'ride/disputed': {
    requestId: string;
    fare: number;
    partialFare: number;
    bookingType: BookingType;
  };
  'ride/disputeResolved': {
    requestId: string;
    choice: 'acceptPartial' | 'insistFull' | 'reportSupport';
    fare: number;
  };
  'passenger/dialogue': {
    requestId?: string;
    key: string;
    text: string;
    phase: 'greeting' | 'offer' | 'counter' | 'accept' | 'reject' | 'small_talk' | 'drop_off';
    speaker?: string;
  };
  'ride/cancelled': {
    requestId: string;
    by: 'rider' | 'passenger' | 'system';
    reason: string;
  };
  'trip/state': { requestId: string | null; from: TripState; to: TripState };
  'negotiation/started': { requestId: string; initialFare: number };
  'negotiation/round': {
    requestId: string;
    round: number;
    offer: number;
    response: string;
  };
  'negotiation/result': { requestId: string; outcome: NegotiationOutcome; discount?: boolean };
  'economy/transaction': { tx: Transaction };
  'reputation/changed': { delta: ReputationDelta };
  'karma/changed': { event: KarmaEvent };
  'encounter/cue': {
    encounterId: string;
    cueKey: string;
    fireAtMinute: number;
  };
  'encounter/cueCleared': {
    encounterId: string;
  };
  'encounter/started': { instance: EncounterInstance };
  // encounterId is the definition id (e.g. enc_police_checkpoint); missions match on it.
  'encounter/resolved': {
    instanceId: string;
    choiceId: string;
    encounterId?: string;
    outcomeLineKey?: string;
  };
  'mission/objectiveUpdated': {
    missionId: string;
    objectiveId: string;
    progress: number;
  };
  'mission/completed': { missionId: string };
  'world/weatherChanged': { from: WeatherKind; to: WeatherKind };
  'world/roadEvent': { event: RoadEvent };
  'bike/collision': {
    severity: BikeCollisionSeverity;
    relSpeedKmh: number;
    otherKind?: string;
    otherParty?: boolean;
    bikeSpeedKmh?: number;
    otherSpeedKmh?: number;
  };
  'bike/nearMiss': { distanceM: number; speedKmh: number };
  /** The bike reached the grip limit and the tyres slid: shown to the rider as a wobble (audit H-4). */
  'bike/wobble': Record<string, never>;
  'bike/infraction': { kind: BikeInfractionKind; segmentId: string };
  'bike/fuelEmpty': Record<string, never>;
  'bike/puncture': Record<string, never>;
  /** T8.3: condition fell below the warning level; a breakdown may follow. */
  'bike/conditionWarning': { conditionPct: number };
  /** T8.3: the engine stalled from wear; repairable at the garage. */
  'bike/breakdown': { conditionPct: number };
  'bike/speedBump': { speedKmh: number };
  'bike/swapped': { bikeId: BikeId; prevBikeId: BikeId };
  'bike/wearChanged': Record<string, never>;
  'player/kamalProximity': { atKamalBhai: boolean };
  'upgrade/purchased': { upgradeId: string; category: 'mechanical' | 'cosmetic' };
  'state/restored': Record<string, never>;
  'delivery/offered': { delivery: DeliveryJob };
  'delivery/accepted': { deliveryId: string };
  'delivery/pickedUp': { deliveryId: string };
  'delivery/completed': { deliveryId: string; payout: number; damageDeduction: number };
  'delivery/damaged': { deliveryId: string; reason: string };
  'delivery/expired': { deliveryId: string; reason: string };
  'story/flag': { key: string; value: boolean | number | string };
  'character/contactAdded': { characterId: string };
  // result is the real sim evaluation; choices is set only for the career decision.
  'ending/reached': { endingId: EndingId; result?: EndingResult; choices?: CareerChoiceOption[] };
  'mission/activated': { missionId: string };
}

export class EventBus<M extends Record<string, unknown>> {
  private listeners: {
    [K in keyof M]?: Set<(payload: M[K]) => void>;
  } = {};

  on<K extends keyof M & string>(
    key: K,
    fn: (payload: M[K]) => void
  ): () => void {
    if (!this.listeners[key]) {
      this.listeners[key] = new Set();
    }
    this.listeners[key].add(fn);
    return () => this.off(key, fn);
  }

  off<K extends keyof M & string>(
    key: K,
    fn: (payload: M[K]) => void
  ): void {
    this.listeners[key]?.delete(fn);
  }

  emit<K extends keyof M & string>(key: K, payload: M[K]): void {
    const set = this.listeners[key];
    if (!set) return;
    for (const fn of Array.from(set)) {
      try {
        fn(payload);
      } catch (err) {
        if (import.meta.env?.DEV) {
          // eslint-disable-next-line no-console
          console.error(`[EventBus] listener error for "${key}":`, err);
        }
        // Isolate subscriber errors so remaining listeners still receive the event
      }
    }
  }

  clear(): void {
    this.listeners = {};
  }
}
