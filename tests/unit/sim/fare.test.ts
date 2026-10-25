import { describe, it, expect } from 'vitest';
import { fairFare, surgeAt, isRushHourMinute, isLateNightMinute } from '../../../src/sim/negotiation/fare';

describe('fare model', () => {
  it('fairFare monotonic in km and minutes', () => {
    // Monotonic in km
    for (let km = 0; km < 25; km += 0.5) {
      const fare1 = fairFare(km, 10, 1.0);
      const fare2 = fairFare(km + 0.5, 10, 1.0);
      expect(fare2).toBeGreaterThanOrEqual(fare1);
    }

    // Monotonic in minutes
    for (let min = 0; min < 60; min += 2) {
      const fare1 = fairFare(5, min, 1.0);
      const fare2 = fairFare(5, min + 2, 1.0);
      expect(fare2).toBeGreaterThanOrEqual(fare1);
    }

    // Always rounded to multiple of 5 and >= minFare (50)
    for (let km = 0; km < 10; km += 0.3) {
      for (let min = 0; min < 20; min += 1.5) {
        const fare = fairFare(km, min);
        expect(fare % 5).toBe(0);
        expect(fare).toBeGreaterThanOrEqual(50);
      }
    }
  });

  it('surge capped at 1.6', () => {
    // Rush hour (morning 09:00 = 540m) + heavy rain (1.25 * 1.5 = 1.875 -> capped at 1.6)
    const surgeRushRain = surgeAt('testloop', 540, 'heavyRain');
    expect(surgeRushRain).toBe(1.6);
    expect(surgeRushRain).toBeLessThanOrEqual(1.6);

    // Evening rush (18:00 = 1080m) + rain (1.25 * 1.35 = 1.6875 -> capped at 1.6)
    const surgeEvening = surgeAt('testloop', 1080, 'lightRain');
    expect(surgeEvening).toBe(1.6);

    // Midday clear (13:00 = 780m)
    const surgeMidday = surgeAt('testloop', 780, 'clear');
    expect(surgeMidday).toBe(1.0);
  });

  it('identifies rush hour and late night correctly', () => {
    expect(isRushHourMinute(540)).toBe(true); // 9:00 AM
    expect(isRushHourMinute(1100)).toBe(true); // 6:20 PM
    expect(isRushHourMinute(780)).toBe(false); // 1:00 PM
    expect(isLateNightMinute(1400)).toBe(true); // 11:20 PM
    expect(isLateNightMinute(120)).toBe(true); // 2:00 AM
    expect(isLateNightMinute(720)).toBe(false); // 12:00 PM
  });
});
