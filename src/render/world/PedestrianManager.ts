import * as THREE from 'three';

export interface PedestrianNPC {
  id: string;
  mesh: THREE.Group;
  baseX: number;
  baseZ: number;
  currentX: number;
  currentZ: number;
  heading: number;
  speed: number;
  walkRadius: number;
  isIdling: boolean;
  legL: THREE.Mesh;
  legR: THREE.Mesh;
  walkCycle: number;
}

export class PedestrianManager {
  readonly root: THREE.Group;
  private npcs: PedestrianNPC[] = [];

  constructor() {
    this.root = new THREE.Group();
    this.spawnPedestrians();
  }

  private createPedestrianMesh(colorHex: number): { root: THREE.Group; legL: THREE.Mesh; legR: THREE.Mesh } {
    const root = new THREE.Group();

    // Head
    const headGeo = new THREE.SphereGeometry(0.18, 8, 8);
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.8 }); // South Asian skin tone
    const head = new THREE.Mesh(headGeo, skinMat);
    head.position.y = 1.62;
    root.add(head);

    // Torso / Shirt
    const torsoGeo = new THREE.BoxGeometry(0.38, 0.55, 0.22);
    const shirtMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.7 });
    const torso = new THREE.Mesh(torsoGeo, shirtMat);
    torso.position.y = 1.25;
    torso.castShadow = true;
    root.add(torso);

    // Legs / Pants
    const legGeo = new THREE.BoxGeometry(0.14, 0.8, 0.16);
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });

    const legL = new THREE.Mesh(legGeo, pantsMat);
    legL.position.set(-0.1, 0.45, 0);
    root.add(legL);

    const legR = new THREE.Mesh(legGeo, pantsMat);
    legR.position.set(0.1, 0.45, 0);
    root.add(legR);

    return { root, legL, legR };
  }

  private spawnPedestrians(): void {
    const shirtColors = [
      0x2563eb, // Blue
      0xdc2626, // Red
      0x16a34a, // Green
      0xf59e0b, // Amber
      0x9333ea, // Purple
      0xf8fafc, // White panjabi
      0x475569, // Slate
    ];

    // 1. Sidewalk walkers along Main Road S1 (x: 0 to 100, z: -7 and +7)
    for (let i = 0; i < 10; i++) {
      const color = shirtColors[i % shirtColors.length] ?? 0x2563eb;
      const { root, legL, legR } = this.createPedestrianMesh(color);
      const isNorthSide = i % 2 === 0;
      const x = 10 + i * 8.5;
      const z = isNorthSide ? -7.0 : 7.0;

      root.position.set(x, 0, z);
      this.root.add(root);

      this.npcs.push({
        id: `ped_walker_${i}`,
        mesh: root,
        baseX: x,
        baseZ: z,
        currentX: x,
        currentZ: z,
        heading: isNorthSide ? Math.PI / 2 : -Math.PI / 2,
        speed: 1.1 + (i % 3) * 0.2,
        walkRadius: 15.0,
        isIdling: false,
        legL,
        legR,
        walkCycle: i * 0.6,
      });
    }

    // 2. Tea stall idling group (around x: 8, z: 8 near tea stall)
    for (let i = 0; i < 4; i++) {
      const color = shirtColors[(i + 3) % shirtColors.length] ?? 0xf59e0b;
      const { root, legL, legR } = this.createPedestrianMesh(color);
      const angle = (i / 4) * Math.PI * 2;
      const x = 7.5 + Math.cos(angle) * 1.5;
      const z = 7.5 + Math.sin(angle) * 1.5;

      root.position.set(x, 0, z);
      root.rotation.y = angle + Math.PI; // Face inward towards kettle
      this.root.add(root);

      this.npcs.push({
        id: `ped_tea_${i}`,
        mesh: root,
        baseX: x,
        baseZ: z,
        currentX: x,
        currentZ: z,
        heading: angle + Math.PI,
        speed: 0,
        walkRadius: 0,
        isIdling: true,
        legL,
        legR,
        walkCycle: 0,
      });
    }

    // 3. Traffic Police Officer near Farmgate intersection (N1: 0, 0)
    const { root: policeMesh, legL: pL, legR: pR } = this.createPedestrianMesh(0x0284c7);
    policeMesh.position.set(-6.5, 0, -5.5);
    policeMesh.rotation.y = Math.PI / 4;
    this.root.add(policeMesh);

    this.npcs.push({
      id: 'ped_police_01',
      mesh: policeMesh,
      baseX: -6.5,
      baseZ: -5.5,
      currentX: -6.5,
      currentZ: -5.5,
      heading: Math.PI / 4,
      speed: 0,
      walkRadius: 0,
      isIdling: true,
      legL: pL,
      legR: pR,
      walkCycle: 0,
    });
  }

  update(dt: number, playerPos: { x: number; z: number }): void {
    for (const npc of this.npcs) {
      const distToPlayer = Math.hypot(npc.currentX - playerPos.x, npc.currentZ - playerPos.z);

      // Only update within 60m radius for performance
      if (distToPlayer > 60.0) continue;

      // Reactive dodge behavior: if player is too close (< 2.5m)
      if (distToPlayer < 2.5) {
        const awayX = npc.currentX - playerPos.x;
        const awayZ = npc.currentZ - playerPos.z;
        const len = Math.hypot(awayX, awayZ) || 1;
        npc.currentX += (awayX / len) * dt * 2.5;
        npc.currentZ += (awayZ / len) * dt * 2.5;
        npc.mesh.position.set(npc.currentX, 0, npc.currentZ);
        continue;
      }

      if (npc.isIdling) continue;

      // Walking animation cycle
      npc.walkCycle += dt * npc.speed * 4.0;
      npc.legL.rotation.x = Math.sin(npc.walkCycle) * 0.45;
      npc.legR.rotation.x = -Math.sin(npc.walkCycle) * 0.45;

      // Advance along heading
      const forwardX = Math.cos(npc.heading);
      const forwardZ = Math.sin(npc.heading);

      npc.currentX += forwardX * npc.speed * dt;
      npc.currentZ += forwardZ * npc.speed * dt;

      // Turn around if exceeded patrol radius
      if (Math.abs(npc.currentX - npc.baseX) > npc.walkRadius) {
        npc.heading += Math.PI;
        npc.mesh.rotation.y = npc.heading;
      }

      npc.mesh.position.set(npc.currentX, 0, npc.currentZ);
    }
  }
}
