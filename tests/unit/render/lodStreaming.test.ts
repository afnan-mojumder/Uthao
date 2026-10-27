import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import type { DistrictId } from '../../../src/core/types';
import {
  DistrictSchema,
  WorldDataSchema,
  type DistrictData,
  type WorldData,
} from '../../../src/sim/schemas';
import {
  districtsToLoad,
  districtsToUnload,
  distanceToDistrictBounds,
  createDistrictSilhouette,
} from '../../../src/render/lod';
import { CityBuilder } from '../../../src/render/CityBuilder';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';

describe('District Streaming and LOD (T5.2)', () => {
  const worldPath = path.resolve('data/world.json');
  const worldData: WorldData = WorldDataSchema.parse(
    JSON.parse(fs.readFileSync(worldPath, 'utf-8'))
  );

  const districtsMap = new Map<DistrictId, DistrictData>();
  for (const dRef of worldData.districts) {
    const filePath = path.resolve(dRef.file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    districtsMap.set(dRef.districtId as DistrictId, DistrictSchema.parse(content));
  }

  describe('distanceToDistrictBounds', () => {
    const bounds = { minX: 0, maxX: 600, minZ: 0, maxZ: 600 };

    it('returns 0 when inside bounds', () => {
      expect(distanceToDistrictBounds(bounds, { x: 300, z: 300 })).toBe(0);
      expect(distanceToDistrictBounds(bounds, { x: 0, z: 600 })).toBe(0);
    });

    it('returns exact orthogonal distance when outside along an axis', () => {
      // 100m east of east edge
      expect(distanceToDistrictBounds(bounds, { x: 700, z: 300 })).toBe(100);
      // 250m south of south edge
      expect(distanceToDistrictBounds(bounds, { x: 300, z: 850 })).toBe(250);
    });

    it('returns Euclidean diagonal distance when outside a corner', () => {
      // 300m east and 400m south of southeast corner (600, 600)
      const dist = distanceToDistrictBounds(bounds, { x: 900, z: 1000 });
      expect(dist).toBeCloseTo(500, 1);
    });
  });

  describe('districtsToLoad (pure function by position)', () => {
    it('determines streaming set from center of Mirpara (300, 300)', () => {
      const set = districtsToLoad({ x: 300, z: 300 }, worldData, 400);

      // Mirpara is home district (dist 0 <= 400)
      expect(set).toContain('mirpara');
      // Fulgate is 300m East (dist 300 <= 400)
      expect(set).toContain('fulgate');
      // Dhanbagh is 300m South (dist 300 <= 400)
      expect(set).toContain('dhanbagh');

      // Mohakhal is diagonal (dist ~424m > 400m)
      expect(set).not.toContain('mohakhal');
      // Distant districts (Gulbari, Motinagar, Puranpara) must not be loaded
      expect(set).not.toContain('gulbari');
      expect(set).not.toContain('motinagar');
      expect(set).not.toContain('puranpara');
    });

    it('determines streaming set from Motinagar center (900, 1500)', () => {
      const set = districtsToLoad({ x: 900, z: 1500 }, worldData, 400);

      expect(set).toContain('motinagar');
      expect(set).not.toContain('mirpara');
      expect(set).not.toContain('dhanbagh');
    });
  });

  describe('districtsToUnload (hysteresis retention)', () => {
    it('retains districts between 400m and 700m to prevent thrashing, unloads at > 700m', () => {
      const loaded = new Set<DistrictId>(['mirpara', 'fulgate', 'dhanbagh']);

      // At (150, 150), distance to Fulgate is 450m (> 400m load threshold, but <= 700m unload threshold)
      const toUnloadNear = districtsToUnload(
        { x: 150, z: 150 },
        loaded,
        worldData,
        700
      );
      expect(toUnloadNear).not.toContain('fulgate');
      expect(toUnloadNear).toHaveLength(0);

      // At (-200, 150), distance to Fulgate is 800m (> 700m unload threshold)
      const toUnloadFar = districtsToUnload(
        { x: -200, z: 150 },
        loaded,
        worldData,
        700
      );
      expect(toUnloadFar).toContain('fulgate');
    });
  });

  describe('createDistrictSilhouette', () => {
    it('creates single InstancedMesh representing Dhaka skyline for distant district', () => {
      const mirpara = districtsMap.get('mirpara')!;
      const sil = createDistrictSilhouette(mirpara);

      expect(sil).toBeInstanceOf(THREE.InstancedMesh);
      const mesh = sil as THREE.InstancedMesh;
      expect(mesh.count).toBe(mirpara.lots?.length);
      expect(mesh.name).toBe('silhouette_mirpara');
      expect(mesh.visible).toBe(true);
    });
  });

  describe('CityBuilder streaming orchestrator', () => {
    it('initializes world streaming with silhouettes and builds nearby districts progressively', async () => {
      const physics = await PhysicsWorld.create();
      const city = new CityBuilder();

      city.initWorldStreaming(
        worldData,
        (id) => districtsMap.get(id),
        physics,
        { x: 300, z: 300 }
      );

      // Silhouettes created for all 7 districts
      expect(city.silhouetteGroup.children.length).toBe(7);
      expect(city.getSilhouette('motinagar')?.visible).toBe(true);

      // Initially at (300, 300), Mirpara, Fulgate, Dhanbagh are in build queue or loaded
      // Run update frames with small budget (<= 4 ms) to simulate frame ticks
      let ticks = 0;
      while (city.getBuildQueueLength() > 0 && ticks < 100) {
        city.update({ x: 300, z: 300 }, 250, 4);
        ticks++;
      }

      // Starting districts finished building
      expect(city.isDistrictLoaded('mirpara')).toBe(true);
      expect(city.isDistrictLoaded('fulgate')).toBe(true);
      expect(city.isDistrictLoaded('dhanbagh')).toBe(true);

      // Silhouette hidden for fully loaded districts
      expect(city.getSilhouette('mirpara')?.visible).toBe(false);
      expect(city.getSilhouette('fulgate')?.visible).toBe(false);

      // Distant district Motinagar remains unbuilt with silhouette visible
      expect(city.isDistrictLoaded('motinagar')).toBe(false);
      expect(city.getSilhouette('motinagar')?.visible).toBe(true);

      // Colliders and physics boxes were populated
      expect(city.colliders.length).toBeGreaterThan(0);
      expect(city.staticBoxDescs.length).toBeGreaterThan(0);

      // Move player far away (> 700m from Fulgate, e.g. to x = -300, z = 0)
      city.update({ x: -300, z: 0 }, 250, 4);

      // Fulgate is now > 700m away, so it unloads
      expect(city.isDistrictLoaded('fulgate')).toBe(false);
      // Its silhouette is restored
      expect(city.getSilhouette('fulgate')?.visible).toBe(true);
    });
  });
});
