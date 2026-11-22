import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { PhysicsWorld } from '../../../src/physics/PhysicsWorld';
import { MotorcycleController } from '../../../src/physics/MotorcycleController';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { SIM_DT } from '../../../src/config/constants';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import { isWrongWayOnRoute, nextInstruction } from '../../../src/sim/road/navigation';
import { PedestrianManager } from '../../../src/sim/traffic/pedestrians';
import { CityBuilder } from '../../../src/render/CityBuilder';
import { PeopleRenderer } from '../../../src/render/people';
import { buildMultiMaterialPrototype, createCarMesh } from '../../../src/render/vehicles';
import { ensureLocaleLoaded, setLanguage } from '../../../src/ui/i18n';
import { isBlockingChoice } from '../../../src/ui/gamepadNav';
import { handleChoiceCardKeyDown } from '../../../src/ui/choice/ChoiceCard';
import {
  choiceSignal,
  garageSignal,
  phoneSignal,
  screenSignal,
} from '../../../src/ui/store';
import { mapLayout } from '../../../src/ui/map/mapLayout';
import type { DistrictData, WorldData } from '../../../src/sim/schemas';
import type { RoadNode } from '../../../src/core/types';
import worldJson from '../../../data/world.json';
import puranparaJson from '../../../data/districts/puranpara.json';
import mohakhalJson from '../../../data/districts/mohakhal.json';
import mirparaJson from '../../../data/districts/mirpara.json';

