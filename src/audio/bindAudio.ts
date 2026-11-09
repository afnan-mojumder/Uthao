import type { EventBus, GameEvents } from '../core/events';
import type { AudioManager } from './AudioManager';

export interface AudioSettings {
  masterVolume: number;
  sfxVolume: number;
  ambientVolume: number;
  muted: boolean;
}

/** Wires saved volumes, sim events and UI clicks to the audio manager. */
export function bindAudio(
  audio: AudioManager,
  bus: EventBus<GameEvents>,
  settings: { subscribe(fn: (s: AudioSettings) => void): unknown },
  doc?: Document
): void {
  settings.subscribe((s) => {
    audio.setMasterVolume(s.masterVolume);
    audio.setSfxVolume(s.sfxVolume);
    audio.setAmbientVolume(s.ambientVolume);
    audio.setMuted(s.muted);
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
