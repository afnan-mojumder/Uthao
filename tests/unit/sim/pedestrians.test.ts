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
import puranparaData from '../../../data/districts/puranpara.json';
import type { DistrictData } from '../../../src/sim/schemas';
import type { RoadNode, RoadSegment } from '../../../src/core/types';

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

    it('turns corners onto adjacent sidewalk segments instead of reversing at non-crossing junctions', () => {
      const nodes: RoadNode[] = [
        { nodeId: 'A', x: 0, z: 0, kind: 'junction' },
        { nodeId: 'B', x: 50, z: 0, kind: 'junction' },
        { nodeId: 'C', x: 50, z: 50, kind: 'junction' },
      ];
      const mkSeg = (id: string, a: string, b: string): RoadSegment => ({
        segmentId: id,
        startNodeId: a,
        endNodeId: b,
        width: 8,
        surfaceCondition: 1,
        trafficDensity: 0.3,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.5,
        riskLevel: 0,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'residential',
        floodSensitivity: 0,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      });
      const cornerNet = RoadNetwork.fromDistricts([
        { districtId: 'testloop', name: { bn: 'x', en: 'x' }, nodes, segments: [mkSeg('AB', 'A', 'B'), mkSeg('BC', 'B', 'C')], pois: [] },
      ]);
      const pm = new PedestrianManager(cornerNet, 11);
      const ped: PedestrianAgent = {
        id: 'corner_ped',
        x: 45,
        z: 5.2,
        heading: Math.PI / 2,
        speed: 1.4,
        state: 'sidewalk',
        segmentId: 'AB',
        distAlongSegment: 45,
        lateralOffset: 5.2,
        side: 'right',
        direction: 1,
        lod: 'near',
      };
      pm.pedestrians.set(ped.id, ped);

      for (let i = 0; i < 60; i++) pm.update(0.1);
      expect(ped.segmentId).toBe('BC');
      expect(ped.x).toBeLessThan(50);
      expect(ped.z).toBeGreaterThan(5);
    });

    it('completes crossing forward when past midpoint and a vehicle approaches', () => {
      const nodes: RoadNode[] = [
        { nodeId: 'W', x: -50, z: 0, kind: 'junction' },
        { nodeId: 'C', x: 0, z: 0, kind: 'junction', tags: ['crossing'] },
        { nodeId: 'E', x: 50, z: 0, kind: 'junction' },
      ];
      const mkSeg = (id: string, a: string, b: string): RoadSegment => ({
        segmentId: id,
        startNodeId: a,
        endNodeId: b,
        width: 8,
        surfaceCondition: 1,
        trafficDensity: 0.3,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.5,
        riskLevel: 0,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      });
      const net = RoadNetwork.fromDistricts([
        { districtId: 'testloop', name: { bn: 'x', en: 'x' }, nodes, segments: [mkSeg('WC', 'W', 'C'), mkSeg('CE', 'C', 'E')], pois: [] },
      ]);
      const pm = new PedestrianManager(net, 1);
      const ped: PedestrianAgent = {
        id: 'halfway',
        x: 0,
        z: 1.0,
        heading: 0,
        speed: 1.3,
        state: 'crossing',
        segmentId: 'WC',
        distAlongSegment: 50,
        lateralOffset: 1.0,
        side: 'left',
        direction: 1,
        crossingProgress: 0.65,
        crossingFromOffset: -5.2,
        crossingToOffset: 5.2,
        lod: 'near',
      };
      pm.pedestrians.set(ped.id, ped);

      const vehicles = new Map([['car', { x: -18, z: -2, heading: Math.PI / 2, speed: 10 }]]);
      for (let i = 0; i < 40; i++) pm.update(0.1, undefined, undefined, vehicles);

      expect(ped.state).toBe('sidewalk');
      expect(ped.lateralOffset).toBeCloseTo(5.2, 4);
      expect(ped.side).toBe('right');
    });

    it('expands jaywalk safety margin when the road is wet', () => {
      const pedMgr = new PedestrianManager(network, 123);
      const playerPos = { x: 100, z: 100 };
      const playerSpeed = 11.0; // dry 1.5*stop = 15.125m; wet (4.4 m/s^2) 1.5*stop = 20.625m
      const ped: PedestrianAgent = {
        id: 'wet_ped',
        x: 100,
        z: 117, // 17m away: safe when dry, unsafe when wet!
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

      expect(canStartJaywalk({ x: ped.x, z: ped.z }, playerPos, playerSpeed, 6.0, false)).toBe(true);
      expect(canStartJaywalk({ x: ped.x, z: ped.z }, playerPos, playerSpeed, 6.0, true)).toBe(false);
      expect(pedMgr.tryStartJaywalk(ped, playerPos, playerSpeed, true)).toBe(false);
      expect(ped.state).toBe('sidewalk');
    });

    it('keeps alley pedestrians near alley edge rather than inside adjacent buildings', () => {
      const puranNet = RoadNetwork.fromDistricts([puranparaData as DistrictData]);
      const alleySeg = puranNet.getAllSegments().find((s) => s.roadType === 'alley')!;
      const alleyOnlyNet = RoadNetwork.fromDistricts([
        {
          districtId: 'puranpara',
          name: { bn: 'x', en: 'x' },
          nodes: [puranNet.getNode(alleySeg.startNodeId)!, puranNet.getNode(alleySeg.endNodeId)!],
          segments: [alleySeg],
          pois: [],
        },
      ]);
      const sNode = alleyOnlyNet.getNode(alleySeg.startNodeId)!;
      const pm = new PedestrianManager(alleyOnlyNet, 77);
      pm.maintainDensity({ x: sNode.x + 25, z: sNode.z, heading: 0, fovRad: 1.2 }, 720, 10);
      const peds = pm.getPedestrians();
      expect(peds.length).toBeGreaterThan(0);
      for (const ped of peds) {
        expect(Math.abs(ped.lateralOffset)).toBeLessThanOrEqual(alleySeg.width / 2 + 0.5);
      }
    });
  });
});
