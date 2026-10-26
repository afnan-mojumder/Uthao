import * as THREE from 'three';
import {
  createBengaliSignboardTexture,
} from './textures';
import {
  createTeaStallMesh,
  createFuelCanopyMesh,
  createGarageShutterMesh,
  createRooftopWaterTankMesh,
} from '../props';

/**
 * Rich procedural low-poly architectural prefabs inspired by Dhaka neighborhoods.
 */

const DHAKA_PALETTE = [
  0xb89078, // Terracotta / warm brick
  0x7c9885, // Weathered pistachio green
  0x9da3a4, // Concrete grey
  0xd4a373, // Ochre / mustard plaster
  0x607d8b, // Dusty blue-grey
  0xc57b57, // Rust red
  0x8d99ae, // Lavender slate
];

/**
 * Multi-story Dhaka residential apartment building with balconies, windows, and rooftop tank.
 */
export function createDhakaApartment(
  floors: number = 4,
  width: number = 18,
  depth: number = 18,
  colorIndex: number = 0
): THREE.Group {
  const root = new THREE.Group();
  const floorHeight = 3.2;
  const totalHeight = floors * floorHeight;

  // Main building mass
  const color = DHAKA_PALETTE[colorIndex % DHAKA_PALETTE.length] ?? 0x9da3a4;
  const bldgMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.85,
    metalness: 0.1,
  });
  const bldgGeo = new THREE.BoxGeometry(width, totalHeight, depth);
  const mainBody = new THREE.Mesh(bldgGeo, bldgMat);
  mainBody.position.y = totalHeight / 2;
  mainBody.castShadow = true;
  mainBody.receiveShadow = true;
  root.add(mainBody);

  // Balconies and windows per floor
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.2,
    metalness: 0.8,
  });
  const balconyMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.7,
  });
  const railMat = new THREE.MeshBasicMaterial({ color: 0x111111, wireframe: true });

  const winGeo = new THREE.BoxGeometry(1.8, 1.4, 0.2);
  const balconyGeo = new THREE.BoxGeometry(3.6, 0.2, 1.4);
  const railGeo = new THREE.BoxGeometry(3.6, 0.8, 1.4);

  for (let f = 1; f < floors; f++) {
    const y = f * floorHeight + 1.2;

    // Front balconies
    const b1 = new THREE.Mesh(balconyGeo, balconyMat);
    b1.position.set(-width / 4, y - 0.6, depth / 2 + 0.7);
    root.add(b1);

    const r1 = new THREE.Mesh(railGeo, railMat);
    r1.position.set(-width / 4, y - 0.2, depth / 2 + 0.7);
    root.add(r1);

    // Front windows
    const w1 = new THREE.Mesh(winGeo, windowMat);
    w1.position.set(width / 4, y, depth / 2 + 0.05);
    root.add(w1);

    // Side windows
    const sw1 = new THREE.Mesh(winGeo, windowMat);
    sw1.rotation.y = Math.PI / 2;
    sw1.position.set(width / 2 + 0.05, y, 0);
    root.add(sw1);
  }

  // Rooftop parapet
  const parapetGeo = new THREE.BoxGeometry(width + 0.4, 0.8, depth + 0.4);
  const parapetMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
  const parapet = new THREE.Mesh(parapetGeo, parapetMat);
  parapet.position.y = totalHeight + 0.4;
  root.add(parapet);

  // Rooftop water tank (Gazi tank)
  const tank = createRooftopWaterTankMesh();
  tank.position.set(-width / 4, totalHeight, -depth / 4);
  root.add(tank);

  // Rooftop stairwell shed
  const shedGeo = new THREE.BoxGeometry(4.0, 2.4, 4.0);
  const shedMat = new THREE.MeshStandardMaterial({ color: 0x64748b });
  const shed = new THREE.Mesh(shedGeo, shedMat);
  shed.position.set(width / 4, totalHeight + 1.2, width / 4);
  root.add(shed);

  return root;
}

/**
 * Mixed-use commercial building with ground floor shops and prominent Bengali signboards.
 */
export function createCommercialBlock(
  width: number = 20,
  height: number = 18,
  depth: number = 16,
  signTitle: string = 'জনতা ফার্মেসি ও সার্জিক্যাল',
  signSub: string = 'Janata Pharmacy · 24/7 Service',
  signBg: string = '#15803d'
): THREE.Group {
  const root = new THREE.Group();

  // Main concrete body
  const bodyGeo = new THREE.BoxGeometry(width, height, depth);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.7,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = height / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  root.add(body);

  // Ground floor commercial glass recessed section
  const shopGeo = new THREE.BoxGeometry(width - 1.0, 3.4, 0.4);
  const shopMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.1,
    metalness: 0.9,
  });
  const shop = new THREE.Mesh(shopGeo, shopMat);
  shop.position.set(0, 1.7, depth / 2 + 0.1);
  root.add(shop);

  // Bengali signboard across shopfront
  const signTex = createBengaliSignboardTexture(signTitle, signSub, signBg, '#ffffff');
  const signGeo = new THREE.BoxGeometry(width - 2.0, 1.2, 0.15);
  const signMat = new THREE.MeshStandardMaterial({
    map: signTex,
    roughness: 0.3,
  });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 3.8, depth / 2 + 0.2);
  root.add(sign);

  // Upper office floor window grid
  const windowMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.1,
    metalness: 0.7,
  });
  const winGeo = new THREE.BoxGeometry(2.4, 1.6, 0.1);

  for (let y = 6.5; y < height - 1.5; y += 3.2) {
    for (let x = -width / 2 + 3; x <= width / 2 - 3; x += 4.5) {
      const win = new THREE.Mesh(winGeo, windowMat);
      win.position.set(x, y, depth / 2 + 0.05);
      root.add(win);
    }
  }

  return root;
}

