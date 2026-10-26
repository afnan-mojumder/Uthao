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
  private passengerGroup: THREE.Group;

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

    // Rearview Mirrors
    const mirrorStemGeo = new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6);
    const mirrorStemMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    const mirrorGlassGeo = new THREE.BoxGeometry(0.11, 0.07, 0.02);
    const mirrorGlassMat = new THREE.MeshStandardMaterial({ color: 0x93c5fd, roughness: 0.1, metalness: 0.9 });

    // Left mirror
    const mStemL = new THREE.Mesh(mirrorStemGeo, mirrorStemMat);
    mStemL.position.set(-0.3, 0.65, 0.05);
    mStemL.rotation.z = -0.3;
    this.forkGroup.add(mStemL);
    const mGlassL = new THREE.Mesh(mirrorGlassGeo, mirrorGlassMat);
    mGlassL.position.set(-0.34, 0.76, 0.05);
    this.forkGroup.add(mGlassL);

    // Right mirror
    const mStemR = new THREE.Mesh(mirrorStemGeo, mirrorStemMat);
    mStemR.position.set(0.3, 0.65, 0.05);
    mStemR.rotation.z = 0.3;
    this.forkGroup.add(mStemR);
    const mGlassR = new THREE.Mesh(mirrorGlassGeo, mirrorGlassMat);
    mGlassR.position.set(0.34, 0.76, 0.05);
    this.forkGroup.add(mGlassR);

    // Tail lamp
    const tailLightGeo = new THREE.BoxGeometry(0.16, 0.06, 0.04);
    const tailLightMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 0.9,
    });
    const tailLight = new THREE.Mesh(tailLightGeo, tailLightMat);
    tailLight.position.set(0, 0.62, -0.62);
    this.leanGroup.add(tailLight);

    // ==========================================================
    // PROTAGONIST RIDER (Rafi) — FULL MOUNTED 3D BODY
    // ==========================================================
    const riderGroup = new THREE.Group();
    this.leanGroup.add(riderGroup);

    // Torso / jacket with green Uthao safety vest
    const torsoGeo = new THREE.BoxGeometry(0.36, 0.46, 0.26);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 }); // Dark jacket
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.set(0, 0.95, -0.15);
    torso.rotation.x = 0.25; // Athletic forward riding posture
    riderGroup.add(torso);

    // Fluorescent Uthao vest strap
    const vestGeo = new THREE.BoxGeometry(0.37, 0.18, 0.27);
    const vestMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.5 }); // Uthao Green
    const vest = new THREE.Mesh(vestGeo, vestMat);
    vest.position.set(0, 0.96, -0.15);
    vest.rotation.x = 0.25;
    riderGroup.add(vest);

    // Helmet / Head
    const helmetGeo = new THREE.SphereGeometry(0.17, 14, 12);
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0xef4444, // Red racing helmet
      roughness: 0.3,
      metalness: 0.2,
    });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.set(0, 1.32, -0.04);
    riderGroup.add(helmet);

    // Glossy Visor
    const visorGeo = new THREE.BoxGeometry(0.2, 0.09, 0.1);
    const visorMat = new THREE.MeshStandardMaterial({
      color: 0x020617,
      roughness: 0.1,
      metalness: 0.9,
    });
    const visor = new THREE.Mesh(visorGeo, visorMat);
    visor.position.set(0, 1.32, 0.1);
    riderGroup.add(visor);

    // Arms & Hands gripping handlebars
    const armGeo = new THREE.CylinderGeometry(0.06, 0.05, 0.45, 8);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });

    // Left Arm
    const armL = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.24, 0.98, 0.05);
    armL.rotation.set(0.7, 0, 0.35);
    riderGroup.add(armL);

    // Right Arm
    const armR = new THREE.Mesh(armGeo, armMat);
    armR.position.set(0.24, 0.98, 0.05);
    armR.rotation.set(0.7, 0, -0.35);
    riderGroup.add(armR);

    // Legs & Riding Boots on footpegs
    const thighGeo = new THREE.BoxGeometry(0.14, 0.4, 0.16);
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.9 }); // Dark blue jeans
    const bootGeo = new THREE.BoxGeometry(0.12, 0.14, 0.24);
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.7 });

    // Left leg
    const thighL = new THREE.Mesh(thighGeo, pantsMat);
    thighL.position.set(-0.2, 0.65, -0.15);
    thighL.rotation.set(0.5, 0, 0.2);
    riderGroup.add(thighL);

    const bootL = new THREE.Mesh(bootGeo, bootMat);
    bootL.position.set(-0.22, 0.35, -0.05);
    riderGroup.add(bootL);

    // Right leg
    const thighR = new THREE.Mesh(thighGeo, pantsMat);
    thighR.position.set(0.2, 0.65, -0.15);
    thighR.rotation.set(0.5, 0, -0.2);
    riderGroup.add(thighR);

    const bootR = new THREE.Mesh(bootGeo, bootMat);
    bootR.position.set(0.22, 0.35, -0.05);
    riderGroup.add(bootR);

    // ==========================================================
    // PASSENGER (Nabila / Pillion Rider)
    // ==========================================================
    this.passengerGroup = new THREE.Group();
    this.passengerGroup.visible = false;
    this.leanGroup.add(this.passengerGroup);

    const pTorsoGeo = new THREE.BoxGeometry(0.32, 0.42, 0.22);
    const pTorsoMat = new THREE.MeshStandardMaterial({
      color: 0x0d9488, // Teal kurta / shalwar kameez
      roughness: 0.6,
    });
    const pTorso = new THREE.Mesh(pTorsoGeo, pTorsoMat);
    pTorso.position.set(0, 0.96, -0.44);
    pTorso.rotation.x = 0.15;
    this.passengerGroup.add(pTorso);

    const pHelmetGeo = new THREE.SphereGeometry(0.16, 14, 12);
    const pHelmetMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b, // Golden yellow safety helmet
      roughness: 0.3,
    });
    const pHelmet = new THREE.Mesh(pHelmetGeo, pHelmetMat);
    pHelmet.position.set(0, 1.32, -0.4);
    this.passengerGroup.add(pHelmet);

    const pVisorGeo = new THREE.BoxGeometry(0.18, 0.08, 0.08);
    const pVisorMat = new THREE.MeshStandardMaterial({ color: 0x020617, roughness: 0.1 });
    const pVisor = new THREE.Mesh(pVisorGeo, pVisorMat);
    pVisor.position.set(0, 1.32, -0.27);
    this.passengerGroup.add(pVisor);

    // Passenger Arms holding rider's waist
    const pArmL = new THREE.Mesh(armGeo, pTorsoMat);
    pArmL.position.set(-0.2, 0.95, -0.28);
    pArmL.rotation.set(0.5, 0, 0.2);
    this.passengerGroup.add(pArmL);

    const pArmR = new THREE.Mesh(armGeo, pTorsoMat);
    pArmR.position.set(0.2, 0.95, -0.28);
    pArmR.rotation.set(0.5, 0, -0.2);
    this.passengerGroup.add(pArmR);
  }

  setPassengerVisible(visible: boolean): void {
    this.passengerGroup.visible = visible;
  }

  setPose(pose: VehiclePose): void {
    this.root.position.set(pose.x, pose.y, pose.z);
    this.root.rotation.y = pose.heading;
    this.leanGroup.rotation.z = -pose.lean;
    this.forkGroup.rotation.y = pose.steer;
  }
}

