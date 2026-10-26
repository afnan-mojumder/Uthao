import type { JSX } from 'preact';
import { t } from '../i18n';

export function RotateOverlay(): JSX.Element {
  return (
    <div
      data-testid="rotate-overlay"
      id="rotate-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(5, 10, 20, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '72px',
          height: '112px',
          border: '3px solid #38bdf8',
          borderRadius: '16px',
          marginBottom: '28px',
          position: 'relative',
          animation: 'uthao-phone-rotate 2.4s ease-in-out infinite',
          boxShadow: '0 0 24px rgba(56, 189, 248, 0.4)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '24px',
            height: '4px',
            background: 'rgba(255, 255, 255, 0.5)',
            borderRadius: '2px',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '8px',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '12px',
            height: '12px',
            border: '2px solid rgba(255, 255, 255, 0.5)',
            borderRadius: '50%',
          }}
        />
      </div>

      <h2
        style={{
          fontSize: '1.4rem',
          fontWeight: 700,
          margin: '0 0 10px 0',
          letterSpacing: '-0.02em',
          color: '#ffffff',
          textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
        }}
      >
        {t('ui.rotate_device')}
      </h2>

      <p
        style={{
          fontSize: '0.95rem',
          color: '#94a3b8',
          maxWidth: '320px',
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        {t('ui.rotate_hint')}
      </p>

      <style>{`
        @keyframes uthao-phone-rotate {
          0% { transform: rotate(0deg); }
          30% { transform: rotate(-90deg); }
          70% { transform: rotate(-90deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>
    </div>
  );
}
