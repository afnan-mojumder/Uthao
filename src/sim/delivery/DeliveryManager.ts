import type { EventBus, GameEvents } from '../../core/events';
import type { DeliveryJob } from '../../core/types';
import type { Rng } from '../../core/rng';
import type { RoadNetwork } from '../road/RoadNetwork';
import type { EconomyManager } from '../economy/EconomyManager';
import { nearestPlaceKey } from '../ride/rideView';
import { TIME_SCALE } from '../../core/clock';

function travelGameMinutes(distanceM: number, bufferRealSec = 10): number {
  return ((distanceM / 10.5 + bufferRealSec) * TIME_SCALE) / 60;
}

const DELIVERY_SENDER_KINDS = new Set([
  'pharmacy',
  'market',
  'teaStall',
  'officeGate',
  'apartment',
  'bistro',
]);
const DELIVERY_ITEM_TYPES: DeliveryJob['itemType'][] = [
  'food',
  'document',
  'medicine',
  'fragile_electronics',
  'parcel',
];
const DELIVERY_ARRIVAL_RADIUS_SQ = 15 * 15;
const MAX_OFFERED_DELIVERIES = 3;

export interface DeliveryManagerOptions {
  bus: EventBus<GameEvents>;
  economyManager: EconomyManager;
}

export interface DeliverySnapshot {
  offeredDeliveries: DeliveryJob[];
  activeDeliveries: DeliveryJob[];
  completedDeliveries?: DeliveryJob[];
  partnershipActive?: boolean;
  jobSeq?: number;
}

export class DeliveryManager {
  private readonly bus: EventBus<GameEvents>;
  private readonly economyManager: EconomyManager;

  readonly offeredDeliveries: Map<string, DeliveryJob> = new Map();
  readonly activeDeliveries: Map<string, DeliveryJob> = new Map();
  readonly completedDeliveries: DeliveryJob[] = [];
  partnershipActive = false;
  private jobSeq = 0;

  constructor(opts: DeliveryManagerOptions) {
    this.bus = opts.bus;
    this.economyManager = opts.economyManager;

    // Listen for collisions: fragile parcels get damaged on bump or crash!
    this.bus.on('bike/collision', (ev) => {
      if (ev.severity === 'bump' || ev.severity === 'crash') {
        this.onCollision(ev.severity);
      }
    });
  }

  /**
   * Maximum simultaneous delivery parcels Rafi can carry.
   * 1 standard, or 3 with the heavy-duty luggage carrier upgrade.
   */
  getMaxCapacity(): number {
    return this.isUnlocked() ? 3 : 1;
  }

  /** Parcel delivery offers unlock once the heavy-duty luggage carrier is installed. */
  isUnlocked(): boolean {
    return this.economyManager.hasUpgrade('upgrade_luggage_carrier');
  }

  reset(): void {
    this.offeredDeliveries.clear();
    this.activeDeliveries.clear();
    this.completedDeliveries.length = 0;
    this.jobSeq = 0;
  }

