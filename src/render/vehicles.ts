import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { BikeId } from '../core/types';
import { BIKE_VARIANT_STYLES, SEAT_COVER_STYLES } from './vehicleStyles';

export interface VehiclePose {
  x: number;
  y: number;
  z: number;
  heading: number;
  lean: number;
  steer: number;
  speed?: number;
  dt?: number;
}

export interface BikeCosmetics {
  paint?: string;
  seatCover?: string;
}

const WHEEL_RADIUS_M = 0.32;
const BOARDING_DURATION_S = 0.3;
const TWO_PI = Math.PI * 2;

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

function normalizeForVertexColorMerge(geo: THREE.BufferGeometry, colorHex: number): THREE.BufferGeometry {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const pos = g.getAttribute('position');
  if (!g.getAttribute('uv') && pos) {
    g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  }
  applyVertexColor(g, colorHex);
  return g;
}

interface VertexPartSpec {
  geo: THREE.BufferGeometry;
  hex: number;
  pos: [number, number, number];
  rx?: number;
  rz?: number;
}

/** Merges transformed sub-parts into one vertex-colored mesh and disposes temporary inputs. */
function buildMergedVertexPartMesh(
  parts: readonly VertexPartSpec[],
  roughness: number,
  metalness = 0.05
): THREE.Mesh {
  const m = new THREE.Matrix4();
  const euler = new THREE.Euler();
  const geos: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    euler.set(part.rx ?? 0, 0, part.rz ?? 0);
    m.makeRotationFromEuler(euler);
    m.setPosition(part.pos[0], part.pos[1], part.pos[2]);
    const g = normalizeForVertexColorMerge(part.geo, part.hex);
    g.applyMatrix4(m);
    part.geo.dispose();
    geos.push(g);
  }
  const merged = mergeGeometries(geos, false)!;
  for (const g of geos) g.dispose();
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    vertexColors: true,
    roughness,
    metalness,
  });
  return new THREE.Mesh(merged, mat);
}

export class MotorcycleMesh {
  readonly root: THREE.Group;
  private leanGroup: THREE.Group;
  private forkGroup: THREE.Group;
  readonly frontWheel: THREE.Mesh;
  readonly rearWheel: THREE.Mesh;
  readonly passengerGroup: THREE.Group;
  readonly frame: THREE.Mesh;
  readonly tank: THREE.Mesh;
  readonly seat: THREE.Mesh;
  readonly exhaust: THREE.Mesh;
  readonly headlight: THREE.Mesh;
  readonly brakeLight: THREE.Mesh;
  private sportFairing: THREE.Mesh;
  currentVariant: BikeId = 'old100';

  private readonly currentCosmetics: { paint?: string; seatCover?: string } = {};
  private braking = false;
  private passengerTargetVisible = false;
  private passengerTransition = 0;

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
    this.frame = new THREE.Mesh(frameGeo, frameMat);
    this.frame.position.y = 0.5;
    this.leanGroup.add(this.frame);

    // Fuel tank
    const tankGeo = new THREE.BoxGeometry(0.32, 0.22, 0.45);
    const tankMat = new THREE.MeshStandardMaterial({
      color: 0x00cc44, // Green accent
      roughness: 0.3,
    });
    this.tank = new THREE.Mesh(tankGeo, tankMat);
    this.tank.position.set(0, 0.65, 0.1);
    this.leanGroup.add(this.tank);

