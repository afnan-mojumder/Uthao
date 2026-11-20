import type { JSX } from 'preact';
import type { TripReceipt } from '../../core/types';
import { ModalPanel, PrimaryButton, TransactionRow } from '../components';
import { IconStar } from '../components/icons';
import { localDigits, t } from '../i18n';

export interface TripSummaryProps {
  receipt: TripReceipt;
  onContinue: () => void;
}

export function TripSummary({ receipt, onContinue }: TripSummaryProps): JSX.Element {
  const ratingVal = Math.max(0, Math.min(5, Math.round(receipt.rating ?? 5)));

  return (
    <ModalPanel
      id="trip-summary-overlay"
      ariaLabel={t('trip.summary.title')}
      maxWidth="460px"
      zIndex={9500}
      contentStyle={{ gap: '16px' }}
    >
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ margin: 0, fontSize: '22px', fontWeight: 700, color: '#38bdf8' }}>
            {t('trip.summary.title')}
          </h2>
          <div style={{ fontSize: '13px', color: '#94a3b8', marginTop: '4px' }}>
            {localDigits(receipt.distanceKm.toFixed(1))} km • {localDigits(Math.round(receipt.durationMin))} min
          </div>
        </div>

        {/* Rating Stars */}
        <div style={{ textAlign: 'center', margin: '2px 0' }}>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: '#f59e0b',
            }}
            aria-label={`${t('trip.summary.rating')}: ${(receipt.rating ?? 5).toFixed(1)}`}
          >
            {Array.from({ length: 5 }, (_, idx) => (
              <IconStar
                key={idx}
                size={22}
                color={idx < ratingVal ? '#f59e0b' : 'rgba(148, 163, 184, 0.35)'}
              />
            ))}
          </div>
          <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '4px' }}>
            {t('trip.summary.rating')}: {localDigits((receipt.rating ?? 5).toFixed(1))}
          </div>
        </div>

        {/* Receipt Line Items */}
        <div
          style={{
            background: '#0f172a',
            borderRadius: '10px',
            padding: '14px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontSize: '14px',
          }}
        >
          <TransactionRow label={t('trip.summary.fare')} amount={receipt.fare} kind="income" />

          {receipt.tip > 0 && (
            <TransactionRow label={t('trip.summary.tip')} amount={receipt.tip} kind="income" />
          )}

          {receipt.bonus > 0 && (
            <TransactionRow label={t('trip.summary.bonus')} amount={receipt.bonus} kind="income" />
          )}

          <TransactionRow label={t('trip.summary.commission')} amount={receipt.commission} kind="expense" />

          <TransactionRow
            testId="trip-summary-fuel"
            label={t('trip.summary.fuel')}
            amount={receipt.fuelCost}
            kind="expense"
          />

          {receipt.otherCosts > 0 && (
            <TransactionRow label={t('trip.summary.other_costs')} amount={receipt.otherCosts} kind="expense" />
          )}

          {receipt.penalties > 0 && (
            <TransactionRow label={t('trip.summary.penalties')} amount={receipt.penalties} kind="expense" />
          )}

          {receipt.compensation > 0 && (
            <TransactionRow label={t('trip.summary.compensation')} amount={receipt.compensation} kind="expense" />
          )}

          <TransactionRow label={t('trip.summary.net')} amount={receipt.net} kind="total" />
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
        <PrimaryButton
          id="btn-trip-continue"
          type="button"
          onClick={onContinue}
          style={{ width: '100%' }}
        >
          {t('trip.summary.continue')}
        </PrimaryButton>
    </ModalPanel>
  );
}
