import { describe, it, expect, beforeEach } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { DeliveryManager } from '../../../src/sim/delivery/DeliveryManager';
import { EconomyManager } from '../../../src/sim/economy/EconomyManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import type { DeliveryJob } from '../../../src/core/types';
import type { DistrictData } from '../../../src/sim/schemas';
import mirparaData from '../../../data/districts/mirpara.json';
import { SIM_DT } from '../../../src/config/constants';
import { TIME_SCALE } from '../../../src/core/clock';

describe('T5.8 Delivery jobs and logistics', () => {
  let bus: EventBus<GameEvents>;
  let economy: EconomyManager;
  let deliveryManager: DeliveryManager;

  const sampleFragileJob: DeliveryJob = {
    id: 'deliv_pharmacy_01',
    senderNameKey: 'poi.mirpara.pharmacy',
    pickupPoiId: 'poi_mirpara_pharmacy',
    pickupNodeId: 'res_n1_2',
    dropoffNodeId: 'res_n2_0',
    itemType: 'medicine',
    fragile: true,
    basePayout: 250,
    timeLimitMinutes: 20,
    status: 'offered',
  };

  const sampleStandardJob: DeliveryJob = {
    id: 'deliv_document_02',
    senderNameKey: 'poi.mirpara.tea_stall',
    pickupPoiId: 'poi_mirpara_tea_stall',
    pickupNodeId: 'res_n2_1',
    dropoffNodeId: 'res_n3_0',
    itemType: 'document',
    fragile: false,
    basePayout: 150,
    timeLimitMinutes: 25,
    status: 'offered',
  };

  beforeEach(() => {
    bus = new EventBus<GameEvents>();
    economy = new EconomyManager(bus, { cash: 500 });
    deliveryManager = new DeliveryManager({ bus, economyManager: economy });
  });

  it('fragile parcel damaged on bump', () => {
    deliveryManager.offer(sampleFragileJob);
    deliveryManager.accept('deliv_pharmacy_01', 10);
    deliveryManager.pickup('deliv_pharmacy_01', 12);

    const active = deliveryManager.activeDeliveries.get('deliv_pharmacy_01');
    expect(active?.status).toBe('in_transit');
    expect(active?.damaged).toBeUndefined();

    // Trigger bump collision
    bus.emit('bike/collision', {
      severity: 'bump',
      relSpeedKmh: 18,
    });

    expect(active?.damaged).toBe(true);
    expect(active?.damagePenalty).toBe(150); // 60% of 250

    // Complete delivery with damage deduction
    const result = deliveryManager.complete('deliv_pharmacy_01', 20, 1);
    expect(result.success).toBe(true);
    expect(result.damageDeduction).toBe(150);
    expect(result.payout).toBe(100); // 250 - 150 = 100
  });

  it('standard parcel not damaged on bump', () => {
    deliveryManager.offer(sampleStandardJob);
    deliveryManager.accept('deliv_document_02', 10);
    deliveryManager.pickup('deliv_document_02', 12);

    bus.emit('bike/collision', {
      severity: 'bump',
      relSpeedKmh: 20,
    });

    const active = deliveryManager.activeDeliveries.get('deliv_document_02');
    expect(active?.damaged).toBeFalsy();

    const result = deliveryManager.complete('deliv_document_02', 20, 1);
    expect(result.success).toBe(true);
    expect(result.damageDeduction).toBe(0);
    expect(result.payout).toBe(150);
  });

  it('delivery pays via EconomyManager', () => {
    const initialCash = economy.cash; // 500
    deliveryManager.offer(sampleStandardJob);
    deliveryManager.accept('deliv_document_02', 10);
    deliveryManager.pickup('deliv_document_02', 12);

    const res = deliveryManager.complete('deliv_document_02', 22, 1);
    expect(res.success).toBe(true);
    expect(res.payout).toBe(150);

    // Verify cash and revenue updated in EconomyManager
    expect(economy.cash).toBe(initialCash + 150);
    expect(economy.dailyRevenue).toBe(150);
  });

  it('luggage carrier upgrade increases parcel carrying capacity from 1 to 3', () => {
    expect(deliveryManager.getMaxCapacity()).toBe(1);

    const job1: DeliveryJob = { ...sampleStandardJob, id: 'j1' };
    const job2: DeliveryJob = { ...sampleStandardJob, id: 'j2' };
    const job3: DeliveryJob = { ...sampleStandardJob, id: 'j3' };
    const job4: DeliveryJob = { ...sampleStandardJob, id: 'j4' };

    deliveryManager.offer(job1);
    deliveryManager.offer(job2);
    deliveryManager.offer(job3);
    deliveryManager.offer(job4);

    // Accept first job
    expect(deliveryManager.accept('j1').success).toBe(true);

    // Second job fails: luggage full
    const fullRes = deliveryManager.accept('j2');
    expect(fullRes.success).toBe(false);
    expect(fullRes.reason).toBe('Luggage capacity full');

    // Purchase luggage carrier upgrade
    economy.ownedUpgrades.push('upgrade_luggage_carrier');
    expect(deliveryManager.getMaxCapacity()).toBe(3);

    // Now accepts jobs 2 and 3
    expect(deliveryManager.accept('j2').success).toBe(true);
    expect(deliveryManager.accept('j3').success).toBe(true);

    // Fourth job exceeds upgraded capacity
    expect(deliveryManager.accept('j4').success).toBe(false);
  });

  it('deducts late penalty if delivered after time window deadline', () => {
    deliveryManager.offer(sampleStandardJob);
    deliveryManager.accept('deliv_document_02', 10);
    // Picked up at minute 10, deadline is 10 + 25 = 35
    deliveryManager.pickup('deliv_document_02', 10);

    // Delivered late at minute 40 (5 minutes late)
    const result = deliveryManager.complete('deliv_document_02', 40, 1);
    expect(result.success).toBe(true);
    // 5 min * 5 = 25 penalty
    expect(result.payout).toBe(150 - 25);
  });

  it('GameManager dispatches delivery commands cleanly', () => {
    const gm = new GameManager({ seed: 101, mode: 'career', data: {} });
    gm.deliveryManager.offer(sampleFragileJob);

    // 1. Accept
    const acceptRes = gm.dispatch({ type: 'acceptDelivery', deliveryId: 'deliv_pharmacy_01' });
    expect(acceptRes.success).toBe(true);

    // 2. Pickup
    const pickupRes = gm.dispatch({ type: 'pickupDelivery', deliveryId: 'deliv_pharmacy_01' });
    expect(pickupRes.success).toBe(true);

    // 3. Complete
    const startCash = gm.economy.cash;
    const completeRes = gm.dispatch({ type: 'completeDelivery', deliveryId: 'deliv_pharmacy_01' });
    expect(completeRes.success).toBe(true);
    expect(gm.economy.cash).toBe(startCash + 250);
  });

  it('P4.2 buying upgrade_luggage_carrier unlocks parcel delivery offers and acceptDelivery uses jobId', () => {
    const road = RoadNetwork.fromDistricts([mirparaData as DistrictData]);
    const gm = new GameManager({ seed: 202, mode: 'career', data: {} });
    gm.economyManager.cash = 2000;
    const session = new GameSession({ gm, road, autoRequests: true });
    session.spawnAtHome();

    // Without upgrade_luggage_carrier, no parcel delivery offers are unlocked/generated
    const steps30Min = Math.ceil((30 * 60) / (SIM_DT * TIME_SCALE));
    for (let i = 0; i < steps30Min; i++) {
      session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    }
    expect(gm.deliveryManager.getAvailableJobs()).toHaveLength(0);

    // Buy upgrade_luggage_carrier -> unlocks parcel delivery offers
    const upgRes = gm.dispatch({ type: 'buyUpgrade', upgradeId: 'upgrade_luggage_carrier' });
    expect(upgRes.success).toBe(true);

    for (let i = 0; i < steps30Min && gm.deliveryManager.getAvailableJobs().length === 0; i++) {
      session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    }
    const jobs = gm.deliveryManager.getAvailableJobs();
    expect(jobs.length).toBeGreaterThan(0);

    const job = jobs[0]!;
    const acceptRes = gm.dispatch({ type: 'acceptDelivery', jobId: job.id });
    expect(acceptRes.success).toBe(true);
    expect(gm.deliveryManager.getActiveJobs().some((j) => j.id === job.id)).toBe(true);

    // Driving to pickup then dropoff completes the delivery and pays out
    const pickupNode = road.getNode(job.pickupNodeId)!;
    session.bike.x = pickupNode.x;
    session.bike.z = pickupNode.z;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    expect(gm.deliveryManager.activeDeliveries.get(job.id)?.status).toBe('in_transit');

    const cashBefore = gm.economyManager.cash;
    const dropoffNode = road.getNode(job.dropoffNodeId)!;
    session.bike.x = dropoffNode.x;
    session.bike.z = dropoffNode.z;
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    expect(gm.deliveryManager.completedDeliveries.some((j) => j.id === job.id)).toBe(true);
    expect(gm.economyManager.cash).toBeGreaterThan(cashBefore);
  });
});
