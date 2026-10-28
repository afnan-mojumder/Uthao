export interface SpatialItem {
  id: string;
  x: number;
  z: number;
  radius: number;
}

export class SpatialHashGrid<T extends SpatialItem> {
  private cellSize: number;
  private grid: Map<string, T[]> = new Map();
  private queryResult: T[] = [];
  private seenIds: Set<string> = new Set();

  constructor(cellSize = 10.0) {
    this.cellSize = cellSize;
  }

  private getKey(cx: number, cz: number): string {
    return `${cx},${cz}`;
  }

  public clear(): void {
    this.grid.clear();
  }

  public insert(item: T): void {
    const minX = Math.floor((item.x - item.radius) / this.cellSize);
    const maxX = Math.floor((item.x + item.radius) / this.cellSize);
    const minZ = Math.floor((item.z - item.radius) / this.cellSize);
    const maxZ = Math.floor((item.z + item.radius) / this.cellSize);

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const key = this.getKey(cx, cz);
        let cell = this.grid.get(key);
        if (!cell) {
          cell = [];
          this.grid.set(key, cell);
        }
        cell.push(item);
      }
    }
  }

  public queryRadius(x: number, z: number, radius: number): T[] {
    this.queryResult.length = 0;
    this.seenIds.clear();

    const minX = Math.floor((x - radius) / this.cellSize);
    const maxX = Math.floor((x + radius) / this.cellSize);
    const minZ = Math.floor((z - radius) / this.cellSize);
    const maxZ = Math.floor((z + radius) / this.cellSize);
    const radiusSq = radius * radius;

    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const cell = this.grid.get(this.getKey(cx, cz));
        if (!cell) continue;

        for (let i = 0; i < cell.length; i++) {
          const item = cell[i]!;
          if (this.seenIds.has(item.id)) continue;

          const dx = item.x - x;
          const dz = item.z - z;
          if (dx * dx + dz * dz <= radiusSq) {
            this.seenIds.add(item.id);
            this.queryResult.push(item);
          }
        }
      }
    }

    return this.queryResult;
  }
}
