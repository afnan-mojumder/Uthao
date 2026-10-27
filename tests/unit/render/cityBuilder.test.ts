import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SignageAtlas } from '../../../src/render/signage';
import { RoadMeshBuilder, getRoadWidth } from '../../../src/render/roadMesh';
import { BuildingBuilder } from '../../../src/render/buildings';
import { LodManager } from '../../../src/render/lod';
import { CityBuilder } from '../../../src/render/CityBuilder';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import mirparaData from '../../../data/districts/mirpara.json';
import testloopData from '../../../data/districts/testloop.json';
import type { DistrictData, BuildingLot } from '../../../src/sim/schemas';

describe('CityBuilder, Roads, Buildings and LOD (T3.3)', () => {
  describe('SignageAtlas', () => {
    it('initializes with default signs and provides valid UVs', () => {
      const atlas = new SignageAtlas();
      expect(atlas.signKeys.length).toBeGreaterThan(5);

      const uv = atlas.getUv('sign.pharmacy');
      expect(uv.uMin).toBeGreaterThanOrEqual(0);
      expect(uv.uMax).toBeLessThanOrEqual(1);
      expect(uv.vMin).toBeGreaterThanOrEqual(0);
      expect(uv.vMax).toBeLessThanOrEqual(1);
      expect(uv.uMax).toBeGreaterThan(uv.uMin);
      expect(uv.vMax).toBeGreaterThan(uv.vMin);
    });

    it('creates a signboard mesh with atlas material and custom UVs', () => {
      const atlas = new SignageAtlas();
      const mesh = atlas.createSignboardMesh('sign.tea_stall', 3.6, 0.9);
      expect(mesh).toBeDefined();
      expect(mesh.material).toBe(atlas.material);
      expect(mesh.castShadow).toBe(true);
    });
  });

  describe('RoadMeshBuilder', () => {
    it('computes expected road widths by type', () => {
      const dividedSeg = (mirparaData as DistrictData).segments.find((s) => s.divided)!;
      const residentialSeg = (mirparaData as DistrictData).segments.find((s) => s.roadType === 'residential')!;
      const alleySeg = (mirparaData as DistrictData).segments.find((s) => s.roadType === 'alley')!;

      expect(getRoadWidth(dividedSeg)).toBe(14); // divided
      expect(getRoadWidth(residentialSeg)).toBe(8);
      expect(getRoadWidth(alleySeg)).toBe(4);
    });

    it('builds road ribbons, kerbs, and zebra crossings for Mirpara', () => {
      const builder = new RoadMeshBuilder();
      const result = builder.build(mirparaData as DistrictData);

      expect(result.group.children.length).toBeGreaterThan(50);
      expect(result.segmentCount).toBe(mirparaData.segments.length);
      expect(result.zebraCount).toBeGreaterThan(0);
      expect(result.colliders.length).toBeGreaterThan(0);
    });

    it('builds road ribbons for testloop without errors', () => {
      const builder = new RoadMeshBuilder();
      const result = builder.build(testloopData as DistrictData);

      expect(result.group.children.length).toBeGreaterThan(0);
      expect(result.segmentCount).toBe(testloopData.segments.length);
    });
  });

  describe('BuildingBuilder', () => {
    it('builds 4-8 storey apartment blocks with rooftop tanks and balconies', () => {
      const atlas = new SignageAtlas();
      const builder = new BuildingBuilder(atlas);

      const sampleLots: BuildingLot[] = [
        {
          lotId: 'test_lot_1',
          x: 10,
          z: 20,
          width: 18,
          depth: 16,
          facingHeading: 0,
          zone: 'residential',
        },
        {
          lotId: 'test_lot_2',
          x: 40,
          z: 20,
          width: 20,
          depth: 16,
          facingHeading: Math.PI / 2,
          zone: 'commercial',
        },
      ];

      const result = builder.build(sampleLots);
      expect(result.buildingCount).toBe(2);
      expect(result.group.children.length).toBe(2);
      expect(result.colliders.length).toBe(2);

      // Verify building components
      const bldg1 = result.group.children[0]!;
      expect(bldg1.position.x).toBe(10);
      expect(bldg1.position.z).toBe(20);
      // Contains main block, parapet, water tanks, balconies, windows
      expect(bldg1.children.length).toBeGreaterThan(5);
    });

    it('builds all lots from Mirpara district', () => {
      const builder = new BuildingBuilder();
      const result = builder.build(mirparaData.lots as BuildingLot[]);

      expect(result.buildingCount).toBe(mirparaData.lots.length);
      expect(result.colliders.length).toBe(mirparaData.lots.length);
    });
  });

  describe('LodManager', () => {
    it('organizes objects into 100m spatial chunks and culls distant chunks', () => {
      const lod = new LodManager(100);

      const objNear = new THREE.Object3D();
      objNear.position.set(20, 0, 30);
      lod.addObject(objNear, 20, 30);

      const objFar = new THREE.Object3D();
      objFar.position.set(500, 0, 500);
      lod.addObject(objFar, 500, 500);

      expect(lod.getChunkCount()).toBe(2);

      // Camera near (0, 0) with 200m draw distance
      lod.update({ x: 0, z: 0 }, 200);

      const nearChunk = lod.getChunk(20, 30);
      const farChunk = lod.getChunk(500, 500);

      expect(nearChunk.root.visible).toBe(true);
      expect(farChunk.root.visible).toBe(false);

      // Move camera close to (500, 500)
      lod.update({ x: 500, z: 500 }, 200);
      expect(nearChunk.root.visible).toBe(false);
      expect(farChunk.root.visible).toBe(true);
    });
  });

  describe('CityBuilder Orchestrator', () => {
    it('builds full district, populates colliders, and generates static physics boxes', async () => {
      const city = new CityBuilder();
      const physics = await PhysicsWorld.create();

      city.buildDistrict(mirparaData as DistrictData, physics);

      expect(city.colliders.length).toBeGreaterThan(50);
      expect(city.staticBoxDescs.length).toBe(mirparaData.lots.length);
      expect(city.lodManager.getChunkCount()).toBeGreaterThan(0);

      // Update LOD without error
      city.update({ x: 300, z: 300 }, 250);
      expect(city.lodManager.getVisibleChunkCount()).toBeGreaterThan(0);
    });
  });
});
