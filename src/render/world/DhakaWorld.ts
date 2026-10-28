import * as THREE from 'three';
import type { RoadNetwork } from '../../sim/road/RoadNetwork';
import { DhakaRoadNetworkMesh } from './DhakaRoadNetworkMesh';
import {
  createDhakaApartment,
  createCommercialBlock,
  createKamalGarageWorkshop,
  createDhakaFuelStation,
  createDhakaMosque,
  createConstructionSite,
  createDhakaTree,
  createDhakaBillboard,
  createTeaStallMesh,
} from './DhakaBuildingPrefabs';
import { TrafficManager } from './TrafficManager';
import { PedestrianManager } from './PedestrianManager';
import { ParticlePool } from '../particles/ParticlePool';
import { EnvironmentController, type TimeOfDay, type WeatherType } from './EnvironmentController';

export class DhakaWorld {
  readonly root: THREE.Group;
  readonly roadMesh: DhakaRoadNetworkMesh;
  readonly trafficManager: TrafficManager;
  readonly pedestrianManager: PedestrianManager;
  readonly particlePool: ParticlePool;
  readonly environmentController: EnvironmentController;
  readonly colliders: THREE.Object3D[] = [];

  constructor(
    roadNetwork: RoadNetwork,
    scene: THREE.Scene,
    hemiLight: THREE.HemisphereLight,
    dirLight: THREE.DirectionalLight
  ) {
    this.root = new THREE.Group();

    // 1. Road Network Mesh (Asphalt, curbs, sidewalks, crosswalks, footbridge, streetlights)
    this.roadMesh = new DhakaRoadNetworkMesh(roadNetwork);
    this.root.add(this.roadMesh.root);
    this.colliders.push(...this.roadMesh.colliders);

    // 2. Dhaka Buildings and Landmarks Placement
    this.populateBuildings();

    // 3. Traffic Simulation System
    this.trafficManager = new TrafficManager(roadNetwork);
    this.root.add(this.trafficManager.root);

    // 4. Pedestrian Simulation System
    this.pedestrianManager = new PedestrianManager();
    this.root.add(this.pedestrianManager.root);

    // 5. Object-Pooled Particle System (Exhaust, Dust, Sparks)
    this.particlePool = new ParticlePool(120);
    this.root.add(this.particlePool.root);

    // 6. Environment Controller (Lighting, rain, weather)
    this.environmentController = new EnvironmentController(scene, hemiLight, dirLight);
    this.environmentController.setTimeOfDay('day');
  }

