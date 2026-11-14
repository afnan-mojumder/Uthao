import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { MotorcycleMesh } from './vehicles';
import { RideMarkers } from './props';
import {
  AdaptiveQualityManager,
  getQualityConfig,
  type QualityLevel,
} from './quality';
import type { SimSnapshot } from '../sim/GameManager';
import { lerp, angleDiff } from '../core/math';
import { WeatherFx } from './WeatherFx';
import type { DistrictId } from '../core/types';
import type { DistrictData, WorldData } from '../sim/schemas';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { CityBuilder } from './CityBuilder';
import { PeopleRenderer } from './people';
import { TimeOfDay } from '../sim/world/TimeOfDay';
import type { PedestrianAgent } from '../sim/traffic/pedestrians';
import type { TrafficAgent } from '../sim/traffic/TrafficManager';

export class Renderer {
  readonly webglRenderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly cameraRig: CameraRig;
  readonly bikeMesh: MotorcycleMesh;
  readonly markers: RideMarkers;
  readonly qualityManager: AdaptiveQualityManager;
  readonly dirLight: THREE.DirectionalLight;
  readonly hemiLight: THREE.HemisphereLight;
  readonly weatherFx: WeatherFx;
  readonly peopleRenderer: PeopleRenderer;
  cityBuilder?: CityBuilder;

