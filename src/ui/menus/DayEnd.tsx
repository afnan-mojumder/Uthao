import type { JSX } from 'preact';
import type { DaySummary } from '../../core/types';
import { t } from '../i18n';

export interface DayEndProps {
  summary: DaySummary | null;
  onSleep?: () => void;
  onDelayRent?: () => void;
  onAskAdvance?: (from: 'mintu' | 'ma', amount: number) => void;
}

export function DayEnd({
  summary,
  onSleep,
  onDelayRent,
  onAskAdvance,
}: DayEndProps): JSX.Element | null {
  if (!summary) return null;

  const isNetPositive = summary.net >= 0;
  const living = summary.livingExpenses;
  const isRentDue = (living?.rent ?? 0) > 0 || (summary.breakdown?.rent ?? 0) > 0;
  const rentDelayed = living?.rentDelayed;
  const evictionWarning = living?.evictionWarning;

  return (
    <div
      data-testid="day-end-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9998,
        background: 'rgba(10, 15, 29, 0.88)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: "'Hind Siliguri', 'Segoe UI', system-ui, sans-serif",
        color: '#f8fafc',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '560px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: 'linear-gradient(145deg, rgba(30, 41, 59, 0.95), rgba(15, 23, 42, 0.95))',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '20px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6), 0 0 30px rgba(16, 185, 129, 0.1)',
          padding: '24px 28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span
              style={{
                fontSize: '0.8rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#94a3b8',
                fontWeight: 600,
              }}
            >
              {t('dayend.shift_ended')}
            </span>
            <h2
              data-testid="day-end-title"
              style={{
                margin: '2px 0 0 0',
                fontSize: '1.6rem',
                fontWeight: 800,
                color: '#38bdf8',
                letterSpacing: '-0.02em',
              }}
            >
              {t('dayend.day_num').replace('{day}', String(summary.day))}
            </h2>
          </div>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: '9999px',
              background: isNetPositive ? 'rgba(16, 185, 129, 0.2)' : 'rgba(239, 68, 68, 0.2)',
              border: `1px solid ${isNetPositive ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
              color: isNetPositive ? '#34d399' : '#f87171',
              fontWeight: 700,
              fontSize: '0.9rem',
            }}
          >
            {summary.completedRides} {t('dayend.rides_completed')}
          </div>
        </div>

        {/* Warnings for Rent / Eviction */}
        {evictionWarning && (
          <div
            data-testid="day-end-eviction-warning"
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.25)',
              border: '1px solid rgba(239, 68, 68, 0.6)',
              color: '#fca5a5',
              fontSize: '0.9rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>⚠️</span>
            <span>{t('dayend.eviction_warning')}</span>
          </div>
        )}

        {rentDelayed && !evictionWarning && (
          <div
            data-testid="day-end-rent-delayed"
            style={{
              padding: '12px 16px',
              borderRadius: '12px',
              background: 'rgba(245, 158, 11, 0.2)',
              border: '1px solid rgba(245, 158, 11, 0.5)',
              color: '#fcd34d',
              fontSize: '0.9rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>⏳</span>
            <span>{t('dayend.rent_delayed')}</span>
          </div>
        )}

        {/* Big Net KPI Card */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
            textAlign: 'center',
          }}
        >
          <div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
              {t('dayend.revenue')}
            </div>
            <div
              data-testid="day-end-revenue"
              style={{ fontSize: '1.25rem', fontWeight: 800, color: '#34d399', marginTop: '2px' }}
            >
              +৳{Math.round(summary.revenue)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
              {t('dayend.expenses')}
            </div>
            <div
              data-testid="day-end-expenses"
              style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f87171', marginTop: '2px' }}
            >
              -৳{Math.round(summary.expenses)}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600 }}>
              {t('dayend.net')}
            </div>
            <div
              data-testid="day-end-net"
              style={{
                fontSize: '1.25rem',
                fontWeight: 800,
                color: isNetPositive ? '#38bdf8' : '#fb923c',
                marginTop: '2px',
              }}
            >
              {isNetPositive ? '+' : ''}৳{Math.round(summary.net)}
            </div>
          </div>
        </div>

        {/* Itemized Expenses Breakdown */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.4)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '14px',
            padding: '14px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              color: '#cbd5e1',
              letterSpacing: '0.05em',
              marginBottom: '2px',
            }}
          >
            {t('dayend.expenses')}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
            <span style={{ color: '#94a3b8' }}>🍲 {t('dayend.food')}</span>
            <span data-testid="day-end-food" style={{ fontWeight: 600, color: '#f87171' }}>
              -৳{summary.breakdown?.food ?? living?.food ?? 150}
            </span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
            <span style={{ color: '#94a3b8' }}>📱 {t('dayend.phone_data')}</span>
            <span data-testid="day-end-data" style={{ fontWeight: 600, color: '#f87171' }}>
              -৳{summary.breakdown?.phoneData ?? living?.phoneData ?? 30}
            </span>
          </div>

          {((summary.breakdown?.rent ?? 0) > 0 || (living?.rent ?? 0) > 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
              <span style={{ color: '#94a3b8' }}>🏠 {t('dayend.rent')}</span>
              <span data-testid="day-end-rent" style={{ fontWeight: 700, color: '#f87171' }}>
                -৳{summary.breakdown?.rent ?? living?.rent ?? 4000}
              </span>
            </div>
          )}

          {((summary.breakdown?.family ?? 0) > 0 || (living?.family ?? 0) > 0) && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
              <span style={{ color: '#94a3b8' }}>👨‍👩‍👧 {t('dayend.family')}</span>
              <span style={{ fontWeight: 600, color: '#f87171' }}>
                -৳{summary.breakdown?.family ?? living?.family ?? 1200}
              </span>
            </div>
          )}
        </div>

        {/* Wallet & Debt Status */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: '12px 18px',
            background: 'rgba(30, 41, 59, 0.4)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            fontSize: '0.9rem',
          }}
        >
          <div>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{t('dayend.cash')}: </span>
            <span
              data-testid="day-end-cash"
              style={{ fontWeight: 700, color: '#f8fafc', fontSize: '1rem' }}
            >
              ৳{summary.cash ?? 0}
            </span>
          </div>
          <div>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{t('dayend.debt')}: </span>
            <span
              data-testid="day-end-debt"
              style={{
                fontWeight: 700,
                color: (summary.debt ?? 0) > 0 ? '#fb923c' : '#34d399',
                fontSize: '1rem',
              }}
            >
              ৳{summary.debt ?? 0}
            </span>
          </div>
          <div>
            <span style={{ color: '#94a3b8', fontSize: '0.8rem' }}>{t('dayend.rating_change')}: </span>
            <span
              style={{
                fontWeight: 700,
                color: summary.ratingDelta >= 0 ? '#34d399' : '#f87171',
                fontSize: '1rem',
              }}
            >
              {summary.ratingDelta >= 0 ? '+' : ''}{summary.ratingDelta}★
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
          {/* Sleep / Next Day */}
          <button
            data-testid="day-end-sleep-btn"
            onClick={onSleep}
            style={{
              padding: '14px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '1rem',
              cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(16, 185, 129, 0.35)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            <span>🌙</span>
            <span>{t('dayend.btn_sleep')}</span>
          </button>

          {/* Delay Rent button (if rent due today and not evicted) */}
          {isRentDue && !evictionWarning && onDelayRent && (
            <button
              data-testid="day-end-delay-rent-btn"
              onClick={onDelayRent}
              style={{
                padding: '10px',
                borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                color: '#fbbf24',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              ⏳ {t('dayend.btn_delay_rent')}
            </button>
          )}

          {/* Bad day recovery advances: borrow from Mintu or Ma */}
          {(summary.cash === undefined || summary.cash < 200 || (summary.debt ?? 0) > 0) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              <button
                data-testid="day-end-advance-mintu-btn"
                onClick={() => onAskAdvance?.('mintu', 500)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '10px',
                  background: 'rgba(56, 189, 248, 0.12)',
                  border: '1px solid rgba(56, 189, 248, 0.3)',
                  color: '#38bdf8',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                ☕ {t('dayend.btn_ask_mintu')}
              </button>
              <button
                data-testid="day-end-advance-ma-btn"
                onClick={() => onAskAdvance?.('ma', 500)}
                style={{
                  padding: '9px 12px',
                  borderRadius: '10px',
                  background: 'rgba(236, 72, 153, 0.12)',
                  border: '1px solid rgba(236, 72, 153, 0.3)',
                  color: '#f472b6',
                  fontWeight: 600,
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                }}
              >
                ❤️ {t('dayend.btn_ask_ma')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
