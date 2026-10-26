import { describe, it, expect } from 'vitest';
import { genDistrict, genMirpara } from '../../../scripts/gen-district';
import { DistrictSchema, type DistrictData } from '../../../src/sim/schemas';
import mirparaJson from '../../../data/districts/mirpara.json';
import bnUi from '../../../data/dialogue/bn/ui.json';
import enUi from '../../../data/dialogue/en/ui.json';

describe('District Generator (T3.2)', () => {
  it('is completely deterministic per seed', () => {
    const d1 = genMirpara(42);
    const d2 = genMirpara(42);
    expect(d1).toEqual(d2);

    const d3 = genMirpara(999);
    expect(d1).not.toEqual(d3);
  });

  it('supports genDistrict with custom parameters', () => {
    const custom = genDistrict(
      {
        districtId: 'mirpara',
        origin: { x: 100, z: 100 },
        size: { width: 400, height: 400 },
        blockM: [100, 150],
        arterial: { divided: true, uturnEveryM: 200 },
        alleyDensity: 0.2,
        marketStreets: 1,
        organic: 0.1,
      },
      77
    );
    expect(custom.districtId).toBe('mirpara');
    expect(custom.nodes.length).toBeGreaterThan(0);
  });

  it('produces valid DistrictSchema output with building lots', () => {
    const district = genMirpara(101);
    const parsed = DistrictSchema.parse(district);
    expect(parsed.districtId).toBe('mirpara');
    expect(parsed.nodes.length).toBeGreaterThanOrEqual(20);
    expect(parsed.segments.length).toBeGreaterThanOrEqual(30);
    expect(parsed.pois.length).toBeGreaterThanOrEqual(10);
    expect(parsed.lots && parsed.lots.length).toBeGreaterThan(0);
  });

  it('generates the required feature set in Mirpara', () => {
    const mirpara = mirparaJson as DistrictData;

    // 1. Divided arterial segments
    const dividedSegments = mirpara.segments.filter((s) => s.divided);
    expect(dividedSegments.length).toBeGreaterThan(0);

    // 2. Market street with pedestrian density > 0.6
    const marketSegments = mirpara.segments.filter((s) => s.tags.includes('market'));
    expect(marketSegments.length).toBeGreaterThan(0);
    expect(marketSegments.some((s) => s.pedestrianDensity > 0.6)).toBe(true);

    // 3. Narrow alleys with motorcycleAccessible: true and false
    const alleys = mirpara.segments.filter((s) => s.roadType === 'alley');
    expect(alleys.some((s) => s.motorcycleAccessible)).toBe(true);
    expect(alleys.some((s) => !s.motorcycleAccessible)).toBe(true);

    // 4. Flood-sensitive low-lying segments (floodSensitivity > 0.6)
    const floodSegments = mirpara.segments.filter((s) => s.floodSensitivity > 0.6);
    expect(floodSegments.length).toBeGreaterThan(0);

    // 5. >= 10 POIs covering required PoiKinds
    expect(mirpara.pois.length).toBeGreaterThanOrEqual(10);
    const poiKinds = new Set(mirpara.pois.map((p) => p.kind));
    expect(poiKinds.has('teaStall')).toBe(true);
    expect(poiKinds.has('garage')).toBe(true);
    expect(poiKinds.has('fuel')).toBe(true);
    expect(poiKinds.has('hospital')).toBe(true);
    expect(poiKinds.has('school')).toBe(true);
    expect(poiKinds.has('market')).toBe(true);
    expect(poiKinds.has('pharmacy')).toBe(true);
    expect(poiKinds.has('busStop')).toBe(true);
  });

  describe('Mirpara validation rules (scripts/validate-data.mjs)', () => {
    const mirpara = mirparaJson as DistrictData;

    it('passes DistrictSchema Zod parse', () => {
      expect(() => DistrictSchema.parse(mirpara)).not.toThrow();
    });

    it('is strongly connected for motorcycles', () => {
      const motoSegments = mirpara.segments.filter((s) => s.motorcycleAccessible);
      const adj = new Map<string, string[]>();
      const revAdj = new Map<string, string[]>();

      const activeNodes = new Set<string>();
      for (const seg of motoSegments) {
        activeNodes.add(seg.startNodeId);
        activeNodes.add(seg.endNodeId);
        if (!adj.has(seg.startNodeId)) adj.set(seg.startNodeId, []);
        adj.get(seg.startNodeId)!.push(seg.endNodeId);

        if (!revAdj.has(seg.endNodeId)) revAdj.set(seg.endNodeId, []);
        revAdj.get(seg.endNodeId)!.push(seg.startNodeId);

        if (!seg.oneWay) {
          if (!adj.has(seg.endNodeId)) adj.set(seg.endNodeId, []);
          adj.get(seg.endNodeId)!.push(seg.startNodeId);

          if (!revAdj.has(seg.startNodeId)) revAdj.set(seg.startNodeId, []);
          revAdj.get(seg.startNodeId)!.push(seg.endNodeId);
        }
      }

      const nodeList = Array.from(activeNodes);
      expect(nodeList.length).toBeGreaterThan(0);

      const startNode = nodeList[0]!;

      // Forward BFS
      const visitedFwd = new Set<string>();
      const queueFwd = [startNode];
      visitedFwd.add(startNode);
      while (queueFwd.length > 0) {
        const u = queueFwd.shift()!;
        for (const v of adj.get(u) || []) {
          if (!visitedFwd.has(v)) {
            visitedFwd.add(v);
            queueFwd.push(v);
          }
        }
      }
      expect(visitedFwd.size).toBe(nodeList.length);

      // Backward BFS
      const visitedRev = new Set<string>();
      const queueRev = [startNode];
      visitedRev.add(startNode);
      while (queueRev.length > 0) {
        const u = queueRev.shift()!;
        for (const v of revAdj.get(u) || []) {
          if (!visitedRev.has(v)) {
            visitedRev.add(v);
            queueRev.push(v);
          }
        }
      }
      expect(visitedRev.size).toBe(nodeList.length);
    });

    it('places every POI on a segment where pickupPractical is true', () => {
      const nodeToPracticalSeg = new Set<string>();
      for (const seg of mirpara.segments) {
        if (seg.pickupPractical) {
          nodeToPracticalSeg.add(seg.startNodeId);
          nodeToPracticalSeg.add(seg.endNodeId);
        }
      }

      for (const poi of mirpara.pois) {
        expect(
          nodeToPracticalSeg.has(poi.nodeId),
          `POI ${poi.nameKey} at ${poi.nodeId} must be on a pickupPractical segment`
        ).toBe(true);
      }
    });

    it('ensures every divided segment is within <= 400m of a U-turn node', () => {
      const nodeMap = new Map(mirpara.nodes.map((n) => [n.nodeId, n]));
      const uturnNodes = mirpara.nodes.filter(
        (n) => n.kind === 'uturn' || n.tags?.includes('uturn')
      );
      expect(uturnNodes.length).toBeGreaterThan(0);

      const dividedSegments = mirpara.segments.filter((s) => s.divided);
      for (const seg of dividedSegments) {
        const n1 = nodeMap.get(seg.startNodeId)!;
        const n2 = nodeMap.get(seg.endNodeId)!;
        const midX = (n1.x + n2.x) / 2;
        const midZ = (n1.z + n2.z) / 2;

        let minDist = Infinity;
        for (const un of uturnNodes) {
          const d = Math.hypot(un.x - midX, un.z - midZ);
          if (d < minDist) minDist = d;
        }

        expect(
          minDist,
          `Divided segment ${seg.segmentId} distance to nearest U-turn (${minDist}m) exceeds 400m`
        ).toBeLessThanOrEqual(400);
      }
    });

    it('ensures all POI nameKeys exist in both en and bn ui.json', () => {
      for (const poi of mirpara.pois) {
        expect(
          Object.prototype.hasOwnProperty.call(enUi, poi.nameKey),
          `Missing en key for ${poi.nameKey}`
        ).toBe(true);
        expect(
          Object.prototype.hasOwnProperty.call(bnUi, poi.nameKey),
          `Missing bn key for ${poi.nameKey}`
        ).toBe(true);
      }
    });
  });
});
