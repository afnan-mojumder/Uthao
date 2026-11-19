import { clamp, lerp } from '../../core/math';

export interface SunSkyState {
  sunColor: number;
  sunIntensity: number;
  sunPosition: [x: number, y: number, z: number];
  skyColor: number;
  skyTopColor: number;
  skyHorizonColor: number;
  fogColor: number;
  ambientColor: number;
  groundColor: number;
  ambientIntensity: number;
}

export interface HeadlightSpec {
  angle: number; // beam cone angle in radians
  distance: number;
  intensity: number;
  penumbra: number;
  color: number;
}

interface SkyKeyframe {
  minute: number;
  skyColor: number;
  skyTopColor: number;
  skyHorizonColor: number;
  fogColor: number;
  sunColor: number;
  sunIntensity: number;
  ambientColor: number;
  groundColor: number;
  ambientIntensity: number;
}

const SKY_KEYFRAMES: readonly SkyKeyframe[] = [
  {
    minute: 0, // Midnight
    skyColor: 0x0f172a,
    skyTopColor: 0x090f20,
    skyHorizonColor: 0x1e293b,
    fogColor: 0x151e32,
    sunColor: 0x334155,
    sunIntensity: 0,
    ambientColor: 0x64748b,
    groundColor: 0x222938,
    ambientIntensity: 0.42,
  },
  {
    minute: 300, // 05:00 Night end
    skyColor: 0x0f172a,
    skyTopColor: 0x090f20,
    skyHorizonColor: 0x1e293b,
    fogColor: 0x151e32,
    sunColor: 0x334155,
    sunIntensity: 0,
    ambientColor: 0x64748b,
    groundColor: 0x222938,
    ambientIntensity: 0.42,
  },
  {
    minute: 330, // 05:30 Pre-dawn first light
    skyColor: 0x324670,
    skyTopColor: 0x1a284d,
    skyHorizonColor: 0x73627a,
    fogColor: 0x3e4c70,
    sunColor: 0xff9a52,
    sunIntensity: 0,
    ambientColor: 0x94a3c8,
    groundColor: 0x383c4d,
    ambientIntensity: 0.55,
  },
  {
    minute: 360, // 06:00 Dawn golden glow
    skyColor: 0x7aa2d4,
    skyTopColor: 0x3b6cb5,
    skyHorizonColor: 0xf7c59f,
    fogColor: 0x9eb8d9,
    sunColor: 0xffb36b,
    sunIntensity: 0.65,
    ambientColor: 0xffe8cc,
    groundColor: 0x6b5b4b,
    ambientIntensity: 0.72,
  },
  {
    minute: 480, // 08:00 Bright golden morning
    skyColor: 0x7cc4f0,
    skyTopColor: 0x2b7de9,
    skyHorizonColor: 0xccebff,
    fogColor: 0xb5dff5,
    sunColor: 0xfff1d6,
    sunIntensity: 1.45,
    ambientColor: 0xf0f7ff,
    groundColor: 0x6f675b,
    ambientIntensity: 0.92,
  },
  {
    minute: 600, // 10:00 Sunny Dhaka midday start
    skyColor: 0x87ceeb,
    skyTopColor: 0x2563eb,
    skyHorizonColor: 0xc7e8fb,
    fogColor: 0xb8dff2,
    sunColor: 0xfff8e7,
    sunIntensity: 1.75,
    ambientColor: 0xe8f4ff,
    groundColor: 0x7a7062,
    ambientIntensity: 1.0,
  },
  {
    minute: 930, // 15:30 Sunny Dhaka midday end
    skyColor: 0x87ceeb,
    skyTopColor: 0x2563eb,
    skyHorizonColor: 0xc7e8fb,
    fogColor: 0xb8dff2,
    sunColor: 0xfff8e7,
    sunIntensity: 1.75,
    ambientColor: 0xe8f4ff,
    groundColor: 0x7a7062,
    ambientIntensity: 1.0,
  },
  {
    minute: 990, // 16:30 Late afternoon warmth
    skyColor: 0x7eb8e0,
    skyTopColor: 0x3b6ec9,
    skyHorizonColor: 0xf6d5b0,
    fogColor: 0xc8d8e6,
    sunColor: 0xffd9a0,
    sunIntensity: 1.35,
    ambientColor: 0xfff0db,
    groundColor: 0x6e6052,
    ambientIntensity: 0.88,
  },
  {
    minute: 1080, // 18:00 Warm sunset
    skyColor: 0x4c4c8c,
    skyTopColor: 0x1e295e,
    skyHorizonColor: 0xf97316,
    fogColor: 0x7c587a,
    sunColor: 0xf97316,
    sunIntensity: 0.75,
    ambientColor: 0xfdba74,
    groundColor: 0x4a3b36,
    ambientIntensity: 0.65,
  },
  {
    minute: 1125, // 18:45 Twilight / Dusk
    skyColor: 0x1e224f,
    skyTopColor: 0x111638,
    skyHorizonColor: 0x6b3e5e,
    fogColor: 0x28274c,
    sunColor: 0x9a4a3a,
    sunIntensity: 0,
    ambientColor: 0x7c85a8,
    groundColor: 0x2b2d42,
    ambientIntensity: 0.48,
  },
  {
    minute: 1170, // 19:30 Readable night
    skyColor: 0x0f172a,
    skyTopColor: 0x090f20,
    skyHorizonColor: 0x1e293b,
    fogColor: 0x151e32,
    sunColor: 0x334155,
    sunIntensity: 0,
    ambientColor: 0x64748b,
    groundColor: 0x222938,
    ambientIntensity: 0.42,
  },
  {
    minute: 1440, // 24:00 Wrap to Midnight
    skyColor: 0x0f172a,
    skyTopColor: 0x090f20,
    skyHorizonColor: 0x1e293b,
    fogColor: 0x151e32,
    sunColor: 0x334155,
    sunIntensity: 0,
    ambientColor: 0x64748b,
    groundColor: 0x222938,
    ambientIntensity: 0.42,
  },
];