  private canvas: HTMLCanvasElement;
  /** Camera anti-clip targets. After a load this IS cityBuilder.colliders, the
   * live list streaming pushes to and splices from (H-7). */
  private colliders: THREE.Object3D[] = [];
  /** H-6: one ground plane in every mode, kept under the bike out to draw distance. */
  private ground: THREE.Mesh;
  private skyDome: THREE.Mesh;
  private skyUniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
  };
  private testSceneGroup?: THREE.Group;
  private prevBikePose = { x: 0, y: 0, z: 0, heading: 0, lean: 0, steer: 0 };
  private currBikePose = { x: 0, y: 0, z: 0, heading: 0, lean: 0, steer: 0 };
  private bikeSpeed = 0;
  private readonly _bikePos = new THREE.Vector3();
  private readonly _bikeGroundPos = { x: 0, y: 0, z: 0 };
  private readonly _camPos = { x: 0, z: 0 };

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
    this.webglRenderer.toneMapping = THREE.AgXToneMapping;
    this.webglRenderer.toneMappingExposure = 1.05;
    this.webglRenderer.outputColorSpace = THREE.SRGBColorSpace;

    this.applyQuality();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Dhaka sky
    this.scene.fog = new THREE.Fog(
      0x87ceeb,
      50,
      this.qualityManager.config.drawDistance
    );

    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(0x3b82f6) },
      uHorizonColor: { value: new THREE.Color(0xbae6fd) },
    };
    this.skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(120, this.qualityManager.config.drawDistance * 0.92), 16, 12),
      new THREE.ShaderMaterial({
        uniforms: this.skyUniforms,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        vertexShader: `
          varying vec3 vWorldPos;
          void main() {
            vWorldPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 uTopColor;
          uniform vec3 uHorizonColor;
          varying vec3 vWorldPos;
          void main() {
            float h = clamp(normalize(vWorldPos).y, 0.0, 1.0);
            vec3 col = mix(uHorizonColor, uTopColor, pow(h, 0.55));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      })
    );
    this.skyDome.name = 'sky_dome';
    this.scene.add(this.skyDome);

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

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x4a4a42, roughness: 0.95 })
    );
    this.ground.name = 'ground_plane';
    this.ground.position.y = -0.01;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);

    this.buildTestScene();

    this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
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

    this.weatherFx = new WeatherFx(this.scene, {
      dirLight: this.dirLight,
      hemiLight: this.hemiLight,
      drawDistance: this.qualityManager.config.drawDistance,
      rainCount: this.qualityManager.config.rainParticles,
    });

    this.peopleRenderer = new PeopleRenderer();
    this.scene.add(this.peopleRenderer.root);

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
      this.webglRenderer.shadowMap.type = THREE.PCFShadowMap;
    }
  }

  /** Applies a quality level chosen in Settings to the running renderer. */
  setQuality(level: QualityLevel): void {
    const dpr = window.devicePixelRatio || 1;
    this.qualityManager.config = getQualityConfig(level, dpr);
    const cfg = this.qualityManager.config;
    this.applyQuality();
    this.dirLight.castShadow = cfg.shadows;
    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog) fog.far = cfg.drawDistance;
    this.cameraRig.camera.far = cfg.drawDistance;
    this.cameraRig.camera.updateProjectionMatrix();
  }

  resize(): void {
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;
    this.webglRenderer.setSize(width, height, false);
    this.cameraRig.camera.aspect = width / (height || 1);
    this.cameraRig.camera.updateProjectionMatrix();
  }

  private buildTestScene(): void {
    this.testSceneGroup = new THREE.Group();
    this.testSceneGroup.name = 'test_scene_group';

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
      this.testSceneGroup?.add(mesh);
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
      this.testSceneGroup?.add(kerb);
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
      this.testSceneGroup?.add(mesh);
      this.colliders.push(mesh);
    };

    // A few buildings on the sides
    createBuilding(16, 20, 20, -18, 20);
    createBuilding(20, 30, 24, -20, 50);
    createBuilding(18, 16, 20, -18, 80);

    createBuilding(16, 24, 20, 118, 20);
    createBuilding(22, 28, 25, 120, 60);

    this.scene.add(this.testSceneGroup);
  }

  loadDistrict(district: DistrictData, physicsWorld?: PhysicsWorld): void {
    if (this.testSceneGroup) {
      this.scene.remove(this.testSceneGroup);
      this.testSceneGroup = undefined;
    }
    if (this.cityBuilder) {
      this.scene.remove(this.cityBuilder.root);
    }
    this.cityBuilder = new CityBuilder();
    this.cityBuilder.buildDistrict(district, physicsWorld);
    this.scene.add(this.cityBuilder.root);
    this.colliders = this.cityBuilder.colliders;
  }

  loadWorld(
    world: WorldData,
    districtProvider: (id: DistrictId) => DistrictData | undefined,
    physicsWorld?: PhysicsWorld,
    initialPos: { x: number; z: number } = { x: 300, z: 300 }
  ): void {
    if (this.testSceneGroup) {
      this.scene.remove(this.testSceneGroup);
      this.testSceneGroup = undefined;
    }
    if (this.cityBuilder) {
      this.scene.remove(this.cityBuilder.root);
    }
    this.cityBuilder = new CityBuilder();
    this.cityBuilder.initWorldStreaming(world, districtProvider, physicsWorld, initialPos);
    this.scene.add(this.cityBuilder.root);
    this.colliders = this.cityBuilder.colliders;
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

    const groundSize = 2 * this.qualityManager.config.drawDistance + 20;
    this.ground.position.set(x, -0.01, z);
    this.ground.scale.set(groundSize, 1, groundSize);

    // Update ride markers animation
    this.markers.update(1 / 60);

    // Update Camera Rig
    this._bikePos.set(x, 0, z);
    this.cameraRig.update(this._bikePos, heading, this.bikeSpeed, this.colliders, 1 / 60, lean);

    // Update Weather and Lighting FX
    this._bikeGroundPos.x = x;
    this._bikeGroundPos.z = z;
    this.weatherFx.update(
      1 / 60,
      snapshot.clock.minutes,
      snapshot.weather,
      this._bikeGroundPos,
      heading,
      false
    );

    // Update sky dome gradient & position
    this.skyDome.position.set(x, 0, z);
    if (this.scene.background instanceof THREE.Color) {
      this.skyUniforms.uTopColor.value.copy(this.scene.background);
      if (this.scene.fog instanceof THREE.Fog) {
        this.skyUniforms.uHorizonColor.value.copy(this.scene.fog.color);
      } else {
        this.skyUniforms.uHorizonColor.value.copy(this.scene.background);
      }
    }

    // Update CityBuilder LOD chunks, streaming, monsoon road wetness & night windows
    if (this.cityBuilder) {
      const wet01 =
        snapshot.weather === 'heavyRain' ? 1.0 : snapshot.weather === 'lightRain' ? 0.65 : 0.0;
      this.cityBuilder.roadBuilder.setWetness(wet01);
      const nightGlow = TimeOfDay.isStreetlightsActive(snapshot.clock.minutes) ? 1.0 : 0.0;
      this.cityBuilder.buildingBuilder.setNightGlow(nightGlow);
      this._camPos.x = x;
      this._camPos.z = z;
      this.cityBuilder.update(this._camPos, this.qualityManager.config.drawDistance, 4);
    }

    this.webglRenderer.render(this.scene, this.cameraRig.camera);
  }

  setPassengerVisible(visible: boolean): void {
    this.bikeMesh.setPassengerVisible(visible);
  }

  updatePeople(
    pedestrians: PedestrianAgent[],
    trafficAgents: TrafficAgent[],
    timeSec = 0
  ): void {
    const camPos = { x: this.currBikePose.x, z: this.currBikePose.z };
    this.peopleRenderer.update(
      pedestrians,
      trafficAgents,
      timeSec,
      camPos,
      this.qualityManager.config.drawDistance
    );
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

  /** T7.3: debug/e2e check that CameraRig's anti-clip raycast pull-in is
   * actually keeping the camera out of every collider, not just close to it. */
  isCameraClipping(): boolean {
    // Test in each collider's own frame: a world AABB of a rotated building is
    // bigger than the building and would report clipping that is not there.
    const local = new THREE.Vector3();
    for (const collider of this.colliders) {
      if (!(collider instanceof THREE.Mesh)) continue;
      const geo = collider.geometry as THREE.BufferGeometry;
      if (!geo.boundingBox) geo.computeBoundingBox();
      collider.updateWorldMatrix(true, false);
      local.copy(this.cameraRig.camera.position).applyMatrix4(collider.matrixWorld.clone().invert());
      if (geo.boundingBox!.containsPoint(local)) return true;
    }
    return false;
  }
}
