import type { EventBus, GameEvents } from '../../core/events';
import type { DeliveryJob } from '../../core/types';
import type { EconomyManager } from '../economy/EconomyManager';

export interface DeliveryManagerOptions {
  bus: EventBus<GameEvents>;
  economyManager: EconomyManager;
}

export class DeliveryManager {
  private readonly bus: EventBus<GameEvents>;
  private readonly economyManager: EconomyManager;

  readonly offeredDeliveries: Map<string, DeliveryJob> = new Map();
  readonly activeDeliveries: Map<string, DeliveryJob> = new Map();
  readonly completedDeliveries: DeliveryJob[] = [];
  partnershipActive = false;

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
    return this.economyManager.hasUpgrade('upgrade_luggage_carrier') ? 3 : 1;
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
    job.pickupDeadlineMinute = currentMinute + 15;
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
