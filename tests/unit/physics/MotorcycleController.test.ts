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
  });
});
