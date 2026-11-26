import { describe, it, expect, beforeEach } from 'vitest';
import { AudioManager, DEFAULT_VOLUMES, bindAudio, AUDIO_SAMPLE_IDS } from '../../../src/audio';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { DEFAULT_SETTINGS } from '../../../src/ui/store';
import bikes from '../../../data/bikes.json';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Minimal Web Audio fake: params apply their target at once so gains can be read back.
class FakeParam {
  value = 0;
  setValueAtTime(v: number) { this.value = v; }
  setTargetAtTime(v: number) { this.value = v; }
  exponentialRampToValueAtTime(v: number) { this.value = v; }
  linearRampToValueAtTime(v: number) { this.value = v; }
}
class FakeNode {
  gain = new FakeParam();
  frequency = new FakeParam();
  playbackRate = new FakeParam();
  type = '';
  buffer: unknown = null;
  loop = false;
  outputs: unknown[] = [];
  disconnected = false;
  connect(n: unknown) { this.outputs.push(n); return n; }
  disconnect() { this.disconnected = true; this.outputs = []; }
  start() {}
  stop() {}
}
class FakeContext {
  currentTime = 0;
  sampleRate = 100;
  state: 'running' | 'suspended' | 'closed' = 'running';
  destination = new FakeNode();
  gains: FakeNode[] = [];
  oscillators: FakeNode[] = [];
  bufferSources: FakeNode[] = [];
  resumeCalls = 0;
  suspendCalls = 0;
  closeCalls = 0;
  createGain() { const n = new FakeNode(); this.gains.push(n); return n; }
  createOscillator() { const n = new FakeNode(); this.oscillators.push(n); return n; }
  createBiquadFilter() { return new FakeNode(); }
  createBufferSource() { const n = new FakeNode(); this.bufferSources.push(n); return n; }
  createBuffer(_c: number, len: number) { const d = new Float32Array(len); return { getChannelData: () => d }; }
  decodeAudioData() {
    const d = new Float32Array(100);
    return Promise.resolve({ getChannelData: () => d, duration: 1 } as unknown as AudioBuffer);
  }
  resume() {
    this.resumeCalls++;
    this.state = 'running';
    return Promise.resolve();
  }
  suspend() {
    this.suspendCalls++;
    this.state = 'suspended';
    return Promise.resolve();
  }
  close() {
    this.closeCalls++;
    this.state = 'closed';
    return Promise.resolve();
  }
}

function unlocked(): { audio: AudioManager; ctx: FakeContext } {
  const ctx = new FakeContext();
  const audio = new AudioManager(() => ctx as unknown as AudioContext);
  audio.unlock();
  return { audio, ctx };
}

