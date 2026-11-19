import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SignalPhase } from '../sim/traffic/signals';

function sharedMat<T extends THREE.Material>(mat: T): T {
  mat.userData.shared = true;
  return mat;
}

const PROP_MATS = {
  tinRoof: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x5a6577, roughness: 0.7, metalness: 0.5 })
  ),
  wood: sharedMat(new THREE.MeshStandardMaterial({ color: 0x6e4726, roughness: 0.9 })),
  kettle: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xdcdcdc, metalness: 0.9, roughness: 0.2 })
  ),
  fuelCanopy: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x117733, roughness: 0.4 })
  ),
  fuelTrim: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 })
  ),
  fuelPillar: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3 })
  ),
  fuelPump: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xdd2222, roughness: 0.5 })
  ),
  garageFrame: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xa8422b, roughness: 0.9 })
  ),
  garageShutter: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x4a6984, roughness: 0.6, metalness: 0.6 })
  ),
  garageSign: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xffbb00, roughness: 0.4 })
  ),
  footbridgeSteel: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x3d70b2, roughness: 0.5, metalness: 0.7 })
  ),
  footbridgeRail: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.5, metalness: 0.5 })
  ),
  concreteStand: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 })
  ),
  tankBlack: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 })
  ),
  wireLine: sharedMat(
    new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 2 })
  ),
  signBorder: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 })
  ),
  signalPole: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.65 })
  ),
  signalHousing: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.6, metalness: 0.3 })
  ),
  treeTrunk: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.95 })
  ),
  treeFoliage: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x2f6f3e, roughness: 0.85 })
  ),
  lampPole: sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.55, metalness: 0.6 })
  ),
  lampBulb: sharedMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef3c7,
      emissive: 0xfde68a,
      emissiveIntensity: 0.8,
      roughness: 0.3,
    })
  ),
};

export const SIGNAL_LENS_MATS = {
  redOn: sharedMat(
    new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff1111,
      emissiveIntensity: 2.4,
      roughness: 0.2,
    })
  ),
  redOff: sharedMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b0a0a,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.5,
    })
  ),
  yellowOn: sharedMat(
    new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      emissive: 0xffaa00,
      emissiveIntensity: 2.4,
      roughness: 0.2,
    })
  ),
  yellowOff: sharedMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b2e04,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.5,
    })
  ),
  greenOn: sharedMat(
    new THREE.MeshStandardMaterial({
      color: 0x22ff66,
      emissive: 0x00ee55,
      emissiveIntensity: 2.4,
      roughness: 0.2,
    })
  ),
  greenOff: sharedMat(
    new THREE.MeshStandardMaterial({
      color: 0x063317,
      emissive: 0x000000,
      emissiveIntensity: 0,
      roughness: 0.5,
    })
  ),
};

export interface TrafficSignalVisual {
  nodeId: string;
  approachIndex: number;
  group: THREE.Group;
  redLens: THREE.Mesh;
  yellowLens: THREE.Mesh;
  greenLens: THREE.Mesh;
  lastPhase: SignalPhase | null;
}

const SHARED_LENS_GEO = new THREE.CylinderGeometry(0.11, 0.11, 0.32, 10);
SHARED_LENS_GEO.rotateX(Math.PI / 2);
SHARED_LENS_GEO.userData.shared = true;

const SHARED_HOUSING_GEO = new THREE.BoxGeometry(0.36, 1.02, 0.26);
SHARED_HOUSING_GEO.userData.shared = true;

/**
 * Builds a 3D Dhaka cantilever traffic signal pole with live-swappable
 * red/yellow/green emissive lenses. Static mast/arm/housing stay separate from
 * the 3 lens meshes so per-frame signal updates swap materials with zero allocations.
 */
