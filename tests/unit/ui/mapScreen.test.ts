import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, h } from 'preact';
import worldDataJson from '../../../data/world.json';
import mirparaJson from '../../../data/districts/mirpara.json';
import fulgateJson from '../../../data/districts/fulgate.json';
import dhanbaghJson from '../../../data/districts/dhanbagh.json';
import mohakhalJson from '../../../data/districts/mohakhal.json';
import gulbariJson from '../../../data/districts/gulbari.json';
import puranparaJson from '../../../data/districts/puranpara.json';
import motinagarJson from '../../../data/districts/motinagar.json';
import type { DistrictData, WorldData } from '../../../src/sim/schemas';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { setLanguage, t } from '../../../src/ui/i18n';
import {
  MapScreen,
  buildMapModel,
  hitTestMapCanvas,
  worldToMap,
  MAP_LEGEND_ITEMS,
} from '../../../src/ui/map/MapScreen';
import {
  getDefaultWorldData,
  getDefaultDistrictsSync,
  loadAllDistricts,
} from '../../../src/ui/map/worldAccessor';

const ALL_DISTRICTS: DistrictData[] = [
  mirparaJson as unknown as DistrictData,
  fulgateJson as unknown as DistrictData,
  dhanbaghJson as unknown as DistrictData,
  mohakhalJson as unknown as DistrictData,
  gulbariJson as unknown as DistrictData,
  puranparaJson as unknown as DistrictData,
  motinagarJson as unknown as DistrictData,
];

const WORLD = worldDataJson as unknown as WorldData;

class FakeText {
  nodeType = 3;
  data: string;
  parentNode: FakeElement | null = null;
  constructor(data: string) {
    this.data = data;
  }
  get textContent(): string {
    return this.data;
  }
  set textContent(v: string) {
    this.data = v;
  }
  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 && idx + 1 < this.parentNode.childNodes.length
      ? this.parentNode.childNodes[idx + 1]!
      : null;
  }
  remove(): void {
    this.parentNode?.removeChild(this);
  }
}

type FakeNode = FakeElement | FakeText;

class FakeElement {
  nodeType = 1;
  tagName: string;
  attributes: Record<string, string> = {};
  style: Record<string, string | number> = {};
  childNodes: FakeNode[] = [];
  parentNode: FakeElement | null = null;
  listeners: Record<string, Array<(e?: unknown) => void>> = {};
  clientWidth = 800;
  clientHeight = 500;
  width = 800;
  height = 500;

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  get nextSibling(): FakeNode | null {
    if (!this.parentNode) return null;
    const idx = this.parentNode.childNodes.indexOf(this);
    return idx >= 0 && idx + 1 < this.parentNode.childNodes.length
      ? this.parentNode.childNodes[idx + 1]!
      : null;
  }

  get firstChild(): FakeNode | null {
    return this.childNodes[0] ?? null;
  }

  setAttribute(name: string, val: unknown): void {
    this.attributes[name] = String(val);
  }

  getAttribute(name: string): string | null {
    return name in this.attributes ? this.attributes[name]! : null;
  }

  removeAttribute(name: string): void {
    delete this.attributes[name];
  }

  addEventListener(type: string, cb: (e?: unknown) => void): void {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type]!.push(cb);
  }

  removeEventListener(type: string, cb: (e?: unknown) => void): void {
    const arr = this.listeners[type];
    if (!arr) return;
    this.listeners[type] = arr.filter((fn) => fn !== cb);
  }

  appendChild<T extends FakeNode>(child: T): T {
    if (child.parentNode) child.parentNode.removeChild(child);
    this.childNodes.push(child);
    child.parentNode = this;
    return child;
  }

  insertBefore<T extends FakeNode>(child: T, ref: FakeNode | null): T {
    if (child.parentNode) child.parentNode.removeChild(child);
    if (!ref) return this.appendChild(child);
    const idx = this.childNodes.indexOf(ref);
    if (idx === -1) return this.appendChild(child);
    this.childNodes.splice(idx, 0, child);
    child.parentNode = this;
    return child;
  }

  removeChild<T extends FakeNode>(child: T): T {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  click(): void {
    for (const cb of this.listeners.click ?? []) {
      cb.call(this, {
        type: 'click',
        target: this,
        currentTarget: this,
        preventDefault: () => {},
        stopPropagation: () => {},
      });
    }
  }

  getContext() {
    const noop = () => {};
    return {
      clearRect: noop,
      fillRect: noop,
      strokeRect: noop,
      beginPath: noop,
      moveTo: noop,
      lineTo: noop,
      closePath: noop,
      arc: noop,
      fill: noop,
      stroke: noop,
      save: noop,
      restore: noop,
      setLineDash: noop,
      fillText: noop,
    };
  }

  get textContent(): string {
    return this.childNodes.map((c) => c.textContent).join('');
  }

  querySelectorAll(selector: string): FakeElement[] {
    const results: FakeElement[] = [];
    const testIdExact = /^\[data-testid="([^"]+)"\]$/.exec(selector);
    const testIdPrefix = /^\[data-testid\^="([^"]+)"\]$/.exec(selector);
    const visit = (el: FakeElement) => {
      const tid = el.getAttribute('data-testid');
      if (testIdExact && tid === testIdExact[1]) results.push(el);
      else if (testIdPrefix && tid?.startsWith(testIdPrefix[1]!)) results.push(el);
      for (const c of el.childNodes) {
        if (c instanceof FakeElement) visit(c);
      }
    };
    for (const c of this.childNodes) {
      if (c instanceof FakeElement) visit(c);
    }
    return results;
  }

  querySelector(selector: string): FakeElement | null {
    return this.querySelectorAll(selector)[0] ?? null;
  }
}

