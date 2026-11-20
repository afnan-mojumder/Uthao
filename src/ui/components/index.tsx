import type { ComponentChildren, CSSProperties, JSX } from 'preact';
import { ModalFocusGuard } from '../focusTrap';
import { localDigits, t } from '../i18n';
import { Z_LAYER } from '../store';
import { IconCheck, IconClose, IconMapPin, IconStar, IconUser } from './icons';

export interface ButtonProps {
  children?: ComponentChildren;
  onClick?: (e: MouseEvent) => void;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  icon?: ComponentChildren;
  ariaLabel?: string;
  testId?: string;
  'data-testid'?: string;
  id?: string;
  style?: CSSProperties;
}

type ButtonVariant = 'primary' | 'secondary' | 'danger';

const BUTTON_VARIANTS: Record<ButtonVariant, CSSProperties> = {
  primary: {
    background: 'var(--uthao-green, #22C55E)',
    border: '1px solid rgba(34, 197, 94, 0.85)',
    color: '#052e16',
    boxShadow: '0 4px 14px rgba(34, 197, 94, 0.25)',
  },
  secondary: {
    background: 'var(--surface-card, rgba(30, 41, 59, 0.84))',
    border: '1px solid var(--border-strong, rgba(148, 163, 184, 0.35))',
    color: 'var(--text-primary, #F8FAFC)',
  },
  danger: {
    background: 'rgba(127, 29, 29, 0.88)',
    border: '1px solid var(--danger-red, #EF4444)',
    color: '#FEF2F2',
  },
};

function ActionButton({
  variant,
  children,
  onClick,
  disabled = false,
  type = 'button',
  icon,
  ariaLabel,
  testId,
  'data-testid': dataTestId,
  id,
  style,
}: ButtonProps & { variant: ButtonVariant }): JSX.Element {
  return (
    <button
      id={id}
      type={type}
      data-testid={dataTestId ?? testId}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
        minHeight: 'var(--touch-target-min, 44px)',
        padding: '10px 16px',
        borderRadius: 'var(--radius-md, 12px)',
        fontFamily: 'var(--font-sans)',
        fontSize: '0.95rem',
        fontWeight: 700,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.55 : 1,
        pointerEvents: 'auto',
        transition: 'transform 0.12s ease, opacity 0.15s ease, border-color 0.15s ease',
        ...BUTTON_VARIANTS[variant],
        ...style,
      }}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

export function PrimaryButton(props: ButtonProps): JSX.Element {
  return <ActionButton {...props} variant="primary" />;
}

export function SecondaryButton(props: ButtonProps): JSX.Element {
  return <ActionButton {...props} variant="secondary" />;
}

export function DangerButton(props: ButtonProps): JSX.Element {
  return <ActionButton {...props} variant="danger" />;
}

export interface ChoiceCardOptionItem {
  id: string;
  label: string;
  kind?: 'official' | 'illicit' | 'neutral';
  badge?: string;
  costHint?: string;
  riskText?: string;
  shortcut?: string;
  disabled?: boolean;
}

export interface ChoiceCardPrimitiveProps {
  prompt: string;
  options: ChoiceCardOptionItem[];
  onSelect?: (id: string) => void;
  outcomeText?: string;
  continueLabel?: string;
  onContinue?: () => void;
  testId?: string;
  style?: CSSProperties;
}

function choiceBorderColor(kind?: 'official' | 'illicit' | 'neutral'): string {
  if (kind === 'official') return 'var(--uthao-green-border, rgba(34, 197, 94, 0.45))';
  if (kind === 'illicit') return 'var(--dhaka-amber-border, rgba(245, 158, 11, 0.48))';
  return 'var(--border-subtle, rgba(255, 255, 255, 0.12))';
}

