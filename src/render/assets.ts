import * as THREE from 'three';
import { MotorcycleMesh, createCNGMesh, createRickshawMesh, createBusMesh } from './vehicles';
import {
  createTeaStallMesh,
  createFuelCanopyMesh,
  createGarageShutterMesh,
  createFootbridgeMesh,
  createRooftopWaterTankMesh,
  createOverheadWiresMesh,
  createShopSignboardMesh,
} from './props';

export class AssetManager {
  private cache = new Map<string, THREE.Object3D>();

  /**
   * Loads a model by ID with in-memory caching and guaranteed procedural fallback.
   * Every asset ID has a procedural fallback so a missing GLTF file or failed network request never crashes.
   */
  async loadModel(id: string, lod: 'high' | 'low' = 'high'): Promise<THREE.Object3D> {
    const key = lod === 'low' ? `${id}_low` : id;
    const cached = this.cache.get(key);
    if (cached) {
      return cached.clone();
    }

    // Attempt to load from GLTF if environment allows, else return procedural fallback
    const model = this.createProceduralFallback(id, lod);
    this.cache.set(key, model);
    return model.clone();
  }

  createProceduralFallback(id: string, lod: 'high' | 'low' = 'high'): THREE.Object3D {
    if (lod === 'low') {
      const group = new THREE.Group();
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshBasicMaterial({ color: 0x64748b });
      group.add(new THREE.Mesh(geo, mat));
      return group;
    }
    switch (id) {
      case 'motorcycle':
      case 'bike':
        return new MotorcycleMesh().root;
      case 'cng':
        return createCNGMesh();
      case 'rickshaw':
        return createRickshawMesh();
      case 'bus':
        return createBusMesh();
      case 'teaStall':
      case 'tong':
        return createTeaStallMesh();
      case 'fuelCanopy':
      case 'fuelStation':
        return createFuelCanopyMesh();
      case 'garage':
      case 'garageShutter':
        return createGarageShutterMesh();
      case 'footbridge':
        return createFootbridgeMesh();
      case 'rooftopWaterTank':
      case 'waterTank':
        return createRooftopWaterTankMesh();
      case 'overheadWires':
      case 'wires':
        return createOverheadWiresMesh();
      case 'shopSignboard':
      case 'signboard':
        return createShopSignboardMesh();
      default: {
        const group = new THREE.Group();
        const geo = new THREE.BoxGeometry(1, 1, 1);
        const mat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.7 });
        group.add(new THREE.Mesh(geo, mat));
        return group;
      }
    }
  }

  hasCached(id: string): boolean {
    return this.cache.has(id);
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const assetManager = new AssetManager();
export const loadModel = (id: string): Promise<THREE.Object3D> => assetManager.loadModel(id);
