import type { JSX } from 'preact';
import { t } from '../i18n';
import { loadingSignal, Z_LAYER } from '../store';

interface LoadingProps {
  message?: string;
}

function resolveStageLabel(stageKey: string): string {
  if (!stageKey) return t('ui.loading');
  const translated = t(stageKey);
  return translated !== stageKey ? translated : t('ui.loading');
}

export function Loading({ message }: LoadingProps): JSX.Element {
  const { stageKey, progress, error } = loadingSignal.value;
  const clampedProgress = Math.max(0, Math.min(100, Math.round(progress)));
  const isError = Boolean(error);
  const stageLabel = message ?? (isError ? t('loading.error') : resolveStageLabel(stageKey));

  return (
    <div
      data-testid="loading-overlay"
      id="loading-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: Z_LAYER.SYSTEM_OVERLAY,
        pointerEvents: 'auto',
        background: 'rgba(7, 12, 22, 0.85)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        textAlign: 'center',
        color: 'var(--text-primary, #F8FAFC)',
        fontFamily: "var(--font-sans, 'Hind Siliguri', system-ui, -apple-system, sans-serif)",
      }}
    >
      {!isError && (
        <div
          style={{
            width: '54px',
            height: '54px',
            border: '4px solid rgba(56, 189, 248, 0.2)',
            borderTopColor: 'var(--info-sky, #38BDF8)',
            borderRadius: '50%',
            animation: 'uthao-spin 0.9s linear infinite',
            boxShadow: '0 0 25px rgba(56, 189, 248, 0.3)',
            marginBottom: '20px',
          }}
        />
      )}

      <p
        data-testid="loading-stage"
        style={{
          fontSize: '1.05rem',
          fontWeight: 600,
          color: isError ? 'var(--danger-red, #EF4444)' : '#e2e8f0',
          letterSpacing: '0.02em',
          margin: 0,
        }}
      >
        {stageLabel}
      </p>

      {isError ? (
        <div
          style={{
            marginTop: '14px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            maxWidth: '420px',
          }}
        >
          <p
            data-testid="loading-error"
            style={{
              margin: 0,
              fontSize: '0.88rem',
              color: '#94a3b8',
              wordBreak: 'break-word',
            }}
          >
            {error}
          </p>
          <button
            data-testid="loading-retry-btn"
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              borderRadius: '10px',
              border: '1px solid rgba(56, 189, 248, 0.45)',
              background: 'rgba(14, 165, 233, 0.2)',
              color: '#f8fafc',
              fontSize: '0.95rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('ui.restart')}
          </button>
        </div>
      ) : (
        <div
          data-testid="loading-progress"
          role="progressbar"
          aria-label={t('loading.progress_aria')}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={clampedProgress}
          style={{
            marginTop: '16px',
            width: 'min(260px, 75vw)',
            height: '6px',
            borderRadius: '9999px',
            background: 'rgba(148, 163, 184, 0.2)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${clampedProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, var(--info-sky, #38BDF8) 0%, var(--uthao-green, #22C55E) 100%)',
              transition: 'width 0.2s ease',
            }}
          />
        </div>
      )}

      <style>{`
        @keyframes uthao-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
