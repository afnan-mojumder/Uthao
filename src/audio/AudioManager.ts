import * as THREE from 'three';

export interface AudioVolumes {
  master: number; // 0..1
  sfx: number; // 0..1
  music: number; // 0..1
}

export class AudioManager {
  readonly listener: THREE.AudioListener | null = null;
  private audioContext: AudioContext | null = null;
  private isUnlocked = false;

  private volumes: AudioVolumes = {
    master: 0.8,
    sfx: 0.8,
    music: 0.5,
  };

  // Sound nodes / generators
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private hornOsc: OscillatorNode | null = null;
  private hornGain: GainNode | null = null;
  private cityBedGain: GainNode | null = null;
  private rainBedGain: GainNode | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioCtx) {
          this.audioContext = new AudioCtx();
        }
      } catch {
        // AudioContext not available in this environment
      }

      try {
        this.listener = new THREE.AudioListener();
      } catch {
        // Fallback if THREE AudioListener fails
      }

      this.setupUnlockListeners();
    }
  }

  public unlock(): void {
    if (this.isUnlocked) return;
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume().catch(() => {});
    }
    this.isUnlocked = true;
    this.initAudioNodes();
  }

  public getVolumes(): AudioVolumes {
    return { ...this.volumes };
  }

  public setMasterVolume(vol: number): void {
    this.volumes.master = Math.max(0, Math.min(1, vol));
    if (this.listener) {
      this.listener.setMasterVolume(this.volumes.master);
    }
    this.updateAmbientGains();
  }

  public setSfxVolume(vol: number): void {
    this.volumes.sfx = Math.max(0, Math.min(1, vol));
  }

  public setMusicVolume(vol: number): void {
    this.volumes.music = Math.max(0, Math.min(1, vol));
    this.updateAmbientGains();
  }

  /**
   * Updates dynamic engine pitch and volume based on speed and throttle.
   * speed in m/s, throttle 0..1
   */
  public updateEngine(speed: number, throttle: number): void {
    if (!this.audioContext || !this.engineOsc || !this.engineGain) return;

    // Pitch scales with speed (approx 50 Hz idle to 240 Hz top gear)
    const baseFreq = 55;
    const speedFactor = Math.min(speed / 25, 1.2);
    const targetFreq = baseFreq + speedFactor * 180 + throttle * 25;

    this.engineOsc.frequency.setTargetAtTime(targetFreq, this.audioContext.currentTime, 0.05);

    // Engine volume scales with throttle + idle base
    const targetVol = (0.15 + throttle * 0.45) * this.volumes.master * this.volumes.sfx;
    this.engineGain.gain.setTargetAtTime(targetVol, this.audioContext.currentTime, 0.05);
  }

  public startHorn(): void {
    if (!this.audioContext || !this.hornGain) return;
    const vol = 0.5 * this.volumes.master * this.volumes.sfx;
    this.hornGain.gain.setTargetAtTime(vol, this.audioContext.currentTime, 0.02);
  }

  public stopHorn(): void {
    if (!this.audioContext || !this.hornGain) return;
    this.hornGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.05);
  }

  /**
   * Play procedural short blip for UI button click.
   */
  public playClick(): void {
    if (!this.audioContext) return;
    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, this.audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.04);

      const vol = 0.25 * this.volumes.master * this.volumes.sfx;
      gain.gain.setValueAtTime(vol, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.04);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);

      osc.start();
      osc.stop(this.audioContext.currentTime + 0.04);
    } catch {
      // Ignore audio synthesis errors
    }
  }

  /**
   * Play cash register chime on ride payment.
   */
  public playCashRegister(): void {
    if (!this.audioContext) return;
    try {
      const notes = [987.77, 1318.51]; // B5, E6
      notes.forEach((freq, idx) => {
        if (!this.audioContext) return;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        const startTime = this.audioContext.currentTime + idx * 0.08;
        const vol = 0.3 * this.volumes.master * this.volumes.sfx;
        gain.gain.setValueAtTime(vol, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

        osc.connect(gain);
        gain.connect(this.audioContext.destination);

        osc.start(startTime);
        osc.stop(startTime + 0.25);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Play authentic Dhaka cycle rickshaw double-ring ("tring tring").
   */
  public playRickshawBell(): void {
    if (!this.audioContext) return;
    try {
      const bellNotes = [2093, 2093, 2349, 2349]; // C7, D7
      bellNotes.forEach((freq, idx) => {
        if (!this.audioContext) return;
        const osc = this.audioContext.createOscillator();
        const gain = this.audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, this.audioContext.currentTime);

        const startTime = this.audioContext.currentTime + idx * 0.09;
        const vol = 0.2 * this.volumes.master * this.volumes.sfx;
        gain.gain.setValueAtTime(vol, startTime);
        gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.12);

        osc.connect(gain);
        gain.connect(this.audioContext.destination);
        osc.start(startTime);
        osc.stop(startTime + 0.12);
      });
    } catch {
      // Ignore
    }
  }

  /**
   * Play collision bump / impact sound.
   */
  public playCrashImpact(): void {
    if (!this.audioContext) return;
    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, this.audioContext.currentTime);
      osc.frequency.exponentialRampToValueAtTime(30, this.audioContext.currentTime + 0.22);

      const vol = 0.6 * this.volumes.master * this.volumes.sfx;
      gain.gain.setValueAtTime(vol, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start();
      osc.stop(this.audioContext.currentTime + 0.25);
    } catch {
      // Ignore
    }
  }

  /**
   * Play CNG counter-beep when traffic responds to horn.
   */
  public playCounterHorn(): void {
    if (!this.audioContext) return;
    try {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(587.33, this.audioContext.currentTime); // D5

      const vol = 0.25 * this.volumes.master * this.volumes.sfx;
      gain.gain.setValueAtTime(vol, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 0.18);

      osc.connect(gain);
      gain.connect(this.audioContext.destination);
      osc.start();
      osc.stop(this.audioContext.currentTime + 0.18);
    } catch {
      // Ignore
    }
  }

  /**
   * Updates ambient city murmur and rain loop volumes.
   */
  public setAmbience(districtDensity: number, isRaining: boolean): void {
    if (!this.cityBedGain || !this.rainBedGain || !this.audioContext) return;

    const cityTarget = Math.min(1, Math.max(0, districtDensity)) * 0.2 * this.volumes.master * this.volumes.music;
    const rainTarget = (isRaining ? 0.35 : 0) * this.volumes.master * this.volumes.sfx;

    this.cityBedGain.gain.setTargetAtTime(cityTarget, this.audioContext.currentTime, 0.5);
    this.rainBedGain.gain.setTargetAtTime(rainTarget, this.audioContext.currentTime, 0.5);
  }

  private updateAmbientGains(): void {
    if (!this.cityBedGain || !this.rainBedGain || !this.audioContext) return;
    const currentCity = this.cityBedGain.gain.value;
    const currentRain = this.rainBedGain.gain.value;
    this.cityBedGain.gain.setValueAtTime(currentCity * this.volumes.master, this.audioContext.currentTime);
    this.rainBedGain.gain.setValueAtTime(currentRain * this.volumes.master, this.audioContext.currentTime);
  }

  private initAudioNodes(): void {
    if (!this.audioContext) return;

    try {
      // Engine oscillator
      this.engineOsc = this.audioContext.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.setValueAtTime(55, this.audioContext.currentTime);

      this.engineGain = this.audioContext.createGain();
      this.engineGain.gain.setValueAtTime(0, this.audioContext.currentTime);

      // Lowpass filter to muffle raw sawtooth into motorcycle engine thrum
      const filter = this.audioContext.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, this.audioContext.currentTime);

      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.audioContext.destination);
      this.engineOsc.start();

      // Horn dual-tone oscillator
      this.hornOsc = this.audioContext.createOscillator();
      this.hornOsc.type = 'triangle';
      this.hornOsc.frequency.setValueAtTime(440, this.audioContext.currentTime); // 440 Hz classic Dhaka bike horn

      this.hornGain = this.audioContext.createGain();
      this.hornGain.gain.setValueAtTime(0, this.audioContext.currentTime);

      this.hornOsc.connect(this.hornGain);
      this.hornGain.connect(this.audioContext.destination);
      this.hornOsc.start();

      // Ambient city gain
      this.cityBedGain = this.audioContext.createGain();
      this.cityBedGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.cityBedGain.connect(this.audioContext.destination);

      // Rain bed gain
      this.rainBedGain = this.audioContext.createGain();
      this.rainBedGain.gain.setValueAtTime(0, this.audioContext.currentTime);
      this.rainBedGain.connect(this.audioContext.destination);
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

    window.addEventListener('pointerdown', unlockHandler, { once: true, passive: true });
    window.addEventListener('keydown', unlockHandler, { once: true, passive: true });
    window.addEventListener('touchstart', unlockHandler, { once: true, passive: true });
  }
}

export const audioManager = new AudioManager();
