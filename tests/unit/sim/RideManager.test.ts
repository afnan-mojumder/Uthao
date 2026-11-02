import { describe, it, expect } from 'vitest';
import { RideManager } from '../../../src/sim/ride/RideManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { RideRequest } from '../../../src/core/types';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

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
    expect(manager.getTripState()).toBe('EnRouteToPickup');

    // Once speed is low (1.5 m/s < 2 m/s)
    manager.update({ x: 3, z: 0, speed: 1.5 }, 1 / 60);
    // Negotiation already happened (auto-accepted before pickup), so arrival starts the trip
    expect(manager.getTripState()).toBe('EnRouteToDestination');
    expect(manager.getActiveRequest()?.status).toBe('OnTrip'); // legacy mapping
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


describe('RideManager settlement (T8.2)', () => {
  function liveSession() {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 7, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false });
    const [pickup, dest] = [road.getAllNodes()[0]!, road.getAllNodes()[1]!];
    const req: RideRequest = {
      requestId: 'req_2_1',
      passengerId: 'p_t',
      pickupNodeId: pickup.nodeId,
      destinationNodeId: dest.nodeId,
      initialFare: 120,
      estimatedDistance: 0.5,
      estimatedDuration: 3,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    };
    const at = (n: { x: number; z: number }) => {
      session.bike.x = n.x;
      session.bike.z = n.z;
      session.bike.speed = 0;
      session.step({ throttle: 0, brake: 0, steer: 0 });
    };
    return { session, gm, req, pickup, dest, at };
  }

  it('a completed live ride changes cash and uses real day, minute and rating', () => {
    const { session, gm, req, pickup, dest, at } = liveSession();
    gm.clock.day = 3;
    const cash0 = gm.economyManager.cash;
    const direct: unknown[] = [];
    gm.bus.on('economy/transaction', (e) => direct.push(e));
    session.ride.offer(req);
    session.ride.accept(req.requestId);
    at(pickup);
    at(dest);

    const rows = gm.economyManager.ledgerFor('req_2_1');
    expect(rows.length).toBeGreaterThan(1); // one row per component, not a single net row
    expect(rows.every((t) => t.day === 3)).toBe(true);
    expect(rows.find((t) => t.kind === 'fare')!.amount).toBe(120);
    expect(gm.economyManager.cash).not.toBe(cash0);
    // Cash moved only by ledger rows (a mission may add its own reward row).
    const all = gm.economyManager.getLedger();
    expect(gm.economyManager.cash).toBe(cash0 + all.reduce((a, t) => a + t.amount, 0));
    expect(direct).toHaveLength(all.length); // every tx came through EconomyManager.post
    expect(gm.reputationSystem.getRatingsHistory().at(-1)).toBe(5);
  });

  it('a rough ride rates below 5', () => {
    const { session, gm, req, pickup, dest, at } = liveSession();
    let rating: number | null = 5;
    gm.bus.on('ride/completed', (e) => (rating = e.receipt.rating));
    session.ride.offer(req);
    session.ride.accept(req.requestId);
    at(pickup);
    gm.bus.emit('bike/collision', { severity: 'bump', relSpeedKmh: 12 });
    gm.bus.emit('bike/collision', { severity: 'bump', relSpeedKmh: 12 });
    at(dest);
    expect(rating).toBeLessThan(5);
    expect(gm.reputationSystem.getRatingsHistory().at(-1)).toBeLessThan(5);
  });

  it('a bump before pickup does not count against the trip', () => {
    const { session, gm, req, pickup, dest, at } = liveSession();
    let rating: number | null = null;
    gm.bus.on('ride/completed', (e) => (rating = e.receipt.rating));
    session.ride.offer(req);
    session.ride.accept(req.requestId);
    gm.bus.emit('bike/collision', { severity: 'bump', relSpeedKmh: 12 });
    at(pickup);
    at(dest);
    expect(rating).toBe(5);
  });

  it('a request already settled is never paid or announced again', () => {
    const { session, gm, req, pickup, dest, at } = liveSession();
    gm.economyManager.restoreLedger([], ['req_2_1']);
    const cash0 = gm.economyManager.cash;
    const completed: unknown[] = [];
    gm.bus.on('ride/completed', (e) => completed.push(e));
    session.ride.offer(req);
    session.ride.accept(req.requestId);
    at(pickup);
    at(dest);
    expect(gm.economyManager.cash).toBe(cash0);
    expect(completed).toHaveLength(0);
    expect(session.ride.getTripState()).toBe('Idle');
  });
});
