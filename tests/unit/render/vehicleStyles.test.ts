import { describe, it, expect } from 'vitest';
import { PeopleRenderer } from '../../../src/render/people';
import { VEHICLE_COLOR } from '../../../src/render/vehicleStyles';
import { VEHICLE_CONFIGS } from '../../../src/sim/traffic/TrafficManager';

describe('traffic vehicles are drawn', () => {
  it('the renderer builds a mesh for every traffic kind except rickshaws', () => {
    // Every traffic kind the sim can spawn. Before this fix only rickshaws
    // were built, so cars and buses collided with the bike unseen.
    // The sim's own list of spawnable kinds, so a new kind cannot be missed.
    const simKinds = Object.keys(VEHICLE_CONFIGS);

    const built = new PeopleRenderer().drawnVehicleKinds();
    const missing = simKinds.filter((k) => k !== 'rickshaw' && !built.includes(k as never));

    expect(missing).toEqual([]);
  });

  it('every drawn kind has a colour', () => {
    for (const kind of new PeopleRenderer().drawnVehicleKinds()) {
      expect(VEHICLE_COLOR[kind]).toBeTypeOf('number');
    }
  });
});
