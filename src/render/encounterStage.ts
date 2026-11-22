import * as THREE from 'three';
import type { EncounterStageState } from '../core/types';
import { PEDESTRIAN_SKIN_COLORS } from './vehicleStyles';

/**
 * Stages visible 3D world actors ahead of the player during police checkpoints,
 * violation signal stops, suspicious pickups, and alley ambushes so the player sees
 * physical warnings on the road and can react or turn back during the cue window.
 * Strictly zero per-frame heap allocations in update().
 */
export class EncounterStageRenderer {
  readonly root: THREE.Group;
  readonly policeGroup: THREE.Group;
  readonly ambushGroup: THREE.Group;

  private readonly checkpointBarrierGroup: THREE.Group;
  private readonly officerRightArm: THREE.Mesh;
  private readonly ambushCenterArm: THREE.Mesh;
  private readonly ambushExtraFigure: THREE.Group;
  private readonly ambushCrateGroup: THREE.Group;

  private readonly skinMat: THREE.MeshStandardMaterial;
  private readonly policeShirtMat: THREE.MeshStandardMaterial;
  private readonly policePantsMat: THREE.MeshStandardMaterial;
  private readonly whiteCapMat: THREE.MeshStandardMaterial;
  private readonly redMat: THREE.MeshStandardMaterial;
  private readonly blueFlashMat: THREE.MeshStandardMaterial;
  private readonly redFlashMat: THREE.MeshStandardMaterial;
  private readonly coneMat: THREE.MeshStandardMaterial;
  private readonly ambushHoodieMat: THREE.MeshStandardMaterial;
  private readonly ambushPantsMat: THREE.MeshStandardMaterial;
  private readonly crateMat: THREE.MeshStandardMaterial;

  private readonly headGeo: THREE.BoxGeometry;
  private readonly torsoGeo: THREE.BoxGeometry;
  private readonly legGeo: THREE.BoxGeometry;
  private readonly armGeo: THREE.BoxGeometry;
  private readonly capGeo: THREE.BoxGeometry;
  private readonly batonGeo: THREE.CylinderGeometry;
  private readonly coneGeo: THREE.ConeGeometry;
  private readonly barrierBeamGeo: THREE.BoxGeometry;
  private readonly barrierPostGeo: THREE.BoxGeometry;
  private readonly bulbGeo: THREE.SphereGeometry;
  private readonly crateGeo: THREE.BoxGeometry;

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'encounter_stage_renderer';

