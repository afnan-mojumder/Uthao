import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { ModalFocusGuard } from '../focusTrap';
import {
  choiceSignal,
  dayEndSignal,
  dismissChoiceOutcome,
  endingSignal,
  garageSignal,
  journalSignal,
  karmaPanelSignal,
  negotiationSignal,
  onChooseCallback,
  phoneSignal,
  saveSlotsSignal,
  screenSignal,
  settingsOpenSignal,
  tripSummarySignal,
  uiSheetSignal,
  type ChoiceOption,
  type ChoiceState,
} from '../store';
import { localDigits, t } from '../i18n';

export interface ChoiceCardProps {
  onChoose?: (choiceId: string, instanceId: string) => void;
  onDismissOutcome?: () => void;
}

function borderForKind(kind: ChoiceOption['kind']): string {
  if (kind === 'official') return 'rgba(34, 197, 94, 0.45)';
  if (kind === 'illicit') return 'rgba(245, 158, 11, 0.55)';
  return 'rgba(255, 255, 255, 0.1)';
}

type ChoiceVars = Record<string, string | number>;

function localizeVars(vars?: ChoiceVars): ChoiceVars | undefined {
  if (!vars) return undefined;
  const out: ChoiceVars = {};
  for (const [k, v] of Object.entries(vars)) {
    out[k] = typeof v === 'number' || /^\d+(\.\d+)?$/.test(String(v)) ? localDigits(v) : v;
  }
  return out;
}

