import { BALANCE } from '../../config/balance';
import { isRushHourMinute } from '../../core/clock';
import type { WeatherKind } from '../../core/types';

export { isRushHourMinute };

export function fairFare(
  virtualKm: number,
  etaMin: number,
  surge: number = 1.0
): number {
  const cfg = BALANCE.FARE;
  const raw =
    (cfg.base + Math.max(0, virtualKm) * cfg.perKm + Math.max(0, etaMin) * cfg.perMin) *
    Math.max(1.0, surge);

  const rounded = Math.round(raw / cfg.roundTo) * cfg.roundTo;
  return Math.max(cfg.minFare, rounded);
}

export function isLateNightMinute(minute: number): boolean {
  const m = ((minute % 1440) + 1440) % 1440;
  // Late night: 23:00 - 05:00 (1380 - 1440 or 0 - 300)
  return m >= 1380 || m < 300;
}

export function surgeAt(
  districtDemandOrId: unknown,
  minute: number,
  weather: WeatherKind
): number {
  void districtDemandOrId;
  let mult = 1.0;

  if (isRushHourMinute(minute)) {
    mult *= BALANCE.SURGE.rush;
  } else if (isLateNightMinute(minute)) {
    mult *= BALANCE.SURGE.lateNight;
  }

  if (weather === 'lightRain') {
    mult *= BALANCE.SURGE.rain;
  } else if (weather === 'heavyRain') {
    mult *= BALANCE.SURGE.heavyRain;
  }

  // Capped at BALANCE.SURGE.cap (1.6)
  const capped = Math.min(BALANCE.SURGE.cap, mult);
  return Math.round(capped * 100) / 100;
}
