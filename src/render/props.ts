import * as THREE from 'three';

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

  // Corrugated roof canopy
  const roofGeo = new THREE.BoxGeometry(3.2, 0.1, 2.6);
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x5a6577, // Corrugated tin sheet grey
    roughness: 0.7,
    metalness: 0.5,
  });
  const roof = new THREE.Mesh(roofGeo, roofMat);
  roof.position.set(0, 2.5, 0);
  roof.rotation.x = 0.08;
  root.add(roof);

  // 4 Bamboo / wooden posts
  const postGeo = new THREE.CylinderGeometry(0.05, 0.05, 2.4, 8);
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4726, roughness: 0.9 });

  const p1 = new THREE.Mesh(postGeo, woodMat);
  p1.position.set(-1.4, 1.2, -1.1);
  root.add(p1);

  const p2 = new THREE.Mesh(postGeo, woodMat);
  p2.position.set(1.4, 1.2, -1.1);
  root.add(p2);

  const p3 = new THREE.Mesh(postGeo, woodMat);
  p3.position.set(-1.4, 1.2, 1.1);
  root.add(p3);

  const p4 = new THREE.Mesh(postGeo, woodMat);
  p4.position.set(1.4, 1.2, 1.1);
  root.add(p4);

  // Wooden wooden counter / table
  const counterGeo = new THREE.BoxGeometry(2.4, 0.9, 0.8);
  const counter = new THREE.Mesh(counterGeo, woodMat);
  counter.position.set(0, 0.45, 0);
  root.add(counter);

  // Tea kettle on counter
  const kettleGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.35, 12);
  const kettleMat = new THREE.MeshStandardMaterial({
    color: 0xdcdcdc, // Aluminum chai kettle
    metalness: 0.9,
    roughness: 0.2,
  });
  const kettle = new THREE.Mesh(kettleGeo, kettleMat);
  kettle.position.set(-0.5, 1.05, 0);
  root.add(kettle);

  // Wooden roadside benches
  const benchGeo = new THREE.BoxGeometry(2.6, 0.45, 0.35);
  const b1 = new THREE.Mesh(benchGeo, woodMat);
  b1.position.set(0, 0.22, 1.4);
  root.add(b1);

  return root;
}

/**
 * Procedural Fuel Station Canopy with pumps.
 */
export function createFuelCanopyMesh(): THREE.Group {
  const root = new THREE.Group();

  // Tall illuminated roof canopy
  const canopyGeo = new THREE.BoxGeometry(8.0, 0.8, 6.0);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0x117733, // Green fuel canopy (Padma / Meghna style)
    roughness: 0.4,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.set(0, 4.4, 0);
  root.add(canopy);

  // Support pillars
  const pillarGeo = new THREE.CylinderGeometry(0.3, 0.3, 4.0, 16);
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.3 });

  const pil1 = new THREE.Mesh(pillarGeo, pillarMat);
  pil1.position.set(-2.8, 2.0, 0);
  root.add(pil1);

  const pil2 = new THREE.Mesh(pillarGeo, pillarMat);
  pil2.position.set(2.8, 2.0, 0);
  root.add(pil2);

  // Fuel pumps
  const pumpGeo = new THREE.BoxGeometry(0.8, 1.8, 0.6);
  const pumpMat = new THREE.MeshStandardMaterial({ color: 0xdd2222, roughness: 0.5 });

  const pump1 = new THREE.Mesh(pumpGeo, pumpMat);
  pump1.position.set(-1.0, 0.9, 0);
  root.add(pump1);

  const pump2 = new THREE.Mesh(pumpGeo, pumpMat);
  pump2.position.set(1.0, 0.9, 0);
  root.add(pump2);

  return root;
}

/**
 * Procedural Mechanic Garage Shutter door with signage.
 */
