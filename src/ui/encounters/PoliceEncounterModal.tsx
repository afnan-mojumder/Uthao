import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import type { PoliceCase } from '../../sim/darkChoices/types';
import { formatTaka } from '../utils/bangla';

export interface PoliceEncounterModalProps {
  policeCase: PoliceCase;
  onPayFine: () => void;
  onAttemptBribe: (amount: number) => void;
  onContest: () => void;
  onAcceptWarning: () => void;
  onFlee: () => void;
}

export function PoliceEncounterModal({
  policeCase,
  onPayFine,
  onAttemptBribe,
  onContest,
  onAcceptWarning,
  onFlee,
}: PoliceEncounterModalProps): JSX.Element {
  const [bribeAmount, setBribeAmount] = useState<number>(Math.round(policeCase.officialFine * 0.4));
  const [showBribeTiers, setShowBribeTiers] = useState<boolean>(false);

  return (
    <div
      data-testid="police-encounter-modal"
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
          width: '480px',
          maxWidth: '92vw',
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: '24px',
          border: '2px solid rgba(56, 189, 248, 0.4)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9), 0 0 35px rgba(56, 189, 248, 0.2)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '26px' }}>👮‍♂️</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '17px', fontWeight: 900, color: '#ffffff' }}>
                ট্রাফিক পুলিশ চেকপোস্ট
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                {policeCase.officerProfile.nameKey}
              </span>
            </div>
          </div>
          <span
            style={{
              background: 'rgba(239, 68, 68, 0.2)',
              color: '#f87171',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              fontSize: '11px',
              fontWeight: 800,
              padding: '3px 10px',
              borderRadius: '20px',
            }}
          >
            {policeCase.severity.toUpperCase()}
          </span>
        </div>

        {/* Suspected Violation & Official Fine */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '14px 18px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 700 }}>
              অভিযোগ (Violation)
            </span>
            <span style={{ fontSize: '14px', fontWeight: 800, color: '#f8fafc', marginTop: '2px' }}>
              {policeCase.violationType === 'red_light'
                ? 'সিগন্যাল অমান্য (Red Light)'
                : policeCase.violationType === 'wrong_way'
                ? 'উল্টো পথে বাইক চালানো (Wrong Way)'
                : policeCase.violationType === 'collision'
                ? 'সড়ক দুর্ঘটনা ও বেপরোয়া রাইডিং'
                : 'ট্রাফিক আইন লঙ্ঘন'}
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
            <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 700 }}>সরকারি জরিমানা</span>
            <span style={{ fontSize: '20px', fontWeight: 900, color: '#ef4444' }}>
              {formatTaka(policeCase.officialFine)}
            </span>
          </div>
        </div>

        {/* Choices Options */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Option A: Pay Official Fine */}
          <button
            onClick={onPayFine}
            style={{
              background: 'rgba(34, 197, 94, 0.15)',
              border: '1px solid rgba(34, 197, 94, 0.4)',
              borderRadius: '14px',
              padding: '12px 16px',
              color: '#4ade80',
              fontWeight: 800,
              fontSize: '14px',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>📜 সরকারি জরিমানা পরিশোধ করুন (Pay Official Fine)</span>
            <span>{formatTaka(policeCase.officialFine)}</span>
          </button>

          {/* Option B: Attempt Bribe */}
          {!showBribeTiers ? (
            <button
              onClick={() => setShowBribeTiers(true)}
              style={{
                background: 'rgba(245, 158, 11, 0.12)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '14px',
                padding: '12px 16px',
                color: '#fbbf24',
                fontWeight: 800,
                fontSize: '14px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>🤝 গোপনে রফা করার চেষ্টা করুন (Attempt Bribe)</span>
              <span style={{ fontSize: '11px', color: '#f59e0b' }}>ঝুঁকিপূর্ণ</span>
            </button>
          ) : (
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '14px',
                padding: '12px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#fbbf24' }}>
                  ঘুষের প্রস্তাব নির্বাচন করুন:
                </span>
                <span style={{ fontSize: '13px', fontWeight: 900, color: '#ffffff' }}>
                  {formatTaka(bribeAmount)}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {[200, 500, 1000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setBribeAmount(amt)}
                    style={{
                      flex: 1,
                      background: bribeAmount === amt ? '#f59e0b' : 'rgba(30, 41, 59, 0.7)',
                      color: bribeAmount === amt ? '#000000' : '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      padding: '6px 0',
                      fontWeight: 800,
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    {formatTaka(amt)}
                  </button>
                ))}
              </div>
              <button
                onClick={() => onAttemptBribe(bribeAmount)}
                style={{
                  background: '#f59e0b',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '8px 0',
                  fontWeight: 900,
                  fontSize: '13px',
                  cursor: 'pointer',
                  marginTop: '4px',
                }}
              >
                টাকা বাড়িয়ে দিন (Offer Bribe)
              </button>
            </div>
          )}

          {/* Option C: Contest */}
          <button
            onClick={onContest}
            style={{
              background: 'rgba(56, 189, 248, 0.1)',
              border: '1px solid rgba(56, 189, 248, 0.3)',
              borderRadius: '14px',
              padding: '11px 16px',
              color: '#38bdf8',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            🗣️ যুক্তিসঙ্গত ব্যাখ্যা দিন (Contest Allegation)
          </button>

          {/* Option D: Warning */}
          {policeCase.severity === 'minor' && (
            <button
              onClick={onAcceptWarning}
              style={{
                background: 'rgba(148, 163, 184, 0.1)',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                borderRadius: '14px',
                padding: '11px 16px',
                color: '#cbd5e1',
                fontWeight: 700,
                fontSize: '13px',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              🙏 ক্ষমা চেয়ে সতর্কবার্তা গ্রহণ করুন (Accept Warning)
            </button>
          )}

          {/* Option E: Flee */}
          <button
            onClick={onFlee}
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              borderRadius: '14px',
              padding: '11px 16px',
              color: '#f87171',
              fontWeight: 800,
              fontSize: '13px',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            ⚡ চেকপোস্ট ফাঁকি দিয়ে পালিয়ে যান (Flee Checkpoint - High Risk)
          </button>
        </div>
      </div>
    </div>
  );
}
