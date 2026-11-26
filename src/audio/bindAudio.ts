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
): () => void {
  let savedSettings: AudioSettings = {
    masterVolume: 1,
    sfxVolume: 1,
    ambientVolume: 1,
    muted: false,
  };
  let previewSettings: AudioSettings | null = null;
  let lastPreviewSeq = 0;

  const cleanups: Array<() => void> = [];

  const unsubSaved = settings.subscribe((s) => {
    savedSettings = s;
    applyAudioVolumes(audio, previewSettings ?? savedSettings);
  });
  if (typeof unsubSaved === 'function') cleanups.push(unsubSaved as () => void);

  const unsubPreview = preview?.subscribe((s) => {
    previewSettings = s;
    applyAudioVolumes(audio, previewSettings ?? savedSettings);
  });
  if (typeof unsubPreview === 'function') cleanups.push(unsubPreview as () => void);

  const unsubSeq = preview?.seq?.subscribe((seq) => {
    if (seq > lastPreviewSeq) {
      lastPreviewSeq = seq;
      audio.playClick();
    } else {
      lastPreviewSeq = seq;
    }
  });
  if (typeof unsubSeq === 'function') cleanups.push(unsubSeq as () => void);

  cleanups.push(bus.on('ride/requested', () => audio.playNotify()));
  cleanups.push(bus.on('ride/started', () => audio.playBoarding?.()));
  cleanups.push(bus.on('delivery/offered', () => audio.playNotify()));
  cleanups.push(bus.on('ride/completed', () => audio.playCashRegister()));
  cleanups.push(bus.on('delivery/completed', () => audio.playCashRegister()));
  cleanups.push(bus.on('mission/completed', () => audio.playMissionComplete()));
  cleanups.push(bus.on('bike/collision', (ev) => audio.playImpact(ev.severity)));
  cleanups.push(bus.on('bike/speedBump', () => audio.playSpeedBump?.()));
  cleanups.push(bus.on('bike/fuelEmpty', () => audio.playEngineStall?.()));
  cleanups.push(bus.on('bike/breakdown', () => audio.playEngineStall?.()));
  cleanups.push(bus.on('bike/puncture', () => audio.playPuncture?.()));
  cleanups.push(bus.on('day/started', () => audio.playIgnition?.()));
  cleanups.push(bus.on('bike/swapped', () => audio.playIgnition?.()));
  cleanups.push(
    bus.on('world/weatherChanged', (ev) => {
      if (ev.to === 'heavyRain') audio.playThunder?.();
    })
  );

  if (doc) {
    const onDocClick = (e: Event) => {
      const el = e.target as Element | null;
      if (el?.closest?.('button')) audio.playClick();
    };
    doc.addEventListener('click', onDocClick);
    cleanups.push(() => doc.removeEventListener('click', onDocClick));
  }

  return () => {
    for (const fn of cleanups) fn();
    cleanups.length = 0;
  };
}