export function createTrafficSignalPole(
  nodeId: string,
  approachIndex: number
): TrafficSignalVisual {
  const group = new THREE.Group();
  group.name = `traffic_signal_${nodeId}_${approachIndex}`;
  group.userData = { nodeId, approachIndex };

  // Vertical pole + horizontal cantilever arm merged into 1 static pole mesh
  const mastGeo = new THREE.CylinderGeometry(0.09, 0.12, 5.5, 8);
  mastGeo.translate(0, 2.75, 0);
  const armGeo = new THREE.BoxGeometry(2.4, 0.12, 0.12);
  armGeo.translate(1.1, 5.35, 0);
  const poleMerged = mergeGeometries([mastGeo, armGeo], false);
  mastGeo.dispose();
  armGeo.dispose();
  if (poleMerged) {
    const poleMesh = new THREE.Mesh(poleMerged, PROP_MATS.signalPole);
    poleMesh.castShadow = true;
    poleMesh.receiveShadow = true;
    group.add(poleMesh);
  }

  // Signal housing suspended at end of cantilever arm (faces ±Z locally)
  const headX = 1.9;
  const headY = 4.9;
  const housing = new THREE.Mesh(SHARED_HOUSING_GEO, PROP_MATS.signalHousing);
  housing.position.set(headX, headY, 0);
  housing.castShadow = true;
  group.add(housing);

  const redLens = new THREE.Mesh(SHARED_LENS_GEO, SIGNAL_LENS_MATS.redOff);
  redLens.name = 'lens_red';
  redLens.position.set(headX, headY + 0.3, 0);
  group.add(redLens);

  const yellowLens = new THREE.Mesh(SHARED_LENS_GEO, SIGNAL_LENS_MATS.yellowOff);
  yellowLens.name = 'lens_yellow';
  yellowLens.position.set(headX, headY, 0);
  group.add(yellowLens);

  const greenLens = new THREE.Mesh(SHARED_LENS_GEO, SIGNAL_LENS_MATS.greenOn);
  greenLens.name = 'lens_green';
  greenLens.position.set(headX, headY - 0.3, 0);
  group.add(greenLens);

  return {
    nodeId,
    approachIndex,
    group,
    redLens,
    yellowLens,
    greenLens,
    lastPhase: 'green',
  };
}

/**
 * Updates a 3D traffic signal's emissive lenses to reflect SignalController phase.
 * Early-exits when the phase has not changed; zero heap allocations.
 */
export function syncTrafficSignalVisual(
  visual: TrafficSignalVisual,
  phase: SignalPhase
): void {
  if (visual.lastPhase === phase) return;
  visual.lastPhase = phase;
  visual.redLens.material = phase === 'red' ? SIGNAL_LENS_MATS.redOn : SIGNAL_LENS_MATS.redOff;
  visual.yellowLens.material =
    phase === 'yellow' ? SIGNAL_LENS_MATS.yellowOn : SIGNAL_LENS_MATS.yellowOff;
  visual.greenLens.material =
    phase === 'green' ? SIGNAL_LENS_MATS.greenOn : SIGNAL_LENS_MATS.greenOff;
}

export class RideMarker {
  readonly root: THREE.Group;
  private beacon: THREE.Mesh;
  private groundRing: THREE.Mesh;
  private animTime: number = 0;

  constructor(color: number) {
    this.root = new THREE.Group();
    this.root.visible = false;

    // Ground ring
    const ringGeo = new THREE.RingGeometry(1.2, 1.8, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
    });
    this.groundRing = new THREE.Mesh(ringGeo, ringMat);
    this.groundRing.rotation.x = -Math.PI / 2;
    this.groundRing.position.y = 0.05;
    this.root.add(this.groundRing);

    // Floating octahedron beacon
    const beaconGeo = new THREE.OctahedronGeometry(0.9, 0);
    const beaconMat = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.6,
      roughness: 0.2,
      metalness: 0.3,
    });
    this.beacon = new THREE.Mesh(beaconGeo, beaconMat);
    this.beacon.position.y = 2.5;
    this.root.add(this.beacon);

    // Translucent light cylinder beam
    const beamGeo = new THREE.CylinderGeometry(0.1, 0.8, 6, 16, 1, true);
    const beamMat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.y = 3.0;
    this.root.add(beam);
  }

  setPosition(x: number, z: number, y: number = 0): void {
    this.root.position.set(x, y, z);
  }

  setVisible(visible: boolean): void {
    this.root.visible = visible;
  }

  update(dt: number): void {
    if (!this.root.visible) return;
    this.animTime += dt;
    this.beacon.rotation.y += dt * 2.0;
    this.beacon.position.y = 2.5 + Math.sin(this.animTime * 3.0) * 0.35;
    const s = 1.0 + Math.sin(this.animTime * 2.5) * 0.12;
    this.groundRing.scale.set(s, s, s);
  }
}