/**
 * Kamal Bhai's Motorcycle Garage (Kamal Auto Workshop) with shutters and roadside tires.
 */
export function createKamalGarageWorkshop(): THREE.Group {
  const root = new THREE.Group();

  // Workshop building
  const bldgGeo = new THREE.BoxGeometry(14, 6.0, 10);
  const bldgMat = new THREE.MeshStandardMaterial({
    color: 0x8b5a2b, // Dark brick plaster
    roughness: 0.9,
  });
  const bldg = new THREE.Mesh(bldgGeo, bldgMat);
  bldg.position.set(0, 3.0, 0);
  bldg.castShadow = true;
  root.add(bldg);

  // Large double roll-up shutter
  const shutter1 = createGarageShutterMesh();
  shutter1.position.set(-3.2, 0, 5.05);
  root.add(shutter1);

  const shutter2 = createGarageShutterMesh();
  shutter2.position.set(3.2, 0, 5.05);
  root.add(shutter2);

  // Large Bengali Workshop Signboard
  const signTex = createBengaliSignboardTexture(
    'মেসার্স কামাল ভাই অটো সার্ভিস',
    'Kamal Bhai Auto Service · বাইক মেরামত ও পার্টস',
    '#f59e0b',
    '#0f172a'
  );
  const signGeo = new THREE.BoxGeometry(12, 1.4, 0.15);
  const signMat = new THREE.MeshStandardMaterial({ map: signTex });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 5.2, 5.2);
  root.add(sign);

  // Stack of used motorcycle tires outside
  const tireGeo = new THREE.TorusGeometry(0.35, 0.12, 8, 16);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const tire = new THREE.Mesh(tireGeo, tireMat);
    tire.rotation.x = Math.PI / 2;
    tire.position.set(6.0, 0.15 + i * 0.22, 5.6);
    root.add(tire);
  }

  // Metal oil barrel (200L blue drum)
  const drumGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 12);
  const drumMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5, metalness: 0.4 });
  const drum = new THREE.Mesh(drumGeo, drumMat);
  drum.position.set(6.2, 0.45, 4.6);
  root.add(drum);

  return root;
}

/**
 * Complete Dhaka Petrol Pump / CNG Station with green canopy, pumps, and price board.
 */
export function createDhakaFuelStation(): THREE.Group {
  const root = new THREE.Group();

  // Ground concrete apron
  const apronGeo = new THREE.PlaneGeometry(24, 18);
  const apronMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7 });
  const apron = new THREE.Mesh(apronGeo, apronMat);
  apron.rotation.x = -Math.PI / 2;
  apron.position.y = 0.02;
  apron.receiveShadow = true;
  root.add(apron);

  // Green canopy & pumps
  const canopy = createFuelCanopyMesh();
  canopy.position.set(0, 0, 0);
  root.add(canopy);

  // Station Convenience kiosk behind pumps
  const kioskGeo = new THREE.BoxGeometry(10, 3.5, 4);
  const kioskMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.4 });
  const kiosk = new THREE.Mesh(kioskGeo, kioskMat);
  kiosk.position.set(0, 1.75, -7.0);
  root.add(kiosk);

  // Tall price totem pole sign
  const totemGeo = new THREE.BoxGeometry(1.2, 5.0, 0.4);
  const totemTex = createBengaliSignboardTexture(
    'পদ্মা অয়েল',
    'Petrol · Octane · CNG',
    '#15803d',
    '#ffffff'
  );
  const totemMat = new THREE.MeshStandardMaterial({ map: totemTex });
  const totem = new THREE.Mesh(totemGeo, totemMat);
  totem.position.set(-10, 2.5, 6);
  root.add(totem);

  return root;
}

/**
 * Low-poly Mosque landmark used respectfully as environmental city architecture.
 */
