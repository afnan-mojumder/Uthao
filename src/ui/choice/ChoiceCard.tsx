import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { choiceSignal, onChooseCallback, type ChoiceState } from '../store';
import { t } from '../i18n';

export interface ChoiceCardProps {
  onChoose?: (choiceId: string, instanceId: string) => void;
}

export function ChoiceCardView({
  choice,
  onChoose,
}: {
  choice: ChoiceState;
  onChoose?: (choiceId: string, instanceId: string) => void;
}): JSX.Element | null {
  if (!choice.active || !choice.instanceId) {
    return null;
  }

  return (
    <div
      data-testid="choice-card"
      style={{
        position: 'fixed',
        top: 'calc(16px + env(safe-area-inset-top, 0px))',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '92%',
        maxWidth: '560px',
        maxHeight: 'calc(100vh - 180px)',
        overflowY: 'auto',
        background: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(56, 189, 248, 0.4)',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.7), 0 8px 10px -6px rgba(0, 0, 0, 0.7)',
        borderRadius: '16px',
        padding: '20px 24px',
        zIndex: 9998,
        color: '#f8fafc',
        fontFamily: 'system-ui, sans-serif',
        pointerEvents: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        animation: 'choiceSlideDown 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span
          style={{
            display: 'inline-block',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: '#38bdf8',
            boxShadow: '0 0 10px #38bdf8',
          }}
        />
        <h3
          style={{
            margin: 0,
            fontSize: '1.1rem',
            fontWeight: 700,
            color: '#f8fafc',
            lineHeight: 1.4,
          }}
        >
          {t(choice.prompt)}
        </h3>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: choice.options.length > 2 ? 'repeat(2, 1fr)' : '1fr',
          gap: '10px',
        }}
      >
        {choice.options.map((opt, idx) => (
          <button
            key={String(opt.id)}
            data-testid={`choice-btn-${idx + 1}`}
            onClick={() => onChoose?.(String(opt.id), choice.instanceId!)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              backgroundColor: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#e2e8f0',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontWeight: 500,
              transition: 'all 0.15s ease',
              textAlign: 'left',
              gap: '8px',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(56, 189, 248, 0.2)';
              (e.currentTarget as HTMLElement).style.borderColor = '#38bdf8';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = 'rgba(30, 41, 59, 0.8)';
              (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            <span>{t(opt.text)}</span>
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
              [{idx + 1}]
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ChoiceCard({ onChoose }: ChoiceCardProps): JSX.Element | null {
  const choice = choiceSignal.value;
  const chooseHandler = onChoose ?? onChooseCallback ?? undefined;

  useEffect(() => {
    if (!choice.active) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const keyNum = parseInt(e.key, 10);
      if (keyNum >= 1 && keyNum <= choice.options.length) {
        const selected = choice.options[keyNum - 1];
        if (selected && choice.instanceId) {
          e.preventDefault();
          chooseHandler?.(String(selected.id), choice.instanceId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [choice, chooseHandler]);

  return <ChoiceCardView choice={choice} onChoose={chooseHandler} />;
}
