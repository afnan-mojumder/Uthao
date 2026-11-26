import * as THREE from 'three';
import type { PassengerActorState, StreetHailActorState } from '../core/types';
import {
  PEDESTRIAN_PANTS_COLORS,
  PEDESTRIAN_SHIRT_COLORS,
  PEDESTRIAN_SKIN_COLORS,
} from './vehicleStyles';

/**
 * Interactive 3D passenger figure representing the active ride passenger on the
 * kerb, walking to/from the bike, or running an intermediate stop errand.
 * Reuses a fixed small hierarchy with zero per-frame allocations.
 */
export class WorldPassengerActor {
  readonly root: THREE.Group;

  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly shirtMat: THREE.MeshStandardMaterial;
  private readonly childShirtMat: THREE.MeshStandardMaterial;
  private readonly pantsMat: THREE.MeshStandardMaterial;
  private readonly beaconMat: THREE.MeshBasicMaterial;
  private readonly ringMat: THREE.MeshBasicMaterial;

  private readonly headGeo: THREE.BoxGeometry;
  private readonly torsoGeo: THREE.BoxGeometry;
  private readonly legGeo: THREE.BoxGeometry;
  private readonly armGeo: THREE.BoxGeometry;
  private readonly beaconGeo: THREE.OctahedronGeometry;
  private readonly ringGeo: THREE.RingGeometry;

  private readonly leftLeg: THREE.Mesh;
  private readonly rightLeg: THREE.Mesh;
  private readonly leftArm: THREE.Mesh;
  private readonly rightArm: THREE.Mesh;
  private readonly childGroup: THREE.Group;
  private readonly childLeftLeg: THREE.Mesh;
  private readonly childRightLeg: THREE.Mesh;
  private readonly beaconMesh: THREE.Mesh;
  private readonly ringMesh: THREE.Mesh;

  private lastSeed = -1;

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'ride_passenger_actor';
    this.root.visible = false;

