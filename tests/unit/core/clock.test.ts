import { describe, it, expect } from 'vitest';
import { GameClock } from '../../../src/core/clock';

describe('GameClock', () => {
  it('clock 1 real s = 20 game s', () => {
    const clock = new GameClock(1, 7 * 60); // 07:00
    clock.advance(1); // 1 real second
    // 20 game seconds = 20/60 game minutes = 1/3 game minute
    expect(clock.minutes).toBeCloseTo(7 * 60 + 20 / 60, 5);
  });

  it('clock rolls day at 23:00 only via endShift (not auto)', () => {
    const clock = new GameClock(1, 22 * 60 + 59); // 22:59
    // Advance past 23:00
    clock.advance(10); // 200 game seconds = 3.33 minutes -> 23:02
    expect(clock.day).toBe(1);
    expect(clock.minutes).toBeGreaterThanOrEqual(23 * 60);

    // Call endShift to actually roll day
    clock.endShift();
    expect(clock.day).toBe(2);
    expect(clock.minutes).toBe(7 * 60); // Reset to 07:00 next morning
  });

  it('isRushHour 08:00 true 12:00 false', () => {
    const clock = new GameClock(1, 8 * 60); // 08:00
    expect(clock.isRushHour()).toBe(true);

    const clockMidday = new GameClock(1, 12 * 60); // 12:00
    expect(clockMidday.isRushHour()).toBe(false);

    // Evening rush: 17:00 - 20:00
    const clockEve = new GameClock(1, 18 * 60);
    expect(clockEve.isRushHour()).toBe(true);
  });

  it('hhmm formats correctly', () => {
    const clock = new GameClock(1, 7 * 60 + 5);
    expect(clock.hhmm()).toBe('07:05');
  });
});
