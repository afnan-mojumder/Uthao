import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import { MotorcycleController } from '../../../src/physics/MotorcycleController';
import { EventBus, type GameEvents } from '../../../src/core/events';

describe('PhysicsWorld and MotorcycleController', () => {
  let world: PhysicsWorld;
  let bus: EventBus<GameEvents>;
  const dt = 1 / 60;

  beforeEach(async () => {
    world = await PhysicsWorld.create();
    bus = new EventBus<GameEvents>();
  });

  it('driving into wall at 30 km/h emits crash', () => {
    // Add a wall perpendicular to Z at z = 2.0 (width 10m, thickness 0.4m)
    world.addStaticBox(0, 0.5, 2.0, 5.0, 1.0, 0.2);

    const collisionHandler = vi.fn();
    bus.on('bike/collision', collisionHandler);

    // Initial speed 30 km/h = 30 / 3.6 = 8.33 m/s heading north (+Z)
    const ctrl = new MotorcycleController({
      world,
      bus,
      initialPose: { x: 0, z: 1.0, heading: 0 },
    });
    ctrl.state.speed = 30 / 3.6;

    // Advance controller towards the wall
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 1.0, brake: 0, steer: 0 };

    for (let i = 0; i < 20; i++) {
      ctrl.update(input, env, dt);
      if (collisionHandler.mock.calls.length > 0) break;
    }

    expect(collisionHandler).toHaveBeenCalled();
    const payload = collisionHandler.mock.calls[0]![0];
    expect(payload.severity).toBe('crash');
    expect(payload.relSpeedKmh).toBeGreaterThanOrEqual(25);
  });

  it('grinding against a wall emits one collision per contact, not one per frame (audit Low: grinding)', () => {
    world.addStaticBox(0, 0.5, 2.0, 5.0, 1.0, 0.2);

    const collisionHandler = vi.fn();
    bus.on('bike/collision', collisionHandler);

    const ctrl = new MotorcycleController({
      world,
      bus,
      initialPose: { x: 0, z: 1.0, heading: 0 },
    });
    ctrl.state.speed = 30 / 3.6;

    // Hold the throttle into the wall for one second of game time.
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 1.0, brake: 0, steer: 0 };
    for (let i = 0; i < 60; i++) ctrl.update(input, env, dt);

    expect(collisionHandler).toHaveBeenCalledTimes(1);
  });

  it('at 5 km/h emits scuff', () => {
    world.addStaticBox(0, 0.5, 2.0, 5.0, 1.0, 0.2);

    const collisionHandler = vi.fn();
    bus.on('bike/collision', collisionHandler);

    // 5 km/h = 5 / 3.6 = 1.39 m/s
    const ctrl = new MotorcycleController({
      world,
      bus,
      initialPose: { x: 0, z: 1.5, heading: 0 },
    });
    ctrl.state.speed = 5 / 3.6;

    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 0, brake: 0, steer: 0 };

    for (let i = 0; i < 30; i++) {
      ctrl.update(input, env, dt);
      if (collisionHandler.mock.calls.length > 0) break;
    }

    expect(collisionHandler).toHaveBeenCalled();
    const payload = collisionHandler.mock.calls[0]![0];
    expect(payload.severity).toBe('scuff');
    expect(payload.relSpeedKmh).toBeLessThan(8);
  });

  it('slides along wall at shallow angle without stopping dead', () => {
    // Wall along Z axis at x = 0.5 (from z = -10 to z = +10)
    world.addStaticBox(0.5, 0.5, 5.0, 0.1, 1.0, 10.0);

    // Bike starts at x = 0.3, z = 0, moving forward with slight right steer into wall
    const ctrl = new MotorcycleController({
      world,
      bus,
      initialPose: { x: 0.3, z: 0, heading: 0.1 }, // slight angle towards wall at x = 0.5
    });
    ctrl.state.speed = 10; // 10 m/s (~36 km/h)

    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 0.5, brake: 0, steer: 0.1 };

    const initialZ = ctrl.state.z;

    for (let i = 0; i < 30; i++) {
      ctrl.update(input, env, dt);
    }

    // Bike should have moved significantly along Z rather than being stopped dead at contact
    const forwardProgress = ctrl.state.z - initialZ;
    expect(forwardProgress).toBeGreaterThan(1.5);
    expect(ctrl.state.x).toBeLessThanOrEqual(0.5); // prevented from penetrating wall
  });

  describe('near-miss reporting (bug: fired every frame at speed)', () => {
    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 1.0, brake: 0, steer: 0 };

    it('riding on an open road at 30 km/h reports no near miss', async () => {
      // Arrange: nothing around the bike but its own body
      const openWorld = await PhysicsWorld.create();
      const nearMiss = vi.fn();
      bus.on('bike/nearMiss', nearMiss);
      const ctrl = new MotorcycleController({ world: openWorld, bus, initialPose: { x: 0, z: 0, heading: 0 } });
      ctrl.state.speed = 30 / 3.6;

      // Act
      for (let i = 0; i < 60; i++) ctrl.update(input, env, dt);

      // Assert: the bike's own collider must not count as an obstacle
      expect(nearMiss).not.toHaveBeenCalled();
    });

    it('passing a wall close on one side reports one near miss, not one per frame', async () => {
      // Arrange: a wall running along the bike's path, 0.7 m to its right
      const wallWorld = await PhysicsWorld.create();
      wallWorld.addStaticBox(0.9, 0.5, 0, 0.2, 1.0, 20);
      const nearMiss = vi.fn();
      bus.on('bike/nearMiss', nearMiss);
      const ctrl = new MotorcycleController({ world: wallWorld, bus, initialPose: { x: 0, z: -10, heading: 0 } });
      ctrl.state.speed = 30 / 3.6;

      // Act: one second of riding alongside the wall
      for (let i = 0; i < 60; i++) ctrl.update(input, env, dt);

      // Assert: a near miss is a moment, so it is reported once per cooldown
      expect(nearMiss.mock.calls.length).toBeGreaterThanOrEqual(1);
      expect(nearMiss.mock.calls.length).toBeLessThanOrEqual(2);
    });

    it('detects left/right near-miss perpendiculars at 0.25m height with 0.35m radius subtracted and shares 1.0s cooldown across static and traffic', async () => {
      const mixedWorld = await PhysicsWorld.create();
      // Wall running parallel to heading +PI/4 on the bike's left side
      // Forward = (sqrt(2)/2, sqrt(2)/2). Left = (sqrt(2)/2, -sqrt(2)/2).
      // Place thin wall at 1.15m to the left => 1.15 - 0.35 radius = 0.80m surface clearance (< 1.0m).
      // Wall height covers y = 0.20..1.0 so 0.25m ray hits while 0.5m would also hit; include a kerb-ish box 0.22..0.35.
      const s2 = Math.SQRT1_2;
      mixedWorld.addStaticBox(1.25 * s2, 0.28, -1.25 * s2, 0.1, 0.08, 12, Math.PI / 4, 'prop');

      const nearMiss = vi.fn();
      bus.on('bike/nearMiss', nearMiss);
      const ctrl = new MotorcycleController({
        world: mixedWorld,
        bus,
        initialPose: { x: 0, z: 0, heading: Math.PI / 4 },
      });
      ctrl.state.speed = 30 / 3.6;

      // Step once along heading +PI/4: static wall is 1.15m from center => 0.80m clearance
      ctrl.update(input, env, dt);
      expect(nearMiss).toHaveBeenCalledTimes(1);
      expect(nearMiss.mock.calls[0]![0].distanceM).toBeCloseTo(0.8, 1);

      // Remove static box and place a traffic car 0.6m to the bike's right within the 1.0s cooldown
      mixedWorld.clearAllColliders();
      const bx = ctrl.state.x;
      const bz = ctrl.state.z;
      const rightX = -s2;
      const rightZ = s2;
      mixedWorld.upsertDynamicVehicle({
        id: 'car_near',
        kind: 'car',
        x: bx + rightX * 1.85, // 1.85 - 0.9 halfX - 0.35 radius = 0.60m clearance
        z: bz + rightZ * 1.85,
        halfX: 0.9,
        halfZ: 4.0,
        minY: 0,
        maxY: 1.5,
        yaw: Math.PI / 4,
        vx: 0,
        vz: 0,
      });

      // Step for 0.5s (30 ticks): shared 1.0s cooldown suppresses the traffic near-miss
      for (let i = 0; i < 30; i++) {
        mixedWorld.upsertDynamicVehicle({
          id: 'car_near',
          kind: 'car',
          x: ctrl.state.x + rightX * 1.85,
          z: ctrl.state.z + rightZ * 1.85,
          halfX: 0.9,
          halfZ: 4.0,
          minY: 0,
          maxY: 1.5,
          yaw: Math.PI / 4,
          vx: 0,
          vz: 0,
        });
        ctrl.update(input, env, dt);
      }
      expect(nearMiss).toHaveBeenCalledTimes(1);

      // Continue past the 1.0s cooldown (35 more ticks -> >1.08s total)
      for (let i = 0; i < 35; i++) {
        mixedWorld.upsertDynamicVehicle({
          id: 'car_near',
          kind: 'car',
          x: ctrl.state.x + rightX * 1.85,
          z: ctrl.state.z + rightZ * 1.85,
          halfX: 0.9,
          halfZ: 4.0,
          minY: 0,
          maxY: 1.5,
          yaw: Math.PI / 4,
          vx: 0,
          vz: 0,
        });
        ctrl.update(input, env, dt);
      }
      expect(nearMiss).toHaveBeenCalledTimes(2);
      expect(nearMiss.mock.calls[1]![0].distanceM).toBeCloseTo(0.6, 1);
    });
  });

  it('classifies parallel wall scraping as scuff, never crash', () => {
    // Wall along Z at x = 2.0 (halfX = 0.5 => left face at x = 1.5)
    world.addStaticBox(2.0, 0.5, 0, 0.5, 1.0, 30.0, 0, 'building');

    const collisions: Array<{ severity: string; relSpeedKmh: number }> = [];
    bus.on('bike/collision', (e) => collisions.push(e));

    const ctrl = new MotorcycleController({
      world,
      bus,
      initialPose: { x: 1.14, z: -10, heading: 0.01 },
    });
    ctrl.state.speed = 30 / 3.6;

    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 0.8, brake: 0, steer: 0 };

    for (let i = 0; i < 30; i++) {
      ctrl.update(input, env, dt);
    }

    expect(collisions.length).toBeGreaterThanOrEqual(1);
    for (const c of collisions) {
      expect(c.severity).toBe('scuff');
    }
    expect(ctrl.state.crashed).toBe(false);
    expect(ctrl.state.speed).toBeGreaterThan(6);
  });

  it('head-on collision with oncoming traffic computes summed vector speed and pushes bike out', () => {
    const collisions: Array<{ severity: string; relSpeedKmh: number; otherKind?: string }> = [];
    bus.on('bike/collision', (e) => collisions.push(e));

    const ctrl = new MotorcycleController({
      world,
      bus,
      initialPose: { x: 0, z: 0, heading: 0 },
    });
    ctrl.state.speed = 40 / 3.6;

    const busState = {
      id: 'bus_oncoming',
      kind: 'bus',
      x: 0,
      z: 5.0, // front face at z = 1.0
      halfX: 1.2,
      halfZ: 4.0,
      minY: 0,
      maxY: 3.0,
      yaw: Math.PI,
      vx: 0,
      vz: -40 / 3.6,
    };

    const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
    const input = { throttle: 0.5, brake: 0, steer: 0 };

    for (let i = 0; i < 20; i++) {
      busState.z += busState.vz * dt;
      world.clearDynamicVehicles();
      world.upsertDynamicVehicle(busState);
      ctrl.update(input, env, dt);
    }

    expect(collisions.length).toBe(1);
    expect(collisions[0]!.severity).toBe('crash');
    expect(collisions[0]!.otherKind).toBe('traffic');
    expect(collisions[0]!.relSpeedKmh).toBeGreaterThanOrEqual(75);
    expect(ctrl.state.crashed).toBe(true);
    // Bike is physically pushed out so it never overlaps the bus center or phases through
    const dxBus = Math.abs(ctrl.state.x - busState.x);
    const dzBus = Math.abs(ctrl.state.z - busState.z);
    const overlapsBusObb = dxBus < busState.halfX + 0.34 && dzBus < busState.halfZ + 0.34;
    expect(overlapsBusObb).toBe(false);
  });

  it('preserves BikeState.y across update', () => {
    const ctrl = new MotorcycleController({
      world,
      bus,
      initialPose: { x: 0, z: 0, heading: 0 },
    });
    ctrl.state.y = 6.25;
    ctrl.update(
      { throttle: 1, brake: 0, steer: 0 },
      { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 },
      dt
    );
    expect(ctrl.state.y).toBe(6.25);
  });
});
