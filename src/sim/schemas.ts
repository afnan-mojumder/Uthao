import { z } from 'zod';
import type { RoadNode, RoadSegment, DistrictId, TransactionKind } from '../core/types';

export const RoadNodeSchema = z.object({
  nodeId: z.string(),
  x: z.number(),
  y: z.number().optional(),
  z: z.number(),
  kind: z.enum(['junction', 'uturn', 'deadEnd', 'poi']),
  signal: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const DistrictIdSchema = z.enum(
  import.meta.env?.DEV !== false
    ? [
        'mirpara',
        'fulgate',
        'dhanbagh',
        'mohakhal',
        'gulbari',
        'puranpara',
        'motinagar',
        'testloop',
      ]
    : [
        'mirpara',
        'fulgate',
        'dhanbagh',
        'mohakhal',
        'gulbari',
        'puranpara',
        'motinagar',
      ]
);

export const RoadSegmentSchema = z.object({
  segmentId: z.string(),
  startNodeId: z.string(),
  endNodeId: z.string(),
  width: z.number(),
  surfaceCondition: z.number().min(0).max(1),
  trafficDensity: z.number().min(0).max(1),
  speedLimit: z.number().positive(),
  turnRestrictions: z.array(z.string()),
  motorcycleAccessible: z.boolean(),
  pedestrianDensity: z.number(),
  riskLevel: z.number().min(0).max(1),
  oneWay: z.boolean(),
  divided: z.boolean(),
  lanes: z.number().int().positive(),
  roadType: z.enum([
    'main',
    'residential',
    'alley',
    'service',
    'flyover',
    'market',
  ]),
  floodSensitivity: z.number().min(0).max(1),
  pickupPractical: z.boolean(),
  district: DistrictIdSchema,
  tags: z.array(z.string()),
});

export const PoiSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'teaStall',
    'fuel',
    'garage',
    'pharmacy',
    'school',
    'market',
    'busStop',
    'apartment',
    'officeGate',
    'hospital',
    'home',
    'crossing',
  ]),
  nodeId: z.string(),
  nameKey: z.string(),
});

export const BuildingLotSchema = z.object({
  lotId: z.string(),
  x: z.number(),
  z: z.number(),
  width: z.number(),
  depth: z.number(),
  facingHeading: z.number(),
  zone: z.enum(['residential', 'commercial', 'market', 'civic']),
});

export type BuildingLot = z.infer<typeof BuildingLotSchema>;

export const DistrictSchema = z.object({
  districtId: DistrictIdSchema,
  name: z.object({
    bn: z.string(),
    en: z.string(),
  }),
  nodes: z.array(RoadNodeSchema),
  segments: z.array(RoadSegmentSchema),
  pois: z.array(PoiSchema).default([]),
  lots: z.array(BuildingLotSchema).default([]),
});

export const WorldDistrictRefSchema = z.object({
  districtId: DistrictIdSchema,
  name: z.object({
    bn: z.string(),
    en: z.string(),
  }),
  file: z.string(),
  bounds: z.object({
    minX: z.number(),
    minZ: z.number(),
    maxX: z.number(),
    maxZ: z.number(),
  }),
});

export const FlyoverDefSchema = z.object({
  flyoverId: z.string(),
  name: z.object({
    bn: z.string(),
    en: z.string(),
  }),
  district: DistrictIdSchema,
  segmentIds: z.array(z.string()),
});

export const WorldDataSchema = z.object({
  districts: z.array(WorldDistrictRefSchema),
  connectors: z.array(RoadSegmentSchema).optional().default([]),
  flyovers: z.array(FlyoverDefSchema).optional().default([]),
});

export type WorldData = z.infer<typeof WorldDataSchema>;
export type WorldDistrictRef = z.infer<typeof WorldDistrictRefSchema>;
export type FlyoverDef = z.infer<typeof FlyoverDefSchema>;

