import type { JSX, ComponentChildren } from 'preact';

export interface StatusBarProps {
  label: string;
  value: number; // 0 to 100
  max?: number;
  variant?: 'fuel' | 'health' | 'patience' | 'trust' | 'police' | 'crime' | 'neutral' | 'danger';
  showLabel?: boolean;
  showPercent?: boolean;
  icon?: ComponentChildren;
  className?: string;
}

export function StatusBar({
  label,
  value,
  max = 100,
  variant = 'neutral',
  showLabel = true,
  showPercent = true,
  icon,
  className = '',
}: StatusBarProps): JSX.Element {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const variantColors: Record<string, { bar: string; text: string; glow: string }> = {
    fuel: {
      bar: 'linear-gradient(90deg, #F59E0B 0%, #22C55E 100%)',
      text: 'text-amber-400',
      glow: 'rgba(34, 197, 94, 0.4)',
    },
    health: {
      bar: 'linear-gradient(90deg, #EF4444 0%, #22C55E 100%)',
      text: 'text-emerald-400',
      glow: 'rgba(34, 197, 94, 0.4)',
    },
    patience: {
      bar: 'linear-gradient(90deg, #EF4444 0%, #F59E0B 60%, #22C55E 100%)',
      text: 'text-amber-300',
      glow: 'rgba(245, 158, 11, 0.4)',
    },
    trust: {
      bar: 'linear-gradient(90deg, #3B82F6 0%, #22C55E 100%)',
      text: 'text-blue-400',
      glow: 'rgba(59, 130, 246, 0.4)',
    },
    police: {
      bar: 'linear-gradient(90deg, #3B82F6 0%, #EF4444 100%)',
      text: 'text-rose-400',
      glow: 'rgba(239, 68, 68, 0.4)',
    },
    crime: {
      bar: 'linear-gradient(90deg, #64748B 0%, #EF4444 100%)',
      text: 'text-rose-500',
      glow: 'rgba(239, 68, 68, 0.5)',
    },
    danger: {
      bar: 'linear-gradient(90deg, #DC2626 0%, #EF4444 100%)',
      text: 'text-red-400',
      glow: 'rgba(239, 68, 68, 0.5)',
    },
    neutral: {
      bar: 'linear-gradient(90deg, #475569 0%, #38BDF8 100%)',
      text: 'text-sky-400',
      glow: 'rgba(56, 189, 248, 0.3)',
    },
  };

  const defaultStyle = variantColors.neutral ?? {
    bar: 'linear-gradient(90deg, #475569 0%, #38BDF8 100%)',
    text: 'text-sky-400',
    glow: 'rgba(56, 189, 248, 0.3)',
  };
  const style = variantColors[variant] ?? defaultStyle;

  return (
    <div className={`w-full ${className}`}>
      {(showLabel || showPercent) && (
        <div className="flex items-center justify-between mb-1 text-xs">
          <div className="flex items-center gap-1.5 font-medium text-slate-300">
            {icon && <span className="inline-flex items-center">{icon}</span>}
            {showLabel && <span>{label}</span>}
          </div>
          {showPercent && (
            <span className={`font-mono font-bold ${style.text}`}>
              {Math.round(percentage)}%
            </span>
          )}
        </div>
      )}

      {/* Progress Track */}
      <div className="relative w-full h-2 rounded-full overflow-hidden bg-slate-800/80 p-0.5 border border-slate-700/50 shadow-inner">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${percentage}%`,
            background: style.bar,
            boxShadow: `0 0 10px ${style.glow}`,
          }}
        />
      </div>
    </div>
  );
}