    this.skinMat = new THREE.MeshStandardMaterial({
      color: PEDESTRIAN_SKIN_COLORS[0]!,
      roughness: 0.72,
    });
    this.shirtMat = new THREE.MeshStandardMaterial({
      color: PEDESTRIAN_SHIRT_COLORS[1]!,
      roughness: 0.78,
    });
    this.childShirtMat = new THREE.MeshStandardMaterial({
      color: PEDESTRIAN_SHIRT_COLORS[3]!,
      roughness: 0.78,
    });
    this.pantsMat = new THREE.MeshStandardMaterial({
      color: PEDESTRIAN_PANTS_COLORS[0]!,
      roughness: 0.85,
    });
    this.beaconMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
    });
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0x22c55e,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
    });

    this.headGeo = new THREE.BoxGeometry(0.21, 0.22, 0.21);
    this.headGeo.translate(0, 1.56, 0);

    this.torsoGeo = new THREE.BoxGeometry(0.36, 0.56, 0.22);
    this.torsoGeo.translate(0, 1.12, 0);

    this.legGeo = new THREE.BoxGeometry(0.13, 0.84, 0.14);
    this.legGeo.translate(0, -0.42, 0);

    this.armGeo = new THREE.BoxGeometry(0.1, 0.48, 0.1);
    this.armGeo.translate(0, -0.22, 0);

    const head = new THREE.Mesh(this.headGeo, this.skinMat);
    const torso = new THREE.Mesh(this.torsoGeo, this.shirtMat);
    head.castShadow = false;
    torso.castShadow = true;

    this.leftLeg = new THREE.Mesh(this.legGeo, this.pantsMat);
    this.leftLeg.position.set(-0.1, 0.84, 0);
    this.leftLeg.castShadow = false;

    this.rightLeg = new THREE.Mesh(this.legGeo, this.pantsMat);
    this.rightLeg.position.set(0.1, 0.84, 0);
    this.rightLeg.castShadow = false;

    this.leftArm = new THREE.Mesh(this.armGeo, this.shirtMat);
    this.leftArm.position.set(-0.24, 1.36, 0);
    this.leftArm.castShadow = false;

    this.rightArm = new THREE.Mesh(this.armGeo, this.shirtMat);
    this.rightArm.position.set(0.24, 1.36, 0);
    this.rightArm.castShadow = false;

    this.root.add(head, torso, this.leftLeg, this.rightLeg, this.leftArm, this.rightArm);

    // Optional child passenger figure (shown for parent-child pickups)
    this.childGroup = new THREE.Group();
    this.childGroup.position.set(0.45, 0, 0);
    this.childGroup.scale.setScalar(0.62);
    this.childGroup.visible = false;

    const cHead = new THREE.Mesh(this.headGeo, this.skinMat);
    const cTorso = new THREE.Mesh(this.torsoGeo, this.childShirtMat);
    this.childLeftLeg = new THREE.Mesh(this.legGeo, this.pantsMat);
    this.childLeftLeg.position.set(-0.1, 0.84, 0);
    this.childRightLeg = new THREE.Mesh(this.legGeo, this.pantsMat);
    this.childRightLeg.position.set(0.1, 0.84, 0);
    const cLeftArm = new THREE.Mesh(this.armGeo, this.childShirtMat);
    cLeftArm.position.set(-0.24, 1.36, 0);
    const cRightArm = new THREE.Mesh(this.armGeo, this.childShirtMat);
    cRightArm.position.set(0.24, 1.36, 0);
    this.childGroup.add(
      cHead,
      cTorso,
      this.childLeftLeg,
      this.childRightLeg,
      cLeftArm,
      cRightArm
    );
    this.root.add(this.childGroup);

    this.beaconGeo = new THREE.OctahedronGeometry(0.11, 0);
    this.beaconMesh = new THREE.Mesh(this.beaconGeo, this.beaconMat);
    this.beaconMesh.position.set(0, 2.1, 0);
    this.beaconMesh.visible = false;
    this.root.add(this.beaconMesh);

    this.ringGeo = new THREE.RingGeometry(0.55, 0.72, 24);
    this.ringGeo.rotateX(-Math.PI / 2);
    this.ringMesh = new THREE.Mesh(this.ringGeo, this.ringMat);
    this.ringMesh.position.set(0, 0.03, 0);
    this.ringMesh.visible = false;
    this.root.add(this.ringMesh);
  }

  private syncPalette(seed: number): void {
    const absSeed = Math.abs(seed | 0);
    if (absSeed === this.lastSeed) return;
    this.lastSeed = absSeed;
    this.skinMat.color.setHex(
      PEDESTRIAN_SKIN_COLORS[absSeed % PEDESTRIAN_SKIN_COLORS.length]!
    );
    this.shirtMat.color.setHex(
      PEDESTRIAN_SHIRT_COLORS[(absSeed >>> 3) % PEDESTRIAN_SHIRT_COLORS.length]!
    );
    this.childShirtMat.color.setHex(
      PEDESTRIAN_SHIRT_COLORS[((absSeed >>> 3) + 2) % PEDESTRIAN_SHIRT_COLORS.length]!
    );
    this.pantsMat.color.setHex(
      PEDESTRIAN_PANTS_COLORS[(absSeed >>> 7) % PEDESTRIAN_PANTS_COLORS.length]!
    );
  }

  update(state: PassengerActorState, timeSec: number): void {
    if (state.mode === 'hidden' || state.mode === 'onPillion') {
      this.root.visible = false;
      this.beaconMesh.visible = false;
      this.ringMesh.visible = false;
      return;
    }

    this.root.visible = true;
    this.root.position.set(state.worldX, 0.12, state.worldZ);
    this.root.rotation.y = state.facingRad;

    this.syncPalette(state.passengerSeed ?? 0);

    const hasChild = Boolean(state.hasChild);
    this.childGroup.visible = hasChild;

    const beaconVisible = Boolean(state.beaconVisible);
    this.beaconMesh.visible = beaconVisible;
    this.ringMesh.visible = beaconVisible;
    if (beaconVisible) {
      this.beaconMesh.position.y = 2.1 + Math.sin(timeSec * 3.5) * 0.08;
      this.beaconMesh.rotation.y = timeSec * 1.8;
      const pulse = 1 + Math.sin(timeSec * 3.5) * 0.08;
      this.ringMesh.scale.set(pulse, 1, pulse);
    }

    if (state.mode === 'walkingToBike' || state.mode === 'walkingBackToBike') {
      const swing = Math.sin(timeSec * 10) * 0.55;
      this.leftLeg.rotation.x = swing;
      this.rightLeg.rotation.x = -swing;
      this.leftArm.rotation.x = -swing * 0.7;
      this.rightArm.rotation.x = swing * 0.7;
      this.rightArm.rotation.z = 0;
      if (hasChild) {
        this.childLeftLeg.rotation.x = swing;
        this.childRightLeg.rotation.x = -swing;
      }
      return;
    }

    this.leftLeg.rotation.x = 0;
    this.rightLeg.rotation.x = 0;
    this.leftArm.rotation.x = 0;
    if (hasChild) {
      this.childLeftLeg.rotation.x = 0;
      this.childRightLeg.rotation.x = 0;
    }

    if (state.waving) {
      this.rightArm.rotation.x = -0.35;
      this.rightArm.rotation.z = 2.3 + Math.sin(timeSec * 7.5) * 0.35;
    } else {
      this.rightArm.rotation.x = 0;
      this.rightArm.rotation.z = 0;
    }
  }

  setBeaconColor(hex: number): void {
    this.beaconMat.color.setHex(hex);
    this.ringMat.color.setHex(hex);
  }

  dispose(): void {
    this.headGeo.dispose();
    this.torsoGeo.dispose();
    this.legGeo.dispose();
    this.armGeo.dispose();
    this.beaconGeo.dispose();
    this.ringGeo.dispose();
    this.skinMat.dispose();
    this.shirtMat.dispose();
    this.childShirtMat.dispose();
    this.pantsMat.dispose();
    this.beaconMat.dispose();
    this.ringMat.dispose();
  }
}

