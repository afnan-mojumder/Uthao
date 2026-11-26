import type { BikeCollisionSeverity, WeatherKind } from '../core/types';

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

export const AUDIO_SAMPLE_IDS = [
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

export type AudioSampleId = (typeof AUDIO_SAMPLE_IDS)[number];

/** Collisions fire every tick while the bike touches something; one sound per window. */
const IMPACT_COOLDOWN_S = 0.3;
const BRAKE_COOLDOWN_S = 0.35;
const SHIFT_COOLDOWN_S = 0.18;
const BUMP_COOLDOWN_S = 0.25;

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

function defaultContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Ctx ? new Ctx() : null;
}

function canPlayWebmOpus(): boolean {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return true;
  try {
    const el = document.createElement('audio');
    if (typeof el.canPlayType !== 'function') return true;
    const res = el.canPlayType('audio/webm; codecs="opus"') || el.canPlayType('audio/webm');
    return res === 'probably' || res === 'maybe';
  } catch {
    return true;
  }
}

/**
 * Sample-backed + procedural DSP Web Audio manager.
 * Every source routes into the sfx or ambient channel, and both channels into master,
 * so each volume is one absolute gain value.
 * Curated CC0 WebM/Opus (+ MP3 fallback) clips are decoded lazily when fetch + decodeAudioData
 * are available in a browser context, while procedural Web Audio DSP provides zero-latency
 * synthesis and headless/offline fallback.
 */
export class AudioManager {
  private audioContext: AudioContext | null = null;
  private isUnlocked = false;
  private isDisposed = false;
  private isPlaying = true;
  private suspendedByVisibility = false;
  private volumes: AudioVolumes = { ...DEFAULT_VOLUMES };

  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;

  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineSampleSource: AudioBufferSourceNode | null = null;
  private engineSynthGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private engineGain: GainNode | null = null;
  private hornOsc1: OscillatorNode | null = null;
  private hornOsc2: OscillatorNode | null = null;
  private hornSampleSource: AudioBufferSourceNode | null = null;
  private hornFilter: BiquadFilterNode | null = null;
  private hornSynthGain: GainNode | null = null;
  private hornGain: GainNode | null = null;
  private cityBedSource: AudioBufferSourceNode | null = null;
  private cityBedGain: GainNode | null = null;
  private rainBedSource: AudioBufferSourceNode | null = null;
  private rainBedFilter: BiquadFilterNode | null = null;
  private rainBedGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  private sampleBuffers = new Map<AudioSampleId, AudioBuffer>();
  private samplePromises = new Map<AudioSampleId, Promise<AudioBuffer | null>>();

  private enginePitchMult = 1.0;
  private lastGear = 1;
  private lastRunning = false;
  private activeRainSampleId: 'rain_light' | 'rain_heavy' | null = null;
  private lastImpactAt = -Infinity;
  private lastBrakeAt = -Infinity;
  private lastShiftAt = -Infinity;
  private lastBumpAt = -Infinity;

  private unlockHandler: (() => void) | null = null;
  private visibilityHandler: (() => void) | null = null;

  constructor(private readonly createContext: () => AudioContext | null = defaultContext) {
    if (typeof window !== 'undefined') this.setupUnlockListeners();
    if (typeof document !== 'undefined') this.setupVisibilityListener();
  }

  public unlock(): void {
    if (this.isDisposed) return;

    if (!this.audioContext) {
      try {
        this.audioContext = this.createContext();
      } catch {
        this.audioContext = null;
      }
      if (!this.audioContext) return;
      this.initAudioNodes();
      this.applyChannelGains();
      this.preloadSamples();
    }

    if (this.isUnlocked && this.audioContext?.state === 'running') {
      return;
    }

    if (this.audioContext.state === 'running') {
      this.isUnlocked = true;
      this.removeUnlockListeners();
      return;
    }

    if (this.audioContext.state === 'suspended' || (this.audioContext.state as string) === 'interrupted') {
      const p: unknown = this.audioContext.resume?.();
      if (p !== null && typeof p === 'object' && 'then' in p && typeof (p as Promise<void>).then === 'function') {
        (p as Promise<void>)
          .then(() => {
            if (this.audioContext?.state === 'running') {
              this.isUnlocked = true;
              this.removeUnlockListeners();
            }
          })
          .catch(() => {});
      }
      if ((this.audioContext.state as string) === 'running') {
        this.isUnlocked = true;
        this.removeUnlockListeners();
      }
    }
  }

