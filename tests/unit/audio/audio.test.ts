import { describe, it, expect, beforeEach } from 'vitest';
import { AudioManager, DEFAULT_VOLUMES, bindAudio } from '../../../src/audio';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { DEFAULT_SETTINGS } from '../../../src/ui/store';
import bikes from '../../../data/bikes.json';

// Minimal Web Audio fake: params apply their target at once so gains can be read back.
class FakeParam {
  value = 0;
  setValueAtTime(v: number) { this.value = v; }
  setTargetAtTime(v: number) { this.value = v; }
  exponentialRampToValueAtTime() {}
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  type = '';
  buffer: unknown = null;
  loop = false;
  outputs: unknown[] = [];
  connect(n: unknown) { this.outputs.push(n); return n; }
  start() {}
  stop() {}
}
class FakeContext {
  currentTime = 0;
  sampleRate = 100;
  state = 'running';
  destination = new FakeNode();
  gains: FakeNode[] = [];
  oscillators: FakeNode[] = [];
  createGain() { const n = new FakeNode(); this.gains.push(n); return n; }
  createOscillator() { const n = new FakeNode(); this.oscillators.push(n); return n; }
  createBiquadFilter() { return new FakeNode(); }
  createBufferSource() { return new FakeNode(); }
  createBuffer(_c: number, len: number) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  resume() { return Promise.resolve(); }
}

function unlocked(): { audio: AudioManager; ctx: FakeContext } {
  const ctx = new FakeContext();
  const audio = new AudioManager(() => ctx as unknown as AudioContext);
  audio.unlock();
  return { audio, ctx };
}

describe('T3.9 Audio System', () => {
  let audio: AudioManager;
  let ctx: FakeContext;

  beforeEach(() => {
    ({ audio, ctx } = unlocked());
  });

  it('has no context or channels before the first gesture', () => {
    const fresh = new AudioManager(() => new FakeContext() as unknown as AudioContext);
    expect(fresh.getChannelGain('master')).toBeNull();
    expect(() => {
      fresh.updateEngine(12.5, 0.8);
      fresh.startHorn();
      fresh.playClick();
      fresh.playImpact('crash');
    }).not.toThrow();
  });

  it('starts every channel at the shared defaults', () => {
    expect(audio.getChannelGain('master')).toBe(DEFAULT_VOLUMES.master);
    expect(audio.getChannelGain('sfx')).toBe(DEFAULT_VOLUMES.sfx);
    expect(audio.getChannelGain('ambient')).toBe(DEFAULT_VOLUMES.ambient);
  });

  it('settings defaults come from the audio defaults', () => {
    expect(DEFAULT_SETTINGS.masterVolume).toBe(DEFAULT_VOLUMES.master);
    expect(DEFAULT_SETTINGS.sfxVolume).toBe(DEFAULT_VOLUMES.sfx);
    expect(DEFAULT_SETTINGS.ambientVolume).toBe(DEFAULT_VOLUMES.ambient);
    expect(DEFAULT_SETTINGS.muted).toBe(false);
  });

  it('each setter writes its own channel gain, clamped', () => {
    audio.setMasterVolume(1.5);
    expect(audio.getChannelGain('master')).toBe(1);
    audio.setMasterVolume(-0.2);
    expect(audio.getChannelGain('master')).toBe(0);
    audio.setSfxVolume(0.4);
    expect(audio.getChannelGain('sfx')).toBe(0.4);
    audio.setAmbientVolume(0.3);
    expect(audio.getChannelGain('ambient')).toBe(0.3);
  });

  it('master changes set absolute gains and never compound the ambient beds', () => {
    audio.setAmbience(1, true);
    const beds = ctx.gains.filter((g) => g.gain.value === 0.2 || g.gain.value === 0.35);
    expect(beds).toHaveLength(2);
    for (let i = 0; i < 5; i++) audio.setMasterVolume(0.5);
    expect(audio.getChannelGain('master')).toBe(0.5);
    expect(audio.getChannelGain('ambient')).toBe(DEFAULT_VOLUMES.ambient);
    expect(beds.map((b) => b.gain.value).sort()).toEqual([0.2, 0.35]);
  });

  it('mute zeroes master and unmute restores the saved level', () => {
    audio.setMasterVolume(0.6);
    audio.setMuted(true);
    expect(audio.getChannelGain('master')).toBe(0);
    audio.setMasterVolume(0.7);
    expect(audio.getChannelGain('master')).toBe(0);
    audio.setMuted(false);
    expect(audio.getChannelGain('master')).toBe(0.7);
  });

  it('sources route through sfx and ambient into master', () => {
    const [master, sfx, ambient] = ctx.gains;
    expect(master!.outputs).toContain(ctx.destination);
    expect(sfx!.outputs).toContain(master);
    expect(ambient!.outputs).toContain(master);
    // engine and horn gains feed sfx; city and rain beds feed ambient
    expect(ctx.gains.filter((g) => g.outputs.includes(sfx))).toHaveLength(2);
    expect(ctx.gains.filter((g) => g.outputs.includes(ambient))).toHaveLength(2);
  });

  it('engine pitch applies the bike audioPitch once', () => {
    audio.setEnginePitch(1);
    const base = audio.engineFrequency(20, 0.8);
    audio.setEnginePitch(1.3);
    expect(audio.engineFrequency(20, 0.8)).toBeCloseTo(base * 1.3);
    audio.updateEngine(20, 0.8);
    expect(ctx.oscillators[0]!.frequency.value).toBeCloseTo(base * 1.3);
  });

  it('engine is silent when not running', () => {
    audio.updateEngine(10, 1, true);
    const engineGain = ctx.gains[3]!;
    expect(engineGain.gain.value).toBeCloseTo(0.6);
    audio.updateEngine(10, 1, false);
    expect(engineGain.gain.value).toBe(0);
  });

  it('bikes.json audioPitch values are distinct and in the engine range', () => {
    const pitches = bikes.map((b) => b.audioPitch);
    expect(new Set(pitches).size).toBe(bikes.length);
    for (const p of pitches) {
      audio.setEnginePitch(p);
      expect(audio.getEnginePitch()).toBe(p);
    }
  });

  it('impacts are rate-limited while the bike stays in contact', () => {
    const before = ctx.gains.length;
    audio.playImpact('bump');
    audio.playImpact('bump');
    expect(ctx.gains.length).toBe(before + 1);
    ctx.currentTime = 1;
    audio.playImpact('crash');
    expect(ctx.gains.length).toBe(before + 2);
  });
});

