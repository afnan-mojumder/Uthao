import type { JSX, ComponentChildren } from 'preact';

export interface ChoiceCardProps {
  title: string;
  description?: string;
  payout?: string;
  icon?: ComponentChildren;
  badge?: string;
  selected?: boolean;
  disabled?: boolean;
  variant?: 'default' | 'primary' | 'danger' | 'amber';
  onClick?: () => void;
  className?: string;
}

export function ChoiceCard({
  title,
  description,
  payout,
  icon,
  badge,
  selected = false,
  disabled = false,
  variant = 'default',
  onClick,
  className = '',
}: ChoiceCardProps): JSX.Element {
  const borderColors = {
    default: selected
      ? 'border-sky-500 bg-sky-950/30'
      : 'border-slate-700/60 hover:border-slate-500 bg-slate-900/60',
    primary: selected
      ? 'border-emerald-500 bg-emerald-950/40'
      : 'border-emerald-700/50 hover:border-emerald-500/80 bg-slate-900/60',
    danger: selected
      ? 'border-rose-500 bg-rose-950/40'
      : 'border-rose-800/50 hover:border-rose-600/80 bg-slate-900/60',
    amber: selected
      ? 'border-amber-500 bg-amber-950/40'
      : 'border-amber-700/50 hover:border-amber-500/80 bg-slate-900/60',
  }[variant];

  return (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onClick}
      onKeyDown={(e) => {
        if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`relative w-full p-3.5 rounded-2xl border transition-all duration-200 cursor-pointer backdrop-blur-md select-none text-left active:scale-[0.98] ${
        disabled ? 'opacity-40 pointer-events-none' : ''
      } ${borderColors} ${className}`}
      style={{
        boxShadow: selected
          ? '0 10px 25px -5px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          : '0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {icon && (
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-slate-800/80 flex items-center justify-center text-slate-300 border border-slate-700/60">
              {icon}
            </div>
          )}
          <div>
            <div className="text-sm font-bold text-slate-100 flex items-center gap-2">
              {title}
              {badge && (
                <span className="text-[10px] px-1.5 py-0.5 rounded-md font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {badge}
                </span>
              )}
            </div>
            {description && (
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>
            )}
          </div>
        </div>

        {payout && (
          <div className="flex-shrink-0 text-right">
            <span className="text-sm font-black font-mono text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded-lg border border-emerald-600/30 shadow-sm">
              {payout}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