export interface Poi {
  id: string;
  kind:
    | 'teaStall'
    | 'fuel'
    | 'garage'
    | 'pharmacy'
    | 'school'
    | 'market'
    | 'busStop'
    | 'apartment'
    | 'officeGate'
    | 'hospital'
    | 'home'
    | 'crossing';
  nodeId: string;
  nameKey: string;
}

export interface DistrictData {
  districtId: DistrictId;
  name: { bn: string; en: string };
  nodes: RoadNode[];
  segments: RoadSegment[];
  pois: Poi[];
  lots?: BuildingLot[];
}

export const ArchetypeRangeSchema = z.tuple([z.number(), z.number()]);

export const ArchetypeDefinitionSchema = z.object({
  id: z.enum(['bargainer', 'commuter', 'careful', 'regular', 'risky', 'student', 'office', 'urgent', 'traveler', 'unreliable', 'family']),
  name: z.object({
    bn: z.string(),
    en: z.string(),
  }),
  budgetFactor: ArchetypeRangeSchema,
  patience: ArchetypeRangeSchema,
  urgency: ArchetypeRangeSchema,
  bargainingTendency: ArchetypeRangeSchema,
  safetySensitivity: ArchetypeRangeSchema,
  trustInRider: ArchetypeRangeSchema,
  localKnowledge: ArchetypeRangeSchema,
  paymentReliability: ArchetypeRangeSchema,
  walkTolerance: ArchetypeRangeSchema,
  names: z.array(z.string()),
});

export const ArchetypesDataSchema = z.record(
  z.enum(['bargainer', 'commuter', 'careful', 'regular', 'risky', 'student', 'office', 'urgent', 'traveler', 'unreliable', 'family']),
  ArchetypeDefinitionSchema
);

export type ArchetypeDefinition = z.infer<typeof ArchetypeDefinitionSchema>;
export type ArchetypesData = z.infer<typeof ArchetypesDataSchema>;

export const ConditionSchema = z.object({
  phase: z
    .enum([
      'requestOffered',
      'enRouteToPickup',
      'atPickup',
      'onTrip',
      'dropOff',
      'postDropoff',
      'roaming',
    ])
    .optional(),
  tags: z.array(z.string()).optional(),
  weather: z
    .array(z.enum(['clear', 'cloudy', 'lightRain', 'heavyRain']))
    .optional(),
  hours: z.tuple([z.number(), z.number()]).optional(),
  chapter: z.union([z.number(), z.tuple([z.number(), z.number()])]).optional(),
  flags: z
    .record(z.string(), z.union([z.boolean(), z.number(), z.string()]))
    .optional(),
  notFlags: z.record(z.string(), z.boolean()).optional(),
  minRelationship: z.record(z.string(), z.number()).optional(),
  minTrust: z.number().optional(),
  maxTrust: z.number().optional(),
  minMood: z.number().optional(),
  maxMood: z.number().optional(),
  minCash: z.number().optional(),
  maxCash: z.number().optional(),
  minSpeed: z.number().optional(),
  maxSpeed: z.number().optional(),
  hasPassenger: z.boolean().optional(),
  passengerLocalKnowledgeMin: z.number().optional(),
  passengerPaymentReliabilityMax: z.number().optional(),
  bikeConditionMax: z.number().optional(),
  roadType: z.array(z.string()).optional(),
  district: z.array(z.string()).optional(),
  hasEscapePath: z.boolean().optional(),
  witnessesMin: z.number().optional(),
  passengerTrustMin: z.number().optional(),
  minRiskLevel: z.number().optional(),
  meterMax: z
    .record(
      z.enum([
        'riderIntegrity',
        'publicReputation',
        'platformStanding',
        'criminalExposure',
        'evidenceExposure',
        'safetyRecord',
      ]),
      z.number()
    )
    .optional(),
  minTripDistanceM: z.number().nonnegative().optional(),
  minPickupDistanceM: z.number().nonnegative().optional(),
  minRoamDistanceM: z.number().nonnegative().optional(),
  requiresAnchorKind: z.array(z.string()).optional(),
  requiresRoadEventKind: z.array(z.string()).optional(),
  requiresChild: z.boolean().optional(),
  custom: z.string().optional(),
});

