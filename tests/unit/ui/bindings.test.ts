import { describe, it, expect } from 'vitest';
import { GameManager } from '../../../src/sim/GameManager';
import { GameSession } from '../../../src/sim/GameSession';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { bindUi } from '../../../src/ui/bindings';
import * as store from '../../../src/ui/store';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';

function makeSession(): GameSession {
  const road = RoadNetwork.fromDistricts([testloopData as DistrictData]);
  const gm = new GameManager({ seed: 42, mode: 'career', data: {} });
  return new GameSession({ gm, road, autoRequests: false });
}

describe('T7.4 bindUi', () => {
  it('binds every exported on*Callback', () => {
    bindUi(makeSession());
    for (const [name, value] of Object.entries(store))
      if (/^on[A-Z].*Callback$/.test(name)) expect(value, name).toBeTypeOf('function');
  });
});
