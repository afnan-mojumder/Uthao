import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  screenSignal,
  pausedSignal,
  settingsSignal,
  saveSettings,
  loadSettings,
  DEFAULT_SETTINGS,
  setMenuDispatchers,
  onStartNewCareerCallback,
  onContinueCareerCallback,
  onStartEndlessCallback,
  onResumeGameCallback,
  onSetWaypointCallback,
} from '../../../src/ui/store';
import { MainMenu } from '../../../src/ui/menus/MainMenu';
import { Settings } from '../../../src/ui/menus/Settings';
import { Pause } from '../../../src/ui/menus/Pause';
import { t, setLanguage } from '../../../src/ui/i18n';

describe('T3.10 Menus & Settings Store', () => {
  beforeEach(() => {
    screenSignal.value = 'title';
    pausedSignal.value = false;
    setLanguage('bn');
    saveSettings({ ...DEFAULT_SETTINGS });
  });

  it('updates screenSignal and pausedSignal transitions', () => {
    expect(screenSignal.value).toBe('title');
    expect(pausedSignal.value).toBe(false);

    screenSignal.value = 'game';
    expect(screenSignal.value).toBe('game');

    screenSignal.value = 'pause';
    pausedSignal.value = true;
    expect(screenSignal.value).toBe('pause');
    expect(pausedSignal.value).toBe(true);

    screenSignal.value = 'map';
    expect(screenSignal.value).toBe('map');
  });

  it('dispatches menu callbacks for career, endless, resume, and waypoint', () => {
    const mockNewCareer = vi.fn();
    const mockContinue = vi.fn();
    const mockEndless = vi.fn();
    const mockResume = vi.fn();
    const mockWaypoint = vi.fn();

    setMenuDispatchers(mockNewCareer, mockContinue, mockEndless, mockResume, mockWaypoint);

    onStartNewCareerCallback?.();
    expect(mockNewCareer).toHaveBeenCalledTimes(1);

    onContinueCareerCallback?.();
    expect(mockContinue).toHaveBeenCalledTimes(1);

    onStartEndlessCallback?.();
    expect(mockEndless).toHaveBeenCalledTimes(1);

    onResumeGameCallback?.();
    expect(mockResume).toHaveBeenCalledTimes(1);

    onSetWaypointCallback?.('poi_mirpara_garage');
    expect(mockWaypoint).toHaveBeenCalledWith('poi_mirpara_garage');
  });

  it('loads and saves settings with custom values', () => {
    saveSettings({
      ...DEFAULT_SETTINGS,
      language: 'en',
      quality: 'high',
      masterVolume: 0.5,
      tiltControls: true,
      colorblindRoute: true,
    });

    expect(settingsSignal.value.language).toBe('en');
    expect(settingsSignal.value.quality).toBe('high');
    expect(settingsSignal.value.masterVolume).toBe(0.5);
    expect(settingsSignal.value.tiltControls).toBe(true);
    expect(settingsSignal.value.colorblindRoute).toBe(true);

    const loaded = loadSettings();
    expect(loaded.quality).toBe('high');
  });

  it('provides bilingual strings for MainMenu, Settings, and Pause', () => {
    setLanguage('bn');
    expect(t('menu.title')).toBe('উধাও');
    expect(t('menu.new_career')).toBe('নতুন ক্যারিয়ার');
    expect(t('settings.title')).toBe('গেম সেটিংস');
    expect(t('pause.title')).toBe('খেলা সাময়িক বিরতি');

    setLanguage('en');
    expect(t('menu.title')).toBe('UTHÃO');
    expect(t('menu.new_career')).toBe('New Career');
    expect(t('settings.title')).toBe('Game Settings');
    expect(t('pause.title')).toBe('Game Paused');
  });

  it('renders MainMenu vnode with options', () => {
    const onNewCareer = vi.fn();
    const onContinue = vi.fn();
    const onEndless = vi.fn();
    const onOpenSettings = vi.fn();

    const vnode = MainMenu({
      hasSave: true,
      onNewCareer,
      onContinue,
      onEndless,
      onOpenSettings,
    });

    expect(vnode).not.toBeNull();
    expect(vnode?.props['data-testid']).toBe('main-menu');
  });

  it('renders Settings vnode when open and null when closed', () => {
    expect(Settings({ isOpen: false })).toBeNull();

    const vnode = Settings({
      isOpen: true,
      initialTab: 'general',
    });

    expect(vnode).not.toBeNull();
    expect(vnode?.props['data-testid']).toBe('settings-screen');
  });

  it('renders Pause vnode when open and null when closed', () => {
    expect(Pause({ isOpen: false })).toBeNull();

    const vnode = Pause({
      isOpen: true,
    });

    expect(vnode).not.toBeNull();
    expect(vnode?.props['data-testid']).toBe('pause-menu');
  });
});
