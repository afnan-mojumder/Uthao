import type { WeatherKind, RoadSegment } from '../../core/types';
import type { BikeEnvironment } from '../../physics/bikeModel';
import type { EventBus, GameEvents } from '../../core/events';
import { clamp } from '../../core/math';
import { Rng, hashSeed } from '../../core/rng';

export interface WeatherSystemOptions {
  initialWeather?: WeatherKind;
  seed?: number;
  bus?: EventBus<GameEvents>;
  dynamic?: boolean;
}

interface WeatherEpisode {
  startMinute: number;
  weather: WeatherKind;
}

export class WeatherSystem {
  weather: WeatherKind;
  roadWetness: number; // 0 (bone dry) to 1 (slick/soaked)
  rainDurationMinutes: number; // Continuous minutes of current rainfall
  private segmentFloodLevels: Map<string, number> = new Map();
  private floodedIds: Set<string> = new Set();
  private _floodVersion = 0;

  private readonly seed: number;
  private readonly bus?: EventBus<GameEvents>;
  private readonly dynamic: boolean;
  private manualOverride = false;
  private scheduledDay = -1;
  private scheduledChapter = -1;
  private readonly daySchedule: WeatherEpisode[] = [];
  private internalMinute = 7 * 60;

  constructor(opts: WeatherSystemOptions = {}) {
    this.weather = opts.initialWeather ?? 'clear';
    this.roadWetness = this.weather === 'lightRain' || this.weather === 'heavyRain' ? 1.0 : 0.0;
    this.rainDurationMinutes = 0;
    this.seed = opts.seed ?? 1;
    this.bus = opts.bus;
    this.dynamic = opts.dynamic ?? (opts.seed !== undefined || opts.bus !== undefined);
  }

  get floodVersion(): number {
    return this._floodVersion;
  }

  private setSegmentFloodInternal(segmentId: string, level: number): void {
    const clamped = clamp(level, 0, 1);
    if (clamped === 0) {
      this.segmentFloodLevels.delete(segmentId);
    } else {
      this.segmentFloodLevels.set(segmentId, clamped);
    }
    const flooded = clamped >= 0.5;
    if (flooded && !this.floodedIds.has(segmentId)) {
      this.floodedIds.add(segmentId);
      this._floodVersion++;
    } else if (!flooded && this.floodedIds.delete(segmentId)) {
      this._floodVersion++;
    }
  }

  setWeather(w: WeatherKind): void {
    this.manualOverride = true;
    if (this.weather !== w) {
      this.weather = w;
      if (w === 'clear' || w === 'cloudy') {
        this.rainDurationMinutes = 0;
      }
    }
  }

  /** Restores weather from a saved snapshot without locking out subsequent dynamic transitions. */
  restoreWeather(w: WeatherKind): void {
    this.manualOverride = false;
    this.scheduledDay = -1;
    this.scheduledChapter = -1;
    this.weather = w;
    this.roadWetness = w === 'lightRain' || w === 'heavyRain' ? 1.0 : 0.0;
    this.rainDurationMinutes = w === 'heavyRain' ? 30 : 0;
    this.segmentFloodLevels.clear();
    if (this.floodedIds.size > 0) {
      this.floodedIds.clear();
      this._floodVersion++;
    }
  }

  /** Resets weather, flood state, and schedule for a fresh career. */
  reset(initialWeather: WeatherKind = 'clear'): void {
    this.manualOverride = false;
    this.scheduledDay = -1;
    this.scheduledChapter = -1;
    this.daySchedule.length = 0;
    this.internalMinute = 7 * 60;
    this.weather = initialWeather;
    this.roadWetness =
      initialWeather === 'lightRain' || initialWeather === 'heavyRain' ? 1.0 : 0.0;
    this.rainDurationMinutes = 0;
    this.segmentFloodLevels.clear();
    if (this.floodedIds.size > 0) {
      this.floodedIds.clear();
      this._floodVersion++;
    }
  }

  onDayStarted(day: number, chapter: number): void {
    this.manualOverride = false;
    this.scheduledDay = -1;
    this.applyScheduledWeather(day, 7 * 60, chapter);
  }

