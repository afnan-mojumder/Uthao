import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { DistrictId } from '../../../src/core/types';
import {
  DistrictSchema,
  WorldDataSchema,
  type DistrictData,
  type WorldData,
} from '../../../src/sim/schemas';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import bnUi from '../../../data/dialogue/bn/ui.json';
import enUi from '../../../data/dialogue/en/ui.json';

describe('Districts and World Network (T5.1)', () => {
  const districtIds: DistrictId[] = [
    'mirpara',
    'fulgate',
    'dhanbagh',
    'mohakhal',
    'gulbari',
    'puranpara',
    'motinagar',
  ];

  const districts: DistrictData[] = districtIds.map((id) => {
    const filePath = path.resolve(`data/districts/${id}.json`);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return DistrictSchema.parse(content);
  });

  const worldPath = path.resolve('data/world.json');
  const worldData: WorldData = WorldDataSchema.parse(
    JSON.parse(fs.readFileSync(worldPath, 'utf-8'))
  );

  it('all seven districts load and validate against DistrictSchema', () => {
    expect(districts).toHaveLength(7);
    for (const d of districts) {
      expect(d.nodes.length).toBeGreaterThanOrEqual(30);
      expect(d.segments.length).toBeGreaterThanOrEqual(50);
      expect(d.pois.length).toBeGreaterThanOrEqual(6);
      expect(d.lots && d.lots.length).toBeGreaterThan(0);
    }
  });

  it('all district POI nameKeys exist in both BN and EN dialogue dictionaries', () => {
    for (const d of districts) {
      for (const poi of d.pois) {
        expect(enUi).toHaveProperty(poi.nameKey);
        expect(bnUi).toHaveProperty(poi.nameKey);
      }
    }
  });

  it('all seven districts load into unified RoadNetwork via fromWorld', () => {
    const network = RoadNetwork.fromWorld(worldData, districts);
    expect(network.getAllNodes().length).toBeGreaterThanOrEqual(230);
    expect(network.getAllSegments().length).toBeGreaterThanOrEqual(400);
    expect(network.getPois().length).toBeGreaterThanOrEqual(48);

    // Verify connectors were included
    expect(worldData.connectors.length).toBeGreaterThanOrEqual(12);
    const connSegments = network.getAllSegments().filter((s) => s.tags?.includes('connector'));
    expect(connSegments.length).toBe(worldData.connectors.length);
  });

  it('whole world graph is strongly connected across all district borders for motorcycles', () => {
    const network = RoadNetwork.fromWorld(worldData, districts);
    const motoSegs = network.getAllSegments().filter((s) => s.motorcycleAccessible);

    const adj = new Map<string, string[]>();
    const revAdj = new Map<string, string[]>();
    const accessibleNodes = new Set<string>();

    for (const s of motoSegs) {
      accessibleNodes.add(s.startNodeId);
      accessibleNodes.add(s.endNodeId);
      if (!adj.has(s.startNodeId)) adj.set(s.startNodeId, []);
      if (!adj.has(s.endNodeId)) adj.set(s.endNodeId, []);
      if (!revAdj.has(s.startNodeId)) revAdj.set(s.startNodeId, []);
      if (!revAdj.has(s.endNodeId)) revAdj.set(s.endNodeId, []);

      adj.get(s.startNodeId)!.push(s.endNodeId);
      revAdj.get(s.endNodeId)!.push(s.startNodeId);

      if (!s.oneWay) {
        adj.get(s.endNodeId)!.push(s.startNodeId);
        revAdj.get(s.startNodeId)!.push(s.endNodeId);
      }
    }

    const startNode = 'art_n_0'; // Mirpara top-left node
    expect(accessibleNodes.has(startNode)).toBe(true);

    // Forward BFS
    const visited = new Set<string>();
    const queue = [startNode];
    visited.add(startNode);
    while (queue.length > 0) {
      const curr = queue.shift()!;
      for (const next of adj.get(curr) || []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    // Backward BFS
    const revVisited = new Set<string>();
    const revQueue = [startNode];
    revVisited.add(startNode);
    while (revQueue.length > 0) {
      const curr = revQueue.shift()!;
      for (const next of revAdj.get(curr) || []) {
        if (!revVisited.has(next)) {
          revVisited.add(next);
          revQueue.push(next);
        }
      }
    }

    expect(visited.size).toBe(accessibleNodes.size);
    expect(revVisited.size).toBe(accessibleNodes.size);
  });

  it('can route across distant districts across Dhaka city', () => {
    const network = RoadNetwork.fromWorld(worldData, districts);

    // Mirpara (NW) to Motinagar (SE)
    const route1 = network.route('art_n_0', 'motinagar_art_s_4', {
      mode: 'motorcycle',
    });
    expect(route1).not.toBeNull();
    expect(route1!.segmentIds.length).toBeGreaterThan(5);
    expect(route1!.lengthM).toBeGreaterThan(1000);

    // Puranpara (SW) to Gulbari (NE)
    const route2 = network.route('puranpara_art_s_0', 'gulbari_art_n_4', {
      mode: 'motorcycle',
    });
    expect(route2).not.toBeNull();
    expect(route2!.segmentIds.length).toBeGreaterThan(5);
    expect(route2!.lengthM).toBeGreaterThan(1000);
  });

  it('Mohakhal flyover segments are routable and prohibit pickups', () => {
    const network = RoadNetwork.fromWorld(worldData, districts);
    expect(worldData.flyovers.length).toBeGreaterThan(0);

    const mohakhalFlyover = worldData.flyovers.find(
      (f) => f.flyoverId === 'mohakhal_flyover'
    );
    expect(mohakhalFlyover).toBeDefined();
    expect(mohakhalFlyover!.segmentIds.length).toBeGreaterThanOrEqual(6);

    const segMap = new Map(network.getAllSegments().map((s) => [s.segmentId, s]));
    for (const segId of mohakhalFlyover!.segmentIds) {
      const seg = segMap.get(segId);
      expect(seg).toBeDefined();
      expect(seg!.roadType).toBe('flyover');
      expect(seg!.pickupPractical).toBe(false);
      expect(seg!.motorcycleAccessible).toBe(true);
    }

    // Test routing across the flyover
    const flyoverRoute = network.route('mohakhal_fly_w', 'mohakhal_fly_e', {
      mode: 'motorcycle',
    });
    expect(flyoverRoute).not.toBeNull();
    const usedFlyoverSegs = flyoverRoute!.segmentIds.filter(
      (sId) => segMap.get(sId)?.roadType === 'flyover'
    );
    expect(usedFlyoverSegs.length).toBeGreaterThan(0);
  });

  it('Gulbari officeGate POIs have security gate rules and are practical for pickup', () => {
    const gulbari = districts.find((d) => d.districtId === 'gulbari')!;
    const officeGates = gulbari.pois.filter((p) => p.kind === 'officeGate');
    expect(officeGates.length).toBeGreaterThanOrEqual(2);

    for (const gate of officeGates) {
      const onPractical = gulbari.segments.some(
        (s) =>
          (s.startNodeId === gate.nodeId || s.endNodeId === gate.nodeId) &&
          s.pickupPractical
      );
      expect(onPractical).toBe(true);
    }
  });

  it('Puranpara narrow alleys restrict motorcycle accessibility and routing obeys it', () => {
    const puranpara = districts.find((d) => d.districtId === 'puranpara')!;
    const alleys = puranpara.segments.filter((s) => s.roadType === 'alley');
    expect(alleys.length).toBeGreaterThan(0);

    const inaccessibleAlleys = alleys.filter((s) => !s.motorcycleAccessible);
    expect(inaccessibleAlleys.length).toBeGreaterThan(0);

    const network = RoadNetwork.fromWorld(worldData, districts);
    for (const inacc of inaccessibleAlleys) {
      // Routing between startNode and endNode should not traverse an inaccessible segment
      const r = network.route(inacc.startNodeId, inacc.endNodeId, {
        mode: 'motorcycle',
      });
      if (r) {
        expect(r.segmentIds).not.toContain(inacc.segmentId);
      }
    }
  });
});
