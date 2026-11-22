import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { Rng } from '../../../src/core/rng';
import { createDefaultBikeState } from '../../../src/physics/bikeModel';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { RoutingGraph } from '../../../src/sim/road/routing';
import { TrafficManager, type TrafficAgent } from '../../../src/sim/traffic/TrafficManager';
import { PedestrianManager } from '../../../src/sim/traffic/pedestrians';
import { WeatherSystem } from '../../../src/sim/world/WeatherSystem';
import { RoadEventManager } from '../../../src/sim/world/RoadEvents';
import { AutopilotController } from '../../../src/debug/autopilot';
import { RoadMeshBuilder } from '../../../src/render/roadMesh';
import { AssetManager } from '../../../src/render/assets';
import { Minimap } from '../../../src/render/minimap';
import { WeatherFx } from '../../../src/render/WeatherFx';
import type { DistrictData } from '../../../src/sim/schemas';
import type { RoadNode, RoadSegment } from '../../../src/core/types';
import testloopJson from '../../../data/districts/testloop.json';

function makeNode(nodeId: string, x: number, z: number, extra: Partial<RoadNode> = {}): RoadNode {
  return {
    nodeId,
    x,
    z,
    kind: 'junction',
    signal: false,
    ...extra,
  };
}

function makeSeg(
  segmentId: string,
  startNodeId: string,
  endNodeId: string,
  extra: Partial<RoadSegment> = {}
): RoadSegment {
  return {
    segmentId,
    startNodeId,
    endNodeId,
    width: 8,
    surfaceCondition: 0.9,
    trafficDensity: 0.3,
    speedLimit: 40,
    turnRestrictions: [],
    motorcycleAccessible: true,
    pedestrianDensity: 0.2,
    riskLevel: 0.1,
    oneWay: false,
    divided: false,
    lanes: 2,
    roadType: 'main',
    floodSensitivity: 0.8,
    pickupPractical: true,
    district: 'testloop',
    tags: [],
    ...extra,
  };
}

function makeNetwork(nodes: RoadNode[], segments: RoadSegment[]): RoadNetwork {
  const district: DistrictData = {
    ...(testloopJson as unknown as DistrictData),
    nodes,
    segments,
    pois: [],
  };
  return RoadNetwork.fromDistricts([district]);
}

