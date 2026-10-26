import { describe, it, expect, beforeEach } from 'vitest';
import { AudioManager } from '../../../src/audio/AudioManager';

describe('T3.9 Audio System', () => {
  let audio: AudioManager;

  beforeEach(() => {
    audio = new AudioManager();
  });

  it('initializes safely in headless / node environment', () => {
    expect(audio).toBeDefined();
    const vols = audio.getVolumes();
    expect(vols.master).toBe(0.8);
    expect(vols.sfx).toBe(0.8);
    expect(vols.music).toBe(0.5);
  });

  it('clamps and updates volume levels', () => {
    audio.setMasterVolume(1.5); // clamped to 1.0
    expect(audio.getVolumes().master).toBe(1.0);

    audio.setMasterVolume(-0.2); // clamped to 0.0
    expect(audio.getVolumes().master).toBe(0.0);

    audio.setSfxVolume(0.4);
    expect(audio.getVolumes().sfx).toBe(0.4);

    audio.setMusicVolume(0.7);
    expect(audio.getVolumes().music).toBe(0.7);
  });

  it('executes sound triggers without throwing even when AudioContext is absent', () => {
    expect(() => {
      audio.updateEngine(12.5, 0.8);
      audio.startHorn();
      audio.stopHorn();
      audio.playClick();
      audio.playCashRegister();
      audio.setAmbience(0.6, true);
      audio.unlock();
    }).not.toThrow();
  });
});