/**
 * Procedural CNG Auto-Rickshaw (Dhaka green 3-wheeler with caged sides).
 */
export function createCNGMesh(): THREE.Group {
  const root = new THREE.Group();

  // Green main cabin
  const bodyGeo = new THREE.BoxGeometry(1.3, 1.2, 2.0);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x187a38, // Dhaka CNG green
    roughness: 0.5,
    metalness: 0.3,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0.9, -0.1);
  root.add(body);

  // Yellow lower trim
  const skirtGeo = new THREE.BoxGeometry(1.32, 0.25, 2.02);
  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0xf2b705, // Warning yellow stripe
    roughness: 0.6,
  });
  const skirt = new THREE.Mesh(skirtGeo, skirtMat);
  skirt.position.set(0, 0.35, -0.1);
  root.add(skirt);

  // Black iron wireframe / safety cage sides
  const cageMat = new THREE.MeshBasicMaterial({
    color: 0x111111,
    wireframe: true,
  });
  const cageGeo = new THREE.BoxGeometry(1.34, 0.6, 1.2);
  const cage = new THREE.Mesh(cageGeo, cageMat);
  cage.position.set(0, 1.15, -0.3);
  root.add(cage);

  // Front slope / nose
  const noseGeo = new THREE.BoxGeometry(1.0, 0.8, 0.6);
  const noseMat = new THREE.MeshStandardMaterial({ color: 0x187a38 });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.set(0, 0.7, 0.8);
  root.add(nose);

  // Headlight
  const lightGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 16);
  const lightMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: 0xffffaa,
    emissiveIntensity: 0.8,
  });
  const headlight = new THREE.Mesh(lightGeo, lightMat);
  headlight.rotation.x = Math.PI / 2;
  headlight.position.set(0, 0.7, 1.1);
  root.add(headlight);

  // 3 Wheels (1 front, 2 rear)
  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.14, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

  const frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
  frontWheel.rotation.z = Math.PI / 2;
  frontWheel.position.set(0, 0.24, 0.8);
  root.add(frontWheel);

  const rearLeft = new THREE.Mesh(wheelGeo, wheelMat);
  rearLeft.rotation.z = Math.PI / 2;
  rearLeft.position.set(-0.6, 0.24, -0.7);
  root.add(rearLeft);

  const rearRight = new THREE.Mesh(wheelGeo, wheelMat);
  rearRight.rotation.z = Math.PI / 2;
  rearRight.position.set(0.6, 0.24, -0.7);
  root.add(rearRight);

  return root;
}

/**
 * Procedural Cycle Rickshaw (Dhaka manual tricycle with painted canopy).
 */
