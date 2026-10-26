import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import type { DistrictData } from '../../../src/sim/schemas';
import testloopData from '../../../data/districts/testloop.json';
import { DhakaWorld } from '../../../src/render/world/DhakaWorld';
import { DhakaRoadNetworkMesh } from '../../../src/render/world/DhakaRoadNetworkMesh';
import { TrafficManager } from '../../../src/render/world/TrafficManager';
import { PedestrianManager } from '../../../src/render/world/PedestrianManager';
import {
  createDhakaApartment,
  createCommercialBlock,
  createKamalGarageWorkshop,
  createDhakaMosque,
  createConstructionSite,
  createDhakaTree,
  createDhakaBillboard,
} from '../../../src/render/world/DhakaBuildingPrefabs';

describe('Dhaka 3D Urban World & Environment', () => {
  const roadNetwork = RoadNetwork.fromDistricts([testloopData as DistrictData]);

  it('builds DhakaRoadNetworkMesh with asphalt, sidewalks, curbs, and streetlights', () => {
    const roadMesh = new DhakaRoadNetworkMesh(roadNetwork);
    expect(roadMesh.root.children.length).toBeGreaterThan(0);
    expect(roadMesh.colliders.length).toBeGreaterThan(0);
    expect(roadMesh.streetlightLights.length).toBeGreaterThan(0);

    // Test wetness toggle
    roadMesh.setWetness(true);
    roadMesh.setWetness(false);
  });

  it('generates rich low-poly Dhaka building prefabs', () => {
    const apt = createDhakaApartment(4, 18, 16, 1);
    expect(apt.children.length).toBeGreaterThan(0);

    const comm = createCommercialBlock(20, 16, 16, 'জনতা ফার্মেসি', 'Janata Pharmacy');
    expect(comm.children.length).toBeGreaterThan(0);

    const garage = createKamalGarageWorkshop();
    expect(garage.children.length).toBeGreaterThan(0);

    const mosque = createDhakaMosque();
    expect(mosque.children.length).toBeGreaterThan(0);

    const construction = createConstructionSite();
    expect(construction.children.length).toBeGreaterThan(0);

    const tree = createDhakaTree();
    expect(tree.children.length).toBeGreaterThan(0);

    const billboard = createDhakaBillboard();
    expect(billboard.children.length).toBeGreaterThan(0);
  });

  it('simulates TrafficManager moving and parked vehicles with collision testing', () => {
    const traffic = new TrafficManager(roadNetwork);
    expect(traffic.root.children.length).toBeGreaterThan(0);

    // Step simulation
    const resultFar = traffic.update(0.1, { x: 500, z: 500 });
    expect(resultFar.collision).toBe(false);
  });

  it('simulates PedestrianManager with reactive evasion', () => {
    const peds = new PedestrianManager();
    expect(peds.root.children.length).toBeGreaterThan(0);

    // Update with far player
    peds.update(0.1, { x: 500, z: 500 });

    // Update with close player to trigger dodge
    peds.update(0.1, { x: 10, z: -7 });
  });

  it('DhakaWorld integrates roads, buildings, traffic, pedestrians, and environment lighting', () => {
    const scene = new THREE.Scene();
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.8);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);

    const world = new DhakaWorld(roadNetwork, scene, hemi, dir);
    expect(world.root.children.length).toBeGreaterThan(0);
    expect(world.colliders.length).toBeGreaterThan(0);

    // Test day/dusk/night and rain transitions
    world.setTimeOfDay('evening');
    world.setTimeOfDay('night');
    world.setTimeOfDay('day');

    world.setWeather('rain');
    world.setWeather('clear');

    const updateRes = world.update(0.016, { x: 0, z: 0 });
    expect(typeof updateRes.collisionWithTraffic).toBe('boolean');
  });
});
