import { z } from 'zod';
import type { RoadNode, RoadSegment, DistrictId, TransactionKind } from '../core/types';

export const RoadNodeSchema = z.object({
  nodeId: z.string(),
  x: z.number(),
  z: z.number(),
  kind: z.enum(['junction', 'uturn', 'deadEnd', 'poi']),
  signal: z.boolean().optional(),
  tags: z.array(z.string()).optional(),
});

export const DistrictIdSchema = z.enum([
  'mirpara',
  'fulgate',
  'dhanbagh',
  'mohakhal',
  'gulbari',
  'puranpara',
  'motinagar',
  'testloop',
]);

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
  id: z.enum(['bargainer', 'commuter', 'careful', 'regular', 'risky']),
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
  z.enum(['bargainer', 'commuter', 'careful', 'regular', 'risky']),
  ArchetypeDefinitionSchema
);

export type ArchetypeDefinition = z.infer<typeof ArchetypeDefinitionSchema>;
export type ArchetypesData = z.infer<typeof ArchetypesDataSchema>;

export const ConditionSchema = z.object({
  phase: z
    .enum(['requestOffered', 'atPickup', 'onTrip', 'dropOff', 'roaming'])
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
  custom: z.string().optional(),
});

export type Condition = z.infer<typeof ConditionSchema>;

export const EffectSchema = z.discriminatedUnion('type', [
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
    type: z.literal('injury'),
    severity: z.number().optional(),
  }),
]);

export type Effect = z.infer<typeof EffectSchema>;

export const EncounterChoiceDefSchema = z.object({
  id: z.string(),
  labelKey: z.string(),
  requires: ConditionSchema.optional(),
  effects: z.array(EffectSchema),
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
  lineKey: z.string(),
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
  archetype: z.enum(['commuter', 'bargainer', 'careful', 'regular', 'risky']),
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