export class RideMarkers {
  readonly root: THREE.Group;
  readonly pickup: RideMarker;
  readonly dropoff: RideMarker;

  constructor() {
    this.root = new THREE.Group();
    this.pickup = new RideMarker(0x00ff66); // Dhaka Green for pickup
    this.dropoff = new RideMarker(0xffaa00); // Amber Gold for dropoff
    this.root.add(this.pickup.root);
    this.root.add(this.dropoff.root);
  }

  setPickup(x: number, z: number, visible: boolean = true): void {
    this.pickup.setPosition(x, z);
    this.pickup.setVisible(visible);
  }

  setDropoff(x: number, z: number, visible: boolean = true): void {
    this.dropoff.setPosition(x, z);
    this.dropoff.setVisible(visible);
  }

  update(dt: number): void {
    this.pickup.update(dt);
    this.dropoff.update(dt);
  }
}

/**
 * Procedural Dhaka Tea Stall (Tong Dokan) with kettle, counter, and roadside benches.
 */
export function createTeaStallMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'teaStall';

  // Corrugated roof canopy
  const roofGeo = new THREE.BoxGeometry(3.2, 0.1, 2.6);
  const roof = new THREE.Mesh(roofGeo, PROP_MATS.tinRoof);
  roof.position.set(0, 2.5, 0);
  roof.rotation.x = 0.08;
  roof.castShadow = true;
  roof.receiveShadow = true;
  root.add(roof);

  // Merge 4 wooden posts + counter + roadside bench into 1 draw call
  const woodParts: THREE.BufferGeometry[] = [];
  for (const [px, pz] of [
    [-1.4, -1.1],
    [1.4, -1.1],
    [-1.4, 1.1],
    [1.4, 1.1],
  ] as const) {
    const p = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8);
    p.translate(px, 1.2, pz);
    woodParts.push(p);
  }
  const counterGeo = new THREE.BoxGeometry(2.4, 0.9, 0.8);
  counterGeo.translate(0, 0.45, 0);
  woodParts.push(counterGeo);

  const benchGeo = new THREE.BoxGeometry(2.6, 0.45, 0.35);
  benchGeo.translate(0, 0.225, 1.4);
  woodParts.push(benchGeo);

  const mergedWood = mergeGeometries(woodParts, false);
  for (const g of woodParts) g.dispose();
  if (mergedWood) {
    const woodMesh = new THREE.Mesh(mergedWood, PROP_MATS.wood);
    woodMesh.castShadow = true;
    woodMesh.receiveShadow = true;
    root.add(woodMesh);
  }

  // Tea kettle on counter
  const kettleGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.35, 12);
  const kettle = new THREE.Mesh(kettleGeo, PROP_MATS.kettle);
  kettle.position.set(-0.5, 1.075, 0);
  kettle.castShadow = true;
  root.add(kettle);

  return root;
}

/**
 * Procedural Fuel Station Canopy with pumps.
 */
