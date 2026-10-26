import type { JSX, ComponentChildren } from 'preact';

export interface ModalPanelProps {
  title?: string;
  subtitle?: string;
  isOpen: boolean;
  onClose?: () => void;
  children: ComponentChildren;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full';
  headerBadge?: ComponentChildren;
  footer?: ComponentChildren;
  className?: string;
}

export function ModalPanel({
  title,
  subtitle,
  isOpen,
  onClose,
  children,
  maxWidth = 'md',
  headerBadge,
  footer,
  className = '',
}: ModalPanelProps): JSX.Element | null {
  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-4xl',
  }[maxWidth];

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div
        className={`relative w-full ${maxWidthClass} rounded-3xl border border-slate-700/60 shadow-2xl overflow-hidden flex flex-col max-h-[90vh] ${className}`}
        style={{
          background: 'rgba(15, 23, 42, 0.92)',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.7), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
          backdropFilter: 'blur(20px)',
        }}
      >
        {/* Header */}
        {(title || onClose || headerBadge) && (
          <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-slate-900/50">
            <div>
              <div className="flex items-center gap-2.5">
                {title && <h3 className="text-base font-extrabold text-slate-100">{title}</h3>}
                {headerBadge}
              </div>
              {subtitle && <p className="text-xs text-slate-400 mt-0.5">{subtitle}</p>}
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-700/60 border border-slate-700/50 transition-colors text-sm"
                aria-label="Close"
              >
                ✕
              </button>
            )}
          </header>
        )}

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-slate-200">
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <footer className="px-6 py-4 border-t border-slate-800/80 bg-slate-900/50 flex items-center justify-end gap-3">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
}
