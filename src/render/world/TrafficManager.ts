import * as THREE from 'three';
import type { RoadNetwork } from '../../sim/road/RoadNetwork';
import {
  createCNGMesh,
  createRickshawMesh,
  createBusMesh,
} from '../vehicles';

export type TrafficType = 'cng' | 'rickshaw' | 'bus' | 'car' | 'motorcycle';
export type TrafficState = 'cruising' | 'following' | 'yielding';

export interface TrafficAgent {
  id: string;
  type: TrafficType;
  mesh: THREE.Group;
  segmentIndex: number;
  progress: number; // 0 to 1 along current segment
  speed: number; // m/s
  targetSpeed: number; // m/s
  laneOffset: number; // lateral offset from road centerline (-2.5 or +2.5)
  baseLaneOffset: number;
  state: TrafficState;
  yieldTimer: number;
  isParked: boolean;
  length: number;
  width: number;
}

export class TrafficManager {
  readonly root: THREE.Group;
  private agents: TrafficAgent[] = [];
  private roadNetwork: RoadNetwork;
  private collisionCooldown: number = 0;

  constructor(roadNetwork: RoadNetwork) {
    this.root = new THREE.Group();
    this.roadNetwork = roadNetwork;
    this.spawnTraffic();
  }

  private createCarMesh(): THREE.Group {
    const root = new THREE.Group();

    // Sedan chassis
    const bodyGeo = new THREE.BoxGeometry(1.8, 0.7, 4.2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf1f5f9, // Classic white Dhaka sedan
      roughness: 0.4,
      metalness: 0.3,
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55;
    root.add(body);

    // Cabin roof
    const cabinGeo = new THREE.BoxGeometry(1.5, 0.65, 2.2);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a, // Tinted glass
      roughness: 0.2,
      metalness: 0.8,
    });
    const cabin = new THREE.Mesh(cabinGeo, cabinMat);
    cabin.position.set(0, 1.15, -0.2);
    root.add(cabin);

    // 4 Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.18, 16);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.9 });

    const w1 = new THREE.Mesh(wheelGeo, wheelMat);
    w1.rotation.z = Math.PI / 2;
    w1.position.set(-0.9, 0.32, 1.2);
    root.add(w1);

    const w2 = new THREE.Mesh(wheelGeo, wheelMat);
    w2.rotation.z = Math.PI / 2;
    w2.position.set(0.9, 0.32, 1.2);
    root.add(w2);

    const w3 = new THREE.Mesh(wheelGeo, wheelMat);
    w3.rotation.z = Math.PI / 2;
    w3.position.set(-0.9, 0.32, -1.2);
    root.add(w3);

    const w4 = new THREE.Mesh(wheelGeo, wheelMat);
    w4.rotation.z = Math.PI / 2;
    w4.position.set(0.9, 0.32, -1.2);
    root.add(w4);

