import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingLot } from '../sim/schemas';
import type { SignageAtlas } from './signage';

export interface BuildingsBuildResult {
  group: THREE.Group;
  colliders: THREE.Object3D[];
  buildingCount: number;
}

const FACADE_COLORS = [
  0xd4c2a5, // Warm sand / buff
  0xb25e43, // Terracotta / brick
  0x8ba888, // Sage green
  0x7fa9a8, // Faded teal
  0xdec078, // Pale ochre
  0xa0a5a8, // Weathered concrete
  0xc5b9ab, // Dusty beige
];

export class BuildingBuilder {
  private signageAtlas?: SignageAtlas;

  // Shared reusable materials
  private materials: Map<number, THREE.MeshStandardMaterial> = new Map();
  private windowMat: THREE.MeshStandardMaterial;
  private grillMat: THREE.MeshStandardMaterial;
  private shutterMat: THREE.MeshStandardMaterial;
  private tankMat: THREE.MeshStandardMaterial;
  private parapetMat: THREE.MeshStandardMaterial;

  constructor(signageAtlas?: SignageAtlas) {
    this.signageAtlas = signageAtlas;

    this.windowMat = new THREE.MeshStandardMaterial({
      color: 0x1f2937, // Tinted glass
      roughness: 0.1,
      metalness: 0.8,
    });

    this.grillMat = new THREE.MeshStandardMaterial({
      color: 0x111827, // Dark wrought iron grill
      roughness: 0.6,
      metalness: 0.7,
    });

    this.shutterMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // Steel shutter blue-grey
      roughness: 0.5,
      metalness: 0.6,
    });

    this.tankMat = new THREE.MeshStandardMaterial({
      color: 0x14532d, // Sintex/RFL rooftop tank dark green
      roughness: 0.4,
      metalness: 0.1,
    });

    this.parapetMat = new THREE.MeshStandardMaterial({
      color: 0x64748b, // Concrete parapet
      roughness: 0.9,
    });
  }

  private getFacadeMaterial(colorHex: number): THREE.MeshStandardMaterial {
    let mat = this.materials.get(colorHex);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({
        color: colorHex,
        roughness: 0.8,
        metalness: 0.1,
      });
      this.materials.set(colorHex, mat);
    }
    return mat;
  }

  build(lots: BuildingLot[]): BuildingsBuildResult {
    const group = new THREE.Group();
    group.name = 'district_buildings';
    const colliders: THREE.Object3D[] = [];

    const signKeys = this.signageAtlas?.signKeys ?? [];
    let signIndex = 0;

    for (let i = 0; i < lots.length; i++) {
      const lot = lots[i]!;
      const buildingGroup = new THREE.Group();
      buildingGroup.position.set(lot.x, 0, lot.z);
      buildingGroup.rotation.y = lot.facingHeading;

      // 4 to 8 storeys (approx 3.2m per storey -> 13m to 26m)
      const storeys = 4 + (Math.abs(Math.floor(lot.x * 13 + lot.z * 7)) % 5);
      const storeyHeight = 3.2;
      const totalHeight = storeys * storeyHeight;
      const width = lot.width * 0.94;
      const depth = lot.depth * 0.94;

      const colorHex = FACADE_COLORS[(i + Math.floor(lot.x)) % FACADE_COLORS.length]!;
      const facadeMat = this.getFacadeMaterial(colorHex);

      // 1. Main building block
      const mainGeo = new THREE.BoxGeometry(width, totalHeight, depth);
      const mainMesh = new THREE.Mesh(mainGeo, facadeMat);
      mainMesh.position.y = totalHeight / 2;
      mainMesh.castShadow = true;
      mainMesh.receiveShadow = true;
      buildingGroup.add(mainMesh);

      // Collect sub-geometries for batching by material
      const parapetGeos: THREE.BufferGeometry[] = [];
      const tankGeos: THREE.BufferGeometry[] = [];
      const grillGeos: THREE.BufferGeometry[] = [];
      const winGeos: THREE.BufferGeometry[] = [];
      const shutterGeos: THREE.BufferGeometry[] = [];

      // 2. Rooftop parapet walls
      const parapetHeight = 0.8;
      const parapetGeo = new THREE.BoxGeometry(width + 0.1, parapetHeight, depth + 0.1);
      parapetGeo.translate(0, totalHeight + parapetHeight / 2, 0);
      parapetGeos.push(parapetGeo);

      // 3. Rooftop water tanks (1 or 2 tanks per building)
      const numTanks = 1 + (i % 2);
      for (let t = 0; t < numTanks; t++) {
        const tankGeo = new THREE.CylinderGeometry(0.65, 0.65, 1.3, 12);
        const offsetX = (t === 0 ? -1 : 1) * (width * 0.22);
        const offsetZ = (t % 2 === 0 ? -1 : 1) * (depth * 0.2);
        tankGeo.translate(offsetX, totalHeight + 0.65 + parapetHeight, offsetZ);
        tankGeos.push(tankGeo);
      }

      // 4. Balconies with metal security grills (storeys 2 to top)
      const balconyWidth = width * 0.35;
      const balconyDepth = 0.9;
      const balconyHeight = 0.2;

      for (let s = 1; s < storeys; s++) {
        const floorY = s * storeyHeight;

        // Balcony slabs (same material as parapet)
        const slabLeftGeo = new THREE.BoxGeometry(balconyWidth, balconyHeight, balconyDepth);
        slabLeftGeo.translate(-width * 0.25, floorY, depth / 2 + balconyDepth / 2);
        parapetGeos.push(slabLeftGeo);

        const slabRightGeo = new THREE.BoxGeometry(balconyWidth, balconyHeight, balconyDepth);
        slabRightGeo.translate(width * 0.25, floorY, depth / 2 + balconyDepth / 2);
        parapetGeos.push(slabRightGeo);

        // Balcony security grill railing
        const grillLeftGeo = new THREE.BoxGeometry(balconyWidth, 0.9, 0.05);
        grillLeftGeo.translate(-width * 0.25, floorY + 0.5, depth / 2 + balconyDepth);
        grillGeos.push(grillLeftGeo);

        const grillRightGeo = new THREE.BoxGeometry(balconyWidth, 0.9, 0.05);
        grillRightGeo.translate(width * 0.25, floorY + 0.5, depth / 2 + balconyDepth);
        grillGeos.push(grillRightGeo);

        // Window opening behind balcony
        const winLeftGeo = new THREE.BoxGeometry(balconyWidth * 0.8, 1.4, 0.05);
        winLeftGeo.translate(-width * 0.25, floorY + 1.2, depth / 2 + 0.02);
        winGeos.push(winLeftGeo);

        const winRightGeo = new THREE.BoxGeometry(balconyWidth * 0.8, 1.4, 0.05);
        winRightGeo.translate(width * 0.25, floorY + 1.2, depth / 2 + 0.02);
        winGeos.push(winRightGeo);
      }

      // 5. Ground-floor shops for commercial zones or select lots
      if (lot.zone === 'commercial' || i % 2 === 0) {
        const shopWidth = width * 0.42;
        const shutterHeight = 2.4;

        // Shop shutters
        const shutterLeftGeo = new THREE.BoxGeometry(shopWidth, shutterHeight, 0.1);
        shutterLeftGeo.translate(-width * 0.25, shutterHeight / 2, depth / 2 + 0.05);
        shutterGeos.push(shutterLeftGeo);

        const shutterRightGeo = new THREE.BoxGeometry(shopWidth, shutterHeight, 0.1);
        shutterRightGeo.translate(width * 0.25, shutterHeight / 2, depth / 2 + 0.05);
        shutterGeos.push(shutterRightGeo);

        // Signboards above the shops
        if (this.signageAtlas && signKeys.length > 0) {
          const signKey = signKeys[signIndex % signKeys.length]!;
          signIndex++;
          const signMesh = this.signageAtlas.createSignboardMesh(
            signKey,
            shopWidth * 1.1,
            0.75,
            0.08
          );
          signMesh.position.set(
            -width * 0.25,
            shutterHeight + 0.42,
            depth / 2 + 0.12
          );
          buildingGroup.add(signMesh);
        }
      }

      // Merge and add batched sub-meshes
      const addMergedMesh = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
        if (geos.length === 0) return;
        const merged = mergeGeometries(geos, false);
        if (merged) {
          const mesh = new THREE.Mesh(merged, mat);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          buildingGroup.add(mesh);
        }
      };

      addMergedMesh(parapetGeos, this.parapetMat);
      addMergedMesh(tankGeos, this.tankMat);
      addMergedMesh(grillGeos, this.grillMat);
      addMergedMesh(winGeos, this.windowMat);
      addMergedMesh(shutterGeos, this.shutterMat);

      group.add(buildingGroup);

      // Collider for physics and camera anti-clip
      const colliderGeo = new THREE.BoxGeometry(width, totalHeight, depth);
      const colliderMat = new THREE.MeshBasicMaterial({ visible: false });
      const colliderMesh = new THREE.Mesh(colliderGeo, colliderMat);
      colliderMesh.position.set(lot.x, totalHeight / 2, lot.z);
      colliderMesh.rotation.y = lot.facingHeading;
      colliders.push(colliderMesh);
    }

    return {
      group,
      colliders,
      buildingCount: lots.length,
    };
  }
}
