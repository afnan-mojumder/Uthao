import type { JSX, ComponentChildren } from 'preact';

export interface ButtonProps {
  children?: ComponentChildren;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  icon?: ComponentChildren;
  fullWidth?: boolean;
  title?: string;
}

export function PrimaryButton({
  children,
  onClick,
  disabled = false,
  className = '',
  size = 'md',
  icon,
  fullWidth = false,
  title,
}: ButtonProps): JSX.Element {
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs font-semibold gap-1.5',
    md: 'px-4 py-2.5 text-sm font-bold gap-2',
    lg: 'px-6 py-3.5 text-base font-extrabold gap-2.5',
  }[size];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`relative inline-flex items-center justify-center rounded-xl transition-all duration-200 select-none shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${
        fullWidth ? 'w-full' : ''
      } ${sizeStyles} ${className}`}
      style={{
        background: 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)',
        color: '#FFFFFF',
        boxShadow: '0 8px 20px -4px rgba(34, 197, 94, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
      }}
    >
      {icon && <span className="inline-flex items-center">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

export function SecondaryButton({
  children,
  onClick,
  disabled = false,
  className = '',
  size = 'md',
  icon,
  fullWidth = false,
  title,
}: ButtonProps): JSX.Element {
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs font-semibold gap-1.5',
    md: 'px-4 py-2.5 text-sm font-semibold gap-2',
    lg: 'px-6 py-3.5 text-base font-bold gap-2.5',
  }[size];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`relative inline-flex items-center justify-center rounded-xl transition-all duration-200 select-none backdrop-blur-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${
        fullWidth ? 'w-full' : ''
      } ${sizeStyles} ${className}`}
      style={{
        background: 'rgba(30, 41, 59, 0.75)',
        color: '#E2E8F0',
        border: '1px solid rgba(148, 163, 184, 0.2)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
      }}
    >
      {icon && <span className="inline-flex items-center text-slate-400">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

export function DangerButton({
  children,
  onClick,
  disabled = false,
  className = '',
  size = 'md',
  icon,
  fullWidth = false,
  title,
}: ButtonProps): JSX.Element {
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs font-semibold gap-1.5',
    md: 'px-4 py-2.5 text-sm font-bold gap-2',
    lg: 'px-6 py-3.5 text-base font-extrabold gap-2.5',
  }[size];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`relative inline-flex items-center justify-center rounded-xl transition-all duration-200 select-none shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${
        fullWidth ? 'w-full' : ''
      } ${sizeStyles} ${className}`}
      style={{
        background: 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)',
        color: '#FFFFFF',
        boxShadow: '0 8px 20px -4px rgba(239, 68, 68, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.25)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
      }}
    >
      {icon && <span className="inline-flex items-center">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}

export function AmberButton({
  children,
  onClick,
  disabled = false,
  className = '',
  size = 'md',
  icon,
  fullWidth = false,
  title,
}: ButtonProps): JSX.Element {
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs font-semibold gap-1.5',
    md: 'px-4 py-2.5 text-sm font-bold gap-2',
    lg: 'px-6 py-3.5 text-base font-extrabold gap-2.5',
  }[size];

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`relative inline-flex items-center justify-center rounded-xl transition-all duration-200 select-none shadow-lg active:scale-95 disabled:opacity-50 disabled:pointer-events-none ${
        fullWidth ? 'w-full' : ''
      } ${sizeStyles} ${className}`}
      style={{
        background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
        color: '#0F172A',
        boxShadow: '0 8px 20px -4px rgba(245, 158, 11, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
        border: '1px solid rgba(255, 255, 255, 0.2)',
      }}
    >
      {icon && <span className="inline-flex items-center">{icon}</span>}
      <span>{children}</span>
    </button>
  );
}