  public handleVisibilityChange(hidden?: boolean): void {
    if (this.isDisposed || !this.audioContext) return;
    const isHidden =
      hidden !== undefined
        ? hidden
        : typeof document !== 'undefined'
          ? Boolean(document.hidden)
          : false;

    if (isHidden) {
      this.stopHorn();
      if (this.audioContext.state === 'running' && typeof this.audioContext.suspend === 'function') {
        this.suspendedByVisibility = true;
        this.audioContext.suspend().catch(() => {});
      }
    } else if (
      (this.suspendedByVisibility ||
        this.audioContext.state === 'suspended' ||
        (this.audioContext.state as string) === 'interrupted') &&
      typeof this.audioContext.resume === 'function'
    ) {
      this.suspendedByVisibility = false;
      this.audioContext.resume().catch(() => {
        if (!this.isDisposed) {
          this.isUnlocked = false;
          this.setupUnlockListeners();
        }
      });
    }
  }

  public dispose(): void {
    if (this.isDisposed) return;
    this.isDisposed = true;
    this.removeUnlockListeners();
    if (typeof document !== 'undefined' && this.visibilityHandler) {
      document.removeEventListener('visibilitychange', this.visibilityHandler);
      this.visibilityHandler = null;
    }

    const stopNode = (node: { stop?: () => void; disconnect?: () => void } | null) => {
      if (!node) return;
      try {
        node.stop?.();
      } catch {
        // Ignore already-stopped node
      }
      try {
        node.disconnect?.();
      } catch {
        // Ignore disconnect error
      }
    };

    stopNode(this.engineOsc);
    stopNode(this.engineSubOsc);
    stopNode(this.engineSampleSource);
    stopNode(this.hornOsc1);
    stopNode(this.hornOsc2);
    stopNode(this.hornSampleSource);
    stopNode(this.cityBedSource);
    stopNode(this.rainBedSource);

    for (const g of [
      this.engineSynthGain,
      this.engineFilter,
      this.engineGain,
      this.hornFilter,
      this.hornSynthGain,
      this.hornGain,
      this.cityBedGain,
      this.rainBedFilter,
      this.rainBedGain,
      this.sfxGain,
      this.ambientGain,
      this.masterGain,
      this.compressor,
    ]) {
      try {
        g?.disconnect?.();
      } catch {
        // Ignore
      }
    }

    this.engineOsc = null;
    this.engineSubOsc = null;
    this.engineSampleSource = null;
    this.engineSynthGain = null;
    this.engineFilter = null;
    this.engineGain = null;
    this.hornOsc1 = null;
    this.hornOsc2 = null;
    this.hornSampleSource = null;
    this.hornFilter = null;
    this.hornSynthGain = null;
    this.hornGain = null;
    this.cityBedSource = null;
    this.cityBedGain = null;
    this.rainBedSource = null;
    this.rainBedFilter = null;
    this.rainBedGain = null;
    this.activeRainSampleId = null;
    this.sfxGain = null;
    this.ambientGain = null;
    this.masterGain = null;
    this.compressor = null;
    this.sampleBuffers.clear();
    this.samplePromises.clear();

    const ctx = this.audioContext;
    this.audioContext = null;
    this.isUnlocked = false;
    if (ctx && typeof ctx.close === 'function' && ctx.state !== 'closed') {
      try {
        ctx.close().catch(() => {});
      } catch {
        // Ignore close error
      }
    }
  }

  public getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  /** Current gain of a channel node, or null before the first gesture / after dispose. */
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