  private ensureDaySchedule(day: number, chapter: number): void {
    if (this.scheduledDay === day && this.scheduledChapter === chapter) {
      return;
    }
    this.scheduledDay = day;
    this.scheduledChapter = chapter;
    this.daySchedule.length = 0;

    const rng = new Rng(hashSeed(this.seed, 'weather', day, chapter));

    if (chapter >= 3) {
      // Monsoon chapters: guarantee at least one rain/heavyRain episode per day
      // while keeping sunny/cloudy mornings or lulls common.
      const morningWeather: WeatherKind = rng.next() < 0.6 ? 'clear' : 'cloudy';
      const squallStart = rng.int(9 * 60, 16 * 60);
      const heavyDur = rng.int(45, 85);
      const preCloud = rng.int(30, 60);
      const preLight = rng.int(20, 40);
      const postLight = rng.int(15, 35);

      this.daySchedule.push({ startMinute: 0, weather: morningWeather });
      this.daySchedule.push({
        startMinute: Math.max(7 * 60 + 5, squallStart - preCloud - preLight),
        weather: 'cloudy',
      });
      this.daySchedule.push({
        startMinute: Math.max(7 * 60 + 10, squallStart - preLight),
        weather: 'lightRain',
      });
      this.daySchedule.push({ startMinute: squallStart, weather: 'heavyRain' });
      this.daySchedule.push({ startMinute: squallStart + heavyDur, weather: 'lightRain' });
      const lullStart = squallStart + heavyDur + postLight;
      this.daySchedule.push({ startMinute: lullStart, weather: 'cloudy' });

      if (rng.next() < 0.35 && lullStart + 90 < 21 * 60) {
        const eveStart = Math.max(lullStart + 60, 19 * 60);
        this.daySchedule.push({ startMinute: eveStart - 15, weather: 'lightRain' });
        this.daySchedule.push({ startMinute: eveStart, weather: 'heavyRain' });
        this.daySchedule.push({ startMinute: eveStart + 45, weather: 'cloudy' });
      } else {
        this.daySchedule.push({ startMinute: lullStart + 40, weather: 'clear' });
      }
      return;
    }

    // Chapters 1-2: sunny/cloudy days are common (~70%), occasional passing rain (~30%)
    const roll = rng.next();
    if (roll < 0.45) {
      this.daySchedule.push({ startMinute: 0, weather: 'clear' });
      if (rng.next() < 0.5) {
        const cloudStart = rng.int(12 * 60, 16 * 60);
        this.daySchedule.push({ startMinute: cloudStart, weather: 'cloudy' });
        this.daySchedule.push({ startMinute: cloudStart + rng.int(60, 120), weather: 'clear' });
      }
    } else if (roll < 0.70) {
      this.daySchedule.push({ startMinute: 0, weather: 'clear' });
      const cloudStart = rng.int(9 * 60, 14 * 60);
      this.daySchedule.push({ startMinute: cloudStart, weather: 'cloudy' });
      this.daySchedule.push({ startMinute: cloudStart + rng.int(120, 240), weather: 'clear' });
    } else {
      this.daySchedule.push({ startMinute: 0, weather: 'clear' });
      const rainStart = rng.int(11 * 60, 17 * 60);
      const rainDur = rng.int(40, 70);
      this.daySchedule.push({ startMinute: rainStart - 45, weather: 'cloudy' });
      this.daySchedule.push({ startMinute: rainStart, weather: 'lightRain' });
      if (chapter === 2 && rng.next() < 0.4) {
        this.daySchedule.push({ startMinute: rainStart + 15, weather: 'heavyRain' });
        this.daySchedule.push({ startMinute: rainStart + 50, weather: 'lightRain' });
        this.daySchedule.push({ startMinute: rainStart + 70, weather: 'cloudy' });
        this.daySchedule.push({ startMinute: rainStart + 110, weather: 'clear' });
      } else {
        this.daySchedule.push({ startMinute: rainStart + rainDur, weather: 'cloudy' });
        this.daySchedule.push({ startMinute: rainStart + rainDur + 40, weather: 'clear' });
      }
    }
  }

  private applyScheduledWeather(day: number, minute: number, chapter: number): void {
    this.ensureDaySchedule(day, chapter);
    let target: WeatherKind = this.weather;
    for (let i = 0; i < this.daySchedule.length; i++) {
      const ep = this.daySchedule[i]!;
      if (ep.startMinute <= minute) {
        target = ep.weather;
      } else {
        break;
      }
    }
    if (target !== this.weather) {
      const from = this.weather;
      this.weather = target;
      if (target === 'clear' || target === 'cloudy') {
        this.rainDurationMinutes = 0;
      }
      this.bus?.emit('world/weatherChanged', { from, to: target });
    }
  }

