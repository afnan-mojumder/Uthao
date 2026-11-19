// Which traffic kinds get their own mesh, and what colour/style each one uses.
// Pure data, so the coverage rule can be unit tested without WebGL.

import type { BikeId } from '../core/types';
import type { TrafficVehicleKind } from '../sim/traffic/TrafficManager';

export const VEHICLE_COLOR: Record<TrafficVehicleKind, number> = {
  car: 0x2563eb,
  bus: 0x1e88e5,
  minibus: 0xf59e0b,
  truck: 0x78716c,
  delivery_van: 0xe5e7eb,
  cng: 0x187a38,
  motorcycle: 0x111827,
  rickshaw: 0x16a34a,
  bicycle: 0x64748b,
  scooter: 0x84cc16,
  ride_hailing_car: 0xfacc15,
  vendor_cart: 0xa16207,
};

/**
 * Every kind drawn as a vehicle mesh. Rickshaws have their own mesh in
 * people.ts, so they are not repeated here. Before this list existed, only
 * rickshaws were drawn, so cars and buses collided with the bike unseen.
 */
export const DRAWN_VEHICLE_KINDS: TrafficVehicleKind[] = [
  'car',
  'bus',
  'minibus',
  'truck',
  'delivery_van',
  'cng',
  'motorcycle',
  'bicycle',
  'scooter',
  'ride_hailing_car',
  'vendor_cart',
];

/**
 * Maps traffic kinds to curated Kenney Car Kit GLB IDs in assets.manifest.json.
 * Kinds with multiple IDs distribute instances deterministically by agent ID.
 */
export const VEHICLE_MODEL_IDS: Partial<Record<TrafficVehicleKind, readonly string[]>> = {
  car: ['vehicle_sedan', 'vehicle_hatchback', 'vehicle_suv'],
  ride_hailing_car: ['vehicle_taxi'],
  minibus: ['vehicle_van'],
  delivery_van: ['vehicle_delivery'],
  truck: ['vehicle_truck'],
};

/** Bangladeshi street clothing palette (shirts, panjabis, kurtas, salwar kameez). */
export const PEDESTRIAN_SHIRT_COLORS: readonly number[] = [
  0xf1f5f9, // Crisp white
  0x38bdf8, // Sky blue
  0x0f766e, // Dhaka teal
  0xd97706, // Saffron / mustard
  0x991b1b, // Deep maroon
  0x059669, // Emerald green
  0x3730a3, // Indigo panjabi
  0xc2410c, // Terracotta
  0xfef3c7, // Cream / off-white
  0x475569, // Charcoal slate
];

/** Lungi and trouser palette. */
export const PEDESTRIAN_PANTS_COLORS: readonly number[] = [
  0x1e293b, // Navy trouser
  0x334155, // Slate lungi
  0x3f2e21, // Earth brown
  0x1f2937, // Charcoal
  0x1e3a5f, // Classic lungi indigo
];

export const PEDESTRIAN_SKIN_COLORS: readonly number[] = [
  0xb67b52,
  0xa46c47,
  0xc58c63,
  0x8d5836,
];

export const ROAD_WORKER_VEST_COLOR = 0xf97316;

export interface BikeVariantVisualStyle {
  frameColor: number;
  tankColor: number;
  exhaustColor: number;
  headlightEmissive: number;
  tankScale: readonly [number, number, number];
  hasSportFairing: boolean;
}

export const BIKE_VARIANT_STYLES: Record<BikeId, BikeVariantVisualStyle> = {
  old100: {
    frameColor: 0x1a459c,
    tankColor: 0x00cc44,
    exhaustColor: 0x888888,
    headlightEmissive: 0xffffaa,
    tankScale: [1.0, 1.0, 1.0],
    hasSportFairing: false,
  },
  used125: {
    frameColor: 0x2d3748,
    tankColor: 0xd97706,
    exhaustColor: 0x4a5568,
    headlightEmissive: 0xfff5e6,
    tankScale: [1.12, 1.08, 1.0],
    hasSportFairing: false,
  },
  new150: {
    frameColor: 0x0f172a,
    tankColor: 0x0284c7,
    exhaustColor: 0x1e293b,
    headlightEmissive: 0x38bdf8,
    tankScale: [1.22, 1.15, 1.08],
    hasSportFairing: true,
  },
};

export interface SeatCoverStyle {
  color: number;
  roughness: number;
  metalness: number;
}

export const SEAT_COVER_STYLES: Record<string, SeatCoverStyle> = {
  default: { color: 0x111111, roughness: 0.9, metalness: 0.0 },
  leather: { color: 0x5c2d16, roughness: 0.42, metalness: 0.08 },
  mesh: { color: 0x334155, roughness: 0.96, metalness: 0.04 },
};
