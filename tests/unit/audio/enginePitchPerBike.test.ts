import { describe, it, expect } from 'vitest';
import { AudioManager } from '../../../src/audio/AudioManager';
import { getBikeDef } from '../../../src/sim/economy/bikes';

describe('engine pitch follows the bike being ridden (audit: audioPitch was never used)', () => {
  it('a bigger bike sounds higher at the same speed and throttle', () => {
    const audio = new AudioManager(() => null);
    audio.setEnginePitch(getBikeDef('old100').audioPitch);
    const old = audio.engineFrequency(10, 0.5);
    audio.setEnginePitch(getBikeDef('new150').audioPitch);
    const newer = audio.engineFrequency(10, 0.5);
    expect(newer).toBeGreaterThan(old);
  });
});
