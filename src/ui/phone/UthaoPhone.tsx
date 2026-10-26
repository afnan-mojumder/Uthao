import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { toBanglaDigits, formatTaka } from '../utils/bangla';

export interface UthaoPhoneProps {
  onAccept: (fare: number, isOffApp: boolean) => void;
  onDecline: () => void;
  onCounterOffer?: (newFare: number) => void;
  initialOffer?: number;
  passengerName?: string;
  rating?: number;
  completedRides?: number;
  pickupLocation?: string;
  dropoffLocation?: string;
  distanceKm?: number;
  durationMins?: number;
}

export function UthaoPhone({
  onAccept,
  onDecline,
  onCounterOffer,
  initialOffer = 120,
  passengerName = 'Nabila Rahman',
  rating = 4.8,
  completedRides = 127,
  pickupLocation = 'Farmgate (Farmgate Bus Stand)',
  dropoffLocation = 'Dhanmondi 27 (Rapa Plaza)',
  distanceKm = 6.2,
  durationMins = 18,
}: UthaoPhoneProps): JSX.Element {
  const [currentOffer, setCurrentOffer] = useState<number>(initialOffer);
  const [mood, setMood] = useState<'happy' | 'neutral' | 'frustrated'>('happy');
  const [, setBargainRounds] = useState<number>(0);

  const handleAddCounter = (addedAmount: number) => {
    const updated = currentOffer + addedAmount;
    setCurrentOffer(updated);
    setBargainRounds((r) => r + 1);

    // If rider demands too much, passenger mood worsens
    if (updated > initialOffer + 80) {
      setMood('frustrated');
    } else if (updated > initialOffer + 30) {
      setMood('neutral');
    }

    if (onCounterOffer) onCounterOffer(updated);
  };

  return (
    <div
      data-testid="uthao-phone-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9500,
        background: 'rgba(5, 10, 20, 0.75)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        userSelect: 'none',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Smartphone Outer Casing */}
      <div
        style={{
          width: '380px',
          maxHeight: '92vh',
          background: '#090f1d',
          borderRadius: '44px',
          border: '4px solid #1e293b',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 30px rgba(56, 189, 248, 0.15)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {/* Phone Notch & Status Bar */}
        <div
          style={{
            padding: '12px 24px 6px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: '12px',
            fontWeight: 700,
            color: '#cbd5e1',
            background: '#090f1d',
          }}
        >
          <span>4:25</span>
          {/* Dynamic Island / Speaker */}
          <div
            style={{
              width: '84px',
              height: '18px',
              background: '#000000',
              borderRadius: '20px',
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span>5G</span>
            <span>📶</span>
            <span>78% 🔋</span>
          </div>
        </div>

        {/* Uthao App Header */}
        <div
          style={{
            padding: '14px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Uthao Logo */}
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: '#22c55e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#052e16',
                fontWeight: 900,
                fontSize: '18px',
              }}
            >
              উ
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '17px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em' }}>
                Uthao
              </span>
              <span style={{ fontSize: '10px', color: '#94a3b8' }}>Ride. Earn. Your City.</span>
            </div>
          </div>

          <div style={{ fontSize: '18px', color: '#94a3b8', cursor: 'pointer' }}>🔔</div>
        </div>

        {/* Tab Switcher */}
        <div
          style={{
            display: 'flex',
            padding: '10px 16px',
            gap: '8px',
            background: 'rgba(15, 23, 42, 0.6)',
          }}
        >
          <div
            style={{
              background: '#22c55e',
              color: '#052e16',
              fontWeight: 800,
              fontSize: '12px',
              padding: '6px 14px',
              borderRadius: '20px',
            }}
          >
            Ride Request
          </div>
          <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600, padding: '6px 12px' }}>
            Map
          </div>
          <div style={{ color: '#94a3b8', fontSize: '12px', fontWeight: 600, padding: '6px 12px' }}>
            Earnings
          </div>
        </div>

        {/* Scrollable Request Content */}
        <div
          style={{
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
            overflowY: 'auto',
          }}
        >
          {/* Passenger Header Card */}
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.5)',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #f43f5e, #fb7185)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
              }}
            >
              👩
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>
                  {passengerName}
                </span>
                <span
                  style={{
                    background: 'rgba(56, 189, 248, 0.15)',
                    color: '#38bdf8',
                    fontSize: '10px',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '10px',
                  }}
                >
                  Regular
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <span style={{ color: '#f59e0b', fontSize: '12px' }}>★</span>
                <span style={{ fontSize: '12px', fontWeight: 700, color: '#e2e8f0' }}>
                  {rating}
                </span>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>
                  ({toBanglaDigits(completedRides)} rides)
                </span>
              </div>
            </div>
          </div>

          {/* Dialogue Speech Bubble */}
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '18px 18px 18px 4px',
              padding: '12px 16px',
              position: 'relative',
            }}
          >
            <p style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>
              "ভাই, ধানমন্ডি যাবেন?"
            </p>
            <span style={{ fontSize: '10px', color: '#64748b', display: 'block', textAlign: 'right', marginTop: '4px' }}>
              4:24 PM
            </span>
          </div>

          {/* Their Offer & Mood Bar */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 600 }}>Their Offer</span>
              <span style={{ fontSize: '26px', fontWeight: 900, color: '#ffffff', letterSpacing: '-0.02em' }}>
                {formatTaka(currentOffer)}
              </span>
            </div>

            {/* Mood Progress Bar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '18px' }}>
                {mood === 'happy' ? '😊' : mood === 'neutral' ? '😐' : '😠'}
              </span>
              <div
                style={{
                  flex: 1,
                  height: '8px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.1)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: mood === 'happy' ? '85%' : mood === 'neutral' ? '50%' : '20%',
                    height: '100%',
                    background:
                      mood === 'happy'
                        ? 'linear-gradient(90deg, #22c55e, #38bdf8)'
                        : mood === 'neutral'
                        ? '#f59e0b'
                        : '#ef4444',
                    transition: 'all 0.3s ease',
                  }}
                />
              </div>
              <span style={{ fontSize: '11px', color: '#94a3b8', fontWeight: 600 }}>
                {mood === 'happy' ? 'Pleased' : mood === 'neutral' ? 'Neutral' : 'Frustrated'}
              </span>
            </div>
          </div>

          {/* Route Details Card */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.7)',
              borderRadius: '16px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '12px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span style={{ color: '#22c55e', fontSize: '14px', marginTop: '2px' }}>🟢</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Pickup</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>{pickupLocation}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
              <span style={{ color: '#ef4444', fontSize: '14px', marginTop: '2px' }}>🔴</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '11px', color: '#94a3b8' }}>Drop-off</span>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>{dropoffLocation}</span>
              </div>
            </div>

            <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '8px', display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>{toBanglaDigits(distanceKm)} km</span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>~ {toBanglaDigits(durationMins)} mins</span>
            </div>
          </div>

          {/* Quick Counter Buttons */}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => handleAddCounter(20)}
              style={{
                flex: 1,
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '12px',
                color: '#f59e0b',
                padding: '9px 0',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              +৳২০
            </button>
            <button
              onClick={() => handleAddCounter(50)}
              style={{
                flex: 1,
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '12px',
                color: '#f59e0b',
                padding: '9px 0',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              +৳৫০
            </button>
            <button
              onClick={() => handleAddCounter(100)}
              style={{
                flex: 1,
                background: 'rgba(30, 41, 59, 0.8)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                borderRadius: '12px',
                color: '#f59e0b',
                padding: '9px 0',
                fontSize: '13px',
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              +৳১০০
            </button>
          </div>

          {/* Primary Action: Accept Ride */}
          <button
            onClick={() => onAccept(currentOffer, false)}
            style={{
              background: '#22c55e',
              border: 'none',
              borderRadius: '16px',
              color: '#052e16',
              padding: '14px 0',
              fontSize: '16px',
              fontWeight: 900,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              boxShadow: '0 8px 25px rgba(34, 197, 94, 0.4)',
            }}
          >
            <span>➤</span>
            <span>গ্রহণ করুন (Accept)</span>
          </button>

          {/* Secondary Action: Dark Choice (Go Off-App) */}
          <button
            onClick={() => onAccept(currentOffer, true)}
            style={{
              background: 'rgba(30, 41, 59, 0.65)',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              borderRadius: '14px',
              color: '#fbbf24',
              padding: '11px 0',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
            title="Bypasses Uthao 20% commission (Direct cash, but moral/platform penalty if reported)"
          >
            <span>💬</span>
            <span>"অ্যাপের বাইরে যাবেন?" (Go Off-App)</span>
          </button>

          {/* Decline Button */}
          <button
            onClick={onDecline}
            style={{
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.35)',
              borderRadius: '14px',
              color: '#f87171',
              padding: '11px 0',
              fontSize: '13px',
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            ✕ বাতিল (Decline)
          </button>
        </div>
      </div>
    </div>
  );
}
