import { describe, it, expect } from 'vitest';
import { RideManager } from '../../../src/sim/ride/RideManager';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { PassengerProfile, RideRequest } from '../../../src/core/types';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { generateProfile } from '../../../src/sim/passenger/profiles';
import { Rng } from '../../../src/core/rng';
import { SIM_DT } from '../../../src/config/constants';
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
    const session = new GameSession({ gm, road, autoRequests: false, negotiation: false });
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

describe('P4.1 RideManager lifecycle, reputation, offer queue & dialogue wiring', () => {
  function makeLive(negotiation = true) {
    const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
    const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
    const session = new GameSession({ gm, road, autoRequests: false, negotiation });
    const [pickup, dest] = [road.getAllNodes()[0]!, road.getAllNodes()[1]!];
    return { road, gm, session, pickup, dest };
  }

  it('emits ride/accepted ONLY after fare agreement and does not drain battery during negotiation', () => {
    const { gm, session, pickup, dest } = makeLive(true);
    let acceptedCount = 0;
    gm.bus.on('ride/accepted', () => acceptedCount++);

    const req: RideRequest = {
      requestId: 'req_neg_battery',
      passengerId: 'p_bat',
      pickupNodeId: pickup.nodeId,
      destinationNodeId: dest.nodeId,
      initialFare: 100,
      estimatedDistance: 0.5,
      estimatedDuration: 3,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    };

    const batteryBefore = gm.economyManager.phoneBattery;
    session.ride.offer(req);
    expect(session.ride.accept(req.requestId)).toBe(true);
    expect(session.ride.getTripState()).toBe('Negotiating');
    // Must NOT emit ride/accepted or start navigating while negotiating
    expect(acceptedCount).toBe(0);
    expect(gm.isNavigating).toBe(false);

    // Stand still for 2 real minutes (40 game minutes) negotiating: battery must not drain
    for (let i = 0; i < 60 * 120; i++) {
      session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);
    }
    expect(gm.economyManager.phoneBattery).toBe(batteryBefore);

    // Agree fare -> NOW ride/accepted emits and navigation starts
    session.ride.agreeFare(110);
    expect(acceptedCount).toBe(1);
    expect(gm.isNavigating).toBe(true);
  });

  it('clears ReputationSystem activeTrip cleanly on cancel and fail', () => {
    const { gm, session, pickup, dest } = makeLive(false);
    const makeReq = (id: string): RideRequest => ({
      requestId: id,
      passengerId: `p_${id}`,
      pickupNodeId: pickup.nodeId,
      destinationNodeId: dest.nodeId,
      initialFare: 100,
      estimatedDistance: 0.5,
      estimatedDuration: 3,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    });

    // 1. Cancel while onboard
    session.ride.offer(makeReq('req_cancel_active'));
    session.ride.accept('req_cancel_active');
    session.ride.update({ x: pickup.x, z: pickup.z, speed: 0 }, SIM_DT);
    expect(gm.reputationSystem.getActiveTrip()?.requestId).toBe('req_cancel_active');

    session.ride.cancel('req_cancel_active', 'rider', 'test');
    expect(gm.reputationSystem.getActiveTrip()).toBeNull();

    // 2. Fail mid-trip (e.g. blocked with no route)
    session.ride.offer(makeReq('req_fail_active'));
    session.ride.accept('req_fail_active');
    session.ride.update({ x: pickup.x, z: pickup.z, speed: 0 }, SIM_DT);
    expect(gm.reputationSystem.getActiveTrip()?.requestId).toBe('req_fail_active');

    // Close all segments on the network so rerouteIfBlocked cannot detour around the loop and triggers failNoRoute
    const routeSegs = [...(session.ride.currentRoute?.segmentIds ?? [])];
    for (const seg of session.road.getAllSegments()) gm.roadEvents.closeSegment(seg.segmentId, 60);
    if (routeSegs.length > 0) {
      session.ride.rerouteIfBlocked(routeSegs[0]!);
      expect(session.ride.getTripState()).toBe('Failed');
      expect(gm.reputationSystem.getActiveTrip()).toBeNull();
    }
  });

  it('wires isCareful (double near-miss penalty) and recordLateness() on urgent trips', () => {
    const { gm, session, pickup, dest } = makeLive(false);

    // 1. Careful passenger gets 2x near-miss penalty (-0.6 instead of -0.3 per near-miss)
    const carefulProfile = generateProfile('careful', new Rng(10), 'p_careful_1');
    session.requests.setProfile(carefulProfile);
    const carefulReq: RideRequest = {
      requestId: 'req_careful_1',
      passengerId: carefulProfile.passengerId,
      pickupNodeId: pickup.nodeId,
      destinationNodeId: dest.nodeId,
      initialFare: 100,
      estimatedDistance: 0.5,
      estimatedDuration: 3,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    };

    let carefulRating: number | null = null;
    const unsub = gm.bus.on('ride/completed', (e) => {
      carefulRating = e.receipt.rating;
    });
    session.ride.offer(carefulReq);
    session.ride.accept(carefulReq.requestId);
    session.ride.update({ x: pickup.x, z: pickup.z, speed: 0 }, SIM_DT);
    expect(gm.reputationSystem.getActiveTrip()?.isCareful).toBe(true);
    gm.bus.emit('bike/nearMiss', { distanceM: 0.8, speedKmh: 30 });
    session.ride.update({ x: dest.x, z: dest.z, speed: 0 }, SIM_DT);
    expect(carefulRating).toBe(4.4);
    unsub();

    // 2. Urgent passenger arriving late receives lateness penalty via recordLateness()
    const urgentProfile: PassengerProfile = generateProfile('urgent', new Rng(11), 'p_urgent_1');
    session.requests.setProfile(urgentProfile);
    gm.clock.minutes = 600;
    const urgentReq: RideRequest = {
      requestId: 'req_urgent_1',
      passengerId: urgentProfile.passengerId,
      pickupNodeId: pickup.nodeId,
      destinationNodeId: dest.nodeId,
      initialFare: 120,
      estimatedDistance: 0.5,
      estimatedDuration: 3,
      requestedArrivalTime: 605, // due at 605
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
      specialCircumstance: 'urgent',
    };

    let urgentRating: number | null = null;
    gm.bus.on('ride/completed', (e) => {
      urgentRating = e.receipt.rating;
    });
    session.ride.offer(urgentReq);
    session.ride.accept(urgentReq.requestId);
    session.ride.update({ x: pickup.x, z: pickup.z, speed: 0 }, SIM_DT);
    gm.clock.minutes = 615; // 10 minutes late -> -0.5 * (10/5) = -1.0
    session.ride.update({ x: dest.x, z: dest.z, speed: 0 }, SIM_DT);
    expect(urgentRating).toBe(4.0);
  });

  it('caps RideManager offer queue at 3 and expires stale offers cleanly', () => {
    const { gm, session, pickup, dest } = makeLive(false);
    const cancelled: Array<{ requestId: string; reason: string }> = [];
    gm.bus.on('ride/cancelled', (e) => cancelled.push({ requestId: e.requestId, reason: e.reason }));

    const makeReq = (id: string): RideRequest => ({
      requestId: id,
      passengerId: `p_${id}`,
      pickupNodeId: pickup.nodeId,
      destinationNodeId: dest.nodeId,
      initialFare: 100,
      estimatedDistance: 0.5,
      estimatedDuration: 3,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    });

    session.ride.offer(makeReq('q1'));
    session.ride.offer(makeReq('q2'));
    session.ride.offer(makeReq('q3'));
    session.ride.offer(makeReq('q4'));

    const queuedIds = session.ride.getOfferedRequests().map((r) => r.requestId);
    expect(queuedIds).toHaveLength(3);
    expect(queuedIds).toEqual(['q2', 'q3', 'q4']);
    expect(cancelled.some((c) => c.requestId === 'q1')).toBe(true);

    // Advance 16 seconds without accepting -> remaining offers expire and FSM returns to Idle
    for (let i = 0; i < 16 * 60; i++) {
      session.ride.update({ x: pickup.x, z: pickup.z, speed: 0 }, SIM_DT);
    }
    expect(session.ride.getOfferedRequests()).toHaveLength(0);
    expect(session.ride.getTripState()).toBe('Idle');
  });

  it('uses real passenger archetype, live relationship level, and nameKey for ride dialogue', () => {
    const { gm, session, pickup, dest } = makeLive(false);
    const dialogues: Array<{ key: string; phase: string; speaker?: string }> = [];
    gm.bus.on('passenger/dialogue', (e) => dialogues.push({ key: e.key, phase: e.phase, speaker: e.speaker }));

    const bargainerProfile = generateProfile('bargainer', new Rng(7), 'p_real_bargainer');
    session.requests.setProfile(bargainerProfile);

    const req: RideRequest = {
      requestId: 'req_real_dial',
      passengerId: bargainerProfile.passengerId,
      pickupNodeId: pickup.nodeId,
      destinationNodeId: dest.nodeId,
      initialFare: 100,
      estimatedDistance: 0.5,
      estimatedDuration: 3,
      requestedArrivalTime: null,
      bookingType: 'app',
      status: 'WaitingForPickup',
      surge: 1,
    };

    session.ride.offer(req);
    session.ride.accept(req.requestId);
    session.ride.update({ x: pickup.x, z: pickup.z, speed: 0 }, SIM_DT);
    // Drive 4.5s to trigger small talk
    for (let i = 0; i < 5; i++) {
      session.ride.update({ x: (pickup.x + dest.x) * 0.5, z: (pickup.z + dest.z) * 0.5, speed: 5 }, 1.0);
    }
    session.ride.update({ x: dest.x, z: dest.z, speed: 0 }, SIM_DT);

    const smallTalk = dialogues.find((d) => d.phase === 'small_talk');
    const dropOff = dialogues.find((d) => d.phase === 'drop_off');
    expect(smallTalk).toBeDefined();
    expect(dropOff).toBeDefined();
    expect(smallTalk!.key).toContain('dialogue.pool.bargainer.small_talk.');
    expect(dropOff!.key).toContain('dialogue.pool.bargainer.drop_off.');
    expect(smallTalk!.speaker).toBe(bargainerProfile.nameKey);
    expect(dropOff!.speaker).toBe(bargainerProfile.nameKey);
  });
});