export type Condition = z.infer<typeof ConditionSchema>;

export const BaseEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('money'),
    amount: z.number(),
    kind: z.custom<TransactionKind>(),
  }),
  z.object({
    type: z.literal('time'),
    min: z.number(),
  }),
  z.object({
    type: z.literal('mood'),
    delta: z.number(),
  }),
  z.object({
    type: z.literal('trust'),
    delta: z.number(),
  }),
  z.object({
    type: z.literal('rating'),
    delta: z.number(),
  }),
  z.object({
    type: z.literal('relationship'),
    characterId: z.string(),
    delta: z.number(),
  }),
  z.object({
    type: z.literal('localTrust'),
    delta: z.number(),
  }),
  z.object({
    type: z.literal('meter'),
    meter: z.enum([
      'riderIntegrity',
      'publicReputation',
      'platformStanding',
      'criminalExposure',
      'evidenceExposure',
      'safetyRecord',
    ]),
    delta: z.number(),
    reasonKey: z.string(),
    subjectId: z.string().optional(),
  }),
  z.object({
    type: z.literal('flag'),
    key: z.string(),
    value: z.union([z.boolean(), z.number(), z.string()]),
  }),
  z.object({
    type: z.literal('route'),
    action: z.enum(['avoid', 'forceVia', 'closeSegment']),
    ref: z.string(),
  }),
  z.object({
    type: z.literal('endTrip'),
    paid: z.boolean(),
  }),
  z.object({
    type: z.literal('startMinigame'),
    kind: z.enum(['flee', 'pushBike']),
  }),
  z.object({
    type: z.literal('spawnRequest'),
    templateId: z.string(),
  }),
  z.object({
    type: z.literal('startMission'),
    missionId: z.string(),
  }),
  z.object({
    type: z.literal('injury'),
    // T7.5: bare (no target) is read as 'bike' for back-compat with data
    // written before this field existed.
    target: z.enum(['rider', 'passenger', 'bike']).optional(),
    severity: z.number().optional(),
  }),
  z.object({
    type: z.literal('robbery'),
  }),
]);

export type BaseEffect = z.infer<typeof BaseEffectSchema>;

export interface OutcomeEntry {
  weight: number;
  requires?: Condition;
  lineKey: string;
  effects: Effect[];
}

export type Effect =
  | BaseEffect
  | {
      type: 'outcome';
      table: OutcomeEntry[];
    };

export const OutcomeEntrySchema: z.ZodType<OutcomeEntry> = z.object({
  weight: z.number().positive(),
  requires: ConditionSchema.optional(),
  lineKey: z.string(),
  effects: z.array(z.lazy(() => EffectSchema)),
});

export const EffectSchema: z.ZodType<Effect> = z.union([
  BaseEffectSchema,
  z.object({
    type: z.literal('outcome'),
    table: z.array(OutcomeEntrySchema).min(1),
  }),
]);

export const EncounterChoiceDefSchema = z.object({
  id: z.string(),
  labelKey: z.string(),
  requires: ConditionSchema.optional(),
  effects: z.array(EffectSchema),
  riskKey: z.string().optional(),
  costHint: z.number().optional(),
  kind: z.enum(['official', 'illicit', 'neutral']).optional(),
});

export type EncounterChoiceDef = z.infer<typeof EncounterChoiceDefSchema>;

export const EncounterCategorySchema = z.enum([
  'route',
  'pickup',
  'payment',
  'passenger',
  'bike',
  'world',
  'crime',
  'police',
  'accident',
  'story',
]);

export type EncounterCategory = z.infer<typeof EncounterCategorySchema>;

