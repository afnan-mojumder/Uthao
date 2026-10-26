export type DarkActionType =
  | 'change_fare_after_pickup'
  | 'unnecessary_detour_demand'
  | 'misrepresent_traffic'
  | 'off_app_ride'
  | 'pressure_rushed_passenger'
  | 'suspicious_high_paying_trip'
  | 'exploit_unfamiliar_passenger'
  | 'keep_lost_property'
  | 'abandon_passenger_in_danger'
  | 'cooperate_with_criminals';

export interface IncidentLog {
  id: string;
  day: number;
  timeMinute: number;
  category: 'dark_action' | 'crime_encounter' | 'police_stop' | 'accident';
  summaryKey: string;
  details: string;
  cashDelta: number;
  integrityDelta: number;
  evidenceLeft: boolean;
}

export interface PlayerConduct {
  riderIntegrity: number; // 0..100 (100 = upright professional, 0 = outlaw opportunist)
  passengerTrust: Record<string, number>; // characterId -> 0..100
  publicReputation: number; // 0..100 (city-wide word of mouth)
  platformStanding: number; // 0..100 (Uthao account rating & standing)
  criminalExposure: number; // 0..100 (heat from local underworld / syndicates)
  policeAttention: number; // 0..100 (surveillance & checkpoint suspicion)
  corruptionReputation: number; // 0..100 (known among street police as bribe-payer)
  evidenceExposure: number; // 0..100 (risk of formal complaint or arrest)
  cashOnHand: number;
  incidentHistory: IncidentLog[];
}

export type CrimeEncounterType =
  | 'alley_ambush'
  | 'pickup_robbery'
  | 'road_block'
  | 'passenger_walking_mug'
  | 'suspicious_fare';

export type EncounterRiskLevel = 'low' | 'moderate' | 'high' | 'critical';

export interface EncounterResponseOption {
  id: string;
  labelKey: string;
  descriptionKey: string;
  dangerLevel: EncounterRiskLevel;
  moralCategory: 'protective' | 'neutral' | 'selfish' | 'corrupt';
}

export interface EncounterResolution {
  success: boolean;
  passengerRescued: boolean;
  riderInjured: boolean;
  cashLost: number;
  bikeDamagePct: number;
  trustDelta: number;
  integrityDelta: number;
  criminalExposureDelta: number;
  summaryText: string;
}

export interface CrimeEncounter {
  encounterId: string;
  roadSegmentId: string;
  districtId: string;
  encounterType: CrimeEncounterType;
  riskLevel: EncounterRiskLevel;
  warningSignals: string[];
  passengerId?: string;
  availableResponses: EncounterResponseOption[];
  resolution?: EncounterResolution;
}

export type PoliceViolationType =
  | 'red_light'
  | 'wrong_way'
  | 'restricted_road'
  | 'reckless_overtake'
  | 'speeding_congestion'
  | 'missing_documents'
  | 'collision';

export type ViolationSeverity = 'minor' | 'moderate' | 'severe';

export interface OfficerCorruptionProfile {
  nameKey: string;
  honesty: number; // 0..1 (1 = unbribable, 0 = soliciting)
  corruptionTolerant: boolean;
  strictness: number; // 0..1
  takesBribeLikelihood: number; // 0..1
}

export interface BribeAttempt {
  offer: number;
  accepted: boolean;
  timestamp: number;
}

export type PoliceCaseStatus =
  | 'pending'
  | 'fine_paid'
  | 'bribe_accepted'
  | 'bribe_rejected'
  | 'dismissed'
  | 'warning_issued'
  | 'fled';

export interface PoliceCase {
  caseId: string;
  violationType: PoliceViolationType;
  severity: ViolationSeverity;
  evidenceStrength: number; // 0..1
  witnessCount: number;
  officialFine: number;
  officerProfile: OfficerCorruptionProfile;
  bribeAttemptHistory: BribeAttempt[];
  caseStatus: PoliceCaseStatus;
  legalExposure: number; // 0..100
}

export type AccidentSeverity = 'minor' | 'moderate' | 'severe';
export type AccidentResponsibility = 'rider_fault' | 'third_party_fault' | 'shared';
export type PassengerInjuryState = 'none' | 'bruised' | 'hospitalized';

export type AccidentResponse =
  | 'checked_victims'
  | 'emergency_services'
  | 'settled_cash'
  | 'disputed'
  | 'evaded_fled'
  | 'bribed';

export interface AccidentRecord {
  accidentId: string;
  severity: AccidentSeverity;
  responsibility: AccidentResponsibility;
  passengerInjuryState: PassengerInjuryState;
  thirdPartyDamage: number;
  motorcycleDamage: number;
  witnessCount: number;
  responseChosen?: AccidentResponse;
  resolution?: string;
  medicalExpenses: number;
  compensationPaid: number;
}
