import type { JSX, ComponentChildren } from 'preact';

export interface NotificationToastProps {
  title: string;
  message?: string;
  variant?: 'info' | 'warning' | 'danger' | 'success';
  icon?: ComponentChildren;
  onDismiss?: () => void;
  actionText?: string;
  onAction?: () => void;
  className?: string;
}

export function NotificationToast({
  title,
  message,
  variant = 'info',
  icon,
  onDismiss,
  actionText,
  onAction,
  className = '',
}: NotificationToastProps): JSX.Element {
  const styles = {
    info: {
      border: 'border-sky-500/40',
      bg: 'bg-slate-900/90',
      glow: 'rgba(56, 189, 248, 0.2)',
      badge: 'bg-sky-500/20 text-sky-400',
      defaultIcon: '💬',
    },
    warning: {
      border: 'border-amber-500/50',
      bg: 'bg-amber-950/80',
      glow: 'rgba(245, 158, 11, 0.25)',
      badge: 'bg-amber-500/20 text-amber-300',
      defaultIcon: '⚠️',
    },
    danger: {
      border: 'border-rose-500/50',
      bg: 'bg-rose-950/85',
      glow: 'rgba(239, 68, 68, 0.3)',
      badge: 'bg-rose-500/20 text-rose-300',
      defaultIcon: '🚨',
    },
    success: {
      border: 'border-emerald-500/50',
      bg: 'bg-emerald-950/80',
      glow: 'rgba(34, 197, 94, 0.25)',
      badge: 'bg-emerald-500/20 text-emerald-300',
      defaultIcon: '💰',
    },
  }[variant];

  return (
    <aside
      aria-label="Notification"
      className={`relative flex items-start gap-3 p-3.5 rounded-2xl border backdrop-blur-xl shadow-xl transition-all duration-300 ${styles.border} ${styles.bg} ${className}`}
      style={{
        boxShadow: `0 12px 30px -5px rgba(0, 0, 0, 0.5), 0 0 15px ${styles.glow}`,
      }}
    >
      <div className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold bg-slate-800/80 border border-slate-700/60 shadow-sm">
        {icon || styles.defaultIcon}
      </div>

      <div className="flex-1 min-w-0 pr-2">
        <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5 leading-snug">
          {title}
        </h4>
        {message && (
          <p className="text-[11px] text-slate-300 mt-0.5 leading-normal">{message}</p>
        )}
        {actionText && (
          <button
            type="button"
            onClick={onAction}
            className="mt-2 text-xs font-bold text-emerald-400 hover:text-emerald-300 transition-colors underline underline-offset-2"
          >
            {actionText}
          </button>
        )}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="flex-shrink-0 text-slate-400 hover:text-white p-1 rounded-lg transition-colors text-xs"
          aria-label="Dismiss"
        >
          ✕
        </button>
      )}
    </aside>
  );
}