    // Sport fairing (shown on 150cc sport variant)
    const fairingGeo = new THREE.BoxGeometry(0.38, 0.32, 0.42);
    const fairingMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.28,
      metalness: 0.35,
    });
    this.sportFairing = new THREE.Mesh(fairingGeo, fairingMat);
    this.sportFairing.position.set(0, 0.62, 0.36);
    this.sportFairing.rotation.x = 0.25;
    this.sportFairing.visible = false;
    this.leanGroup.add(this.sportFairing);

    // Seat
    const seatGeo = new THREE.BoxGeometry(0.28, 0.12, 0.58);
    const seatMat = new THREE.MeshStandardMaterial({
      color: SEAT_COVER_STYLES.default!.color,
      roughness: SEAT_COVER_STYLES.default!.roughness,
      metalness: SEAT_COVER_STYLES.default!.metalness,
    });
    this.seat = new THREE.Mesh(seatGeo, seatMat);
    this.seat.position.set(0, 0.62, -0.3);
    this.leanGroup.add(this.seat);

    // Tail / brake light
    const brakeGeo = new THREE.BoxGeometry(0.16, 0.08, 0.06);
    const brakeMat = new THREE.MeshStandardMaterial({
      color: 0x991111,
      emissive: 0xff2222,
      emissiveIntensity: 0.25,
      roughness: 0.25,
    });
    this.brakeLight = new THREE.Mesh(brakeGeo, brakeMat);
    this.brakeLight.position.set(0, 0.62, -0.78);
    this.leanGroup.add(this.brakeLight);

    // Exhaust
    const exhaustGeo = new THREE.CylinderGeometry(0.04, 0.05, 0.7, 8);
    const exhaustMat = new THREE.MeshStandardMaterial({
      color: 0x888888,
      metalness: 0.9,
      roughness: 0.2,
    });
    this.exhaust = new THREE.Mesh(exhaustGeo, exhaustMat);
    this.exhaust.rotation.x = Math.PI / 2;
    this.exhaust.position.set(0.18, 0.25, -0.35);
    this.leanGroup.add(this.exhaust);

    // Wheels (pre-rotated so rotation.x spins cleanly around axle; tyre + spoke merged via vertex color)
    const wheelRing = new THREE.CylinderGeometry(WHEEL_RADIUS_M, WHEEL_RADIUS_M, 0.12, 16);
    wheelRing.rotateZ(Math.PI / 2);
    const spokeBox = new THREE.BoxGeometry(0.14, 0.44, 0.04);
    const wheelParts = [
      normalizeForVertexColorMerge(wheelRing, 0x222222),
      normalizeForVertexColorMerge(spokeBox, 0x94a3b8),
    ];
    wheelRing.dispose();
    spokeBox.dispose();
    const wheelGeo = mergeGeometries(wheelParts, false) ?? new THREE.CylinderGeometry(WHEEL_RADIUS_M, WHEEL_RADIUS_M, 0.12, 16);
    for (const wp of wheelParts) wp.dispose();
    const wheelMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.15,
    });

    // Rear wheel
    this.rearWheel = new THREE.Mesh(wheelGeo, wheelMat);
    this.rearWheel.position.set(0, WHEEL_RADIUS_M, -0.6);
    this.leanGroup.add(this.rearWheel);

    // Front fork group (steerable; keep at (0, 0.32, 0.65) inside leanGroup)
    this.forkGroup = new THREE.Group();
    this.forkGroup.position.set(0, WHEEL_RADIUS_M, 0.65);
    this.leanGroup.add(this.forkGroup);

    // Front wheel
    this.frontWheel = new THREE.Mesh(wheelGeo, wheelMat);
    this.forkGroup.add(this.frontWheel);

    // Static front fork assembly (stanchions + front mudguard + handlebars merged into 1 draw call)
    this.forkGroup.add(
      buildMergedVertexPartMesh(
        [
          { geo: new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8), hex: 0xcbd5e1, pos: [0.11, 0.28, -0.04], rx: -0.18 },
          { geo: new THREE.CylinderGeometry(0.025, 0.025, 0.62, 8), hex: 0xcbd5e1, pos: [-0.11, 0.28, -0.04], rx: -0.18 },
          { geo: new THREE.BoxGeometry(0.16, 0.05, 0.3), hex: 0x1e293b, pos: [0, 0.28, 0.04] },
          { geo: new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8), hex: 0x333333, pos: [0, 0.55, -0.08], rz: Math.PI / 2 },
        ],
        0.35,
        0.5
      )
    );

    // Headlight
    const lightGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.08, 12);
    const lightMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xffffaa,
      emissiveIntensity: 0.9,
    });
    this.headlight = new THREE.Mesh(lightGeo, lightMat);
    this.headlight.rotation.x = Math.PI / 2;
    this.headlight.position.set(0, 0.46, 0.08);
    this.forkGroup.add(this.headlight);

    // Rider + rear mudguard + helmet merged into 1 vertex-colored mesh
    const riderGroup = new THREE.Group();
    this.leanGroup.add(riderGroup);
    riderGroup.add(
      buildMergedVertexPartMesh(
        [
          { geo: new THREE.BoxGeometry(0.18, 0.06, 0.34), hex: 0x1e293b, pos: [0, 0.54, -0.66], rx: -0.25 },
          { geo: new THREE.BoxGeometry(0.35, 0.45, 0.25), hex: 0x2b2b2b, pos: [0, 0.95, -0.15], rx: 0.2 },
          { geo: new THREE.BoxGeometry(0.09, 0.36, 0.09), hex: 0x2b2b2b, pos: [0.21, 0.95, 0.06], rx: 0.9, rz: -0.1 },
          { geo: new THREE.BoxGeometry(0.09, 0.36, 0.09), hex: 0x2b2b2b, pos: [-0.21, 0.95, 0.06], rx: 0.9, rz: 0.1 },
          { geo: new THREE.BoxGeometry(0.12, 0.42, 0.12), hex: 0x1e293b, pos: [0.19, 0.56, -0.05], rx: -0.35 },
          { geo: new THREE.BoxGeometry(0.12, 0.42, 0.12), hex: 0x1e293b, pos: [-0.19, 0.56, -0.05], rx: -0.35 },
          { geo: new THREE.BoxGeometry(0.18, 0.08, 0.08), hex: 0x111111, pos: [0, 1.3, 0.08] },
          { geo: new THREE.SphereGeometry(0.16, 12, 10), hex: 0xdd2222, pos: [0, 1.3, -0.05] },
        ],
        0.55
      )
    );

    // Passenger (pillion rider) + helmet merged into 1 vertex-colored mesh
    this.passengerGroup = new THREE.Group();
    this.passengerGroup.visible = false;
    this.leanGroup.add(this.passengerGroup);
    this.passengerGroup.add(
      buildMergedVertexPartMesh(
        [
          { geo: new THREE.BoxGeometry(0.32, 0.42, 0.22), hex: 0x008080, pos: [0, 0.92, -0.44], rx: 0.1 },
          { geo: new THREE.BoxGeometry(0.08, 0.32, 0.08), hex: 0x008080, pos: [0.19, 0.9, -0.3], rx: 0.7 },
          { geo: new THREE.BoxGeometry(0.08, 0.32, 0.08), hex: 0x008080, pos: [-0.19, 0.9, -0.3], rx: 0.7 },
          { geo: new THREE.BoxGeometry(0.12, 0.42, 0.12), hex: 0x1e293b, pos: [0.18, 0.54, -0.38], rx: -0.2 },
          { geo: new THREE.BoxGeometry(0.12, 0.42, 0.12), hex: 0x1e293b, pos: [-0.18, 0.54, -0.38], rx: -0.2 },
          { geo: new THREE.SphereGeometry(0.15, 12, 10), hex: 0xffbb00, pos: [0, 1.25, -0.4] },
        ],
        0.55
      )
    );

    // Enable shadow casting & receiving across all motorcycle and rider meshes
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.castShadow = true;
        obj.receiveShadow = true;
      }
    });
  }

  private applyTankPaint(): void {
    const style = BIKE_VARIANT_STYLES[this.currentVariant] ?? BIKE_VARIANT_STYLES.old100;
    const tankMat = this.tank.material as THREE.MeshStandardMaterial;
    const fairingMat = this.sportFairing.material as THREE.MeshStandardMaterial;
    if (this.currentCosmetics.paint) {
      tankMat.color.set(this.currentCosmetics.paint);
      fairingMat.color.set(this.currentCosmetics.paint);
    } else {
      tankMat.color.setHex(style.tankColor);
      fairingMat.color.setHex(style.tankColor);
    }
  }

  setVariant(variant: BikeId): void {
    this.currentVariant = variant;
    const style = BIKE_VARIANT_STYLES[variant] ?? BIKE_VARIANT_STYLES.old100;
    const frameMat = this.frame.material as THREE.MeshStandardMaterial;
    const exhaustMat = this.exhaust.material as THREE.MeshStandardMaterial;
    const headMat = this.headlight.material as THREE.MeshStandardMaterial;

    frameMat.color.setHex(style.frameColor);
    exhaustMat.color.setHex(style.exhaustColor);
    this.tank.scale.set(style.tankScale[0], style.tankScale[1], style.tankScale[2]);
    headMat.emissive.setHex(style.headlightEmissive);
    this.sportFairing.visible = style.hasSportFairing;
    this.applyTankPaint();
  }

  setCosmetics(cosmetics: BikeCosmetics): void {
    this.currentCosmetics.paint = cosmetics.paint;
    this.currentCosmetics.seatCover = cosmetics.seatCover;

    this.applyTankPaint();

    const seatStyle =
      (cosmetics.seatCover && SEAT_COVER_STYLES[cosmetics.seatCover]) ||
      SEAT_COVER_STYLES.default!;
    const seatMat = this.seat.material as THREE.MeshStandardMaterial;
    seatMat.color.setHex(seatStyle.color);
    seatMat.roughness = seatStyle.roughness;
    seatMat.metalness = seatStyle.metalness;
  }

  setBraking(braking: boolean): void {
    if (this.braking === braking) return;
    this.braking = braking;
    const brakeMat = this.brakeLight.material as THREE.MeshStandardMaterial;
    brakeMat.emissiveIntensity = braking ? 2.2 : 0.25;
  }

  setBrakeLight(braking: boolean): void {
    this.setBraking(braking);
  }

  isBraking(): boolean {
    return this.braking;
  }

  setPassengerVisible(visible: boolean): void {
    this.passengerTargetVisible = visible;
    if (visible) {
      this.passengerGroup.visible = true;
    } else if (this.passengerTransition <= 0) {
      this.passengerGroup.visible = false;
    }
  }

  getPassengerTransition(): number {
    return this.passengerTransition;
  }

  spinWheels(speed: number, dt: number): void {
    if (dt <= 0 || speed === 0) return;
    const deltaAngle = (speed * dt) / WHEEL_RADIUS_M;
    this.frontWheel.rotation.x = (this.frontWheel.rotation.x + deltaAngle) % TWO_PI;
    this.rearWheel.rotation.x = (this.rearWheel.rotation.x + deltaAngle) % TWO_PI;
  }

  update(dt: number, speed = 0): void {
    this.spinWheels(speed, dt);

    if (dt > 0) {
      const step = dt / BOARDING_DURATION_S;
      if (this.passengerTargetVisible && this.passengerTransition < 1) {
        this.passengerTransition = Math.min(1, this.passengerTransition + step);
        this.passengerGroup.visible = true;
      } else if (!this.passengerTargetVisible && this.passengerTransition > 0) {
        this.passengerTransition = Math.max(0, this.passengerTransition - step);
        if (this.passengerTransition <= 0) {
          this.passengerGroup.visible = false;
        }
      }

      const t = this.passengerTransition;
      const ease = t * t * (3 - 2 * t);
      this.passengerGroup.position.set(
        (1 - ease) * 0.45,
        Math.sin(ease * Math.PI) * 0.14,
        (1 - ease) * -0.15
      );
      this.passengerGroup.scale.setScalar(0.85 + 0.15 * ease);
    }
  }

  setPose(pose: VehiclePose): void {
    this.root.position.set(pose.x, pose.y ?? 0, pose.z);
    this.root.rotation.y = pose.heading;
    // Bike faces local +Z; +rotation.z tilts top toward -X (screen-right), matching lean > 0 = right.
    this.leanGroup.rotation.z = pose.lean;
    // +rotation.y turns fork toward +X (screen-left), matching steer < 0 = left.
    this.forkGroup.rotation.y = -pose.steer;

    if (pose.dt !== undefined) {
      this.update(pose.dt, pose.speed ?? 0);
    }
  }

  dispose(): void {
    const geos = new Set<THREE.BufferGeometry>();
    const mats = new Set<THREE.Material>();
    this.root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry) geos.add(obj.geometry);
        if (Array.isArray(obj.material)) {
          for (const m of obj.material) mats.add(m);
        } else if (obj.material) {
          mats.add(obj.material);
        }
      }
    });
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  }
}

