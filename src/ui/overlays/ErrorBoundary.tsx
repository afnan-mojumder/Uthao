import { Component, type ComponentChildren, type JSX } from 'preact';
import { t } from '../i18n';
import {
  activeSaveSystemSignal,
  clearRuntimeCrash,
  reportRuntimeCrash,
  runtimeCrashSignal,
  Z_LAYER,
} from '../store';
import { IconSave, IconWarning } from '../components/icons';

export { clearRuntimeCrash, reportRuntimeCrash };

export interface ErrorBoundaryProps {
  children?: ComponentChildren;
}

interface ErrorBoundaryState {
  renderError: string | null;
  exported: boolean;
}

const SAVE_SLOT_KEYS = [
  'uthao.save.auto',
  'uthao.save.slot1',
  'uthao.save.slot2',
  'uthao.save.slot3',
  'uthao.save.auto.corrupt',
  'uthao.save.slot1.corrupt',
  'uthao.save.slot2.corrupt',
  'uthao.save.slot3.corrupt',
  'uthao_save_auto',
  'uthao_save_slot1',
  'uthao_save_slot2',
  'uthao_save_slot3',
] as const;

function parseMaybeJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/**
 * Collects all `uthao.save.*` / `uthao_save_*` slots from `localStorage` and
 * the active `SaveSystem` into a formatted JSON string for player backup.
 */
export function exportSaveDataJson(): string {
  const saves: Record<string, unknown> = {};

  if (typeof localStorage !== 'undefined') {
    try {
      for (const key of SAVE_SLOT_KEYS) {
        const val = localStorage.getItem(key);
        if (val !== null) {
          saves[key] = parseMaybeJson(val);
        }
      }
      const len = typeof localStorage.length === 'number' ? localStorage.length : 0;
      for (let i = 0; i < len; i++) {
        const key = localStorage.key?.(i);
        if (
          key &&
          (key.startsWith('uthao.save.') || key.startsWith('uthao_save_')) &&
          !(key in saves)
        ) {
          const val = localStorage.getItem(key);
          if (val !== null) {
            saves[key] = parseMaybeJson(val);
          }
        }
      }
    } catch {
      // Ignore storage read errors in restricted WebViews
    }
  }

  const activeSys = activeSaveSystemSignal.value;
  if (activeSys) {
    try {
      const slots = activeSys.listSlots();
      for (const [slot, data] of Object.entries(slots)) {
        const key = `uthao.save.${slot}`;
        if (data && !(key in saves)) {
          saves[key] = data;
        }
      }
    } catch {
      // Ignore
    }
  }

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      saves,
    },
    null,
    2
  );
}

/** Triggers a browser file download (with clipboard fallback) of the exported save JSON. */
export function triggerSaveDataDownload(): string {
  const json = exportSaveDataJson();
  if (typeof document !== 'undefined') {
    try {
      if (typeof Blob !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `uthao-saves-${Date.now()}.json`;
        document.body?.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL?.(url);
      } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(json);
      }
    } catch {
      // Ignore in headless environments
    }
  }
  return json;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = {
    renderError: null,
    exported: false,
  };

  static override getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    const msg = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    return { renderError: msg };
  }

  override componentDidCatch(error: unknown): void {
    const msg = error instanceof Error ? error.message : String(error ?? 'Unknown error');
    this.setState({ renderError: msg });
  }

  private handleExport = (): void => {
    triggerSaveDataDownload();
    this.setState({ exported: true });
  };

  private handleReload = (): void => {
    clearRuntimeCrash();
    this.setState({ renderError: null, exported: false });
    if (typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') {
      window.location.reload();
    }
  };

  override render(): ComponentChildren | JSX.Element {
    const crashMessage = this.state.renderError ?? runtimeCrashSignal.value;
    if (!crashMessage) {
      return this.props.children;
    }

    return (
      <div
        data-testid="error-boundary-overlay"
        id="error-boundary-overlay"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="error-boundary-title"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: Z_LAYER.SYSTEM_OVERLAY + 50,
          pointerEvents: 'auto',
          background: 'rgba(10, 15, 29, 0.96)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f8fafc',
          fontFamily: "var(--font-sans, 'Hind Siliguri', system-ui, -apple-system, sans-serif)",
          padding: '24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.85)',
            border: '1px solid rgba(239, 68, 68, 0.45)',
            borderRadius: '20px',
            padding: '32px 28px',
            maxWidth: '480px',
            width: '100%',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7), 0 0 30px rgba(239, 68, 68, 0.15)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
          }}
        >
          <IconWarning size={42} color="var(--danger-red, #EF4444)" />

          <h2
            id="error-boundary-title"
            style={{
              fontSize: '1.35rem',
              fontWeight: 700,
              margin: 0,
              color: '#ffffff',
            }}
          >
            {t('error.title')}
          </h2>

          <p
            style={{
              fontSize: '0.92rem',
              color: '#cbd5e1',
              margin: 0,
              lineHeight: 1.5,
            }}
          >
            {t('error.desc')}
          </p>

          <pre
            data-testid="error-boundary-details"
            style={{
              margin: 0,
              width: '100%',
              maxHeight: '96px',
              overflowY: 'auto',
              padding: '10px 12px',
              borderRadius: '10px',
              background: 'rgba(15, 23, 42, 0.9)',
              border: '1px solid rgba(148, 163, 184, 0.2)',
              color: '#fca5a5',
              fontSize: '0.78rem',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {crashMessage}
          </pre>

          {this.state.exported && (
            <p
              data-testid="error-export-status"
              role="status"
              style={{
                margin: 0,
                fontSize: '0.85rem',
                fontWeight: 700,
                color: 'var(--uthao-green, #22C55E)',
              }}
            >
              {t('error.export_copied')}
            </p>
          )}

          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '10px',
              width: '100%',
              justifyContent: 'center',
              marginTop: '6px',
            }}
          >
            <button
              type="button"
              data-testid="error-export-save-btn"
              onClick={this.handleExport}
              style={{
                flex: 1,
                minWidth: '180px',
                minHeight: '44px',
                padding: '10px 16px',
                borderRadius: '12px',
                border: '1px solid rgba(56, 189, 248, 0.45)',
                background: 'rgba(14, 165, 233, 0.18)',
                color: '#38bdf8',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <IconSave size={16} />
              <span>{t('error.export_save')}</span>
            </button>

            <button
              type="button"
              data-testid="error-reload-btn"
              onClick={this.handleReload}
              style={{
                flex: 1,
                minWidth: '160px',
                minHeight: '44px',
                padding: '10px 16px',
                borderRadius: '12px',
                border: '1px solid rgba(34, 197, 94, 0.5)',
                background: 'linear-gradient(135deg, var(--uthao-green, #22C55E) 0%, #059669 100%)',
                color: '#ffffff',
                fontSize: '0.9rem',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t('error.reload')}
            </button>
          </div>
        </div>
      </div>
    );
  }
}
