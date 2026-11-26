/**
 * Map backed by a composition `Map<K, V>` and synchronized dense array (`list`)
 * so hot simulation loops iterate via indexed `for` without Map iterator
 * allocations and `.get`/`.has` calls keep monomorphic native Map lookup.
 */
export class DenseMap<K, V> implements Map<K, V> {
  private readonly map = new Map<K, V>();
  readonly list: V[] = [];

  get size(): number {
    return this.map.size;
  }

  get(key: K): V | undefined {
    return this.map.get(key);
  }

  getOrInsert(key: K, defaultValue: V): V {
    if (this.map.has(key)) {
      return this.map.get(key) as V;
    }
    this.set(key, defaultValue);
    return defaultValue;
  }

  getOrInsertComputed(key: K, callbackFunction: (key: K) => V): V {
    if (this.map.has(key)) {
      return this.map.get(key) as V;
    }
    const value = callbackFunction(key);
    this.set(key, value);
    return value;
  }

  has(key: K): boolean {
    return this.map.has(key);
  }

  set(key: K, value: V): this {
    const existing = this.map.get(key);
    if (existing !== undefined) {
      if (existing !== value) {
        const idx = this.list.indexOf(existing);
        if (idx !== -1) {
          this.list[idx] = value;
        } else {
          this.list.push(value);
        }
      }
    } else if (this.map.has(key)) {
      this.list.push(value);
    } else {
      this.list.push(value);
    }
    this.map.set(key, value);
    return this;
  }

  delete(key: K): boolean {
    const existing = this.map.get(key);
    if (!this.map.delete(key)) return false;
    if (existing !== undefined) {
      const idx = this.list.indexOf(existing);
      if (idx !== -1) {
        const last = this.list.pop()!;
        if (idx < this.list.length) {
          this.list[idx] = last;
        }
      }
    }
    return true;
  }

  clear(): void {
    this.list.length = 0;
    this.map.clear();
  }

  forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void, thisArg?: unknown): void {
    this.map.forEach((value, key) => {
      callbackfn.call(thisArg, value, key, this);
    });
  }

  entries(): MapIterator<[K, V]> {
    return this.map.entries();
  }

  keys(): MapIterator<K> {
    return this.map.keys();
  }

  values(): MapIterator<V> {
    return this.map.values();
  }

  [Symbol.iterator](): MapIterator<[K, V]> {
    return this.map.entries();
  }

  get [Symbol.toStringTag](): string {
    return 'DenseMap';
  }
}
