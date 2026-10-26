import type { JSX } from 'preact';
import { t } from '../i18n';

interface LoadingProps {
  message?: string;
}

export function Loading({ message }: LoadingProps): JSX.Element {
  return (
    <div
      data-testid="loading-overlay"
      id="loading-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(7, 12, 22, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          width: '54px',
          height: '54px',
          border: '4px solid rgba(56, 189, 248, 0.2)',
          borderTopColor: '#38bdf8',
          borderRadius: '50%',
          animation: 'uthao-spin 0.9s linear infinite',
          boxShadow: '0 0 25px rgba(56, 189, 248, 0.3)',
          marginBottom: '20px',
        }}
      />

      <p
        style={{
          fontSize: '1.05rem',
          fontWeight: 600,
          color: '#e2e8f0',
          letterSpacing: '0.02em',
          margin: 0,
        }}
      >
        {message ?? t('ui.loading')}
      </p>

      <style>{`
        @keyframes uthao-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
