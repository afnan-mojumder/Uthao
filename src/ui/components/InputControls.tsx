import type { JSX, ComponentChildren } from 'preact';

export interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled = false,
}: ToggleProps): JSX.Element {
  return (
    <label className={`inline-flex items-center gap-2.5 cursor-pointer select-none ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      <div
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 border p-0.5 ${
          checked
            ? 'bg-emerald-600 border-emerald-500 shadow-[0_0_12px_rgba(34,197,94,0.4)]'
            : 'bg-slate-800 border-slate-700 shadow-inner'
        }`}
      >
        <div
          className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform duration-200 ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </div>
      {label && <span className="text-xs font-semibold text-slate-300">{label}</span>}
    </label>
  );
}

export interface BadgeProps {
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
  children: ComponentChildren;
  size?: 'sm' | 'md';
  icon?: ComponentChildren;
  className?: string;
}

export function Badge({
  variant = 'neutral',
  children,
  size = 'md',
  icon,
  className = '',
}: BadgeProps): JSX.Element {
  const styles = {
    success: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    warning: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    error: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    info: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
    neutral: 'bg-slate-700/40 text-slate-300 border-slate-600/40',
  }[variant];

  const sizeClass = size === 'sm' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold border backdrop-blur-sm ${sizeClass} ${styles} ${className}`}
    >
      {icon && <span className="inline-flex items-center text-current">{icon}</span>}
      <span>{children}</span>
    </span>
  );
}

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  className = '',
}: SearchInputProps): JSX.Element {
  return (
    <div className={`relative flex items-center ${className}`}>
      <span className="absolute left-3 text-slate-400 text-xs">🔍</span>
      <input
        type="text"
        value={value}
        onInput={(e) => onChange((e.target as HTMLInputElement).value)}
        placeholder={placeholder}
        className="w-full pl-8 pr-3 py-1.5 text-xs rounded-xl bg-slate-900/80 border border-slate-700/60 text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/50 transition-all shadow-inner"
      />
    </div>
  );
}
