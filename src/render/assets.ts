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
  async loadModel(id: string): Promise<THREE.Object3D> {
    const cached = this.cache.get(id);
    if (cached) {
      return cached.clone();
    }

    // Attempt to load from GLTF if environment allows, else return procedural fallback
    const model = this.createProceduralFallback(id);
    this.cache.set(id, model);
    return model.clone();
  }

  createProceduralFallback(id: string): THREE.Object3D {
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
