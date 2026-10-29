import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import {
  type GameSettings,
  settingsSignal,
  saveSettings,
} from '../store';
import { t, setLanguage } from '../i18n';

export interface SettingsProps {
  isOpen: boolean;
  initialTab?: 'general' | 'audio' | 'controls';
  onClose?: () => void;
  onSave?: (settings: GameSettings) => void;
}

export function Settings({
  isOpen,
  initialTab = 'general',
  onClose,
  onSave,
}: SettingsProps): JSX.Element | null {
  if (!isOpen) return null;

  let activeTab: 'general' | 'audio' | 'controls' = initialTab;
  let setActiveTab = (tab: 'general' | 'audio' | 'controls') => {
    activeTab = tab;
  };
  let localSettings: GameSettings = { ...settingsSignal.value };
  let setLocalSettings = (updater: GameSettings | ((prev: GameSettings) => GameSettings)) => {
    localSettings = typeof updater === 'function' ? updater(localSettings) : updater;
  };

  try {
    const [tab, setTab] = useState<'general' | 'audio' | 'controls'>(initialTab);
    activeTab = tab;
    setActiveTab = setTab;
    const [settingsState, setSettingsState] = useState<GameSettings>({ ...settingsSignal.value });
    localSettings = settingsState;
    setLocalSettings = setSettingsState;
  } catch {
    // Vitest node environment
  }

  const handleLangChange = (lang: 'bn' | 'en') => {
    setLanguage(lang);
    setLocalSettings((prev) => ({ ...prev, language: lang }));
  };

  const handleSave = () => {
    saveSettings(localSettings);
    onSave?.(localSettings);
    onClose?.();
  };

  return (
    <div
      data-testid="settings-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: "'Hind Siliguri', 'Segoe UI', system-ui, sans-serif",
        color: '#f8fafc',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '620px',
          maxHeight: '88vh',
          display: 'flex',
          flexDirection: 'column',
          background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 24px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.5)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '1.4rem' }}>⚙️</span>
            <h2 data-testid="settings-title" style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>
              {t('settings.title')}
            </h2>
          </div>
          <button
            data-testid="settings-close-btn"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: '1.3rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.3)',
          }}
        >
          <button
            data-testid="settings-tab-general"
            onClick={() => setActiveTab('general')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeTab === 'general' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderBottom: activeTab === 'general' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'general' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            🖥️ {t('settings.tab_general')}
          </button>
          <button
            data-testid="settings-tab-audio"
            onClick={() => setActiveTab('audio')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeTab === 'audio' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderBottom: activeTab === 'audio' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'audio' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            🔊 {t('settings.tab_audio')}
          </button>
          <button
            data-testid="settings-tab-controls"
            onClick={() => setActiveTab('controls')}
            style={{
              flex: 1,
              padding: '12px',
              border: 'none',
              background: activeTab === 'controls' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderBottom: activeTab === 'controls' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'controls' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
            }}
          >
            🎮 {t('settings.tab_controls')}
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: '24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* General Tab */}
          {activeTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              {/* Language Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>
                  {t('settings.language')}
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    data-testid="settings-lang-bn"
                    onClick={() => handleLangChange('bn')}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: localSettings.language === 'bn' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: localSettings.language === 'bn' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                      color: localSettings.language === 'bn' ? '#34d399' : '#cbd5e1',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🇧🇩 বাংলা (Bengali)
                  </button>
                  <button
                    data-testid="settings-lang-en"
                    onClick={() => handleLangChange('en')}
                    style={{
                      flex: 1,
                      padding: '10px 16px',
                      borderRadius: '10px',
                      border: localSettings.language === 'en' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: localSettings.language === 'en' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                      color: localSettings.language === 'en' ? '#38bdf8' : '#cbd5e1',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    🇬🇧 English
                  </button>
                </div>
              </div>

              {/* Quality Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>
                  {t('settings.quality')}
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {(['low', 'medium', 'high'] as const).map((q) => (
                    <button
                      key={q}
                      data-testid={`settings-quality-${q}`}
                      onClick={() => setLocalSettings((prev) => ({ ...prev, quality: q }))}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: localSettings.quality === q ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: localSettings.quality === q ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                        color: localSettings.quality === q ? '#38bdf8' : '#94a3b8',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      {t(`settings.quality_${q}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Subtitles Size */}
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>
                  {t('settings.subtitles_size')}
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  {(['normal', 'large'] as const).map((sz) => (
                    <button
                      key={sz}
                      data-testid={`settings-subtitles-${sz}`}
                      onClick={() => setLocalSettings((prev) => ({ ...prev, subtitlesSize: sz }))}
                      style={{
                        flex: 1,
                        padding: '10px 16px',
                        borderRadius: '10px',
                        border: localSettings.subtitlesSize === sz ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: localSettings.subtitlesSize === sz ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                        color: localSettings.subtitlesSize === sz ? '#38bdf8' : '#cbd5e1',
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {t(`settings.subtitles_${sz}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.colorblind_route')}</span>
                  <input
                    data-testid="settings-colorblind-toggle"
                    aria-label={t('settings.colorblind_route')}
                    type="checkbox"
                    checked={localSettings.colorblindRoute}
                    onChange={(e) => setLocalSettings((prev) => ({ ...prev, colorblindRoute: e.currentTarget.checked }))}
                    style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.pause_on_decisions')}</span>
                  <input
                    data-testid="settings-pause-decisions-toggle"
                    aria-label={t('settings.pause_on_decisions')}
                    type="checkbox"
                    checked={localSettings.pauseOnDecisions}
                    onChange={(e) => setLocalSettings((prev) => ({ ...prev, pauseOnDecisions: e.currentTarget.checked }))}
                    style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.reduce_motion')}</span>
                  <input
                    data-testid="settings-reduce-motion-toggle"
                    type="checkbox"
                    aria-label={t('settings.reduce_motion')}
                    checked={localSettings.reduceMotion}
                    onChange={(e) => setLocalSettings((prev) => ({ ...prev, reduceMotion: e.currentTarget.checked }))}
                    style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                </label>

                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.auto_cruise')}</span>
                  <input
                    data-testid="settings-auto-cruise-toggle"
                    type="checkbox"
                    aria-label={t('settings.auto_cruise')}
                    checked={localSettings.autoCruise}
                    onChange={(e) => setLocalSettings((prev) => ({ ...prev, autoCruise: e.currentTarget.checked }))}
                    style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                </label>

              </div>
            </div>
          )}

          {/* Audio Tab */}
          {activeTab === 'audio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Master Volume */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.master_vol')}</span>
                  <span style={{ fontSize: '0.9rem', color: '#38bdf8', fontWeight: 700 }}>
                    {Math.round(localSettings.masterVolume * 100)}%
                  </span>
                </div>
                <input
                  data-testid="settings-master-vol"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={localSettings.masterVolume}
                  onInput={(e) => {
                    const val = parseFloat(e.currentTarget.value);
                    setLocalSettings((prev) => ({ ...prev, masterVolume: val }));
                  }}
                  style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </div>

              {/* SFX Volume */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.sfx_vol')}</span>
                  <span style={{ fontSize: '0.9rem', color: '#38bdf8', fontWeight: 700 }}>
                    {Math.round(localSettings.sfxVolume * 100)}%
                  </span>
                </div>
                <input
                  data-testid="settings-sfx-vol"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={localSettings.sfxVolume}
                  onInput={(e) => {
                    const val = parseFloat(e.currentTarget.value);
                    setLocalSettings((prev) => ({ ...prev, sfxVolume: val }));
                  }}
                  style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </div>

              {/* Ambient Volume */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.ambient_vol')}</span>
                  <span style={{ fontSize: '0.9rem', color: '#38bdf8', fontWeight: 700 }}>
                    {Math.round(localSettings.ambientVolume * 100)}%
                  </span>
                </div>
                <input
                  data-testid="settings-ambient-vol"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={localSettings.ambientVolume}
                  onInput={(e) => {
                    const val = parseFloat(e.currentTarget.value);
                    setLocalSettings((prev) => ({ ...prev, ambientVolume: val }));
                  }}
                  style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </div>
            </div>
          )}

          {/* Controls Tab */}
          {activeTab === 'controls' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.tilt_controls')}</span>
                <input
                  data-testid="settings-tilt-toggle"
                  type="checkbox"
                  checked={localSettings.tiltControls}
                  onChange={(e) => setLocalSettings((prev) => ({ ...prev, tiltControls: e.currentTarget.checked }))}
                  style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </label>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '14px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#94a3b8' }}>Keyboard & Controller Map</h4>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.85rem' }}>
                  <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Throttle</span>
                    <strong style={{ color: '#38bdf8' }}>W / ↑</strong>
                  </div>
                  <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Brake / Rev</span>
                    <strong style={{ color: '#38bdf8' }}>S / ↓</strong>
                  </div>
                  <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Steer</span>
                    <strong style={{ color: '#38bdf8' }}>A / D</strong>
                  </div>
                  <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Handbrake</span>
                    <strong style={{ color: '#38bdf8' }}>Space</strong>
                  </div>
                  <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Horn</span>
                    <strong style={{ color: '#38bdf8' }}>H</strong>
                  </div>
                  <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Phone UI</span>
                    <strong style={{ color: '#38bdf8' }}>Tab</strong>
                  </div>
                  <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>City Map</span>
                    <strong style={{ color: '#38bdf8' }}>M</strong>
                  </div>
                  <div style={{ background: 'rgba(15, 23, 42, 0.4)', padding: '8px 12px', borderRadius: '8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#94a3b8' }}>Pause</span>
                    <strong style={{ color: '#38bdf8' }}>Esc</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            background: 'rgba(15, 23, 42, 0.5)',
          }}
        >
          <button
            data-testid="settings-cancel-btn"
            onClick={onClose}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'transparent',
              color: '#94a3b8',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            data-testid="settings-save-btn"
            onClick={handleSave}
            style={{
              padding: '10px 24px',
              borderRadius: '10px',
              border: 'none',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
            }}
          >
            {t('settings.save_btn')}
          </button>
        </div>
      </div>
    </div>
  );
}