export const EncounterDefSchema = z.object({
  id: z.string(),
  category: EncounterCategorySchema,
  trigger: ConditionSchema,
  weight: z.number().positive(),
  cooldownMin: z.number().nonnegative(),
  oncePerDay: z.boolean().optional(),
  presentation: z.enum(['modal', 'inline']).optional(),
  lineKey: z.string(),
  cueKey: z.string().optional(),
  choices: z.array(EncounterChoiceDefSchema).min(1),
});

export type EncounterDef = z.infer<typeof EncounterDefSchema>;

export const ObjectiveDefSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('earnNet'),
    amount: z.number(),
    byDay: z.number().optional(),
    byMinute: z.number().optional(),
  }),
  z.object({
    type: z.literal('completeRides'),
    count: z.number().int().positive(),
    district: DistrictIdSchema.optional(),
    zoneTag: z.string().optional(),
    distinctDistricts: z.number().int().optional(),
    beforeMinute: z.number().optional(),
    weather: z.enum(['clear', 'cloudy', 'lightRain', 'heavyRain']).optional(),
    noCrash: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('rideWith'),
    characterId: z.string(),
  }),
  z.object({
    type: z.literal('reach'),
    poiId: z.string(),
  }),
  z.object({
    type: z.literal('payExpense'),
    expenseId: z.string(),
    amount: z.number().optional(),
  }),
  z.object({
    type: z.literal('choose'),
    encounterId: z.string(),
    choiceIds: z.array(z.string()).optional(),
  }),
  z.object({
    type: z.literal('relationship'),
    characterId: z.string(),
    min: z.number(),
  }),
  z.object({
    type: z.literal('flag'),
    key: z.string(),
    value: z.union([z.boolean(), z.number(), z.string()]),
  }),
  z.object({
    type: z.literal('buy'),
    target: z.enum(['upgrade', 'bike']),
    targetId: z.string(),
  }),
  z.object({
    type: z.literal('survive'),
    encounterId: z.string(),
    /** Choices that count as getting through the encounter. Omitted: any choice that does not fail. */
    choiceIds: z.array(z.string()).optional(),
  }),
]);

export type ObjectiveDef = z.infer<typeof ObjectiveDefSchema>;

export const MissionObjectiveSchema = z.intersection(
  z.object({
    id: z.string(),
    descKey: z.string(),
    optional: z.boolean().optional(),
  }),
  ObjectiveDefSchema
);

export type MissionObjective = z.infer<typeof MissionObjectiveSchema>;

export const MissionDefSchema = z.object({
  id: z.string(),
  chapter: z.number().int().positive(),
  day: z.number().int().positive(),
  titleKey: z.string(),
  descKey: z.string(),
  prerequisites: z.array(z.string()).default([]),
  objectives: z.array(MissionObjectiveSchema).min(1),
  rewards: z.array(EffectSchema).default([]),
  failConditions: z.array(MissionObjectiveSchema).optional(),
  onFail: z.array(EffectSchema).optional(),
  unlocks: z.array(z.string()).default([]),
  triggerOnly: z.boolean().optional(),
});

export type MissionDef = z.infer<typeof MissionDefSchema>;

export const EndingDefSchema = z.object({
  id: z.string(),
  titleKey: z.string(),
  descKey: z.string(),
  conditions: ConditionSchema.optional(),
  tendencySummary: z.boolean().optional(),
});

export type EndingDef = z.infer<typeof EndingDefSchema>;

export const CharacterPreferredTimeSchema = z.object({
  startMinute: z.number(),
  endMinute: z.number(),
});

export const CharacterDefSchema = z.object({
  id: z.string(),
  nameKey: z.string(),
  roleKey: z.string(),
  bioKey: z.string().optional(),
  phone: z.string(),
  archetype: z.enum(['bargainer', 'commuter', 'careful', 'regular', 'risky', 'student', 'office', 'urgent', 'traveler', 'unreliable', 'family']),
  homeNodeId: z.string(),
  destinationNodeIds: z.array(z.string()).optional(),
  preferredTimes: z.array(CharacterPreferredTimeSchema),
  fixedTraits: z.object({
    luggage: z.boolean(),
    child: z.boolean(),
    walkTolerance: z.number(),
  }),
  budget: z.number(),
  patience: z.number(),
  urgency: z.number(),
  bargainingTendency: z.number(),
  safetySensitivity: z.number(),
  trustInRider: z.number(),
  localKnowledge: z.number(),
  paymentReliability: z.number(),
  initialRelationship: z.number(),
  canRide: z.boolean().optional(),
});