  /**
   * Engine frequency in Hz for a speed (m/s), throttle (0..1), and optional gear (1..5) & rpmNorm (0..1).
   * Uses `Math.abs(speed)` so reverse never drives frequency below idle.
   */
  public engineFrequency(
    speed: number,
    throttle: number,
    gear?: number,
    rpmNorm?: number
  ): number {
    const absSpeed = Math.abs(speed);
    const speedFactor = Math.min(absSpeed / 25, 1.2);
    const cleanThrottle = clamp01(throttle);
    let baseFreq = 55 + speedFactor * 180 + cleanThrottle * 25;
    if (gear !== undefined || rpmNorm !== undefined) {
      const g = Math.max(1, Math.min(5, gear ?? 1));
      const rpm = clamp01(rpmNorm ?? 0.15);
      const gearOffset = (g - 1) * 10;
      const rpmOffset = (rpm - 0.15) * 85;
      baseFreq = 55 + speedFactor * 115 + gearOffset + rpmOffset + cleanThrottle * 22;
    }
    return baseFreq * this.enginePitchMult;
  }

  /** speed in m/s, throttle 0..1; `running` false silences the engine (menus, pause). */
  public updateEngine(
    speed: number,
    throttle: number,
    running = true,
    gear?: number,
    rpmNorm?: number
  ): void {
    if (!this.audioContext || !this.engineOsc || !this.engineGain) return;
    const now = this.audioContext.currentTime;
    const absSpeed = Math.abs(speed);
    const cleanThrottle = clamp01(throttle);

    if (running && !this.lastRunning) {
      this.lastGear = gear ?? 1;
    } else if (running && gear !== undefined && gear !== this.lastGear) {
      this.playGearShift(gear);
      this.lastGear = gear;
    }
    this.lastRunning = running;

    const freq = this.engineFrequency(absSpeed, cleanThrottle, gear, rpmNorm);
    this.engineOsc.frequency.setTargetAtTime(freq, now, 0.05);
    if (this.engineSubOsc) {
      this.engineSubOsc.frequency.setTargetAtTime(freq * 0.5, now, 0.05);
    }
    if (this.engineSampleSource?.playbackRate) {
      const rate = Math.max(0.5, Math.min(2.6, freq / 110));
      this.engineSampleSource.playbackRate.setTargetAtTime(rate, now, 0.05);
    }
    if (this.engineFilter) {
      const rpmBoost = rpmNorm !== undefined ? clamp01(rpmNorm) * 280 : 0;
      this.engineFilter.frequency.setTargetAtTime(
        320 + cleanThrottle * 1100 + Math.min(absSpeed, 25) * 18 + rpmBoost,
        now,
        0.06
      );
    }
    const targetVol = running ? 0.15 + cleanThrottle * 0.45 : 0;
    this.engineGain.gain.setTargetAtTime(targetVol, now, 0.05);
    if (!running) {
      this.stopHorn();
    }
  }

  public startHorn(): void {
    if (!this.audioContext || !this.hornGain || !this.isPlaying) return;
    this.hornGain.gain.setTargetAtTime(0.5, this.audioContext.currentTime, 0.02);
  }

