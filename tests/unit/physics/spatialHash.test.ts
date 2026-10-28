import { describe, it, expect, beforeEach } from 'vitest';
import { SpatialHashGrid, type SpatialItem } from '../../../src/physics/SpatialHashGrid';

describe('SpatialHashGrid Broadphase Optimizer', () => {
  let grid: SpatialHashGrid<SpatialItem>;

  beforeEach(() => {
    grid = new SpatialHashGrid<SpatialItem>(10.0);
  });

  it('inserts and queries items within radius correctly', () => {
    const item1: SpatialItem = { id: 'obj1', x: 5, z: 5, radius: 1 };
    const item2: SpatialItem = { id: 'obj2', x: 25, z: 25, radius: 1 };
    const item3: SpatialItem = { id: 'obj3', x: 8, z: 6, radius: 1 };

    grid.insert(item1);
    grid.insert(item2);
    grid.insert(item3);

    const near = grid.queryRadius(5, 5, 5);
    const ids = near.map((i) => i.id);

    expect(ids).toContain('obj1');
    expect(ids).toContain('obj3');
    expect(ids).not.toContain('obj2');
  });

  it('clears correctly and avoids stale results', () => {
    grid.insert({ id: 'temp', x: 0, z: 0, radius: 1 });
    expect(grid.queryRadius(0, 0, 5).length).toBe(1);

    grid.clear();
    expect(grid.queryRadius(0, 0, 5).length).toBe(0);
  });
});
