import { describe, it, expect, vi, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import type { DistrictId } from '../../../src/core/types';
import { DistrictSchema, WorldDataSchema, type DistrictData } from '../../../src/sim/schemas';
import type { SimSnapshot } from '../../../src/sim/GameManager';

// Node has no WebGL: stand in a renderer that draws nothing.
vi.mock('three', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three')>();
  class FakeWebGLRenderer {
    shadowMap = { enabled: false, type: 0 };
    info = { render: { calls: 0, triangles: 0 } };
    setPixelRatio(): void {}
    setSize(): void {}
    render(): void {}
    dispose(): void {}
  }
  return { ...actual, WebGLRenderer: FakeWebGLRenderer };
});

const { Renderer } = await import('../../../src/render/Renderer');
const { assetManager } = await import('../../../src/render/assets');
const { SignalController } = await import('../../../src/sim/traffic/signals');

const snapshot = { clock: { minutes: 12 * 60 }, weather: 'clear' } as unknown as SimSnapshot;
const canvas = { clientWidth: 800, clientHeight: 600 } as unknown as HTMLCanvasElement;

beforeAll(() => {
  vi.stubGlobal('window', {
    devicePixelRatio: 1,
    innerWidth: 800,
    innerHeight: 600,
    addEventListener: () => {},
  });
});

function loadWorld() {
  const world = WorldDataSchema.parse(JSON.parse(fs.readFileSync(path.resolve('data/world.json'), 'utf-8')));
  const districts = new Map<DistrictId, DistrictData>();
  for (const d of world.districts) {
    districts.set(d.districtId as DistrictId, DistrictSchema.parse(JSON.parse(fs.readFileSync(path.resolve(d.file), 'utf-8'))));
  }
  return { world, districts };
}

describe('Renderer camera anti-clip uses the real city colliders (H-7)', () => {
  it('world mode: the camera checks every streamed building collider and no test-scene box', () => {
    // Arrange: a renderer in world mode
    const r = Renderer.init(canvas);
    const { world, districts } = loadWorld();
    r.loadWorld(world, (id) => districts.get(id), undefined, { x: 300, z: 300 });
    const spy = vi.spyOn(r.cameraRig, 'update');

    // Act: render enough frames for the time-sliced streaming to finish
    for (let i = 0; i < 400 && r.cityBuilder!.getBuildQueueLength() > 0; i++) r.render(snapshot);
    r.render(snapshot);

    // Assert: the camera got exactly the city's live collider list
    const passed = spy.mock.calls.at(-1)![3] as THREE.Object3D[];
    expect(r.cityBuilder!.colliders.length).toBeGreaterThan(50);
    expect(new Set(passed)).toEqual(new Set(r.cityBuilder!.colliders));
  });
});

describe('Renderer ground plane (H-6)', () => {
  it('world mode: a ground plane sits under the bike wherever it rides', () => {
    // Arrange
    const r = Renderer.init(canvas);
    const { world, districts } = loadWorld();
    r.loadWorld(world, (id) => districts.get(id), undefined, { x: 300, z: 300 });

    // Act: ride far from the origin and render
    r.setBikeState({ x: 1500, z: 900, heading: 0, speed: 0, lean: 0, steer: 0 });
    r.setBikeState({ x: 1500, z: 900, heading: 0, speed: 0, lean: 0, steer: 0 });
    r.render(snapshot);
    r.scene.updateMatrixWorld(true);

    // Assert: a downward ray from above the bike and from the draw-distance edge hits the ground
    const ray = new THREE.Raycaster();
    const reach = r.qualityManager.config.drawDistance - 1;
    for (const [x, z] of [[1500, 900], [1500 + reach, 900], [1500, 900 - reach]] as const) {
      ray.set(new THREE.Vector3(x, 50, z), new THREE.Vector3(0, -1, 0));
      const hit = ray.intersectObjects(r.scene.children, true).find((h) => h.object.name === 'ground_plane');
      expect(hit, `ground under (${x}, ${z})`).toBeDefined();
      expect(hit!.point.y).toBeLessThan(0.02);
    }
  });
});

