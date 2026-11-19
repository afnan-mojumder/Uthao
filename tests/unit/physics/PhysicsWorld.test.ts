import { describe, it, expect } from 'vitest';
import {
  PhysicsWorld,
  type StaticBoxHandle,
  type SweepHit,
} from '../../../src/physics/PhysicsWorld';

function makeHit(): SweepHit {
  return {
    hit: false,
    toi: 1,
    normalX: 0,
    normalZ: 0,
    otherKind: 'building',
    otherVx: 0,
    otherVz: 0,
  };
}

describe('PhysicsWorld (deterministic 2.5D spatial-hash)', () => {
  it('resolves rotated OBB sweep, sliding along angled walls without penetrating', async () => {
    const pw = await PhysicsWorld.create();
    const handle = pw.addStaticBox(10, 1, 0, 2, 1, 5, Math.PI / 4, 'building');
    expect(handle.kind).toBe('building');

    const hit = makeHit();
    const slide = { x: 0, z: 0 };
    pw.sweepCapsule(7.5, 0, 0.5, 0.35, 3, 0, hit, slide);

    expect(hit.hit).toBe(true);
    expect(hit.toi).toBeLessThan(1);
    expect(hit.toi).toBeGreaterThanOrEqual(0);
    expect(hit.otherKind).toBe('building');
    expect(hit.normalX).toBeLessThan(0);
    expect(Math.hypot(hit.normalX, hit.normalZ)).toBeCloseTo(1, 5);
    expect(Math.hypot(slide.x, slide.z)).toBeGreaterThan(0);
    expect(Math.hypot(slide.x, slide.z)).toBeLessThanOrEqual(3 + 1e-4);
  });

  it('isolates elevation bands so flyover colliders do not block ground vehicles', async () => {
    const pw = await PhysicsWorld.create();
    pw.addStaticBox(0, 6, 0, 5, 0.5, 2, 0, 'kerb'); // flyover at y=6 (minY=5.5, maxY=6.5)
    pw.addStaticBox(0, 0.09, 8, 5, 0.09, 0.14, 0, 'kerb'); // ground kerb (minY=0, maxY=0.18)

    const hit = makeHit();
    const slide = { x: 0, z: 0 };

    // Ground rider passes underneath the flyover without hitting
    pw.sweepCapsule(0, -3, 0.5, 0.35, 0, 6, hit, slide);
    expect(hit.hit).toBe(false);
    expect(slide).toEqual({ x: 0, z: 6 });

    // Ground rider at y=0 hits the ground kerb
    pw.sweepCapsule(0, 7, 0, 0.35, 0, 2, hit, slide);
    expect(hit.hit).toBe(true);
    expect(hit.otherKind).toBe('kerb');

    // Elevated rider at y=5.5 hits the flyover kerb, ignores ground kerb
    pw.sweepCapsule(0, -3, 5.5, 0.35, 0, 6, hit, slide);
    expect(hit.hit).toBe(true);
    expect(hit.otherKind).toBe('kerb');

    pw.sweepCapsule(0, 7, 5.5, 0.35, 0, 2, hit, slide);
    expect(hit.hit).toBe(false);
  });

  it('performs 2-pass wall slide into a corner without penetrating either wall', async () => {
    const pw = await PhysicsWorld.create();
    // Horizontal wall at z = 2 (spanning x in [-5, 5], halfZ = 0.2 -> front face at z = 1.8)
    pw.addStaticBox(0, 1, 2, 5, 1, 0.2, 0, 'building');
    // Vertical wall at x = 2 (spanning z in [-5, 5], halfX = 0.2 -> left face at x = 1.8)
    pw.addStaticBox(2, 1, 0, 0.2, 1, 5, 0, 'building');

    const hit = makeHit();
    const slide = { x: 0, z: 0 };
    const radius = 0.35;
    pw.sweepCapsule(0, 0, 0, radius, 2.5, 2.5, hit, slide);

    expect(hit.hit).toBe(true);
    expect(slide.x).toBeLessThanOrEqual(1.8 - radius + 1e-3);
    expect(slide.z).toBeLessThanOrEqual(1.8 - radius + 1e-3);
  });

  it('stops on head-on flat collision and slides smoothly around box corners', async () => {
    const pw = await PhysicsWorld.create();
    pw.addStaticBox(0, 1, 5, 2, 1, 1, 0, 'building');

    const hit = makeHit();
    const slide = { x: 0, z: 0 };

    // Head-on hit against z = 4 face
    pw.sweepCapsule(0, 2, 0, 0.35, 0, 3, hit, slide);
    expect(hit.hit).toBe(true);
    expect(hit.normalX).toBeCloseTo(0, 5);
    expect(hit.normalZ).toBeCloseTo(-1, 5);
    expect(slide.x).toBeCloseTo(0, 5);
    expect(slide.z).toBeLessThanOrEqual(4 - 2 - 0.35 + 1e-4);

    // Grazing the corner at (2, 4)
    pw.sweepCapsule(2.2, 3.2, 0, 0.35, -0.1, 1.5, hit, slide);
    expect(hit.hit).toBe(true);
    expect(Math.hypot(slide.x, slide.z)).toBeGreaterThan(0.5);
  });

  it('deduplicates multi-cell boxes across 20m spatial grid cells including negative coords', async () => {
    const pw = await PhysicsWorld.create();
    // Large box spanning (-35..+35, -35..+35) across at least 16 cells
    const bigBox = pw.addStaticBox(0, 1, 0, 35, 1, 35, 0, 'building');

    const out: StaticBoxHandle[] = [];
    pw.queryAabb(-40, -40, 40, 40, out);

    expect(out).toHaveLength(1);
    expect(out[0]).toBe(bigBox);

    // Subsequent query reuses out array cleanly
    pw.queryAabb(100, 100, 120, 120, out);
    expect(out).toHaveLength(0);
  });

  it('removes colliders cleanly and supports clearAllColliders and addStaticPolyline', async () => {
    const pw = await PhysicsWorld.create();
    const box = pw.addStaticBox(-15, 1, -15, 3, 1, 3, 0, 'prop');
    const poly = pw.addStaticPolyline(
      [
        { x: 10, z: 0 },
        { x: 10, z: 10 },
      ],
      0.5,
      'kerb'
    );
    expect(poly).toHaveLength(1);
    expect(poly[0]!.kind).toBe('kerb');

    const hit = makeHit();
    const slide = { x: 0, z: 0 };

    pw.sweepCapsule(-20, -15, 0, 0.35, 5, 0, hit, slide);
    expect(hit.hit).toBe(true);

    pw.removeCollider(box);
    pw.sweepCapsule(-20, -15, 0, 0.35, 5, 0, hit, slide);
    expect(hit.hit).toBe(false);

    // Polyline still active until clearAllColliders
    pw.sweepCapsule(8, 5, 0, 0.35, 4, 0, hit, slide);
    expect(hit.hit).toBe(true);
    expect(hit.otherKind).toBe('kerb');

    pw.clearAllColliders();
    pw.sweepCapsule(8, 5, 0, 0.35, 4, 0, hit, slide);
    expect(hit.hit).toBe(false);
  });

  it('detects and updates dynamic vehicle OBBs with traffic velocity and id', async () => {
    const pw = await PhysicsWorld.create();
    pw.upsertDynamicVehicle({
      id: 'bus_1',
      kind: 'bus',
      x: 5,
      z: 10,
      halfX: 1.2,
      halfZ: 4.0,
      minY: 0,
      maxY: 3.0,
      yaw: 0,
      vx: 0,
      vz: -6,
    });

    const hit = makeHit();
    const slide = { x: 0, z: 0 };
    pw.sweepCapsule(2, 10, 0, 0.35, 3, 0, hit, slide);

    expect(hit.hit).toBe(true);
    expect(hit.otherKind).toBe('traffic');
    expect(hit.otherId).toBe('bus_1');
    expect(hit.otherVx).toBe(0);
    expect(hit.otherVz).toBe(-6);

    // Upsert moves the same vehicle without duplicating
    pw.upsertDynamicVehicle({
      id: 'bus_1',
      kind: 'bus',
      x: 25,
      z: 10,
      halfX: 1.2,
      halfZ: 4.0,
      minY: 0,
      maxY: 3.0,
      yaw: 0,
      vx: 2,
      vz: 0,
    });
    pw.sweepCapsule(2, 10, 0, 0.35, 3, 0, hit, slide);
    expect(hit.hit).toBe(false);

    pw.clearDynamicVehicles();
    pw.sweepCapsule(22, 10, 0, 0.35, 3, 0, hit, slide);
    expect(hit.hit).toBe(false);
  });

  it('casts 2D rays with kind filtering, rotation, and elevation isolation', async () => {
    const pw = await PhysicsWorld.create();
    pw.addStaticBox(0, 0.09, 3, 4, 0.09, 0.2, 0, 'kerb');
    pw.addStaticBox(0, 1.5, 6, 4, 1.5, 0.5, Math.PI / 6, 'building');
    pw.addStaticBox(0, 6.0, 2, 4, 0.5, 0.5, 0, 'prop'); // overhead sign/flyover

    // At y=0, unfiltered ray hits kerb at z = 3 - 0.2 = 2.8
    const dAll = pw.castRay2D(0, 0, 0, 0, 1, 10);
    expect(dAll).toBeCloseTo(2.8, 3);

    // Filtering to ['building'] skips kerb and hits rotated building
    const dBuilding = pw.castRay2D(0, 0, 0, 0, 1, 10, ['building']);
    expect(dBuilding).not.toBeNull();
    expect(dBuilding!).toBeGreaterThan(4.5);
    expect(dBuilding!).toBeLessThan(6.0);

    // At y=0.5, low kerb (maxY=0.18) and overhead prop (minY=5.5) are skipped
    const dMid = pw.castRay2D(0, 0, 0.5, 0, 1, 10);
    expect(dMid).toBeCloseTo(dBuilding!, 5);

    // Short maxDist misses
    expect(pw.castRay2D(0, 0, 0.5, 0, 1, 3.0)).toBeNull();
  });

  it('keeps steady-state sweepCapsule, castRay2D, queryAabb, and upsertDynamicVehicle allocation-light', async () => {
    const pw = await PhysicsWorld.create();
    for (let i = 0; i < 40; i++) {
      pw.addStaticBox(i * 15, 1, 5, 2, 1, 2, 0.3, 'building');
    }

    const hit = makeHit();
    const slide = { x: 0, z: 0 };
    const out: StaticBoxHandle[] = [];
    const filter: readonly ['building'] = ['building'];
    const dyn = {
      id: 'car_1',
      kind: 'car',
      x: 10,
      z: 0,
      halfX: 1,
      halfZ: 2,
      minY: 0,
      maxY: 1.5,
      yaw: 0,
      vx: 3,
      vz: 0,
    };

    // Warm up JIT & internal pools
    for (let i = 0; i < 200; i++) {
      pw.clearDynamicVehicles();
      pw.upsertDynamicVehicle(dyn);
      pw.sweepCapsule(10, 0, 0, 0.35, 1, 0.5, hit, slide);
      pw.castRay2D(10, 0, 0.5, 0, 1, 5, filter);
      pw.queryAabb(0, -10, 20, 10, out);
    }

    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < 5000; i++) {
      pw.clearDynamicVehicles();
      pw.upsertDynamicVehicle(dyn);
      pw.sweepCapsule(10, 0, 0, 0.35, 1, 0.5, hit, slide);
      pw.castRay2D(10, 0, 0.5, 0, 1, 5, filter);
      pw.queryAabb(0, -10, 20, 10, out);
    }
    const diffMb = (process.memoryUsage().heapUsed - before) / (1024 * 1024);
    expect(diffMb).toBeLessThan(2);
  });
});
