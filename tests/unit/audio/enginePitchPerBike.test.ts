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
    audio.dispose();
  });

  it('scales pitch smoothly across bike.gear and bike.rpmNorm and handles negative reverse speed', () => {
    const audio = new AudioManager(() => null);
    audio.setEnginePitch(getBikeDef('used125').audioPitch);
    const g1Low = audio.engineFrequency(6, 0.4, 1, 0.25);
    const g1High = audio.engineFrequency(6, 0.4, 1, 0.85);
    const g4Mid = audio.engineFrequency(15, 0.4, 4, 0.6);
    expect(g1High).toBeGreaterThan(g1Low);
    expect(g4Mid).toBeGreaterThan(g1Low);
    expect(audio.engineFrequency(-1.2, 0.3, 1, 0.3)).toBeCloseTo(
      audio.engineFrequency(1.2, 0.3, 1, 0.3),
      5
    );
    audio.dispose();
  });
});
