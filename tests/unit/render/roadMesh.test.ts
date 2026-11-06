import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RoadMeshBuilder } from '../../../src/render/roadMesh';
import mirparaData from '../../../data/districts/mirpara.json';
import type { DistrictData } from '../../../src/sim/schemas';

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