async function withFakeDom(fn: (root: FakeElement) => Promise<void> | void): Promise<void> {
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const prevWin = (globalThis as Record<string, unknown>).window;
  (globalThis as Record<string, unknown>).document = {
    createElement: (tag: string) => new FakeElement(tag),
    createElementNS: (_ns: string, tag: string) => new FakeElement(tag),
    createTextNode: (txt: string) => new FakeText(txt),
  };
  (globalThis as Record<string, unknown>).window = { devicePixelRatio: 1 };
  const root = new FakeElement('div');
  try {
    await fn(root);
  } finally {
    render(null, root as unknown as Element);
    (globalThis as Record<string, unknown>).document = prevDoc;
    (globalThis as Record<string, unknown>).window = prevWin;
  }
}

describe('P6.3 MapScreen 7-District World Model & Hit Testing', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('worldAccessor provides worldData and all 7 Dhaka districts synchronously and asynchronously for P8.1', async () => {
    const w = getDefaultWorldData();
    const syncDistricts = getDefaultDistrictsSync();
    const asyncDistricts = await loadAllDistricts();

    expect(w.districts.length).toBe(7);
    expect(syncDistricts.map((d) => d.districtId).sort()).toEqual([
      'dhanbagh',
      'fulgate',
      'gulbari',
      'mirpara',
      'mohakhal',
      'motinagar',
      'puranpara',
    ]);
    expect(asyncDistricts.map((d) => d.districtId).sort()).toEqual(
      syncDistricts.map((d) => d.districtId).sort()
    );
  });

  it('ingests RoadNetwork.fromWorld with all 7 districts, connectors, routeNodes, POIs, and markers', () => {
    const net = RoadNetwork.fromWorld(WORLD, ALL_DISTRICTS);
    const allNodes = net.getAllNodes();
    const mirNodes = allNodes.filter((n) => net.getNodeDistrict(n.nodeId) === 'mirpara');
    const fulNodes = allNodes.filter((n) => net.getNodeDistrict(n.nodeId) === 'fulgate');
    const dhanNodes = allNodes.filter((n) => net.getNodeDistrict(n.nodeId) === 'dhanbagh');
    const motNodes = allNodes.filter((n) => net.getNodeDistrict(n.nodeId) === 'motinagar');

    const routeIds = mirNodes.slice(0, 3).map((n) => n.nodeId);
    const pickupId = mirNodes[0]!.nodeId;
    const dropoffId = fulNodes[0]!.nodeId;
    const waypointId = dhanNodes[0]!.nodeId;
    const eventId = mirNodes[3]!.nodeId;
    const storyId = motNodes[0]!.nodeId;

    const model = buildMapModel({
      roadNetwork: net,
      worldData: WORLD,
      playerPos: { x: 250, z: 250 },
      routeNodes: routeIds,
      pickupNodeId: pickupId,
      dropoffNodeId: dropoffId,
      waypointNodeId: waypointId,
      roadEvents: [
        { id: 'ev_1', nodeId: eventId, type: 'waterlogging', severity: 0.7 },
      ],
      storyNodeIds: [storyId],
    });

    expect(model.districts.length).toBe(7);
    expect(model.connectors.length).toBe(WORLD.connectors.length);
    expect(model.connectors.length).toBeGreaterThanOrEqual(8);
    expect(model.nodes.length).toBe(allNodes.length);
    expect(model.segments.length).toBe(net.getAllSegments().length);
    expect(model.routePoints.length).toBe(3);
    expect(model.pickupPoint?.nodeId).toBe(pickupId);
    expect(model.dropoffPoint?.nodeId).toBe(dropoffId);
    expect(model.waypointPoint?.nodeId).toBe(waypointId);
    expect(model.eventPoints.length).toBe(1);
    expect(model.storyPoints.map((s) => s.nodeId)).toContain(storyId);

    const teaPois = model.pois.filter((p) => p.kind === 'teaStall');
    const fuelPois = model.pois.filter((p) => p.kind === 'fuel');
    const garagePois = model.pois.filter((p) => p.kind === 'garage');
    expect(teaPois.length).toBeGreaterThan(0);
    expect(fuelPois.length).toBeGreaterThan(0);
    expect(garagePois.length).toBeGreaterThan(0);
  });

  it('hitTestMapCanvas selects the TRUE closest node to click point and never defaults to nodes[0]', () => {
    const net = RoadNetwork.fromWorld(WORLD, ALL_DISTRICTS);
    const model = buildMapModel({
      roadNetwork: net,
      worldData: WORLD,
    });

    const width = 800;
    const height = 500;
    const padX = 28;
    const padTop = 76;
    const padBottom = 36;

    const targetNode = model.nodes.find((n) => n.districtId === 'puranpara')!;
    expect(targetNode).toBeDefined();
    expect(targetNode.nodeId).not.toBe(model.nodes[0]!.nodeId);

    const projected = worldToMap(targetNode.x, targetNode.z, model.bounds, width, height, {
      padX,
      padTop,
      padBottom,
    });

    const hit = hitTestMapCanvas(
      projected.x + 8,
      projected.y - 6,
      model,
      [],
      width,
      height,
      { padX, padTop, padBottom }
    );

    expect(hit.kind).toBe('node');
    if (hit.kind === 'node') {
      expect(hit.node.nodeId).toBe(targetNode.nodeId);
    }
  });

  it('defines legend items covering roads, connectors, rivers, greenery, route, markers, and POIs', () => {
    const ids = MAP_LEGEND_ITEMS.map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'road',
        'connector',
        'river',
        'greenery',
        'route',
        'player',
        'pickup',
        'dropoff',
        'event',
        'story',
        'fuel',
        'garage',
        'tea',
        'waypoint',
      ])
    );

    setLanguage('en');
    for (const item of MAP_LEGEND_ITEMS) {
      expect(t(item.labelKey)).not.toBe(item.labelKey);
    }
    setLanguage('bn');
    for (const item of MAP_LEGEND_ITEMS) {
      expect(t(item.labelKey)).not.toBe(item.labelKey);
    }
  });

  it('renders Prototype Map label when hasMapAsset is false, hides it when true, and provides working Tea filter + legend UI', async () => {
    const net = RoadNetwork.fromWorld(WORLD, ALL_DISTRICTS);
    const routeIds = net
      .getAllNodes()
      .filter((n) => net.getNodeDistrict(n.nodeId) === 'mirpara')
      .slice(0, 2)
      .map((n) => n.nodeId);

    await withFakeDom(async (root) => {
      render(
        h(MapScreen, {
          isOpen: true,
          roadNetwork: net,
          worldData: WORLD,
          playerPos: { x: 250, z: 250 },
          routeNodes: routeIds,
          hasMapAsset: false,
          onClose: vi.fn(),
        }),
        root as unknown as Element
      );

      expect(root.querySelectorAll('[data-testid="map-prototype-badge"]').length).toBe(1);
      const teaFilterBtn = root.querySelector('[data-testid="map-filter-tea"]');
      expect(teaFilterBtn).not.toBeNull();
      expect(teaFilterBtn?.getAttribute('aria-pressed')).toBe('false');
      teaFilterBtn?.click();
      await new Promise((r) => setTimeout(r, 15));
      expect(root.querySelector('[data-testid="map-filter-tea"]')?.getAttribute('aria-pressed')).toBe('true');

      const legendPanel = root.querySelector('[data-testid="map-legend-panel"]');
      expect(legendPanel).not.toBeNull();
      const legendText = legendPanel!.textContent.toLowerCase();
      expect(legendText).toContain('river');
      expect(legendText).toContain('green');

      expect(root.querySelectorAll('[data-testid^="map-district-badge-"]').length).toBe(7);

      render(
        h(MapScreen, {
          isOpen: true,
          roadNetwork: net,
          worldData: WORLD,
          hasMapAsset: true,
          onClose: vi.fn(),
        }),
        root as unknown as Element
      );
      expect(root.querySelectorAll('[data-testid="map-prototype-badge"]').length).toBe(0);
    });
  });
});