  public stopHorn(): void {
    if (!this.audioContext || !this.hornGain) return;
    this.hornGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.05);
  }

  public playClick(): void {
    if (!this.playOneShotSample('ui_click', 0.25)) {
      this.tone([800], 0.04, 0.25, 'sine', 400);
    }
  }

  public playCashRegister(): void {
    if (!this.playOneShotSample('cash', 0.35)) {
      this.tone([987.77, 1318.51], 0.25, 0.3, 'triangle'); // B5, E6
    }
  }

  /** Phone ping for a new ride or delivery offer. */
  public playNotify(): void {
    this.playPhoneRing();
  }

  public playPhoneRing(): void {
    if (!this.playOneShotSample('phone_ring', 0.32)) {
      this.tone([880, 1174.66], 0.12, 0.25, 'sine'); // A5, D6
    }
  }

  public playMissionComplete(): void {
    this.tone([523.25, 659.25, 783.99], 0.3, 0.3, 'triangle'); // C5 E5 G5
  }

  /** Warm ascending chime when a passenger boards or ride starts. */
  public playBoarding(): void {
    this.tone([523.25, 659.25], 0.11, 0.18, 'sine');
  }

  /** Low suspension thump when crossing a speed bump. */
  public playSpeedBump(): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    if (now - this.lastBumpAt < BUMP_COOLDOWN_S) return;
    this.lastBumpAt = now;
    this.noiseBurst(0.09, 0.22, 'lowpass', 240);
    this.tone([105], 0.08, 0.18, 'sine', 62);
  }

  /** Descending engine sputter on fuel empty or mechanical breakdown. */
  public playEngineStall(): void {
    this.tone([150, 95, 58], 0.14, 0.22, 'sawtooth', 42);
  }

  /** Sharp tyre air-hiss pop on puncture. */
  public playPuncture(): void {
    this.noiseBurst(0.22, 0.3, 'bandpass', 2200);
  }

  /** Starter motor crank + combustion catch. */
  public playIgnition(): void {
    this.tone([110, 165], 0.14, 0.22, 'sawtooth', 95);
    this.noiseBurst(0.12, 0.14, 'lowpass', 520);
  }

  /** Mechanical clutch/gear dog engagement clunk. */
  public playGearShift(gear = 2): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    if (now - this.lastShiftAt < SHIFT_COOLDOWN_S) return;
    this.lastShiftAt = now;
    const base = 180 + Math.max(1, Math.min(5, gear)) * 22;
    this.tone([base], 0.055, 0.16, 'triangle', base * 0.72);
    this.noiseBurst(0.045, 0.12, 'bandpass', 950);
  }

  /** Brake pad/tyre friction scrub on hard braking. */
  public playBrake(intensity = 0.7): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    if (now - this.lastBrakeAt < BRAKE_COOLDOWN_S) return;
    this.lastBrakeAt = now;
    const vol = Math.max(0.08, Math.min(0.28, clamp01(intensity) * 0.26));
    this.noiseBurst(0.16, vol, 'bandpass', 1650);
  }

  /** Monsoon thunder crack & low rumble on heavy rain transition. */
  public playThunder(): void {
    if (!this.playOneShotSample('thunder', 0.45)) {
      this.tone([68, 46], 0.45, 0.28, 'sawtooth', 32);
      this.noiseBurst(0.55, 0.32, 'lowpass', 380);
    }
  }

  /** Tyre scrub when the bike starts to wobble. */
  public playWobble(): void {
    this.noiseBurst(0.25, 0.2, 'bandpass', 1800);
  }

  /** Air whoosh when threading close past traffic at speed. */
  public playNearMiss(): void {
    this.noiseBurst(0.18, 0.28, 'bandpass', 1400);
  }

  public playImpact(severity: BikeCollisionSeverity): void {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    if (now - this.lastImpactAt < IMPACT_COOLDOWN_S) return;
    this.lastImpactAt = now;
    const vol = severity === 'crash' ? 0.9 : severity === 'bump' ? 0.5 : 0.2;
    const preferredSample: AudioSampleId =
      severity === 'scuff' ? 'impact_light' : severity === 'crash' ? 'impact_metal' : 'impact';
    const played =
      this.playOneShotSample(preferredSample, vol * 0.75, severity === 'crash' ? 0.85 : 1.1) ||
      (preferredSample !== 'impact' &&
        this.playOneShotSample('impact', vol * 0.75, severity === 'crash' ? 0.85 : 1.1));
    if (played) {
      this.noiseBurst(severity === 'crash' ? 0.2 : 0.08, vol * 0.25, 'lowpass', 360);
    } else {
      this.noiseBurst(
        severity === 'crash' ? 0.5 : 0.15,
        vol,
        'lowpass',
        severity === 'crash' ? 600 : 900
      );
    }
  }

  /**
   * City murmur scales with traffic density 0..1; rain bed scales with light/heavy rain.
   * When `playing` is false (Title screen or Pause), `ambientGain` ramps to 0 so menus are completely silent.
   */
  public setAmbience(
    districtDensity: number,
    rainOrWeather: boolean | WeatherKind,
    playing = true
  ): void {
    this.isPlaying = playing;
    if (!this.cityBedGain || !this.rainBedGain || !this.audioContext || !this.ambientGain) return;
    const now = this.audioContext.currentTime;

    if (!playing) {
      this.ambientGain.gain.setTargetAtTime(0, now, 0.04);
      this.stopHorn();
      return;
    }

    this.ambientGain.gain.setTargetAtTime(this.volumes.ambient, now, 0.08);
    this.cityBedGain.gain.setTargetAtTime(clamp01(districtDensity) * 0.2, now, 0.5);

    let rainGain = 0;
    let rainCutoff = 3400;
    let wantHeavyRain = false;
    if (typeof rainOrWeather === 'boolean') {
      rainGain = rainOrWeather ? 0.35 : 0;
      rainCutoff = 3400;
      wantHeavyRain = rainOrWeather;
    } else if (rainOrWeather === 'heavyRain') {
      rainGain = 0.45;
      rainCutoff = 4200;
      wantHeavyRain = true;
    } else if (rainOrWeather === 'lightRain') {
      rainGain = 0.25;
      rainCutoff = 2800;
      wantHeavyRain = false;
    }

    if (rainGain > 0) {
      this.syncRainSample(wantHeavyRain);
    }
    if (this.rainBedFilter) {
      this.rainBedFilter.frequency.setTargetAtTime(rainCutoff, now, 0.3);
    }
    this.rainBedGain.gain.setTargetAtTime(rainGain, now, 0.5);
  }

  /** Absolute gains: changing one channel never compounds another. */
  private applyChannelGains(): void {
    if (!this.audioContext || !this.masterGain || !this.sfxGain || !this.ambientGain) return;
    const now = this.audioContext.currentTime;
    this.masterGain.gain.setValueAtTime(this.volumes.muted ? 0 : this.volumes.master, now);
    this.sfxGain.gain.setValueAtTime(this.volumes.sfx, now);
    this.ambientGain.gain.setValueAtTime(this.isPlaying ? this.volumes.ambient : 0, now);
  }

  private playOneShotSample(id: AudioSampleId, vol: number, playbackRate = 1): boolean {
    const ctx = this.audioContext;
    const buf = this.sampleBuffers.get(id);
    if (!ctx || !this.sfxGain || !buf) return false;
    try {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      if (src.playbackRate) {
        src.playbackRate.setValueAtTime(playbackRate, ctx.currentTime);
      }
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      src.connect(gain);
      gain.connect(this.sfxGain);
      src.onended = () => {
        try {
          src.disconnect();
          gain.disconnect();
        } catch {
          // Ignore disconnect errors
        }
      };
      src.start();
      return true;
    } catch {
      return false;
    }
  }

  private preloadSamples(): void {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    // Skip network fetches in headless Vitest/Node where location origin is absent or mock context is tiny
    if (!this.audioContext || this.audioContext.sampleRate < 8000) return;

    const ext = canPlayWebmOpus() ? 'webm' : 'mp3';
    for (const id of AUDIO_SAMPLE_IDS) {
      void this.loadSample(id, ext);
    }
  }

  private async loadSample(id: AudioSampleId, preferredExt: 'webm' | 'mp3'): Promise<AudioBuffer | null> {
    if (this.sampleBuffers.has(id)) return this.sampleBuffers.get(id)!;
    if (this.samplePromises.has(id)) return this.samplePromises.get(id)!;

    const task = (async (): Promise<AudioBuffer | null> => {
      const ctx = this.audioContext;
      if (!ctx || typeof ctx.decodeAudioData !== 'function' || typeof fetch !== 'function') {
        return null;
      }
      const exts: Array<'webm' | 'mp3'> =
        preferredExt === 'webm' ? ['webm', 'mp3'] : ['mp3', 'webm'];
      for (const ext of exts) {
        try {
          const resp = await fetch(`/assets/audio/${id}.${ext}`);
          if (!resp.ok) continue;
          const ab = await resp.arrayBuffer();
          if (this.isDisposed || !this.audioContext) return null;
          const decoded = await ctx.decodeAudioData(ab);
          if (this.isDisposed || !this.audioContext) return null;
          this.sampleBuffers.set(id, decoded);
          this.attachLoopSampleIfReady(id, decoded);
          return decoded;
        } catch {
          // Try fallback format or keep procedural DSP fallback
        }
      }
      return null;
    })();

    this.samplePromises.set(id, task);
    return task;
  }

  private syncRainSample(wantHeavy: boolean): void {
    const ctx = this.audioContext;
    if (!ctx || this.isDisposed || !this.rainBedFilter) return;
    const targetId: 'rain_light' | 'rain_heavy' = wantHeavy ? 'rain_heavy' : 'rain_light';
    const fallbackId: 'rain_light' | 'rain_heavy' = wantHeavy ? 'rain_light' : 'rain_heavy';
    const chosenId = this.sampleBuffers.has(targetId)
      ? targetId
      : this.sampleBuffers.has(fallbackId)
        ? fallbackId
        : null;
    if (!chosenId || this.activeRainSampleId === chosenId) return;
    const buffer = this.sampleBuffers.get(chosenId);
    if (!buffer) return;
    try {
      if (this.rainBedSource) {
        try {
          this.rainBedSource.stop();
          this.rainBedSource.disconnect();
        } catch {
          // Ignore
        }
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      src.connect(this.rainBedFilter);
      src.start();
      this.rainBedSource = src;
      this.activeRainSampleId = chosenId;
    } catch {
      // Keep procedural rain bed
    }
  }

  private attachLoopSampleIfReady(id: AudioSampleId, buffer: AudioBuffer): void {
    const ctx = this.audioContext;
    if (!ctx || this.isDisposed) return;
    try {
      if (id === 'engine' && this.engineFilter && !this.engineSampleSource) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(this.engineFilter);
        src.start();
        this.engineSampleSource = src;
        if (this.engineSynthGain) {
          this.engineSynthGain.gain.setTargetAtTime(0.22, ctx.currentTime, 0.08);
        }
      } else if (id === 'horn' && this.hornGain && !this.hornSampleSource) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(this.hornGain);
        src.start();
        this.hornSampleSource = src;
        if (this.hornSynthGain) {
          this.hornSynthGain.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
        }
      } else if (id === 'dhaka_street' && this.cityBedGain) {
        if (this.cityBedSource) {
          try {
            this.cityBedSource.stop();
            this.cityBedSource.disconnect();
          } catch {
            // Ignore
          }
        }
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.loop = true;
        src.connect(this.cityBedGain);
        src.start();
        this.cityBedSource = src;
      } else if (id === 'rain_heavy' || id === 'rain_light') {
        this.syncRainSample(id === 'rain_heavy');
      }
    } catch {
      // Keep procedural loop
    }
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
        osc.onended = () => {
          try {
            osc.disconnect();
            gain.disconnect();
          } catch {
            // Ignore
          }
        };
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
      src.onended = () => {
        try {
          src.disconnect();
          filter.disconnect();
          gain.disconnect();
        } catch {
          // Ignore
        }
      };
      src.start();
      src.stop(ctx.currentTime + dur);
    } catch {
      // Ignore audio synthesis errors
    }
  }

  /** A looping filtered-noise bed feeding `out`. */
  private noiseBed(
    out: GainNode,
    filterType: BiquadFilterType,
    freq: number
  ): { src: AudioBufferSourceNode; filter: BiquadFilterNode } {
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
    return { src, filter };
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

      let finalDest: AudioNode = ctx.destination;
      if (typeof ctx.createDynamicsCompressor === 'function') {
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.setValueAtTime(-6, now);
        comp.knee.setValueAtTime(12, now);
        comp.ratio.setValueAtTime(4, now);
        comp.attack.setValueAtTime(0.005, now);
        comp.release.setValueAtTime(0.12, now);
        comp.connect(ctx.destination);
        this.compressor = comp;
        finalDest = comp;
      }

      // Keep the first 7 GainNodes in fixed order: master, sfx, ambient, engine, horn, cityBed, rainBed.
      this.masterGain = gainAt(0, finalDest);
      this.sfxGain = gainAt(0, this.masterGain);
      this.ambientGain = gainAt(0, this.masterGain);

      // Two seconds of white noise, shared by impacts, wobble and the ambient beds.
      const len = Math.floor(ctx.sampleRate * 2);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      // Engine: sawtooth + sub-octave triangle (+ sample layer when decoded) through a throttle-modulated lowpass.
      this.engineOsc = ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(55, now);
      this.engineSubOsc = ctx.createOscillator();
      this.engineSubOsc.type = 'triangle';
      this.engineSubOsc.frequency.setValueAtTime(27.5, now);
      this.engineFilter = ctx.createBiquadFilter();
      this.engineFilter.type = 'lowpass';
      this.engineFilter.frequency.setValueAtTime(320, now);
      this.engineGain = gainAt(0, this.sfxGain);

      // Horn: dual-tone Dhaka bike horn (440 Hz + 554 Hz).
      this.hornOsc1 = ctx.createOscillator();
      this.hornOsc1.type = 'triangle';
      this.hornOsc1.frequency.setValueAtTime(440, now);
      this.hornOsc2 = ctx.createOscillator();
      this.hornOsc2.type = 'sawtooth';
      this.hornOsc2.frequency.setValueAtTime(554.37, now);
      this.hornGain = gainAt(0, this.sfxGain);

      this.cityBedGain = gainAt(0, this.ambientGain);
      const cityBed = this.noiseBed(this.cityBedGain, 'lowpass', 400);
      this.cityBedSource = cityBed.src;

      this.rainBedGain = gainAt(0, this.ambientGain);
      const rainBed = this.noiseBed(this.rainBedGain, 'lowpass', 3600);
      this.rainBedSource = rainBed.src;
      this.rainBedFilter = rainBed.filter;

      this.engineSynthGain = gainAt(1, this.engineFilter);
      this.engineOsc.connect(this.engineSynthGain);
      this.engineSubOsc.connect(this.engineSynthGain);
      this.engineFilter.connect(this.engineGain);
      this.engineOsc.start();
      this.engineSubOsc.start();

      this.hornFilter = ctx.createBiquadFilter();
      this.hornFilter.type = 'lowpass';
      this.hornFilter.frequency.setValueAtTime(1550, now);
      this.hornFilter.Q.setValueAtTime(1.1, now);
      this.hornSynthGain = gainAt(1, this.hornGain);
      this.hornOsc1.connect(this.hornFilter);
      this.hornOsc2.connect(this.hornFilter);
      this.hornFilter.connect(this.hornSynthGain);
      this.hornOsc1.start();
      this.hornOsc2.start();
    } catch {
      // Audio nodes creation fallback
    }
  }

  private setupUnlockListeners(): void {
    const unlockHandler = () => {
      this.unlock();
    };
    this.unlockHandler = unlockHandler;
    window.addEventListener('pointerdown', unlockHandler, { passive: true });
    window.addEventListener('keydown', unlockHandler, { passive: true });
    window.addEventListener('touchstart', unlockHandler, { passive: true });
  }

  private removeUnlockListeners(): void {
    if (typeof window === 'undefined' || !this.unlockHandler) return;
    window.removeEventListener('pointerdown', this.unlockHandler);
    window.removeEventListener('keydown', this.unlockHandler);
    window.removeEventListener('touchstart', this.unlockHandler);
    this.unlockHandler = null;
  }

  private setupVisibilityListener(): void {
    const onVisibility = () => {
      this.handleVisibilityChange();
    };
    this.visibilityHandler = onVisibility;
    document.addEventListener('visibilitychange', onVisibility);
  }
}
