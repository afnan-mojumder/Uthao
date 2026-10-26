import type { WeatherKind, RoadSegment } from '../../core/types';
import type { BikeEnvironment } from '../../physics/bikeModel';
import { clamp } from '../../core/math';

export interface WeatherSystemOptions {
  initialWeather?: WeatherKind;
}

export class WeatherSystem {
  weather: WeatherKind;
  roadWetness: number; // 0 (bone dry) to 1 (slick/soaked)
  rainDurationMinutes: number; // Continuous minutes of current rainfall
  private segmentFloodLevels: Map<string, number> = new Map();

  constructor(opts: WeatherSystemOptions = {}) {
    this.weather = opts.initialWeather ?? 'clear';
    this.roadWetness = this.weather === 'lightRain' || this.weather === 'heavyRain' ? 1.0 : 0.0;
    this.rainDurationMinutes = 0;
  }

  setWeather(w: WeatherKind): void {
    if (this.weather !== w) {
      this.weather = w;
      if (w === 'clear' || w === 'cloudy') {
        this.rainDurationMinutes = 0;
      }
    }
  }

  /**
   * Advances simulation weather and drainage/flooding by dtMinutes.
   */
  update(dtMinutes: number, segments?: Iterable<RoadSegment>): void {
    if (this.weather === 'heavyRain') {
      this.rainDurationMinutes += dtMinutes;
      this.roadWetness = 1.0;

      // Accumulation reaches 1.0 after 30 minutes of heavy rain
      const accumulation = Math.min(1.0, this.rainDurationMinutes / 30);

      if (segments) {
        for (const seg of segments) {
          const level = clamp(accumulation * seg.floodSensitivity, 0, 1);
          this.segmentFloodLevels.set(seg.segmentId, level);
        }
      }
    } else if (this.weather === 'lightRain') {
      this.rainDurationMinutes += dtMinutes;
      this.roadWetness = 1.0;

      // Light rain causes surface wetness and minimal puddles (capped at 0.25)
      if (segments) {
        for (const seg of segments) {
          const current = this.segmentFloodLevels.get(seg.segmentId) ?? 0;
          const target = Math.min(0.25, seg.floodSensitivity * 0.3);
          const next = current < target ? Math.min(target, current + dtMinutes / 60) : current;
          this.segmentFloodLevels.set(seg.segmentId, next);
        }
      }
    } else {
      // Clear or cloudy: roads dry and flood waters drain
      this.rainDurationMinutes = 0;
      // Roads dry over ~15 minutes
      this.roadWetness = Math.max(0, this.roadWetness - dtMinutes / 15);

      // Flood drains over ~20 minutes
      if (segments) {
        for (const seg of segments) {
          const current = this.segmentFloodLevels.get(seg.segmentId) ?? 0;
          if (current > 0) {
            const next = Math.max(0, current - dtMinutes / 20);
            this.segmentFloodLevels.set(seg.segmentId, next);
          }
        }
      } else {
        for (const [id, current] of this.segmentFloodLevels.entries()) {
          if (current > 0) {
            this.segmentFloodLevels.set(id, Math.max(0, current - dtMinutes / 20));
          }
        }
      }
    }
  }

  isRoadWet(): boolean {
    return (
      this.roadWetness > 0.1 ||
      this.weather === 'lightRain' ||
      this.weather === 'heavyRain'
    );
  }

  getFloodLevel(segmentId: string): number {
    return this.segmentFloodLevels.get(segmentId) ?? 0;
  }

  setFloodLevel(segmentId: string, level: number): void {
    this.segmentFloodLevels.set(segmentId, clamp(level, 0, 1));
  }

  /**
   * A segment is considered flooded when its water level reaches >= 0.5.
   * During active heavy rain, sensitive segments (> 0.6) are also treated as flooded
   * once rain has accumulated for 30 minutes.
   */
  isFlooded(segmentId: string): boolean {
    const level = this.getFloodLevel(segmentId);
    return level >= 0.5;
  }

  /**
   * Speed limit cap on road segment taking into account flooding and standing water.
   * Flooded segments cap speed at 10 km/h (water resistance / wake hazards).
   */
  getSpeedCap(segment: RoadSegment): number {
    if (this.isFlooded(segment.segmentId)) {
      return 10;
    }
    if (this.weather === 'heavyRain' && segment.floodSensitivity > 0.6) {
      return 10;
    }
    return segment.speedLimit;
  }

  /**
   * Surface grip modifier taking into account wetness and flooding.
   */
  getSurfaceModifier(segment: RoadSegment): number {
    const base = segment.surfaceCondition;
    if (this.isFlooded(segment.segmentId)) {
      return base * 0.5; // Flooded standing water
    }
    if (this.isRoadWet()) {
      return base * 0.85; // Wet asphalt
    }
    return base;
  }

  /**
   * Produces BikeEnvironment for bikeModel physics integration.
   */
  getBikeEnvironment(
    segment?: RoadSegment,
    hasPassenger: boolean = false,
    conditionPct: number = 100
  ): BikeEnvironment {
    return {
      wet: this.isRoadWet(),
      surface: segment ? this.getSurfaceModifier(segment) : (this.isRoadWet() ? 0.85 : 1.0),
      hasPassenger,
      conditionPct,
    };
  }

  /**
   * Returns all segments that are currently flooded.
   */
  getFloodedSegments(segments: Iterable<RoadSegment>): RoadSegment[] {
    const res: RoadSegment[] = [];
    for (const seg of segments) {
      if (this.isFlooded(seg.segmentId)) {
        res.push(seg);
      }
    }
    return res;
  }
}