  /**
   * Generates and offers a parcel delivery job from the road network when
   * `upgrade_luggage_carrier` is owned. Returns null if locked, at offer cap,
   * or no valid route exists.
   */
  generateOffer(
    road: RoadNetwork,
    rng: Rng,
    day: number,
    opts?: {
      playerPos?: { x: number; z: number };
      unlockedDistricts?: readonly string[];
    }
  ): DeliveryJob | null {
    if (!this.isUnlocked()) return null;
    if (this.offeredDeliveries.size >= MAX_OFFERED_DELIVERIES) return null;

    const allNodes = road.getAllNodes();
    if (allNodes.length < 2) return null;

    const unlockedSet =
      opts?.unlockedDistricts && opts.unlockedDistricts.length > 0
        ? new Set(opts.unlockedDistricts)
        : null;
    const nodes = unlockedSet
      ? allNodes.filter((n) => {
          const d = road.getNodeDistrict(n.nodeId);
          return !d || unlockedSet.has(d);
        })
      : allNodes;
    const candidateNodes = nodes.length >= 2 ? nodes : allNodes;

    const pois = road.getPois().filter((p) => {
      if (!road.getNode(p.nodeId)) return false;
      if (!unlockedSet) return true;
      const d = road.getNodeDistrict(p.nodeId);
      return !d || unlockedSet.has(d);
    });
    const senderPois = pois.filter((p) => DELIVERY_SENDER_KINDS.has(p.kind));
    const playerPos = opts?.playerPos;
    const nearbySenderPois = playerPos
      ? senderPois.filter((p) => {
          const n = road.getNode(p.nodeId);
          return n ? Math.hypot(n.x - playerPos.x, n.z - playerPos.z) <= 750 : false;
        })
      : [];
    const fallbackPois =
      nearbySenderPois.length > 0
        ? nearbySenderPois
        : senderPois.length > 0
          ? senderPois
          : pois;

    for (let attempt = 0; attempt < 15; attempt++) {
      const pickupPoi = fallbackPois.length > 0 ? rng.pick(fallbackPois) : null;
      const pickupNodeId = pickupPoi ? pickupPoi.nodeId : rng.pick(candidateNodes).nodeId;
      const dropoffNode = rng.pick(candidateNodes);
      if (dropoffNode.nodeId === pickupNodeId) continue;

      const route = road.route(pickupNodeId, dropoffNode.nodeId, { mode: 'motorcycle' });
      if (!route || route.nodeIds.length < 2) continue;
      if (!road.route(dropoffNode.nodeId, pickupNodeId, { mode: 'motorcycle' })) continue;

      const itemType = rng.pick(DELIVERY_ITEM_TYPES);
      const fragile = itemType === 'medicine' || itemType === 'fragile_electronics';
      const basePayout = Math.max(80, Math.round((80 + route.virtualKm * 35) / 5) * 5);
      const timeLimitMinutes = Math.max(
        45,
        Math.ceil(travelGameMinutes(route.lengthM, 10) * 1.8 + 15)
      );
      const pickupNodeObj = road.getNode(pickupNodeId);
      const pickupDistM =
        playerPos && pickupNodeObj
          ? Math.hypot(pickupNodeObj.x - playerPos.x, pickupNodeObj.z - playerPos.z)
          : 400;
      const pickupTimeLimitMinutes = Math.max(
        45,
        Math.ceil(travelGameMinutes(pickupDistM, 12) * 1.8 + 15)
      );
      const pickupPlaceKey = nearestPlaceKey({ roadNetwork: road }, pickupNodeId) || undefined;
      const dropoffPlaceKey = nearestPlaceKey({ roadNetwork: road }, dropoffNode.nodeId) || undefined;

      const job: DeliveryJob = {
        id: `deliv_${day}_${++this.jobSeq}`,
        senderNameKey: pickupPoi?.nameKey ?? 'poi.mirpara.bazaar',
        pickupPoiId: pickupPoi?.id ?? pickupNodeId,
        pickupNodeId,
        dropoffNodeId: dropoffNode.nodeId,
        pickupPlaceKey,
        dropoffPlaceKey,
        itemType,
        fragile,
        basePayout,
        timeLimitMinutes,
        pickupTimeLimitMinutes,
        status: 'offered',
      };
      this.offer(job);
      return job;
    }

    return null;
  }

  /** Expires accepted deliveries whose pickup deadline has passed (allocation-free). */
  expireOverdue(currentMinute: number): void {
    if (this.activeDeliveries.size === 0) return;

    for (const job of this.activeDeliveries.values()) {
      if (
        job.status === 'accepted' &&
        job.pickupDeadlineMinute !== undefined &&
        currentMinute > job.pickupDeadlineMinute
      ) {
        job.status = 'failed';
        this.activeDeliveries.delete(job.id);
        this.bus.emit('delivery/expired', {
          deliveryId: job.id,
          reason: 'Pickup deadline expired',
        });
      }
    }
  }

  /** Clears unaccepted offers and fails active jobs cleanly when a shift ends. */
  endShiftCleanup(): void {
    this.offeredDeliveries.clear();
    if (this.activeDeliveries.size === 0) return;

    for (const job of this.activeDeliveries.values()) {
      job.status = 'failed';
      this.activeDeliveries.delete(job.id);
      this.bus.emit('delivery/expired', {
        deliveryId: job.id,
        reason: 'Shift ended before delivery completed',
      });
    }
  }

  getSnapshot(): DeliverySnapshot {
    return {
      offeredDeliveries: Array.from(this.offeredDeliveries.values(), (j) => ({ ...j })),
      activeDeliveries: Array.from(this.activeDeliveries.values(), (j) => ({ ...j })),
      completedDeliveries: this.completedDeliveries.map((j) => ({ ...j })),
      partnershipActive: this.partnershipActive,
      jobSeq: this.jobSeq,
    };
  }

  restoreSnapshot(snap?: DeliverySnapshot): void {
    this.offeredDeliveries.clear();
    this.activeDeliveries.clear();
    this.completedDeliveries.length = 0;
    this.partnershipActive = snap?.partnershipActive ?? false;
    this.jobSeq = snap?.jobSeq ?? 0;

    if (!snap) return;
    for (const job of snap.offeredDeliveries ?? []) {
      this.offeredDeliveries.set(job.id, { ...job, status: 'offered' });
    }
    for (const job of snap.activeDeliveries ?? []) {
      this.activeDeliveries.set(job.id, { ...job });
    }
    for (const job of snap.completedDeliveries ?? []) {
      this.completedDeliveries.push({ ...job });
    }
  }

