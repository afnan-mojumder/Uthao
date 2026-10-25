export const TIME_SCALE = 20;

export class GameClock {
  day: number;
  minutes: number; // game minutes since 00:00

  constructor(day = 1, minutes = 7 * 60) {
    this.day = day;
    this.minutes = minutes;
  }

  advance(realDt: number): void {
    // 1 real second = 20 game seconds = (20 / 60) game minutes
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
    const minOfDay = this.minutes % 1440;
    // Morning rush: 07:30 - 10:00 (450 - 600 min)
    // Evening rush: 17:00 - 20:00 (1020 - 1200 min)
    const morningRush = minOfDay >= 7 * 60 + 30 && minOfDay <= 10 * 60;
    const eveningRush = minOfDay >= 17 * 60 && minOfDay <= 20 * 60;
    return morningRush || eveningRush;
  }
}