describe('Renderer P2.3 wiring (assetManager preload & traffic signal sync)', () => {
  it('preloadAssets initializes assetManager with WebGLRenderer and calls preloadCore', async () => {
    const r = Renderer.init(canvas);
    const initSpy = vi.spyOn(assetManager, 'init').mockResolvedValue();
    const preloadSpy = vi.spyOn(assetManager, 'preloadCore').mockResolvedValue();

    await r.preloadAssets();

    expect(initSpy).toHaveBeenCalledWith(r.webglRenderer);
    expect(preloadSpy).toHaveBeenCalledTimes(1);
    initSpy.mockRestore();
    preloadSpy.mockRestore();
  });

  it('forwards live SignalController to CityBuilder.updateTrafficSignals during render', () => {
    const r = Renderer.init(canvas);
    const { districts } = loadWorld();
    const mirpara = districts.get('mirpara')!;
    r.loadDistrict(mirpara);

    const signals = new SignalController(mirpara.nodes, 10);
    const spy = vi.spyOn(r.cityBuilder!, 'updateTrafficSignals');

    r.render(snapshot, 1.0, signals);
    expect(spy).toHaveBeenCalledWith(signals);
    spy.mockRestore();
  });
});

describe('Renderer P2.4 wiring (bike cosmetics, brake light, flyover y, people prototype refresh)', () => {
  it('syncs bike variant, cosmetics, brake light, and flyover y elevation during render', () => {
    const r = Renderer.init(canvas);

    r.setBikeState({ x: 10, y: 5.5, z: 20, heading: 0.2, speed: 10, lean: 0, steer: 0, braking: true });
    r.setBikeState({ x: 10, y: 5.5, z: 20, heading: 0.2, speed: 10, lean: 0, steer: 0, braking: true });

    const snapWithCosmetics = {
      clock: { minutes: 12 * 60 },
      weather: 'clear',
      economy: {
        currentBikeId: 'used125',
        installedCosmetics: { paint: '#dc2626', seatCover: 'leather' },
      },
    } as unknown as SimSnapshot;

    r.render(snapWithCosmetics);

    expect(r.bikeMesh.currentVariant).toBe('used125');
    expect((r.bikeMesh.tank.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('dc2626');
    expect(r.bikeMesh.isBraking()).toBe(true);
    expect(r.bikeMesh.root.position.y).toBeCloseTo(5.5);

    // Clearing cosmetics / reverting to old100 (e.g. newCareer / state/restored) updates live
    const snapReset = {
      clock: { minutes: 12 * 60 },
      weather: 'clear',
      economy: {
        currentBikeId: 'old100',
        installedCosmetics: {},
      },
    } as unknown as SimSnapshot;

    r.setBrakeLight(false);
    r.render(snapReset);
    expect(r.bikeMesh.currentVariant).toBe('old100');
    expect((r.bikeMesh.tank.material as THREE.MeshStandardMaterial).color.getHexString()).toBe('00cc44');
    expect(r.bikeMesh.isBraking()).toBe(false);
  });

  it('preloadAssets refreshes PeopleRenderer GLTF prototypes after preloadCore completes', async () => {
    const r = Renderer.init(canvas);
    vi.spyOn(assetManager, 'init').mockResolvedValue();
    vi.spyOn(assetManager, 'preloadCore').mockResolvedValue();
    const refreshSpy = vi.spyOn(r.peopleRenderer, 'refreshPrototypes');

    await r.preloadAssets();
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});

describe('Renderer P2.5 lighting, shadows, streetlights, LED headlight & flood FX', () => {
  it('tracks directional shadow frustum target to player bike across the 1800m city and lazily inits shadows', () => {
    const r = Renderer.init(canvas, 'low');

    // Low quality starts with shadows disabled; dirLight.target must still be in the scene
    expect(r.dirLight.castShadow).toBe(false);
    expect(r.scene.children).toContain(r.dirLight.target);

    // Transition low -> medium lazily initializes ±55m shadow frustum and >=1024 mapSize
    r.setQuality('medium');
    expect(r.dirLight.castShadow).toBe(true);
    expect(r.webglRenderer.shadowMap.enabled).toBe(true);
    expect(r.dirLight.shadow.mapSize.width).toBeGreaterThanOrEqual(1024);
    expect(r.dirLight.shadow.mapSize.height).toBeGreaterThanOrEqual(1024);
    expect(r.dirLight.shadow.camera.left).toBe(-55);
    expect(r.dirLight.shadow.camera.right).toBe(55);
    expect(r.dirLight.shadow.camera.top).toBe(55);
    expect(r.dirLight.shadow.camera.bottom).toBe(-55);

    // Ride far across the 1800m city
    const bikeX = 1523.4;
    const bikeY = 2.0;
    const bikeZ = 1147.8;
    r.setBikeState({ x: bikeX, y: bikeY, z: bikeZ, heading: 0, speed: 12, lean: 0, steer: 0 });
    r.setBikeState({ x: bikeX, y: bikeY, z: bikeZ, heading: 0, speed: 12, lean: 0, steer: 0 });
    r.render(snapshot);

    const texelSize = (2 * 55) / r.dirLight.shadow.mapSize.width;
    expect(Math.abs(r.dirLight.target.position.x - bikeX)).toBeLessThanOrEqual(texelSize * 0.5 + 1e-6);
    expect(Math.abs(r.dirLight.target.position.z - bikeZ)).toBeLessThanOrEqual(texelSize * 0.5 + 1e-6);
    // Snapped to exact texel grid
    expect(Math.abs(r.dirLight.target.position.x / texelSize - Math.round(r.dirLight.target.position.x / texelSize))).toBeLessThan(1e-5);
    expect(Math.abs(r.dirLight.target.position.z / texelSize - Math.round(r.dirLight.target.position.z / texelSize))).toBeLessThan(1e-5);

    // Light position is offset along sun direction from target
    expect(r.dirLight.position.x).toBeCloseTo(r.dirLight.target.position.x, 1);
    expect(r.dirLight.position.y).toBeGreaterThan(r.dirLight.target.position.y + 100);
    expect(r.dirLight.position.z).toBeGreaterThan(r.dirLight.target.position.z);
  });

  it('populates streetlights, applies upgrade_led_headlight, and syncs WeatherFx flood segments', async () => {
    const { RoadNetwork } = await import('../../../src/sim/road/RoadNetwork');
    const { WeatherSystem } = await import('../../../src/sim/world/WeatherSystem');
    const { TimeOfDay } = await import('../../../src/sim/world/TimeOfDay');

    const r = Renderer.init(canvas, 'medium');
    const { districts } = loadWorld();
    const mirpara = districts.get('mirpara')!;
    r.loadDistrict(mirpara);

    // Streetlights group populated along roads
    expect(r.weatherFx.streetlightsGroup.children.length).toBeGreaterThan(0);

    // Night render without LED upgrade -> stock halogen headlight + active streetlights
    const nightSnapStock = {
      clock: { minutes: 22 * 60 },
      weather: 'clear',
      economy: {
        currentBikeId: 'old100',
        installedCosmetics: {},
        ownedUpgrades: [],
      },
    } as unknown as SimSnapshot;

    const firstNode = mirpara.nodes[0]!;
    r.setBikeState({ x: firstNode.x, z: firstNode.z, heading: 0, speed: 0, lean: 0, steer: 0 });
    r.setBikeState({ x: firstNode.x, z: firstNode.z, heading: 0, speed: 0, lean: 0, steer: 0 });
    r.render(nightSnapStock);

    const stockSpec = TimeOfDay.getHeadlightSpec(false);
    expect(r.weatherFx.headlight.visible).toBe(true);
    expect(r.weatherFx.headlight.angle).toBeCloseTo(stockSpec.angle);
    expect(r.weatherFx.headlight.distance).toBeCloseTo(stockSpec.distance);
    expect(r.weatherFx.headlight.intensity).toBeCloseTo(stockSpec.intensity);

    const pointLights = r.weatherFx.streetlightsGroup.children.filter(
      (c): c is THREE.PointLight => c instanceof THREE.PointLight
    );
    expect(pointLights.length).toBeGreaterThan(0);
    expect(pointLights.some((pl) => pl.visible && pl.intensity > 0)).toBe(true);

    // Night render WITH upgrade_led_headlight -> wider, brighter cool-white LED cone
    const nightSnapLed = {
      clock: { minutes: 22 * 60 },
      weather: 'clear',
      economy: {
        currentBikeId: 'old100',
        installedCosmetics: {},
        ownedUpgrades: ['upgrade_led_headlight'],
      },
    } as unknown as SimSnapshot;

    r.render(nightSnapLed);
    const ledSpec = TimeOfDay.getHeadlightSpec(true);
    expect(r.weatherFx.headlight.angle).toBeCloseTo(ledSpec.angle);
    expect(r.weatherFx.headlight.distance).toBeCloseTo(ledSpec.distance);
    expect(r.weatherFx.headlight.intensity).toBeCloseTo(ledSpec.intensity);

    // Flooded segments sync from WeatherSystem without rebuilding on unchanged frames
    const roadNet = RoadNetwork.fromDistricts([mirpara]);
    const ws = new WeatherSystem({ initialWeather: 'heavyRain' });
    ws.update(30, roadNet.getAllSegments());

    r.syncFloodedSegments(ws, roadNet);
    const expectedFloodCount = ws.getFloodedSegments(roadNet.getAllSegments()).length;
    expect(expectedFloodCount).toBeGreaterThan(0);
    expect(r.weatherFx.waterGroup.children.length).toBe(expectedFloodCount);

    const firstWaterMesh = r.weatherFx.waterGroup.children[0];
    r.syncFloodedSegments(ws, roadNet);
    expect(r.weatherFx.waterGroup.children[0]).toBe(firstWaterMesh);
  });

  it('excludes world.connectors from populateStreetlights lamp heads while keeping them in trimSegments', () => {
    const r = Renderer.init(canvas, 'medium');
    const { world, districts } = loadWorld();
    const populateSpy = vi.spyOn(r.weatherFx, 'populateStreetlights');

    r.loadWorld(world, (id) => districts.get(id), undefined, { x: 300, z: 300 });

    expect(populateSpy).toHaveBeenCalledTimes(1);
    const [lampSegments, , trimSegments] = populateSpy.mock.calls[0]!;
    const connectorIds = new Set((world.connectors ?? []).map((c) => c.segmentId));
    expect(connectorIds.size).toBeGreaterThan(0);

    // Connector segments must NOT spawn floating lamp heads without poles
    for (const seg of lampSegments) {
      expect(connectorIds.has(seg.segmentId)).toBe(false);
    }
    // Connector segments MUST still be included in trimSegments so junction trims match CityBuilder
    expect(trimSegments).toBeDefined();
    const trimIds = new Set(trimSegments!.map((s) => s.segmentId));
    for (const cid of connectorIds) {
      expect(trimIds.has(cid)).toBe(true);
    }

    populateSpy.mockRestore();
  });

  it('matches scene.fog.color to overcast horizon gray in cloudy weather', () => {
    const r = Renderer.init(canvas, 'medium');
    const cloudySnap = {
      clock: { minutes: 12 * 60 },
      weather: 'cloudy',
      economy: { currentBikeId: 'old100', installedCosmetics: {}, ownedUpgrades: [] },
    } as unknown as SimSnapshot;

    r.render(cloudySnap);

    const bg = r.scene.background as THREE.Color;
    const fog = r.scene.fog as THREE.Fog;
    expect(fog.color.getHex()).toBe(bg.getHex());
    expect(fog.color.getHex()).toBe(0x64748b);
  });
});

describe('Renderer P2.6 real dt, AdaptiveQuality, WeatherFx quality sync & dispose()', () => {
  it('passes real frame dt (not hardcoded 1/60) and active bike vmax to CameraRig & RideMarkers', () => {
    let fakeNow = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => fakeNow);

    const r = Renderer.init(canvas, 'medium');
    const camSpy = vi.spyOn(r.cameraRig, 'update');
    const markerSpy = vi.spyOn(r.markers, 'update');

    const snap150 = {
      clock: { minutes: 12 * 60 },
      weather: 'clear',
      economy: { currentBikeId: 'new150', installedCosmetics: {}, ownedUpgrades: [] },
    } as unknown as SimSnapshot;

    r.render(snap150);
    fakeNow += 40; // 40ms frameDt = 0.04s
    r.render(snap150);

    expect(camSpy.mock.calls.at(-1)![4]).toBeCloseTo(0.04, 4);
    expect(camSpy.mock.calls.at(-1)![6]).toBe(28);
    expect(markerSpy.mock.calls.at(-1)![0]).toBeCloseTo(0.04, 4);

    nowSpy.mockRestore();
  });

  it('wires AdaptiveQualityManager into render() and dynamically updates WeatherFx & shadow map on setQuality()', () => {
    let fakeNow = 1000;
    const nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => fakeNow);

    const r = Renderer.init(canvas, 'high');
    expect(r.weatherFx.drawDistance).toBe(450);

    // Simulate fake shadow map render target attached to dirLight
    const fakeShadowMap = { dispose: vi.fn() } as unknown as THREE.WebGLRenderTarget;
    r.dirLight.shadow.map = fakeShadowMap;

    // Feed 15 FPS frames over 2.1 seconds so AdaptiveQualityManager triggers high -> medium
    const setQualitySpy = vi.spyOn(r, 'setQuality');
    for (let i = 0; i < 34; i++) {
      fakeNow += 66.7;
      r.render(snapshot);
    }
    expect(setQualitySpy).toHaveBeenCalledWith('medium');
    expect(r.qualityManager.config.level).toBe('medium');
    expect(r.weatherFx.drawDistance).toBe(300);
    expect((r.scene.fog as THREE.Fog).far).toBe(300);

    // Switching to low disposes dirLight.shadow.map and updates WeatherFx rain/fog
    r.dirLight.shadow.map = fakeShadowMap;
    r.setQuality('low');
    expect(fakeShadowMap.dispose).toHaveBeenCalled();
    expect(r.dirLight.shadow.map).toBeNull();
    expect(r.dirLight.castShadow).toBe(false);
    expect(r.weatherFx.drawDistance).toBe(200);
    r.render(snapshot);
    expect((r.scene.fog as THREE.Fog).far).toBe(200);

    nowSpy.mockRestore();
  });

  it('Renderer.dispose() cleans up CityBuilder, PeopleRenderer, WeatherFx, MotorcycleMesh, skyDome, shadows, and WebGLRenderer', () => {
    const r = Renderer.init(canvas, 'medium');
    const { districts } = loadWorld();
    const mirpara = districts.get('mirpara')!;
    r.loadDistrict(mirpara);

    const fakeShadowMap = { dispose: vi.fn() } as unknown as THREE.WebGLRenderTarget;
    r.dirLight.shadow.map = fakeShadowMap;

    const cityDisposeSpy = vi.spyOn(r.cityBuilder!, 'dispose');
    const peopleDisposeSpy = vi.spyOn(r.peopleRenderer, 'dispose');
    const weatherDisposeSpy = vi.spyOn(r.weatherFx, 'dispose');
    const bikeDisposeSpy = vi.spyOn(r.bikeMesh, 'dispose');
    const webglDisposeSpy = vi.spyOn(r.webglRenderer, 'dispose');

    r.dispose();

    expect(cityDisposeSpy).toHaveBeenCalledTimes(1);
    expect(peopleDisposeSpy).toHaveBeenCalledTimes(1);
    expect(weatherDisposeSpy).toHaveBeenCalledTimes(1);
    expect(bikeDisposeSpy).toHaveBeenCalledTimes(1);
    expect(webglDisposeSpy).toHaveBeenCalledTimes(1);
    expect(fakeShadowMap.dispose).toHaveBeenCalledTimes(1);
    expect(r.dirLight.shadow.map).toBeNull();
  });

  it('initDebugApi closures read live reassigned api.renderer after webglcontextrestored', async () => {
    const { initDebugApi } = await import('../../../src/debug/debugApi');
    const { EventBus } = await import('../../../src/core/events');
    const r1 = Renderer.init(canvas, 'medium');
    const r2 = Renderer.init(canvas, 'high');
    vi.spyOn(r1, 'getFps').mockReturnValue(24);
    vi.spyOn(r1, 'getDrawCalls').mockReturnValue(299);
    vi.spyOn(r1, 'getTriangles').mockReturnValue(111111);
    vi.spyOn(r1, 'isCameraClipping').mockReturnValue(false);

    vi.spyOn(r2, 'getFps').mockReturnValue(60);
    vi.spyOn(r2, 'getDrawCalls').mockReturnValue(72);
    vi.spyOn(r2, 'getTriangles').mockReturnValue(88000);
    vi.spyOn(r2, 'isCameraClipping').mockReturnValue(true);
    const toggleSpy2 = vi.spyOn(r2.cameraRig, 'toggleMode');

    const fakeGm = { bus: new EventBus() } as unknown as import('../../../src/sim/GameManager').GameManager;
    initDebugApi(fakeGm, { renderer: r1 });

    const api = (window as unknown as { __uthao: import('../../../src/debug/debugApi').DebugApi }).__uthao;
    expect(api.getFps()).toBe(24);
    expect(api.getDrawCalls()).toBe(299);
    expect(api.getTriangles()).toBe(111111);
    expect(api.isCameraClipping()).toBe(false);

    // Simulate webglcontextrestored replacing window.__uthao.renderer
    r1.dispose();
    api.renderer = r2;

    expect(api.getFps()).toBe(60);
    expect(api.getDrawCalls()).toBe(72);
    expect(api.getTriangles()).toBe(88000);
    expect(api.isCameraClipping()).toBe(true);
    api.toggleCamera();
    expect(toggleSpy2).toHaveBeenCalledTimes(1);
  });

  it('updatePeople accepts Map.values() iterables directly and updates rickshaws and cars in a single pass', () => {
    const r = Renderer.init(canvas);
    const peds = new Map([
      [
        'p1',
        {
          id: 'p1',
          x: 5,
          z: 5,
          heading: 0,
          speed: 1.1,
          state: 'sidewalk' as const,
          segmentId: 'S1',
          distAlongSegment: 5,
          lateralOffset: 0,
          side: 'left' as const,
          direction: 1 as const,
          lod: 'near' as const,
        },
      ],
    ]);
    const traffic = new Map([
      [
        'v1',
        {
          id: 'v1',
          kind: 'rickshaw' as const,
          x: 10,
          z: 10,
          heading: 0.5,
          speed: 3,
          laneId: 'L1',
          distAlongLane: 10,
          length: 2.2,
          width: 1.1,
          desiredSpeed: 3,
          lod: 'near' as const,
        },
      ],
      [
        'v2',
        {
          id: 'v2',
          kind: 'car' as const,
          x: 20,
          z: 20,
          heading: 1.0,
          speed: 8,
          laneId: 'L1',
          distAlongLane: 20,
          length: 4.4,
          width: 1.8,
          desiredSpeed: 10,
          lod: 'near' as const,
        },
      ],
    ]);

    expect(() => r.updatePeople(peds.values(), traffic.values(), 1.0)).not.toThrow();
    r.dispose();
  });
});