export function createGarageShutterMesh(): THREE.Group {
  const root = new THREE.Group();

  // Brick workshop frame
  const frameGeo = new THREE.BoxGeometry(4.2, 3.2, 0.5);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xa8422b, roughness: 0.9 });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.set(0, 1.6, 0);
  root.add(frame);

  // Corrugated steel roll-up shutter (half open)
  const shutterGeo = new THREE.BoxGeometry(3.2, 2.2, 0.1);
  const shutterMat = new THREE.MeshStandardMaterial({
    color: 0x4a6984, // Blue-grey corrugated shutter
    roughness: 0.6,
    metalness: 0.6,
  });
  const shutter = new THREE.Mesh(shutterGeo, shutterMat);
  shutter.position.set(0, 1.7, 0.22);
  root.add(shutter);

  // Shop signboard: "কামাল ভাই অটো সার্ভিস"
  const signGeo = new THREE.BoxGeometry(3.6, 0.6, 0.12);
  const signMat = new THREE.MeshStandardMaterial({
    color: 0xffbb00, // Yellow workshop header
    roughness: 0.4,
  });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 3.1, 0.28);
  root.add(sign);

  return root;
}

/**
 * Procedural Overhead Footbridge spanning road traffic.
 */
export function createFootbridgeMesh(): THREE.Group {
  const root = new THREE.Group();

  // Central horizontal truss walkway (12m long x 2m wide)
  const walkwayGeo = new THREE.BoxGeometry(12.0, 0.4, 2.2);
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x3d70b2, // Dhaka blue footbridge steel
    roughness: 0.5,
    metalness: 0.7,
  });
  const walkway = new THREE.Mesh(walkwayGeo, steelMat);
  walkway.position.set(0, 5.2, 0);
  root.add(walkway);

  // Safety railings
  const railGeo = new THREE.BoxGeometry(12.0, 1.0, 0.1);
  const railMat = new THREE.MeshBasicMaterial({ color: 0xdddddd, wireframe: true });

  const r1 = new THREE.Mesh(railGeo, railMat);
  r1.position.set(0, 5.8, -1.05);
  root.add(r1);

  const r2 = new THREE.Mesh(railGeo, railMat);
  r2.position.set(0, 5.8, 1.05);
  root.add(r2);

  // Left and Right stair towers
  const towerGeo = new THREE.BoxGeometry(1.6, 5.2, 2.2);
  const tower1 = new THREE.Mesh(towerGeo, steelMat);
  tower1.position.set(-5.6, 2.6, 0);
  root.add(tower1);

  const tower2 = new THREE.Mesh(towerGeo, steelMat);
  tower2.position.set(5.6, 2.6, 0);
  root.add(tower2);

  return root;
}

/**
 * Procedural Rooftop Water Tank (classic black cylindrical Gazi tank).
 */
export function createRooftopWaterTankMesh(): THREE.Group {
  const root = new THREE.Group();

  // Concrete stand
  const standGeo = new THREE.BoxGeometry(1.4, 0.4, 1.4);
  const standMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9 });
  const stand = new THREE.Mesh(standGeo, standMat);
  stand.position.set(0, 0.2, 0);
  root.add(stand);

  // Black water tank
  const tankGeo = new THREE.CylinderGeometry(0.65, 0.65, 1.4, 16);
  const tankMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.4,
  });
  const tank = new THREE.Mesh(tankGeo, tankMat);
  tank.position.set(0, 1.1, 0);
  root.add(tank);

  return root;
}

/**
 * Procedural Tangled Overhead Wires (Dhaka electrical cables).
 */
export function createOverheadWiresMesh(): THREE.Group {
  const root = new THREE.Group();

  const wireMat = new THREE.LineBasicMaterial({ color: 0x111111, linewidth: 2 });

  // Multiple sagging cable lines
  for (let i = 0; i < 4; i++) {
    const points: THREE.Vector3[] = [];
    const zOffset = (i - 1.5) * 0.4;
    const sag = 0.4 + i * 0.15;
    points.push(new THREE.Vector3(-10, 6.0, zOffset));
    points.push(new THREE.Vector3(0, 6.0 - sag, zOffset + 0.1));
    points.push(new THREE.Vector3(10, 6.0, zOffset));

    const curve = new THREE.CatmullRomCurve3(points);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(20));
    const line = new THREE.Line(geometry, wireMat);
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

  // Border frame
  const borderGeo = new THREE.BoxGeometry(2.9, 0.9, 0.06);
  const borderMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, roughness: 0.5 });
  const border = new THREE.Mesh(borderGeo, borderMat);
  border.position.set(0, 2.8, -0.02);
  root.add(border);

  return root;
}