export type CharacterData = z.infer<typeof CharacterDefSchema>;

export const CharactersDataSchema = z.array(CharacterDefSchema);
export type CharactersData = z.infer<typeof CharactersDataSchema>;


export const BikeDefSchema = z.object({
  id: z.enum(['old100', 'used125', 'new150']),
  nameKey: z.string(),
  descKey: z.string(),
  displacementCc: z.number().int().positive(),
  price: z.number().nonnegative(),
  tradeInBase: z.number().nonnegative(),
  vmax: z.number().positive(),
  accel: z.number().positive(),
  brakeDecelDry: z.number().positive(),
  brakeDecelWet: z.number().positive(),
  efficiencyKmPerL: z.number().positive(),
  tankCapacityL: z.number().positive(),
  dailyInsuranceCost: z.number().nonnegative(),
  audioPitch: z.number().positive(),
  modelVariant: z.string(),
});

export type BikeDef = z.infer<typeof BikeDefSchema>;

export const BikesDataSchema = z.array(BikeDefSchema);
export type BikesData = z.infer<typeof BikesDataSchema>;

export const DeliveryJobSchema = z.object({
  id: z.string(),
  senderNameKey: z.string(),
  pickupPoiId: z.string(),
  pickupNodeId: z.string(),
  dropoffNodeId: z.string(),
  pickupPlaceKey: z.string().optional(),
  dropoffPlaceKey: z.string().optional(),
  itemType: z.enum(['food', 'document', 'medicine', 'fragile_electronics', 'parcel']),
  fragile: z.boolean(),
  basePayout: z.number().positive(),
  timeLimitMinutes: z.number().positive(),
  pickupDeadlineMinute: z.number().optional(),
  dropoffDeadlineMinute: z.number().optional(),
  status: z.enum(['offered', 'accepted', 'in_transit', 'delivered', 'failed']),
  damaged: z.boolean().optional(),
  damagePenalty: z.number().optional(),
});

export type DeliveryJobDef = z.infer<typeof DeliveryJobSchema>;

export type DialoguePhase =
  | 'greeting'
  | 'offer'
  | 'counter'
  | 'accept'
  | 'reject'
  | 'small_talk'
  | 'drop_off';

export const DialogueLineSchema = z.object({
  id: z.string(),
  archetype: z.enum(['bargainer', 'commuter', 'careful', 'regular', 'risky', 'student', 'office', 'urgent', 'traveler', 'unreliable', 'family']).optional(),
  characterId: z.string().optional(),
  phase: z.enum(['greeting', 'offer', 'counter', 'accept', 'reject', 'small_talk', 'drop_off']),
  key: z.string(),
  category: z.enum(['cricket', 'exams', 'jam', 'rain', 'family', 'general', 'humour']).optional(),
  requires: z
    .object({
      minRelationship: z.number().optional(),
      flags: z.record(z.string(), z.union([z.boolean(), z.string(), z.number()])).optional(),
      weather: z.enum(['clear', 'overcast', 'rain', 'monsoon']).optional(),
      minDistance: z.number().optional(),
      timeOfDay: z.enum(['morning', 'rush_morning', 'midday', 'rush_evening', 'night']).optional(),
    })
    .optional(),
  speaker: z.enum(['passenger', 'rider', 'contact']).optional(),
});

export type DialogueLineDef = z.infer<typeof DialogueLineSchema>;
export const DialogueDataSchema = z.array(DialogueLineSchema);
export type DialogueData = z.infer<typeof DialogueDataSchema>;

// --- Save v1 / v2 Runtime Validation Schemas (P5.2 / T11.4) ---

