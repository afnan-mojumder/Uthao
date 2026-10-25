import { describe, it, expect } from 'vitest';
import { RideManager } from '../../../src/sim/ride/RideManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { RideRequest } from '../../../src/core/types';

describe('RideManager', () => {
  const bus = new EventBus<GameEvents>();
  const testDistrict = {
    districtId: 'testloop' as const,
    name: { bn: 'টেস্টলুপ', en: 'Test Loop' },
    nodes: [
      { nodeId: 'N1', x: 0, z: 0, kind: 'junction' as const },
      { nodeId: 'N2', x: 50, z: 0, kind: 'junction' as const },
      { nodeId: 'N3', x: 100, z: 0, kind: 'junction' as const },
    ],
    segments: [
      {
        segmentId: 'S1',
        startNodeId: 'N1',
        endNodeId: 'N2',
        width: 10,
        surfaceCondition: 1.0,
        trafficDensity: 0.2,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'main' as const,
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'testloop' as const,
        tags: [],
      },
      {
        segmentId: 'S2',
        startNodeId: 'N2',
        endNodeId: 'N3',
        width: 10,
        surfaceCondition: 1.0,
        trafficDensity: 0.2,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'main' as const,
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'testloop' as const,
        tags: [],
      },
    ],
    pois: [],
  };

  const roadNetwork = RoadNetwork.fromDistricts([testDistrict]);

  const testRequest: RideRequest = {
    requestId: 'req_123',
    passengerId: 'p_nabila',
    pickupNodeId: 'N1',
    destinationNodeId: 'N3',
    initialFare: 100,
    estimatedDistance: 0.3,
    estimatedDuration: 4,
    requestedArrivalTime: null,
    bookingType: 'app',
    status: 'WaitingForPickup',
    surge: 1.0,
  };

  it('arrival requires low speed', () => {
    const manager = new RideManager({ roadNetwork, bus });
    manager.offer(testRequest);
    manager.accept(testRequest.requestId);

    // Bike is close (3m <= 8m), but speed is 10 m/s (>= 2 m/s)
    manager.update({ x: 3, z: 0, speed: 10 }, 1 / 60);
    expect(manager.getActiveRequest()?.status).toBe('WaitingForPickup');

    // Once speed is low (1.5 m/s < 2 m/s)
    manager.update({ x: 3, z: 0, speed: 1.5 }, 1 / 60);
    // In M1 auto-negotiate, transitions through arrivedPickup and starts trip
    expect(manager.getActiveRequest()?.status).toBe('OnTrip');
  });

  it('full lifecycle emits events in order', () => {
    const manager = new RideManager({ roadNetwork, bus });
    const eventLog: string[] = [];

    bus.on('ride/requested', () => eventLog.push('ride/requested'));
    bus.on('ride/accepted', () => eventLog.push('ride/accepted'));
    bus.on('ride/arrivedPickup', () => eventLog.push('ride/arrivedPickup'));
    bus.on('ride/started', () => eventLog.push('ride/started'));
    bus.on('ride/completed', () => eventLog.push('ride/completed'));

    manager.offer(testRequest);
    manager.accept(testRequest.requestId);

    // Arrive at pickup N1 (0, 0) with low speed
    manager.update({ x: 1, z: 0, speed: 1.0 }, 1 / 60);

    // Drive towards destination N3 (100, 0)
    manager.update({ x: 50, z: 0, speed: 10 }, 1 / 60);

    // Arrive at destination N3 with low speed
    manager.update({ x: 99, z: 0, speed: 1.2 }, 1 / 60);

    expect(eventLog).toEqual([
      'ride/requested',
      'ride/accepted',
      'ride/arrivedPickup',
      'ride/started',
      'ride/completed',
    ]);
  });
});
