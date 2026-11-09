import type { BikeCollisionSeverity } from '../core/types';

export interface AudioVolumes {
  master: number; // 0..1
  sfx: number; // 0..1
  ambient: number; // 0..1: city murmur and rain. The game has no music track.
  muted: boolean;
}

/** The one place volume defaults live; the settings store reads them from here. */
export const DEFAULT_VOLUMES: Readonly<AudioVolumes> = {
  master: 0.8,
  sfx: 0.9,
  ambient: 0.7,
  muted: false,
};

export type AudioChannel = 'master' | 'sfx' | 'ambient';

/** Collisions fire every tick while the bike touches something; one sound per window. */
const IMPACT_COOLDOWN_S = 0.3;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function defaultContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctx ? new Ctx() : null;
}

/**
 * Procedural Web Audio. Every source routes into the sfx or ambient channel,
 * and both channels into master, so each volume is one absolute gain value.
 * The AudioContext is created on the first user gesture (browsers block audio
 * before one).
 */
export class AudioManager {
  private audioContext: AudioContext | null = null;
  private isUnlocked = false;
  private volumes: AudioVolumes = { ...DEFAULT_VOLUMES };

  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;

  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private hornGain: GainNode | null = null;
  private cityBedGain: GainNode | null = null;
  private rainBedGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private enginePitchMult = 1.0;
  private lastImpactAt = -Infinity;

  constructor(private readonly createContext: () => AudioContext | null = defaultContext) {
    if (typeof window !== 'undefined') this.setupUnlockListeners();
  }

  public unlock(): void {
    if (this.isUnlocked) return;
    try {
      this.audioContext = this.createContext();
    } catch {
      this.audioContext = null;
    }
    if (!this.audioContext) return;
    this.isUnlocked = true;
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    this.initAudioNodes();
    this.applyChannelGains();
  }

  public getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  /** Current gain of a channel node, or null before the first gesture. */
  public getChannelGain(channel: AudioChannel): number | null {
    const node = { master: this.masterGain, sfx: this.sfxGain, ambient: this.ambientGain }[channel];
    return node ? node.gain.value : null;
  }

  public setMasterVolume(vol: number): void {
    this.volumes.master = clamp01(vol);
    this.applyChannelGains();
  }

  public setSfxVolume(vol: number): void {
    this.volumes.sfx = clamp01(vol);
    this.applyChannelGains();
  }

  public setAmbientVolume(vol: number): void {
    this.volumes.ambient = clamp01(vol);
    this.applyChannelGains();
  }

  public setMuted(muted: boolean): void {
    this.volumes.muted = muted;
    this.applyChannelGains();
  }

  /** bikes.json `audioPitch` for the bike being ridden. */
  public setEnginePitch(mult: number): void {
    this.enginePitchMult = Math.max(0.5, Math.min(2.0, mult));
  }

  public getEnginePitch(): number {
    return this.enginePitchMult;
  }

  /** Engine frequency in Hz for a speed (m/s) and throttle (0..1). */
  public engineFrequency(speed: number, throttle: number): number {
    const speedFactor = Math.min(speed / 25, 1.2);
    return (55 + speedFactor * 180 + throttle * 25) * this.enginePitchMult;
  }

  /** speed in m/s, throttle 0..1; `running` false silences the engine (menus, pause). */
  public updateEngine(speed: number, throttle: number, running = true): void {
    if (!this.audioContext || !this.engineOsc || !this.engineGain) return;
    const now = this.audioContext.currentTime;
    this.engineOsc.frequency.setTargetAtTime(this.engineFrequency(speed, throttle), now, 0.05);
    const targetVol = running ? 0.15 + throttle * 0.45 : 0;
    this.engineGain.gain.setTargetAtTime(targetVol, now, 0.05);
  }

  public startHorn(): void {
    if (!this.audioContext || !this.hornGain) return;
    this.hornGain.gain.setTargetAtTime(0.5, this.audioContext.currentTime, 0.02);
  }