export const SaveSlotSchema = z.enum(['auto', 'slot1', 'slot2', 'slot3']);

export const SaveModeSchema = z.enum(['career', 'endless']);

export const WeatherKindSchema = z.enum(['clear', 'cloudy', 'lightRain', 'heavyRain']);

export const MeterIdSchema = z.enum([
  'riderIntegrity',
  'publicReputation',
  'platformStanding',
  'criminalExposure',
  'evidenceExposure',
  'safetyRecord',
]);

export const BikeIdSchema = z.enum(['old100', 'used125', 'new150']);

export const EndingIdSchema = z.enum([
  'independent_rider',
  'workshop_owner',
  'trusted_local',
  'fast_money',
  'fresh_start',
]);

const TransactionKindSchema = z.enum([
  'fare',
  'tip',
  'event',
  'commission',
  'fuel',
  'repair',
  'maintenance',
  'upgrade',
  'food',
  'rent',
  'family',
  'phoneData',
  'parking',
  'fine',
  'reward',
  'robbery',
  'delivery',
  'medical',
  'bike_purchase',
  'bonus',
  'bribe',
  'compensation',
  'tea',
  'savings',
  'debt',
]);

export const SaveTransactionSchema = z.object({
  id: z.string(),
  day: z.number().finite(),
  minute: z.number().finite(),
  kind: TransactionKindSchema,
  amount: z.number().finite(),
  requestId: z.string().optional(),
});

export const SaveRoadEventSchema = z.object({
  id: z.string(),
  kind: z.enum([
    'construction',
    'stalled_vehicle',
    'market_congestion',
    'blocked_intersection',
    'diversion',
    'closure',
    'vip_protocol',
    'waterlogging',
    'eid_rush',
  ]),
  segmentId: z.string(),
  active: z.boolean(),
  closesSegment: z.boolean(),
  speedCapKmh: z.number().finite().optional(),
  congestionMultiplier: z.number().finite().optional(),
  hasWorkers: z.boolean().optional(),
  diversionSegmentId: z.string().optional(),
  startMinute: z.number().finite(),
  durationMinutes: z.number().finite(),
  remainingMinutes: z.number().finite(),
  title: z
    .object({
      bn: z.string(),
      en: z.string(),
    })
    .optional(),
});

export const SaveDeliverySnapshotSchema = z.object({
  offeredDeliveries: z.array(DeliveryJobSchema),
  activeDeliveries: z.array(DeliveryJobSchema),
  completedDeliveries: z.array(DeliveryJobSchema).optional(),
  partnershipActive: z.boolean().optional(),
  jobSeq: z.number().finite().optional(),
});

export const SaveEconomySchema = z.object({
  cash: z.number().finite(),
  advancesTaken: z.number().finite().optional(),
  deferredRent: z.number().finite().optional(),
  dailyRevenue: z.number().finite(),
  dailyExpenses: z.number().finite(),
  fuelLevel: z.number().finite(),
  motorcycleCondition: z.number().finite(),
  appBalance: z.number().finite(),
  debt: z.number().finite(),
  reputation: z.number().finite(),
  savings: z.number().finite(),
  phoneBattery: z.number().finite(),
  engineCondition: z.number().finite().optional(),
  tiresCondition: z.number().finite().optional(),
  brakesCondition: z.number().finite().optional(),
  kmSinceOilChange: z.number().finite().optional(),
  ownedUpgrades: z.array(z.string()).optional(),
  installedCosmetics: z
    .object({
      paint: z.string().optional(),
      seatCover: z.string().optional(),
    })
    .optional(),
  currentBikeId: BikeIdSchema.optional(),
  ownedBikes: z.array(BikeIdSchema).optional(),
});