export function ChoiceCardView({
  choice,
  onChoose,
  onDismissOutcome,
}: {
  choice: ChoiceState;
  onChoose?: (choiceId: string, instanceId: string) => void;
  onDismissOutcome?: () => void;
}): JSX.Element | null {
  if (!choice.active || !choice.instanceId) {
    return null;
  }

  const showingOutcome = Boolean(choice.outcomeLineKey);
  const isInline = choice.presentation === 'inline' && !showingOutcome;

  return (
    <div
      data-testid={isInline ? 'choice-inline-prompt' : 'choice-card'}
      role={isInline ? 'status' : 'dialog'}
      aria-modal={isInline ? undefined : 'true'}
      aria-labelledby="choice-card-prompt"
      tabIndex={isInline ? undefined : -1}
      style={
        isInline
          ? {
              position: 'fixed',
              top: 'calc(76px + var(--safe-top, 0px))',
              left: '50%',
              transform: 'translateX(-50%)',
              width: '92%',
              maxWidth: '520px',
              background: 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(56, 189, 248, 0.48)',
              boxShadow: '0 10px 24px rgba(0, 0, 0, 0.55)',
              borderRadius: '14px',
              padding: '12px 16px',
              zIndex: 420,
              color: 'var(--text-primary, #F8FAFC)',
              fontFamily: "var(--font-sans, 'Hind Siliguri', system-ui, sans-serif)",
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              animation: 'choiceInlineSlideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
            }
          : {
              position: 'fixed',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              width: '92%',
              maxWidth: '560px',
              maxHeight: 'calc(100dvh - 24px - var(--safe-top, 0px) - var(--safe-bottom, 0px))',
              overflowY: 'auto',
              background: 'var(--surface-panel, rgba(15, 23, 42, 0.95))',
              backdropFilter: 'blur(16px)',
              border: '1px solid var(--info-sky-border, rgba(56, 189, 248, 0.4))',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.7)',
              borderRadius: '16px',
              padding: '20px 24px',
              zIndex: 9550,
              color: 'var(--text-primary, #F8FAFC)',
              fontFamily: "var(--font-sans, 'Hind Siliguri', system-ui, sans-serif)",
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              animation: 'choiceSlideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
            }
      }
    >
      {!isInline && <ModalFocusGuard />}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <span
          aria-hidden="true"
          style={{
            display: 'inline-block',
            width: isInline ? '8px' : '10px',
            height: isInline ? '8px' : '10px',
            borderRadius: '50%',
            backgroundColor: showingOutcome ? 'var(--uthao-green, #22C55E)' : 'var(--info-sky, #38BDF8)',
            boxShadow: showingOutcome ? '0 0 10px var(--uthao-green, #22C55E)' : '0 0 10px var(--info-sky, #38BDF8)',
            flexShrink: 0,
          }}
        />
        <h3
          id="choice-card-prompt"
          style={{
            margin: 0,
            fontSize: isInline ? '0.94rem' : '1.1rem',
            fontWeight: 700,
            color: '#f8fafc',
            lineHeight: 1.35,
            flex: 1,
          }}
        >
          {t(choice.prompt, localizeVars(choice.promptVars))}
        </h3>
        {isInline && choice.anchorPlaceKey && (
          <span
            style={{
              fontSize: '0.72rem',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '999px',
              background: 'rgba(56, 189, 248, 0.16)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              color: '#7dd3fc',
              whiteSpace: 'nowrap',
            }}
          >
            {t(choice.anchorPlaceKey)}
          </span>
        )}
      </div>

      {showingOutcome ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p
            data-testid="choice-outcome-text"
            style={{
              margin: 0,
              fontSize: '1rem',
              lineHeight: 1.5,
              color: '#e2e8f0',
              backgroundColor: 'rgba(30, 41, 59, 0.7)',
              borderRadius: '10px',
              padding: '12px 16px',
              border: '1px solid rgba(56, 189, 248, 0.25)',
            }}
          >
            {t(choice.outcomeLineKey!)}
          </p>
          <button
            data-testid="choice-outcome-continue"
            onClick={() => onDismissOutcome?.()}
            style={{
              alignSelf: 'flex-end',
              padding: '10px 20px',
              backgroundColor: 'var(--uthao-green, #22C55E)',
              border: 'none',
              borderRadius: '8px',
              color: '#0f172a',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 700,
            }}
          >
            {t('ui.continue')}
          </button>
        </div>
      ) : choice.options.length === 0 ? (
        <button
          data-testid="choice-outcome-continue"
          onClick={() => onDismissOutcome?.()}
          style={{
            alignSelf: 'flex-end',
            padding: '10px 20px',
            backgroundColor: '#38bdf8',
            border: 'none',
            borderRadius: '8px',
            color: '#0f172a',
            cursor: 'pointer',
            fontSize: '0.95rem',
            fontWeight: 700,
          }}
        >
          {t('ui.continue')}
        </button>
      ) : (
        <div
          style={{
            display: isInline ? 'flex' : 'grid',
            flexWrap: isInline ? 'wrap' : undefined,
            gridTemplateColumns: isInline
              ? undefined
              : choice.options.length > 2
                ? 'repeat(2, 1fr)'
                : '1fr',
            gap: isInline ? '8px' : '10px',
          }}
        >
          {choice.options.map((opt, idx) => (
            <button
              key={String(opt.id)}
              data-testid={`choice-btn-${idx + 1}`}
              data-choice-kind={opt.kind ?? 'neutral'}
              onClick={() => onChoose?.(String(opt.id), choice.instanceId!)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'stretch',
                justifyContent: 'space-between',
                flex: isInline ? '1 1 auto' : undefined,
                padding: isInline ? '8px 12px' : '12px 16px',
                backgroundColor:
                  opt.kind === 'illicit'
                    ? 'rgba(69, 26, 3, 0.45)'
                    : opt.kind === 'official'
                      ? 'rgba(6, 78, 59, 0.35)'
                      : 'rgba(30, 41, 59, 0.8)',
                border: `1px solid ${borderForKind(opt.kind)}`,
                borderRadius: '8px',
                color: '#e2e8f0',
                cursor: 'pointer',
                fontSize: isInline ? '0.84rem' : '0.95rem',
                fontWeight: 500,
                transition: 'all 0.15s ease',
                textAlign: 'left',
                gap: '6px',
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(56, 189, 248, 0.2)';
                (e.currentTarget as HTMLElement).style.borderColor = '#38bdf8';
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor =
                  opt.kind === 'illicit'
                    ? 'rgba(69, 26, 3, 0.45)'
                    : opt.kind === 'official'
                      ? 'rgba(6, 78, 59, 0.35)'
                      : 'rgba(30, 41, 59, 0.8)';
                (e.currentTarget as HTMLElement).style.borderColor = borderForKind(opt.kind);
              }}
            >
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
              >
                <span style={{ flex: '1 1 160px', lineHeight: 1.35 }}>
                  {t(opt.text, localizeVars(opt.vars))}
                </span>
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    flexShrink: 0,
                    marginLeft: 'auto',
                    flexWrap: 'wrap',
                  }}
                >
                  {opt.kind === 'official' && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: 'rgba(34, 197, 94, 0.2)',
                        color: '#4ade80',
                        border: '1px solid rgba(74, 222, 128, 0.4)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('encounter.kind.official')}
                    </span>
                  )}
                  {opt.kind === 'illicit' && (
                    <span
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: 'rgba(245, 158, 11, 0.2)',
                        color: '#fbbf24',
                        border: '1px solid rgba(251, 191, 36, 0.45)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('encounter.kind.illicit')}
                    </span>
                  )}
                  {opt.costHint !== undefined && (
                    <span
                      data-testid={`choice-cost-${idx + 1}`}
                      style={{
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        padding: '2px 7px',
                        borderRadius: '999px',
                        background: 'rgba(148, 163, 184, 0.18)',
                        color: '#f8fafc',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {`৳${localDigits(opt.costHint)}`}
                    </span>
                  )}
                  {opt.isMission && (
                    <span
                      style={{
                        fontSize: '0.72rem',
                        fontWeight: 700,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: 'rgba(16, 185, 129, 0.2)',
                        color: '#34d399',
                        border: '1px solid rgba(52, 211, 153, 0.4)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {t('ui.mission_badge')}
                    </span>
                  )}
                  <span
                    style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.1)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      color: '#94a3b8',
                    }}
                  >
                    [{localDigits(idx + 1)}]
                  </span>
                </span>
              </div>
              {opt.riskKey && (
                <span
                  data-testid={`choice-risk-${idx + 1}`}
                  style={{
                    fontSize: '0.78rem',
                    color: opt.kind === 'illicit' ? '#fcd34d' : '#94a3b8',
                    lineHeight: 1.3,
                  }}
                >
                  {t(opt.riskKey)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function handleChoiceCardKeyDown(
  e: KeyboardEvent,
  choice: ChoiceState,
  chooseHandler?: (choiceId: string, instanceId: string) => void,
  dismissHandler: () => void = dismissChoiceOutcome
): void {
  if (!choice.active) return;
  if (
    screenSignal.value !== 'game' ||
    settingsOpenSignal.value ||
    dayEndSignal.value.active ||
    endingSignal.value.active ||
    saveSlotsSignal.value.isOpen ||
    phoneSignal.value.open ||
    garageSignal.value.open ||
    journalSignal.value ||
    karmaPanelSignal.value ||
    uiSheetSignal.value ||
    negotiationSignal.value.active ||
    tripSummarySignal.value !== null
  ) {
    return;
  }

  if (choice.outcomeLineKey || choice.options.length === 0) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === '1' || e.key === 'Escape') {
      e.preventDefault();
      dismissHandler();
    }
    return;
  }

  const keyNum = parseInt(e.key, 10);
  if (keyNum >= 1 && keyNum <= choice.options.length) {
    const selected = choice.options[keyNum - 1];
    if (selected && choice.instanceId) {
      e.preventDefault();
      chooseHandler?.(String(selected.id), choice.instanceId);
    }
  }
}

export function ChoiceCard({ onChoose, onDismissOutcome }: ChoiceCardProps): JSX.Element | null {
  const choice = choiceSignal.value;
  const chooseHandler = onChoose ?? onChooseCallback ?? undefined;
  const dismissHandler = onDismissOutcome ?? dismissChoiceOutcome;

  useEffect(() => {
    if (!choice.active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      handleChoiceCardKeyDown(e, choice, chooseHandler, dismissHandler);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [choice, chooseHandler, dismissHandler]);

  return (
    <ChoiceCardView
      choice={choice}
      onChoose={chooseHandler}
      onDismissOutcome={dismissHandler}
    />
  );
}