/**
 * Procedural CNG Auto-Rickshaw (Dhaka green 3-wheeler with yellow skirt and caged sides).
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
  const cageMat = new THREE.MeshStandardMaterial({
    color: 0x111111,
    roughness: 0.7,
    metalness: 0.5,
  });
  const barGeo = new THREE.BoxGeometry(0.05, 0.55, 1.15);
  const leftBar = new THREE.Mesh(barGeo, cageMat);
  leftBar.position.set(-0.67, 1.15, -0.25);
  root.add(leftBar);
  const rightBar = new THREE.Mesh(barGeo, cageMat);
  rightBar.position.set(0.67, 1.15, -0.25);
  root.add(rightBar);

  // Front slope / nose
  const noseGeo = new THREE.BoxGeometry(1.0, 0.8, 0.6);
  const nose = new THREE.Mesh(noseGeo, bodyMat);
  nose.position.set(0, 0.7, 0.8);
  root.add(nose);

  // Headlight
  const lightGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 12);
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
  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12);
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
 * Procedural Cycle Rickshaw (Dhaka manual tricycle with painted canopy, folk art plate, and puller).
 */
export function createRickshawMesh(): THREE.Group {
  const root = new THREE.Group();

  // Bicycle frame front
  const frameGeo = new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8);
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.7 });
  const frontTube = new THREE.Mesh(frameGeo, frameMat);
  frontTube.rotation.x = 0.3;
  frontTube.position.set(0, 0.6, 0.5);
  root.add(frontTube);

  // Puller figure (torso + head)
  const pullerShirtMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.75 });
  const pullerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.48, 0.2), pullerShirtMat);
  pullerTorso.position.set(0, 1.08, 0.32);
  pullerTorso.rotation.x = 0.18;
  root.add(pullerTorso);

  const pullerHeadMat = new THREE.MeshStandardMaterial({ color: 0xb67b52, roughness: 0.7 });
  const pullerHead = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.18), pullerHeadMat);
  pullerHead.position.set(0, 1.42, 0.36);
  root.add(pullerHead);

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
  const canopyGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.02, 12, 1, false, 0, Math.PI);
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
  const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 12);
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

  // Dark tinted windshield + side window band
  const glassGeo = new THREE.BoxGeometry(2.42, 0.65, 7.5);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.2,
    metalness: 0.3,
  });
  const glass = new THREE.Mesh(glassGeo, glassMat);
  glass.position.set(0, 2.15, 0.16);
  root.add(glass);

  // Roof luggage / ladder carrier
  const rackGeo = new THREE.BoxGeometry(2.0, 0.14, 4.8);
  const rackMat = new THREE.MeshStandardMaterial({
    color: 0x333333,
    roughness: 0.7,
  });
  const rack = new THREE.Mesh(rackGeo, rackMat);
  rack.position.set(0, 2.97, -0.5);
  root.add(rack);

  // Front destination board
  const signGeo = new THREE.BoxGeometry(1.6, 0.3, 0.08);
  const signMat = new THREE.MeshStandardMaterial({
    color: 0xd32f2f, // Red destination header
    emissive: 0x441111,
  });
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.position.set(0, 2.65, 3.92);
  root.add(sign);

  // Bus wheels (2 front, 2 rear)
  const wheelGeo = new THREE.CylinderGeometry(0.48, 0.48, 0.25, 12);
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