/**
 * Pooled renderer for 1–2 waving street-hail NPCs standing on nearby kerbs.
 * Zero per-frame heap allocations in update().
 */
export class StreetHailRenderer {
  readonly root: THREE.Group;
  private readonly actors: [WorldPassengerActor, WorldPassengerActor];
  private readonly actorStateScratch: PassengerActorState = {
    mode: 'hidden',
    worldX: 0,
    worldZ: 0,
    facingRad: 0,
    passengerSeed: 0,
    hasChild: false,
    waving: true,
    beaconVisible: true,
  };

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'street_hail_renderer';
    const a0 = new WorldPassengerActor();
    const a1 = new WorldPassengerActor();
    a0.setBeaconColor(0xf59e0b);
    a1.setBeaconColor(0xf59e0b);
    this.actors = [a0, a1];
    this.root.add(a0.root, a1.root);
  }

  update(states: readonly StreetHailActorState[], timeSec: number): void {
    const scratch = this.actorStateScratch;
    for (let i = 0; i < this.actors.length; i++) {
      const actor = this.actors[i]!;
      const st = i < states.length ? states[i] : undefined;
      if (!st || !st.active) {
        scratch.mode = 'hidden';
        scratch.waving = false;
        scratch.beaconVisible = false;
        actor.update(scratch, timeSec);
        continue;
      }
      scratch.mode = 'waitingAtPickup';
      scratch.worldX = st.worldX;
      scratch.worldZ = st.worldZ;
      scratch.facingRad = st.facingRad;
      scratch.passengerSeed = st.seed;
      scratch.hasChild = false;
      scratch.waving = true;
      scratch.beaconVisible = true;
      actor.update(scratch, timeSec);
    }
  }

  getVisibleCount(): number {
    let n = 0;
    for (let i = 0; i < this.actors.length; i++) {
      if (this.actors[i]!.root.visible) n++;
    }
    return n;
  }

  dispose(): void {
    this.actors[0].dispose();
    this.actors[1].dispose();
  }
}