    return root;
  }

  private spawnTraffic(): void {
    const segments = this.roadNetwork.getAllSegments();
    if (segments.length === 0) return;

    // Moving traffic specifications
    const specs: Array<{ type: TrafficType; targetSpeed: number; length: number; width: number }> = [
      { type: 'cng', targetSpeed: 7.5, length: 2.2, width: 1.3 },
      { type: 'cng', targetSpeed: 8.0, length: 2.2, width: 1.3 },
      { type: 'rickshaw', targetSpeed: 4.2, length: 2.0, width: 1.1 },
      { type: 'rickshaw', targetSpeed: 3.8, length: 2.0, width: 1.1 },
      { type: 'bus', targetSpeed: 6.0, length: 8.0, width: 2.4 },
      { type: 'car', targetSpeed: 9.5, length: 4.2, width: 1.8 },
      { type: 'car', targetSpeed: 9.0, length: 4.2, width: 1.8 },
    ];

    specs.forEach((spec, idx) => {
      let mesh: THREE.Group;
      if (spec.type === 'cng') mesh = createCNGMesh();
      else if (spec.type === 'rickshaw') mesh = createRickshawMesh();
      else if (spec.type === 'bus') mesh = createBusMesh();
      else mesh = this.createCarMesh();

      const segIdx = idx % segments.length;
      const progress = (idx * 0.28) % 0.85 + 0.05;
      const laneOffset = idx % 2 === 0 ? 2.2 : -2.2;

      const agent: TrafficAgent = {
        id: `traffic_${idx}`,
        type: spec.type,
        mesh,
        segmentIndex: segIdx,
        progress,
        speed: spec.targetSpeed,
        targetSpeed: spec.targetSpeed,
        laneOffset,
        baseLaneOffset: laneOffset,
        state: 'cruising',
        yieldTimer: 0,
        isParked: false,
        length: spec.length,
        width: spec.width,
      };

      this.agents.push(agent);
      this.root.add(mesh);
    });

    // Parked roadside vehicles
    const parkedRickshaw = createRickshawMesh();
    parkedRickshaw.position.set(12, 0, 5);
    parkedRickshaw.rotation.y = Math.PI / 4;
    this.root.add(parkedRickshaw);

    const parkedCng = createCNGMesh();
    parkedCng.position.set(88, 0, 5);
    parkedCng.rotation.y = -Math.PI / 6;
    this.root.add(parkedCng);
  }

  /**
   * Reacts to player's horn: vehicles ahead swerve slightly or respond.
   */
  public onPlayerHorn(playerPos: { x: number; z: number }): { responded: boolean; type?: TrafficType } {
    let nearestAgent: TrafficAgent | null = null;
    let minDistance = 22.0;

    for (const agent of this.agents) {
      if (agent.isParked) continue;
      const dist = Math.hypot(agent.mesh.position.x - playerPos.x, agent.mesh.position.z - playerPos.z);
      if (dist < minDistance) {
        minDistance = dist;
        nearestAgent = agent;
      }
    }

    if (nearestAgent) {
      nearestAgent.state = 'yielding';
      nearestAgent.yieldTimer = 3.0;
      return { responded: true, type: nearestAgent.type };
    }

    return { responded: false };
  }

  update(dt: number, playerPos: { x: number; z: number }): { collision: boolean; otherType?: TrafficType } {
    const segments = this.roadNetwork.getAllSegments();
    if (segments.length === 0) return { collision: false };

    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    let playerHit: TrafficType | undefined;

    for (let i = 0; i < this.agents.length; i++) {
      const agent = this.agents[i]!;
      if (agent.isParked) continue;

      const seg = segments[agent.segmentIndex % segments.length]!;
      const startNode = this.roadNetwork.getNode(seg.startNodeId);
      const endNode = this.roadNetwork.getNode(seg.endNodeId);
      if (!startNode || !endNode) continue;

      const dx = endNode.x - startNode.x;
      const dz = endNode.z - startNode.z;
      const segLength = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, dz);

      // Handle FSM states
      if (agent.state === 'yielding') {
        agent.yieldTimer -= dt;
        // Swerve towards the road edge
        const targetOffset = agent.baseLaneOffset > 0 ? agent.baseLaneOffset + 0.6 : agent.baseLaneOffset - 0.6;
        agent.laneOffset += (targetOffset - agent.laneOffset) * Math.min(1.0, dt * 2.5);
        if (agent.yieldTimer <= 0) {
          agent.state = 'cruising';
        }
      } else {
        // Return smoothly to base lane
        agent.laneOffset += (agent.baseLaneOffset - agent.laneOffset) * Math.min(1.0, dt * 2.0);
      }

      // Following distance behavior: check if someone is ahead in the same lane
      let desiredSpeed = agent.targetSpeed;
      for (let j = 0; j < this.agents.length; j++) {
        if (i === j) continue;
        const other = this.agents[j]!;
        if (
          other.segmentIndex === agent.segmentIndex &&
          Math.abs(other.laneOffset - agent.laneOffset) < 1.5 &&
          other.progress > agent.progress &&
          (other.progress - agent.progress) * segLength < 12.0
        ) {
          // Brake smoothly behind leader
          desiredSpeed = Math.min(desiredSpeed, other.speed * 0.85);
          if (agent.state !== 'yielding') {
            agent.state = 'following';
          }
        }
      }

      // Accelerate or brake
      agent.speed += (desiredSpeed - agent.speed) * Math.min(1.0, dt * 2.0);

      // Advance along road
      agent.progress += (agent.speed * dt) / Math.max(1, segLength);

      // Loop or advance to next segment
      if (agent.progress >= 1.0) {
        agent.progress = 0.02;
        agent.segmentIndex = (agent.segmentIndex + 1) % segments.length;
      }

      // Compute 3D position
      const px = startNode.x + dx * agent.progress;
      const pz = startNode.z + dz * agent.progress;

      // Apply lane offset perpendicular to heading
      const perpAngle = angle + Math.PI / 2;
      const finalX = px + Math.sin(perpAngle) * agent.laneOffset;
      const finalZ = pz + Math.cos(perpAngle) * agent.laneOffset;

      agent.mesh.position.set(finalX, 0, finalZ);
      agent.mesh.rotation.y = angle;

      // Check collision with player motorcycle (approx 1.8m radius)
      const distToPlayer = Math.hypot(finalX - playerPos.x, finalZ - playerPos.z);
      const collisionThreshold = (agent.length / 2) + 1.2;

      if (distToPlayer < collisionThreshold && this.collisionCooldown <= 0) {
        this.collisionCooldown = 2.0; // 2 seconds between hits
        playerHit = agent.type;
      }
    }

    return {
      collision: Boolean(playerHit),
      otherType: playerHit,
    };
  }
}