describe('Medium Batch 2 Audit Fixes (M12 - M23)', () => {
  it('M12: TrafficManager signal/junction hold uses front bumper (distAlongLane + length * 0.5)', () => {
    const nodes = [
      makeNode('A', 0, 0),
      makeNode('B', 100, 0, { signal: true }),
      makeNode('C', 200, 0),
    ];
    const segs = [
      makeSeg('AB', 'A', 'B', { oneWay: true }),
      makeSeg('BC', 'B', 'C', { oneWay: true }),
    ];
    const net = makeNetwork(nodes, segs);
    const tm = new TrafficManager(net, 1);
    const laneGraph = (tm as unknown as {
      laneGraph: { lanes: Map<string, { laneId: string; segmentId: string; lengthM: number; endNodeId: string }> };
    }).laneGraph;
    const lane = Array.from(laneGraph.lanes.values()).find((l) => l.segmentId === 'AB')!;
    const bus: TrafficAgent = {
      id: 'bus_1',
      kind: 'bus',
      laneId: lane.laneId,
      distAlongLane: 0,
      speed: 5,
      desiredSpeed: 10,
      lod: 'near',
      length: 9,
      width: 2.4,
      x: 0,
      z: 0,
      heading: Math.PI / 2,
    };

    vi.spyOn(tm.signals, 'getSignalStatus').mockReturnValue('red');
    const stopPos = lane.lengthM - 5; // STOP_LINE_SETBACK_M = 5

    // Front bumper behind stopPos -> signalHoldsAt returns true
    bus.distAlongLane = stopPos - bus.length * 0.5 - 2.0;
    const signalHoldsAt = (tm as unknown as {
      signalHoldsAt: (a: TrafficAgent, l: typeof lane, s: number) => boolean;
    }).signalHoldsAt.bind(tm);
    expect(signalHoldsAt(bus, lane, stopPos)).toBe(true);

    // Front bumper already past stopPos (center still behind stopPos) -> must NOT freeze mid-junction
    bus.distAlongLane = stopPos - bus.length * 0.5 + 1.0;
    expect(signalHoldsAt(bus, lane, stopPos)).toBe(false);
  });

  it('M13: Walk-mode routing ignores vehicular oneWay, turnRestrictions, and divided U-turn bans', () => {
    const nodes = [makeNode('A', 0, 0), makeNode('B', 100, 0), makeNode('C', 200, 0)];
    const segs = [
      makeSeg('AB', 'A', 'B', { oneWay: true, divided: true, turnRestrictions: ['BC'] }),
      makeSeg('BC', 'B', 'C', { oneWay: true, divided: true }),
    ];
    const graph = new RoutingGraph(nodes, segs);

    expect(graph.route('C', 'A', { mode: 'motorcycle' })).toBeNull();
    expect(graph.route('A', 'C', { mode: 'motorcycle' })).toBeNull();

    const walkBack = graph.route('C', 'A', { mode: 'walk' });
    expect(walkBack).not.toBeNull();
    expect(walkBack?.nodeIds).toEqual(['C', 'B', 'A']);

    const walkFwd = graph.route('A', 'C', { mode: 'walk' });
    expect(walkFwd).not.toBeNull();
    expect(walkFwd?.nodeIds).toEqual(['A', 'B', 'C']);
  });

  it('M14: WeatherSystem separates lightRain from heavyRain flood accumulation and preserves standing water', () => {
    const ws = new WeatherSystem({ initialWeather: 'lightRain' });
    const seg = makeSeg('S1', 'A', 'B', { floodSensitivity: 1.0 });

    for (let i = 0; i < 40; i++) {
      ws.update(1, [seg]);
    }
    const afterLight = ws.getFloodLevel('S1');
    expect(afterLight).toBeGreaterThan(0);
    expect(afterLight).toBeLessThanOrEqual(0.25);
    expect(ws.rainDurationMinutes).toBe(0);

    ws.setWeather('heavyRain');
    ws.update(1, [seg]);
    const afterFirstHeavy = ws.getFloodLevel('S1');
    expect(afterFirstHeavy).toBeGreaterThanOrEqual(afterLight);
    expect(afterFirstHeavy).toBeLessThan(0.5);
  });

  it('M15: Rng keeps state strictly uint32 across next()/getState()/setState() wraparound', () => {
    const rng = new Rng(1);
    rng.setState(0xffffff00);
    const seq1 = [rng.next(), rng.next(), rng.next()];
    const stateMid = rng.getState();
    expect(stateMid).toBeGreaterThanOrEqual(0);
    expect(stateMid).toBeLessThanOrEqual(0xffffffff);

    const restExpected = [rng.next(), rng.next(), rng.next()];

    const restored = new Rng(1);
    restored.setState(stateMid);
    const restActual = [restored.next(), restored.next(), restored.next()];
    expect(restActual).toEqual(restExpected);
    expect(seq1.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  it('M16: Pedestrian isApproaching uses abs(speed) for reversing vehicles and skips corner turn on jaywalk tick', () => {
    const net = makeNetwork(
      [makeNode('A', 0, 0), makeNode('B', 50, 0)],
      [makeSeg('AB', 'A', 'B')]
    );
    const pm = new PedestrianManager(net, 1);
    const isApproaching = (pm as unknown as {
      isApproaching: (
        px: number,
        pz: number,
        v: { x: number; z: number; speed: number; heading?: number },
        timeNeededS: number,
        hazardWindowS: number
      ) => boolean;
    }).isApproaching.bind(pm);
    expect(isApproaching(0, 0, { x: 20, z: 0, speed: -2, heading: Math.PI / 2 }, 2, 2)).toBe(
      false
    );

    const pedSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/sim/traffic/pedestrians.ts'),
      'utf8'
    );
    expect(pedSrc).toContain(
      "(ped.state as string) === 'sidewalk' && ped.distAlongSegment >= segLen"
    );
  });

  it('M17: RoadEventManager checks both directions for two-way closures and avoids arterials for blocked_intersection', () => {
    const nodes = [
      makeNode('A', 0, 0),
      makeNode('B', 100, 0),
      makeNode('C', 50, 50),
    ];
    const segs = [
      makeSeg('AB_two_way', 'A', 'B', { oneWay: false, tags: ['arterial'] }),
      makeSeg('AC_one_way', 'A', 'C', { oneWay: true }),
      makeSeg('CB_one_way', 'C', 'B', { oneWay: true }),
    ];
    const net = makeNetwork(nodes, segs);
    const rem = new RoadEventManager({ seed: 42 });
    rem.setNetwork(net);

    // Force kind === 'closure' by stubbing rng.pick for kinds while keeping segment pick real
    const rng = (rem as unknown as { rng: Rng }).rng;
    const origPick = rng.pick.bind(rng);
    let kindOverride: 'closure' | 'blocked_intersection' = 'closure';
    vi.spyOn(rng, 'pick').mockImplementation(<T,>(arr: T[]): T => {
      if (Array.isArray(arr) && typeof arr[0] === 'string') {
        return kindOverride as unknown as T;
      }
      return origPick(arr);
    });

    for (let i = 0; i < 15; i++) {
      const evt = rem.generateRandomEvent(500 + i);
      if (evt?.segmentId === 'AB_two_way') {
        expect(evt.closesSegment).toBe(false);
      }
      if (evt) rem.removeEvent(evt.id);
    }

    kindOverride = 'blocked_intersection';
    let pickedArterial = 0;
    for (let i = 0; i < 20; i++) {
      const evt = rem.generateRandomEvent(600 + i);
      if (evt?.segmentId === 'AB_two_way') pickedArterial++;
      if (evt) rem.removeEvent(evt.id);
    }
    expect(pickedArterial).toBe(0);
  });

  it('M18: AutopilotController releases brake when stopped and MapViewer clamps positive scale', () => {
    const net = RoadNetwork.fromDistricts([testloopJson as unknown as DistrictData]);
    const auto = new AutopilotController(net);
    auto.setEnabled(true);
    const n1 = net.getNode('N1')!;
    auto.setDestination(n1.x, n1.z, 'N1');
    const stoppedBike = {
      ...createDefaultBikeState(),
      x: n1.x,
      z: n1.z,
      speed: 0.1,
    };
    const input = auto.step(stoppedBike);
    expect(input.brake).toBe(0);
    expect(input.throttle).toBe(0);

    const mvSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/debug/mapViewer.ts'),
      'utf8'
    );
    expect(mvSrc).toContain('Math.max(1, this.canvas.width - margin * 2)');
    expect(mvSrc).toContain('Math.max(0.01, Math.min(availableW / w, availableH / h) * 0.9)');
  });

  it('M19: RoadMeshBuilder bakes speed bump rotation before scaling so height <= 0.25m', () => {
    const district: DistrictData = {
      ...(testloopJson as unknown as DistrictData),
      segments: [
        {
          ...(testloopJson as unknown as DistrictData).segments[0]!,
          tags: ['speed_bump'],
        },
      ],
    };
    const result = new RoadMeshBuilder().build(district);
    let bumpMesh: THREE.Mesh | undefined;
    result.group.traverse((o) => {
      if (
        !bumpMesh &&
        o instanceof THREE.Mesh &&
        o.geometry instanceof THREE.CylinderGeometry
      ) {
        bumpMesh = o;
      }
    });
    expect(bumpMesh).toBeDefined();
    bumpMesh!.geometry.computeBoundingBox();
    const size = new THREE.Vector3();
    bumpMesh!.geometry.boundingBox!.getSize(size);
    expect(size.y).toBeLessThanOrEqual(0.25);
    expect(size.x).toBeGreaterThan(2.0);
    expect(bumpMesh!.scale.y).toBe(1);
  });

  it('M20: Renderer skyDome renders first with depthTest=false and frustumCulled=false', () => {
    const rendererSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/render/Renderer.ts'),
      'utf8'
    );
    expect(rendererSrc).toContain('depthTest: false');
    expect(rendererSrc).toContain('this.skyDome.renderOrder = -1000');
    expect(rendererSrc).toContain('this.skyDome.frustumCulled = false');
  });

  it('M21: AssetManager aborts preloadCore cleanly if dispose() runs mid-flight', async () => {
    const am = new AssetManager();
    const initSpy = vi.spyOn(am, 'init').mockImplementation(async () => {
      am.dispose();
    });
    const loadSpy = vi.spyOn(am, 'loadModel');
    await am.preloadCore();
    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(loadSpy).not.toHaveBeenCalled();
    expect(am.isInitialized()).toBe(false);
    am.dispose();
  });

  it('M22: Minimap AABB culling keeps long diagonal segments crossing player and culls off-screen segments', () => {
    const nodes = [
      makeNode('SW', -500, -500),
      makeNode('NE', 500, 500),
      makeNode('E1', 500, 0),
      makeNode('E2', 500, 10),
    ];
    const segs = [
      makeSeg('DIAG', 'SW', 'NE'),
      makeSeg('EAST', 'E1', 'E2'),
    ];
    const net = makeNetwork(nodes, segs);
    const minimap = new Minimap(net, { size: 160, viewRadiusM: 100 });

    const moveToCalls: Array<[number, number]> = [];
    const fakeCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      closePath: vi.fn(),
      moveTo: (x: number, y: number) => moveToCalls.push([x, y]),
      lineTo: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: '',
      textBaseline: '',
    } as unknown as CanvasRenderingContext2D;
    Object.defineProperty(minimap, 'ctx', { value: fakeCtx });

    minimap.update({ x: 0, z: 0, heading: 0 });
    // Diagonal segment (-500,-500)->(500,500) is drawn (negative coords); East segment (x=500, z=0) is culled
    expect(moveToCalls.some(([x, y]) => x < -100 && y < -100)).toBe(true);
    expect(moveToCalls.some(([x, y]) => x > 100 && Math.abs(y) < 1)).toBe(false);
  });

  it('M23: WeatherFx.setRainCount disposes old BufferGeometry on upgrade and Renderer resets state on reload', () => {
    const scene = new THREE.Scene();
    const fx = new WeatherFx(scene, { rainCount: 100 });
    const oldRainGeo = (fx as unknown as { rainGeometry: THREE.BufferGeometry }).rainGeometry;
    const oldSplashGeo = (fx as unknown as { splashGeometry: THREE.BufferGeometry }).splashGeometry;
    const rainDispose = vi.spyOn(oldRainGeo, 'dispose');
    const splashDispose = vi.spyOn(oldSplashGeo, 'dispose');

    fx.setRainCount(500);
    expect(rainDispose).toHaveBeenCalledTimes(1);
    expect(splashDispose).toHaveBeenCalledTimes(1);
    fx.dispose();

    const rendererSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/render/Renderer.ts'),
      'utf8'
    );
    expect(rendererSrc).toContain('bldgMat.dispose();');
    expect(rendererSrc).toContain('this.worldEventRenderer.clear();');
  });
});
