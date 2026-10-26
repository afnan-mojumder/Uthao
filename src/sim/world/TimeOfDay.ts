import { clamp, lerp } from '../../core/math';

export interface SunSkyState {
  sunColor: number;
  sunIntensity: number;
  sunPosition: [x: number, y: number, z: number];
  skyColor: number;
  fogColor: number;
  ambientColor: number;
  ambientIntensity: number;
}

export interface HeadlightSpec {
  angle: number; // beam cone angle in radians
  distance: number;
  intensity: number;
  penumbra: number;
  color: number;
}

/**
 * Pure logic and calculations for the Dhaka time of day cycle.
 */
export class TimeOfDay {
  /**
   * Streetlights turn on after 18:30 (1110 min) and turn off at dawn 05:30 (330 min).
   */
  static isStreetlightsActive(minute: number): boolean {
    const minOfDay = ((minute % 1440) + 1440) % 1440;
    return minOfDay >= 18 * 60 + 30 || minOfDay < 5 * 60 + 30;
  }

  /**
   * Night / daylight ambient visibility factor (0.0 to 1.0).
   * Broad daylight (08:00 - 17:00): ~1.0
   * Night (19:30 - 05:00): ~0.3
   * Smooth transition during dawn (05:00 - 08:00) and dusk (17:00 - 19:30).
   */
  static getVisibility(minute: number): number {
    const minOfDay = ((minute % 1440) + 1440) % 1440;

    // Night period
    if (minOfDay < 300 || minOfDay >= 1170) {
      return 0.3;
    }

    // Dawn transition (05:00 - 08:00: 300 to 480 min)
    if (minOfDay >= 300 && minOfDay < 480) {
      const t = (minOfDay - 300) / (480 - 300);
      return lerp(0.3, 1.0, t);
    }

    // Broad daylight (08:00 - 17:00: 480 to 1020 min)
    if (minOfDay >= 480 && minOfDay < 1020) {
      return 1.0;
    }

    // Dusk transition (17:00 - 19:30: 1020 to 1170 min)
    const t = (minOfDay - 1020) / (1170 - 1020);
    return lerp(1.0, 0.3, t);
  }

  /**
   * Returns sun position, sun color, sky color, fog, and ambient light by game minute.
   */
  static getSunSkyState(minute: number): SunSkyState {
    const minOfDay = ((minute % 1440) + 1440) % 1440;

    // Angle of the sun across the sky: 06:00 is East, 12:00 is Zenith, 18:00 is West
    // Sun rises at 06:00 (360 min) and sets at 18:30 (1110 min)
    const dayProgress = clamp((minOfDay - 360) / (1110 - 360), 0, 1);
    const sunAngle = dayProgress * Math.PI; // 0 to PI during day
    const isDay = minOfDay >= 330 && minOfDay <= 1140;

    // Sun position arc
    const sunDist = 150;
    const sunX = Math.cos(sunAngle) * sunDist * -1;
    const sunY = isDay ? Math.sin(sunAngle) * sunDist : -20;
    const sunZ = Math.sin(sunAngle * 0.5) * 50;

    // Sun intensity
    let sunIntensity = 0;
    if (isDay) {
      sunIntensity = Math.sin(sunAngle) * 1.3;
    }

    // Color palettes
    let skyColor: number;
    let fogColor: number;
    let sunColor: number;
    let ambientColor: number;
    let ambientIntensity: number;

    if (minOfDay >= 360 && minOfDay < 480) {
      // Dawn (06:00 - 08:00): Warm amber/gold into light blue
      const t = (minOfDay - 360) / 120;
      skyColor = lerpColor(0x2a2b4a, 0x87ceeb, t);
      fogColor = lerpColor(0x383959, 0x87ceeb, t);
      sunColor = 0xffa040;
      ambientColor = 0xffecd2;
      ambientIntensity = lerp(0.3, 0.75, t);
    } else if (minOfDay >= 480 && minOfDay < 1020) {
      // Midday (08:00 - 17:00): Dhaka sky
      skyColor = 0x87ceeb;
      fogColor = 0xa5d8f0;
      sunColor = 0xfffaed;
      ambientColor = 0xffffff;
      ambientIntensity = 0.8;
    } else if (minOfDay >= 1020 && minOfDay < 1140) {
      // Golden Hour & Sunset (17:00 - 19:00): Crimson/orange into deep twilight
      const t = (minOfDay - 1020) / 120;
      skyColor = lerpColor(0x87ceeb, 0x1e1b4b, t);
      fogColor = lerpColor(0xa5d8f0, 0x312e81, t);
      sunColor = 0xf97316;
      ambientColor = 0xfdba74;
      ambientIntensity = lerp(0.8, 0.35, t);
    } else {
      // Night (19:00 - 06:00): Dark Dhaka night sky
      skyColor = 0x0f172a;
      fogColor = 0x0f172a;
      sunColor = 0x1e293b;
      ambientColor = 0x334155;
      ambientIntensity = 0.25;
    }

    return {
      sunColor,
      sunIntensity: Math.max(0, sunIntensity),
      sunPosition: [sunX, sunY, sunZ],
      skyColor,
      fogColor,
      ambientColor,
      ambientIntensity,
    };
  }

  /**
   * Headlight beam properties.
   * LED upgrade widens the cone angle and provides greater reach and intensity.
   */
  static getHeadlightSpec(hasLedUpgrade: boolean = false): HeadlightSpec {
    if (hasLedUpgrade) {
      return {
        angle: 0.7, // ~40° wide beam
        distance: 60,
        intensity: 3.5,
        penumbra: 0.4,
        color: 0xf8fafc, // Crisp cool-white LED
      };
    }

    return {
      angle: 0.45, // ~26° standard halogen cone
      distance: 38,
      intensity: 2.0,
      penumbra: 0.5,
      color: 0xfff3d6, // Warm stock halogen
    };
  }
}

function lerpColor(c1: number, c2: number, t: number): number {
  const r1 = (c1 >> 16) & 255;
  const g1 = (c1 >> 8) & 255;
  const b1 = c1 & 255;

  const r2 = (c2 >> 16) & 255;
  const g2 = (c2 >> 8) & 255;
  const b2 = c2 & 255;

  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));

  return (r << 16) | (g << 8) | b;
}
