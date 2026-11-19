import { describe, it, expect, vi, afterEach } from 'vitest';
import * as THREE from 'three';
import { RoadMeshBuilder, getRoadWidth, kerbEndTrim } from '../../../src/render/roadMesh';
import mirparaData from '../../../data/districts/mirpara.json';
import mohakhalData from '../../../data/districts/mohakhal.json';
import type { DistrictData } from '../../../src/sim/schemas';
import type { RoadSegment } from '../../../src/core/types';

// The asphalt strip must lie along its street. On a diagonal street it used to
// be mirrored across the x-axis, so it ran off the line of the kerbs beside it.
describe('road asphalt follows its street', () => {
  it('a diagonal street has its asphalt strip running along the street', () => {
    // Arrange: one diagonal segment, from (0,0) to (30,30), with the Mirpara road template
    const base = mirparaData as unknown as DistrictData & { nodes: unknown[]; segments: unknown[] };
    const template = (base.nodes[0] ?? {}) as Record<string, unknown>;
    const segTemplate = (base.segments[0] ?? {}) as Record<string, unknown>;
    const district = {
      ...base,
      nodes: [
        { ...template, nodeId: 'diag_a', x: 0, z: 0, kind: 'road', tags: [] },
        { ...template, nodeId: 'diag_b', x: 30, z: 30, kind: 'road', tags: [] },
      ],
      segments: [{ ...segTemplate, segmentId: 'diag', startNodeId: 'diag_a', endNodeId: 'diag_b' }],
    } as unknown as DistrictData;
    const len = Math.hypot(30, 30);

    // Act: build the road and find the asphalt plane, the one of street length
    const result = new RoadMeshBuilder().build(district);
    result.group.updateMatrixWorld(true);
    const asphalt = result.group.children.find(
      (c): c is THREE.Mesh =>
        c instanceof THREE.Mesh &&
        c.geometry instanceof THREE.PlaneGeometry &&
        Math.abs((c.geometry as THREE.PlaneGeometry).parameters.height - len) < 0.01
    );
    expect(asphalt).toBeDefined();
    const along = new THREE.Vector3(0, 1, 0).transformDirection(asphalt!.matrixWorld);

    // Assert: the strip's long axis is parallel to the street, (1,0,1)/√2
    const streetDir = new THREE.Vector2(1, 1).normalize();
    const alongXZ = new THREE.Vector2(along.x, along.z).normalize();
    expect(Math.abs(alongXZ.dot(streetDir))).toBeCloseTo(1, 3);
  });
});

// The CityBuilder bins each road child into a LOD chunk by its position. Merged
// markings, puddles and zebras sat at the origin, so they vanished away from it.
describe('road pieces sit at their own place, not the origin', () => {
  it('every road child of a district has its position inside its own footprint', () => {
    // Arrange
    const district = mirparaData as unknown as DistrictData;

    // Act
    const result = new RoadMeshBuilder().build(district);
    result.group.updateMatrixWorld(true);

    // Assert: each child's position (the bin key) lies within its world box
    const box = new THREE.Box3();
    for (const child of result.group.children) {
      box.setFromObject(child).expandByScalar(0.01);
      const p = child.position;
      expect(box.containsPoint(new THREE.Vector3(p.x, box.min.y, p.z)), child.uuid).toBe(true);
    }
    expect(result.group.children.length).toBeGreaterThan(10);
  });
});

