import { describe, it, expect } from 'vitest';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { nearestNode, segmentAt } from '../../../src/sim/road/spatial';
import type { DistrictData } from '../../../src/sim/schemas';

describe('RoadNetwork and routing', () => {
  // A test graph:
  // Node N1 (0, 0) ---> (oneWay) ---> Node N2 (100, 0)
  // Node N2 (100, 0) ---> Node N3 (100, 100)
  // Node N1 (0, 0) ---> (inaccessible alley) ---> Node N3 (100, 100)
  // Node N3 (100, 100) ---> Node N4 (0, 100)
  // Node N4 (0, 100) ---> Node N1 (0, 0)
  //
  // Divided road with U-turn:
  // N5 (200, 0) === (divided north) ===> N6 (200, 100)
  // N6 (200, 100) --- (uturn node) ---> N7 (210, 100)
  // N7 (210, 100) === (divided south) ===> N8 (210, 0)
  //
  // Isolated:
  // N9 (500, 500)
  const testDistrict: DistrictData = {
    districtId: 'testloop',
    name: { bn: 'টেস্টলুপ', en: 'Test Loop' },
    nodes: [
      { nodeId: 'N1', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N2', x: 100, z: 0, kind: 'junction' },
      { nodeId: 'N3', x: 100, z: 100, kind: 'junction' },
      { nodeId: 'N4', x: 0, z: 100, kind: 'junction' },
      { nodeId: 'N5', x: 200, z: 0, kind: 'junction' },
      { nodeId: 'N6', x: 200, z: 100, kind: 'uturn' },
      { nodeId: 'N7', x: 210, z: 100, kind: 'junction' },
      { nodeId: 'N8', x: 210, z: 0, kind: 'junction' },
      { nodeId: 'N9', x: 500, z: 500, kind: 'deadEnd' },
    ],
    segments: [
      // S1: N1 -> N2 (oneWay main road)
      {
        segmentId: 'S1',
        startNodeId: 'N1',
        endNodeId: 'N2',
        width: 10,
        surfaceCondition: 1.0,
        trafficDensity: 0.3,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.2,
        riskLevel: 0.1,
        oneWay: true,
        divided: false,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0.2,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      // S2: N2 -> N3 (twoWay main road)
      {
        segmentId: 'S2',
        startNodeId: 'N2',
        endNodeId: 'N3',
        width: 10,
        surfaceCondition: 1.0,
        trafficDensity: 0.3,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.2,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0.2,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      // S3: N1 -> N3 (alley, motorcycleAccessible: false)
      {
        segmentId: 'S3',
        startNodeId: 'N1',
        endNodeId: 'N3',
        width: 2.5,
        surfaceCondition: 0.7,
        trafficDensity: 0.1,
        speedLimit: 15,
        turnRestrictions: [],
        motorcycleAccessible: false,
        pedestrianDensity: 0.5,
        riskLevel: 0.2,
        oneWay: false,
        divided: false,
        lanes: 1,
        roadType: 'alley',
        floodSensitivity: 0.4,
        pickupPractical: false,
        district: 'testloop',
        tags: ['alley'],
      },
      // S4: N3 -> N4
      {
        segmentId: 'S4',
        startNodeId: 'N3',
        endNodeId: 'N4',
        width: 8,
        surfaceCondition: 0.9,
        trafficDensity: 0.2,
        speedLimit: 30,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.3,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'residential',
        floodSensitivity: 0.3,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      // S5: N4 -> N1
      {
        segmentId: 'S5',
        startNodeId: 'N4',
        endNodeId: 'N1',
        width: 8,
        surfaceCondition: 0.9,
        trafficDensity: 0.2,
        speedLimit: 30,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.3,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'residential',
        floodSensitivity: 0.3,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      // S_div_north: N5 -> N6 (divided northbound)
      {
        segmentId: 'S_div_north',
        startNodeId: 'N5',
        endNodeId: 'N6',
        width: 12,
        surfaceCondition: 1.0,
        trafficDensity: 0.4,
        speedLimit: 50,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0.1,
        oneWay: true,
        divided: true,
        lanes: 3,
        roadType: 'main',
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'testloop',
        tags: ['divided'],
      },
      // S_uturn: N6 -> N7 (U-turn link at uturn node N6)
      {
        segmentId: 'S_uturn',
        startNodeId: 'N6',
        endNodeId: 'N7',
        width: 6,
        surfaceCondition: 1.0,
        trafficDensity: 0.2,
        speedLimit: 20,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0.1,
        oneWay: true,
        divided: false,
        lanes: 1,
        roadType: 'service',
        floodSensitivity: 0.1,
        pickupPractical: false,
        district: 'testloop',
        tags: ['uturn'],
      },
      // S_div_south: N7 -> N8 (divided southbound)
      {
        segmentId: 'S_div_south',
        startNodeId: 'N7',
        endNodeId: 'N8',
        width: 12,
        surfaceCondition: 1.0,
        trafficDensity: 0.4,
        speedLimit: 50,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0.1,
        oneWay: true,
        divided: true,
        lanes: 3,
        roadType: 'main',
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'testloop',
        tags: ['divided'],
      },
      // Connector from loop to divided road: N2 -> N5
      {
        segmentId: 'S_conn',
        startNodeId: 'N2',
        endNodeId: 'N5',
        width: 8,
        surfaceCondition: 1.0,
        trafficDensity: 0.2,
        speedLimit: 30,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'residential',
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
    ],
    pois: [
      {
        id: 'poi_fuel',
        kind: 'fuel',
        nodeId: 'N2',
        nameKey: 'poi.fuel',
      },
    ],
  };

  const net = RoadNetwork.fromDistricts([testDistrict]);

  it('route respects one-way', () => {
    // S1 goes N1 -> N2. From N2 to N1, it cannot use S1 in reverse.
    // It must take N2 -> N3 -> N4 -> N1.
    const r = net.route('N2', 'N1', { mode: 'motorcycle' });
    expect(r).not.toBeNull();
    expect(r?.nodeIds).toEqual(['N2', 'N3', 'N4', 'N1']);
    expect(r?.segmentIds).toEqual(['S2', 'S4', 'S5']);
  });

  it('no route through inaccessible alley in motorcycle mode, walk mode allowed', () => {
    // If we want to go N1 -> N3 directly without N2:
    // With N2 avoided, only S3 connects N1 and N3.
    const motoRoute = net.route('N1', 'N3', {
      mode: 'motorcycle',
      avoid: ['S1', 'S5'], // forces only S3 or fail
    });
    expect(motoRoute).toBeNull();

    const walkRoute = net.route('N1', 'N3', {
      mode: 'walk',
      avoid: ['S1', 'S5'],
    });
    expect(walkRoute).not.toBeNull();
    expect(walkRoute?.segmentIds).toEqual(['S3']);
  });

  it('divided road requires uturn node to reverse', () => {
    // Going from N5 (south of northbound) to N8 (south of southbound)
    // Must go N5 -> N6 (uturn node) -> N7 -> N8
    const r = net.route('N5', 'N8', { mode: 'motorcycle' });
    expect(r).not.toBeNull();
    expect(r?.nodeIds).toEqual(['N5', 'N6', 'N7', 'N8']);
    expect(r?.uTurns).toBeGreaterThanOrEqual(1);
  });

  it('closure forces reroute', () => {
    // N1 -> N3 normally uses N1 -> N2 -> N3
    const normal = net.route('N1', 'N3', { mode: 'motorcycle' });
    expect(normal?.segmentIds).toEqual(['S1', 'S2']);

    // If S1 is closed/avoided: must reroute N1 -> N4 -> N3
    const rerouted = net.route('N1', 'N3', {
      mode: 'motorcycle',
      avoid: ['S1'],
    });
    expect(rerouted).not.toBeNull();
    expect(rerouted?.nodeIds).toEqual(['N1', 'N4', 'N3']);
    expect(rerouted?.segmentIds).toEqual(['S5', 'S4']);
  });

  it('returns null when isolated', () => {
    // N9 is isolated with no connected segments
    const r = net.route('N1', 'N9', { mode: 'motorcycle' });
    expect(r).toBeNull();
  });

  it('spatial nearestNode finds closest node with optional filter', () => {
    const near = nearestNode(net.getAllNodes(), 5, 2);
    expect(near?.nodeId).toBe('N1');

    const uturnOnly = nearestNode(net.getAllNodes(), 195, 95, (n) => n.kind === 'uturn');
    expect(uturnOnly?.nodeId).toBe('N6');
  });

  it('spatial segmentAt finds segment containing point', () => {
    const seg = segmentAt(net.getAllSegments(), net.getNodesMap(), 50, 0);
    expect(seg?.segmentId).toBe('S1');
  });
});