export function createFuelCanopyMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'fuelCanopy';

  // Tall illuminated roof canopy + yellow trim band
  const canopyGeo = new THREE.BoxGeometry(8.0, 0.8, 6.0);
  const canopy = new THREE.Mesh(canopyGeo, PROP_MATS.fuelCanopy);
  canopy.position.set(0, 4.4, 0);
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  root.add(canopy);

  const trimGeo = new THREE.BoxGeometry(8.08, 0.16, 6.08);
  const trim = new THREE.Mesh(trimGeo, PROP_MATS.fuelTrim);
  trim.position.set(0, 4.12, 0);
  root.add(trim);

  // Support pillars merged
  const pil1 = new THREE.CylinderGeometry(0.3, 0.3, 4.0, 12);
  pil1.translate(-2.8, 2.0, 0);
  const pil2 = new THREE.CylinderGeometry(0.3, 0.3, 4.0, 12);
  pil2.translate(2.8, 2.0, 0);
  const mergedPillars = mergeGeometries([pil1, pil2], false);
  pil1.dispose();
  pil2.dispose();
  if (mergedPillars) {
    const pilMesh = new THREE.Mesh(mergedPillars, PROP_MATS.fuelPillar);
    pilMesh.castShadow = true;
    pilMesh.receiveShadow = true;
    root.add(pilMesh);
  }

  // Fuel pumps merged
  const p1 = new THREE.BoxGeometry(0.8, 1.8, 0.6);
  p1.translate(-1.0, 0.9, 0);
  const p2 = new THREE.BoxGeometry(0.8, 1.8, 0.6);
  p2.translate(1.0, 0.9, 0);
  const mergedPumps = mergeGeometries([p1, p2], false);
  p1.dispose();
  p2.dispose();
  if (mergedPumps) {
    const pumpMesh = new THREE.Mesh(mergedPumps, PROP_MATS.fuelPump);
    pumpMesh.castShadow = true;
    pumpMesh.receiveShadow = true;
    root.add(pumpMesh);
  }

  return root;
}

/**
 * Procedural Mechanic Garage Shutter door with signage.
 */
export function createGarageShutterMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'garageShutter';

  // Brick workshop frame
  const frameGeo = new THREE.BoxGeometry(4.2, 3.2, 0.5);
  const frame = new THREE.Mesh(frameGeo, PROP_MATS.garageFrame);
  frame.position.set(0, 1.6, 0);
  frame.castShadow = true;
  frame.receiveShadow = true;
  root.add(frame);

  // Corrugated steel roll-up shutter (half open)
  const shutterGeo = new THREE.BoxGeometry(3.2, 2.2, 0.1);
  const shutter = new THREE.Mesh(shutterGeo, PROP_MATS.garageShutter);
  shutter.position.set(0, 1.7, 0.22);
  shutter.castShadow = true;
  root.add(shutter);

  // Yellow workshop header signboard
  const signGeo = new THREE.BoxGeometry(3.6, 0.6, 0.12);
  const sign = new THREE.Mesh(signGeo, PROP_MATS.garageSign);
  sign.position.set(0, 3.1, 0.28);
  root.add(sign);

  return root;
}

/**
 * Procedural Overhead Footbridge spanning road traffic cleanly outside kerbs.
 */
export function createFootbridgeMesh(spanWidth = 14.0): THREE.Group {
  const root = new THREE.Group();
  root.name = 'footbridge';

  const safeSpan = Math.max(11.2, spanWidth);
  const towerOffset = safeSpan / 2;

  // Central walkway + left and right stair towers merged into 1 steel mesh
  const steelParts: THREE.BufferGeometry[] = [];
  const walkwayGeo = new THREE.BoxGeometry(safeSpan + 1.2, 0.4, 2.2);
  walkwayGeo.translate(0, 5.2, 0);
  steelParts.push(walkwayGeo);

  const t1 = new THREE.BoxGeometry(1.4, 5.2, 2.2);
  t1.translate(-towerOffset, 2.6, 0);
  steelParts.push(t1);

  const t2 = new THREE.BoxGeometry(1.4, 5.2, 2.2);
  t2.translate(towerOffset, 2.6, 0);
  steelParts.push(t2);

  const mergedSteel = mergeGeometries(steelParts, false);
  for (const g of steelParts) g.dispose();
  if (mergedSteel) {
    const steelMesh = new THREE.Mesh(mergedSteel, PROP_MATS.footbridgeSteel);
    steelMesh.castShadow = true;
    steelMesh.receiveShadow = true;
    root.add(steelMesh);
  }

  // Safety railings (solid slim bars instead of wireframe for clean shading + low draw calls)
  const railParts: THREE.BufferGeometry[] = [];
  for (const zOff of [-1.05, 1.05]) {
    const topBar = new THREE.BoxGeometry(safeSpan + 1.2, 0.08, 0.08);
    topBar.translate(0, 6.25, zOff);
    railParts.push(topBar);
    const midBar = new THREE.BoxGeometry(safeSpan + 1.2, 0.06, 0.06);
    midBar.translate(0, 5.8, zOff);
    railParts.push(midBar);
  }
  const mergedRail = mergeGeometries(railParts, false);
  for (const g of railParts) g.dispose();
  if (mergedRail) {
    root.add(new THREE.Mesh(mergedRail, PROP_MATS.footbridgeRail));
  }

  return root;
}