describe('P2.3 Road width, junctions, asymmetric kerbs, flyover slopes & world UVs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('getRoadWidth honors segment.width across alleys, residential, and wide boulevards', () => {
    const mirpara = mirparaData as unknown as DistrictData;
    const narrowAlley = mirpara.segments.find((s) => s.roadType === 'alley' && s.width === 2.5)!;
    const widerAlley = mirpara.segments.find((s) => s.roadType === 'alley' && s.width === 3.5)!;
    const residential = mirpara.segments.find((s) => s.roadType === 'residential')!;
    const arterial = mirpara.segments.find((s) => s.divided)!;

    expect(narrowAlley).toBeDefined();
    expect(widerAlley).toBeDefined();
    expect(getRoadWidth(narrowAlley)).toBe(2.5);
    expect(getRoadWidth(widerAlley)).toBe(3.5);
    expect(getRoadWidth(residential)).toBe(residential.width);
    expect(getRoadWidth(arterial)).toBe(arterial.width);

    const wideBoulevard = { ...arterial, width: 17.5 };
    expect(getRoadWidth(wideBoulevard)).toBe(17.5);
  });

  it('generates junction asphalt patches at y=0.015 below road strips (y=0.02) and markings (y=0.03)', () => {
    const base = mirparaData as unknown as DistrictData;
    const template = base.segments[0]!;
    const district: DistrictData = {
      ...base,
      nodes: [
        { nodeId: 'w', x: 0, z: 0, kind: 'junction' },
        { nodeId: 'm', x: 30, z: 0, kind: 'junction' },
        { nodeId: 'e', x: 60, z: 0, kind: 'junction' },
        { nodeId: 's', x: 30, z: 30, kind: 'junction' },
      ],
      segments: [
        { ...template, segmentId: 'seg_wm', startNodeId: 'w', endNodeId: 'm', width: 10, divided: false },
        { ...template, segmentId: 'seg_me', startNodeId: 'm', endNodeId: 'e', width: 10, divided: false },
        { ...template, segmentId: 'seg_ms', startNodeId: 'm', endNodeId: 's', width: 8, divided: false },
      ],
      pois: [],
      lots: [],
    };

    const result = new RoadMeshBuilder().build(district);
    const patches = result.group.children.filter(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.name === 'junction_patch'
    );
    expect(patches.length).toBeGreaterThanOrEqual(1);
    expect(patches[0]!.position.y).toBeCloseTo(0.015, 3);

    const strips = result.group.children.filter(
      (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.geometry instanceof THREE.PlaneGeometry
    );
    expect(strips.length).toBe(3);
    for (const strip of strips) {
      expect(strip.position.y).toBeCloseTo(0.02, 3);
    }

    const markings = result.group.children.filter(
      (c): c is THREE.Mesh =>
        c instanceof THREE.Mesh &&
        c.material instanceof THREE.MeshBasicMaterial &&
        c.material.color.getHex() === 0xf5f5f5
    );
    expect(markings.length).toBeGreaterThan(0);
    const box = new THREE.Box3().setFromObject(markings[0]!);
    expect(box.min.y).toBeCloseTo(0.03, 3);
  });

  it('trims kerbs asymmetrically at T-junctions and skips kerbLen <= 0.2', () => {
    const base = mirparaData as unknown as DistrictData;
    const template = base.segments[0]!;
    const nodes = new Map([
      ['w', { x: 0, z: 0 }],
      ['m', { x: 40, z: 0 }],
      ['e', { x: 80, z: 0 }],
      ['s', { x: 40, z: 40 }],
    ]);
    const wm: RoadSegment = {
      ...template,
      segmentId: 'wm',
      startNodeId: 'w',
      endNodeId: 'm',
      width: 10,
      divided: false,
    };
    const me: RoadSegment = {
      ...template,
      segmentId: 'me',
      startNodeId: 'm',
      endNodeId: 'e',
      width: 10,
      divided: false,
    };
    const ms: RoadSegment = {
      ...template,
      segmentId: 'ms',
      startNodeId: 'm',
      endNodeId: 's',
      width: 8,
      divided: false,
    };
    const segs = [wm, me, ms];

    // On wm (west->mid, +X), left normal (-nz=0 -> -dz=0, dx=+1 -> nx=0, nz=+1):
    // Wait: nx = -dz/len = 0, nz = dx/len = +1. So left (-n) is -Z (North, no road), right (+n) is +Z (South, stem ms).
    const northTrim = kerbEndTrim(wm, false, segs, nodes, -1);
    const southTrim = kerbEndTrim(wm, false, segs, nodes, 1);
    expect(northTrim).toBe(0);
    expect(southTrim).toBeCloseTo(4, 2);

    // Very short stub between two wide perpendicular streets: kerbLen <= 0.2 should produce zero kerb meshes
    const stubDistrict: DistrictData = {
      ...base,
      nodes: [
        { nodeId: 'a', x: 0, z: 0, kind: 'junction' },
        { nodeId: 'b', x: 6, z: 0, kind: 'junction' },
        { nodeId: 'a1', x: 0, z: 20, kind: 'junction' },
        { nodeId: 'b1', x: 6, z: 20, kind: 'junction' },
      ],
      segments: [
        { ...template, segmentId: 'stub', startNodeId: 'a', endNodeId: 'b', width: 6, divided: false },
        { ...template, segmentId: 'cross_a', startNodeId: 'a', endNodeId: 'a1', width: 10, divided: false },
        { ...template, segmentId: 'cross_b', startNodeId: 'b', endNodeId: 'b1', width: 10, divided: false },
      ],
      pois: [],
      lots: [],
    };
    const stubResult = new RoadMeshBuilder().build(stubDistrict);
    for (const c of stubResult.colliders) {
      if (c instanceof THREE.Mesh && c.geometry instanceof THREE.BoxGeometry) {
        expect(c.geometry.parameters.depth).toBeGreaterThan(0.2);
      }
    }
  });

  it('builds sloped flyover decks with interpolated y and concrete support pillars', () => {
    const mohakhal = mohakhalData as unknown as DistrictData;
    const result = new RoadMeshBuilder().build(mohakhal);
    result.group.updateMatrixWorld(true);

    const pillars = result.group.children.filter((c) => c.name === 'flyover_pillar');
    expect(pillars.length).toBeGreaterThan(0);

    // Elevated deck strip at y ~ 6.02
    const elevatedDecks = result.group.children.filter(
      (c): c is THREE.Mesh =>
        c instanceof THREE.Mesh &&
        c.geometry instanceof THREE.PlaneGeometry &&
        c.position.y > 5.5
    );
    expect(elevatedDecks.length).toBeGreaterThan(0);

    // Sloped ramp strip at midpoint y ~ 3.02 with non-zero pitch
    const slopedRamps = result.group.children.filter(
      (c): c is THREE.Mesh =>
        c instanceof THREE.Mesh &&
        c.geometry instanceof THREE.PlaneGeometry &&
        c.position.y > 1.5 &&
        c.position.y < 4.5
    );
    expect(slopedRamps.length).toBe(4);
    for (const ramp of slopedRamps) {
      const normal = new THREE.Vector3(0, 0, 1).transformDirection(ramp.matrixWorld);
      expect(normal.y).toBeGreaterThan(0.95);
      const along = new THREE.Vector3(0, 1, 0).transformDirection(ramp.matrixWorld);
      expect(Math.abs(along.y)).toBeGreaterThan(0.03);
    }
  });

  it('scales asphalt UVs proportionally in world meters per mesh', () => {
    const base = mirparaData as unknown as DistrictData;
    const template = base.segments[0]!;
    const district: DistrictData = {
      ...base,
      nodes: [
        { nodeId: 's0', x: 0, z: 0, kind: 'junction' },
        { nodeId: 's1', x: 12, z: 0, kind: 'junction' },
        { nodeId: 'l0', x: 0, z: 50, kind: 'junction' },
        { nodeId: 'l1', x: 120, z: 50, kind: 'junction' },
      ],
      segments: [
        { ...template, segmentId: 'short_seg', startNodeId: 's0', endNodeId: 's1', width: 8, divided: false },
        { ...template, segmentId: 'long_seg', startNodeId: 'l0', endNodeId: 'l1', width: 8, divided: false },
      ],
      pois: [],
      lots: [],
    };
    const result = new RoadMeshBuilder().build(district);
    const shortPlane = result.group.children.find(
      (c): c is THREE.Mesh =>
        c instanceof THREE.Mesh &&
        c.geometry instanceof THREE.PlaneGeometry &&
        Math.abs((c.geometry as THREE.PlaneGeometry).parameters.height - 12) < 0.01
    )!;
    const longPlane = result.group.children.find(
      (c): c is THREE.Mesh =>
        c instanceof THREE.Mesh &&
        c.geometry instanceof THREE.PlaneGeometry &&
        Math.abs((c.geometry as THREE.PlaneGeometry).parameters.height - 120) < 0.01
    )!;

    expect(shortPlane).toBeDefined();
    expect(longPlane).toBeDefined();

    const maxV = (mesh: THREE.Mesh) => {
      const uv = mesh.geometry.getAttribute('uv')!;
      let m = 0;
      for (let i = 0; i < uv.count; i++) m = Math.max(m, uv.getY(i));
      return m;
    };
    const shortV = maxV(shortPlane);
    const longV = maxV(longPlane);
    expect(shortV).toBeGreaterThan(1.5);
    expect(longV / shortV).toBeCloseTo(10, 2);
  });
});
