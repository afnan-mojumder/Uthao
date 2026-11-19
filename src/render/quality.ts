export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityConfig {
  level: QualityLevel;
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  maxStreetlights: number;
  drawDistance: number;
  resolutionScale: number;
  rainParticles: number;
}

const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];
const FRAME_RING_CAPACITY = 256;

/**
 * The level to start with: a valid `?quality=` URL parameter wins, otherwise
 * the saved setting. Anything else falls back to the saved setting.
 */
export function resolveQualityLevel(
  urlParam: string | null | undefined,
  saved: QualityLevel
): QualityLevel {
  if (urlParam && (QUALITY_LEVELS as readonly string[]).includes(urlParam)) {
    return urlParam as QualityLevel;
  }
  return saved;
}

export function getQualityConfig(level: QualityLevel, dpr = 1): QualityConfig {
  switch (level) {
    case 'low':
      return {
        level: 'low',
        pixelRatio: 0.75,
        shadows: false,
        shadowMapSize: 0,
        maxStreetlights: 0,
        drawDistance: 200,
        resolutionScale: 1.0,
        rainParticles: 350,
      };
    case 'medium':
      return {
        level: 'medium',
        pixelRatio: 1.0,
        shadows: true,
        shadowMapSize: 1024,
        maxStreetlights: 2,
        drawDistance: 300,
        resolutionScale: 1.0,
        rainParticles: 750,
      };
    case 'high':
      return {
        level: 'high',
        pixelRatio: Math.min(dpr, 2),
        shadows: true,
        shadowMapSize: 2048,
        maxStreetlights: 4,
        drawDistance: 450,
        resolutionScale: 1.0,
        rainParticles: 1500,
      };
  }
}

export type AdaptiveTrigger = 'level' | 'scale' | null;

export class AdaptiveQualityManager {
  config: QualityConfig;
  private readonly dpr: number;
  private readonly frameRing = new Float64Array(FRAME_RING_CAPACITY);
  private ringHead = 0;
  private ringCount = 0;
  private lastCheckTime = -1;

  constructor(initialLevel: QualityLevel = 'medium', dpr = 1) {
    this.dpr = dpr;
    this.config = getQualityConfig(initialLevel, dpr);
  }

  resetWindow(): void {
    this.ringHead = 0;
    this.ringCount = 0;
    this.lastCheckTime = -1;
  }

  /**
   * Records a frame timestamp in a fixed ring buffer (zero heap allocations).
   * Returns `'level'` if quality level should step down, `'scale'` if resolutionScale
   * changed, or `null` if unchanged.
   */
  recordFrame(now: number): AdaptiveTrigger {
    if (this.ringCount < FRAME_RING_CAPACITY) {
      const idx = (this.ringHead + this.ringCount) % FRAME_RING_CAPACITY;
      this.frameRing[idx] = now;
      this.ringCount++;
    } else {
      this.frameRing[this.ringHead] = now;
      this.ringHead = (this.ringHead + 1) % FRAME_RING_CAPACITY;
    }

    // Keep frame timestamps from the last 2 seconds
    const cutoff = now - 2000;
    while (this.ringCount > 1 && this.frameRing[this.ringHead]! < cutoff) {
      this.ringHead = (this.ringHead + 1) % FRAME_RING_CAPACITY;
      this.ringCount--;
    }

    if (this.lastCheckTime < 0) {
      this.lastCheckTime = now;
      return null;
    }

    // Every 2 seconds, step down quality or resolutionScale if fps < 28
    if (now - this.lastCheckTime >= 2000) {
      this.lastCheckTime = now;
      const fps = this.getAverageFps();
      if (fps > 0 && fps < 28) {
        if (this.config.level === 'high') {
          this.config = getQualityConfig('medium', this.dpr);
          return 'level';
        }
        if (this.config.level === 'medium') {
          this.config = getQualityConfig('low', this.dpr);
          return 'level';
        }
        if (this.config.level === 'low' && this.config.resolutionScale > 0.5) {
          this.config.resolutionScale = Math.max(
            0.5,
            Math.round((this.config.resolutionScale - 0.1) * 10) / 10
          );
          return 'scale';
        }
      }
    }

    return null;
  }

  getAverageFps(): number {
    if (this.ringCount < 2) return 60;
    const newestIdx = (this.ringHead + this.ringCount - 1) % FRAME_RING_CAPACITY;
    const duration = (this.frameRing[newestIdx]! - this.frameRing[this.ringHead]!) / 1000;
    if (duration <= 0) return 60;
    return this.ringCount / duration;
  }
}