/**
 * Procedural Rooftop Water Tank (classic black cylindrical Gazi tank).
 */
export function createRooftopWaterTankMesh(): THREE.Group {
  const root = new THREE.Group();

  const standGeo = new THREE.BoxGeometry(1.4, 0.4, 1.4);
  const stand = new THREE.Mesh(standGeo, PROP_MATS.concreteStand);
  stand.position.set(0, 0.2, 0);
  root.add(stand);

  const tankGeo = new THREE.CylinderGeometry(0.65, 0.65, 1.4, 12);
  const tank = new THREE.Mesh(tankGeo, PROP_MATS.tankBlack);
  tank.position.set(0, 1.1, 0);
  root.add(tank);

  return root;
}

/**
 * Procedural Tangled Overhead Wires (Dhaka electrical cables).
 */
export function createOverheadWiresMesh(): THREE.Group {
  const root = new THREE.Group();

  for (let i = 0; i < 4; i++) {
    const points: THREE.Vector3[] = [];
    const zOffset = (i - 1.5) * 0.4;
    const sag = 0.4 + i * 0.15;
    points.push(new THREE.Vector3(-10, 6.0, zOffset));
    points.push(new THREE.Vector3(0, 6.0 - sag, zOffset + 0.1));
    points.push(new THREE.Vector3(10, 6.0, zOffset));

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
    const line = new THREE.Line(geometry, PROP_MATS.wireLine);
    root.add(line);
  }

  return root;
}

/**
 * Procedural Shop Signboard with Dhaka storefront banner style.
 */
export function createShopSignboardMesh(color: number = 0xd32f2f): THREE.Group {
  const root = new THREE.Group();

  const boardGeo = new THREE.BoxGeometry(2.8, 0.8, 0.08);
  const boardMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.4,
  });
  const board = new THREE.Mesh(boardGeo, boardMat);
  board.position.set(0, 2.8, 0);
  root.add(board);

  const borderGeo = new THREE.BoxGeometry(2.9, 0.9, 0.06);
  const border = new THREE.Mesh(borderGeo, PROP_MATS.signBorder);
  border.position.set(0, 2.8, -0.02);
  root.add(border);

  return root;
}

/**
 * Procedural fallback streetlamp pole (used when Kenney prop_streetlight GLB is not preloaded).
 */
export function createStreetlightFallback(): THREE.Group {
  const root = new THREE.Group();
  const post = new THREE.CylinderGeometry(0.06, 0.09, 5.2, 6);
  post.translate(0, 2.6, 0);
  const arm = new THREE.BoxGeometry(0.08, 0.08, 1.4);
  arm.translate(0, 5.15, -0.65);
  const merged = mergeGeometries([post, arm], false);
  post.dispose();
  arm.dispose();
  if (merged) {
    const m = new THREE.Mesh(merged, PROP_MATS.lampPole);
    m.castShadow = true;
    root.add(m);
  }
  const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.1, 0.5), PROP_MATS.lampBulb);
  bulb.position.set(0, 5.08, -1.2);
  root.add(bulb);
  return root;
}

/**
 * Procedural fallback Dhaka roadside tree (used when Kenney prop_tree GLB is not preloaded).
 */
export function createTreeFallback(large = true): THREE.Group {
  const root = new THREE.Group();
  const h = large ? 2.8 : 2.0;
  const r = large ? 1.5 : 1.05;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.22, h, 6), PROP_MATS.treeTrunk);
  trunk.position.y = h / 2;
  trunk.castShadow = true;
  root.add(trunk);

  const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), PROP_MATS.treeFoliage);
  crown.position.y = h + r * 0.7;
  crown.castShadow = true;
  crown.receiveShadow = true;
  root.add(crown);
  return root;
}
