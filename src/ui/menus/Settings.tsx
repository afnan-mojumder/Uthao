import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  cloneDefaultBindings,
  loadBindings,
  rebindGamepadAction,
  rebindKeyboardAction,
  saveBindings,
  type RebindableGamepadAction,
  type RebindableKeyboardAction,
} from '../../input/bindings';
import type { InputBindings } from '../../input/types';
import {
  IconClose,
  IconGamepad,
  IconSettings,
  IconSliders,
  IconVolume,
} from '../components/icons';
import { makeRestInert } from '../focusTrap';
import { localDigits, setLanguage, t } from '../i18n';
import { applyDocumentSettings, type UiScale } from '../settingsEffects';
import {
  audioPreviewSeqSignal,
  audioPreviewSignal,
  saveSettings,
  settingsSignal,
  Z_LAYER,
  type GameSettings,
} from '../store';

export interface SettingsProps {
  isOpen: boolean;
  initialTab?: 'general' | 'audio' | 'controls';
  onClose?: () => void;
  onCancel?: () => void;
  onCancelRef?: { current: (() => void) | null };
  onSave?: (settings: GameSettings) => void;
}

const KEYBOARD_ACTIONS: Array<{ action: RebindableKeyboardAction; labelKey: string }> = [
  { action: 'throttle', labelKey: 'settings.controls.action.throttle' },
  { action: 'brake', labelKey: 'settings.controls.action.brake' },
  { action: 'steerLeft', labelKey: 'settings.controls.action.steerLeft' },
  { action: 'steerRight', labelKey: 'settings.controls.action.steerRight' },
  { action: 'horn', labelKey: 'settings.controls.action.horn' },
  { action: 'camera', labelKey: 'settings.controls.action.camera' },
  { action: 'phone', labelKey: 'settings.controls.action.phone' },
  { action: 'map', labelKey: 'settings.controls.action.map' },
  { action: 'garage', labelKey: 'settings.controls.action.garage' },
  { action: 'journal', labelKey: 'settings.controls.action.journal' },
  { action: 'mute', labelKey: 'settings.controls.action.mute' },
];

const GAMEPAD_ACTIONS: Array<{ action: RebindableGamepadAction; labelKey: string }> = [
  { action: 'throttleAxisOrButton', labelKey: 'settings.controls.action.throttle' },
  { action: 'brakeAxisOrButton', labelKey: 'settings.controls.action.brake' },
  { action: 'hornButton', labelKey: 'settings.controls.action.horn' },
  { action: 'cameraButton', labelKey: 'settings.controls.action.camera' },
  { action: 'phoneButton', labelKey: 'settings.controls.action.phone' },
  { action: 'mapButton', labelKey: 'settings.controls.action.map' },
  { action: 'pauseButton', labelKey: 'settings.controls.action.pause' },
];

function resolveActionLabel(actionName?: string): string {
  if (!actionName) return '';
  const kbMatch = KEYBOARD_ACTIONS.find((a) => a.action === actionName);
  if (kbMatch) return t(kbMatch.labelKey);
  const gpMatch = GAMEPAD_ACTIONS.find((a) => a.action === actionName);
  if (gpMatch) return t(gpMatch.labelKey);
  return actionName;
}

type ListeningTarget =
  | { kind: 'keyboard'; action: RebindableKeyboardAction }
  | { kind: 'gamepad'; action: RebindableGamepadAction }
  | null;