export const SaveStorySchema = z.object({
  currentChapter: z.number().int().positive(),
  completedMissions: z.array(z.string()),
  activeMissions: z.array(z.string()),
  characterRelationships: z.record(z.string(), z.number().finite()),
  promises: z.array(
    z.object({
      id: z.string(),
      characterId: z.string(),
      descriptionKey: z.string(),
      dueDay: z.number().finite(),
      dueMinute: z.number().finite().optional(),
      fulfilled: z.boolean().optional(),
    })
  ),
  branchFlags: z.record(z.string(), z.union([z.boolean(), z.number().finite(), z.string()])),
  endingEligibility: z.record(EndingIdSchema, z.boolean()),
});

export const KarmaEventSchema = z.object({
  id: z.string(),
  day: z.number().int().positive(),
  minute: z.number().finite(),
  meter: MeterIdSchema,
  delta: z.number().finite(),
  applied: z.number().finite(),
  reasonKey: z.string(),
  subjectId: z.string().optional(),
});

export const SaveReputationSchema = z.object({
  rating: z.number().finite(),
  ratingsHistory: z.array(z.number().finite()).optional(),
  localTrust: z.number().finite(),
  safetyRecord: z.object({
    nearMisses: z.number().finite().nonnegative(),
    bumps: z.number().finite().nonnegative(),
    crashes: z.number().finite().nonnegative(),
    infractions: z.number().finite().nonnegative(),
  }),
  riskScore: z.number().finite().nonnegative(),
  promises: z.object({
    kept: z.number().finite().nonnegative(),
    broken: z.number().finite().nonnegative(),
  }),
  meters: z.partialRecord(MeterIdSchema, z.number().finite()).optional(),
  karmaLog: z.array(KarmaEventSchema).optional(),
  passengerTrust: z.record(z.string(), z.number().finite()).optional(),
  offAppStrikes: z.number().finite().nonnegative().optional(),
  suspendedUntilDay: z.number().finite().nonnegative().optional(),
  wasWarned: z.boolean().optional(),
  wasSuspended: z.boolean().optional(),
  ratingSuspensionCleared: z.boolean().optional(),
  karmaSeq: z.number().finite().nonnegative().optional(),
});

export const SaveBikeSchema = z.object({
  condition: z.number().finite(),
  fuelLevel: z.number().finite(),
  engineCondition: z.number().finite().optional(),
  tiresCondition: z.number().finite().optional(),
  brakesCondition: z.number().finite().optional(),
  kmSinceOilChange: z.number().finite().optional(),
  ownedUpgrades: z.array(z.string()).optional(),
  installedCosmetics: z
    .object({
      paint: z.string().optional(),
      seatCover: z.string().optional(),
    })
    .optional(),
});

export const ObjectiveStateSchema = z.object({
  id: z.string(),
  progress: z.number().finite(),
  target: z.number().finite(),
  completed: z.boolean(),
  rawProgress: z.number().finite().optional(),
});

export const MissionSaveStateSchema = z.object({
  visitedDistricts: z.array(z.string()),
  objectiveStates: z.record(z.string(), z.array(ObjectiveStateSchema)).optional(),
  activeMissions: z.array(z.string()).optional(),
  completedMissions: z.array(z.string()).optional(),
  currentDay: z.number().int().positive().optional(),
});

export const SaveRideMetaSchema = z.object({
  offAppStrikes: z.number().int().nonnegative(),
  appSuspendedUntilDay: z.number().int().nonnegative(),
  directContacts: z.array(z.string()),
  activeBikeId: BikeIdSchema,
  hadUnsettledTrip: z.boolean().optional(),
});

export const SaveEconomyMetaSchema = z.object({
  rentMissedCount: z.number().int().nonnegative(),
  txSeq: z.number().int().nonnegative(),
});

export const SaveEventDirectorStateSchema = z.object({
  cooldowns: z.record(z.string(), z.number().finite()),
  firedToday: z.array(z.string()),
  lastEvaluationMinute: z.number().finite(),
  hasEvaluatedOnce: z.boolean(),
  nextGlobalEncounterMinute: z.number().finite(),
  rngState: z.number().finite().optional(),
  pendingM4PoliceDecision: z.boolean().optional(),
});

