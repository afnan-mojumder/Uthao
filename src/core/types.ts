export type DistrictId =
  | 'mirpara'
  | 'fulgate'
  | 'dhanbagh'
  | 'mohakhal'
  | 'gulbari'
  | 'puranpara'
  | 'motinagar'
  | 'testloop';

export type EndingId =
  | 'independent_rider'
  | 'workshop_owner'
  | 'trusted_local'
  | 'fast_money'
  | 'fresh_start';

export type ArchetypeId =
  | 'bargainer'
  | 'commuter'
  | 'careful'
  | 'regular'
  | 'risky';

export type PassengerState =
  | 'WaitingForPickup'
  | 'Negotiating'
  | 'OnTrip'
  | 'HandlingIncident'
  | 'Completed'
  | 'Reviewed'
  | 'Cancelled';

export type BookingType = 'app' | 'direct' | 'street' | 'offApp';

export type SpecialCircumstance = 'rain' | 'luggage' | 'urgent' | 'child';

export interface PassengerProfile {
  passengerId: string;
  archetype: ArchetypeId;
  budget: number; // ৳
  patience: number; // 0-1
  urgency: number; // 0-1
  bargainingTendency: number; // 0-1
  safetySensitivity: number; // 0-1
  trustInRider: number; // 0-1
  localKnowledge: number; // 0-1
  paymentReliability: number; // 0-1
  relationshipLevel: number; // -100..100
  characterId?: string;
  nameKey: string;
  traits: {
    luggage: boolean;
    child: boolean;
    walkTolerance: number; // 0-1
  };
  personalBias: number; // [-0.1, 0.1], fixed per passenger
}

export interface CharacterPreferredTime {
  startMinute: number;
  endMinute: number;
}

export interface CharacterDef {
  id: string;
  nameKey: string;
  roleKey: string;
  bioKey?: string;
  phone: string;
  archetype: ArchetypeId;
  homeNodeId: string;
  destinationNodeIds?: string[];
  preferredTimes: CharacterPreferredTime[];
  fixedTraits: {
    luggage: boolean;
    child: boolean;
    walkTolerance: number;
  };
  budget: number;
  patience: number;
  urgency: number;
  bargainingTendency: number;
  safetySensitivity: number;
  trustInRider: number;
  localKnowledge: number;
  paymentReliability: number;
  initialRelationship: number;
  canRide?: boolean;
}

export interface RideRequest {
  requestId: string;
  passengerId: string;
  characterId?: string;
  pickupNodeId: string;
  destinationNodeId: string;
  initialFare: number;
  estimatedDistance: number; // virtual km
  estimatedDuration: number; // game min
  requestedArrivalTime: number | null; // game min | null
  bookingType: BookingType;
  status: PassengerState;
  surge: number;
  specialCircumstance?: SpecialCircumstance;
}

export type RoadNodeKind = 'junction' | 'uturn' | 'deadEnd' | 'poi';

export interface RoadNode {
  nodeId: string;
  x: number;
  z: number;
  kind: RoadNodeKind;
  signal?: boolean;
  tags?: string[];
}

export type RoadType =
  | 'main'
  | 'residential'
  | 'alley'
  | 'service'
  | 'flyover'
  | 'market';

export interface RoadSegment {
  segmentId: string;
  startNodeId: string;
  endNodeId: string;
  width: number; // m
  surfaceCondition: number; // 0-1, 1 = perfect
  trafficDensity: number; // 0-1 base
  speedLimit: number; // km/h
  turnRestrictions: string[]; // disallowed next segmentIds
  motorcycleAccessible: boolean;
  pedestrianDensity: number;
  riskLevel: number; // 0-1
  oneWay: boolean;
  divided: boolean;
  lanes: number;
  roadType: RoadType;
  floodSensitivity: number;
  pickupPractical: boolean;
  district: DistrictId;
  tags: string[];
}

export type BikeId = 'old100' | 'used125' | 'new150';

export interface PlayerEconomy {
  cash: number;
  dailyRevenue: number;
  dailyExpenses: number;
  fuelLevel: number; // L
  motorcycleCondition: number; // 0-100
  appBalance: number;
  debt: number;
  reputation: number; // mirror of rating
  savings: number;
  phoneBattery: number; // 0-100
  engineCondition?: number; // 0-100
  tiresCondition?: number; // 0-100
  brakesCondition?: number; // 0-100
  kmSinceOilChange?: number;
  ownedUpgrades?: string[];
  installedCosmetics?: {
    paint?: string;
    seatCover?: string;
  };
  currentBikeId?: BikeId;
  ownedBikes?: BikeId[];
}