export function ChoiceCard({
  prompt,
  options,
  onSelect,
  outcomeText,
  continueLabel,
  onContinue,
  testId,
  style,
}: ChoiceCardPrimitiveProps): JSX.Element {
  return (
    <div
      data-testid={testId}
      style={{
        background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
        backdropFilter: 'blur(16px)',
        border: '1px solid var(--info-sky-border, rgba(56, 189, 248, 0.42))',
        borderRadius: 'var(--radius-lg, 16px)',
        padding: 'var(--panel-padding, 20px 24px)',
        color: 'var(--text-primary, #F8FAFC)',
        fontFamily: 'var(--font-sans)',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          aria-hidden="true"
          style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: outcomeText ? 'var(--uthao-green, #22C55E)' : 'var(--info-sky, #38BDF8)',
            flexShrink: 0,
          }}
        />
        <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.4 }}>{prompt}</h3>
      </div>

      {outcomeText ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <p
            style={{
              margin: 0,
              padding: '12px 14px',
              borderRadius: 'var(--radius-sm, 8px)',
              background: 'var(--surface-card, rgba(30, 41, 59, 0.84))',
              border: '1px solid var(--info-sky-border, rgba(56, 189, 248, 0.3))',
              color: 'var(--text-secondary, #CBD5E1)',
              lineHeight: 1.5,
            }}
          >
            {outcomeText}
          </p>
          <PrimaryButton onClick={onContinue} style={{ alignSelf: 'flex-end' }}>
            {continueLabel ?? t('ui.continue')}
          </PrimaryButton>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              disabled={opt.disabled}
              data-choice-kind={opt.kind ?? 'neutral'}
              onClick={() => onSelect?.(opt.id)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: '4px',
                padding: '12px 14px',
                minHeight: 'var(--touch-target-min, 44px)',
                borderRadius: 'var(--radius-sm, 8px)',
                background:
                  opt.kind === 'illicit'
                    ? 'rgba(69, 26, 3, 0.48)'
                    : opt.kind === 'official'
                      ? 'rgba(6, 78, 59, 0.38)'
                      : 'var(--surface-card, rgba(30, 41, 59, 0.84))',
                border: `1px solid ${choiceBorderColor(opt.kind)}`,
                color: 'var(--text-primary, #F8FAFC)',
                textAlign: 'left',
                cursor: opt.disabled ? 'not-allowed' : 'pointer',
                pointerEvents: 'auto',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontWeight: 600 }}>{opt.label}</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  {opt.badge && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: 'var(--radius-pill, 9999px)',
                        background: opt.kind === 'illicit' ? 'var(--dhaka-amber-dim)' : 'var(--uthao-green-dim)',
                        color: opt.kind === 'illicit' ? 'var(--dhaka-amber, #F59E0B)' : 'var(--uthao-green, #22C55E)',
                      }}
                    >
                      {opt.badge}
                    </span>
                  )}
                  {opt.costHint && (
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary, #F8FAFC)' }}>
                      {opt.costHint}
                    </span>
                  )}
                  {opt.shortcut && (
                    <span
                      style={{
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.78rem',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        color: 'var(--text-muted, #94A3B8)',
                      }}
                    >
                      [{opt.shortcut}]
                    </span>
                  )}
                </span>
              </div>
              {opt.riskText && (
                <span style={{ fontSize: '0.8rem', color: 'var(--dhaka-amber, #F59E0B)' }}>{opt.riskText}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export interface StatusBarProps {
  label?: string;
  value: number;
  max?: number;
  tone?: 'green' | 'amber' | 'red' | 'sky';
  showPercentage?: boolean;
  valueText?: string;
  ariaLabel?: string;
  testId?: string;
  style?: CSSProperties;
}

const TONE_COLOR: Record<NonNullable<StatusBarProps['tone']>, string> = {
  green: 'var(--uthao-green, #22C55E)',
  amber: 'var(--dhaka-amber, #F59E0B)',
  red: 'var(--danger-red, #EF4444)',
  sky: 'var(--info-sky, #38BDF8)',
};

export function StatusBar({
  label,
  value,
  max = 100,
  tone = 'green',
  showPercentage = true,
  valueText,
  ariaLabel,
  testId,
  style,
}: StatusBarProps): JSX.Element {
  const safeMax = max > 0 ? max : 100;
  const clamped = Math.max(0, Math.min(safeMax, value));
  const pct = Math.round((clamped / safeMax) * 100);
  const fill = TONE_COLOR[tone];

  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: '4px', width: '100%', ...style }}>
      {(label || showPercentage || valueText) && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '0.85rem',
            fontWeight: 700,
            color: tone === 'red' ? 'var(--danger-red, #EF4444)' : 'var(--text-secondary, #CBD5E1)',
          }}
        >
          <span>{label}</span>
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{valueText ?? (showPercentage ? `${localDigits(pct)}%` : '')}</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={Math.round(clamped)}
        aria-label={ariaLabel ?? label ?? t('hud.condition')}
        style={{
          width: '100%',
          height: '8px',
          borderRadius: 'var(--radius-pill, 9999px)',
          background: 'rgba(148, 163, 184, 0.2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: fill,
            borderRadius: 'var(--radius-pill, 9999px)',
            transition: 'width 0.25s ease',
          }}
        />
      </div>
    </div>
  );
}