/** Multi-material AI traffic motorcycle with rider. */
export function createTrafficMotorcycleMesh(): THREE.Group {
  const root = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 });
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.35 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.85 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.3 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.36, 1.3), frameMat);
  chassis.position.set(0, 0.48, 0);
  root.add(chassis);

  const tank = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.45), tankMat);
  tank.position.set(0, 0.68, 0.15);
  root.add(tank);

  const rider = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.46, 0.24), frameMat);
  rider.position.set(0, 0.96, -0.12);
  root.add(rider);

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), helmetMat);
  helmet.position.set(0, 1.32, -0.06);
  root.add(helmet);

  const wheelGeo = new THREE.CylinderGeometry(0.31, 0.31, 0.12, 10);
  const fWheel = new THREE.Mesh(wheelGeo, wheelMat);
  fWheel.rotation.z = Math.PI / 2;
  fWheel.position.set(0, 0.31, 0.65);
  root.add(fWheel);

  const rWheel = new THREE.Mesh(wheelGeo, wheelMat);
  rWheel.rotation.z = Math.PI / 2;
  rWheel.position.set(0, 0.31, -0.62);
  root.add(rWheel);

  return root;
}

/** Multi-material Dhaka step-through scooter with rider. */
export function createScooterMesh(): THREE.Group {
  const root = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x0d9488, roughness: 0.4 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
  const jacketMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.7 });
  const helmetMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.35 });

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 1.35), bodyMat);
  body.position.set(0, 0.46, -0.05);
  root.add(body);

  const shield = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.58, 0.2), bodyMat);
  shield.position.set(0, 0.72, 0.52);
  root.add(shield);

  const rider = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.44, 0.22), jacketMat);
  rider.position.set(0, 0.96, -0.1);
  root.add(rider);

  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.22), helmetMat);
  helmet.position.set(0, 1.3, -0.06);
  root.add(helmet);

  const wheelGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.12, 10);
  const fWheel = new THREE.Mesh(wheelGeo, darkMat);
  fWheel.rotation.z = Math.PI / 2;
  fWheel.position.set(0, 0.24, 0.58);
  root.add(fWheel);

  const rWheel = new THREE.Mesh(wheelGeo, darkMat);
  rWheel.rotation.z = Math.PI / 2;
  rWheel.position.set(0, 0.24, -0.58);
  root.add(rWheel);

  return root;
}

