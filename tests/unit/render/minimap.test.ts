import { describe, it, expect } from 'vitest';
import { Minimap } from '../../../src/render/minimap';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { DistrictData } from '../../../src/sim/schemas';

describe('T2.8 Minimap', () => {
  const mockDistrict: DistrictData = {
    districtId: 'mirpara',
    name: { bn: 'মিরপাড়া', en: 'Mirpara' },
    nodes: [
      { nodeId: 'node_1', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'node_2', x: 50, z: 0, kind: 'junction' },
      { nodeId: 'node_3', x: 50, z: 50, kind: 'junction' },
    ],
    segments: [
      {
        segmentId: 'seg_1',
        startNodeId: 'node_1',
        endNodeId: 'node_2',
        width: 8,
        surfaceCondition: 1,
        trafficDensity: 0.5,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.2,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0,
        pickupPractical: true,
        district: 'mirpara',
        tags: [],
      },
      {
        segmentId: 'seg_2',
        startNodeId: 'node_2',
        endNodeId: 'node_3',
        width: 6,
        surfaceCondition: 1,
        trafficDensity: 0.3,
        speedLimit: 30,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.2,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 1,
        roadType: 'residential',
        floodSensitivity: 0,
        pickupPractical: true,
        district: 'mirpara',
        tags: [],
      },
    ],
    pois: [],
  };

  const roadNetwork = RoadNetwork.fromDistricts([mockDistrict]);

  it('initializes minimap canvas with specified size and properties', () => {
    const minimap = new Minimap(roadNetwork, { size: 180, viewRadiusM: 100 });
    expect(minimap.canvas).toBeDefined();
    expect(minimap.canvas.width).toBe(180);
    expect(minimap.canvas.height).toBe(180);
    expect(minimap.canvas.id).toBe('minimap-canvas');
  });

  it('updates canvas render cycle without throwing errors in headless or DOM environment', () => {
    const minimap = new Minimap(roadNetwork, { size: 160 });

    const playerPose = { x: 10, z: 10, heading: Math.PI / 4 };
    const mockRoute = {
      fromNodeId: 'node_1',
      toNodeId: 'node_3',
      segmentIds: ['seg_1', 'seg_2'],
      nodeIds: ['node_1', 'node_2', 'node_3'],
      lengthM: 100,
      virtualKm: 0.1,
      etaMin: 1,
      uTurns: 0,
    };
    const markers = {
      pickup: { x: 0, z: 0 },
      dropoff: { x: 50, z: 50 },
    };

    expect(() => {
      minimap.update(playerPose, mockRoute, markers);
    }).not.toThrow();
  });

  it('handles empty route and null markers gracefully', () => {
    const minimap = new Minimap(roadNetwork);
    expect(() => {
      minimap.update({ x: 0, z: 0, heading: 0 }, null, { pickup: null, dropoff: null });
    }).not.toThrow();
  });
});
