import { describe, it, expect } from 'vitest';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { nearestPlaceKey } from '../../../src/sim/ride/rideView';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

describe('objective place names (audit: drop-off showed a raw road node id)', () => {
  const network = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const poi = (testloopData as DistrictData).pois[0]!;

  it('names the POI standing on a node', () => {
    expect(nearestPlaceKey({ roadNetwork: network }, poi.nodeId)).toBe(poi.nameKey);
  });

  it('never returns the raw node id for a node with no POI on it', () => {
    const other = network.getAllNodes().find((n) => n.nodeId !== poi.nodeId)!;
    const key = nearestPlaceKey({ roadNetwork: network }, other.nodeId);
    expect(key).not.toBe(other.nodeId);
    expect(key).toMatch(/^poi\./);
  });

  it('returns empty when the network has no POIs', () => {
    const empty = { getPois: () => [], getNode: () => ({ x: 0, z: 0 }) };
    expect(nearestPlaceKey({ roadNetwork: empty }, 'anything')).toBe('');
  });
});
