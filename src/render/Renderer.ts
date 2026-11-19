import * as THREE from 'three';
import { CameraRig } from './CameraRig';
import { MotorcycleMesh, type BikeCosmetics } from './vehicles';
import { RideMarkers } from './props';
import {
  AdaptiveQualityManager,
  getQualityConfig,
  type QualityConfig,
  type QualityLevel,
} from './quality';
import type { SimSnapshot } from '../sim/GameManager';
import { lerp, angleDiff } from '../core/math';
import { WeatherFx } from './WeatherFx';
import type { WeatherSystem } from '../sim/world/WeatherSystem';
import type { RoadNetwork } from '../sim/road/RoadNetwork';
import type { BikeId, DistrictId, RoadNode, RoadSegment } from '../core/types';
import type { DistrictData, WorldData } from '../sim/schemas';
import type { PhysicsWorld } from '../physics/PhysicsWorld';
import { CityBuilder } from './CityBuilder';
import { PeopleRenderer } from './people';
import { TimeOfDay } from '../sim/world/TimeOfDay';
import { assetManager } from './assets';
import type { PedestrianAgent } from '../sim/traffic/pedestrians';
import type { TrafficAgent } from '../sim/traffic/TrafficManager';
import type { SignalController } from '../sim/traffic/signals';

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
  private readonly skyDomeBaseRadius: number;
  private skyUniforms: {
    uTopColor: { value: THREE.Color };
    uHorizonColor: { value: THREE.Color };
  };
  private shadowsInitialized = false;
  private configuredShadowMapSize = 0;
  private lastFloodVersion = -1;
  private readonly _floodedSegmentsScratch: RoadSegment[] = [];
  private testSceneGroup?: THREE.Group;
  private prevBikePose = { x: 0, y: 0, z: 0, heading: 0, lean: 0, steer: 0 };
  private currBikePose = { x: 0, y: 0, z: 0, heading: 0, lean: 0, steer: 0 };
  private readonly _renderBikePose = { x: 0, y: 0, z: 0, heading: 0, lean: 0, steer: 0 };
  private bikeSpeed = 0;
  private lastRenderMs = 0;
  private lastSyncedBikeId: BikeId = 'old100';
  private lastSyncedPaint: string | undefined = undefined;
  private lastSyncedSeatCover: string | undefined = undefined;
  private readonly _bikePos = new THREE.Vector3();
  private readonly _bikeGroundPos = { x: 0, y: 0, z: 0 };
  private readonly _camPos = { x: 0, z: 0 };
  private readonly _peopleCamPos = { x: 0, z: 0 };

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
    void assetManager.init(this.webglRenderer);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Dhaka sky
    this.scene.fog = new THREE.Fog(
      0x87ceeb,
      50,
      this.qualityManager.config.drawDistance
    );

    this.skyUniforms = {
      uTopColor: { value: new THREE.Color(0x2563eb) },
      uHorizonColor: { value: new THREE.Color(0xc7e8fb) },
    };
    this.skyDomeBaseRadius = Math.max(120, this.qualityManager.config.drawDistance * 0.92);
    this.skyDome = new THREE.Mesh(
      new THREE.SphereGeometry(this.skyDomeBaseRadius, 16, 12),
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

    this.hemiLight = new THREE.HemisphereLight(0xe8f4ff, 0x7a7062, 1.0);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    this.dirLight = new THREE.DirectionalLight(0xfff8e7, 1.75);
    this.dirLight.position.set(50, 150, 35);
    this.scene.add(this.dirLight);
    this.scene.add(this.dirLight.target);
    this.configureShadows(this.qualityManager.config);

    this.weatherFx = new WeatherFx(this.scene, {
      dirLight: this.dirLight,
      hemiLight: this.hemiLight,
      drawDistance: this.qualityManager.config.drawDistance,
      rainCount: this.qualityManager.config.rainParticles,
      maxPointLights: this.qualityManager.config.maxStreetlights,
      wind: { x: 2.5, z: 1.2 },
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

  /** Initializes GLTF/Meshopt asset loading and preloads core Kenney GLB prototypes. */
  async preloadAssets(onProgress?: (pct: number) => void): Promise<void> {
    await assetManager.init(this.webglRenderer);
    await assetManager.preloadCore(onProgress);
    this.peopleRenderer.refreshPrototypes();
  }

  setBikeVariant(variant: BikeId): void {
    this.lastSyncedBikeId = variant;
    this.bikeMesh.setVariant(variant);
  }

  setBikeCosmetics(cosmetics: BikeCosmetics): void {
    this.lastSyncedPaint = cosmetics.paint;
    this.lastSyncedSeatCover = cosmetics.seatCover;
    this.bikeMesh.setCosmetics(cosmetics);
  }

  setBrakeLight(braking: boolean): void {
    this.bikeMesh.setBraking(braking);
  }

  /** Syncs 3D traffic signal pole lenses to the live SignalController (zero allocations). */
  updateTrafficSignals(signals: SignalController): void {
    this.cityBuilder?.updateTrafficSignals(signals);
  }

  private applyQuality(): void {
    const cfg = this.qualityManager.config;
    this.webglRenderer.setPixelRatio(cfg.pixelRatio * cfg.resolutionScale);
    this.webglRenderer.shadowMap.enabled = cfg.shadows;
    if (cfg.shadows) {
      this.webglRenderer.shadowMap.type = THREE.PCFShadowMap;
    }
  }

  private configureShadows(cfg: QualityConfig): void {
    this.dirLight.castShadow = cfg.shadows;
    if (!cfg.shadows) return;

    const targetMapSize = cfg.shadowMapSize || 1024;
    if (!this.shadowsInitialized || this.configuredShadowMapSize !== targetMapSize) {
      if (this.dirLight.shadow.map) {
        this.dirLight.shadow.map.dispose();
        this.dirLight.shadow.map = null;
      }
      this.dirLight.shadow.mapSize.width = targetMapSize;
      this.dirLight.shadow.mapSize.height = targetMapSize;
      this.dirLight.shadow.camera.near = 0.5;
      this.dirLight.shadow.camera.far = 350;
      const d = 55;
      this.dirLight.shadow.camera.left = -d;
      this.dirLight.shadow.camera.right = d;
      this.dirLight.shadow.camera.top = d;
      this.dirLight.shadow.camera.bottom = -d;
      this.dirLight.shadow.bias = -0.0005;
      this.dirLight.shadow.normalBias = 0.02;
      this.dirLight.shadow.camera.updateProjectionMatrix();
      this.shadowsInitialized = true;
      this.configuredShadowMapSize = targetMapSize;
    }
  }

  /** Applies a quality level chosen in Settings to the running renderer. */
  setQuality(level: QualityLevel): void {
    const dpr = window.devicePixelRatio || 1;
    this.qualityManager.config = getQualityConfig(level, dpr);
    const cfg = this.qualityManager.config;
    this.applyQuality();
    void assetManager.init(this.webglRenderer);
    this.configureShadows(cfg);
    this.weatherFx.setMaxPointLights(cfg.maxStreetlights);
    const fog = this.scene.fog;
    if (fog instanceof THREE.Fog) fog.far = cfg.drawDistance;
    this.cameraRig.camera.far = cfg.drawDistance;
    this.cameraRig.camera.updateProjectionMatrix();
    const targetRadius = Math.max(120, cfg.drawDistance * 0.92);
    this.skyDome.scale.setScalar(targetRadius / this.skyDomeBaseRadius);
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

    const nodeMap = new Map<string, RoadNode>();
    for (const node of district.nodes) {
      nodeMap.set(node.nodeId, node);
    }
    this.weatherFx.populateStreetlights(district.segments, nodeMap);
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

    const nodeMap = new Map<string, RoadNode>();
    const districtSegments: RoadSegment[] = [];
    for (const dRef of world.districts) {
      const dist = districtProvider(dRef.districtId as DistrictId);
      if (!dist) continue;
      for (const node of dist.nodes) nodeMap.set(node.nodeId, node);
      districtSegments.push(...dist.segments);
    }
    const allSegments = world.connectors
      ? [...districtSegments, ...world.connectors]
      : districtSegments;
    this.weatherFx.populateStreetlights(districtSegments, nodeMap, allSegments);
  }

  /** Syncs flooded road segment water overlays when WeatherSystem flood state changes. */
  syncFloodedSegments(weatherSystem: WeatherSystem, roadNetwork: RoadNetwork): void {
    if (weatherSystem.floodVersion === this.lastFloodVersion) return;
    this.lastFloodVersion = weatherSystem.floodVersion;
    const flooded = weatherSystem.getFloodedSegments(
      roadNetwork.getAllSegments(),
      this._floodedSegmentsScratch
    );
    this.weatherFx.updateFloodedSegments(flooded, roadNetwork.getNodesMap());
  }

  setBikeState(state: {
    x: number;
    y?: number;
    z: number;
    heading: number;
    speed: number;
    lean: number;
    steer: number;
    braking?: boolean;
  }): void {
    this.prevBikePose.x = this.currBikePose.x;
    this.prevBikePose.y = this.currBikePose.y;
    this.prevBikePose.z = this.currBikePose.z;
    this.prevBikePose.heading = this.currBikePose.heading;
    this.prevBikePose.lean = this.currBikePose.lean;
    this.prevBikePose.steer = this.currBikePose.steer;

    this.currBikePose.x = state.x;
    this.currBikePose.y = state.y ?? 0;
    this.currBikePose.z = state.z;
    this.currBikePose.heading = state.heading;
    this.currBikePose.lean = state.lean;
    this.currBikePose.steer = state.steer;
    this.bikeSpeed = state.speed;
    if (state.braking !== undefined) {
      this.bikeMesh.setBraking(state.braking);
    }
  }

  render(snapshot: SimSnapshot, alpha = 1.0, signals?: SignalController): void {
    const now = performance.now();
    const frameDt =
      this.lastRenderMs > 0
        ? Math.min(0.1, Math.max(0, (now - this.lastRenderMs) / 1000))
        : 1 / 60;
    this.lastRenderMs = now;
    this.qualityManager.recordFrame(now);

    // Sync active bike variant and cosmetics from snapshot economy state (zero alloc)
    const econ = snapshot.economy;
    if (econ) {
      const bikeId = econ.currentBikeId ?? 'old100';
      if (bikeId !== this.lastSyncedBikeId) {
        this.setBikeVariant(bikeId);
      }
      const paint = econ.installedCosmetics?.paint;
      const seatCover = econ.installedCosmetics?.seatCover;
      if (paint !== this.lastSyncedPaint || seatCover !== this.lastSyncedSeatCover) {
        this.setBikeCosmetics(econ.installedCosmetics ?? {});
      }
    }

    // Interpolate bike pose (including Mohakhali flyover y elevation)
    const x = lerp(this.prevBikePose.x, this.currBikePose.x, alpha);
    const y = lerp(this.prevBikePose.y, this.currBikePose.y, alpha);
    const z = lerp(this.prevBikePose.z, this.currBikePose.z, alpha);
    const diff = angleDiff(this.prevBikePose.heading, this.currBikePose.heading);
    const heading = this.prevBikePose.heading + diff * alpha;
    const lean = lerp(this.prevBikePose.lean, this.currBikePose.lean, alpha);
    const steer = lerp(this.prevBikePose.steer, this.currBikePose.steer, alpha);

    this._renderBikePose.x = x;
    this._renderBikePose.y = y;
    this._renderBikePose.z = z;
    this._renderBikePose.heading = heading;
    this._renderBikePose.lean = lean;
    this._renderBikePose.steer = steer;
    this.bikeMesh.setPose(this._renderBikePose);
    this.bikeMesh.update(frameDt > 0 ? frameDt : 1 / 60, this.bikeSpeed);

    const groundSize = 2 * this.qualityManager.config.drawDistance + 20;
    this.ground.position.set(x, -0.01, z);
    this.ground.scale.set(groundSize, 1, groundSize);

    // Update ride markers animation
    this.markers.update(1 / 60);

    // Update Camera Rig
    this._bikePos.set(x, y, z);
    this.cameraRig.update(this._bikePos, heading, this.bikeSpeed, this.colliders, 1 / 60, lean);

    // Update Weather and Lighting FX
    this._bikeGroundPos.x = x;
    this._bikeGroundPos.y = y;
    this._bikeGroundPos.z = z;
    const hasLedUpgrade = Boolean(
      snapshot.economy?.ownedUpgrades?.includes('upgrade_led_headlight')
    );
    this.weatherFx.update(
      frameDt > 0 ? frameDt : 1 / 60,
      snapshot.clock.minutes,
      snapshot.weather,
      this._bikeGroundPos,
      heading,
      hasLedUpgrade,
      this.bikeSpeed
    );

    // Update sky dome gradient & position centered on camera so it never clips (zero allocations)
    this.skyDome.position.copy(this.cameraRig.camera.position);
    this.skyUniforms.uTopColor.value.copy(this.weatherFx.getSkyTopColor());
    this.skyUniforms.uHorizonColor.value.copy(this.weatherFx.getSkyHorizonColor());

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
      if (signals) {
        this.cityBuilder.updateTrafficSignals(signals);
      }
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
    this._peopleCamPos.x = this.currBikePose.x;
    this._peopleCamPos.z = this.currBikePose.z;
    this.peopleRenderer.update(
      pedestrians,
      trafficAgents,
      timeSec,
      this._peopleCamPos,
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