export interface CharacterPortraitProps {
  name: string;
  role?: string;
  mood?: 'happy' | 'neutral' | 'tense' | 'angry' | number;
  size?: number;
  icon?: ComponentChildren;
  testId?: string;
  style?: CSSProperties;
}

function moodBorderColor(mood: CharacterPortraitProps['mood']): string {
  if (typeof mood === 'number') {
    if (mood >= 0.7) return 'var(--uthao-green, #22C55E)';
    if (mood >= 0.35) return 'var(--dhaka-amber, #F59E0B)';
    return 'var(--danger-red, #EF4444)';
  }
  if (mood === 'happy') return 'var(--uthao-green, #22C55E)';
  if (mood === 'tense') return 'var(--dhaka-amber, #F59E0B)';
  if (mood === 'angry') return 'var(--danger-red, #EF4444)';
  return 'var(--info-sky, #38BDF8)';
}

export function CharacterPortrait({
  name,
  role,
  mood = 'neutral',
  size = 44,
  icon,
  testId,
  style,
}: CharacterPortraitProps): JSX.Element {
  const ringColor = moodBorderColor(mood);
  return (
    <div
      data-testid={testId}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        fontFamily: 'var(--font-sans)',
        ...style,
      }}
    >
      <div
        aria-hidden="true"
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          background: 'var(--surface-card, rgba(30, 41, 59, 0.84))',
          border: `2px solid ${ringColor}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-primary, #F8FAFC)',
          flexShrink: 0,
        }}
      >
        {icon ?? <IconUser size={Math.round(size * 0.5)} />}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-primary, #F8FAFC)' }}>{name}</span>
        {role && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94A3B8)' }}>{role}</span>}
      </div>
    </div>
  );
}

export interface NotificationToastProps {
  message: string;
  tone?: 'info' | 'success' | 'warning' | 'danger';
  icon?: ComponentChildren;
  onDismiss?: () => void;
  testId?: string;
  style?: CSSProperties;
}

const TOAST_TONES: Record<NonNullable<NotificationToastProps['tone']>, { border: string; color: string }> = {
  info: { border: 'var(--info-sky-border, rgba(56, 189, 248, 0.42))', color: 'var(--text-primary, #F8FAFC)' },
  success: { border: 'var(--uthao-green-border, rgba(34, 197, 94, 0.45))', color: '#DCFCE7' },
  warning: { border: 'var(--dhaka-amber-border, rgba(245, 158, 11, 0.48))', color: '#FEF3C7' },
  danger: { border: 'var(--danger-red-border, rgba(239, 68, 68, 0.5))', color: '#FEE2E2' },
};

export function NotificationToast({
  message,
  tone = 'info',
  icon,
  onDismiss,
  testId,
  style,
}: NotificationToastProps): JSX.Element {
  const palette = TOAST_TONES[tone];
  return (
    <div
      data-testid={testId}
      role="status"
      aria-live="polite"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '10px',
        padding: '10px 16px',
        borderRadius: 'var(--radius-md, 12px)',
        background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
        border: `1px solid ${palette.border}`,
        color: palette.color,
        fontFamily: 'var(--font-sans)',
        fontWeight: 700,
        fontSize: '0.9rem',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.45)',
        pointerEvents: onDismiss ? 'auto' : 'none',
        ...style,
      }}
    >
      {icon}
      <span>{message}</span>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={t('btn_close')}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'inherit',
            cursor: 'pointer',
            display: 'inline-flex',
            padding: '4px',
          }}
        >
          <IconClose size={16} />
        </button>
      )}
    </div>
  );
}

export interface MapMarkerProps {
  kind: 'player' | 'pickup' | 'dropoff' | 'fuel' | 'garage' | 'tea' | 'mission' | 'event';
  label: string;
  active?: boolean;
  xPct?: number;
  yPct?: number;
  onClick?: () => void;
  testId?: string;
  style?: CSSProperties;
}

const MARKER_COLOR: Record<MapMarkerProps['kind'], string> = {
  player: 'var(--info-sky, #38BDF8)',
  pickup: '#06B6D4',
  dropoff: 'var(--dhaka-amber, #F59E0B)',
  fuel: 'var(--uthao-green, #22C55E)',
  garage: '#A855F7',
  tea: '#F97316',
  mission: 'var(--dhaka-amber, #F59E0B)',
  event: 'var(--danger-red, #EF4444)',
};

export function MapMarker({
  kind,
  label,
  active = false,
  xPct,
  yPct,
  onClick,
  testId,
  style,
}: MapMarkerProps): JSX.Element {
  const color = MARKER_COLOR[kind];
  const positionStyle: CSSProperties =
    xPct !== undefined && yPct !== undefined
      ? { position: 'absolute', left: `${xPct}%`, top: `${yPct}%`, transform: 'translate(-50%, -50%)' }
      : {};

  const sharedStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '4px 8px',
    borderRadius: 'var(--radius-pill, 9999px)',
    background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
    border: `2px solid ${color}`,
    color: 'var(--text-primary, #F8FAFC)',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.78rem',
    fontWeight: 700,
    boxShadow: active ? `0 0 12px ${color}` : '0 2px 8px rgba(0, 0, 0, 0.45)',
    pointerEvents: 'auto',
    ...positionStyle,
    ...style,
  };

  if (onClick) {
    return (
      <button
        type="button"
        data-testid={testId}
        aria-label={label}
        onClick={onClick}
        style={{ ...sharedStyle, cursor: 'pointer' }}
      >
        <IconMapPin size={14} color={color} />
        <span>{label}</span>
      </button>
    );
  }

  return (
    <div data-testid={testId} aria-label={label} style={sharedStyle}>
      <IconMapPin size={14} color={color} />
      <span>{label}</span>
    </div>
  );
}

export interface ModalPanelProps {
  title?: ComponentChildren;
  subtitle?: ComponentChildren;
  onClose?: () => void;
  closeLabel?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  zIndex?: number;
  maxWidth?: string;
  children?: ComponentChildren;
  id?: string;
  testId?: string;
  'data-testid'?: string;
  style?: CSSProperties;
  panelStyle?: CSSProperties;
  backdropStyle?: CSSProperties;
  contentStyle?: CSSProperties;
}

export function ModalPanel({
  title,
  subtitle,
  onClose,
  closeLabel,
  ariaLabel,
  ariaLabelledBy,
  zIndex = Z_LAYER.MODAL,
  maxWidth = '560px',
  children,
  id,
  testId,
  'data-testid': dataTestId,
  style,
  panelStyle,
  backdropStyle,
  contentStyle,
}: ModalPanelProps): JSX.Element {
  const resolvedTestId = dataTestId ?? testId;
  const headingId = title ? `${resolvedTestId ?? id ?? 'modal-panel'}-title` : undefined;
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,
        pointerEvents: 'auto',
        background: 'var(--surface-backdrop, rgba(2, 6, 23, 0.8))',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        ...backdropStyle,
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && onClose) {
          e.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        id={id}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy ?? headingId}
        data-testid={resolvedTestId}
        tabIndex={-1}
        style={{
          width: '100%',
          maxWidth,
          maxHeight: '90dvh',
          overflowY: 'auto',
          pointerEvents: 'auto',
          background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
          border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
          borderRadius: 'var(--radius-xl, 20px)',
          padding: 'var(--panel-padding, 20px 24px)',
          color: 'var(--text-primary, #F8FAFC)',
          fontFamily: 'var(--font-sans)',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          ...style,
          ...panelStyle,
        }}
      >
        {(title || onClose) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
            <div>
              {title && (
                <h2 id={headingId} style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: 'var(--info-sky, #38BDF8)' }}>
                  {title}
                </h2>
              )}
              {subtitle && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94A3B8)', marginTop: '2px' }}>
                  {subtitle}
                </div>
              )}
            </div>
            {onClose && (
              <button
                type="button"
                aria-label={closeLabel ?? t('btn_close')}
                onClick={onClose}
                style={{
                  minWidth: 'var(--touch-target-min, 44px)',
                  minHeight: 'var(--touch-target-min, 44px)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 'var(--radius-sm, 8px)',
                  background: 'transparent',
                  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
                  color: 'var(--text-secondary, #CBD5E1)',
                  cursor: 'pointer',
                  pointerEvents: 'auto',
                }}
              >
                <IconClose size={18} />
              </button>
            )}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', ...contentStyle }}>
          <ModalFocusGuard />
          {children}
        </div>
      </div>
    </div>
  );
}

export interface TransactionRowProps {
  label: string;
  amount: number;
  currencySymbol?: string;
  kind?: 'income' | 'expense' | 'neutral' | 'total';
  note?: string;
  testId?: string;
}

export function TransactionRow({
  label,
  amount,
  currencySymbol = '৳',
  kind = 'neutral',
  note,
  testId,
}: TransactionRowProps): JSX.Element {
  const isTotal = kind === 'total';
  const color =
    kind === 'income'
      ? 'var(--uthao-green, #22C55E)'
      : kind === 'expense'
        ? 'var(--danger-red, #EF4444)'
        : isTotal
          ? amount >= 0
            ? 'var(--uthao-green, #22C55E)'
            : 'var(--danger-red, #EF4444)'
          : 'var(--text-primary, #F8FAFC)';
  const prefix = kind === 'income' ? '+' : kind === 'expense' ? '-' : '';
  const formatted = `${prefix}${currencySymbol}${localDigits(Math.abs(Math.round(amount)))}`;

  return (
    <div
      data-testid={testId}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px',
        padding: isTotal ? '8px 0 0 0' : '4px 0',
        borderTop: isTotal ? '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))' : 'none',
        fontWeight: isTotal ? 700 : 500,
        fontSize: isTotal ? '1rem' : '0.9rem',
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ color: isTotal ? 'var(--text-primary, #F8FAFC)' : 'var(--text-secondary, #CBD5E1)' }}>
          {label}
        </span>
        {note && <span style={{ fontSize: '0.78rem', color: 'var(--text-muted, #94A3B8)' }}>{note}</span>}
      </div>
      <span style={{ color, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{formatted}</span>
    </div>
  );
}

export interface MissionObjectiveItem {
  id: string;
  label: string;
  progress?: number;
  target?: number;
  completed?: boolean;
  distanceM?: number;
}

export interface MissionObjectivePanelProps {
  title: string;
  description?: string;
  objectives: MissionObjectiveItem[];
  isSide?: boolean;
  testId?: string;
  style?: CSSProperties;
}

export function MissionObjectivePanel({
  title,
  description,
  objectives,
  isSide = false,
  testId,
  style,
}: MissionObjectivePanelProps): JSX.Element {
  return (
    <div
      data-testid={testId}
      style={{
        background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
        border: `1px solid ${isSide ? 'var(--dhaka-amber-border, rgba(245, 158, 11, 0.48))' : 'var(--info-sky-border, rgba(56, 189, 248, 0.42))'}`,
        borderRadius: 'var(--radius-md, 12px)',
        padding: '14px 16px',
        color: 'var(--text-primary, #F8FAFC)',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        ...style,
      }}
    >
      <div style={{ fontWeight: 700, fontSize: '1rem', color: isSide ? 'var(--dhaka-amber, #F59E0B)' : 'var(--info-sky, #38BDF8)' }}>
        {title}
      </div>
      {description && <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary, #CBD5E1)' }}>{description}</div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {objectives.map((obj) => (
          <div
            key={obj.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 10px',
              borderRadius: 'var(--radius-sm, 8px)',
              background: 'var(--surface-card, rgba(30, 41, 59, 0.84))',
              fontSize: '0.86rem',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
              {obj.completed ? (
                <IconCheck size={15} color="var(--uthao-green, #22C55E)" />
              ) : (
                <span aria-hidden="true" style={{ color: 'var(--dhaka-amber, #F59E0B)', fontWeight: 700 }}>
                  •
                </span>
              )}
              <span
                style={{
                  textDecoration: obj.completed ? 'line-through' : 'none',
                  color: obj.completed ? 'var(--text-muted, #94A3B8)' : 'var(--text-primary, #F8FAFC)',
                }}
              >
                {obj.label}
              </span>
            </span>
            <span style={{ color: 'var(--text-muted, #94A3B8)', fontVariantNumeric: 'tabular-nums', fontSize: '0.8rem' }}>
              {obj.target !== undefined && obj.target > 1 ? `${localDigits(obj.progress ?? 0)}/${localDigits(obj.target)}` : ''}
              {obj.distanceM !== undefined ? ` • ${localDigits(Math.round(obj.distanceM))}m` : ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface TripSummaryPanelProps {
  title: string;
  subtitle?: string;
  rating?: number;
  ratingLabel?: string;
  rows: Array<{ label: string; amount: number; kind?: 'income' | 'expense' | 'neutral' | 'total' }>;
  consequences?: string[];
  continueLabel: string;
  onContinue: () => void;
  testId?: string;
}

export function TripSummaryPanel({
  title,
  subtitle,
  rating,
  ratingLabel,
  rows,
  consequences = [],
  continueLabel,
  onContinue,
  testId,
}: TripSummaryPanelProps): JSX.Element {
  return (
    <div
      data-testid={testId}
      style={{
        background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
        borderRadius: 'var(--radius-lg, 16px)',
        padding: 'var(--panel-padding, 20px 24px)',
        width: '100%',
        maxWidth: '440px',
        color: 'var(--text-primary, #F8FAFC)',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        pointerEvents: 'auto',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.35rem', fontWeight: 700, color: 'var(--info-sky, #38BDF8)' }}>{title}</h2>
        {subtitle && <div style={{ fontSize: '0.85rem', color: 'var(--text-muted, #94A3B8)', marginTop: '4px' }}>{subtitle}</div>}
      </div>

      {rating !== undefined && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', color: 'var(--dhaka-amber, #F59E0B)', fontWeight: 700 }}>
            <IconStar size={20} color="var(--dhaka-amber, #F59E0B)" />
            <span style={{ fontSize: '1.15rem' }}>{localDigits(rating.toFixed(1))}</span>
          </div>
          {ratingLabel && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted, #94A3B8)' }}>{ratingLabel}</div>}
        </div>
      )}

      <div
        style={{
          background: 'rgba(2, 6, 23, 0.55)',
          borderRadius: 'var(--radius-md, 12px)',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        {rows.map((row, idx) => (
          <TransactionRow key={`${row.label}-${idx}`} label={row.label} amount={row.amount} kind={row.kind} />
        ))}
      </div>

      {consequences.length > 0 && (
        <div style={{ fontSize: '0.82rem', color: 'var(--dhaka-amber, #F59E0B)', textAlign: 'center' }}>
          {consequences.map((c, idx) => (
            <div key={idx}>{c}</div>
          ))}
        </div>
      )}

      <PrimaryButton onClick={onContinue} style={{ width: '100%' }}>
        {continueLabel}
      </PrimaryButton>
    </div>
  );
}