/** Multi-material bicycle with cyclist. */
export function createBicycleMesh(): THREE.Group {
  const root = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.6 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
  const shirtMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.75 });

  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.42, 1.1), frameMat);
  frame.position.set(0, 0.56, 0);
  root.add(frame);

  const rider = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.48, 0.2), shirtMat);
  rider.position.set(0, 1.04, -0.08);
  rider.rotation.x = 0.22;
  root.add(rider);

  const head = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.18, 0.18),
    new THREE.MeshStandardMaterial({ color: 0xb67b52, roughness: 0.7 })
  );
  head.position.set(0, 1.38, -0.02);
  root.add(head);

  const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.06, 10);
  const fWheel = new THREE.Mesh(wheelGeo, wheelMat);
  fWheel.rotation.z = Math.PI / 2;
  fWheel.position.set(0, 0.34, 0.62);
  root.add(fWheel);

  const rWheel = new THREE.Mesh(wheelGeo, wheelMat);
  rWheel.rotation.z = Math.PI / 2;
  rWheel.position.set(0, 0.34, -0.62);
  root.add(rWheel);

  return root;
}

/** Multi-material Dhaka street vendor pushcart (van-gari). */
export function createVendorCartMesh(): THREE.Group {
  const root = new THREE.Group();
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 });
  const canopyMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 });
  const goodsMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.7 });
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.9 });

  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.22, 2.0), woodMat);
  deck.position.set(0, 0.62, 0);
  root.add(deck);

  const cargo = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.38, 1.55), goodsMat);
  cargo.position.set(0, 0.92, -0.05);
  root.add(cargo);

  const awning = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.12, 1.9), canopyMat);
  awning.position.set(0, 1.75, 0);
  root.add(awning);

  const postGeo = new THREE.BoxGeometry(0.06, 1.05, 0.06);
  const postL = new THREE.Mesh(postGeo, woodMat);
  postL.position.set(-0.56, 1.2, 0.75);
  root.add(postL);
  const postR = new THREE.Mesh(postGeo, woodMat);
  postR.position.set(0.56, 1.2, 0.75);
  root.add(postR);

  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.08, 10);
  const offsets: [number, number][] = [
    [-0.6, 0.7],
    [0.6, 0.7],
    [-0.6, -0.7],
    [0.6, -0.7],
  ];
  for (const [wx, wz] of offsets) {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.3, wz);
    root.add(w);
  }

  return root;
}

