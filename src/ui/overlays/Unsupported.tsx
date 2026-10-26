import type { JSX } from 'preact';
import { t } from '../i18n';

interface UnsupportedProps {
  message?: string;
}

export function Unsupported({ message }: UnsupportedProps): JSX.Element {
  return (
    <div
      data-testid="unsupported-overlay"
      id="unsupported-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 15, 29, 0.94)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
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
          background: 'rgba(30, 41, 59, 0.7)',
          border: '1px solid rgba(239, 68, 68, 0.4)',
          borderRadius: '20px',
          padding: '36px 32px',
          maxWidth: '420px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(239, 68, 68, 0.15)',
        }}
      >
        <div
          style={{
            fontSize: '44px',
            marginBottom: '16px',
          }}
        >
          ⚠️
        </div>

        <h2
          style={{
            fontSize: '1.4rem',
            fontWeight: 700,
            margin: '0 0 12px 0',
            color: '#ffffff',
          }}
        >
          {message ?? t('ui.unsupported_webgl')}
        </h2>

        <p
          style={{
            fontSize: '0.95rem',
            color: '#94a3b8',
            margin: 0,
            lineHeight: 1.5,
          }}
        >
          {t('ui.unsupported_hint')}
        </p>
      </div>
    </div>
  );
}
