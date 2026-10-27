export type QualityLevel = 'low' | 'medium' | 'high';

export interface QualityConfig {
  level: QualityLevel;
  pixelRatio: number;
  shadows: boolean;
  drawDistance: number;
  resolutionScale: number;
  rainParticles: number;
}

export function getQualityConfig(level: QualityLevel, dpr = 1): QualityConfig {
  switch (level) {
    case 'low':
      return {
        level: 'low',
        pixelRatio: 0.75,
        shadows: false,
        drawDistance: 200,
        resolutionScale: 1.0,
        rainParticles: 350,
      };
    case 'medium':
      return {
        level: 'medium',
        pixelRatio: 1.0,
        shadows: true,
        drawDistance: 300,
        resolutionScale: 1.0,
        rainParticles: 750,
      };
    case 'high':
      return {
        level: 'high',
        pixelRatio: Math.min(dpr, 2),
        shadows: true,
        drawDistance: 450,
        resolutionScale: 1.0,
        rainParticles: 1500,
      };
  }
}

export class AdaptiveQualityManager {
  config: QualityConfig;
  private frameTimes: number[] = [];
  private lastCheckTime = performance.now();

  constructor(initialLevel: QualityLevel = 'medium', dpr = 1) {
    this.config = getQualityConfig(initialLevel, dpr);
  }

  recordFrame(now: number): void {
    this.frameTimes.push(now);

    // Keep frame timestamps from the last 2 seconds
    const cutoff = now - 2000;
    while (this.frameTimes.length > 0 && this.frameTimes[0]! < cutoff) {
      this.frameTimes.shift();
    }

    // Every 2 seconds on low quality, check if fps < 28
    if (this.config.level === 'low' && now - this.lastCheckTime >= 2000) {
      this.lastCheckTime = now;
      const fps = this.getAverageFps();
      if (fps > 0 && fps < 28 && this.config.resolutionScale > 0.5) {
        this.config.resolutionScale = Math.max(
          0.5,
          this.config.resolutionScale - 0.1
        );
      }
    }
  }

  getAverageFps(): number {
    if (this.frameTimes.length < 2) return 60;
    const duration =
      (this.frameTimes[this.frameTimes.length - 1]! - this.frameTimes[0]!) / 1000;
    if (duration <= 0) return 60;
    return this.frameTimes.length / duration;
  }
}
