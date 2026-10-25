import { z } from 'zod';
import type { RoadNode, RoadSegment, DistrictId } from '../core/types';

export const RoadNodeSchema = z.object({
  nodeId: z.string(),
  x: z.number(),
  z: z.number(),
  kind: z.enum(['junction', 'uturn', 'deadEnd', 'poi']),
  signal: z.boolean().optional(),
});

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
  district: z.string(),
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

export const DistrictSchema = z.object({
  districtId: z.string(),
  name: z.object({
    bn: z.string(),
    en: z.string(),
  }),
  nodes: z.array(RoadNodeSchema),
  segments: z.array(RoadSegmentSchema),
  pois: z.array(PoiSchema).default([]),
  lots: z.array(z.unknown()).default([]),
});

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
  lots?: unknown[];
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