describe('T3.9 / P7.1 Audio System', () => {
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
      fresh.playBrake(0.8);
      fresh.playGearShift(2);
      fresh.playIgnition();
      fresh.playPhoneRing();
      fresh.playThunder();
    }).not.toThrow();
    fresh.dispose();
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
    expect(ctx.gains.filter((g) => g.outputs.includes(sfx)).length).toBeGreaterThanOrEqual(2);
    expect(ctx.gains.filter((g) => g.outputs.includes(ambient)).length).toBeGreaterThanOrEqual(2);
  });

  it('engine pitch applies the bike audioPitch once and incorporates gear and rpmNorm', () => {
    audio.setEnginePitch(1);
    const base = audio.engineFrequency(20, 0.8);
    audio.setEnginePitch(1.3);
    expect(audio.engineFrequency(20, 0.8)).toBeCloseTo(base * 1.3);
    audio.updateEngine(20, 0.8);
    expect(ctx.oscillators[0]!.frequency.value).toBeCloseTo(base * 1.3);

    // Gear & RPM awareness: higher rpmNorm at the same speed raises engine frequency
    const lowRpmFreq = audio.engineFrequency(12, 0.5, 2, 0.25);
    const highRpmFreq = audio.engineFrequency(12, 0.5, 2, 0.9);
    expect(highRpmFreq).toBeGreaterThan(lowRpmFreq);
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

  it('silences ambience when playing=false (Title/Pause), uses |speed| for reverse, and disposes cleanly', () => {
    // 1. Ambience is active when playing=true, silenced completely when playing=false
    audio.setAmbience(0.8, true, true);
    expect(audio.getChannelGain('ambient')).toBeCloseTo(DEFAULT_VOLUMES.ambient);
    audio.startHorn();
    audio.updateEngine(15, 0.7, true);

    audio.setAmbience(0.8, true, false);
    audio.updateEngine(15, 0.7, false);
    expect(audio.getChannelGain('ambient')).toBe(0);

    // Restoring playing=true restores ambient channel gain
    audio.setAmbience(0.8, 'lightRain', true);
    expect(audio.getChannelGain('ambient')).toBeCloseTo(DEFAULT_VOLUMES.ambient);

    // 2. Reverse speed (< 0) uses Math.abs(speed) so frequency never drops below idle
    const fwdFreq = audio.engineFrequency(1.5, 0.3);
    const revFreq = audio.engineFrequency(-1.5, 0.3);
    expect(revFreq).toBeCloseTo(fwdFreq, 5);
    expect(revFreq).toBeGreaterThan(audio.engineFrequency(0, 0));

    // 3. Clean dispose disconnects nodes and closes context
    audio.dispose();
    expect(ctx.closeCalls).toBe(1);
    expect(audio.getChannelGain('master')).toBeNull();
  });

  it('triggers brake, gear shift, ignition, phone ring, and thunder/rain intensity transitions without throwing', () => {
    const oscBefore = ctx.oscillators.length;
    const gainsBefore = ctx.gains.length;

    expect(() => {
      audio.playIgnition();
      audio.playGearShift(2);
      audio.playGearShift(3);
      audio.playBrake(0.85);
      audio.playPhoneRing();
      audio.playClick();
      audio.playCashRegister();
      audio.playThunder();
      audio.setAmbience(0.6, 'clear', true);
      audio.setAmbience(0.6, 'lightRain', true);
      audio.setAmbience(0.6, 'heavyRain', true);
    }).not.toThrow();

    expect(ctx.oscillators.length).toBeGreaterThan(oscBefore);
    expect(ctx.gains.length).toBeGreaterThan(gainsBefore);

    // Automatic gear shift trigger inside updateEngine when gear changes while running
    ctx.currentTime += 1;
    const beforeShiftGains = ctx.gains.length;
    audio.updateEngine(8, 0.6, true, 1, 0.7);
    audio.updateEngine(11, 0.6, true, 2, 0.45);
    expect(ctx.gains.length).toBeGreaterThan(beforeShiftGains);
  });

  it('retries audioContext.resume() across user gestures until state === "running" and suspends/resumes on visibilitychange', () => {
    let allowResume = false;
    const stubbornCtx = new FakeContext();
    stubbornCtx.state = 'suspended';
    stubbornCtx.resume = () => {
      stubbornCtx.resumeCalls++;
      if (allowResume) {
        stubbornCtx.state = 'running';
      }
      return Promise.resolve();
    };

    const mobileAudio = new AudioManager(() => stubbornCtx as unknown as AudioContext);
    // First gesture creates context, attempts resume(), but browser keeps it suspended
    mobileAudio.unlock();
    expect(stubbornCtx.resumeCalls).toBe(1);
    expect(stubbornCtx.state).toBe('suspended');

    // Second gesture retries resume() because state is still not 'running'
    allowResume = true;
    mobileAudio.unlock();
    expect(stubbornCtx.resumeCalls).toBe(2);
    expect(stubbornCtx.state).toBe('running');

    // Subsequent gesture once running does not redundantly recreate context
    mobileAudio.unlock();
    expect(stubbornCtx.resumeCalls).toBe(2);

    // Tab visibility change suspends when hidden and resumes when visible
    mobileAudio.handleVisibilityChange(true);
    expect(stubbornCtx.suspendCalls).toBe(1);
    expect(stubbornCtx.state).toBe('suspended');

    mobileAudio.handleVisibilityChange(false);
    expect(stubbornCtx.resumeCalls).toBe(3);
    expect(stubbornCtx.state).toBe('running');

    mobileAudio.dispose();
  });

  it('bundles all required curated compressed CC0 audio samples (.webm and .mp3) in public/assets/audio/', () => {
    const requiredClips = [
      'engine',
      'horn',
      'rain_light',
      'rain_heavy',
      'dhaka_street',
      'phone_ring',
      'ui_click',
      'impact',
      'impact_light',
      'impact_metal',
      'cash',
      'thunder',
    ] as const;

    expect(AUDIO_SAMPLE_IDS).toEqual(expect.arrayContaining([...requiredClips]));

    const audioDir = path.resolve('public/assets/audio');
    let totalBytes = 0;
    for (const id of requiredClips) {
      const webmPath = path.join(audioDir, `${id}.webm`);
      const mp3Path = path.join(audioDir, `${id}.mp3`);
      expect(fs.existsSync(webmPath), `Missing ${webmPath}`).toBe(true);
      expect(fs.existsSync(mp3Path), `Missing ${mp3Path}`).toBe(true);
      const webmStat = fs.statSync(webmPath);
      const mp3Stat = fs.statSync(mp3Path);
      expect(webmStat.size).toBeGreaterThan(256);
      expect(mp3Stat.size).toBeGreaterThan(256);
      totalBytes += webmStat.size + mp3Stat.size;
    }
    // Keep total audio bundle lightweight (< 512 KB combined across all formats)
    expect(totalBytes).toBeLessThan(512 * 1024);
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

  it('sim events play sounds including weather transition thunder', () => {
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
    const g2 = ctx.gains.length;
    bus.emit('world/weatherChanged', { from: 'lightRain', to: 'heavyRain' });
    expect(ctx.gains.length).toBeGreaterThan(g2);

    const oscBeforeNew = ctx.oscillators.length;
    bus.emit('ride/started', { requestId: 'r1' });
    expect(ctx.oscillators.length).toBeGreaterThan(oscBeforeNew);

    const gainsBeforeBump = ctx.gains.length;
    bus.emit('bike/speedBump', { speedKmh: 28 });
    expect(ctx.gains.length).toBeGreaterThan(gainsBeforeBump);

    const oscBeforeStall = ctx.oscillators.length;
    bus.emit('bike/fuelEmpty', {});
    expect(ctx.oscillators.length).toBeGreaterThan(oscBeforeStall);

    const oscBeforeBreakdown = ctx.oscillators.length;
    bus.emit('bike/breakdown', { conditionPct: 12 });
    expect(ctx.oscillators.length).toBeGreaterThan(oscBeforeBreakdown);

    const gainsBeforePuncture = ctx.gains.length;
    bus.emit('bike/puncture', {});
    expect(ctx.gains.length).toBeGreaterThan(gainsBeforePuncture);
  });

  it('suppresses duplicate synthetic oscillators when a decoded sample is present and swaps rain_light/rain_heavy beds', () => {
    const { audio, ctx } = unlocked();
    const fakeBuf = { getChannelData: () => new Float32Array(100), duration: 1 } as unknown as AudioBuffer;
    const buffers = (audio as unknown as { sampleBuffers: Map<string, AudioBuffer> }).sampleBuffers;
    buffers.set('ui_click', fakeBuf);
    buffers.set('rain_light', fakeBuf);
    buffers.set('rain_heavy', fakeBuf);

    const oscBefore = ctx.oscillators.length;
    const bufSrcBefore = ctx.bufferSources.length;
    audio.playClick();
    expect(ctx.bufferSources.length).toBe(bufSrcBefore + 1);
    expect(ctx.oscillators.length).toBe(oscBefore);

    const bufSrcBeforeRain = ctx.bufferSources.length;
    audio.setAmbience(0.5, 'lightRain', true);
    expect(ctx.bufferSources.length).toBe(bufSrcBeforeRain + 1);
    audio.setAmbience(0.5, 'heavyRain', true);
    expect(ctx.bufferSources.length).toBe(bufSrcBeforeRain + 2);
  });
});
