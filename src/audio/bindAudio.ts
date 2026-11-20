import type { EventBus, GameEvents } from '../core/events';
import type { AudioManager } from './AudioManager';

export interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  muted: boolean;
}

export interface AudioPreviewSource {
  subscribe(fn: (s: AudioSettings | null) => void): unknown;
  seq?: { subscribe(fn: (n: number) => void): unknown };
}

function applyAudioVolumes(audio: AudioManager, s: AudioSettings): void {
  audio.setMasterVolume(s.masterVolume);
  audio.setSfxVolume(s.sfxVolume);
  audio.setAmbientVolume(s.ambientVolume);
  audio.setMuted(s.muted);
}

/** Wires saved volumes, live volume previews, sim events and UI clicks to the audio manager. */
export function bindAudio(
  audio: AudioManager,
  bus: EventBus<GameEvents>,
  settings: { subscribe(fn: (s: AudioSettings) => void): unknown },
  doc?: Document,
  preview?: AudioPreviewSource
): void {
  let savedSettings: AudioSettings = {
    masterVolume: 1,
    sfxVolume: 1,
    ambientVolume: 1,
    muted: false,
  };
  let previewSettings: AudioSettings | null = null;
  let lastPreviewSeq = 0;

  settings.subscribe((s) => {
    savedSettings = s;
    applyAudioVolumes(audio, previewSettings ?? savedSettings);
  });

  preview?.subscribe((s) => {
    previewSettings = s;
    applyAudioVolumes(audio, previewSettings ?? savedSettings);
  });

  preview?.seq?.subscribe((seq) => {
    if (seq > lastPreviewSeq) {
      lastPreviewSeq = seq;
      audio.playClick();
    } else {
      lastPreviewSeq = seq;
    }
  });

  bus.on('ride/requested', () => audio.playNotify());
  bus.on('delivery/offered', () => audio.playNotify());
  bus.on('ride/completed', () => audio.playCashRegister());
  bus.on('delivery/completed', () => audio.playCashRegister());
  bus.on('mission/completed', () => audio.playMissionComplete());
  bus.on('bike/collision', (ev) => audio.playImpact(ev.severity));

  doc?.addEventListener('click', (e) => {
    const el = e.target as Element | null;
    if (el?.closest?.('button')) audio.playClick();
  });
}