export function Settings({
  isOpen,
  initialTab = 'general',
  onClose,
  onCancel,
  onCancelRef,
  onSave,
}: SettingsProps): JSX.Element | null {
  const [activeTab, setActiveTab] = useState<'general' | 'audio' | 'controls'>(initialTab);
  const [localSettings, setLocalSettings] = useState<GameSettings>(() => ({
    ...settingsSignal.value,
  }));
  const [draftBindings, setDraftBindings] = useState<InputBindings>(() => loadBindings());
  const [listeningTarget, setListeningTarget] = useState<ListeningTarget>(null);
  const [rebindError, setRebindError] = useState<string | null>(null);
  const draftBindingsRef = useRef<InputBindings>(draftBindings);
  draftBindingsRef.current = draftBindings;
  const listeningTargetRef = useRef<ListeningTarget>(listeningTarget);
  listeningTargetRef.current = listeningTarget;

  const updateListeningTarget = (target: ListeningTarget) => {
    listeningTargetRef.current = target;
    setListeningTarget(target);
  };

  const updateDraftBindings = (next: InputBindings) => {
    draftBindingsRef.current = next;
    setDraftBindings(next);
  };

  // Cancel discards every change, including language, scale, high-contrast, audio & control previews.
  const handleCancel = () => {
    setLanguage(settingsSignal.value.language);
    applyDocumentSettings(settingsSignal.value);
    audioPreviewSignal.value = null;
    updateListeningTarget(null);
    setRebindError(null);
    onCancel?.();
    onClose?.();
  };

  const handleCancelRef = useRef(handleCancel);
  handleCancelRef.current = handleCancel;
  const needsResetOnOpenRef = useRef(false);

  // Keyboard focus stays in Settings while it is open, and returns to the opener on close.
  useEffect(() => {
    if (!isOpen) {
      needsResetOnOpenRef.current = true;
      audioPreviewSignal.value = null;
      return undefined;
    }
    if (needsResetOnOpenRef.current) {
      needsResetOnOpenRef.current = false;
      setActiveTab(initialTab);
      setLocalSettings({ ...settingsSignal.value });
      updateDraftBindings(loadBindings());
      updateListeningTarget(null);
      setRebindError(null);
    }
    if (onCancelRef) {
      onCancelRef.current = () => handleCancelRef.current();
    }
    const overlay = document.querySelector<HTMLElement>('[data-testid="settings-screen"]');
    if (!overlay) {
      return () => {
        if (onCancelRef) onCancelRef.current = null;
      };
    }
    const opener = document.activeElement as HTMLElement | null;
    const release = makeRestInert(overlay);
    overlay.querySelector<HTMLElement>('button, input, select')?.focus();
    return () => {
      if (onCancelRef) onCancelRef.current = null;
      release();
      opener?.focus?.();
    };
  }, [isOpen, initialTab, onCancelRef]);

  // Always-on capture listener while Settings is open so key rebinds have zero rAF race
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = listeningTargetRef.current;
      if (!target) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        updateListeningTarget(null);
        return;
      }
      if (target.kind !== 'keyboard') return;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation?.();
      const result = rebindKeyboardAction(draftBindingsRef.current, target.action, e.code);
      updateListeningTarget(null);
      if (!result.ok) {
        setRebindError(
          result.reason === 'reserved'
            ? t('settings.controls.reserved', { key: e.code })
            : t('settings.controls.conflict', {
                key: e.code,
                action: resolveActionLabel(result.conflictingAction),
              })
        );
        return;
      }
      setRebindError(null);
      updateDraftBindings(result.bindings);
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isOpen]);

  // Poll gamepad buttons when listening for a controller rebind
  useEffect(() => {
    if (!isOpen || listeningTarget?.kind !== 'gamepad') return undefined;
    let rafId = 0;
    const targetAction = listeningTarget.action;
    const prevPressed = new Set<number>();
    const gpSnap = typeof navigator !== 'undefined' ? navigator.getGamepads?.() : null;
    if (gpSnap) {
      for (const pad of gpSnap) {
        if (!pad) continue;
        pad.buttons.forEach((btn, idx) => {
          if (btn?.pressed) prevPressed.add(idx);
        });
      }
    }

    const poll = () => {
      const pads = typeof navigator !== 'undefined' ? navigator.getGamepads?.() : null;
      if (pads) {
        for (const pad of pads) {
          if (!pad) continue;
          for (let i = 0; i < pad.buttons.length; i++) {
            const isDown = Boolean(pad.buttons[i]?.pressed);
            if (isDown && !prevPressed.has(i)) {
              const result = rebindGamepadAction(draftBindingsRef.current, targetAction, i);
              updateListeningTarget(null);
              if (!result.ok) {
                setRebindError(
                  result.reason === 'reserved'
                    ? t('settings.controls.reserved', { key: `B${i}` })
                    : t('settings.controls.conflict', {
                        key: `B${i}`,
                        action: resolveActionLabel(result.conflictingAction),
                      })
                );
              } else {
                setRebindError(null);
                updateDraftBindings(result.bindings);
              }
              return;
            }
            if (!isDown) prevPressed.delete(i);
          }
        }
      }
      rafId = requestAnimationFrame(poll);
    };
    rafId = requestAnimationFrame(poll);

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isOpen, listeningTarget]);

  if (!isOpen) return null;

  const updateAudioPreview = (next: GameSettings, triggerBeep: boolean) => {
    audioPreviewSignal.value = {
      masterVolume: next.masterVolume,
      sfxVolume: next.sfxVolume,
      ambientVolume: next.ambientVolume,
      muted: next.muted,
    };
    if (triggerBeep) {
      audioPreviewSeqSignal.value += 1;
    }
  };

  const handleLangChange = (lang: 'bn' | 'en') => {
    setLanguage(lang);
    setLocalSettings((prev) => ({ ...prev, language: lang }));
  };

  const handleScaleChange = (scale: UiScale) => {
    const next = { ...localSettings, uiScale: scale };
    setLocalSettings(next);
    applyDocumentSettings(next);
  };

  const handleHighContrastChange = (enabled: boolean) => {
    const next = { ...localSettings, colorblindRoute: enabled };
    setLocalSettings(next);
    applyDocumentSettings(next);
  };

  const handleSave = () => {
    saveBindings({
      ...draftBindings,
      tiltEnabled: localSettings.tiltControls,
    });
    audioPreviewSignal.value = null;
    saveSettings(localSettings);
    applyDocumentSettings(localSettings);
    onSave?.(localSettings);
    onClose?.();
  };

  return (
    <div
      data-testid="settings-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z_LAYER.CRITICAL_MODAL,
        background: 'rgba(15, 23, 42, 0.92)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '12px',
        fontFamily: 'var(--font-sans)',
        color: '#f8fafc',
        pointerEvents: 'auto',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        style={{
          width: '100%',
          maxWidth: '640px',
          maxHeight: '90dvh',
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
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'rgba(15, 23, 42, 0.5)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#38bdf8' }}>
            <IconSettings size={20} />
            <h2
              id="settings-dialog-title"
              data-testid="settings-title"
              style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: '#f8fafc' }}
            >
              {t('settings.title')}
            </h2>
          </div>
          <button
            type="button"
            data-testid="settings-close-btn"
            aria-label={t('menu.close')}
            onClick={handleCancel}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              position: 'relative',
            }}
          >
            <span
              style={{
                position: 'absolute',
                width: '1px',
                height: '1px',
                overflow: 'hidden',
                clip: 'rect(0 0 0 0)',
                whiteSpace: 'nowrap',
              }}
            >
              ✕
            </span>
            <IconClose size={18} />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div
          style={{
            display: 'flex',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            background: 'rgba(15, 23, 42, 0.3)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            data-testid="settings-tab-general"
            onClick={() => setActiveTab('general')}
            style={{
              flex: 1,
              padding: '11px',
              border: 'none',
              background: activeTab === 'general' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderBottom: activeTab === 'general' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'general' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <IconSliders size={15} />
            <span>{t('settings.tab_general')}</span>
          </button>
          <button
            type="button"
            data-testid="settings-tab-audio"
            onClick={() => setActiveTab('audio')}
            style={{
              flex: 1,
              padding: '11px',
              border: 'none',
              background: activeTab === 'audio' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderBottom: activeTab === 'audio' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'audio' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <IconVolume size={15} />
            <span>{t('settings.tab_audio')}</span>
          </button>
          <button
            type="button"
            data-testid="settings-tab-controls"
            onClick={() => setActiveTab('controls')}
            style={{
              flex: 1,
              padding: '11px',
              border: 'none',
              background: activeTab === 'controls' ? 'rgba(56, 189, 248, 0.15)' : 'transparent',
              borderBottom: activeTab === 'controls' ? '2px solid #38bdf8' : '2px solid transparent',
              color: activeTab === 'controls' ? '#38bdf8' : '#94a3b8',
              fontWeight: 700,
              fontSize: '0.85rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <IconGamepad size={15} />
            <span>{t('settings.tab_controls')}</span>
          </button>
        </div>

        {/* Content Body */}
        <div
          style={{
            padding: '18px 20px',
            overflowY: 'auto',
            minHeight: 0,
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}
        >
          {/* General Tab */}
          {activeTab === 'general' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Language Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>
                  {t('settings.language')}
                </label>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button
                    type="button"
                    data-testid="settings-lang-bn"
                    onClick={() => handleLangChange('bn')}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: localSettings.language === 'bn' ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: localSettings.language === 'bn' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                      color: localSettings.language === 'bn' ? '#34d399' : '#cbd5e1',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    বাংলা (BN)
                  </button>
                  <button
                    type="button"
                    data-testid="settings-lang-en"
                    onClick={() => handleLangChange('en')}
                    style={{
                      flex: 1,
                      padding: '10px 14px',
                      borderRadius: '10px',
                      border: localSettings.language === 'en' ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                      background: localSettings.language === 'en' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                      color: localSettings.language === 'en' ? '#38bdf8' : '#cbd5e1',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    English (EN)
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
                      type="button"
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

              {/* UI Scale Selector */}
              <div>
                <label style={{ display: 'block', fontSize: '0.9rem', color: '#94a3b8', marginBottom: '8px', fontWeight: 600 }}>
                  {t('settings.ui_scale')}
                </label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {([
                    { value: 1 as UiScale, testId: 'settings-scale-100', label: `${localDigits(100)}%` },
                    { value: 1.15 as UiScale, testId: 'settings-scale-115', label: `${localDigits(115)}%` },
                    { value: 1.3 as UiScale, testId: 'settings-scale-130', label: `${localDigits(130)}%` },
                  ]).map((opt) => (
                    <button
                      key={opt.testId}
                      type="button"
                      data-testid={opt.testId}
                      onClick={() => handleScaleChange(opt.value)}
                      style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: localSettings.uiScale === opt.value ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                        background: localSettings.uiScale === opt.value ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.5)',
                        color: localSettings.uiScale === opt.value ? '#38bdf8' : '#cbd5e1',
                        fontWeight: 700,
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                      }}
                    >
                      {opt.label}
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
                      type="button"
                      data-testid={`settings-subtitles-${sz}`}
                      onClick={() => setLocalSettings((prev) => ({ ...prev, subtitlesSize: sz }))}
                      style={{
                        flex: 1,
                        padding: '10px 14px',
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
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', paddingTop: '4px' }}>
                <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.high_contrast')}</span>
                  <input
                    data-testid="settings-colorblind-toggle"
                    aria-label={t('settings.high_contrast')}
                    type="checkbox"
                    checked={localSettings.colorblindRoute}
                    onChange={(e) => handleHighContrastChange(e.currentTarget.checked)}
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
                    onChange={(e) =>
                      setLocalSettings((prev) => ({ ...prev, pauseOnDecisions: e.currentTarget.checked }))
                    }
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
                    onChange={(e) =>
                      setLocalSettings((prev) => ({ ...prev, reduceMotion: e.currentTarget.checked }))
                    }
                    style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: 'pointer' }}
                  />
                </label>
              </div>
            </div>
          )}

          {/* Audio Tab (live volume preview) */}
          {activeTab === 'audio' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.master_vol')}</span>
                  <span style={{ fontSize: '0.9rem', color: '#38bdf8', fontWeight: 700 }}>
                    {localDigits(Math.round(localSettings.masterVolume * 100))}%
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
                    const next = { ...localSettings, masterVolume: val };
                    setLocalSettings(next);
                    updateAudioPreview(next, false);
                  }}
                  onChange={(e) => {
                    const val = parseFloat(e.currentTarget.value);
                    const next = { ...localSettings, masterVolume: val };
                    setLocalSettings(next);
                    updateAudioPreview(next, true);
                  }}
                  style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.sfx_vol')}</span>
                  <span style={{ fontSize: '0.9rem', color: '#38bdf8', fontWeight: 700 }}>
                    {localDigits(Math.round(localSettings.sfxVolume * 100))}%
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
                    const next = { ...localSettings, sfxVolume: val };
                    setLocalSettings(next);
                    updateAudioPreview(next, false);
                  }}
                  onChange={(e) => {
                    const val = parseFloat(e.currentTarget.value);
                    const next = { ...localSettings, sfxVolume: val };
                    setLocalSettings(next);
                    updateAudioPreview(next, true);
                  }}
                  style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                  <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.ambient_vol')}</span>
                  <span style={{ fontSize: '0.9rem', color: '#38bdf8', fontWeight: 700 }}>
                    {localDigits(Math.round(localSettings.ambientVolume * 100))}%
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
                    const next = { ...localSettings, ambientVolume: val };
                    setLocalSettings(next);
                    updateAudioPreview(next, false);
                  }}
                  onChange={(e) => {
                    const val = parseFloat(e.currentTarget.value);
                    const next = { ...localSettings, ambientVolume: val };
                    setLocalSettings(next);
                    updateAudioPreview(next, true);
                  }}
                  style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.mute')}</span>
                <input
                  data-testid="settings-mute"
                  type="checkbox"
                  checked={localSettings.muted}
                  onChange={(e) => {
                    const next = { ...localSettings, muted: e.currentTarget.checked };
                    setLocalSettings(next);
                    updateAudioPreview(next, !next.muted);
                  }}
                  style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </label>
            </div>
          )}

          {/* Controls Tab (Interactive Keyboard & Controller Rebinding) */}
          {activeTab === 'controls' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <span style={{ fontSize: '0.9rem', color: '#cbd5e1' }}>{t('settings.tilt_controls')}</span>
                <input
                  data-testid="settings-tilt-toggle"
                  type="checkbox"
                  checked={localSettings.tiltControls}
                  onChange={(e) =>
                    setLocalSettings((prev) => ({ ...prev, tiltControls: e.currentTarget.checked }))
                  }
                  style={{ width: '18px', height: '18px', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
              </label>

              <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.08)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    {t('settings.controls.rebind_hint')}
                  </span>
                  <button
                    type="button"
                    data-testid="settings-reset-controls"
                    onClick={() => {
                      updateDraftBindings(cloneDefaultBindings());
                      updateListeningTarget(null);
                      setRebindError(null);
                    }}
                    style={{
                      padding: '6px 10px',
                      borderRadius: '8px',
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                      background: 'rgba(15, 23, 42, 0.6)',
                      color: '#cbd5e1',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t('settings.controls.reset')}
                  </button>
                </div>

                {rebindError && (
                  <div
                    data-testid="settings-rebind-conflict"
                    role="alert"
                    style={{
                      padding: '8px 12px',
                      borderRadius: '8px',
                      background: 'rgba(239, 68, 68, 0.16)',
                      border: '1px solid rgba(239, 68, 68, 0.45)',
                      color: '#fca5a5',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                    }}
                  >
                    {rebindError}
                  </div>
                )}

                <h4 style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                  {t('settings.controls.keyboard_heading')}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', fontSize: '0.82rem' }}>
                  {KEYBOARD_ACTIONS.map(({ action, labelKey }) => {
                    const isListening =
                      listeningTarget?.kind === 'keyboard' && listeningTarget.action === action;
                    const keyCodes = draftBindings.keyboard[action].join(' / ');
                    return (
                      <button
                        key={action}
                        type="button"
                        data-testid={`settings-rebind-${action}`}
                        onClick={() => {
                          setRebindError(null);
                          updateListeningTarget({ kind: 'keyboard', action });
                        }}
                        style={{
                          background: isListening ? 'rgba(245, 158, 11, 0.2)' : 'rgba(15, 23, 42, 0.5)',
                          border: isListening ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.08)',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          color: '#f8fafc',
                        }}
                      >
                        <span style={{ color: '#cbd5e1' }}>{t(labelKey)}</span>
                        <strong style={{ color: isListening ? '#fbbf24' : '#38bdf8' }}>
                          {isListening ? t('settings.controls.listening') : keyCodes}
                        </strong>
                      </button>
                    );
                  })}
                </div>

                <h4 style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                  {t('settings.controls.gamepad_heading')}
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', fontSize: '0.82rem' }}>
                  {GAMEPAD_ACTIONS.map(({ action, labelKey }) => {
                    const isListening =
                      listeningTarget?.kind === 'gamepad' && listeningTarget.action === action;
                    const btnNum = draftBindings.gamepad[action];
                    return (
                      <button
                        key={action}
                        type="button"
                        data-testid={`settings-rebind-gp-${action}`}
                        onClick={() => {
                          setRebindError(null);
                          updateListeningTarget({ kind: 'gamepad', action });
                        }}
                        style={{
                          background: isListening ? 'rgba(245, 158, 11, 0.2)' : 'rgba(15, 23, 42, 0.5)',
                          border: isListening ? '1px solid #f59e0b' : '1px solid rgba(255, 255, 255, 0.08)',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '8px',
                          cursor: 'pointer',
                          color: '#f8fafc',
                        }}
                      >
                        <span style={{ color: '#cbd5e1' }}>{t(labelKey)}</span>
                        <strong style={{ color: isListening ? '#fbbf24' : '#38bdf8' }}>
                          {isListening ? t('settings.controls.listening') : `B${btnNum}`}
                        </strong>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '12px 20px',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '12px',
            background: 'rgba(15, 23, 42, 0.5)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            data-testid="settings-cancel-btn"
            onClick={handleCancel}
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
            {t('settings.cancel')}
          </button>
          <button
            type="button"
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
