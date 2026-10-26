import type { JSX } from 'preact';
import type { AccidentRecord } from '../../sim/darkChoices/types';
import { formatTaka } from '../utils/bangla';

export interface AccidentModalProps {
  accident: AccidentRecord;
  onCheckVictims: () => void;
  onCallEmergency: () => void;
  onSettleCash: () => void;
  onFleeHitAndRun: () => void;
}

export function AccidentModal({
  accident,
  onCheckVictims,
  onCallEmergency,
  onSettleCash,
  onFleeHitAndRun,
}: AccidentModalProps): JSX.Element {
  return (
    <div
      data-testid="accident-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9600,
        background: 'rgba(2, 6, 23, 0.9)',
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
          background: 'linear-gradient(180deg, #3b0764 0%, #0f172a 100%)',
          borderRadius: '24px',
          border: '2px solid rgba(239, 68, 68, 0.5)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(239, 68, 68, 0.25)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '26px' }}>💥</span>
            <span style={{ fontSize: '18px', fontWeight: 900, color: '#f87171' }}>
              সড়ক দুর্ঘটনা (Collision Incident)
            </span>
          </div>
          <span
            style={{
              background: '#ef4444',
              color: '#ffffff',
              fontSize: '11px',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '20px',
              textTransform: 'uppercase',
            }}
          >
            {accident.severity}
          </span>
        </div>

        {/* Damage Stats Card */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.7)',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>যাত্রীর অবস্থা</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#ffffff' }}>
              {accident.passengerInjuryState === 'hospitalized'
                ? 'গুরুতর আহত 🏥'
                : accident.passengerInjuryState === 'bruised'
                ? 'সামান্য আঘাতপ্রাপ্ত'
                : 'অক্ষত'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>বাইকের ক্ষতি</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#f59e0b' }}>
              -{accident.motorcycleDamage}%
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>চিকিৎসা খরচ</span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#ef4444' }}>
              {formatTaka(accident.medicalExpenses)}
            </span>
          </div>
        </div>

        {/* Choices */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            onClick={onCheckVictims}
            style={{
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: '14px',
              padding: '12px 16px',
              color: '#4ade80',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            🩹 যাত্রী ও ক্ষতিগ্রস্তদের প্রাথমিক চিকিৎসা ও সাহায্য দিন
          </button>

          <button
            onClick={onCallEmergency}
            style={{
              background: 'rgba(56, 189, 248, 0.12)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              borderRadius: '14px',
              padding: '12px 16px',
              color: '#38bdf8',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            🚑 অ্যাম্বুলেন্স ও ট্রাফিক পুলিশকে খবর দিন (Emergency Services)
          </button>

          <button
            onClick={onSettleCash}
            style={{
              background: 'rgba(245, 158, 11, 0.12)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              borderRadius: '14px',
              padding: '12px 16px',
              color: '#fbbf24',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            🤝 ঘটনাস্থলেই ক্ষতিপূরণ দিয়ে মামলা এড়ান ({formatTaka(accident.thirdPartyDamage)})
          </button>

          <button
            onClick={onFleeHitAndRun}
            style={{
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              borderRadius: '14px',
              padding: '12px 16px',
              color: '#f87171',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            🏃 না থেমে পালিয়ে যান (Hit & Run - Extreme Penalty If Caught)
          </button>
        </div>
      </div>
    </div>
  );
}
