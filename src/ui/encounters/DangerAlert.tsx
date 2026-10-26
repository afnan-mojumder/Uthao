import type { JSX } from 'preact';
import type { CrimeEncounter } from '../../sim/darkChoices/types';

export interface DangerAlertProps {
  encounter: CrimeEncounter;
  onSelectOption: (responseId: string) => void;
}

export function DangerAlert({ encounter, onSelectOption }: DangerAlertProps): JSX.Element {
  return (
    <div
      data-testid="danger-alert"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9600,
        background: 'rgba(2, 6, 23, 0.88)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        userSelect: 'none',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      <div
        style={{
          width: '460px',
          maxWidth: '92vw',
          background: 'linear-gradient(180deg, #1e1b4b 0%, #0f172a 100%)',
          borderRadius: '24px',
          border: '2px solid rgba(239, 68, 68, 0.6)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(239, 68, 68, 0.3)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header Badge */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '24px' }}>🚨</span>
            <span style={{ fontSize: '18px', fontWeight: 900, color: '#ef4444', letterSpacing: '-0.02em' }}>
              বিপদ সতর্কবার্তা (Danger Ahead)
            </span>
          </div>
          <span
            style={{
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 900,
              padding: '3px 10px',
              borderRadius: '20px',
              textTransform: 'uppercase',
            }}
          >
            {encounter.riskLevel}
          </span>
        </div>

        {/* Warning Signals */}
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.4)',
            borderRadius: '14px',
            padding: '12px 16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 800 }}>
            পরিস্থিতি লক্ষণ (Observed Signals):
          </span>
          <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: '13px', color: '#f8fafc', lineHeight: 1.5 }}>
            {encounter.warningSignals.map((sig, idx) => (
              <li key={idx}>{sig}</li>
            ))}
          </ul>
        </div>

        {/* Action Choice Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#cbd5e1' }}>
            আপনি কী সিদ্ধান্ত নেবেন? (Choose Action):
          </span>
          {encounter.availableResponses.map((opt) => (
            <button
              key={opt.id}
              onClick={() => onSelectOption(opt.id)}
              style={{
                background:
                  opt.moralCategory === 'protective'
                    ? 'rgba(34, 197, 94, 0.15)'
                    : opt.moralCategory === 'corrupt'
                    ? 'rgba(239, 68, 68, 0.2)'
                    : opt.moralCategory === 'selfish'
                    ? 'rgba(245, 158, 11, 0.15)'
                    : 'rgba(30, 41, 59, 0.7)',
                border:
                  opt.moralCategory === 'protective'
                    ? '1px solid rgba(34, 197, 94, 0.4)'
                    : opt.moralCategory === 'corrupt'
                    ? '1px solid rgba(239, 68, 68, 0.5)'
                    : '1px solid rgba(255, 255, 255, 0.15)',
                borderRadius: '14px',
                padding: '12px 16px',
                textAlign: 'left',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
                transition: 'all 0.15s ease',
              }}
            >
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  color:
                    opt.moralCategory === 'protective'
                      ? '#4ade80'
                      : opt.moralCategory === 'corrupt'
                      ? '#f87171'
                      : '#ffffff',
                }}
              >
                {opt.labelKey}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {opt.descriptionKey}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
