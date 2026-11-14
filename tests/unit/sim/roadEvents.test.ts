import { describe, it, expect } from 'vitest';
import { RoadEventManager } from '../../../src/sim/world/RoadEvents';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
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
});
