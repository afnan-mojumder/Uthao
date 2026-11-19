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
