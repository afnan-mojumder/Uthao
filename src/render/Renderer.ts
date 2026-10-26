import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { MotorcycleMesh } from './vehicles';
import { RideMarkers } from './props';
import {
  AdaptiveQualityManager,
  type QualityLevel,
} from './quality';
import type { SimSnapshot } from '../sim/GameManager';
import { lerp, angleDiff } from '../core/math';
import type { RoadNetwork } from '../sim/road/RoadNetwork';
import { DhakaWorld } from './world/DhakaWorld';
import type { TimeOfDay, WeatherType } from './world/EnvironmentController';

export class Renderer {
  readonly webglRenderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly cameraRig: CameraRig;
  readonly bikeMesh: MotorcycleMesh;
  readonly markers: RideMarkers;
  readonly qualityManager: AdaptiveQualityManager;
  readonly world?: DhakaWorld;

  private canvas: HTMLCanvasElement;
  private colliders: THREE.Object3D[] = [];
  private prevBikePose = { x: 0, y: 0, z: 0, heading: 0, lean: 0, steer: 0 };
  private currBikePose = { x: 0, y: 0, z: 0, heading: 0, lean: 0, steer: 0 };
  private bikeSpeed = 0;
  private lastRenderTime: number = performance.now();
  private hemiLight: THREE.HemisphereLight;
  private dirLight: THREE.DirectionalLight;

  onTrafficCollision?: (trafficType: string) => void;

  private constructor(
    canvas: HTMLCanvasElement,
    qualityLevel: QualityLevel = 'medium',
    roadNetwork?: RoadNetwork
  ) {
    this.canvas = canvas;
    this.qualityManager = new AdaptiveQualityManager(
      qualityLevel,
      window.devicePixelRatio || 1
    );

    this.webglRenderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });

    this.applyQuality();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Dhaka daytime sky
    this.scene.fog = new THREE.Fog(
      0x87ceeb,
      50,
      this.qualityManager.config.drawDistance
    );

    const aspect = canvas.clientWidth / (canvas.clientHeight || 1);
    this.cameraRig = new CameraRig(
      60,
      aspect,
      0.1,
      this.qualityManager.config.drawDistance
    );

    this.bikeMesh = new MotorcycleMesh();
    this.scene.add(this.bikeMesh.root);

    this.markers = new RideMarkers();
    this.scene.add(this.markers.root);

    // Setup Lighting
    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.85);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    this.dirLight.position.set(50, 80, 50);
    this.dirLight.castShadow = this.qualityManager.config.shadows;
    if (this.dirLight.castShadow) {
      this.dirLight.shadow.mapSize.width = 1024;
      this.dirLight.shadow.mapSize.height = 1024;
      this.dirLight.shadow.camera.near = 0.5;
      this.dirLight.shadow.camera.far = 250;
      const d = 50;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
    }
    this.scene.add(this.dirLight);

    // Build World: If RoadNetwork is provided, assemble rich Dhaka world
    if (roadNetwork) {
      // Ground plane
      const groundGeo = new THREE.PlaneGeometry(800, 800);
      const groundMat = new THREE.MeshStandardMaterial({
        color: 0x1f2937, // Dhaka urban soil/asphalt ground
        roughness: 0.95,
      });
      const ground = new THREE.Mesh(groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this.scene.add(ground);

      this.world = new DhakaWorld(roadNetwork, this.scene, this.hemiLight, this.dirLight);
      this.scene.add(this.world.root);
      this.colliders.push(...this.world.colliders);
    } else {
      this.buildTestScene();
    }

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  static init(
    canvas: HTMLCanvasElement,
    qualityLevel: QualityLevel = 'medium',
    roadNetwork?: RoadNetwork
  ): Renderer {
    return new Renderer(canvas, qualityLevel, roadNetwork);
  }

  private applyQuality(): void {
    const cfg = this.qualityManager.config;
    this.webglRenderer.setPixelRatio(cfg.pixelRatio * cfg.resolutionScale);
    this.webglRenderer.shadowMap.enabled = cfg.shadows;
    if (cfg.shadows) {
      this.webglRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
  }

  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.webglRenderer.setSize(width, height, false);
    this.cameraRig.camera.aspect = width / (height || 1);
    this.cameraRig.camera.updateProjectionMatrix();
  }

  private buildTestScene(): void {
    const groundGeo = new THREE.PlaneGeometry(600, 600);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  setBikeState(state: {
    x: number;
    z: number;
    heading: number;
    speed: number;
    lean: number;
    steer: number;
  }): void {
    this.prevBikePose = { ...this.currBikePose };
    this.currBikePose = {
      x: state.x,
      y: 0,
      z: state.z,
      heading: state.heading,
      lean: state.lean,
      steer: state.steer,
    };
    this.bikeSpeed = state.speed;
  }

  render(snapshot: SimSnapshot, alpha = 1.0): void {
    void snapshot;
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastRenderTime) / 1000);
    this.lastRenderTime = now;

    this.qualityManager.recordFrame(now);

    // Interpolate bike pose
    const x = lerp(this.prevBikePose.x, this.currBikePose.x, alpha);
    const z = lerp(this.prevBikePose.z, this.currBikePose.z, alpha);
    const diff = angleDiff(this.prevBikePose.heading, this.currBikePose.heading);
    const heading = this.prevBikePose.heading + diff * alpha;
    const lean = lerp(this.prevBikePose.lean, this.currBikePose.lean, alpha);
    const steer = lerp(this.prevBikePose.steer, this.currBikePose.steer, alpha);

    this.bikeMesh.setPose({ x, y: 0, z, heading, lean, steer });

    // Update ride markers animation
    this.markers.update(dt);

    // Update Living Dhaka World (Traffic, Pedestrians, Weather)
    if (this.world) {
      const worldResult = this.world.update(dt, { x, z });
      if (worldResult.collisionWithTraffic && this.onTrafficCollision) {
        this.onTrafficCollision('traffic_vehicle');
      }
    }

    // Update Camera Rig
    const bikePos = new THREE.Vector3(x, 0, z);
    this.cameraRig.update(bikePos, heading, this.bikeSpeed, this.colliders);

    this.webglRenderer.render(this.scene, this.cameraRig.camera);
  }

  setTimeOfDay(time: TimeOfDay): void {
    this.world?.setTimeOfDay(time);
  }

  setWeather(weather: WeatherType): void {
    this.world?.setWeather(weather);
  }

  setPassengerVisible(visible: boolean): void {
    this.bikeMesh.setPassengerVisible(visible);
  }

  getFps(): number {
    return Math.round(this.qualityManager.getAverageFps());
  }

  getDrawCalls(): number {
    return this.webglRenderer.info.render.calls;
  }

  getTriangles(): number {
    return this.webglRenderer.info.render.triangles;
  }
}
