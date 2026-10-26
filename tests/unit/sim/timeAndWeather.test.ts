import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { TimeOfDay } from '../../../src/sim/world/TimeOfDay';
import { WeatherSystem } from '../../../src/sim/world/WeatherSystem';
import { WeatherFx } from '../../../src/render/WeatherFx';
import { RoadNetwork } from '../../../src/sim/road/RoadNetwork';
import {
  createDefaultBikeSpec,
  createDefaultBikeState,
  stepBike,
} from '../../../src/physics/bikeModel';
import type { RoadSegment, RoadNode } from '../../../src/core/types';

describe('T3.5 Time of Day & Weather', () => {
  describe('TimeOfDay', () => {
    it('visibility lower at night', () => {
      const noonVisibility = TimeOfDay.getVisibility(12 * 60); // 12:00
      const midnightVisibility = TimeOfDay.getVisibility(22 * 60); // 22:00
      expect(midnightVisibility).toBeLessThan(noonVisibility);
      expect(noonVisibility).toBe(1.0);
      expect(midnightVisibility).toBe(0.3);
    });

    it('streetlights after 18:30', () => {
      // 12:00 -> Off
      expect(TimeOfDay.isStreetlightsActive(12 * 60)).toBe(false);
      // 18:29 -> Off
      expect(TimeOfDay.isStreetlightsActive(18 * 60 + 29)).toBe(false);
      // 18:30 -> On
      expect(TimeOfDay.isStreetlightsActive(18 * 60 + 30)).toBe(true);
      // 23:00 -> On
      expect(TimeOfDay.isStreetlightsActive(23 * 60)).toBe(true);
      // 04:00 -> On
      expect(TimeOfDay.isStreetlightsActive(4 * 60)).toBe(true);
      // 06:00 -> Off
      expect(TimeOfDay.isStreetlightsActive(6 * 60)).toBe(false);
    });

    it('headlight cone (LED upgrade widens it)', () => {
      const standard = TimeOfDay.getHeadlightSpec(false);
      const led = TimeOfDay.getHeadlightSpec(true);

      expect(led.angle).toBeGreaterThan(standard.angle);
      expect(led.distance).toBeGreaterThan(standard.distance);
      expect(led.intensity).toBeGreaterThan(standard.intensity);
    });

    it('sun and sky colour varies smoothly by game minute', () => {
      const noon = TimeOfDay.getSunSkyState(12 * 60);
      const sunset = TimeOfDay.getSunSkyState(18 * 60);
      const night = TimeOfDay.getSunSkyState(23 * 60);

      expect(noon.sunIntensity).toBeGreaterThan(0.5);
      expect(sunset.sunColor).toBe(0xf97316); // sunset orange
      expect(night.sunIntensity).toBe(0);
      expect(night.skyColor).toBe(0x0f172a);
    });
  });

  describe('WeatherSystem & Flooding', () => {
    const mockNodes: RoadNode[] = [
      { nodeId: 'N1', x: 0, z: 0, kind: 'junction' },
      { nodeId: 'N2', x: 100, z: 0, kind: 'junction' },
      { nodeId: 'N3', x: 200, z: 0, kind: 'junction' },
      { nodeId: 'N4', x: 100, z: 50, kind: 'junction' },
    ];

    const mockSegments: RoadSegment[] = [
      // S1: High flood sensitivity (sensitive segment)
      {
        segmentId: 'S1',
        startNodeId: 'N1',
        endNodeId: 'N2',
        width: 10,
        surfaceCondition: 1.0,
        trafficDensity: 0.2,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0.7, // > 0.6 sensitive
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      // S2: Severe flood sensitivity (> 0.9)
      {
        segmentId: 'S2',
        startNodeId: 'N2',
        endNodeId: 'N3',
        width: 10,
        surfaceCondition: 1.0,
        trafficDensity: 0.2,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0.95, // > 0.9 severe
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      // S3: Bypass road with low flood sensitivity (0.1)
      {
        segmentId: 'S3_a',
        startNodeId: 'N2',
        endNodeId: 'N4',
        width: 10,
        surfaceCondition: 1.0,
        trafficDensity: 0.2,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
      {
        segmentId: 'S3_b',
        startNodeId: 'N4',
        endNodeId: 'N3',
        width: 10,
        surfaceCondition: 1.0,
        trafficDensity: 0.2,
        speedLimit: 40,
        turnRestrictions: [],
        motorcycleAccessible: true,
        pedestrianDensity: 0.1,
        riskLevel: 0.1,
        oneWay: false,
        divided: false,
        lanes: 2,
        roadType: 'main',
        floodSensitivity: 0.1,
        pickupPractical: true,
        district: 'testloop',
        tags: [],
      },
    ];

    it('heavy rain 30 min floods sensitive segments', () => {
      const ws = new WeatherSystem({ initialWeather: 'heavyRain' });

      // Before 30 min, segments have not fully flooded
      ws.update(10, mockSegments);
      expect(ws.isFlooded('S1')).toBe(false);

      // At 30 min of heavy rain
      ws.update(20, mockSegments); // Total 30 min
      expect(ws.rainDurationMinutes).toBe(30);

      // Sensitive segment (floodSensitivity 0.7 > 0.6) is now flooded
      expect(ws.isFlooded('S1')).toBe(true);
      expect(ws.getFloodLevel('S1')).toBeGreaterThanOrEqual(0.7);

      // Severe segment (floodSensitivity 0.95) has flood level > 0.9
      expect(ws.getFloodLevel('S2')).toBeGreaterThan(0.9);

      // Insensitive bypass segment (0.1) is not flooded
      expect(ws.isFlooded('S3_a')).toBe(false);
      expect(ws.getFloodLevel('S3_a')).toBeLessThan(0.2);
    });

    it('flooded >0.9 excluded from routing', () => {
      const net = RoadNetwork.fromDistricts([
        {
          districtId: 'testloop',
          name: { bn: 'টেস্ট', en: 'Test' },
          nodes: mockNodes,
          segments: mockSegments,
          pois: [],
        },
      ]);
      const ws = new WeatherSystem({ initialWeather: 'heavyRain' });
      ws.update(30, mockSegments);

      // In clear weather, route from N2 to N3 goes directly via S2
      const dryRoute = net.route('N2', 'N3', { mode: 'motorcycle' });
      expect(dryRoute?.segmentIds).toEqual(['S2']);

      // In heavy rain / flooded state, S2 (floodSensitivity 0.95 > 0.9) is excluded!
      const floodedRoute = net.route('N2', 'N3', {
        mode: 'motorcycle',
        weather: 'heavyRain',
        getFloodLevel: (id: string) => ws.getFloodLevel(id),
      });

      // Must take bypass via N4 (S3_a, S3_b)
      expect(floodedRoute).not.toBeNull();
      expect(floodedRoute?.segmentIds).not.toContain('S2');
      expect(floodedRoute?.segmentIds).toContain('S3_a');
      expect(floodedRoute?.segmentIds).toContain('S3_b');
    });

    it('flooded segments cap speed at 10 km/h', () => {
      const ws = new WeatherSystem({ initialWeather: 'heavyRain' });
      ws.update(30, mockSegments);

      const seg = mockSegments[0]!;
      expect(ws.getSpeedCap(seg)).toBe(10);
    });

    it('wet feeds bikeModel', () => {
      const ws = new WeatherSystem({ initialWeather: 'heavyRain' });
      expect(ws.isRoadWet()).toBe(true);

      const spec = createDefaultBikeSpec();
      const dryEnv = { wet: false, surface: 1.0, hasPassenger: false, conditionPct: 100 };
      const wetEnv = ws.getBikeEnvironment();

      expect(wetEnv.wet).toBe(true);

      // Step bike under braking in dry vs wet conditions
      const dryState = { ...createDefaultBikeState(), speed: 15 };
      const wetState = { ...createDefaultBikeState(), speed: 15 };

      const dryBraked = stepBike(dryState, { throttle: 0, brake: 1, steer: 0 }, spec, dryEnv, 0.5);
      const wetBraked = stepBike(wetState, { throttle: 0, brake: 1, steer: 0 }, spec, wetEnv, 0.5);

      // Wet braking deceleration is lower, meaning wet speed remains higher
      expect(wetBraked.speed).toBeGreaterThan(dryBraked.speed);
    });

    it('drains flood water and dries roads when weather clears', () => {
      const ws = new WeatherSystem({ initialWeather: 'heavyRain' });
      ws.update(30, mockSegments);
      expect(ws.isFlooded('S1')).toBe(true);

      ws.setWeather('clear');
      ws.update(25, mockSegments); // 25 minutes of clear weather drains water

      expect(ws.isFlooded('S1')).toBe(false);
      expect(ws.getFloodLevel('S1')).toBe(0);
      expect(ws.isRoadWet()).toBe(false);
    });
  });

  describe('WeatherFx Visuals', () => {
    it('creates rain particle system and headlight cone without error', () => {
      const scene = new THREE.Scene();
      const fx = new WeatherFx(scene);

      expect(fx.rainGroup).toBeDefined();
      expect(fx.headlight).toBeDefined();
      expect(fx.waterGroup).toBeDefined();

      // Update in heavy rain
      expect(() => {
        fx.update(
          1 / 60,
          12 * 60,
          'heavyRain',
          { x: 10, y: 0, z: 20 },
          0,
          true
        );
      }).not.toThrow();

      expect(fx.rainGroup.visible).toBe(true);

      // Update in clear midday
      expect(() => {
        fx.update(
          1 / 60,
          12 * 60,
          'clear',
          { x: 10, y: 0, z: 20 },
          0,
          false
        );
      }).not.toThrow();

      expect(fx.rainGroup.visible).toBe(false);

      fx.dispose();
    });
  });
});
