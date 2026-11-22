import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { SIM_DT } from '../../../src/config/constants';
import { PeopleRenderer } from '../../../src/render/people';
import { InstancedTrafficRenderer } from '../../../src/render/vehicles';
import type { DistrictData } from '../../../src/sim/schemas';
import type { RideRequest } from '../../../src/core/types';
import { bindUi } from '../../../src/ui/bindings';
import {
  bindEventBusToStore,
  negotiationSignal,
  onResumeGameCallback,
  pausedSignal,
  screenSignal,
} from '../../../src/ui/store';
import testloopData from '../../../data/districts/testloop.json';

const NEUTRAL = { throttle: 0, brake: 0, steer: 0 };

function makeOffer(requestId: string, pickupNodeId = 'N1', destinationNodeId = 'N3'): RideRequest {
  return {
    requestId,
    passengerId: `p_${requestId}`,
    passengerNameKey: 'passenger.name.1',
    bookingType: 'app',
    pickupNodeId,
    destinationNodeId,
    pickupPlaceKey: 'poi.test_pickup',
    destinationPlaceKey: 'poi.test_dest',
    initialFare: 80,
    estimatedDistance: 0.3,
    estimatedDuration: 2,
    requestedArrivalTime: null,
    status: 'WaitingForPickup',
    surge: 1,
  };
}

describe('Critical Audit Fixes', () => {
  beforeEach(() => {
    pausedSignal.value = false;
    screenSignal.value = 'game';
  });

  it('C1: Resume clears gm.paused after visibilitychange pause and resetCareerState clears paused/ticks/waypoint', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false });

    const unbindStore = bindEventBusToStore(gm.bus);
    const unbindUi = bindUi(session);

    gm.dispatch({ type: 'pause' });
    pausedSignal.value = true;
    expect(gm.paused).toBe(true);

    onResumeGameCallback?.();
    expect(gm.paused).toBe(false);
    expect(pausedSignal.value).toBe(false);

    gm.dispatch({ type: 'pause' });
    gm.dispatch({ type: 'setWaypoint', nodeId: 'N2' });
    gm.ticks = 50;
    gm.accumulator = 0.05;
    gm.resetCareerState(99);
    expect(gm.paused).toBe(false);
    expect(gm.ticks).toBe(0);
    expect(gm.accumulator).toBe(0);
    expect(gm.waypointNodeId).toBeNull();

    unbindUi();
    unbindStore();
  });

  it('C2: Expiring unrelated queued offer does not cancel boarding walk or MissionManager inRide', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false });

    // Use req_tutorial_01 (always enters boarding walk + pickupHold)
    const activeOffer = makeOffer('req_tutorial_01', 'N1', 'N3');
    session.ride.offer(activeOffer);
    expect(session.ride.accept('req_tutorial_01', undefined, true)).toBe(true);

    const n1 = road.getNode('N1')!;
    session.bike.x = n1.x;
    session.bike.z = n1.z;
    session.bike.speed = 0;
    session.step(NEUTRAL, SIM_DT);

    expect(session.ride.isPickupHold()).toBe(true);

    // Emit an unrelated background offer cancellation
    gm.bus.emit('ride/cancelled', { requestId: 'req_other_bg', by: 'system', reason: 'expired' });

    // Boarding walk must still complete and start the trip (not soft-lock in pickupHold)
    for (let i = 0; i < 120; i++) {
      session.step(NEUTRAL, SIM_DT);
    }
    expect(session.ride.isPickupHold()).toBe(false);
    expect(session.ride.getTripState()).toBe('EnRouteToDestination');

    // Also verify MissionManager keeps inRide=true if an unrelated offer cancels mid-ride
    gm.bus.emit('ride/cancelled', { requestId: 'req_other_bg_2', by: 'system', reason: 'expired' });
    expect((gm.missionManager as unknown as { inRide: boolean }).inRide).toBe(true);
  });

  it('C3: Cancelling a ride during Negotiation closes NegotiationPanel cleanly', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false });
    const unbindStore = bindEventBusToStore(gm.bus);
    const unbindUi = bindUi(session);

    const offer = makeOffer('req_neg', 'N1', 'N3');
    session.ride.offer(offer);
    expect(session.ride.accept('req_neg')).toBe(true);
    expect(session.ride.getTripState()).toBe('Negotiating');
    negotiationSignal.value = {
      active: true,
      session: {
        req: offer,
        status: 'active',
        round: 1,
        maxRounds: 3,
        currentPassengerOffer: 80,
        fairFare: 80,
        minAcceptableFare: 70,
        maxWillingFare: 100,
        currentPatience: 1,
        walkM: 0,
        alleyRefused: false,
      } as unknown as NonNullable<typeof negotiationSignal.value.session>,
      lastResult: null,
      mood: 0.5,
      pickup: null,
      alley: null,
    };
    expect(negotiationSignal.value.active).toBe(true);

    // Cancel active ride externally (e.g. enc_uturn_problem 'cancel' choice)
    session.ride.cancel('req_neg', 'system', 'Encounter cancelled');
    expect(session.ride.getTripState()).toBe('Declined');
    expect(negotiationSignal.value.active).toBe(false);

    unbindUi();
    unbindStore();
  });

  it('C4: Midnight forced shift-end clears pickupHold/dropoffHold/pendingDispute so next day is clean', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false });

    const offer = makeOffer('req_tutorial_01', 'N1', 'N3');
    session.ride.offer(offer);
    session.ride.accept('req_tutorial_01', undefined, true);

    const n1 = road.getNode('N1')!;
    session.bike.x = n1.x;
    session.bike.z = n1.z;
    session.bike.speed = 0;
    session.step(NEUTRAL, SIM_DT);
    expect(session.ride.isPickupHold()).toBe(true);

    // Force midnight shift end
    gm.clock.minutes = 24 * 60;
    const endRes = gm.dispatch({ type: 'endShift' });
    expect(endRes.success).toBe(true);
    expect(session.ride.getTripState()).toBe('Idle');
    expect(session.ride.getActiveRequest()).toBeNull();
    expect(session.ride.isPickupHold()).toBe(false);
    expect(session.ride.isDropoffHold()).toBe(false);

    // Sleep to next day and verify a new ride can be offered and accepted
    const sleepRes = gm.dispatch({ type: 'sleep' });
    expect(sleepRes.success).toBe(true);
    const nextOffer = makeOffer('req_day2', 'N1', 'N3');
    session.ride.offer(nextOffer);
    expect(session.ride.accept('req_day2')).toBe(true);
  });

  it('C5: PeopleRenderer and InstancedTrafficRenderer disable frustumCulled on all InstancedMeshes', () => {
    const people = new PeopleRenderer();
    const peopleInstanced: THREE.InstancedMesh[] = [];
    people.root.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        peopleInstanced.push(obj);
      }
    });
    expect(peopleInstanced.length).toBeGreaterThan(0);
    for (const mesh of peopleInstanced) {
      expect(mesh.frustumCulled).toBe(false);
    }

    const traffic = new InstancedTrafficRenderer();
    const trafficInstanced: THREE.InstancedMesh[] = [];
    traffic.group.traverse((obj) => {
      if (obj instanceof THREE.InstancedMesh) {
        trafficInstanced.push(obj);
      }
    });
    expect(trafficInstanced.length).toBe(3);
    for (const mesh of trafficInstanced) {
      expect(mesh.frustumCulled).toBe(false);
    }
  });
});