describe('High Batch 3 Audit Fixes (#20 - #29)', () => {
  beforeEach(() => {
    screenSignal.value = 'game';
    garageSignal.value = { ...garageSignal.value, open: false };
    phoneSignal.value = { ...phoneSignal.value, open: false };
    choiceSignal.value = {
      active: false,
      prompt: '',
      options: [],
    };
  });

  it('#20 & #21: dynamic push-out respects static walls and collision debounce emits escalated crash', async () => {
    const world = await PhysicsWorld.create();
    // Static wall at x = 2.0 (halfX = 0.5 => left face at x = 1.5)
    world.addStaticBox(2.0, 1.0, 0, 0.5, 2.0, 10.0, 0, 'building');
    // Dynamic vehicle overlapping from the right, pushing bike toward +X wall
    world.upsertDynamicVehicle({
      id: 'bus_1',
      kind: 'bus',
      x: 0.4,
      z: 0,
      halfX: 1.2,
      halfZ: 3.0,
      minY: 0,
      maxY: 3.0,
      yaw: 0,
      vx: 0,
      vz: 0,
    });

    const bus = new EventBus<GameEvents>();
    const events: string[] = [];
    bus.on('bike/collision', (ev) => events.push(ev.severity));

    const ctrl = new MotorcycleController({
      world,
      bus,
      initialPose: { x: 1.0, z: 0, heading: 0 },
    });

    // Step 1: pushed toward +X must not tunnel into the wall (x + radius <= 1.5 + epsilon)
    const dryEnv = { wet: false, surface: 1, hasPassenger: false, conditionPct: 100 };
    ctrl.update({ throttle: 0, brake: 0, steer: 0 }, dryEnv, SIM_DT);
    expect(ctrl.state.x).toBeLessThanOrEqual(1.18);

    // #21: static scuff followed within 0.1s by a high-speed crash must emit 'crash'
    const world2 = await PhysicsWorld.create();
    world2.addStaticBox(0, 1.0, 5.0, 10, 2.0, 0.5, 0, 'building');
    world2.addStaticBox(-1.5, 1.0, 0, 0.25, 2.0, 10.0, 0, 'kerb');
    const bus2 = new EventBus<GameEvents>();
    const sevs: string[] = [];
    bus2.on('bike/collision', (ev) => sevs.push(ev.severity));
    const ctrl2 = new MotorcycleController({
      world: world2,
      bus: bus2,
      initialPose: { x: -0.9, z: 0, heading: 0 },
    });
    // Minor sideways scuff into side_kerb
    ctrl2.state.x = -0.92;
    ctrl2.state.speed = 1.0;
    ctrl2.update({ throttle: 0, brake: 0, steer: 0.5 }, dryEnv, SIM_DT);
    // Immediately crash head-on into wall_ahead within debounce window
    ctrl2.state.x = 0;
    ctrl2.state.z = 4.05;
    ctrl2.state.heading = 0;
    ctrl2.state.speed = 14; // ~50 km/h > 25 km/h
    ctrl2.update({ throttle: 1, brake: 0, steer: 0 }, dryEnv, SIM_DT);
    expect(sevs).toContain('crash');
  });

  it('#22: nearestMotorcycleNode skips pedestrian-only nodes and prefers ground over flyover', () => {
    const road = RoadNetwork.fromDistricts([
      puranparaJson as DistrictData,
      mohakhalJson as DistrictData,
    ]);

    // Near puranpara_alley_gate_6 (pedestrian-only node)
    const gate = road.getNode('puranpara_alley_gate_6');
    expect(gate).toBeDefined();
    const snapped = road.nearestMotorcycleNode(gate!.x, gate!.z, 0);
    expect(snapped).not.toBeNull();
    expect(road.isMotorcycleNode(snapped!.nodeId)).toBe(true);
    expect(snapped!.nodeId).not.toBe('puranpara_alley_gate_6');

    // Directly under mohakhal_fly_mid (y=6): ground bike (y=0) must not snap to flyover node
    const flyMid = road.getNode('mohakhal_fly_mid');
    expect(flyMid).toBeDefined();
    const groundSnap = road.nearestMotorcycleNode(flyMid!.x, flyMid!.z, 0);
    expect(groundSnap).not.toBeNull();
    expect(groundSnap!.y ?? 0).toBeLessThanOrEqual(2.5);
  });

  it('#23: navigation locate() handles U-turn/backtracking routes using heading', () => {
    const nodes = new Map<string, RoadNode>([
      ['A', { nodeId: 'A', x: 0, z: 0, kind: 'junction' }],
      ['B', { nodeId: 'B', x: 0, z: 100, kind: 'junction' }],
      ['C', { nodeId: 'C', x: 100, z: 0, kind: 'junction' }],
    ]);
    const route = {
      nodeIds: ['A', 'B', 'A', 'C'],
      segmentIds: ['AB', 'BA', 'AC'],
      lengthM: 300,
      virtualKm: 0.3,
      etaMin: 1,
      uTurns: 1,
    };
    // Riding back from B toward A (heading = Math.PI, -Z direction) on leg 1 (B->A)
    const pose = { x: 0, z: 50, heading: Math.PI };
    expect(isWrongWayOnRoute(route, nodes, pose.x, pose.z, pose.heading)).toBe(false);
    const instr = nextInstruction(route, pose, nodes);
    expect(instr?.kind).not.toBe('uturn');
  });

  it('#24: pedestrians do not ping-pong at crossings and honking does not leak road workers', () => {
    const road = RoadNetwork.fromDistricts([mirparaJson as DistrictData]);
    const pm = new PedestrianManager(road, 42);
    const crossingNodeId = Array.from(
      (pm as unknown as { crossingNodeIds: Set<string> }).crossingNodeIds
    )[0]!;
    const seg = road
      .getSegments()
      .find((s) => s.startNodeId === crossingNodeId || s.endNodeId === crossingNodeId)!;
    const sNode = road.getNode(seg.startNodeId)!;
    const eNode = road.getNode(seg.endNodeId)!;
    const segLen = Math.hypot(eNode.x - sNode.x, eNode.z - sNode.z);
    const atEnd = seg.endNodeId === crossingNodeId;

    // Seed a single pedestrian finishing a boundary crossing
    const peds = (pm as unknown as { pedestrians: Map<string, Record<string, unknown>> }).pedestrians;
    peds.clear();
    peds.set('ped_test', {
      id: 'ped_test',
      x: atEnd ? eNode.x : sNode.x,
      z: atEnd ? eNode.z : sNode.z,
      heading: 0,
      speed: 1.5,
      state: 'crossing',
      segmentId: seg.segmentId,
      distAlongSegment: atEnd ? segLen : 0,
      lateralOffset: 4,
      side: 'left',
      direction: atEnd ? 1 : -1,
      crossingProgress: 0.99,
      crossingFromOffset: -4,
      crossingToOffset: 4,
      lod: 'near',
    });

    // Step enough frames to complete crossing and walk past boundary
    for (let i = 0; i < 10; i++) {
      pm.update(0.1, { x: 9999, z: 9999, speed: 0 });
    }
    expect(peds.get('ped_test')?.state).toBe('sidewalk');

    // Road workers ignore horn and clear cleanly by originSegmentId
    const workers = pm.spawnRoadWorkers(seg.segmentId, 2);
    expect(workers.length).toBe(2);
    const affected = pm.triggerHorn({ x: workers[0]!.x, z: workers[0]!.z }, 20);
    expect(affected).toBe(0);
    expect(workers[0]!.state).toBe('road_worker');
    pm.clearRoadWorkers(seg.segmentId);
    expect(pm.hasRoadWorkers(seg.segmentId)).toBe(false);
  });

  it('#25: CityBuilder in world mode uses worldNodesMap so cross-district connectors trim kerbs', () => {
    const world = worldJson as WorldData;
    const mirpara = mirparaJson as DistrictData;
    const mohakhal = mohakhalJson as DistrictData;
    const cb = new CityBuilder();
    const sliceSpy = vi.spyOn(
      (cb as unknown as { roadBuilder: { createSliceContext: (...args: unknown[]) => unknown } }).roadBuilder,
      'createSliceContext'
    );
    cb.initWorldStreaming(world, (id) =>
      id === 'mirpara' ? mirpara : id === 'mohakhal' ? mohakhal : undefined
    );
    while (cb.getBuildQueueLength() > 0) {
      cb.update({ x: 300, z: 300 }, 250, 100);
    }
    expect(sliceSpy).toHaveBeenCalled();
    const [, passedNodeMap, passedTrimSegs] = sliceSpy.mock.calls[0] as [
      unknown,
      Map<string, RoadNode>,
      unknown[],
    ];
    expect(passedNodeMap.size).toBeGreaterThan(mirpara.nodes.length);
    expect(passedTrimSegs.length).toBeGreaterThan(mirpara.segments.length);
    cb.dispose();
  });

  it('#26: buildMultiMaterialPrototype disposes source meshes and PeopleRenderer.dispose disposes InstancedMeshes', () => {
    const carRoot = createCarMesh();
    const sourceGeos: THREE.BufferGeometry[] = [];
    carRoot.traverse((c) => {
      if (c instanceof THREE.Mesh && c.geometry) sourceGeos.push(c.geometry);
    });
    const disposeSpies = sourceGeos.map((g) => vi.spyOn(g, 'dispose'));

    const proto = buildMultiMaterialPrototype(carRoot);
    expect(proto.geometry.userData?.shared).toBeUndefined();
    for (const spy of disposeSpies) {
      expect(spy).toHaveBeenCalled();
    }

    const people = new PeopleRenderer();
    const instanced: THREE.InstancedMesh[] = [];
    people.root.traverse((o) => {
      if (o instanceof THREE.InstancedMesh) instanced.push(o);
    });
    const instDisposes = instanced.map((m) => vi.spyOn(m, 'dispose'));
    people.dispose();
    for (const spy of instDisposes) {
      expect(spy).toHaveBeenCalledTimes(1);
    }
  });

  it('#27: vite.config.ts precaches locale-en and i18n clears rejected locale promise', async () => {
    const viteCfg = fs.readFileSync(path.resolve('vite.config.ts'), 'utf-8');
    expect(viteCfg).not.toContain('**/locale-en-*.js');

    // setLanguage('en') must not throw/unhandled-reject even if fetch fails
    setLanguage('en');
    await expect(ensureLocaleLoaded('en')).resolves.toBeDefined();
  });

  it('#28: inline ChoiceCard does not block modals and ignores 1-4 keys while Garage/Phone open', () => {
    choiceSignal.value = {
      active: true,
      prompt: 'encounter.tea.prompt',
      presentation: 'inline',
      instanceId: 'inst_1',
      options: [{ id: 'buy', text: 'Tea' }],
    };
    expect(isBlockingChoice()).toBe(false);

    const chosen = vi.fn();
    garageSignal.value = { ...garageSignal.value, open: true };
    handleChoiceCardKeyDown(
      { key: '1', preventDefault: vi.fn() } as unknown as KeyboardEvent,
      choiceSignal.value,
      chosen
    );
    expect(chosen).not.toHaveBeenCalled();

    garageSignal.value = { ...garageSignal.value, open: false };
    phoneSignal.value = { ...phoneSignal.value, open: true };
    handleChoiceCardKeyDown(
      { key: '1', preventDefault: vi.fn() } as unknown as KeyboardEvent,
      choiceSignal.value,
      chosen
    );
    expect(chosen).not.toHaveBeenCalled();
  });

  it('#29: mapLayout returns strictly positive scale on short mobile landscape viewports', () => {
    const bounds = { minX: -300, minZ: -300, spanX: 1800, spanZ: 1800 };
    for (const [w, h, dpr] of [
      [740, 180, 1],
      [640, 150, 2],
      [667, 160, 1],
    ] as const) {
      const res = mapLayout(w, h, dpr, bounds, 1);
      expect(res.scale).toBeGreaterThan(0);
      expect(Number.isFinite(res.offsetX)).toBe(true);
      expect(Number.isFinite(res.offsetZ)).toBe(true);
    }
  });
});
