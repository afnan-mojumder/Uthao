import type { JSX } from 'preact';
import { t } from '../i18n';

export interface PauseProps {
  isOpen: boolean;
  onResume?: () => void;
  onOpenMap?: () => void;
  onOpenSettings?: () => void;
  onOpenSave?: () => void;
  onOpenLoad?: () => void;
  onExitToMainMenu?: () => void;
}

export function Pause({
  isOpen,
  onResume,
  onOpenMap,
  onOpenSettings,
  onOpenSave,
  onOpenLoad,
  onExitToMainMenu,
}: PauseProps): JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div
      data-testid="pause-menu"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9997,
        background: 'rgba(15, 23, 42, 0.88)',
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
          maxWidth: '400px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 35px rgba(56, 189, 248, 0.1)',
          padding: '32px 24px',
          gap: '24px',
        }}
      >
        {/* Title */}
        <div style={{ textAlign: 'center' }}>
          <div
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              background: 'rgba(56, 189, 248, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 12px auto',
              fontSize: '1.4rem',
              color: '#38bdf8',
            }}
          >
            ⏸️
          </div>
          <h2
            data-testid="pause-title"
            style={{
              margin: '0 0 4px 0',
              fontSize: '1.5rem',
              fontWeight: 800,
              letterSpacing: '1px',
            }}
          >
            {t('pause.title')}
          </h2>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#94a3b8' }}>
            Dhaka Ride-Hailing · Press Esc or Resume
          </p>
        </div>

        {/* Action Buttons */}
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            data-testid="pause-btn-resume"
            onClick={onResume}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: 'none',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              boxShadow: '0 4px 14px rgba(16, 185, 129, 0.3)',
            }}
          >
            <span>▶️</span> {t('pause.resume')}
          </button>

          <button
            data-testid="pause-btn-map"
            onClick={onOpenMap}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: '12px',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <span>🗺️</span> {t('pause.map')}
          </button>

          <button
            data-testid="pause-btn-save"
            onClick={onOpenSave}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: '12px',
              border: '1px solid rgba(245, 158, 11, 0.3)',
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#f59e0b',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <span>💾</span> {t('pause.save') || 'গেম সেভ করুন (Save Game)'}
          </button>

          <button
            data-testid="pause-btn-load"
            onClick={onOpenLoad}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: '12px',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              background: 'rgba(56, 189, 248, 0.12)',
              color: '#38bdf8',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <span>📂</span> {t('pause.load') || 'গেম লোড করুন (Load Game)'}
          </button>

          <button
            data-testid="pause-btn-settings"
            onClick={onOpenSettings}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              background: 'rgba(30, 41, 59, 0.6)',
              color: '#cbd5e1',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <span>⚙️</span> {t('pause.settings')}
          </button>

          <button
            data-testid="pause-btn-exit"
            onClick={onExitToMainMenu}
            style={{
              width: '100%',
              padding: '12px',
              borderRadius: '12px',
              border: 'none',
              background: 'transparent',
              color: '#94a3b8',
              fontSize: '0.9rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
            }}
          >
            <span>🚪</span> {t('pause.main_menu')}
          </button>
        </div>
      </div>
    </div>
  );
}
