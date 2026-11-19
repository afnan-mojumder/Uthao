import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { DistrictId, RoadSegment } from '../../../src/core/types';
import {
  DistrictSchema,
  WorldDataSchema,
  type DistrictData,
  type WorldData,
} from '../../../src/sim/schemas';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { getRoadWidth } from '../../../src/render/roadMesh';
import { CityBuilder } from '../../../src/render/CityBuilder';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { angleDiff, clamp } from '../../../src/core/math';
import { SIM_DT } from '../../../src/config/constants';
import bnUi from '../../../data/dialogue/bn/ui.json';
import enUi from '../../../data/dialogue/en/ui.json';

function obbOverlaps(
  ax: number,
  az: number,
  ahx: number,
  ahz: number,
  ayaw: number,
  bx: number,
  bz: number,
  bhx: number,
  bhz: number,
  byaw: number
): boolean {
  const aux = Math.cos(ayaw);
  const auz = -Math.sin(ayaw);
  const avx = Math.sin(ayaw);
  const avz = Math.cos(ayaw);
  const bux = Math.cos(byaw);
  const buz = -Math.sin(byaw);
  const bvx = Math.sin(byaw);
  const bvz = Math.cos(byaw);
  const dx = bx - ax;
  const dz = bz - az;

  const separated = (tx: number, tz: number) => {
    const dist = Math.abs(dx * tx + dz * tz);
    const rA = ahx * Math.abs(aux * tx + auz * tz) + ahz * Math.abs(avx * tx + avz * tz);
    const rB = bhx * Math.abs(bux * tx + buz * tz) + bhz * Math.abs(bvx * tx + bvz * tz);
    return dist >= rA + rB - 1e-4;
  };

  return !(
    separated(aux, auz) ||
    separated(avx, avz) ||
    separated(bux, buz) ||
    separated(bvx, bvz)
  );
}

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
    const route2 = network.route('puranpara_art_0', 'gulbari_art_n_3', {
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

  it('zero building lots overlap any road or sidewalk polygon across all 7 districts', () => {
    const network = RoadNetwork.fromWorld(worldData, districts);
    const allNodes = network.getNodesMap();
    const allSegments = network.getAllSegments();

    let totalLots = 0;
    let overlaps = 0;

    for (const d of districts) {
      const lots = d.lots ?? [];
      expect(lots.length).toBeGreaterThan(0);

      for (const lot of lots) {
        totalLots++;
        expect(lot.width).toBeGreaterThanOrEqual(10);
        expect(lot.width).toBeLessThanOrEqual(22);
        expect(lot.depth).toBeGreaterThanOrEqual(10);
        expect(lot.depth).toBeLessThanOrEqual(16);

        for (const seg of allSegments) {
          if (seg.roadType === 'flyover') continue;
          const sNode = allNodes.get(seg.startNodeId);
          const eNode = allNodes.get(seg.endNodeId);
          if (!sNode || !eNode) continue;

          const dx = eNode.x - sNode.x;
          const dz = eNode.z - sNode.z;
          const len = Math.hypot(dx, dz);
          if (len < 0.1) continue;

          const roadW = Math.max(seg.width, getRoadWidth(seg as RoadSegment));
          const sidewalkW = seg.roadType === 'alley' ? 0.28 : 1.88;
          const roadYaw = Math.atan2(dx, dz);

          if (
            obbOverlaps(
              lot.x,
              lot.z,
              lot.width / 2,
              lot.depth / 2,
              lot.facingHeading,
              (sNode.x + eNode.x) / 2,
              (sNode.z + eNode.z) / 2,
              roadW / 2 + sidewalkW,
              len / 2,
              roadYaw
            )
          ) {
            overlaps++;
          }
        }
      }
    }

    expect(totalLots).toBeGreaterThan(100);
    expect(overlaps).toBe(0);
  });

  it('has zero zero-length segments or connectors, >= 12 signaled junctions, and real market segments', () => {
    const network = RoadNetwork.fromWorld(worldData, districts);
    const nodesMap = network.getNodesMap();

    for (const seg of network.getAllSegments()) {
      const s = nodesMap.get(seg.startNodeId)!;
      const e = nodesMap.get(seg.endNodeId)!;
      const len = Math.hypot(e.x - s.x, e.z - s.z);
      expect(len, `segment ${seg.segmentId} length`).toBeGreaterThan(0);
      expect(seg.oneWay && seg.divided, `one-way ${seg.segmentId} must not have divided median`).toBe(false);
    }

    for (const conn of worldData.connectors) {
      const s = nodesMap.get(conn.startNodeId)!;
      const e = nodesMap.get(conn.endNodeId)!;
      const len = Math.hypot(e.x - s.x, e.z - s.z);
      expect(len, `connector ${conn.segmentId} length`).toBeGreaterThanOrEqual(20);
    }

    const totalSignals = districts.reduce(
      (sum, d) => sum + d.nodes.filter((n) => n.signal === true).length,
      0
    );
    expect(totalSignals).toBeGreaterThanOrEqual(12);

    for (const dId of ['mirpara', 'fulgate', 'puranpara', 'motinagar'] as const) {
      const d = districts.find((x) => x.districtId === dId)!;
      const marketSegs = d.segments.filter((s) => s.roadType === 'market');
      expect(marketSegs.length, `${dId} must have roadType === 'market' segments`).toBeGreaterThan(0);
    }
  });

  it('each district has distinct street density/topology and Mohakhali flyover rises to y >= 5.5m', () => {
    const puranpara = districts.find((d) => d.districtId === 'puranpara')!;
    const gulbari = districts.find((d) => d.districtId === 'gulbari')!;
    const mohakhal = districts.find((d) => d.districtId === 'mohakhal')!;

    // Puranpara is undivided, denser, and much more alley-rich than Gulbari
    expect(puranpara.segments.some((s) => s.divided)).toBe(false);
    expect(puranpara.segments.length).toBeGreaterThan(gulbari.segments.length);
    const puranAlleys = puranpara.segments.filter((s) => s.roadType === 'alley').length;
    const gulbariAlleys = gulbari.segments.filter((s) => s.roadType === 'alley').length;
    expect(puranAlleys).toBeGreaterThan(gulbariAlleys * 3);
    expect(gulbari.segments.filter((s) => s.roadType === 'market')).toHaveLength(0);

    // Divided arterial carriageways art_n / art_s are cleanly separated by >= width + 3.0m
    for (const d of districts) {
      if (d.districtId === 'puranpara') continue;
      const prefix = d.districtId === 'mirpara' ? '' : `${d.districtId}_`;
      const artN = d.nodes.find((n) => n.nodeId === `${prefix}art_n_0`);
      const artS = d.nodes.find((n) => n.nodeId === `${prefix}art_s_0`);
      const artSeg = d.segments.find((s) => s.startNodeId === `${prefix}art_n_0` && s.endNodeId === `${prefix}art_n_1`);
      expect(artN).toBeDefined();
      expect(artS).toBeDefined();
      expect(artSeg).toBeDefined();
      expect(Math.abs(artS!.z - artN!.z)).toBeGreaterThanOrEqual(artSeg!.width + 3.0);
    }

    // Mohakhali flyover deck nodes sit at y >= 5.5m with ramps climbing from y = 0
    const flyW = mohakhal.nodes.find((n) => n.nodeId === 'mohakhal_fly_w')!;
    const flyMid = mohakhal.nodes.find((n) => n.nodeId === 'mohakhal_fly_mid')!;
    const flyE = mohakhal.nodes.find((n) => n.nodeId === 'mohakhal_fly_e')!;
    expect(flyW.y ?? 0).toBeGreaterThanOrEqual(5.5);
    expect(flyMid.y ?? 0).toBeGreaterThanOrEqual(5.5);
    expect(flyE.y ?? 0).toBeGreaterThanOrEqual(5.5);
  });

  it('GameSession bike.y smoothly rises onto the real Mohakhali flyover without snapping to ground lanes underneath', async () => {
    const mohakhal = districts.find((d) => d.districtId === 'mohakhal')!;
    const network = RoadNetwork.fromDistricts([mohakhal]);
    const physics = await PhysicsWorld.create();
    const city = new CityBuilder();
    city.buildDistrict(mohakhal, physics);

    const gm = new GameManager({ seed: 33, mode: 'career', data: {} });
    const session = new GameSession({ gm, road: network, physics, autoRequests: false });

    const rampStart = network.getNode('mohakhal_art_n_0')!;
    const flyW = network.getNode('mohakhal_fly_w')!;
    const flyMid = network.getNode('mohakhal_fly_mid')!;

    // Place on the on-ramp heading toward fly_w, then ride onto the flyover deck across ground cross-streets
    session.bike.x = rampStart.x;
    session.bike.z = rampStart.z;
    session.bike.y = 0;
    session.bike.heading = Math.atan2(flyW.x - rampStart.x, flyW.z - rampStart.z);

    let maxY = 0;
    for (let i = 0; i < 1800 && session.bike.x < flyMid.x; i++) {
      const target = session.bike.x < flyW.x ? flyW : flyMid;
      const desired = Math.atan2(target.x - session.bike.x, target.z - session.bike.z);
      const steer = clamp(-angleDiff(session.bike.heading, desired) * 2.5, -1, 1);
      session.step({ throttle: 1, brake: 0, steer }, SIM_DT);
      if (session.bike.y > maxY) maxY = session.bike.y;
    }

    expect(session.bike.x).toBeGreaterThanOrEqual(flyMid.x - 5);
    expect(maxY).toBeGreaterThanOrEqual(5.5);
    expect(session.bike.y).toBeGreaterThanOrEqual(5.5);
  });
});