function cosineEase(t: number): number {
  const c = clamp(t, 0, 1);
  return 0.5 - 0.5 * Math.cos(Math.PI * c);
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
   * Smooth cosine fade (0.0 to 1.0) for streetlight emissive glow and pooled lights
   * across dusk (18:10 - 18:45) and dawn (05:15 - 05:50).
   */
  static getStreetlightIntensity(minute: number): number {
    const minOfDay = ((minute % 1440) + 1440) % 1440;
    if (minOfDay >= 1125 || minOfDay < 315) {
      return 1.0;
    }
    if (minOfDay >= 315 && minOfDay < 350) {
      return 1.0 - cosineEase((minOfDay - 315) / 35);
    }
    if (minOfDay >= 1090 && minOfDay < 1125) {
      return cosineEase((minOfDay - 1090) / 35);
    }
    return 0.0;
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
   * Uses smooth cosine interpolation across keyframes to avoid color/intensity pops.
   */
  static getSunSkyState(minute: number): SunSkyState {
    const minOfDay = ((minute % 1440) + 1440) % 1440;

    // Angle of the sun across the sky: 05:30 (330) is East horizon, 12:00 (720) Zenith, 18:30 (1110) West horizon
    const dayProgress = clamp((minOfDay - 330) / (1110 - 330), 0, 1);
    const sunAngle = dayProgress * Math.PI;
    const isDay = minOfDay >= 330 && minOfDay <= 1110;

    // Sun position arc (smoothly dips below horizon outside daytime)
    const sunDist = 150;
    const sunX = Math.cos(sunAngle) * sunDist * -1;
    let sunY: number;
    if (isDay) {
      sunY = Math.sin(sunAngle) * sunDist;
    } else if (minOfDay >= 315 && minOfDay < 330) {
      sunY = lerp(-20, 0, cosineEase((minOfDay - 315) / 15));
    } else if (minOfDay > 1110 && minOfDay <= 1125) {
      sunY = lerp(0, -20, cosineEase((minOfDay - 1110) / 15));
    } else {
      sunY = -20;
    }
    const sunZ = Math.sin(sunAngle * 0.5) * 50;

    // Sample sky/lighting keyframes with cosine easing
    let k0 = SKY_KEYFRAMES[0]!;
    let k1 = SKY_KEYFRAMES[SKY_KEYFRAMES.length - 1]!;
    for (let i = 0; i < SKY_KEYFRAMES.length - 1; i++) {
      const a = SKY_KEYFRAMES[i]!;
      const b = SKY_KEYFRAMES[i + 1]!;
      if (minOfDay >= a.minute && minOfDay <= b.minute) {
        k0 = a;
        k1 = b;
        break;
      }
    }

    const span = k1.minute - k0.minute;
    const t = span > 0 ? cosineEase((minOfDay - k0.minute) / span) : 0;

    return {
      sunColor: lerpColor(k0.sunColor, k1.sunColor, t),
      sunIntensity: Math.max(0, lerp(k0.sunIntensity, k1.sunIntensity, t)),
      sunPosition: [sunX, sunY, sunZ],
      skyColor: lerpColor(k0.skyColor, k1.skyColor, t),
      skyTopColor: lerpColor(k0.skyTopColor, k1.skyTopColor, t),
      skyHorizonColor: lerpColor(k0.skyHorizonColor, k1.skyHorizonColor, t),
      fogColor: lerpColor(k0.fogColor, k1.fogColor, t),
      ambientColor: lerpColor(k0.ambientColor, k1.ambientColor, t),
      groundColor: lerpColor(k0.groundColor, k1.groundColor, t),
      ambientIntensity: lerp(k0.ambientIntensity, k1.ambientIntensity, t),
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
        intensity: 6.0,
        penumbra: 0.4,
        color: 0xf8fafc, // Crisp cool-white LED
      };
    }

    return {
      angle: 0.45, // ~26° standard halogen cone
      distance: 38,
      intensity: 3.0,
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