  private updateSegmentFlood(seg: RoadSegment, dtMinutes: number, accumulation: number): void {
    if (this.weather === 'heavyRain') {
      const level = clamp(accumulation * seg.floodSensitivity, 0, 1);
      this.setSegmentFloodInternal(seg.segmentId, level);
    } else if (this.weather === 'lightRain') {
      const current = this.segmentFloodLevels.get(seg.segmentId) ?? 0;
      const target = Math.min(0.25, seg.floodSensitivity * 0.3);
      const next = current < target ? Math.min(target, current + dtMinutes / 60) : current;
      if (next !== current) {
        this.setSegmentFloodInternal(seg.segmentId, next);
      }
    } else {
      const current = this.segmentFloodLevels.get(seg.segmentId) ?? 0;
      if (current > 0) {
        this.setSegmentFloodInternal(seg.segmentId, Math.max(0, current - dtMinutes / 20));
      }
    }
  }

  /**
   * Advances simulation weather and drainage/flooding by dtMinutes.
   */
  update(
    dtMinutes: number,
    segments?: Iterable<RoadSegment>,
    day?: number,
    minute?: number,
    chapter?: number
  ): void {
    if (this.dynamic && !this.manualOverride) {
      const d = day ?? 1;
      const c = chapter ?? 1;
      const m = minute !== undefined ? minute : (this.internalMinute += dtMinutes);
      this.applyScheduledWeather(d, m, c);
    }

    let accumulation = 0;
    if (this.weather === 'heavyRain') {
      this.rainDurationMinutes += dtMinutes;
      this.roadWetness = 1.0;
      // Accumulation reaches 1.0 after 30 minutes of heavy rain
      accumulation = Math.min(1.0, this.rainDurationMinutes / 30);
    } else if (this.weather === 'lightRain') {
      this.rainDurationMinutes += dtMinutes;
      this.roadWetness = 1.0;
    } else {
      // Clear or cloudy: roads dry and flood waters drain
      this.rainDurationMinutes = 0;
      // Roads dry over ~15 minutes
      this.roadWetness = Math.max(0, this.roadWetness - dtMinutes / 15);
      if (this.segmentFloodLevels.size === 0) {
        return;
      }
    }

    if (segments) {
      if (Array.isArray(segments)) {
        for (let i = 0; i < segments.length; i++) {
          this.updateSegmentFlood(segments[i]!, dtMinutes, accumulation);
        }
      } else {
        for (const seg of segments) {
          this.updateSegmentFlood(seg, dtMinutes, accumulation);
        }
      }
    } else if (this.weather !== 'heavyRain' && this.weather !== 'lightRain') {
      for (const [id, current] of this.segmentFloodLevels.entries()) {
        if (current > 0) {
          this.setSegmentFloodInternal(id, Math.max(0, current - dtMinutes / 20));
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
    this.setSegmentFloodInternal(segmentId, level);
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
   * True when flooding or heavy rain on a flood-sensitive segment caps road speed.
   */
  isSegmentFloodCapped(segment: RoadSegment): boolean {
    return (
      this.isFlooded(segment.segmentId) ||
      (this.weather === 'heavyRain' && segment.floodSensitivity > 0.6)
    );
  }

  /**
   * Speed limit cap on road segment taking into account flooding and standing water.
   * Flooded segments cap speed at 10 km/h (water resistance / wake hazards).
   */
  getSpeedCap(segment: RoadSegment): number {
    if (this.isSegmentFloodCapped(segment)) {
      return 10;
    }
    return segment.speedLimit;
  }

  /**
   * Surface grip modifier taking into account flooding (wet asphalt grip is
   * handled by bikeModel via env.wet and spec.wetLateralGrip).
   */
  getSurfaceModifier(segment: RoadSegment): number {
    const base = segment.surfaceCondition;
    if (this.isFlooded(segment.segmentId)) {
      return base * 0.5; // Flooded standing water
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
      surface: segment ? this.getSurfaceModifier(segment) : 1.0,
      hasPassenger,
      conditionPct,
      floodSpeedCapMs:
        segment && this.isSegmentFloodCapped(segment) ? this.getSpeedCap(segment) / 3.6 : undefined,
    };
  }

  /**
   * Returns all segments that are currently flooded.
   * When `out` is provided, reuses it in-place with zero allocations.
   */
  getFloodedSegments(segments: Iterable<RoadSegment>, out?: RoadSegment[]): RoadSegment[] {
    const res = out ?? [];
    res.length = 0;
    for (const seg of segments) {
      if (this.isFlooded(seg.segmentId)) {
        res.push(seg);
      }
    }
    return res;
  }
}
