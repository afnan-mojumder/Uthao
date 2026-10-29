import type {
  BikeCollisionSeverity,
  BikeInfractionKind,
  DaySummary,
  EncounterInstance,
  EndingId,
  NegotiationOutcome,
  ReputationDelta,
  RideRequest,
  RoadEvent,
  Transaction,
  TripReceipt,
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
  'ride/completed': { requestId: string; receipt: TripReceipt };
  'ride/cancelled': {
    requestId: string;
    by: 'rider' | 'passenger' | 'system';
    reason: string;
  };
  'negotiation/round': {
    requestId: string;
    round: number;
    offer: number;
    response: string;
  };
  'negotiation/result': { requestId: string; outcome: NegotiationOutcome };
  'economy/transaction': { tx: Transaction };
  'reputation/changed': { delta: ReputationDelta };
  'encounter/started': { instance: EncounterInstance };
  'encounter/resolved': { instanceId: string; choiceId: string };
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
  };
  'bike/nearMiss': { distanceM: number; speedKmh: number };
  'bike/infraction': { kind: BikeInfractionKind; segmentId: string };
  'bike/fuelEmpty': Record<string, never>;
  'bike/puncture': Record<string, never>;
  'story/flag': { key: string; value: boolean | number | string };
  'character/contactAdded': { characterId: string };
  'ending/reached': { endingId: EndingId };
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
    this.listeners[key]!.add(fn);

    return () => {
      this.listeners[key]?.delete(fn);
    };
  }

  emit<K extends keyof M & string>(key: K, payload: M[K]): void {
    const handlers = this.listeners[key];
    if (handlers) {
      for (const fn of handlers) {
        fn(payload);
      }
    }
  }
}
