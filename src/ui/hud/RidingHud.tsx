import type { JSX } from 'preact';
import { useState } from 'preact/hooks';
import { toBanglaDigits, formatTaka } from '../utils/bangla';

export interface RidingHudProps {
  speedKmh: number;
  fuelPct: number; // 0..100
  todaysNet: number;
  currentDistrict?: string;
  timeString?: string;
  passenger?: {
    name: string;
    mood: 'happy' | 'neutral' | 'frustrated' | 'scared';
    status: string;
  } | null;
  navigation?: {
    instruction: string;
    distanceText: string;
    etaText: string;
  };
  onToggleMap?: () => void;
  onToggleCamera?: () => void;
  onOpenMenu?: () => void;
  onOpenPhone?: () => void;
}

export function RidingHud({
  speedKmh,
  fuelPct,
  todaysNet,
  currentDistrict = 'Farmgate',
  timeString = 'Tue, 12 Nov • 4:25 PM',
  passenger,
  navigation = {
    instruction: 'Turn right to Green Road',
    distanceText: '1.2 km',
    etaText: '5 min',
  },
  onToggleMap,
  onToggleCamera,
  onOpenMenu,
  onOpenPhone,
}: RidingHudProps): JSX.Element {
  const [headlights, setHeadlights] = useState(false);
  const [hazard, setHazard] = useState(false);
  const displaySpeed = Math.round(speedKmh);
  const fuelSegments = 6;
  const activeFuelBars = Math.round((fuelPct / 100) * fuelSegments);

  return (
    <div
      data-testid="riding-hud"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        userSelect: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '20px 24px',
        color: '#f8fafc',
      }}
    >
      {/* Top Header Row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        {/* Top-Left Status Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', pointerEvents: 'auto' }}>
          {/* Time & Weather Card */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.72)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '14px',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
            }}
          >
            <span style={{ fontSize: '18px' }}>☀️</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#f1f5f9' }}>
              {timeString}
            </span>
          </div>

          {/* Location Card */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.72)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '14px',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
            }}
          >
            <span style={{ color: '#22c55e', fontSize: '16px' }}>📍</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff' }}>
                {currentDistrict}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Dhaka</span>
            </div>
          </div>

          {/* Today's Net Earnings */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(34, 197, 94, 0.3)',
              borderRadius: '14px',
              padding: '8px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 0 15px rgba(34, 197, 94, 0.15)',
            }}
          >
            <span style={{ background: '#22c55e', borderRadius: '6px', padding: '2px 5px', fontSize: '13px' }}>
              💵
            </span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '15px', fontWeight: 800, color: '#22c55e', letterSpacing: '-0.02em' }}>
                {formatTaka(todaysNet)}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8' }}>Today's Net</span>
            </div>
          </div>
        </div>

        {/* Top-Right Passenger Info Card */}
        {passenger && (
          <div
            onClick={onOpenPhone}
            style={{
              background: 'rgba(15, 23, 42, 0.75)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '16px',
              padding: '10px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 12px 30px -6px rgba(0, 0, 0, 0.45)',
              pointerEvents: 'auto',
              cursor: 'pointer',
            }}
            title="Open Passenger Chat & Phone [Tab]"
          >
            {/* Passenger Avatar */}
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #38bdf8, #818cf8)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                border: '2px solid rgba(255, 255, 255, 0.3)',
              }}
            >
              👩
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Passenger
              </span>
              <span style={{ fontSize: '14px', fontWeight: 700, color: '#ffffff' }}>
                {passenger.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background:
                      passenger.mood === 'happy'
                        ? '#22c55e'
                        : passenger.mood === 'neutral'
                        ? '#f59e0b'
                        : '#ef4444',
                    boxShadow: '0 0 8px currentColor',
                  }}
                />
                <span style={{ fontSize: '12px', color: '#e2e8f0', fontWeight: 600 }}>
                  {passenger.mood === 'happy'
                    ? '😊 Happy'
                    : passenger.mood === 'neutral'
                    ? '😐 Neutral'
                    : '😠 Frustrated'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Area: Minimap, Speedometer & Turn-by-Turn Card */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        {/* Circular Minimap (Bottom-Left) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', pointerEvents: 'auto' }}>
          <div
            onClick={onToggleMap}
            style={{
              width: '128px',
              height: '128px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, #0f172a 40%, #020617 100%)',
              border: '2px solid rgba(239, 68, 68, 0.6)',
              position: 'relative',
              overflow: 'hidden',
              boxShadow: '0 15px 35px rgba(0, 0, 0, 0.6), inset 0 0 20px rgba(0, 0, 0, 0.8)',
              cursor: 'pointer',
            }}
            title="Open Dhaka District Map [M]"
          >
            {/* Grid street lanes */}
            <svg
              style={{ width: '100%', height: '100%', opacity: 0.35 }}
              viewBox="0 0 100 100"
            >
              <line x1="10" y1="50" x2="90" y2="50" stroke="#64748b" strokeWidth="2" />
              <line x1="50" y1="10" x2="50" y2="90" stroke="#64748b" strokeWidth="2" />
              <line x1="20" y1="20" x2="80" y2="80" stroke="#64748b" strokeWidth="1.5" />
              {/* Route line */}
              <path
                d="M 50 50 Q 55 35 68 25"
                fill="none"
                stroke="#38bdf8"
                strokeWidth="4"
                strokeLinecap="round"
              />
            </svg>

            {/* Center Bike Arrow */}
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: '18px',
                height: '18px',
                color: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                filter: 'drop-shadow(0 0 4px #38bdf8)',
              }}
            >
              ▲
            </div>

            {/* Destination Pin */}
            <div
              style={{
                position: 'absolute',
                top: '20%',
                left: '68%',
                transform: 'translate(-50%, -50%)',
                color: '#ef4444',
                fontSize: '14px',
              }}
            >
              📍
            </div>
          </div>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#94a3b8' }}>
            {navigation.distanceText}
          </span>
        </div>

        {/* Motorcycle Digital Cockpit / Speedometer (Center-Bottom) */}
        <div
          style={{
            background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.88) 0%, rgba(2, 6, 23, 0.95) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '2px solid rgba(56, 189, 248, 0.25)',
            borderRadius: '24px 24px 14px 14px',
            padding: '14px 32px 10px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.2)',
            marginBottom: '4px',
          }}
        >
          {/* Big Speedometer Digits */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
            <span
              style={{
                fontSize: '44px',
                fontWeight: 900,
                color: '#ffffff',
                fontFamily: 'monospace, monospace',
                letterSpacing: '-0.04em',
                textShadow: '0 0 20px rgba(56, 189, 248, 0.4)',
              }}
            >
              {toBanglaDigits(displaySpeed)}
            </span>
            <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 700 }}>
              km/h
            </span>
          </div>

          {/* Segmented Fuel Gauge Arc */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#ef4444' }}>E</span>
            <div style={{ display: 'flex', gap: '3px' }}>
              {Array.from({ length: fuelSegments }).map((_, idx) => (
                <div
                  key={idx}
                  style={{
                    width: '9px',
                    height: '5px',
                    borderRadius: '2px',
                    background:
                      idx < activeFuelBars
                        ? idx === 0
                          ? '#ef4444'
                          : '#22c55e'
                        : 'rgba(255, 255, 255, 0.1)',
                    boxShadow: idx < activeFuelBars ? '0 0 6px rgba(34, 197, 94, 0.6)' : 'none',
                  }}
                />
              ))}
            </div>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#22c55e' }}>F</span>
          </div>

          {/* Functional Cockpit Controls: Headlight, Horn, Hazard */}
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px', pointerEvents: 'auto' }}>
            <button
              type="button"
              onClick={() => setHeadlights(!headlights)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: headlights ? 'rgba(56, 189, 248, 0.3)' : 'rgba(30, 41, 59, 0.6)',
                border: headlights ? '1px solid #38bdf8' : '1px solid rgba(255, 255, 255, 0.1)',
                color: headlights ? '#38bdf8' : '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Toggle Headlight (H)"
            >
              💡
            </button>

            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined') {
                  const win = window as unknown as { __uthao?: Record<string, () => void> };
                  win.__uthao?.soundHorn?.();
                }
              }}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(30, 41, 59, 0.6)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#f59e0b',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Honk Horn"
            >
              📢
            </button>

            <button
              type="button"
              onClick={() => setHazard(!hazard)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: hazard ? 'rgba(239, 68, 68, 0.3)' : 'rgba(30, 41, 59, 0.6)',
                border: hazard ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                color: hazard ? '#ef4444' : '#94a3b8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontSize: '14px',
              }}
              title="Toggle Hazard Lights"
            >
              ⚠️
            </button>
          </div>
        </div>

        {/* Turn-by-Turn Navigation Card (Bottom Right) */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '14px', pointerEvents: 'auto' }}>
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.78)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.14)',
              borderRadius: '16px',
              padding: '12px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              boxShadow: '0 12px 30px -6px rgba(0, 0, 0, 0.5)',
              maxWidth: '300px',
            }}
          >
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                background: 'rgba(56, 189, 248, 0.15)',
                border: '1px solid rgba(56, 189, 248, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                color: '#38bdf8',
              }}
            >
              ↱
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 700, color: '#ffffff', lineHeight: 1.3 }}>
                {navigation.instruction}
              </span>
              <span style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>
                {navigation.distanceText} • {navigation.etaText}
              </span>
            </div>
          </div>

          {/* Vertical Floating Action Buttons */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              onClick={onToggleCamera}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#ffffff',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)',
              }}
              title="Camera Mode (C)"
            >
              📷
            </button>

            <button
              onClick={onToggleMap}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#ffffff',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)',
              }}
              title="Toggle Dhaka Map (M)"
            >
              🗺️
            </button>

            <button
              onClick={onOpenMenu}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '50%',
                background: 'rgba(15, 23, 42, 0.8)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                color: '#ffffff',
                fontSize: '18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                boxShadow: '0 8px 20px rgba(0, 0, 0, 0.4)',
              }}
              title="Pause & Menu (Esc)"
            >
              ⋮
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
