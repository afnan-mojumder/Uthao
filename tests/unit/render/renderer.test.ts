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
