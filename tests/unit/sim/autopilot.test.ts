import { describe, it, expect } from 'vitest';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { AutopilotController } from '../../../src/debug/autopilot';
import { createDefaultBikeSpec, createDefaultBikeState, stepBike } from '../../../src/physics/bikeModel';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

describe('AutopilotController', () => {
  const roadNetwork = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const bikeSpec = createDefaultBikeSpec();
  const env = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };

  it('drives from N1 to N2 and stops at destination', () => {
    const autopilot = new AutopilotController(roadNetwork);
    autopilot.setEnabled(true);

    let bike = {
      ...createDefaultBikeState(),
      x: 0,
      z: 0,
      heading: Math.PI / 2, // Facing +X towards N2 (100, 0)
      speed: 0,
    };

    autopilot.setDestination(bike.x, bike.z, 'N2');

    const dt = 1 / 60;
    let arrived = false;

    for (let tick = 0; tick < 1000; tick++) {
      const input = autopilot.step(bike);
      bike = stepBike(bike, input, bikeSpec, env, dt);

      const target = roadNetwork.getNode('N2')!;
      const dist = Math.hypot(bike.x - target.x, bike.z - target.z);

      if (dist <= 8.0 && bike.speed < 2.0) {
        arrived = true;
        break;
      }
    }

    const target = roadNetwork.getNode('N2')!;
    const dist = Math.hypot(bike.x - target.x, bike.z - target.z);
    console.log(`Final state: x=${bike.x.toFixed(1)}, z=${bike.z.toFixed(1)}, speed=${bike.speed.toFixed(1)}, dist=${dist.toFixed(1)}, arrived=${arrived}`);

    expect(arrived).toBe(true);
  });

  it('full ride lifecycle: start -> pickup N1 -> trip N2 -> arrived', () => {
    const autopilot = new AutopilotController(roadNetwork);
    autopilot.setEnabled(true);

    let bike = {
      ...createDefaultBikeState(),
      x: -9,
      z: 0,
      heading: Math.PI / 2, // Facing +X
      speed: 0,
    };

    let targetNodeId = 'N1';
    let phase = 'pickup';
    const dt = 1 / 60;
    let completed = false;

    for (let tick = 0; tick < 2000; tick++) {
      autopilot.setDestination(bike.x, bike.z, targetNodeId);
      const input = autopilot.step(bike);
      bike = stepBike(bike, input, bikeSpec, env, dt);

      const target = roadNetwork.getNode(targetNodeId)!;
      const dist = Math.hypot(bike.x - target.x, bike.z - target.z);

      if (phase === 'pickup' && dist <= 8.0 && bike.speed < 2.0) {
        console.log(`Picked up at tick ${tick}: x=${bike.x.toFixed(1)}, speed=${bike.speed.toFixed(1)}`);
        phase = 'dropoff';
        targetNodeId = 'N2';
      } else if (phase === 'dropoff' && dist <= 8.0 && bike.speed < 2.0) {
        console.log(`Completed at tick ${tick}: x=${bike.x.toFixed(1)}, speed=${bike.speed.toFixed(1)}`);
        completed = true;
        break;
      }
    }

    expect(completed).toBe(true);
  });
});
