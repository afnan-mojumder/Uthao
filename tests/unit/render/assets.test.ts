import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadModel, assetManager } from '../../../src/render/assets';
import { createCNGMesh, createRickshawMesh, createBusMesh } from '../../../src/render/vehicles';
import {
  createTeaStallMesh,
  createFuelCanopyMesh,
  createGarageShutterMesh,
  createFootbridgeMesh,
  createRooftopWaterTankMesh,
  createOverheadWiresMesh,
  createShopSignboardMesh,
} from '../../../src/render/props';

describe('T3.1 Asset Pipeline & Procedural Fallbacks', () => {
  it('assets.manifest.json exists and strictly enforces CC0 licensing', () => {
    const manifestPath = path.resolve('assets.manifest.json');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(manifest.licensePolicy).toBe('CC0-1.0');
    expect(Array.isArray(manifest.packs)).toBe(true);
    for (const pack of manifest.packs) {
      expect(pack.license).toBe('CC0-1.0');
    }
  });

  it('guarantees procedural fallback for all Bangladesh-specific model IDs without crashing', async () => {
    const modelIds = [
      'motorcycle',
      'cng',
      'rickshaw',
      'bus',
      'teaStall',
      'fuelCanopy',
      'garage',
      'footbridge',
      'rooftopWaterTank',
      'overheadWires',
      'shopSignboard',
      'unknown_nonexistent_model_id',
    ];

    for (const id of modelIds) {
      const mesh = await loadModel(id);
      expect(mesh).toBeDefined();
      expect(mesh.isObject3D).toBe(true);
    }
  });

  it('procedural vehicle mesh generators produce populated Object3D hierarchies', () => {
    const cng = createCNGMesh();
    expect(cng.children.length).toBeGreaterThan(0);

    const rickshaw = createRickshawMesh();
    expect(rickshaw.children.length).toBeGreaterThan(0);

    const bus = createBusMesh();
    expect(bus.children.length).toBeGreaterThan(0);
  });

  it('procedural prop generators produce populated Object3D hierarchies', () => {
    expect(createTeaStallMesh().children.length).toBeGreaterThan(0);
    expect(createFuelCanopyMesh().children.length).toBeGreaterThan(0);
    expect(createGarageShutterMesh().children.length).toBeGreaterThan(0);
    expect(createFootbridgeMesh().children.length).toBeGreaterThan(0);
    expect(createRooftopWaterTankMesh().children.length).toBeGreaterThan(0);
    expect(createOverheadWiresMesh().children.length).toBeGreaterThan(0);
    expect(createShopSignboardMesh().children.length).toBeGreaterThan(0);
  });

  it('caches models in AssetManager', async () => {
    assetManager.clearCache();
    expect(assetManager.hasCached('cng')).toBe(false);

    await assetManager.loadModel('cng');
    expect(assetManager.hasCached('cng')).toBe(true);

    const clone = await assetManager.loadModel('cng');
    expect(clone).toBeDefined();
  });
});