export function createRickshawMesh(): THREE.Group {
  const root = new THREE.Group();

  // Bicycle frame front
  const frameGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
  const frontTube = new THREE.Mesh(frameGeo, frameMat);
  frontTube.rotation.x = 0.3;
  frontTube.position.set(0, 0.6, 0.5);
  root.add(frontTube);

  // Driver seat
  const seatGeo = new THREE.BoxGeometry(0.25, 0.08, 0.25);
  const seatMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  const seat = new THREE.Mesh(seatGeo, seatMat);
  seat.position.set(0, 0.8, 0.1);
  root.add(seat);

  // Rear carriage passenger bench
  const carriageGeo = new THREE.BoxGeometry(1.0, 0.4, 0.8);
  const carriageMat = new THREE.MeshStandardMaterial({ color: 0x2244aa, roughness: 0.6 });
  const carriage = new THREE.Mesh(carriageGeo, carriageMat);
  carriage.position.set(0, 0.6, -0.5);
  root.add(carriage);

  // Folded colorful canopy / hood
  const canopyGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.02, 16, 1, false, 0, Math.PI);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: 0xdd3322, // Bright crimson canopy
    roughness: 0.7,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.rotation.z = Math.PI / 2;
  canopy.rotation.x = -0.3;
  canopy.position.set(0, 1.25, -0.65);
  root.add(canopy);

  // Rickshaw art backplate
  const plateGeo = new THREE.BoxGeometry(0.95, 0.4, 0.04);
  const plateMat = new THREE.MeshStandardMaterial({
    color: 0xffaa00, // Vibrant yellow/orange folk art plate
    roughness: 0.4,
  });
  const backplate = new THREE.Mesh(plateGeo, plateMat);
  backplate.position.set(0, 0.6, -0.92);
  root.add(backplate);

  // Wheels (large spoked bicycle wheels)
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

  const fWheel = new THREE.Mesh(wheelGeo, wheelMat);
  fWheel.rotation.z = Math.PI / 2;
  fWheel.position.set(0, 0.35, 0.9);
  root.add(fWheel);

  const rLeft = new THREE.Mesh(wheelGeo, wheelMat);
  rLeft.rotation.z = Math.PI / 2;
  rLeft.position.set(-0.52, 0.35, -0.5);
  root.add(rLeft);

  const rRight = new THREE.Mesh(wheelGeo, wheelMat);
  rRight.rotation.z = Math.PI / 2;
  rRight.position.set(0.52, 0.35, -0.5);
  root.add(rRight);

  return root;
}

/**
 * Procedural Local Dhaka Bus (long, dented, colourful striped commuter bus).
 */
export function createBusMesh(): THREE.Group {
  const root = new THREE.Group();

  // Main chassis (8m long x 2.4m wide x 2.8m tall)
  const bodyGeo = new THREE.BoxGeometry(2.4, 2.2, 7.8);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x1e88e5, // Vibrant bus blue
    roughness: 0.5,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 1.8, 0);
  root.add(body);

  // Decorative side stripes (classic Dhaka local transit branding)
  const stripeGeo = new THREE.BoxGeometry(2.44, 0.3, 7.82);
  const stripeMat = new THREE.MeshStandardMaterial({
    color: 0xfdd835, // Bright yellow beltline stripe
    roughness: 0.4,
  });
  const stripe = new THREE.Mesh(stripeGeo, stripeMat);
  stripe.position.set(0, 1.4, 0);
  root.add(stripe);

  // Roof luggage / ladder carrier
  const rackGeo = new THREE.BoxGeometry(2.1, 0.2, 5.0);
  const rackMat = new THREE.MeshStandardMaterial({
    color: 0x333333,
    wireframe: true,
  });
  const rack = new THREE.Mesh(rackGeo, rackMat);
  rack.position.set(0, 3.0, -0.5);
  root.add(rack);

  // Front destination board (e.g. "মিরপুর - মতিঝিল")
  const signGeo = new THREE.BoxGeometry(1.6, 0.3, 0.08);
  const signMat = new THREE.MeshStandardMaterial({
    color: 0xd32f2f, // Red destination header
    emissive: 0x441111,
  });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 2.6, 3.92);
  root.add(sign);

  // 6 Bus wheels (2 front, 4 rear duals)
  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.25, 16);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });

  const fL = new THREE.Mesh(wheelGeo, wheelMat);
  fL.rotation.z = Math.PI / 2;
  fL.position.set(-1.15, 0.48, 2.4);
  root.add(fL);

  const fR = new THREE.Mesh(wheelGeo, wheelMat);
  fR.rotation.z = Math.PI / 2;
  fR.position.set(1.15, 0.48, 2.4);
  root.add(fR);

  const rL = new THREE.Mesh(wheelGeo, wheelMat);
  rL.rotation.z = Math.PI / 2;
  rL.position.set(-1.15, 0.48, -2.2);
  root.add(rL);

  const rR = new THREE.Mesh(wheelGeo, wheelMat);
  rR.rotation.z = Math.PI / 2;
  rR.position.set(1.15, 0.48, -2.2);
  root.add(rR);

  return root;
}
