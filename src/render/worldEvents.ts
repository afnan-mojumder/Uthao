import * as THREE from 'three';
import type { RoadNetwork } from '../sim/road/RoadNetwork';
import type { ActiveRoadEvent } from '../sim/world/RoadEvents';
import { createBusMesh } from './vehicles';
import { disposeHierarchy } from './lod';

function sharedGeo<T extends THREE.BufferGeometry>(g: T): T {
  g.userData.shared = true;
  return g;
}

function sharedMat<T extends THREE.Material>(m: T): T {
  m.userData.shared = true;
  return m;
}

/**
 * Renders live 3D Dhaka props for active RoadEventManager events (roadwork barriers
 * and cones, stalled sideways local bus with hazard lights, police VIP barricades,
 * flood warning signs, market stalls/crates). Zero per-frame allocations in update().
 */
export class WorldEventRenderer {
  readonly root: THREE.Group;

  private readonly eventGroups = new Map<string, THREE.Group>();

  private readonly coneGeo = sharedGeo(new THREE.ConeGeometry(0.22, 0.65, 8));
  private readonly barrierBeamGeo = sharedGeo(new THREE.BoxGeometry(2.6, 0.28, 0.16));
  private readonly barrierPostGeo = sharedGeo(new THREE.BoxGeometry(0.14, 0.9, 0.14));
  private readonly signPoleGeo = sharedGeo(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 8));
  private readonly signBoardGeo = sharedGeo(new THREE.BoxGeometry(0.75, 0.55, 0.08));
  private readonly bulbGeo = sharedGeo(new THREE.SphereGeometry(0.14, 8, 8));
  private readonly crateGeo = sharedGeo(new THREE.BoxGeometry(0.65, 0.55, 0.65));
  private readonly stallCanopyGeo = sharedGeo(new THREE.BoxGeometry(2.4, 0.12, 1.5));
  private readonly floodSheetGeo = sharedGeo(new THREE.PlaneGeometry(5.5, 12));

  private readonly orangeConeMat = sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.55 })
  );
  private readonly whiteStripeMat = sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.55 })
  );
  private readonly redStripeMat = sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.55 })
  );
  private readonly policeBlueMat = sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.5 })
  );
  private readonly yellowWarnMat = sharedMat(
    new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.5 })
  );
  private readonly darkFrameMat = sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 })
  );
  private readonly woodMat = sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.85 })
  );
  private readonly tealTarpMat = sharedMat(
    new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.78 })
  );
  private readonly waterOverlayMat = sharedMat(
    new THREE.MeshStandardMaterial({
      color: 0x1e3a5f,
      roughness: 0.15,
      metalness: 0.25,
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide,
    })
  );
  private readonly amberFlashMat = sharedMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    })
  );
  private readonly redFlashMat = sharedMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xef4444,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    })
  );
  private readonly blueFlashMat = sharedMat(
    new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x3b82f6,
      emissiveIntensity: 1.4,
      roughness: 0.25,
    })
  );

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'world_events_renderer';
    this.floodSheetGeo.rotateX(-Math.PI / 2);
  }

  private addCone(parent: THREE.Group, x: number, z: number): void {
    const cone = new THREE.Mesh(this.coneGeo, this.orangeConeMat);
    cone.position.set(x, 0.325, z);
    parent.add(cone);
  }

  private addBarricade(
    parent: THREE.Group,
    x: number,
    z: number,
    beamMat: THREE.Material
  ): void {
    const beam = new THREE.Mesh(this.barrierBeamGeo, beamMat);
    beam.position.set(x, 0.78, z);
    const lLeg = new THREE.Mesh(this.barrierPostGeo, this.darkFrameMat);
    lLeg.position.set(x - 1.1, 0.45, z);
    const rLeg = new THREE.Mesh(this.barrierPostGeo, this.darkFrameMat);
    rLeg.position.set(x + 1.1, 0.45, z);
    parent.add(beam, lLeg, rLeg);
  }

  private addFlashPole(
    parent: THREE.Group,
    x: number,
    z: number,
    bulbMat: THREE.Material
  ): void {
    const pole = new THREE.Mesh(this.signPoleGeo, this.darkFrameMat);
    pole.position.set(x, 0.9, z);
    const bulb = new THREE.Mesh(this.bulbGeo, bulbMat);
    bulb.position.set(x, 1.88, z);
    parent.add(pole, bulb);
  }

  private buildEventVisual(ev: ActiveRoadEvent): THREE.Group {
    const group = new THREE.Group();
    group.name = `road_event_${ev.id}`;
    group.userData = { eventId: ev.id, kind: ev.kind, segmentId: ev.segmentId };

    switch (ev.kind) {
      case 'construction': {
        this.addBarricade(group, -0.5, -2.5, this.orangeConeMat);
        this.addBarricade(group, 0.5, 2.5, this.orangeConeMat);
        this.addCone(group, -1.8, -3.5);
        this.addCone(group, 1.8, -3.5);
        this.addCone(group, -1.8, 3.5);
        this.addCone(group, 1.8, 3.5);
        this.addFlashPole(group, -1.7, -2.5, this.amberFlashMat);
        break;
      }
      case 'stalled_vehicle': {
        const bus = createBusMesh();
        bus.rotation.y = 0.55;
        const hL = new THREE.Mesh(this.bulbGeo, this.amberFlashMat);
        hL.position.set(-1.1, 1.1, 3.92);
        const hR = new THREE.Mesh(this.bulbGeo, this.amberFlashMat);
        hR.position.set(1.1, 1.1, 3.92);
        bus.add(hL, hR);
        group.add(bus);
        const tri = new THREE.Mesh(this.signBoardGeo, this.redFlashMat);
        tri.position.set(0, 0.35, -5.2);
        this.addCone(group, -1.5, -4.6);
        this.addCone(group, 1.5, 4.6);
        group.add(tri);
        break;
      }
      case 'vip_protocol': {
        this.addBarricade(group, 0, -1.5, this.policeBlueMat);
        this.addBarricade(group, 0, 1.5, this.whiteStripeMat);
        this.addFlashPole(group, -1.6, -1.5, this.redFlashMat);
        this.addFlashPole(group, 1.6, -1.5, this.blueFlashMat);
        this.addCone(group, -2.1, -2.4);
        this.addCone(group, 2.1, -2.4);
        break;
      }
      case 'waterlogging': {
        const sheet = new THREE.Mesh(this.floodSheetGeo, this.waterOverlayMat);
        sheet.position.set(0, 0.04, 0);
        const board = new THREE.Mesh(this.signBoardGeo, this.yellowWarnMat);
        board.position.set(-2.2, 1.55, -4.5);
        const pole = new THREE.Mesh(this.signPoleGeo, this.darkFrameMat);
        pole.position.set(-2.2, 0.9, -4.5);
        this.addCone(group, -2.1, -3.5);
        this.addCone(group, 2.1, -3.5);
        group.add(sheet, pole, board);
        break;
      }
      case 'market_congestion':
      case 'eid_rush': {
        for (const side of [-1, 1] as const) {
          const sx = side * 2.6;
          const canopy = new THREE.Mesh(
            this.stallCanopyGeo,
            side < 0 ? this.tealTarpMat : this.orangeConeMat
          );
          canopy.position.set(sx, 2.0, 0);
          const crateA = new THREE.Mesh(this.crateGeo, this.woodMat);
          crateA.position.set(sx, 0.28, -0.8);
          const crateB = new THREE.Mesh(this.crateGeo, this.woodMat);
          crateB.position.set(sx, 0.28, 0.8);
          group.add(canopy, crateA, crateB);
        }
        break;
      }
      case 'blocked_intersection':
      case 'closure':
      case 'diversion':
      default: {
        this.addBarricade(group, 0, -1.0, this.redStripeMat);
        this.addBarricade(group, 0, 1.2, this.whiteStripeMat);
        this.addCone(group, -1.7, -2.0);
        this.addCone(group, 1.7, -2.0);
        this.addFlashPole(group, 1.7, -1.0, this.amberFlashMat);
        if (ev.kind === 'diversion') {
          const signPole = new THREE.Mesh(this.signPoleGeo, this.darkFrameMat);
          signPole.position.set(-1.7, 0.9, -1.0);
          const sign = new THREE.Mesh(this.signBoardGeo, this.policeBlueMat);
          sign.position.set(-1.7, 1.55, -1.0);
          group.add(signPole, sign);
        }
        break;
      }
    }

    return group;
  }

  sync(events: readonly ActiveRoadEvent[], roadNetwork: RoadNetwork): void {
    const activeIds = new Set<string>();
    for (let i = 0; i < events.length; i++) {
      const ev = events[i]!;
      if (!ev.active || !ev.segmentId) continue;
      activeIds.add(ev.id);

      let group = this.eventGroups.get(ev.id);
      if (!group) {
        group = this.buildEventVisual(ev);
        this.eventGroups.set(ev.id, group);
        this.root.add(group);
      }

      const seg = roadNetwork.getSegment(ev.segmentId);
      const sNode = seg ? roadNetwork.getNode(seg.startNodeId) : undefined;
      const eNode = seg ? roadNetwork.getNode(seg.endNodeId) : undefined;
      if (sNode && eNode) {
        const dx = eNode.x - sNode.x;
        const dz = eNode.z - sNode.z;
        group.position.set(
          (sNode.x + eNode.x) * 0.5,
          ((sNode.y ?? 0) + (eNode.y ?? 0)) * 0.5,
          (sNode.z + eNode.z) * 0.5
        );
        group.rotation.y = Math.atan2(dx, dz);
        group.visible = true;
      } else {
        group.visible = false;
      }
    }

    for (const [id, group] of this.eventGroups.entries()) {
      if (!activeIds.has(id)) {
        this.root.remove(group);
        disposeHierarchy(group);
        this.eventGroups.delete(id);
      }
    }
  }

  /** Animates warning beacons / hazard flashers with zero heap allocations. */
  update(timeSec: number): void {
    if (this.eventGroups.size === 0) return;
    const blinkA = Math.sin(timeSec * 8) > 0 ? 2.2 : 0.25;
    const blinkB = Math.sin(timeSec * 8) > 0 ? 0.25 : 2.2;
    this.amberFlashMat.emissiveIntensity = blinkA;
    this.redFlashMat.emissiveIntensity = blinkA;
    this.blueFlashMat.emissiveIntensity = blinkB;
  }

  getActiveCount(): number {
    return this.eventGroups.size;
  }

  getEventGroup(eventId: string): THREE.Group | undefined {
    return this.eventGroups.get(eventId);
  }

  clear(): void {
    for (const group of this.eventGroups.values()) {
      this.root.remove(group);
      disposeHierarchy(group);
    }
    this.eventGroups.clear();
  }

  dispose(): void {
    this.clear();

    this.coneGeo.dispose();
    this.barrierBeamGeo.dispose();
    this.barrierPostGeo.dispose();
    this.signPoleGeo.dispose();
    this.signBoardGeo.dispose();
    this.bulbGeo.dispose();
    this.crateGeo.dispose();
    this.stallCanopyGeo.dispose();
    this.floodSheetGeo.dispose();

    this.orangeConeMat.dispose();
    this.whiteStripeMat.dispose();
    this.redStripeMat.dispose();
    this.policeBlueMat.dispose();
    this.yellowWarnMat.dispose();
    this.darkFrameMat.dispose();
    this.woodMat.dispose();
    this.tealTarpMat.dispose();
    this.waterOverlayMat.dispose();
    this.amberFlashMat.dispose();
    this.redFlashMat.dispose();
    this.blueFlashMat.dispose();
  }
}