export const SaveWeatherStateSchema = z.object({
  weather: WeatherKindSchema,
  roadWetness: z.number().finite(),
  rainDurationMinutes: z.number().finite(),
  segmentFloodLevels: z.record(z.string(), z.number().finite()),
  manualOverride: z.boolean().optional(),
});

export const SaveBikePoseSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite().optional(),
  z: z.number().finite(),
  heading: z.number().finite(),
});

export const SaveV1Schema = z.object({
  version: z.literal(1),
  timestamp: z.number().finite(),
  slot: SaveSlotSchema,
  seed: z.number().finite(),
  mode: SaveModeSchema,
  ticks: z.number().finite().nonnegative(),
  rngState: z.number().finite(),
  clock: z.object({
    day: z.number().int().positive(),
    minutes: z.number().finite().nonnegative(),
  }),
  economy: SaveEconomySchema,
  story: SaveStorySchema.extend({
    endingEligibility: z.partialRecord(EndingIdSchema, z.boolean()),
  }),
  reputation: SaveReputationSchema,
  bike: SaveBikeSchema,
  weather: WeatherKindSchema,
  waypointNodeId: z.string().nullable(),
  roadEvents: z.array(SaveRoadEventSchema).optional(),
  ledger: z.array(SaveTransactionSchema).optional(),
  settledRequests: z.array(z.string()).optional(),
  requestSeq: z.number().finite().optional(),
  negotiationHistory: z.number().finite().optional(),
  shiftEnded: z.boolean().optional(),
  todayRentPosted: z.number().finite().optional(),
  todayRentDebt: z.number().finite().optional(),
  todayRentAutoFlagged: z.boolean().optional(),
  rentDelayedByCommand: z.boolean().optional(),
  deliveries: SaveDeliverySnapshotSchema.optional(),
  missions: MissionSaveStateSchema.optional(),
});

export const SaveV2Schema = z.object({
  version: z.literal(2),
  timestamp: z.number().finite(),
  slot: SaveSlotSchema,
  seed: z.number().finite(),
  mode: SaveModeSchema,
  ticks: z.number().finite().nonnegative(),
  rngState: z.number().finite(),
  clock: z.object({
    day: z.number().int().positive(),
    minutes: z.number().finite().nonnegative(),
  }),
  economy: SaveEconomySchema,
  story: SaveStorySchema,
  reputation: SaveReputationSchema.extend({
    ratingsHistory: z.array(z.number().finite()),
  }),
  bike: SaveBikeSchema,
  weather: WeatherKindSchema,
  waypointNodeId: z.string().nullable(),
  karmaMeters: z.record(MeterIdSchema, z.number().finite()),
  karmaLog: z.array(KarmaEventSchema),
  passengerTrust: z.record(z.string(), z.number().finite()),
  visitedDistricts: z.array(z.string()),
  missions: MissionSaveStateSchema.extend({
    objectiveStates: z.record(z.string(), z.array(ObjectiveStateSchema)),
  }),
  rideMeta: SaveRideMetaSchema,
  economyMeta: SaveEconomyMetaSchema,
  eventDirectorState: SaveEventDirectorStateSchema,
  weatherState: SaveWeatherStateSchema,
  bikePose: SaveBikePoseSchema,
  roadEvents: z.array(SaveRoadEventSchema).optional(),
  ledger: z.array(SaveTransactionSchema).optional(),
  settledRequests: z.array(z.string()).optional(),
  requestSeq: z.number().finite().optional(),
  negotiationHistory: z.number().finite().optional(),
  shiftEnded: z.boolean().optional(),
  todayRentPosted: z.number().finite().optional(),
  todayRentDebt: z.number().finite().optional(),
  todayRentAutoFlagged: z.boolean().optional(),
  rentDelayedByCommand: z.boolean().optional(),
  todayCompletedRides: z.number().int().nonnegative().optional(),
  deliveries: SaveDeliverySnapshotSchema.optional(),
});