export function createDhakaMosque(): THREE.Group {
  const root = new THREE.Group();

  // Main white prayer hall
  const hallGeo = new THREE.BoxGeometry(16, 8, 16);
  const hallMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.5,
  });
  const hall = new THREE.Mesh(hallGeo, hallMat);
  hall.position.y = 4.0;
  hall.castShadow = true;
  root.add(hall);

  // Green central dome
  const domeGeo = new THREE.SphereGeometry(3.6, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2);
  const domeMat = new THREE.MeshStandardMaterial({
    color: 0x059669, // Emerald green dome
    roughness: 0.3,
    metalness: 0.2,
  });
  const dome = new THREE.Mesh(domeGeo, domeMat);
  dome.position.set(0, 8.0, 0);
  root.add(dome);

  // Slender octagonal minaret tower
  const minaretGeo = new THREE.CylinderGeometry(0.9, 1.2, 18, 8);
  const minaret = new THREE.Mesh(minaretGeo, hallMat);
  minaret.position.set(7.5, 9.0, 7.5);
  minaret.castShadow = true;
  root.add(minaret);

  // Minaret small green dome cap
  const capGeo = new THREE.ConeGeometry(1.0, 2.5, 8);
  const cap = new THREE.Mesh(capGeo, domeMat);
  cap.position.set(7.5, 19.25, 7.5);
  root.add(cap);

  return root;
}

/**
 * Unfinished Dhaka concrete construction site with exposed rebar and green safety mesh.
 */
export function createConstructionSite(): THREE.Group {
  const root = new THREE.Group();

  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.9 });
  const pillarGeo = new THREE.BoxGeometry(0.6, 7.0, 0.6);
  const slabGeo = new THREE.BoxGeometry(14, 0.4, 14);

  // Ground slab
  const s0 = new THREE.Mesh(slabGeo, concreteMat);
  s0.position.y = 0.2;
  root.add(s0);

  // Level 1 slab
  const s1 = new THREE.Mesh(slabGeo, concreteMat);
  s1.position.y = 3.6;
  root.add(s1);

  // Roof slab
  const s2 = new THREE.Mesh(slabGeo, concreteMat);
  s2.position.y = 7.0;
  root.add(s2);

  // Exposed pillars and rebar
  const rebarGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.2, 6);
  const rebarMat = new THREE.MeshStandardMaterial({ color: 0x7c2d12, metalness: 0.6 }); // Rusted iron

  for (let x = -5.5; x <= 5.5; x += 5.5) {
    for (let z = -5.5; z <= 5.5; z += 5.5) {
      const pil = new THREE.Mesh(pillarGeo, concreteMat);
      pil.position.set(x, 3.5, z);
      root.add(pil);

      // Rebar extending out top
      const reb = new THREE.Mesh(rebarGeo, rebarMat);
      reb.position.set(x, 7.6, z);
      root.add(reb);
    }
  }

  // Green safety mesh banner
  const meshGeo = new THREE.BoxGeometry(13.8, 2.8, 0.1);
  const meshMat = new THREE.MeshStandardMaterial({
    color: 0x166534,
    transparent: true,
    opacity: 0.85,
  });
  const net = new THREE.Mesh(meshGeo, meshMat);
  net.position.set(0, 5.3, 6.95);
  root.add(net);

  return root;
}

/**
 * Low-poly banyan / neem street tree.
 */
export function createDhakaTree(): THREE.Group {
  const root = new THREE.Group();

  // Bark trunk
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3.2, 8);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x452814, roughness: 0.9 });
  const trunk = new THREE.Mesh(trunkGeo, trunkMat);
  trunk.position.y = 1.6;
  trunk.castShadow = true;
  root.add(trunk);

  // Multi-sphere foliage canopy
  const foliageMat = new THREE.MeshStandardMaterial({
    color: 0x2e7d32, // Tropical lush green
    roughness: 0.8,
    flatShading: true,
  });

  const c1 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.8, 1), foliageMat);
  c1.position.set(0, 3.8, 0);
  root.add(c1);

  const c2 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3, 1), foliageMat);
  c2.position.set(-0.9, 3.4, 0.4);
  root.add(c2);

  const c3 = new THREE.Mesh(new THREE.DodecahedronGeometry(1.4, 1), foliageMat);
  c3.position.set(0.8, 3.5, -0.5);
  root.add(c3);

  return root;
}

/**
 * Large highway billboard advertising Uthao or local services.
 */
export function createDhakaBillboard(
  mainText: string = 'উধাও — দ্রুত ও নিরাপদ রাইড',
  subText: string = 'Download Uthao App Today · ৳৫০ Discount',
  bgColor: string = '#0284c7'
): THREE.Group {
  const root = new THREE.Group();

  // Steel supporting pylon
  const pylonGeo = new THREE.CylinderGeometry(0.35, 0.4, 8.0, 8);
  const pylonMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6 });
  const pylon = new THREE.Mesh(pylonGeo, pylonMat);
  pylon.position.y = 4.0;
  root.add(pylon);

  // Horizontal billboard board
  const boardTex = createBengaliSignboardTexture(mainText, subText, bgColor, '#ffffff');
  const boardGeo = new THREE.BoxGeometry(10.0, 3.6, 0.2);
  const boardMat = new THREE.MeshStandardMaterial({ map: boardTex });
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.set(0, 9.2, 0);
  board.castShadow = true;
  root.add(board);

  return root;
}

export { createTeaStallMesh };
