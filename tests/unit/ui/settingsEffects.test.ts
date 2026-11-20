import { describe, it, expect, vi } from 'vitest';
import {
  routeColorFor,
  ROUTE_COLOR,
  HIGH_CONTRAST_ROUTE_COLOR,
  normalizeUiScale,
  highContrastPaletteFor,
  HIGH_CONTRAST_PALETTE,
  STANDARD_PALETTE,
  applyDocumentSettings,
} from '../../../src/ui/settingsEffects';
import {
  cloneDefaultBindings,
  rebindKeyboardAction,
  rebindGamepadAction,
} from '../../../src/input/bindings';
import { EventBus, type GameEvents } from '../../../src/core/events';
import { bindAudio, type AudioSettings } from '../../../src/audio/bindAudio';
import type { AudioManager } from '../../../src/audio/AudioManager';

describe('high-contrast route setting', () => {
  it('uses the normal route colour when the setting is off', () => {
    expect(routeColorFor({ colorblindRoute: false })).toBe(ROUTE_COLOR);
  });

  it('uses a different colour when the setting is on, so the change is visible', () => {
    // Before this, the toggle saved but the minimap always drew the same green.
    expect(routeColorFor({ colorblindRoute: true })).toBe(HIGH_CONTRAST_ROUTE_COLOR);
    expect(HIGH_CONTRAST_ROUTE_COLOR).not.toBe(ROUTE_COLOR);
  });

  it('normalizes UI scale and applies document dataset attributes', () => {
    expect(normalizeUiScale(1)).toBe(1);
    expect(normalizeUiScale(1.15)).toBe(1.15);
    expect(normalizeUiScale(1.3)).toBe(1.3);
    expect(normalizeUiScale(2.5)).toBe(1);

    expect(highContrastPaletteFor({ colorblindRoute: true })).toEqual(HIGH_CONTRAST_PALETTE);
    expect(highContrastPaletteFor({ colorblindRoute: false })).toEqual(STANDARD_PALETTE);

    const fakeDoc = {
      documentElement: { dataset: {} as Record<string, string> },
    } as unknown as Document;
    applyDocumentSettings({ reduceMotion: true, colorblindRoute: true, uiScale: 1.3 }, fakeDoc);
    expect(fakeDoc.documentElement.dataset.reduceMotion).toBe('true');
    expect(fakeDoc.documentElement.dataset.highContrast).toBe('true');
    expect(fakeDoc.documentElement.dataset.uiScale).toBe('1.3');
  });

  it('rebinds keyboard and gamepad actions while rejecting conflicts and reserved keys', () => {
    const base = cloneDefaultBindings();

    const reservedKb = rebindKeyboardAction(base, 'horn', 'Escape');
    expect(reservedKb.ok).toBe(false);
    if (!reservedKb.ok) expect(reservedKb.reason).toBe('reserved');

    const conflictKb = rebindKeyboardAction(base, 'horn', 'KeyM');
    expect(conflictKb.ok).toBe(false);
    if (!conflictKb.ok) {
      expect(conflictKb.reason).toBe('conflict');
      expect(conflictKb.conflictingAction).toBe('map');
    }

    const validKb = rebindKeyboardAction(base, 'horn', 'KeyB');
    expect(validKb.ok).toBe(true);
    if (validKb.ok) expect(validKb.bindings.keyboard.horn).toEqual(['KeyB']);

    const reservedGp = rebindGamepadAction(base, 'hornButton', 0);
    expect(reservedGp.ok).toBe(false);
    if (!reservedGp.ok) expect(reservedGp.reason).toBe('reserved');

    const conflictGp = rebindGamepadAction(base, 'hornButton', 5);
    expect(conflictGp.ok).toBe(false);
    if (!conflictGp.ok) {
      expect(conflictGp.reason).toBe('conflict');
      expect(conflictGp.conflictingAction).toBe('mapButton');
    }

    const validGp = rebindGamepadAction(base, 'hornButton', 11);
    expect(validGp.ok).toBe(true);
    if (validGp.ok) expect(validGp.bindings.gamepad.hornButton).toBe(11);
  });

  it('applies live audio volume previews and plays preview click on seq change', () => {
    const bus = new EventBus<GameEvents>();
    const audio = {
      setMasterVolume: vi.fn(),
      setSfxVolume: vi.fn(),
      setAmbientVolume: vi.fn(),
      setMuted: vi.fn(),
      playNotify: vi.fn(),
      playCashRegister: vi.fn(),
      playMissionComplete: vi.fn(),
      playImpact: vi.fn(),
      playClick: vi.fn(),
    } as unknown as AudioManager;

    let onSaved: (s: AudioSettings) => void = () => {};
    let onPreview: (s: AudioSettings | null) => void = () => {};
    let onSeq: (n: number) => void = () => {};

    bindAudio(
      audio,
      bus,
      { subscribe: (fn) => { onSaved = fn; fn({ masterVolume: 1, sfxVolume: 1, ambientVolume: 1, muted: false }); } },
      undefined,
      {
        subscribe: (fn) => { onPreview = fn; },
        seq: { subscribe: (fn) => { onSeq = fn; } },
      }
    );

    onPreview({ masterVolume: 0.4, sfxVolume: 0.6, ambientVolume: 0.2, muted: false });
    expect(audio.setMasterVolume).toHaveBeenLastCalledWith(0.4);
    expect(audio.setSfxVolume).toHaveBeenLastCalledWith(0.6);

    onSeq(1);
    expect(audio.playClick).toHaveBeenCalledTimes(1);

    onPreview(null);
    onSaved({ masterVolume: 0.9, sfxVolume: 0.8, ambientVolume: 0.7, muted: false });
    expect(audio.setMasterVolume).toHaveBeenLastCalledWith(0.9);
  });
});