/**
 * Procedural Sedan / Ride-hail Car (white/silver sedan).
 */
export function createCarMesh(): THREE.Group {
  const root = new THREE.Group();

  // Lower body
  const bodyGeo = new THREE.BoxGeometry(1.8, 0.6, 4.4);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    roughness: 0.3,
    metalness: 0.4,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.set(0, 0.5, 0);
  root.add(body);

  // Cabin
  const cabinGeo = new THREE.BoxGeometry(1.5, 0.55, 2.2);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.1,
  });
  const cabin = new THREE.Mesh(cabinGeo, cabinMat);
  cabin.position.set(0, 1.05, -0.2);
  root.add(cabin);

  // 4 Wheels
  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12);
  const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

  const positions: [number, number, number][] = [
    [-0.9, 0.3, 1.3],
    [0.9, 0.3, 1.3],
    [-0.9, 0.3, -1.3],
    [0.9, 0.3, -1.3],
  ];

  for (const [wx, wy, wz] of positions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(wx, wy, wz);
    root.add(wheel);
  }

  return root;
}

function normalizeGeometryToNonIndexed(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  const nonIndexed = geo.index ? geo.toNonIndexed() : geo.clone();
  const pos = nonIndexed.getAttribute('position');
  const vCount = pos ? pos.count : 0;
  if (!nonIndexed.getAttribute('normal')) {
    nonIndexed.computeVertexNormals();
  }
  if (!nonIndexed.getAttribute('uv')) {
    nonIndexed.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(vCount * 2), 2));
  }
  return nonIndexed;
}

