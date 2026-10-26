import type { JSX, ComponentChildren } from 'preact';
import { formatTaka } from '../utils/bangla';

export interface TransactionRowProps {
  label: string;
  amount: number;
  type?: 'income' | 'expense' | 'neutral' | 'fine' | 'bribe';
  icon?: ComponentChildren;
  subtitle?: string;
  isTotal?: boolean;
  className?: string;
}

export function TransactionRow({
  label,
  amount,
  type = 'neutral',
  icon,
  subtitle,
  isTotal = false,
  className = '',
}: TransactionRowProps): JSX.Element {
  const isPositive = amount > 0 && type === 'income';
  const isNegative = amount < 0 || type === 'expense' || type === 'fine' || type === 'bribe';

  const amountColor = {
    income: 'text-emerald-400',
    expense: 'text-slate-300',
    fine: 'text-rose-400',
    bribe: 'text-amber-400',
    neutral: 'text-slate-200',
  }[type];

  const prefix = isPositive ? '+ ' : isNegative && amount > 0 ? '- ' : '';

  return (
    <div
      className={`flex items-center justify-between py-2 border-b border-slate-800/40 text-xs ${
        isTotal ? 'font-bold text-sm py-3 border-t border-b-2 border-slate-700/80' : ''
      } ${className}`}
    >
      <div className="flex items-center gap-2.5">
        {icon && (
          <div className="w-6 h-6 rounded-md bg-slate-800/80 flex items-center justify-center text-slate-300 text-xs">
            {icon}
          </div>
        )}
        <div>
          <span className={isTotal ? 'text-slate-100 font-extrabold' : 'text-slate-300'}>
            {label}
          </span>
          {subtitle && <p className="text-[10px] text-slate-500 leading-tight">{subtitle}</p>}
        </div>
      </div>

      <div className={`font-mono font-bold tracking-wide ${amountColor}`}>
        {prefix}
        {formatTaka(Math.abs(amount))}
      </div>
    </div>
  );
}