  /** Advances accepted/in-transit deliveries when the bike reaches pickup or dropoff. */
  updateProximity(
    x: number,
    z: number,
    road: RoadNetwork,
    currentMinute: number,
    day: number
  ): void {
    if (this.activeDeliveries.size === 0) return;
    this.expireOverdue(currentMinute);
    if (this.activeDeliveries.size === 0) return;

    for (const job of this.activeDeliveries.values()) {
      if (job.status === 'accepted') {
        const pickup = road.getNode(job.pickupNodeId);
        if (!pickup) continue;
        const dx = pickup.x - x;
        const dz = pickup.z - z;
        if (dx * dx + dz * dz <= DELIVERY_ARRIVAL_RADIUS_SQ) {
          this.pickup(job.id, currentMinute);
        }
      } else if (job.status === 'in_transit') {
        const dropoff = road.getNode(job.dropoffNodeId);
        if (!dropoff) continue;
        const dx = dropoff.x - x;
        const dz = dropoff.z - z;
        if (dx * dx + dz * dz <= DELIVERY_ARRIVAL_RADIUS_SQ) {
          this.complete(job.id, currentMinute, day);
        }
      }
    }
  }

  offer(job: DeliveryJob): void {
    this.offeredDeliveries.set(job.id, { ...job, status: 'offered' });
    this.bus.emit('delivery/offered', { delivery: job });
  }

  accept(deliveryId: string, currentMinute = 0): { success: boolean; reason?: string } {
    const job = this.offeredDeliveries.get(deliveryId);
    if (!job) {
      return { success: false, reason: 'Delivery not found' };
    }

    if (this.activeDeliveries.size >= this.getMaxCapacity()) {
      return { success: false, reason: 'Luggage capacity full' };
    }

    job.status = 'accepted';
    job.pickupDeadlineMinute = currentMinute + (job.pickupTimeLimitMinutes ?? 15);
    this.offeredDeliveries.delete(deliveryId);
    this.activeDeliveries.set(deliveryId, job);

    this.bus.emit('delivery/accepted', { deliveryId });
    return { success: true };
  }

  pickup(deliveryId: string, currentMinute = 0): { success: boolean; reason?: string } {
    const job = this.activeDeliveries.get(deliveryId);
    if (!job) {
      return { success: false, reason: 'Delivery not accepted' };
    }
    if (job.status !== 'accepted') {
      return { success: false, reason: `Invalid status: ${job.status}` };
    }
    if (job.pickupDeadlineMinute !== undefined && currentMinute > job.pickupDeadlineMinute) {
      job.status = 'failed';
      this.activeDeliveries.delete(deliveryId);
      this.bus.emit('delivery/expired', {
        deliveryId: job.id,
        reason: 'Pickup deadline expired',
      });
      return { success: false, reason: 'Pickup deadline expired' };
    }

    job.status = 'in_transit';
    job.dropoffDeadlineMinute = currentMinute + job.timeLimitMinutes;

    this.bus.emit('delivery/pickedUp', { deliveryId });
    return { success: true };
  }

  complete(
    deliveryId: string,
    currentMinute = 0,
    day = 1
  ): { success: boolean; payout: number; damageDeduction: number; reason?: string } {
    const job = this.activeDeliveries.get(deliveryId);
    if (!job) {
      return { success: false, payout: 0, damageDeduction: 0, reason: 'Delivery not in transit' };
    }
    if (job.status !== 'in_transit') {
      return { success: false, payout: 0, damageDeduction: 0, reason: `Invalid status: ${job.status}` };
    }

    let payout = job.basePayout;
    let damageDeduction = 0;

    // Damage penalty if damaged during transit
    if (job.damaged) {
      damageDeduction = job.damagePenalty ?? Math.round(job.basePayout * 0.6);
      payout = Math.max(0, payout - damageDeduction);
    }

    // Late penalty if delivered past dropoff deadline
    if (job.dropoffDeadlineMinute !== undefined && currentMinute > job.dropoffDeadlineMinute) {
      const lateMinutes = currentMinute - job.dropoffDeadlineMinute;
      const latePenalty = Math.min(Math.round(job.basePayout * 0.3), Math.round(lateMinutes * 5));
      payout = Math.max(0, payout - latePenalty);
    }

    // Award delivery payment through EconomyManager post
    if (payout > 0) {
      this.economyManager.post({
        id: `tx_deliv_${job.id}_${day}_${Math.floor(currentMinute)}`,
        day,
        minute: currentMinute,
        kind: 'delivery',
        amount: payout,
      });
    }

    job.status = 'delivered';
    this.activeDeliveries.delete(deliveryId);
    this.completedDeliveries.push(job);

    this.bus.emit('delivery/completed', {
      deliveryId,
      payout,
      damageDeduction,
    });

    return { success: true, payout, damageDeduction };
  }

  onCollision(severity: 'bump' | 'crash'): void {
    for (const job of this.activeDeliveries.values()) {
      if (job.status === 'in_transit' && job.fragile && !job.damaged) {
        job.damaged = true;
        job.damagePenalty = Math.round(job.basePayout * 0.6);
        this.bus.emit('delivery/damaged', {
          deliveryId: job.id,
          reason: `Parcel damaged in bike ${severity}`,
        });
      }
    }
  }

  getAvailableJobs(): DeliveryJob[] {
    return Array.from(this.offeredDeliveries.values());
  }

  getActiveJobs(): DeliveryJob[] {
    return Array.from(this.activeDeliveries.values());
  }
}
