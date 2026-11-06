// Which traffic kinds get their own mesh, and what colour each one is.
// Pure data, so the coverage rule can be unit tested without WebGL.

import type { TrafficVehicleKind } from '../sim/traffic/TrafficManager';

export const VEHICLE_COLOR: Record<TrafficVehicleKind, number> = {
  car: 0x2563eb,
  bus: 0xdc2626,
  minibus: 0xf59e0b,
  truck: 0x78716c,
  delivery_van: 0xe5e7eb,
  cng: 0x0ea5e9,
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