  private populateBuildings(): void {
    // ------------------------------------------------------------------
    // A. Main Road (S1: x: 0 to 100, z: 0) North Side (z = -16)
    // ------------------------------------------------------------------
    // Commercial Block: Janata Pharmacy & Surgery
    const bldg1 = createCommercialBlock(
      22,
      18,
      16,
      'জনতা ফার্মেসি ও সার্জিক্যাল',
      'Janata Pharmacy · 24/7 Prescription',
      '#15803d'
    );
    bldg1.position.set(20, 0, -18);
    this.root.add(bldg1);
    this.colliders.push(bldg1);

    // Dhaka Apartment: 5 Floors (Pistachio Green)
    const bldg2 = createDhakaApartment(5, 20, 18, 1);
    bldg2.position.set(45, 0, -18);
    this.root.add(bldg2);
    this.colliders.push(bldg2);

    // Commercial Block: Dhanmondi Cafe & Restaurant
    const bldg3 = createCommercialBlock(
      20,
      16,
      16,
      'ধানমন্ডি ক্যাফে ও মিষ্টি মুখ',
      'Dhanmondi Cafe · কাচ্চি ও মিষ্টি',
      '#b91c1c'
    );
    bldg3.position.set(70, 0, -18);
    this.root.add(bldg3);
    this.colliders.push(bldg3);

    // High Billboard above commercial block
    const billboard = createDhakaBillboard(
      'উধাও — ঢাকা শহরের নির্ভরযোগ্য রাইড',
      'Download Uthao App Today · ৳৫০ Promo',
      '#0284c7'
    );
    billboard.position.set(45, 0, -28);
    this.root.add(billboard);

    // ------------------------------------------------------------------
    // B. Fuel Station at N2 (x: 100, z: 0)
    // ------------------------------------------------------------------
    const fuelStation = createDhakaFuelStation();
    fuelStation.position.set(100, 0, -15);
    this.root.add(fuelStation);
    this.colliders.push(fuelStation);

    // ------------------------------------------------------------------
    // C. Tea Stall (Tong Dokan) at N1 (x: 8, z: 8)
    // ------------------------------------------------------------------
    const teaStall = createTeaStallMesh();
    teaStall.position.set(8, 0, 7.5);
    teaStall.rotation.y = Math.PI;
    this.root.add(teaStall);
    this.colliders.push(teaStall);

    // ------------------------------------------------------------------
    // D. Kamal Bhai's Garage Workshop at N4 (x: 0, z: 100)
    // ------------------------------------------------------------------
    const garage = createKamalGarageWorkshop();
    garage.position.set(18, 0, 95);
    garage.rotation.y = -Math.PI / 2;
    this.root.add(garage);
    this.colliders.push(garage);

    // ------------------------------------------------------------------
    // E. Neighborhood Mosque Landmark (x: 85, z: 75)
    // ------------------------------------------------------------------
    const mosque = createDhakaMosque();
    mosque.position.set(85, 0, 75);
    this.root.add(mosque);
    this.colliders.push(mosque);

    // ------------------------------------------------------------------
    // F. Construction Site (Unfinished building) at (x: 35, z: 75)
    // ------------------------------------------------------------------
    const construction = createConstructionSite();
    construction.position.set(35, 0, 75);
    this.root.add(construction);
    this.colliders.push(construction);

    // ------------------------------------------------------------------
    // G. Roadside Neem & Banyan Trees along sidewalks
    // ------------------------------------------------------------------
    const treePositions = [
      { x: 5, z: -8 },
      { x: 33, z: -8 },
      { x: 58, z: -8 },
      { x: 82, z: -8 },
      { x: 25, z: 8 },
      { x: 55, z: 8 },
      { x: 85, z: 8 },
      { x: 92, z: 45 },
      { x: 92, z: 70 },
      { x: 8, z: 40 },
      { x: 8, z: 70 },
    ];

    for (const pos of treePositions) {
      const tree = createDhakaTree();
      tree.position.set(pos.x, 0, pos.z);
      this.root.add(tree);
      this.colliders.push(tree);
    }

    // ------------------------------------------------------------------
    // H. Residential Apartments along S4 (z = 100) and S2 (x = 100)
    // ------------------------------------------------------------------
    const apt1 = createDhakaApartment(4, 18, 16, 2);
    apt1.position.set(120, 0, 30);
    this.root.add(apt1);
    this.colliders.push(apt1);

    const apt2 = createDhakaApartment(6, 22, 18, 3);
    apt2.position.set(120, 0, 70);
    this.root.add(apt2);
    this.colliders.push(apt2);

    const apt3 = createDhakaApartment(4, 18, 16, 4);
    apt3.position.set(50, 0, 118);
    this.root.add(apt3);
    this.colliders.push(apt3);
  }

  /**
   * Propagates player horn to traffic and pedestrians.
   */
  public onPlayerHorn(playerPos: { x: number; z: number }): { responded: boolean; type?: string } {
    const pedReacted = this.pedestrianManager.onPlayerHorn(playerPos);
    const trafficReacted = this.trafficManager.onPlayerHorn(playerPos);
    return {
      responded: pedReacted || trafficReacted.responded,
      type: trafficReacted.type,
    };
  }

  update(dt: number, playerPos: { x: number; z: number }): { collisionWithTraffic: boolean } {
    // 1. Update Traffic AI & collision detection
    const trafficResult = this.trafficManager.update(dt, playerPos);

    // 2. Update Pedestrians AI & reactive avoidance
    this.pedestrianManager.update(dt, playerPos);

    // 3. Update Pooled Particles
    this.particlePool.update(dt);

    // 4. Update Weather & lighting
    this.environmentController.update(dt, playerPos);

    // Spawn collision sparks if hit
    if (trafficResult.collision) {
      for (let i = 0; i < 8; i++) {
        const vx = (Math.random() - 0.5) * 6;
        const vy = Math.random() * 3 + 1;
        const vz = (Math.random() - 0.5) * 6;
        this.particlePool.spawn(playerPos.x, 0.6, playerPos.z, vx, vy, vz, 'spark', 0.5);
      }
    }

    return {
      collisionWithTraffic: trafficResult.collision,
    };
  }

  setTimeOfDay(time: TimeOfDay): void {
    this.environmentController.setTimeOfDay(time);
  }

  setWeather(weather: WeatherType): void {
    this.environmentController.setWeather(weather);
    this.roadMesh.setWetness(weather === 'rain');
  }
}
