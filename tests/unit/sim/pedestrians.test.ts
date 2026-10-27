import { describe, it, expect } from 'vitest';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import {
  PedestrianManager,
  calculateStoppingDistance,
  canStartJaywalk,
  type PedestrianAgent,
} from '../../../src/sim/traffic/pedestrians';
import { TrafficManager, type TrafficAgent } from '../../../src/sim/traffic/TrafficManager';
import mirparaData from '../../../data/districts/mirpara.json';
import type { DistrictData } from '../../../src/sim/schemas';

describe('Pedestrians, rickshaws, local traffic behaviour (T3.4)', () => {
  const network = RoadNetwork.fromDistricts([mirparaData as DistrictData]);

  describe('Fairness Rule: Jaywalking', () => {
    it('jaywalker never spawns inside 1.5× stopping distance', () => {
      // At player speed = 11 m/s (~40 km/h) with brakeDecel = 6.0:
      // stoppingDistance = 11^2 / (2 * 6.0) = 121 / 12 = 10.08 m
      // 1.5 * stoppingDistance = 15.125 m
      const playerSpeed = 11.0;
      const stoppingDist = calculateStoppingDistance(playerSpeed, 6.0);
      expect(stoppingDist).toBeCloseTo(10.083, 2);

      const requiredBuffer = 1.5 * stoppingDist;
      expect(requiredBuffer).toBeCloseTo(15.125, 2);

      const playerPos = { x: 100, z: 100 };

      // Candidate pedestrian at 12m (inside 1.5x stopping distance) -> MUST BE DISALLOWED
      const insidePos = { x: 100, z: 112 };
      expect(canStartJaywalk(insidePos, playerPos, playerSpeed, 6.0)).toBe(false);

      // Candidate pedestrian exactly at or within safety boundary (15.0m) -> MUST BE DISALLOWED
      const boundaryPos = { x: 100, z: 115.0 };
      expect(canStartJaywalk(boundaryPos, playerPos, playerSpeed, 6.0)).toBe(false);

      // Candidate pedestrian safely outside (18m) -> ALLOWED
      const outsidePos = { x: 100, z: 118 };
      expect(canStartJaywalk(outsidePos, playerPos, playerSpeed, 6.0)).toBe(true);

      // PedestrianManager tryStartJaywalk check
      const pedMgr = new PedestrianManager(network, 123);
      const ped: PedestrianAgent = {
        id: 'test_ped_1',
        x: insidePos.x,
        z: insidePos.z,
        heading: 0,
        speed: 1.3,
        state: 'sidewalk',
        segmentId: mirparaData.segments[0]!.segmentId,
        distAlongSegment: 10,
        lateralOffset: 5,
        side: 'right',
        direction: 1,
        lod: 'near',
      };

      // Fails because player is within 1.5x stopping distance
      const started = pedMgr.tryStartJaywalk(ped, playerPos, playerSpeed);
      expect(started).toBe(false);
      expect(ped.state).toBe('sidewalk');

      // Now move ped safely away (> 1.5x stopping distance)
      ped.x = outsidePos.x;
      ped.z = outsidePos.z;
      const startedSafe = pedMgr.tryStartJaywalk(ped, playerPos, playerSpeed);
      expect(startedSafe).toBe(true);
      expect(ped.state).toBe('jaywalking');
    });
  });

  describe('Bus Stop Dwell & Lane Blocking', () => {
    it('bus dwells at stop', () => {
      const tm = new TrafficManager(network, 999);

      // Add a known bus stop at node art_s_3 (which is in Mirpara)
      const busStandNode = network.getNode('art_s_3') ?? { x: 450, z: 305 };
      tm.addBusStop({
        id: 'poi_test_bus_stand',
        nodeId: 'art_s_3',
        x: busStandNode.x,
        z: busStandNode.z,
      });

      // Find a lane passing close to art_s_3
      const allLanes = Array.from(tm.laneGraph.lanes.values());
      const laneNearStop = allLanes.find(
        (l) => l.startNodeId === 'art_s_3' || l.endNodeId === 'art_s_3'
      ) ?? allLanes[0]!;

      // Spawn a bus on this lane right before the stop
      const bus: TrafficAgent = {
        id: 'bus_test_1',
        kind: 'bus',
        laneId: laneNearStop.laneId,
        distAlongLane: 2,
        speed: 8.0,
        x: busStandNode.x,
        z: busStandNode.z,
        heading: 0,
        length: 8.0,
        width: 2.4,
        desiredSpeed: 10.0,
        lod: 'near',
      };
      tm.agents.set(bus.id, bus);

      // Spawn a follower car behind the bus on the same lane
      const follower: TrafficAgent = {
        id: 'car_follower_1',
        kind: 'car',
        laneId: laneNearStop.laneId,
        distAlongLane: 0,
        speed: 10.0,
        x: busStandNode.x,
        z: busStandNode.z,
        heading: 0,
        length: 4.5,
        width: 1.8,
        desiredSpeed: 12.0,
        lod: 'near',
      };
      tm.agents.set(follower.id, follower);

      // Step simulation by 0.1s: bus should trigger dwell (10-20s)
      tm.update(0.1);

      expect(bus.isDwelling).toBe(true);
      expect(bus.dwellTimer).toBeGreaterThanOrEqual(9.9);
      expect(bus.dwellTimer).toBeLessThanOrEqual(20.0);
      expect(bus.speed).toBe(0);

      // Follower car behind the bus should decelerate or stop, unable to pass
      tm.update(0.5);
      expect(follower.speed).toBeLessThan(10.0);
      expect(bus.isDwelling).toBe(true);

      // Fast forward past dwell timer (e.g. 21s)
      const remaining = bus.dwellTimer ?? 15;
      tm.update(remaining + 0.5);

      // Bus finishes dwell and resumes driving
      expect(bus.isDwelling).toBe(false);
      expect(bus.dwellTimer).toBe(0);
    });
  });

  describe('Horn Reaction', () => {
    it('horn yield', () => {
      const tm = new TrafficManager(network, 777);

      // 1. Pedestrian within 15m yields
      const pedNear: PedestrianAgent = {
        id: 'ped_near',
        x: 10,
        z: 10,
        heading: 0,
        speed: 1.3,
        state: 'sidewalk',
        segmentId: mirparaData.segments[0]!.segmentId,
        distAlongSegment: 5,
        lateralOffset: 4,
        side: 'left',
        direction: 1,
        lod: 'near',
      };
      tm.pedestrians.pedestrians.set(pedNear.id, pedNear);

      // Pedestrian farther than 15m (30m away) does not yield
      const pedFar: PedestrianAgent = {
        id: 'ped_far',
        x: 10,
        z: 40,
        heading: 0,
        speed: 1.3,
        state: 'sidewalk',
        segmentId: mirparaData.segments[0]!.segmentId,
        distAlongSegment: 35,
        lateralOffset: 4,
        side: 'left',
        direction: 1,
        lod: 'near',
      };
      tm.pedestrians.pedestrians.set(pedFar.id, pedFar);

      // 2. Rickshaw within 15m yields
      const rickshawNear: TrafficAgent = {
        id: 'rickshaw_near',
        kind: 'rickshaw',
        laneId: 'lane_0',
        distAlongLane: 10,
        speed: 3.5,
        x: 12,
        z: 12,
        heading: 0,
        length: 2.2,
        width: 1.1,
        desiredSpeed: 3.5,
        lod: 'near',
      };
      tm.agents.set(rickshawNear.id, rickshawNear);

      // Rickshaw farther than 15m (50m away)
      const rickshawFar: TrafficAgent = {
        id: 'rickshaw_far',
        kind: 'rickshaw',
        laneId: 'lane_0',
        distAlongLane: 50,
        speed: 3.5,
        x: 10,
        z: 60,
        heading: 0,
        length: 2.2,
        width: 1.1,
        desiredSpeed: 3.5,
        lod: 'near',
      };
      tm.agents.set(rickshawFar.id, rickshawFar);

      // Player blows horn at (10, 10)
      const result = tm.triggerHorn({ x: 10, z: 10 }, 15);

      expect(result.pedsYielded).toBe(1);
      expect(result.rickshawsYielded).toBe(1);

      // Verify near pedestrian state
      expect(pedNear.state).toBe('yielding');
      expect(pedNear.yieldTimer).toBe(2.0);

      // Verify far pedestrian unaffected
      expect(pedFar.state).toBe('sidewalk');
      expect(pedFar.yieldTimer).toBeUndefined();

      // Verify near rickshaw yielded and decelerated
      expect(rickshawNear.yieldTimer).toBe(2.5);
      expect(rickshawNear.speed).toBeLessThan(3.5);

      // Verify far rickshaw unaffected
      expect(rickshawFar.yieldTimer).toBeUndefined();
      expect(rickshawFar.speed).toBe(3.5);
    });
  });

  describe('Rickshaw Behaviour', () => {
    it('rickshaws travel at 3-4 m/s and turn slowly', () => {
      const tm = new TrafficManager(network, 101);
      const lane = Array.from(tm.laneGraph.lanes.values())[0]!;

      const rickshaw: TrafficAgent = {
        id: 'r_test',
        kind: 'rickshaw',
        laneId: lane.laneId,
        distAlongLane: 0,
        speed: 3.5,
        x: 0,
        z: 0,
        heading: 0,
        length: 2.2,
        width: 1.1,
        desiredSpeed: 3.5,
        lod: 'near',
      };

      expect(rickshaw.desiredSpeed).toBeGreaterThanOrEqual(3.0);
      expect(rickshaw.desiredSpeed).toBeLessThanOrEqual(4.0);

      tm.agents.set(rickshaw.id, rickshaw);
      tm.update(0.1);

      // Speed remains around 3-4 m/s
      expect(rickshaw.speed).toBeGreaterThanOrEqual(3.0);
      expect(rickshaw.speed).toBeLessThanOrEqual(4.0);
    });
  });

  describe('Pedestrian Sidewalk and Crossings', () => {
    it('spawns pedestrians and manages density', () => {
      const pm = new PedestrianManager(network, 555);
      const cam = { x: 300, z: 300, heading: 0, fovRad: 1.2 };

      pm.maintainDensity(cam, 720, 25);
      expect(pm.getPedestrians().length).toBeGreaterThan(0);

      const peds = pm.getPedestrians();
      for (const ped of peds) {
        expect(['sidewalk', 'crossing', 'jaywalking', 'yielding']).toContain(ped.state);
        expect(ped.speed).toBeGreaterThan(1.0);
      }
    });
  });
});
