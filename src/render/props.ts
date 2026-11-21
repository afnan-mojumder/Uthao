import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { SignalPhase } from '../sim/traffic/signals';

function sharedMat<T extends THREE.Material>(mat: T): T {
  mat.userData.shared = true;
  return mat;
}

const SHARED_POI_MAT = sharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness: 0.65,
    metalness: 0.25,
  })
);

interface ColoredGeoPart {
  geo: THREE.BufferGeometry;
  color: number;
  pos?: [number, number, number];
  rotX?: number;
}

/**
 * Normalizes and merges colored sub-geometries into a single draw call using SHARED_POI_MAT.
 * Disposes all input geometries.
 */
function buildVertexColoredMesh(
  parts: readonly ColoredGeoPart[],
  receiveShadow = true
): THREE.Mesh | null {
  const geos: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();
  const m = new THREE.Matrix4();
  const euler = new THREE.Euler();

  for (const part of parts) {
    const g = part.geo.index ? part.geo.toNonIndexed() : part.geo.clone();
    part.geo.dispose();
    if (part.rotX) {
      euler.set(part.rotX, 0, 0);
      m.makeRotationFromEuler(euler);
    } else {
      m.identity();
    }
    if (part.pos) {
      m.setPosition(part.pos[0], part.pos[1], part.pos[2]);
    }
    g.applyMatrix4(m);
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    const pos = g.getAttribute('position');
    if (pos) {
      if (!g.getAttribute('uv')) {
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
      }
      color.setHex(part.color);
      const cols = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) {
        cols[i * 3] = color.r;
        cols[i * 3 + 1] = color.g;
        cols[i * 3 + 2] = color.b;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    }
    geos.push(g);
  }

  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  if (!merged) return null;
  const mesh = new THREE.Mesh(merged, SHARED_POI_MAT);
  mesh.castShadow = false;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

const PROP_MATS = {
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

/**
 * Builds a 3D Dhaka cantilever traffic signal pole with live-swappable
 * red/yellow/green emissive lenses. Static mast, arm, and housing merge into 1
 * vertex-colored mesh while the 3 lens meshes stay separate for zero-alloc material swaps.
 */
export function createTrafficSignalPole(
  nodeId: string,
  approachIndex: number
): TrafficSignalVisual {
  const group = new THREE.Group();
  group.name = `traffic_signal_${nodeId}_${approachIndex}`;
  group.userData = { nodeId, approachIndex };

  const headX = 1.9;
  const headY = 4.9;
  const poleHousing = buildVertexColoredMesh([
    { geo: new THREE.CylinderGeometry(0.09, 0.12, 5.5, 8), color: 0x334155, pos: [0, 2.75, 0] },
    { geo: new THREE.BoxGeometry(2.4, 0.12, 0.12), color: 0x334155, pos: [1.1, 5.35, 0] },
    { geo: new THREE.BoxGeometry(0.36, 1.02, 0.26), color: 0x111827, pos: [headX, headY, 0] },
  ]);
  if (poleHousing) {
    group.add(poleHousing);
  }

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

  dispose(): void {
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const geo = obj.geometry as THREE.BufferGeometry | undefined;
        const mat = obj.material as THREE.Material | THREE.Material[] | undefined;
        geo?.dispose();
        if (Array.isArray(mat)) {
          for (const m of mat) m.dispose();
        } else {
          mat?.dispose();
        }
      }
    });
  }
}

export class RideMarkers {
  readonly root: THREE.Group;
  readonly pickup: RideMarker;
  readonly dropoff: RideMarker;
  readonly stop: RideMarker;
  readonly mission: RideMarker;

  constructor() {
    this.root = new THREE.Group();
    this.pickup = new RideMarker(0x00ff66); // Dhaka Green for pickup
    this.dropoff = new RideMarker(0xffaa00); // Amber Gold for dropoff
    this.stop = new RideMarker(0x38bdf8); // Sky Blue for intermediate stops & return waypoints
    this.mission = new RideMarker(0xa855f7); // Vivid Violet for active campaign/side mission target
    this.root.add(this.pickup.root);
    this.root.add(this.dropoff.root);
    this.root.add(this.stop.root);
    this.root.add(this.mission.root);
  }

  setPickup(x: number, z: number, visible: boolean = true): void {
    this.pickup.setPosition(x, z);
    this.pickup.setVisible(visible);
  }

  setDropoff(x: number, z: number, visible: boolean = true): void {
    this.dropoff.setPosition(x, z);
    this.dropoff.setVisible(visible);
  }

  setStop(x: number, z: number, visible: boolean = true): void {
    this.stop.setPosition(x, z);
    this.stop.setVisible(visible);
  }

  setMission(x: number, z: number, visible: boolean = true): void {
    this.mission.setPosition(x, z);
    this.mission.setVisible(visible);
  }

  update(dt: number): void {
    this.pickup.update(dt);
    this.dropoff.update(dt);
    this.stop.update(dt);
    this.mission.update(dt);
  }

