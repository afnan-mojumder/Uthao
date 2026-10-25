import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { MotorcycleMesh } from './vehicles';
import {
  AdaptiveQualityManager,
  type QualityLevel,
} from './quality';
import type { SimSnapshot } from '../sim/GameManager';
import { lerp, angleDiff } from '../core/math';

export class Renderer {
  readonly webglRenderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly cameraRig: CameraRig;
  readonly bikeMesh: MotorcycleMesh;
  readonly qualityManager: AdaptiveQualityManager;

  private canvas: HTMLCanvasElement;
  private colliders: THREE.Object3D[] = [];
  private prevBikePose = { x: 0, y: 0, z: 0, heading: 0, lean: 0, steer: 0 };
  private currBikePose = { x: 0, y: 0, z: 0, heading: 0, lean: 0, steer: 0 };
  private bikeSpeed = 0;

  private constructor(
    canvas: HTMLCanvasElement,
    qualityLevel: QualityLevel = 'medium'
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
    this.scene.background = new THREE.Color(0x87ceeb); // Dhaka sky
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

    this.buildTestScene();
    this.setupLighting();

    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  static init(
    canvas: HTMLCanvasElement,
    qualityLevel: QualityLevel = 'medium'
  ): Renderer {
    return new Renderer(canvas, qualityLevel);
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

  private setupLighting(): void {
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    hemiLight.position.set(0, 50, 0);
    this.scene.add(hemiLight);

    const dirLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    dirLight.position.set(50, 80, 50);
    dirLight.castShadow = this.qualityManager.config.shadows;
    if (dirLight.castShadow) {
      dirLight.shadow.mapSize.width = 1024;
      dirLight.shadow.mapSize.height = 1024;
      dirLight.shadow.camera.near = 0.5;
      dirLight.shadow.camera.far = 250;
      const d = 50;
      dirLight.shadow.camera.left = -d;
      dirLight.shadow.camera.right = d;
      dirLight.shadow.camera.top = d;
      dirLight.shadow.camera.bottom = -d;
    }
    this.scene.add(dirLight);
  }

  private buildTestScene(): void {
    // Ground plane
    const groundGeo = new THREE.PlaneGeometry(600, 600);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // 400 m loop road (100m x 100m square loop with rounded corners)
    // Road ribbon
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x181818,
      roughness: 0.7,
    });
    const roadWidth = 10;
    const loopSize = 100;

    const createRoadSegment = (
      w: number,
      l: number,
      x: number,
      z: number,
      rotY: number
    ) => {
      const geo = new THREE.PlaneGeometry(w, l);
      const mesh = new THREE.Mesh(geo, roadMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.rotation.z = rotY;
      mesh.position.set(x, 0.01, z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };

    // 4 sides of the loop
    createRoadSegment(roadWidth, loopSize, 0, loopSize / 2, 0); // East
    createRoadSegment(roadWidth, loopSize, loopSize, loopSize / 2, 0); // West
    createRoadSegment(roadWidth, loopSize, loopSize / 2, 0, Math.PI / 2); // South
    createRoadSegment(roadWidth, loopSize, loopSize / 2, loopSize, Math.PI / 2); // North

    // Kerbs (raised edges)
    const kerbMat = new THREE.MeshStandardMaterial({ color: 0xcccccc });
    const createKerb = (
      l: number,
      x: number,
      z: number,
      rotY: number
    ) => {
      const geo = new THREE.BoxGeometry(0.3, 0.2, l);
      const kerb = new THREE.Mesh(geo, kerbMat);
      kerb.position.set(x, 0.1, z);
      kerb.rotation.y = rotY;
      this.scene.add(kerb);
      this.colliders.push(kerb);
    };

    createKerb(loopSize, -roadWidth / 2, loopSize / 2, 0);
    createKerb(loopSize, roadWidth / 2, loopSize / 2, 0);

    // Box buildings along the roadside
    const bldgMat = new THREE.MeshStandardMaterial({
      color: 0x8b8989,
      roughness: 0.6,
    });
    const bldgColors = [0x998877, 0x667788, 0x889977, 0xaabbcc];

    const createBuilding = (
      w: number,
      h: number,
      d: number,
      x: number,
      z: number
    ) => {
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = bldgMat.clone();
      const col = bldgColors[Math.floor(Math.abs(x + z)) % bldgColors.length];
      mat.color.setHex(col ?? 0x777777);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.colliders.push(mesh);
    };

    // A few buildings on the sides
    createBuilding(16, 20, 20, -18, 20);
    createBuilding(20, 30, 24, -20, 50);
    createBuilding(18, 16, 20, -18, 80);

    createBuilding(16, 24, 20, 118, 20);
    createBuilding(22, 28, 25, 120, 60);
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
    this.qualityManager.recordFrame(now);

    // Interpolate bike pose
    const x = lerp(this.prevBikePose.x, this.currBikePose.x, alpha);
    const z = lerp(this.prevBikePose.z, this.currBikePose.z, alpha);
    const diff = angleDiff(this.prevBikePose.heading, this.currBikePose.heading);
    const heading = this.prevBikePose.heading + diff * alpha;
    const lean = lerp(this.prevBikePose.lean, this.currBikePose.lean, alpha);
    const steer = lerp(this.prevBikePose.steer, this.currBikePose.steer, alpha);

    this.bikeMesh.setPose({ x, y: 0, z, heading, lean, steer });

    // Update Camera Rig
    const bikePos = new THREE.Vector3(x, 0, z);
    this.cameraRig.update(bikePos, heading, this.bikeSpeed, this.colliders);

    this.webglRenderer.render(this.scene, this.cameraRig.camera);
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
