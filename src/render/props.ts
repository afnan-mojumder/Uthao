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