  dispose(): void {
    this.pickup.dispose();
    this.dropoff.dispose();
    this.stop.dispose();
    this.mission.dispose();
  }
}

/**
 * Procedural Dhaka Tea Stall (Tong Dokan) merged into a single vertex-colored mesh.
 */
export function createTeaStallMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'teaStall';

  const parts: ColoredGeoPart[] = [
    { geo: new THREE.BoxGeometry(3.2, 0.1, 2.6), color: 0x5a6577, pos: [0, 2.5, 0], rotX: 0.08 },
    { geo: new THREE.BoxGeometry(2.4, 0.9, 0.8), color: 0x6e4726, pos: [0, 0.45, 0] },
    { geo: new THREE.BoxGeometry(2.6, 0.45, 0.35), color: 0x6e4726, pos: [0, 0.225, 1.4] },
    { geo: new THREE.CylinderGeometry(0.18, 0.22, 0.35, 12), color: 0xdcdcdc, pos: [-0.5, 1.075, 0] },
  ];
  for (const [px, pz] of [
    [-1.4, -1.1],
    [1.4, -1.1],
    [-1.4, 1.1],
    [1.4, 1.1],
  ] as const) {
    parts.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8), color: 0x6e4726, pos: [px, 1.2, pz] });
  }

  const mesh = buildVertexColoredMesh(parts);
  if (mesh) root.add(mesh);
  return root;
}

/**
 * Procedural Fuel Station Canopy with pumps merged into a single draw call.
 */
export function createFuelCanopyMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'fuelCanopy';

  const mesh = buildVertexColoredMesh([
    { geo: new THREE.BoxGeometry(8.0, 0.8, 6.0), color: 0x117733, pos: [0, 4.4, 0] },
    { geo: new THREE.BoxGeometry(8.08, 0.16, 6.08), color: 0xfacc15, pos: [0, 4.12, 0] },
    { geo: new THREE.CylinderGeometry(0.3, 0.3, 4.0, 12), color: 0xdddddd, pos: [-2.8, 2.0, 0] },
    { geo: new THREE.CylinderGeometry(0.3, 0.3, 4.0, 12), color: 0xdddddd, pos: [2.8, 2.0, 0] },
    { geo: new THREE.BoxGeometry(0.8, 1.8, 0.6), color: 0xdd2222, pos: [-1.0, 0.9, 0] },
    { geo: new THREE.BoxGeometry(0.8, 1.8, 0.6), color: 0xdd2222, pos: [1.0, 0.9, 0] },
  ]);
  if (mesh) root.add(mesh);
  return root;
}

/**
 * Procedural Mechanic Garage Shutter door merged into a single draw call.
 */
export function createGarageShutterMesh(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'garageShutter';

  const mesh = buildVertexColoredMesh([
    { geo: new THREE.BoxGeometry(4.2, 3.2, 0.5), color: 0xa8422b, pos: [0, 1.6, 0] },
    { geo: new THREE.BoxGeometry(3.2, 2.2, 0.1), color: 0x4a6984, pos: [0, 1.7, 0.22] },
    { geo: new THREE.BoxGeometry(3.6, 0.6, 0.12), color: 0xffbb00, pos: [0, 3.1, 0.28] },
  ]);
  if (mesh) root.add(mesh);
  return root;
}

/**
 * Procedural Overhead Footbridge merged into a single draw call.
 */
export function createFootbridgeMesh(spanWidth = 14.0): THREE.Group {
  const root = new THREE.Group();
  root.name = 'footbridge';

  const safeSpan = Math.max(11.2, spanWidth);
  const towerOffset = safeSpan / 2;

  const parts: ColoredGeoPart[] = [
    { geo: new THREE.BoxGeometry(safeSpan + 1.2, 0.4, 2.2), color: 0x3d70b2, pos: [0, 5.2, 0] },
    { geo: new THREE.BoxGeometry(1.4, 5.2, 2.2), color: 0x3d70b2, pos: [-towerOffset, 2.6, 0] },
    { geo: new THREE.BoxGeometry(1.4, 5.2, 2.2), color: 0x3d70b2, pos: [towerOffset, 2.6, 0] },
  ];
  for (const zOff of [-1.05, 1.05]) {
    parts.push({ geo: new THREE.BoxGeometry(safeSpan + 1.2, 0.08, 0.08), color: 0xdbeafe, pos: [0, 6.25, zOff] });
    parts.push({ geo: new THREE.BoxGeometry(safeSpan + 1.2, 0.06, 0.06), color: 0xdbeafe, pos: [0, 5.8, zOff] });
  }

  const mesh = buildVertexColoredMesh(parts);
  if (mesh) root.add(mesh);
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
    m.castShadow = false;
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
  trunk.castShadow = false;
  root.add(trunk);

  const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), PROP_MATS.treeFoliage);
  crown.position.y = h + r * 0.7;
  crown.castShadow = false;
  crown.receiveShadow = true;
  root.add(crown);
  return root;
}
