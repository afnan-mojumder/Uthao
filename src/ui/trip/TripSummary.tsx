import type { TripReceipt } from '../../core/types';
import { t } from '../i18n';

export interface TripSummaryProps {
  receipt: TripReceipt;
  onContinue: () => void;
}

export function TripSummary({ receipt, onContinue }: TripSummaryProps) {
  const ratingVal = Math.round(receipt.rating ?? 5);
  const stars = '★'.repeat(ratingVal) + '☆'.repeat(Math.max(0, 5 - ratingVal));

  return (
    <div
      id="trip-summary-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        fontFamily: "'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        color: '#f8fafc',
      }}
    >
      <div
        style={{
          background: '#1e293b',
          border: '1px solid #334155',
          borderRadius: '16px',
          padding: '28px 36px',
          width: '90%',
          maxWidth: '440px',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.7)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#38bdf8' }}>
            {t('trip.summary.title')}
          </h2>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            {receipt.distanceKm.toFixed(1)} km • {Math.round(receipt.durationMin)} min
          </div>
        </div>

        {/* Rating Stars */}
        <div style={{ textAlign: 'center', margin: '4px 0' }}>
          <span style={{ fontSize: '26px', color: '#f59e0b', letterSpacing: '2px' }}>
            {stars}
          </span>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px' }}>
            {t('trip.summary.rating')}: {receipt.rating?.toFixed(1) ?? '5.0'}
          </div>
        </div>

        {/* Receipt Line Items */}
        <div
          style={{
            background: '#0f172a',
            borderRadius: '10px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            fontSize: '14px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#cbd5e1' }}>{t('trip.summary.fare')}</span>
            <span style={{ fontWeight: 600, color: '#f8fafc' }}>+৳{receipt.fare}</span>
          </div>

          {receipt.tip > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#cbd5e1' }}>{t('trip.summary.tip')}</span>
              <span style={{ fontWeight: 600, color: '#10b981' }}>+৳{receipt.tip}</span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>{t('trip.summary.commission')}</span>
            <span style={{ color: '#f87171' }}>-৳{receipt.commission}</span>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: '#94a3b8' }}>{t('trip.summary.fuel')}</span>
            <span style={{ color: '#f87171' }}>-৳{receipt.fuelCost}</span>
          </div>

          {receipt.otherCosts > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#94a3b8' }}>{t('trip.summary.other_costs')}</span>
              <span style={{ color: '#f87171' }}>-৳{receipt.otherCosts}</span>
            </div>
          )}

          <div
            style={{
              height: '1px',
              background: '#334155',
              margin: '6px 0',
            }}
          />

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: '16px',
              fontWeight: 700,
            }}
          >
            <span>{t('trip.summary.net')}</span>
            <span style={{ color: receipt.net >= 0 ? '#10b981' : '#ef4444' }}>
              ৳{receipt.net}
            </span>
          </div>
        </div>

        {/* Consequences */}
        {receipt.consequences.length > 0 && (
          <div style={{ fontSize: '12px', color: '#fbbf24', textAlign: 'center' }}>
            {receipt.consequences.map((c, i) => (
              <div key={i}>{t(c)}</div>
            ))}
          </div>
        )}

        {/* Continue Button */}
        <button
          id="btn-trip-continue"
          onClick={onContinue}
          style={{
            background: '#10b981',
            color: '#0f172a',
            border: 'none',
            borderRadius: '10px',
            padding: '12px',
            fontSize: '15px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {t('trip.summary.continue')}
        </button>
      </div>
    </div>
  );
}
