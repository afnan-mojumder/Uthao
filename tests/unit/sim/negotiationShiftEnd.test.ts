import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { RideManager } from '../../../src/sim/ride/RideManager';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { RideRequest } from '../../../src/core/types';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

function requestFor(id: string, pickupNodeId: string, destinationNodeId: string): RideRequest {
  return {
    requestId: id,
    passengerId: `p_${id}`,
    pickupNodeId,
    destinationNodeId,
    initialFare: 100,
    estimatedDistance: 0.5,
    estimatedDuration: 4,
    requestedArrivalTime: null,
    bookingType: 'app',
    status: 'WaitingForPickup',
    surge: 1,
  };
}

describe('negotiation does not survive the shift end', () => {
  it('walks the passenger away at 23:00 so the next day can accept rides again', () => {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 11, mode: 'career', data: {} });
    const ride = new RideManager({ roadNetwork: road, bus: gm.bus });
    ride.enableNegotiation = true;
    gm.rideManager = ride;

    const [pickup, dest] = [road.getAllNodes()[0]!, road.getAllNodes()[1]!];
    const first = requestFor('req_night_1', pickup.nodeId, dest.nodeId);
    ride.offer(first);
    expect(ride.accept(first.requestId)).toBe(true);
    expect(ride.getTripState()).toBe('Negotiating');

    gm.clock.minutes = 23 * 60;
    const res = gm.dispatch({ type: 'endShift' });

    expect(res.success).toBe(true);
    expect(ride.getTripState()).not.toBe('Negotiating');
    expect(ride.getActiveRequest()).toBeNull();

    // Sleep into the new day: a fresh offer must be acceptable again.
    expect(gm.dispatch({ type: 'sleep' }).success).toBe(true);
    const second = requestFor('req_day_2', pickup.nodeId, dest.nodeId);
    ride.offer(second);
    expect(ride.accept(second.requestId)).toBe(true);
    expect(ride.getTripState()).toBe('Negotiating');
  });
});