describe('bindAudio', () => {
  it('saved settings drive the channel gains', () => {
    const { audio } = unlocked();
    const bus = new EventBus<GameEvents>();
    let push: (s: typeof DEFAULT_SETTINGS) => void = () => {};
    bindAudio(audio, bus, { subscribe: (fn) => { push = fn; fn(DEFAULT_SETTINGS); } });
    push({ ...DEFAULT_SETTINGS, masterVolume: 0.25, sfxVolume: 0.5, ambientVolume: 0.1 });
    expect(audio.getChannelGain('master')).toBe(0.25);
    expect(audio.getChannelGain('sfx')).toBe(0.5);
    expect(audio.getChannelGain('ambient')).toBe(0.1);
    push({ ...DEFAULT_SETTINGS, muted: true });
    expect(audio.getChannelGain('master')).toBe(0);
  });

  it('sim events play sounds', () => {
    const { audio, ctx } = unlocked();
    const bus = new EventBus<GameEvents>();
    bindAudio(audio, bus, { subscribe: () => {} });
    const count = () => ctx.oscillators.length;
    let n = count();
    bus.emit('ride/requested', { request: {} as never });
    expect(count()).toBeGreaterThan(n);
    n = count();
    bus.emit('ride/completed', { requestId: 'r', receipt: {} as never });
    expect(count()).toBeGreaterThan(n);
    n = count();
    bus.emit('mission/completed', { missionId: 'm' });
    expect(count()).toBeGreaterThan(n);
    const g = ctx.gains.length;
    bus.emit('bike/collision', { severity: 'crash', relSpeedKmh: 40 });
    expect(ctx.gains.length).toBeGreaterThan(g);
  });
});
