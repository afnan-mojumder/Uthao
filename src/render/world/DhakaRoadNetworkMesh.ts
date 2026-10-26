import * as THREE from 'three';
import type { RoadNetwork } from '../../sim/road/RoadNetwork';
import {
  createRoadTexture,
  createCrosswalkTexture,
  createSidewalkTexture,
} from './textures';
import {
  createFootbridgeMesh,
  createOverheadWiresMesh,
} from '../props';

export class DhakaRoadNetworkMesh {
  readonly root: THREE.Group;
  readonly colliders: THREE.Object3D[] = [];
  readonly streetlightLights: THREE.PointLight[] = [];

  private roadMaterial: THREE.MeshStandardMaterial;
  private alleyMaterial: THREE.MeshStandardMaterial;
  private crosswalkMaterial: THREE.MeshStandardMaterial;
  private sidewalkMaterial: THREE.MeshStandardMaterial;
  private curbMaterial: THREE.MeshStandardMaterial;

  constructor(roadNetwork: RoadNetwork) {
    this.root = new THREE.Group();

    // 1. Prepare shared textures & materials
    const roadTex = createRoadTexture(2, false);
    const alleyTex = createRoadTexture(1, true);
    const crosswalkTex = createCrosswalkTexture();
    const sidewalkTex = createSidewalkTexture();

    this.roadMaterial = new THREE.MeshStandardMaterial({
      map: roadTex,
      roughness: 0.8,
      metalness: 0.05,
    });

    this.alleyMaterial = new THREE.MeshStandardMaterial({
      map: alleyTex,
      roughness: 0.9,
      metalness: 0.05,
    });

    this.crosswalkMaterial = new THREE.MeshStandardMaterial({
      map: crosswalkTex,
      roughness: 0.7,
    });

    this.sidewalkMaterial = new THREE.MeshStandardMaterial({
      map: sidewalkTex,
      roughness: 0.85,
    });

    this.curbMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.9,
    });

    // 2. Build road network segments and junctions
    this.buildNetwork(roadNetwork);
    this.buildStreetFurniture(roadNetwork);
  }

  private buildNetwork(roadNetwork: RoadNetwork): void {
    const segments = roadNetwork.getAllSegments();

    for (const seg of segments) {
      const startNode = roadNetwork.getNode(seg.startNodeId);
      const endNode = roadNetwork.getNode(seg.endNodeId);
      if (!startNode || !endNode) continue;

      const dx = endNode.x - startNode.x;
      const dz = endNode.z - startNode.z;
      const length = Math.hypot(dx, dz);
      const midX = (startNode.x + endNode.x) / 2;
      const midZ = (startNode.z + endNode.z) / 2;
      const angle = Math.atan2(dx, dz);

      const isAlley = seg.roadType === 'alley';
      const width = seg.width || (isAlley ? 4.5 : 10.0);
      const mat = isAlley ? this.alleyMaterial : this.roadMaterial;

      // Road plane
      const roadGeo = new THREE.PlaneGeometry(width, length);
      const roadMesh = new THREE.Mesh(roadGeo, mat);
      roadMesh.rotation.x = -Math.PI / 2;
      roadMesh.rotation.z = -angle;
      roadMesh.position.set(midX, 0.015, midZ);
      roadMesh.receiveShadow = true;
      this.root.add(roadMesh);

      // Sidewalks on both sides (unless narrow alley)
      const walkWidth = isAlley ? 0.8 : 2.4;
      const walkHeight = 0.18; // Raised curb height
      const walkGeo = new THREE.BoxGeometry(walkWidth, walkHeight, length);

      // Left Sidewalk
      const leftWalk = new THREE.Mesh(walkGeo, this.sidewalkMaterial);
      const lOffset = (width / 2 + walkWidth / 2);
      leftWalk.position.set(
        midX - Math.cos(angle) * lOffset,
        walkHeight / 2,
        midZ + Math.sin(angle) * lOffset
      );
      leftWalk.rotation.y = angle;
      leftWalk.receiveShadow = true;
      this.root.add(leftWalk);
      this.colliders.push(leftWalk);

      // Right Sidewalk
      const rightWalk = new THREE.Mesh(walkGeo, this.sidewalkMaterial);
      const rOffset = (width / 2 + walkWidth / 2);
      rightWalk.position.set(
        midX + Math.cos(angle) * rOffset,
        walkHeight / 2,
        midZ - Math.sin(angle) * rOffset
      );
      rightWalk.rotation.y = angle;
      rightWalk.receiveShadow = true;
      this.root.add(rightWalk);
      this.colliders.push(rightWalk);

      // Curbs (Striped black and yellow raised edge)
      const curbGeo = new THREE.BoxGeometry(0.25, 0.22, length);
      const curbLeft = new THREE.Mesh(curbGeo, this.curbMaterial);
      curbLeft.position.set(
        midX - Math.cos(angle) * (width / 2 + 0.12),
        0.11,
        midZ + Math.sin(angle) * (width / 2 + 0.12)
      );
      curbLeft.rotation.y = angle;
      this.root.add(curbLeft);
      this.colliders.push(curbLeft);

      const curbRight = new THREE.Mesh(curbGeo, this.curbMaterial);
      curbRight.position.set(
        midX + Math.cos(angle) * (width / 2 + 0.12),
        0.11,
        midZ - Math.sin(angle) * (width / 2 + 0.12)
      );
      curbRight.rotation.y = angle;
      this.root.add(curbRight);
      this.colliders.push(curbRight);

      // Zebra crosswalks near junctions (5m before end of main roads)
      if (seg.roadType === 'main' && length > 25) {
        const cwGeo = new THREE.PlaneGeometry(width - 0.5, 4.0);
        const cwMesh = new THREE.Mesh(cwGeo, this.crosswalkMaterial);
        cwMesh.rotation.x = -Math.PI / 2;
        cwMesh.rotation.z = -angle;

        // Position 8m before endNode
        const t = (length - 8) / length;
        cwMesh.position.set(
          startNode.x + dx * t,
          0.02,
          startNode.z + dz * t
        );
        cwMesh.receiveShadow = true;
        this.root.add(cwMesh);
      }
    }
  }

  private buildStreetFurniture(roadNetwork: RoadNetwork): void {
    const nodes = roadNetwork.getAllNodes();

    // 1. Streetlights at junctions & every 30m
    const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 6.5, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.7 });

    const armGeo = new THREE.BoxGeometry(1.4, 0.08, 0.08);
    const lampGeo = new THREE.BoxGeometry(0.6, 0.12, 0.3);
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfffaed,
      emissiveIntensity: 0.9,
    });

    for (const node of nodes) {
      if (node.kind === 'junction') {
        const pole = new THREE.Group();

        const post = new THREE.Mesh(poleGeo, poleMat);
        post.position.y = 3.25;
        pole.add(post);

        const arm = new THREE.Mesh(armGeo, poleMat);
        arm.position.set(0.6, 6.4, 0);
        pole.add(arm);

        const lamp = new THREE.Mesh(lampGeo, lampMat);
        lamp.position.set(1.2, 6.35, 0);
        pole.add(lamp);

        // Point light for warm Dhaka night streetlight
        const light = new THREE.PointLight(0xffeedd, 0.9, 25);
        light.position.set(1.2, 6.0, 0);
        pole.add(light);
        this.streetlightLights.push(light);

        pole.position.set(node.x - 7.0, 0, node.z + 7.0);
        this.root.add(pole);
        this.colliders.push(pole);

        // Traffic Light on major junctions
        if (node.x === 0 || node.x === 100) {
          const tfPole = this.createTrafficLightGantry();
          tfPole.position.set(node.x + 6.5, 0, node.z - 6.5);
          this.root.add(tfPole);
          this.colliders.push(tfPole);
        }
      }
    }

    // 2. Overhead Dhaka Pedestrian Footbridge (placed over Main Road S1)
    const bridge = createFootbridgeMesh();
    bridge.position.set(50, 0, 0);
    bridge.rotation.y = Math.PI / 2;
    this.root.add(bridge);
    this.colliders.push(bridge);

    // 3. Overhead Tangled Electrical Wires across alleyway
    const wires = createOverheadWiresMesh();
    wires.position.set(50, 0, 50);
    this.root.add(wires);
  }

  private createTrafficLightGantry(): THREE.Group {
    const root = new THREE.Group();

    // Steel pole
    const poleGeo = new THREE.CylinderGeometry(0.1, 0.14, 5.5, 8);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.5 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 2.75;
    root.add(pole);

    // Signal head box (Black rectangle)
    const boxGeo = new THREE.BoxGeometry(0.4, 1.2, 0.3);
    const boxMat = new THREE.MeshStandardMaterial({ color: 0x0f172a });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(0, 4.8, 0);
    root.add(box);

    // Red, Yellow, Green signal lenses
    const lensGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.05, 12);
    const redMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.8 });
    const red = new THREE.Mesh(lensGeo, redMat);
    red.rotation.x = Math.PI / 2;
    red.position.set(0, 5.2, 0.16);
    root.add(red);

    const yelMat = new THREE.MeshStandardMaterial({ color: 0x78350f, emissive: 0x000000 });
    const yellow = new THREE.Mesh(lensGeo, yelMat);
    yellow.rotation.x = Math.PI / 2;
    yellow.position.set(0, 4.8, 0.16);
    root.add(yellow);

    const grnMat = new THREE.MeshStandardMaterial({ color: 0x064e3b, emissive: 0x000000 });
    const green = new THREE.Mesh(lensGeo, grnMat);
    green.rotation.x = Math.PI / 2;
    green.position.set(0, 4.4, 0.16);
    root.add(green);

    return root;
  }

  setWetness(wet: boolean): void {
    const roughness = wet ? 0.3 : 0.8;
    const metalness = wet ? 0.35 : 0.05;
    this.roadMaterial.roughness = roughness;
    this.roadMaterial.metalness = metalness;
    this.alleyMaterial.roughness = roughness;
    this.alleyMaterial.metalness = metalness;
  }
}