const PRESERVED_VEHICLE_COLORS = new Set([
  0x187a38, // CNG green
  0xf2b705, // CNG yellow
  0xdd3322, // Rickshaw canopy crimson
  0xffaa00, // Rickshaw folk plate
  0x1e88e5, // Bus blue
  0xfdd835, // Bus stripe yellow
  0xd32f2f, // Bus destination red
  0xb91c1c, // Traffic motorcycle tank
  0x0d9488, // Scooter body
]);

/**
 * Collapses a hierarchical procedural vehicle group into a lean multi-material
 * BufferGeometry + Material[] prototype suitable for InstancedMesh rendering,
 * preserving key brand/livery materials and baking remaining neutral/trim parts into
 * a single vertex-colored material bucket to minimize draw calls.
 */
export function buildMultiMaterialPrototype(root: THREE.Object3D): {
  geometry: THREE.BufferGeometry;
  material: THREE.Material | THREE.Material[];
} {
  root.updateMatrixWorld(true);
  const buckets = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[] }>();
  const matOrder: string[] = [];
  const detailGeos: THREE.BufferGeometry[] = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh) || !child.geometry) return;
    const rawMat = Array.isArray(child.material) ? child.material[0] : child.material;
    if (!rawMat) return;
    const std = rawMat as THREE.MeshStandardMaterial;
    const hex = std.color ? std.color.getHex() : 0xffffff;
    if (PRESERVED_VEHICLE_COLORS.has(hex)) {
      const key = [
        hex,
        std.emissive ? std.emissive.getHex() : 0x000000,
        std.roughness ?? 0.5,
        std.metalness ?? 0,
        std.emissiveIntensity ?? 1,
      ].join('|');

      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { mat: rawMat, geos: [] };
        buckets.set(key, bucket);
        matOrder.push(key);
      }
      const geo = normalizeGeometryToNonIndexed(child.geometry);
      applyVertexColor(geo, 0xffffff);
      geo.applyMatrix4(child.matrixWorld);
      bucket.geos.push(geo);
    } else {
      const geo = normalizeGeometryToNonIndexed(child.geometry);
      applyVertexColor(geo, hex);
      geo.applyMatrix4(child.matrixWorld);
      detailGeos.push(geo);
    }
  });

  if (matOrder.length === 0 && detailGeos.length === 0) {
    const geo = new THREE.BoxGeometry(1.4, 1.2, 2.5);
    const mat = new THREE.MeshStandardMaterial({ color: 0x64748b });
    geo.userData.shared = true;
    mat.userData.shared = true;
    return { geometry: geo, material: mat };
  }

  const bucketGeos: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];

  for (const key of matOrder) {
    const bucket = buckets.get(key)!;
    const mergedBucket =
      bucket.geos.length === 1 ? bucket.geos[0]! : mergeGeometries(bucket.geos, false);
    if (bucket.geos.length > 1) {
      for (const g of bucket.geos) g.dispose();
    }
    if (mergedBucket) {
      bucketGeos.push(mergedBucket);
      bucket.mat.userData.shared = true;
      materials.push(bucket.mat);
    }
  }

  if (detailGeos.length > 0) {
    const mergedDetail =
      detailGeos.length === 1 ? detailGeos[0]! : mergeGeometries(detailGeos, false);
    if (detailGeos.length > 1) {
      for (const g of detailGeos) g.dispose();
    }
    if (mergedDetail) {
      const detailMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 0.7,
        metalness: 0.15,
      });
      detailMat.userData.shared = true;
      bucketGeos.push(mergedDetail);
      materials.push(detailMat);
    }
  }

  const finalGeo =
    bucketGeos.length === 1
      ? bucketGeos[0]!
      : mergeGeometries(bucketGeos, true) ?? bucketGeos[0]!;
  if (bucketGeos.length > 1 && finalGeo !== bucketGeos[0]) {
    for (const g of bucketGeos) g.dispose();
  }

  finalGeo.userData.shared = true;
  finalGeo.computeBoundingBox();

  return {
    geometry: finalGeo,
    material: materials.length === 1 ? materials[0]! : materials,
  };
}