export interface StoryPromise {
  id: string;
  characterId: string;
  descriptionKey: string;
  dueDay: number;
  dueMinute?: number;
  fulfilled?: boolean;
}

export interface StoryState {
  currentChapter: number;
  completedMissions: string[];
  activeMissions: string[];
  characterRelationships: Record<string, number>;
  promises: StoryPromise[];
  branchFlags: Record<string, boolean | number | string>;
  endingEligibility: Record<EndingId, boolean>;
}

export type TransactionKind =
  | 'fare'
  | 'tip'
  | 'commission'
  | 'fuel'
  | 'repair'
  | 'maintenance'
  | 'upgrade'
  | 'food'
  | 'rent'
  | 'family'
  | 'phoneData'
  | 'parking'
  | 'fine'
  | 'reward'
  | 'robbery'
  | 'delivery'
  | 'medical'
  | 'bike_purchase';

export interface Transaction {
  id: string;
  day: number;
  minute: number;
  kind: TransactionKind;
  amount: number; // + income, − cost
  requestId?: string;
}

export interface TripReceipt {
  requestId: string;
  fare: number;
  tip: number;
  commission: number;
  fuelCost: number;
  otherCosts: number;
  net: number;
  durationMin: number;
  distanceKm: number;
  rating: number | null;
  consequences: string[]; // i18n keys
}

export type ReasonCode =
  | 'TOO_EXPENSIVE'
  | 'OUT_OF_PATIENCE'
  | 'URGENT'
  | 'TRUSTS_YOU'
  | 'BAD_TRAFFIC'
  | 'WALK_TOO_FAR'
  | 'FAIR_PRICE';

export type NegotiationOutcome =
  | { kind: 'accepted'; fare: number }
  | { kind: 'rejected'; reason: ReasonCode }
  | { kind: 'walkedAway'; reason: ReasonCode };

export interface DaySummary {
  day: number;
  revenue: number;
  expenses: number;
  net: number;
  ratingDelta: number;
  completedRides: number;
  relationshipsDelta: Record<string, number>;
  breakdown?: {
    fares?: number;
    tips?: number;
    fuel?: number;
    food?: number;
    phoneData?: number;
    rent?: number;
    family?: number;
    repairs?: number;
    fines?: number;
    other?: number;
  };
  livingExpenses?: {
    food: number;
    phoneData: number;
    rent: number;
    family: number;
    total: number;
    rentDelayed?: boolean;
    evictionWarning?: boolean;
  };
  cash?: number;
  debt?: number;
}

export interface SafetyRecord {
  nearMisses: number;
  bumps: number;
  crashes: number;
  infractions: number;
}

export interface ReputationDelta {
  rating?: number;
  localTrust?: number;
  relationship?: { characterId: string; delta: number };
  reason?: string;
  riskScore?: number;
  promisesKept?: number;
  promisesBroken?: number;
}

export interface EncounterChoice {
  id: string;
  labelKey: string;
}

export interface EncounterInstance {
  id: string;
  encounterId: string;
  lineKey: string;
  choices: EncounterChoice[];
}

export type WeatherKind = 'clear' | 'cloudy' | 'lightRain' | 'heavyRain';

export interface RoadEvent {
  id: string;
  kind: string;
  segmentId?: string;
  active: boolean;
}

export type BikeCollisionSeverity = 'scuff' | 'bump' | 'crash';

export type BikeInfractionKind = 'speeding' | 'wrongWay' | 'redLight';

export interface DeliveryJob {
  id: string;
  senderNameKey: string;
  pickupPoiId: string;
  pickupNodeId: string;
  dropoffNodeId: string;
  itemType: 'food' | 'document' | 'medicine' | 'fragile_electronics' | 'parcel';
  fragile: boolean;
  basePayout: number;
  timeLimitMinutes: number;
  pickupDeadlineMinute?: number;
  dropoffDeadlineMinute?: number;
  status: 'offered' | 'accepted' | 'in_transit' | 'delivered' | 'failed';
  damaged?: boolean;
  damagePenalty?: number;
}