  public stopHorn(): void {
    if (!this.audioContext || !this.hornGain) return;
    this.hornGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.05);
  }

  public playClick(): void {
    this.tone([800], 0.04, 0.25, 'sine', 400);
  }

  public playCashRegister(): void {
    this.tone([987.77, 1318.51], 0.25, 0.3, 'triangle'); // B5, E6
  }

  /** Phone ping for a new ride or delivery offer. */
  public playNotify(): void {
    this.tone([880, 1174.66], 0.12, 0.25, 'sine'); // A5, D6
  }

  public playMissionComplete(): void {
    this.tone([523.25, 659.25, 783.99], 0.3, 0.3, 'triangle'); // C5 E5 G5
  }

  /** Tyre scrub when the bike starts to wobble. */
  public playWobble(): void {
    this.noiseBurst(0.25, 0.2, 'bandpass', 1800);
  }

  public playImpact(severity: BikeCollisionSeverity): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    if (now - this.lastImpactAt < IMPACT_COOLDOWN_S) return;
    this.lastImpactAt = now;
    const vol = severity === 'crash' ? 0.9 : severity === 'bump' ? 0.5 : 0.2;
    this.noiseBurst(severity === 'crash' ? 0.5 : 0.15, vol, 'lowpass', severity === 'crash' ? 600 : 900);
  }

  /** City murmur scales with traffic density 0..1; rain bed on while raining. */
  public setAmbience(districtDensity: number, isRaining: boolean): void {
    if (!this.cityBedGain || !this.rainBedGain || !this.audioContext) return;
    const now = this.audioContext.currentTime;
    this.cityBedGain.gain.setTargetAtTime(clamp01(districtDensity) * 0.2, now, 0.5);
    this.rainBedGain.gain.setTargetAtTime(isRaining ? 0.35 : 0, now, 0.5);
  }

  /** Absolute gains: changing one channel never compounds another. */
  private applyChannelGains(): void {
    if (!this.audioContext || !this.masterGain || !this.sfxGain || !this.ambientGain) return;
    const now = this.audioContext.currentTime;
    this.masterGain.gain.setValueAtTime(this.volumes.muted ? 0 : this.volumes.master, now);
    this.sfxGain.gain.setValueAtTime(this.volumes.sfx, now);
    this.ambientGain.gain.setValueAtTime(this.volumes.ambient, now);
  }

  private tone(freqs: number[], dur: number, vol: number, type: OscillatorType, endFreq?: number): void {
    const ctx = this.audioContext;
    if (!ctx || !this.sfxGain) return;
    try {
      freqs.forEach((freq, idx) => {
        const start = ctx.currentTime + idx * 0.08;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, start);
        if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
        gain.gain.setValueAtTime(vol, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
        osc.connect(gain);
        gain.connect(this.sfxGain!);
        osc.start(start);
        osc.stop(start + dur);
      });
    } catch {
      // Ignore audio synthesis errors
    }
  }

  private noiseBurst(dur: number, vol: number, filterType: BiquadFilterType, freq: number): void {
    const ctx = this.audioContext;
    if (!ctx || !this.sfxGain || !this.noise) return;
    try {
      const src = ctx.createBufferSource();
      src.buffer = this.noise;
      const filter = ctx.createBiquadFilter();
      filter.type = filterType;
      filter.frequency.setValueAtTime(freq, ctx.currentTime);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain);
      src.start();
      src.stop(ctx.currentTime + dur);
    } catch {
      // Ignore audio synthesis errors
    }
  }

  /** A looping filtered-noise bed feeding `out`. */
  private noiseBed(out: GainNode, filterType: BiquadFilterType, freq: number): void {
    const ctx = this.audioContext!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(freq, ctx.currentTime);
    src.connect(filter);
    filter.connect(out);
    src.start();
  }

  private initAudioNodes(): void {
    const ctx = this.audioContext;
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const gainAt = (v: number, out: AudioNode) => {
        const g = ctx.createGain();
        g.gain.setValueAtTime(v, now);
        g.connect(out);
        return g;
      };

      this.masterGain = gainAt(0, ctx.destination);
      this.sfxGain = gainAt(0, this.masterGain);
      this.ambientGain = gainAt(0, this.masterGain);

      // Two seconds of white noise, shared by impacts, wobble and the ambient beds.
      const len = Math.floor(ctx.sampleRate * 2);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // Engine: sawtooth through a lowpass for a motorcycle thrum.
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(55, now);
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, now);
      this.engineGain = gainAt(0, this.sfxGain);
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineOsc.start();

      // Horn: 440 Hz triangle, gated by its gain.
      const hornOsc = ctx.createOscillator();
      hornOsc.type = 'triangle';
      hornOsc.frequency.setValueAtTime(440, now);
      this.hornGain = gainAt(0, this.sfxGain);
      hornOsc.connect(this.hornGain);
      hornOsc.start();

      this.cityBedGain = gainAt(0, this.ambientGain);
      this.noiseBed(this.cityBedGain, 'lowpass', 400);
      this.rainBedGain = gainAt(0, this.ambientGain);
      this.noiseBed(this.rainBedGain, 'highpass', 2500);
    } catch {
      // Audio nodes creation fallback
    }
  }

  private setupUnlockListeners(): void {
    const unlockHandler = () => {
      this.unlock();
      window.removeEventListener('pointerdown', unlockHandler);
      window.removeEventListener('keydown', unlockHandler);
      window.removeEventListener('touchstart', unlockHandler);
    };
    window.addEventListener('pointerdown', unlockHandler, { passive: true });
    window.addEventListener('keydown', unlockHandler, { passive: true });
    window.addEventListener('touchstart', unlockHandler, { passive: true });
  }
}
