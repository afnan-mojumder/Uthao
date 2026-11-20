import { TIME_SCALE } from '../config/constants';
import { BALANCE } from '../config/balance';

export { TIME_SCALE };

export function isRushHourMinute(minute: number): boolean {
  const m = ((minute % 1440) + 1440) % 1440;
  const r = BALANCE.RUSH_HOUR;
  return (
    (m >= r.morningStartMin && m <= r.morningEndMin) ||
    (m >= r.eveningStartMin && m <= r.eveningEndMin)
  );
}

export class GameClock {
  day: number;
  minutes: number; // game minutes since 00:00

  constructor(day = 1, minutes = 7 * 60) {
    this.day = day;
    this.minutes = minutes;
  }

  advance(realDt: number): void {
    // 1 real second = TIME_SCALE game seconds = (TIME_SCALE / 60) game minutes
    this.minutes += (realDt * TIME_SCALE) / 60;
  }

  endShift(): void {
    this.day += 1;
    this.minutes = 7 * 60; // Start next day at 07:00
  }

  hhmm(): string {
    const totalMinutes = Math.floor(this.minutes);
    const h = Math.floor(totalMinutes / 60) % 24;
    const m = totalMinutes % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
  }

  isRushHour(): boolean {
    return isRushHourMinute(this.minutes);
  }
}
