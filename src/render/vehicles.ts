import * as THREE from 'three';

export interface VehiclePose {
  x: number;
  y: number;
  z: number;
  heading: number;
  lean: number;
  steer: number;
}

export class MotorcycleMesh {
  readonly root: THREE.Group;
  private leanGroup: THREE.Group;
  private forkGroup: THREE.Group;
  private frontWheel: THREE.Mesh;
  private rearWheel: THREE.Mesh;

  constructor() {
    this.root = new THREE.Group();
    this.leanGroup = new THREE.Group();
    this.root.add(this.leanGroup);

    // Chassis / frame
    const frameGeo = new THREE.BoxGeometry(0.3, 0.4, 1.2);
    const frameMat = new THREE.MeshStandardMaterial({
      color: 0x1a459c, // Uthao blue
      roughness: 0.4,
      metalness: 0.6,
    });
    const frame = new THREE.Mesh(frameGeo, frameMat);
    frame.position.y = 0.5;
    this.leanGroup.add(frame);

    // Fuel tank
    const tankGeo = new THREE.BoxGeometry(0.32, 0.22, 0.45);
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0x00cc44, // Green accent
      roughness: 0.3,
    });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(0, 0.65, 0.1);
    this.leanGroup.add(tank);

    // Seat
    const seatGeo = new THREE.BoxGeometry(0.28, 0.12, 0.55);
    const seatMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.9,
    });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.set(0, 0.62, -0.3);
    this.leanGroup.add(seat);

    // Exhaust
    const exhaustGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.7, 8);
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.9,
      roughness: 0.2,
    });
    const exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
    exhaust.rotation.x = Math.PI / 2;
    exhaust.position.set(0.18, 0.25, -0.35);
    this.leanGroup.add(exhaust);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.12, 16);
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.8,
    });

    // Rear wheel
    this.rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
    this.rearWheel.rotation.z = Math.PI / 2;
    this.rearWheel.position.set(0, 0.32, -0.6);
    this.leanGroup.add(this.rearWheel);

    // Front fork group (steerable)
    this.forkGroup = new THREE.Group();
    this.forkGroup.position.set(0, 0.32, 0.65);
    this.leanGroup.add(this.forkGroup);

    // Front wheel
    this.frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
    this.frontWheel.rotation.z = Math.PI / 2;
    this.forkGroup.add(this.frontWheel);

    // Handlebars
    const barGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8);
    const barMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const bar = new THREE.Mesh(barGeo, barMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.55, 0);
    this.forkGroup.add(bar);

    // Headlight
    const lightGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.08, 12);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffaa,
      emissiveIntensity: 0.8,
    });
    const headlight = new THREE.Mesh(lightGeo, lightMat);
    headlight.rotation.x = Math.PI / 2;
    headlight.position.set(0, 0.45, 0.12);
    this.forkGroup.add(headlight);

    // Rider
    const riderGroup = new THREE.Group();
    this.leanGroup.add(riderGroup);

    // Torso / jacket
    const torsoGeo = new THREE.BoxGeometry(0.35, 0.45, 0.25);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x2b2b2b });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.set(0, 0.95, -0.15);
    torso.rotation.x = 0.2; // slight forward lean
    riderGroup.add(torso);

    // Helmet / head
    const helmetGeo = new THREE.SphereGeometry(0.16, 12, 10);
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0xdd2222,
      roughness: 0.3,
    });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.set(0, 1.3, -0.05);
    riderGroup.add(helmet);

    // Visor
    const visorGeo = new THREE.BoxGeometry(0.18, 0.08, 0.08);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      roughness: 0.1,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.3, 0.08);
    riderGroup.add(visor);
  }

  setPose(pose: VehiclePose): void {
    this.root.position.set(pose.x, pose.y, pose.z);
    this.root.rotation.y = pose.heading;
    this.leanGroup.rotation.z = -pose.lean;
    this.forkGroup.rotation.y = pose.steer;
  }
}
