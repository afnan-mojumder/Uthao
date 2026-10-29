import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  tutorialSignal,
  type TutorialStep,
  onTutorialAdvanceCallback,
  onTutorialNegotiateCallback,
  onTutorialCompleteCallback,
} from '../store';

export interface FirstRideTutorialProps {
  step?: TutorialStep;
  onAdvance?: (nextStep: TutorialStep) => void;
  onNegotiate?: (fare: number) => void;
  onComplete?: () => void;
}

export function FirstRideTutorial(props: FirstRideTutorialProps): JSX.Element | null {
  const currentStep = props.step ?? tutorialSignal.value.step;
  const advance = props.onAdvance ?? onTutorialAdvanceCallback;
  const negotiate = props.onNegotiate ?? onTutorialNegotiateCallback;
  const complete = props.onComplete ?? onTutorialCompleteCallback;

  let selectedOffer = tutorialSignal.value.agreedFare ?? 100;
  let setSelectedOffer = (f: number) => {
    selectedOffer = f;
  };
  let agreedPrompt = '';
  let setAgreedPrompt = (s: string) => {
    agreedPrompt = s;
  };

  try {
    const [offer, setOffer] = useState(tutorialSignal.value.agreedFare ?? 100);
    const [prompt, setPrompt] = useState('');
    selectedOffer = offer;
    setSelectedOffer = setOffer;
    agreedPrompt = prompt;
    setAgreedPrompt = setPrompt;
  } catch {
    // Vitest node environment fallback
  }

  if (currentStep === 'idle' || currentStep === 'completed') {
    return null;
  }

  const containerStyle = {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 9995,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(2, 6, 23, 0.78)',
    backdropFilter: 'blur(12px)',
    fontFamily: "'Hind Siliguri', 'Segoe UI', system-ui, sans-serif",
    color: '#f8fafc',
    padding: '20px',
    userSelect: 'none' as const,
    pointerEvents: 'auto' as const,
  };

  const cardStyle = {
    maxWidth: '540px',
    width: '100%',
    background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.98))',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    borderRadius: '20px',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.65), 0 0 30px rgba(34, 197, 94, 0.12)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
  };

  const headerStyle = {
    padding: '16px 24px',
    borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    background: 'rgba(255, 255, 255, 0.02)',
  };

  const primaryBtnStyle = {
    padding: '14px 24px',
    borderRadius: '12px',
    border: 'none',
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    color: '#ffffff',
    fontSize: '1rem',
    fontWeight: 700,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    transition: 'all 0.15s ease',
    boxShadow: '0 4px 14px rgba(34, 197, 94, 0.35)',
  };

  // 1. Alarm Screen
  if (currentStep === 'alarm') {
    return (
      <div data-testid="tutorial-overlay" style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontWeight: 700 }}>
              <span>⏰</span> {t('tutorial.alarm.title')}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Day 1 • 07:00</span>
          </div>

          <div style={{ padding: '36px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: '3.6rem', fontWeight: 900, color: '#f8fafc', letterSpacing: '2px', marginBottom: '8px' }}>
              07:00 <span style={{ fontSize: '1.4rem', color: '#f59e0b' }}>AM</span>
            </div>
            <p style={{ margin: '0 0 28px 0', color: '#cbd5e1', fontSize: '1.05rem', lineHeight: '1.5' }}>
              {t('tutorial.alarm.desc')}
            </p>

            <button
              data-testid="tutorial-btn-alarm"
              onClick={() => advance?.('ma_reminder')}
              style={{ ...primaryBtnStyle, width: '100%' }}
            >
              <span>🔔</span> {t('tutorial.alarm.btn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Ma's Reminder
  if (currentStep === 'ma_reminder') {
    return (
      <div data-testid="tutorial-overlay" style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontWeight: 700 }}>
              <span>👵</span> {t('tutorial.ma.title')}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Incoming Message</span>
          </div>

          <div style={{ padding: '28px 24px' }}>
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.25)',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '24px',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#f59e0b', fontWeight: 700, marginBottom: '6px' }}>
                Ma (মা):
              </div>
              <p style={{ margin: 0, color: '#f1f5f9', fontSize: '1.05rem', lineHeight: '1.6' }}>
                "{t('tutorial.ma.msg')}"
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', fontSize: '0.9rem', color: '#94a3b8' }}>
              <span>💡</span>
              <span>Household rent target: <strong>৳1,200</strong> on Day 3. Keep savings steady.</span>
            </div>

            <button
              data-testid="tutorial-btn-ma"
              onClick={() => advance?.('wallet_check')}
              style={{ ...primaryBtnStyle, width: '100%' }}
            >
              <span>👍</span> {t('tutorial.ma.btn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Wallet Check
  if (currentStep === 'wallet_check') {
    return (
      <div data-testid="tutorial-overlay" style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#38bdf8', fontWeight: 700 }}>
              <span>👛</span> {t('tutorial.wallet.title')}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Personal Finances</span>
          </div>

          <div style={{ padding: '28px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
              <div
                style={{
                  background: 'rgba(56, 189, 248, 0.1)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  borderRadius: '14px',
                  padding: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.85rem', color: '#7dd3fc', fontWeight: 600, marginBottom: '4px' }}>
                  Current Cash
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#38bdf8' }}>৳600</div>
              </div>

              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.1)',
                  border: '1px solid rgba(239, 68, 68, 0.3)',
                  borderRadius: '14px',
                  padding: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.85rem', color: '#fca5a5', fontWeight: 600, marginBottom: '4px' }}>
                  Due Day 3 (Rent)
                </div>
                <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#ef4444' }}>৳1,200</div>
              </div>
            </div>

            <p style={{ margin: '0 0 24px 0', color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.5' }}>
              {t('tutorial.wallet.msg')}
            </p>

            <button
              data-testid="tutorial-btn-wallet"
              onClick={() => advance?.('bike_inspection')}
              style={{ ...primaryBtnStyle, width: '100%' }}
            >
              <span>🏍️</span> {t('tutorial.wallet.btn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 4. Motorcycle Inspection
  if (currentStep === 'bike_inspection') {
    return (
      <div data-testid="tutorial-overlay" style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontWeight: 700 }}>
              <span>🏍️</span> {t('tutorial.bike.title')}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>100cc Commuter Bike</span>
          </div>

          <div style={{ padding: '28px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
              <div
                style={{
                  background: 'rgba(245, 158, 11, 0.1)',
                  border: '1px solid rgba(245, 158, 11, 0.3)',
                  borderRadius: '14px',
                  padding: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.85rem', color: '#fcd34d', fontWeight: 600, marginBottom: '4px' }}>
                  Fuel Remaining
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f59e0b' }}>1.2 L</div>
                <div style={{ fontSize: '0.75rem', color: '#fbbf24', marginTop: '2px' }}>Reserve Tank</div>
              </div>

              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.3)',
                  borderRadius: '14px',
                  padding: '16px',
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: '0.85rem', color: '#86efac', fontWeight: 600, marginBottom: '4px' }}>
                  Condition
                </div>
                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#22c55e' }}>80%</div>
                <div style={{ fontSize: '0.75rem', color: '#4ade80', marginTop: '2px' }}>Operational</div>
              </div>
            </div>

            <p style={{ margin: '0 0 24px 0', color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.5' }}>
              {t('tutorial.bike.msg')}
            </p>

            <button
              data-testid="tutorial-btn-bike"
              onClick={() => advance?.('tea_stall')}
              style={{ ...primaryBtnStyle, width: '100%' }}
            >
              <span>⚡</span> {t('tutorial.bike.btn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 5. Tea Stall Dialogue (Mintu)
  if (currentStep === 'tea_stall') {
    return (
      <div data-testid="tutorial-overlay" style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#10b981', fontWeight: 700 }}>
              <span>☕</span> {t('tutorial.tea_stall.title')}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Mirpara Tea Stall</span>
          </div>

          <div style={{ padding: '28px 24px' }}>
            <div
              style={{
                background: 'rgba(16, 185, 129, 0.08)',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '24px',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#34d399', fontWeight: 700, marginBottom: '6px' }}>
                Mintu (মিন্টু):
              </div>
              <p style={{ margin: 0, color: '#f1f5f9', fontSize: '1.05rem', lineHeight: '1.6' }}>
                "{t('tutorial.tea_stall.msg')}"
              </p>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', fontSize: '0.9rem', color: '#94a3b8' }}>
              <span>💡</span>
              <span>Fulgate has heavy commuter traffic, but morning students in Mirpara provide quick reliable earnings.</span>
            </div>

            <button
              data-testid="tutorial-btn-tea-stall"
              onClick={() => advance?.('open_app')}
              style={{ ...primaryBtnStyle, width: '100%' }}
            >
              <span>📱</span> {t('tutorial.tea_stall.btn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 6. Incoming Ride Request (Nabila)
  if (currentStep === 'open_app') {
    return (
      <div data-testid="tutorial-overlay" style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontWeight: 700 }}>
              <span>🔔</span> {t('tutorial.nabila.title')}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#38bdf8', fontWeight: 700 }}>Uthao App • Online</span>
          </div>

          <div style={{ padding: '28px 24px' }}>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div>
                  <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f8fafc' }}>Nabila (নাবিলা)</div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>{t('tutorial.nabila.intro')}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#f59e0b' }}>৳80</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Offered (Fair ৳100)</div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 14px', fontSize: '0.9rem' }}>
                <span style={{ color: '#22c55e', fontWeight: 700 }}>📍 Pickup:</span>
                <span style={{ color: '#e2e8f0' }}>Mirpara Community Clinic</span>
                <span style={{ color: '#ef4444', fontWeight: 700 }}>🏁 Drop-off:</span>
                <span style={{ color: '#e2e8f0' }}>Campus Gate (1.2 km)</span>
              </div>
            </div>

            <p style={{ margin: '0 0 24px 0', color: '#94a3b8', fontSize: '0.9rem' }}>
              Passenger offered ৳80, which is below the fair rate of ৳100. You can negotiate before accepting!
            </p>

            <button
              data-testid="tutorial-btn-open-request"
              onClick={() => advance?.('negotiation')}
              style={{ ...primaryBtnStyle, width: '100%' }}
            >
              <span>🤝</span> Start Fare Negotiation / দরদাম করুন
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 7. Negotiation Tutorial (Verbatim GDD §6 Lines)
  if (currentStep === 'negotiation') {
    const handlePickFare = (fare: number) => {
      setSelectedOffer(fare);
      setAgreedPrompt(t('tutorial.nabila.accepted'));
      negotiate?.(fare);
    };

    return (
      <div data-testid="tutorial-overlay" style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b', fontWeight: 700 }}>
              <span>🤝</span> Fare Negotiation Tutorial (GDD §6)
            </div>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Nabila • Student</span>
          </div>

          <div style={{ padding: '24px' }}>
            <div
              style={{
                background: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
                borderRadius: '14px',
                padding: '16px',
                marginBottom: '20px',
              }}
            >
              <div style={{ fontSize: '0.85rem', color: '#fbbf24', fontWeight: 700, marginBottom: '4px' }}>
                Passenger Offer:
              </div>
              <div style={{ fontSize: '1.05rem', color: '#f8fafc', fontWeight: 600 }}>
                "{t('tutorial.nabila.dialogue')}"
              </div>
            </div>

            {agreedPrompt ? (
              <div
                style={{
                  background: 'rgba(34, 197, 94, 0.1)',
                  border: '1px solid rgba(34, 197, 94, 0.35)',
                  borderRadius: '14px',
                  padding: '16px',
                  marginBottom: '20px',
                }}
              >
                <div style={{ fontSize: '0.85rem', color: '#4ade80', fontWeight: 700, marginBottom: '4px' }}>
                  Negotiation Outcome: Agreed Fare ৳{selectedOffer}
                </div>
                <div style={{ fontSize: '1rem', color: '#f8fafc', fontWeight: 600 }}>
                  "{agreedPrompt}"
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                <button
                  data-testid="tutorial-nego-counter-100"
                  onClick={() => handlePickFare(100)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(56, 189, 248, 0.35)',
                    background: 'rgba(56, 189, 248, 0.12)',
                    color: '#38bdf8',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontWeight: 800 }}>৳100</span> — {t('tutorial.nabila.counter_100')}
                </button>

                <button
                  data-testid="tutorial-nego-counter-90"
                  onClick={() => handlePickFare(90)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    background: 'rgba(245, 158, 11, 0.12)',
                    color: '#f59e0b',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontWeight: 800 }}>৳90</span> — {t('tutorial.nabila.counter_90')}
                </button>

                <button
                  data-testid="tutorial-nego-accept-80"
                  onClick={() => handlePickFare(80)}
                  style={{
                    padding: '12px 16px',
                    borderRadius: '12px',
                    border: '1px solid rgba(148, 163, 184, 0.35)',
                    background: 'rgba(148, 163, 184, 0.1)',
                    color: '#cbd5e1',
                    fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <span style={{ fontWeight: 800 }}>৳80</span> — {t('tutorial.nabila.accept_80')}
                </button>
              </div>
            )}

            <button
              data-testid="tutorial-btn-start-ride"
              disabled={!agreedPrompt}
              onClick={() => advance?.('riding')}
              style={{
                ...primaryBtnStyle,
                width: '100%',
                opacity: agreedPrompt ? 1 : 0.5,
                cursor: agreedPrompt ? 'pointer' : 'not-allowed',
              }}
            >
              <span>🏍️</span> Begin Ride to Campus Gate / ক্যাম্পাসে যাত্রা শুরু
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 8. Riding Phase (Floating HUD Banner)
  if (currentStep === 'riding') {
    return (
      <div
        data-testid="tutorial-overlay"
        style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9995,
          width: '90%',
          maxWidth: '600px',
          background: 'rgba(15, 23, 42, 0.92)',
          border: '1px solid rgba(34, 197, 94, 0.4)',
          borderRadius: '16px',
          padding: '16px 20px',
          boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5), 0 0 20px rgba(34, 197, 94, 0.15)',
          backdropFilter: 'blur(10px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          color: '#f8fafc',
          pointerEvents: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '1.6rem' }}>🎓</span>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#22c55e', fontWeight: 700 }}>
              Active Ride: Nabila (Agreed Fare: ৳{selectedOffer})
            </div>
            <div style={{ fontSize: '0.9rem', color: '#e2e8f0' }}>{t('tutorial.riding.tip')}</div>
          </div>
        </div>

        <button
          data-testid="tutorial-btn-arrive-destination"
          onClick={() => advance?.('receipt')}
          style={{
            ...primaryBtnStyle,
            padding: '10px 18px',
            fontSize: '0.85rem',
            whiteSpace: 'nowrap',
          }}
        >
          <span>🏁</span> Arrive at Gate
        </button>
      </div>
    );
  }

  // 9. Receipt Explained Phase
  if (currentStep === 'receipt') {
    const gross = selectedOffer;
    const commission = Math.round(gross * 0.15);
    const net = gross - commission;

    return (
      <div data-testid="tutorial-overlay" style={containerStyle}>
        <div style={cardStyle}>
          <div style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#22c55e', fontWeight: 700 }}>
              <span>🧾</span> {t('tutorial.receipt.title')}
            </div>
            <span style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Trip Completed</span>
          </div>

          <div style={{ padding: '28px 24px' }}>
            <div
              style={{
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '16px',
                padding: '20px',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ color: '#cbd5e1' }}>Gross Passenger Fare (নগদ ভাড়া):</span>
                <span style={{ fontWeight: 700, color: '#f8fafc' }}>৳{gross}</span>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span style={{ color: '#ef4444' }}>Uthao Commission (15% উথাও কমিশন):</span>
                <span style={{ fontWeight: 700, color: '#ef4444' }}>-৳{commission}</span>
              </div>

              <div
                style={{
                  height: '1px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  margin: '12px 0',
                }}
              />

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#22c55e', fontWeight: 700, fontSize: '1.05rem' }}>Net Take-Home (প্রকৃত আয়):</span>
                <span style={{ fontSize: '1.5rem', fontWeight: 800, color: '#22c55e' }}>+৳{net}</span>
              </div>
            </div>

            <p style={{ margin: '0 0 24px 0', color: '#cbd5e1', fontSize: '0.95rem', lineHeight: '1.5' }}>
              {t('tutorial.receipt.desc')}
            </p>

            <button
              data-testid="tutorial-btn-finish-receipt"
              onClick={() => {
                complete?.();
              }}
              style={{ ...primaryBtnStyle, width: '100%' }}
            >
              <span>🎉</span> {t('tutorial.receipt.btn')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
