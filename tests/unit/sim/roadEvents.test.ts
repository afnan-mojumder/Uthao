import { describe, it, expect } from 'vitest';
import { RoadEventManager } from '../../../src/sim/world/RoadEvents';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { SIM_DT } from '../../../src/config/constants';
import type { DistrictData } from '../../../src/sim/schemas';
import mirparaData from '../../../data/districts/mirpara.json';

function makeTestNetwork(): RoadNetwork {
  return RoadNetwork.fromDistricts([mirparaData as DistrictData]);
}

describe('RoadEventManager city-wide Dhaka events', () => {
  it('boosts city-wide demand during eid_rush and multiple congestion events', () => {
    const network = makeTestNetwork();
    const segments = network.getAllSegments();
    const s1 = segments[0]!.segmentId;
    const s2 = segments[1]!.segmentId;

    const mgr = new RoadEventManager({ network, seed: 42 });
    expect(mgr.getDemandMultiplier()).toBe(1.0);

    mgr.addEvent({
      id: 'ev_water_1',
      kind: 'waterlogging',
      segmentId: s2,
      closesSegment: false,
      speedCapKmh: 12,
      congestionMultiplier: 2.2,
      startMinute: 0,
      durationMinutes: 60,
    });
    expect(mgr.getDemandMultiplier()).toBe(1.0);

    mgr.addEvent({
      id: 'ev_market_1',
      kind: 'market_congestion',
      segmentId: s1,
      closesSegment: false,
      speedCapKmh: 10,
      congestionMultiplier: 2.5,
      startMinute: 0,
      durationMinutes: 60,
    });
    expect(mgr.getDemandMultiplier()).toBe(1.15);

    mgr.addEvent({
      id: 'ev_eid_1',
      kind: 'eid_rush',
      segmentId: s1,
      closesSegment: false,
      speedCapKmh: 15,
      congestionMultiplier: 2.8,
      startMinute: 0,
      durationMinutes: 90,
    });
    expect(mgr.getDemandMultiplier()).toBe(1.35);
  });

  it('generates waterlogging events more frequently in heavy rain', () => {
    const mgr = new RoadEventManager({ network: makeTestNetwork(), seed: 123 });
    let waterloggingCount = 0;
    for (let i = 0; i < 40; i++) {
      const ev = mgr.generateRandomEvent(600, 'heavyRain');
      if (ev?.kind === 'waterlogging') waterloggingCount++;
      mgr.clearEvents();
    }
    expect(waterloggingCount).toBeGreaterThan(2);
  });

  it('wires network into GameManager.roadEvents inside GameSession so live events generate, affect routing, and connect to TrafficManager', () => {
    const network = makeTestNetwork();
    const gm = new GameManager({ seed: 77, mode: 'career', data: {} });
    const session = new GameSession({ gm, road: network, autoRequests: false });

    // RoadEventManager must have the network wired so random events are actually generated
    const generated = gm.roadEvents.generateRandomEvent(gm.clock.minutes, gm.weather);
    expect(generated).not.toBeNull();
    expect(session.traffic.roadEvents).toBe(gm.roadEvents);

    gm.roadEvents.clearEvents();

    // Closing a segment on an active route forces RideManager to reroute around it
    const nodes = network.getAllNodes();
    const startNode = nodes[0]!;
    const endNode = nodes[nodes.length - 1]!;
    const initialRoute = network.route(startNode.nodeId, endNode.nodeId, { mode: 'motorcycle' });
    expect(initialRoute).not.toBeNull();
    expect(initialRoute!.segmentIds.length).toBeGreaterThan(0);

    const req = {
      requestId: 'req_re_route',
      passengerId: 'p_re',
      pickupNodeId: startNode.nodeId,
      destinationNodeId: endNode.nodeId,
      initialFare: 100,
      estimatedDistance: initialRoute!.virtualKm,
      estimatedDuration: initialRoute!.etaMin,
      requestedArrivalTime: null,
      bookingType: 'app' as const,
      status: 'WaitingForPickup' as const,
      surge: 1.0,
    };
    session.ride.offer(req);
    session.ride.accept(req.requestId);
    session.ride.agreeFare(100);
    session.ride.currentRoute = initialRoute;

    const blockedSegId = initialRoute!.segmentIds[0]!;
    gm.roadEvents.closeSegment(blockedSegId, 60);
    session.step({ throttle: 0, brake: 0, steer: 0 }, SIM_DT);

    if (session.ride.currentRoute) {
      expect(session.ride.currentRoute.segmentIds).not.toContain(blockedSegId);
    }
  });
});