    this.skinMat = new THREE.MeshStandardMaterial({
      color: PEDESTRIAN_SKIN_COLORS[0]!,
      roughness: 0.72,
    });
    this.policeShirtMat = new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      roughness: 0.7,
    });
    this.policePantsMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
    });
    this.whiteCapMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.55,
    });
    this.redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
    this.redFlashMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 1.5,
      roughness: 0.25,
    });
    this.blueFlashMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x3b82f6,
      emissiveIntensity: 1.5,
      roughness: 0.25,
    });
    this.coneMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.55 });
    this.ambushHoodieMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });
    this.ambushPantsMat = new THREE.MeshStandardMaterial({ color: 0x090d16, roughness: 0.92 });
    this.crateMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.88 });

    this.headGeo = new THREE.BoxGeometry(0.21, 0.22, 0.21);
    this.headGeo.translate(0, 1.56, 0);
    this.torsoGeo = new THREE.BoxGeometry(0.38, 0.58, 0.24);
    this.torsoGeo.translate(0, 1.12, 0);
    this.legGeo = new THREE.BoxGeometry(0.13, 0.84, 0.14);
    this.legGeo.translate(0, -0.42, 0);
    this.armGeo = new THREE.BoxGeometry(0.1, 0.48, 0.1);
    this.armGeo.translate(0, -0.22, 0);
    this.capGeo = new THREE.BoxGeometry(0.26, 0.1, 0.28);
    this.batonGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.42, 8);
    this.coneGeo = new THREE.ConeGeometry(0.22, 0.65, 8);
    this.barrierBeamGeo = new THREE.BoxGeometry(3.2, 0.28, 0.16);
    this.barrierPostGeo = new THREE.BoxGeometry(0.14, 0.95, 0.14);
    this.bulbGeo = new THREE.SphereGeometry(0.14, 8, 8);
    this.crateGeo = new THREE.BoxGeometry(0.85, 0.7, 0.75);

    // 1. Police checkpoint / signal sergeant group
    this.policeGroup = new THREE.Group();
    this.policeGroup.name = 'encounter_police_stage';
    this.policeGroup.visible = false;

    const officerGroup = new THREE.Group();
    officerGroup.position.set(1.1, 0, -0.4);
    const pHead = new THREE.Mesh(this.headGeo, this.skinMat);
    const pCap = new THREE.Mesh(this.capGeo, this.whiteCapMat);
    pCap.position.set(0, 1.7, 0.02);
    const pTorso = new THREE.Mesh(this.torsoGeo, this.policeShirtMat);
    const pLeftLeg = new THREE.Mesh(this.legGeo, this.policePantsMat);
    pLeftLeg.position.set(-0.1, 0.84, 0);
    const pRightLeg = new THREE.Mesh(this.legGeo, this.policePantsMat);
    pRightLeg.position.set(0.1, 0.84, 0);
    const pLeftArm = new THREE.Mesh(this.armGeo, this.policeShirtMat);
    pLeftArm.position.set(-0.25, 1.36, 0);
    this.officerRightArm = new THREE.Mesh(this.armGeo, this.policeShirtMat);
    this.officerRightArm.position.set(0.25, 1.36, 0);
    const baton = new THREE.Mesh(this.batonGeo, this.redMat);
    baton.position.set(0, -0.5, 0.14);
    baton.rotation.x = Math.PI / 3;
    this.officerRightArm.add(baton);
    officerGroup.add(pHead, pCap, pTorso, pLeftLeg, pRightLeg, pLeftArm, this.officerRightArm);
    this.policeGroup.add(officerGroup);

    const signalCone = new THREE.Mesh(this.coneGeo, this.coneMat);
    signalCone.position.set(1.6, 0.325, 0.5);
    this.policeGroup.add(signalCone);

    this.checkpointBarrierGroup = new THREE.Group();
    const beam = new THREE.Mesh(this.barrierBeamGeo, this.redMat);
    beam.position.set(-0.4, 0.82, 0.4);
    const postL = new THREE.Mesh(this.barrierPostGeo, this.whiteCapMat);
    postL.position.set(-1.9, 0.47, 0.4);
    const postR = new THREE.Mesh(this.barrierPostGeo, this.whiteCapMat);
    postR.position.set(1.1, 0.47, 0.4);
    const lampL = new THREE.Mesh(this.bulbGeo, this.redFlashMat);
    lampL.position.set(-1.9, 1.06, 0.4);
    const lampR = new THREE.Mesh(this.bulbGeo, this.blueFlashMat);
    lampR.position.set(1.1, 1.06, 0.4);
    const coneA = new THREE.Mesh(this.coneGeo, this.coneMat);
    coneA.position.set(-2.3, 0.325, 1.2);
    const coneB = new THREE.Mesh(this.coneGeo, this.coneMat);
    coneB.position.set(0.4, 0.325, 1.2);
    this.checkpointBarrierGroup.add(beam, postL, postR, lampL, lampR, coneA, coneB);
    this.policeGroup.add(this.checkpointBarrierGroup);
    this.root.add(this.policeGroup);

    // 2. Alley ambush / suspicious pickup group
    this.ambushGroup = new THREE.Group();
    this.ambushGroup.name = 'encounter_ambush_stage';
    this.ambushGroup.visible = false;

    const buildThug = (x: number, z: number): { fig: THREE.Group; rightArm: THREE.Mesh } => {
      const fig = new THREE.Group();
      fig.position.set(x, 0, z);
      const head = new THREE.Mesh(this.headGeo, this.skinMat);
      const torso = new THREE.Mesh(this.torsoGeo, this.ambushHoodieMat);
      const legL = new THREE.Mesh(this.legGeo, this.ambushPantsMat);
      legL.position.set(-0.1, 0.84, 0);
      const legR = new THREE.Mesh(this.legGeo, this.ambushPantsMat);
      legR.position.set(0.1, 0.84, 0);
      const armL = new THREE.Mesh(this.armGeo, this.ambushHoodieMat);
      armL.position.set(-0.25, 1.36, 0);
      const armR = new THREE.Mesh(this.armGeo, this.ambushHoodieMat);
      armR.position.set(0.25, 1.36, 0);
      fig.add(head, torso, legL, legR, armL, armR);
      return { fig, rightArm: armR };
    };

    const centerFig = buildThug(0, 0);
    this.ambushCenterArm = centerFig.rightArm;
    const leftFig = buildThug(-1.15, -0.35);
    const rightFig = buildThug(1.15, -0.3);
    this.ambushExtraFigure = rightFig.fig;

    this.ambushCrateGroup = new THREE.Group();
    const crateL = new THREE.Mesh(this.crateGeo, this.crateMat);
    crateL.position.set(-0.65, 0.35, 0.75);
    const crateR = new THREE.Mesh(this.crateGeo, this.crateMat);
    crateR.position.set(0.65, 0.35, 0.85);
    this.ambushCrateGroup.add(crateL, crateR);

    this.ambushGroup.add(
      centerFig.fig,
      leftFig.fig,
      rightFig.fig,
      this.ambushCrateGroup
    );
    this.root.add(this.ambushGroup);
  }

  update(state: EncounterStageState, timeSec: number): void {
    if (state.kind === 'none') {
      this.policeGroup.visible = false;
      this.ambushGroup.visible = false;
      return;
    }

    if (state.kind === 'policeCheckpoint' || state.kind === 'policeSignalStop') {
      this.ambushGroup.visible = false;
      this.policeGroup.visible = true;
      this.policeGroup.position.set(state.worldX, state.worldY, state.worldZ);
      this.policeGroup.rotation.y = state.facingRad;

      const isCheckpoint = state.kind === 'policeCheckpoint';
      this.checkpointBarrierGroup.visible = isCheckpoint;

      const blinkA = Math.sin(timeSec * 9) > 0 ? 2.4 : 0.25;
      const blinkB = Math.sin(timeSec * 9) > 0 ? 0.25 : 2.4;
      this.redFlashMat.emissiveIntensity = blinkA;
      this.blueFlashMat.emissiveIntensity = blinkB;

      const waveAmp = state.urgent || state.kind === 'policeSignalStop' ? 0.42 : 0.22;
      this.officerRightArm.rotation.x = -0.35;
      this.officerRightArm.rotation.z = 1.95 + Math.sin(timeSec * 7) * waveAmp;
      return;
    }

    this.policeGroup.visible = false;
    this.ambushGroup.visible = true;
    this.ambushGroup.position.set(state.worldX, state.worldY, state.worldZ);
    this.ambushGroup.rotation.y = state.facingRad;

    const isFullAmbush = state.kind === 'alleyAmbush';
    this.ambushExtraFigure.visible = isFullAmbush;
    this.ambushCrateGroup.visible = isFullAmbush;
    this.ambushCenterArm.rotation.x = state.urgent ? -0.95 : -0.45;
    this.ambushCenterArm.rotation.z = state.urgent
      ? 1.4 + Math.sin(timeSec * 5) * 0.25
      : 0;
  }

  dispose(): void {
    this.headGeo.dispose();
    this.torsoGeo.dispose();
    this.legGeo.dispose();
    this.armGeo.dispose();
    this.capGeo.dispose();
    this.batonGeo.dispose();
    this.coneGeo.dispose();
    this.barrierBeamGeo.dispose();
    this.barrierPostGeo.dispose();
    this.bulbGeo.dispose();
    this.crateGeo.dispose();

    this.skinMat.dispose();
    this.policeShirtMat.dispose();
    this.policePantsMat.dispose();
    this.whiteCapMat.dispose();
    this.redMat.dispose();
    this.redFlashMat.dispose();
    this.blueFlashMat.dispose();
    this.coneMat.dispose();
    this.ambushHoodieMat.dispose();
    this.ambushPantsMat.dispose();
    this.crateMat.dispose();
  }
}
