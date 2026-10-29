import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  settingsSignal,
  type GameSettings,
} from '../../../src/ui/store';
import { Settings } from '../../../src/ui/menus/Settings';

describe('Accessibility & Localisation (T6.3)', () => {
  it('includes all accessibility defaults in GameSettings', () => {
    expect(DEFAULT_SETTINGS.subtitlesSize).toBe('normal');
    expect(DEFAULT_SETTINGS.colorblindRoute).toBe(false);
    expect(DEFAULT_SETTINGS.reduceMotion).toBe(false);
    expect(DEFAULT_SETTINGS.autoCruise).toBe(false);
    expect(DEFAULT_SETTINGS.pauseOnDecisions).toBe(false);
  });

  it('persists modified accessibility settings in memory and signal', () => {
    const updated: GameSettings = {
      ...DEFAULT_SETTINGS,
      subtitlesSize: 'large',
      reduceMotion: true,
      autoCruise: true,
      colorblindRoute: true,
    };

    saveSettings(updated);
    expect(settingsSignal.value.subtitlesSize).toBe('large');
    expect(settingsSignal.value.reduceMotion).toBe(true);
    expect(settingsSignal.value.autoCruise).toBe(true);
    expect(settingsSignal.value.colorblindRoute).toBe(true);

    const loaded = loadSettings();
    expect(loaded.subtitlesSize).toBe('large');
    expect(loaded.reduceMotion).toBe(true);
    expect(loaded.autoCruise).toBe(true);
  });

  it('renders accessibility inputs and returns valid vnode tree when open', () => {
    const vnode = Settings({
      isOpen: true,
      onClose: () => {},
    });

    expect(vnode).not.toBeNull();
    expect(vnode?.props?.['data-testid']).toBe('settings-screen');
  });

  it('records Native-Speaker Review Checklist in docs/QUESTIONS.md', () => {
    const questions = fs.readFileSync('docs/QUESTIONS.md', 'utf-8');
    expect(questions).toContain('T6.3 Native-Speaker Review Checklist');
    expect(questions).toContain('data/dialogue/bn/dialogue.json');
    expect(questions).toContain('data/dialogue/bn/characters.json');
    expect(questions).toContain('data/dialogue/bn/missions.json');
    expect(questions).toContain('data/dialogue/bn/encounters.json');
    expect(questions).toContain('data/dialogue/bn/ui.json');
  });
});