export class InstancedTrafficRenderer {
  readonly group: THREE.Group;
  private carInstanced: THREE.InstancedMesh;
  private busInstanced: THREE.InstancedMesh;
  private cngInstanced: THREE.InstancedMesh;
  private dummy = new THREE.Object3D();

  constructor(maxVehicles = 100) {
    this.group = new THREE.Group();

    const carGeo = new THREE.BoxGeometry(1.8, 1.4, 4.4);
    const carMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, roughness: 0.4 });
    this.carInstanced = new THREE.InstancedMesh(carGeo, carMat, maxVehicles);
    this.carInstanced.count = 0;
    this.group.add(this.carInstanced);

    const busGeo = new THREE.BoxGeometry(2.4, 2.8, 8.0);
    const busMat = new THREE.MeshStandardMaterial({ color: 0x1e88e5, roughness: 0.5 });
    this.busInstanced = new THREE.InstancedMesh(busGeo, busMat, maxVehicles);
    this.busInstanced.count = 0;
    this.group.add(this.busInstanced);

    const cngGeo = new THREE.BoxGeometry(1.3, 1.8, 2.8);
    const cngMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.6 });
    this.cngInstanced = new THREE.InstancedMesh(cngGeo, cngMat, maxVehicles);
    this.cngInstanced.count = 0;
    this.group.add(this.cngInstanced);
  }

  update(agents: Array<{ kind: string; x: number; z: number; heading: number }>): void {
    let carCount = 0;
    let busCount = 0;
    let cngCount = 0;

    for (const a of agents) {
      this.dummy.position.set(a.x, 0.7, a.z);
      this.dummy.rotation.set(0, a.heading, 0);
      this.dummy.updateMatrix();

      if (a.kind === 'bus' && busCount < this.busInstanced.instanceMatrix.count) {
        this.busInstanced.setMatrixAt(busCount++, this.dummy.matrix);
      } else if (a.kind === 'cng' && cngCount < this.cngInstanced.instanceMatrix.count) {
        this.cngInstanced.setMatrixAt(cngCount++, this.dummy.matrix);
      } else if (carCount < this.carInstanced.instanceMatrix.count) {
        this.carInstanced.setMatrixAt(carCount++, this.dummy.matrix);
      }
    }

    this.busInstanced.count = busCount;
    this.cngInstanced.count = cngCount;
    this.carInstanced.count = carCount;

    this.busInstanced.instanceMatrix.needsUpdate = true;
    this.cngInstanced.instanceMatrix.needsUpdate = true;
    this.carInstanced.instanceMatrix.needsUpdate = true;
  }
}
