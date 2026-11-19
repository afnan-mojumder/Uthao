import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BuildingLot } from '../sim/schemas';
import type { SignageAtlas } from './signage';
import { assetManager } from './assets';
import {
  getFacadeTexture,
  getWindowEmissiveTexture,
  scaleBoxUvs,
  FACADE_TILE_U_M,
  FACADE_TILE_V_M,
} from './textures';

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

const COMMERCIAL_GLB_IDS = [
  'building_commercial_a',
  'building_commercial_b',
  'building_commercial_c',
  'building_commercial_d',
] as const;

const TOWER_GLB_IDS = [
  'building_commercial_tower',
  'building_commercial_highrise',
] as const;

const RESIDENTIAL_GLB_IDS = [
  'building_residential_a',
  'building_residential_b',
  'building_residential_c',
  'building_residential_d',
] as const;

function sharedMat<T extends THREE.Material>(mat: T): T {
  mat.userData.shared = true;
  return mat;
}

function applyVertexColor(geo: THREE.BufferGeometry, colorHex: number): void {
  const pos = geo.getAttribute('position');
  if (!pos) return;
  const c = new THREE.Color(colorHex);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

export class BuildingBuilder {
  private signageAtlas?: SignageAtlas;

  // Shared reusable materials (tagged userData.shared = true so district unload never disposes them)
  private facadeMat: THREE.MeshStandardMaterial;
  private windowMat: THREE.MeshStandardMaterial;
  private grillMat: THREE.MeshStandardMaterial;
  private shutterMat: THREE.MeshStandardMaterial;
  private tankMat: THREE.MeshStandardMaterial;
  private parapetMat: THREE.MeshStandardMaterial;
  private colliderMat: THREE.MeshBasicMaterial;
  private canonicalPackMaterials: Map<string, THREE.Material> = new Map();

  constructor(signageAtlas?: SignageAtlas) {
    this.signageAtlas = signageAtlas;

    const facadeTex = getFacadeTexture();
    this.facadeMat = sharedMat(
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        ...(facadeTex ? { map: facadeTex } : {}),
        roughness: 0.85,
        metalness: 0.05,
      })
    );

    const winEmissiveTex = getWindowEmissiveTexture();
    this.windowMat = sharedMat(
      new THREE.MeshStandardMaterial({
        color: 0x1f2937, // Tinted glass
        roughness: 0.15,
        metalness: 0.75,
        emissive: 0xffd27d,
        ...(winEmissiveTex ? { emissiveMap: winEmissiveTex } : {}),
        emissiveIntensity: 0,
      })
    );

    this.grillMat = sharedMat(
      new THREE.MeshStandardMaterial({
        color: 0x111827, // Dark wrought iron grill
        roughness: 0.6,
        metalness: 0.7,
      })
    );

    this.shutterMat = sharedMat(
      new THREE.MeshStandardMaterial({
        color: 0x334155, // Steel shutter blue-grey
        roughness: 0.5,
        metalness: 0.6,
      })
    );

    this.tankMat = sharedMat(
      new THREE.MeshStandardMaterial({
        color: 0x14532d, // Gazi / RFL rooftop tank dark green
        roughness: 0.4,
        metalness: 0.1,
      })
    );

    this.parapetMat = sharedMat(
      new THREE.MeshStandardMaterial({
        color: 0x64748b, // Concrete parapet
        roughness: 0.9,
      })
    );

    this.colliderMat = sharedMat(new THREE.MeshBasicMaterial({ visible: false }));
  }

  /** Controls warm lit window intensity at dusk/night (0 = off, 1 = full night). */
  setNightGlow(glow01: number): void {
    this.windowMat.emissiveIntensity = Math.max(0, Math.min(1, glow01)) * 0.9;
  }

  private resolvePackMaterial(
    modelId: string,
    rawMaterial: THREE.Material | THREE.Material[]
  ): THREE.Material | THREE.Material[] {
    if (Array.isArray(rawMaterial)) {
      for (const m of rawMaterial) m.userData.shared = true;
      return rawMaterial;
    }
    rawMaterial.userData.shared = true;

    const entry = assetManager.getEntry(modelId);
    const stdMat = rawMaterial as THREE.MeshStandardMaterial;
    if (entry?.pack && rawMaterial.name === 'colormap' && stdMat.map) {
      const key = `${entry.pack}|${stdMat.map.image ? 'tex' : 'notex'}`;
      const existing = this.canonicalPackMaterials.get(key);
      if (existing) {
        return existing;
      }
      this.canonicalPackMaterials.set(key, rawMaterial);
    }
    return rawMaterial;
  }

  private pickModelId(lot: BuildingLot, hash: number): string | null {
    if (lot.zone === 'commercial' || lot.zone === 'civic') {
      if (lot.width >= 13 && lot.depth >= 12 && hash % 4 === 0) {
        return TOWER_GLB_IDS[hash % TOWER_GLB_IDS.length]!;
      }
      return COMMERCIAL_GLB_IDS[hash % COMMERCIAL_GLB_IDS.length]!;
    }
    if (lot.zone === 'residential') {
      return RESIDENTIAL_GLB_IDS[hash % RESIDENTIAL_GLB_IDS.length]!;
    }
    if (lot.zone === 'market' && hash % 3 === 1) {
      return COMMERCIAL_GLB_IDS[hash % COMMERCIAL_GLB_IDS.length]!;
    }
    return null;
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
      // lot.facingHeading already rotates local +Z toward the adjacent street
      buildingGroup.rotation.y = lot.facingHeading;

      const hash = Math.abs(Math.floor(lot.x * 13 + lot.z * 7));
      const storeys = 4 + (hash % 5);
      const storeyHeight = 3.2;
      const totalHeight = storeys * storeyHeight;
      const width = lot.width * 0.94;
      const depth = lot.depth * 0.94;

      let colliderHeight = totalHeight;
      let builtWithGlb = false;

      // Blend ~50% Kenney GLB commercial/suburban buildings (on odd indices when preloaded)
      // with Dhaka modular apartment blocks
      if (i % 2 === 1) {
        const modelId = this.pickModelId(lot, hash + i);
        const proto = modelId ? assetManager.getInstancedPrototype(modelId) : null;
        if (modelId && proto) {
          proto.geometry.userData.shared = true;
          if (!proto.geometry.boundingBox) {
            proto.geometry.computeBoundingBox();
          }
          const bb = proto.geometry.boundingBox!;
          const protoW = Math.max(bb.max.x - bb.min.x, 0.5);
          const protoH = Math.max(bb.max.y - bb.min.y, 0.5);
          const protoD = Math.max(bb.max.z - bb.min.z, 0.5);

          const fitXZ = Math.min(width / protoW, depth / protoD);
          const fitY = Math.min(Math.max(fitXZ, 0.85), Math.max(fitXZ * 1.15, totalHeight / protoH));
          const mat = this.resolvePackMaterial(modelId, proto.material);
          const glbMesh = new THREE.Mesh(proto.geometry, mat);
          glbMesh.name = `kenney_building_${modelId}`;
          // Kenney building GLBs have their front entrance along -Z; flip PI so front faces +Z (road)
          glbMesh.rotation.y = Math.PI;
          glbMesh.scale.set(fitXZ, fitY, fitXZ);
          glbMesh.castShadow = true;
          glbMesh.receiveShadow = true;
          buildingGroup.add(glbMesh);

          const scaledH = protoH * fitY;
          const scaledD = protoD * fitXZ;
          colliderHeight = scaledH;

          // Add Bengali/English Dhaka shop signboard on commercial & market GLBs facing the street
          if (
            (lot.zone === 'commercial' || lot.zone === 'market') &&
            this.signageAtlas &&
            signKeys.length > 0
          ) {
            const signKey = signKeys[signIndex % signKeys.length]!;
            signIndex++;
            const signMesh = this.signageAtlas.createSignboardMesh(
              signKey,
              Math.min(width * 0.65, 4.2),
              0.75,
              0.08
            );
            signMesh.position.set(0, 2.8, scaledD / 2 + 0.08);
            buildingGroup.add(signMesh);
          }

          builtWithGlb = true;
        }
      }

      if (!builtWithGlb) {
        const colorHex = FACADE_COLORS[(i + Math.floor(Math.abs(lot.x))) % FACADE_COLORS.length]!;

        // 1. Main building block with world-meter UV scaling and vertex tint color
        const mainGeo = new THREE.BoxGeometry(width, totalHeight, depth);
        scaleBoxUvs(mainGeo, width, totalHeight, depth, FACADE_TILE_U_M, FACADE_TILE_V_M);
        applyVertexColor(mainGeo, colorHex);
        const mainMesh = new THREE.Mesh(mainGeo, this.facadeMat);
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

        // 3. Rooftop water tanks (1 or 2 Gazi tanks per building)
        const numTanks = 1 + (i % 2);
        for (let t = 0; t < numTanks; t++) {
          const tankGeo = new THREE.CylinderGeometry(0.65, 0.65, 1.3, 12);
          const offsetX = (t === 0 ? -1 : 1) * (width * 0.22);
          const offsetZ = (t % 2 === 0 ? -1 : 1) * (depth * 0.2);
          tankGeo.translate(offsetX, totalHeight + 0.65 + parapetHeight, offsetZ);
          tankGeos.push(tankGeo);
        }

        // 4. Balconies with metal security grills (storeys 2 to top) facing +Z (street)
        const balconyWidth = width * 0.35;
        const balconyDepth = 0.9;
        const balconyHeight = 0.2;

        for (let s = 1; s < storeys; s++) {
          const floorY = s * storeyHeight;

          const slabLeftGeo = new THREE.BoxGeometry(balconyWidth, balconyHeight, balconyDepth);
          slabLeftGeo.translate(-width * 0.25, floorY, depth / 2 + balconyDepth / 2);
          parapetGeos.push(slabLeftGeo);

          const slabRightGeo = new THREE.BoxGeometry(balconyWidth, balconyHeight, balconyDepth);
          slabRightGeo.translate(width * 0.25, floorY, depth / 2 + balconyDepth / 2);
          parapetGeos.push(slabRightGeo);

          const grillLeftGeo = new THREE.BoxGeometry(balconyWidth, 0.9, 0.05);
          grillLeftGeo.translate(-width * 0.25, floorY + 0.5, depth / 2 + balconyDepth);
          grillGeos.push(grillLeftGeo);

          const grillRightGeo = new THREE.BoxGeometry(balconyWidth, 0.9, 0.05);
          grillRightGeo.translate(width * 0.25, floorY + 0.5, depth / 2 + balconyDepth);
          grillGeos.push(grillRightGeo);

          const winLeftGeo = new THREE.BoxGeometry(balconyWidth * 0.8, 1.4, 0.05);
          winLeftGeo.translate(-width * 0.25, floorY + 1.2, depth / 2 + 0.02);
          winGeos.push(winLeftGeo);

          const winRightGeo = new THREE.BoxGeometry(balconyWidth * 0.8, 1.4, 0.05);
          winRightGeo.translate(width * 0.25, floorY + 1.2, depth / 2 + 0.02);
          winGeos.push(winRightGeo);
        }

        // 5. Ground-floor shops for commercial/market zones or select lots
        if (lot.zone === 'commercial' || lot.zone === 'market' || i % 2 === 0) {
          const shopWidth = width * 0.42;
          const shutterHeight = 2.4;

          const shutterLeftGeo = new THREE.BoxGeometry(shopWidth, shutterHeight, 0.1);
          shutterLeftGeo.translate(-width * 0.25, shutterHeight / 2, depth / 2 + 0.05);
          shutterGeos.push(shutterLeftGeo);

          const shutterRightGeo = new THREE.BoxGeometry(shopWidth, shutterHeight, 0.1);
          shutterRightGeo.translate(width * 0.25, shutterHeight / 2, depth / 2 + 0.05);
          shutterGeos.push(shutterRightGeo);

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

        const addMergedMesh = (geos: THREE.BufferGeometry[], mat: THREE.Material) => {
          if (geos.length === 0) return;
          const merged = mergeGeometries(geos, false);
          for (const g of geos) g.dispose();
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
      }

      group.add(buildingGroup);

      // Collider for physics and camera anti-clip
      const colliderGeo = new THREE.BoxGeometry(width, colliderHeight, depth);
      const colliderMesh = new THREE.Mesh(colliderGeo, this.colliderMat);
      colliderMesh.position.set(lot.x, colliderHeight / 2, lot.z);
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
