import type { JSX } from 'preact';
import { formatTaka } from '../utils/bangla';

export interface DayAccounting {
  day: number;
  grossFare: number;
  appCommission: number;
  fuelAndRepairs: number;
  officialFines: number;
  unofficialPayments: number;
  compensationAndMedical: number;
  netSavings: number;
  completedRides: number;
  reputationDelta: number;
}

export interface DaySummaryModalProps {
  accounting: DayAccounting;
  onSleepNextDay: () => void;
}

export function DaySummaryModal({
  accounting,
  onSleepNextDay,
}: DaySummaryModalProps): JSX.Element {
  const rows = [
    { label: 'মোট অর্জিত ভাড়া (Gross Fare)', amount: accounting.grossFare, isDeduction: false },
    { label: 'উধাও প্ল্যাটফর্ম ফি (App Commission)', amount: accounting.appCommission, isDeduction: true },
    { label: 'জ্বালানি ও বাইক মেরামত (Fuel & Maintenance)', amount: accounting.fuelAndRepairs, isDeduction: true },
    { label: 'সরকারি ট্রাফিক জরিমানা (Official Fines)', amount: accounting.officialFines, isDeduction: true },
    { label: 'অনানুষ্ঠানিক রফা / ঘুষ (Unofficial Payments)', amount: accounting.unofficialPayments, isDeduction: true },
    { label: 'ক্ষতিপূরণ ও চিকিৎসা ব্যয় (Compensation & Medical)', amount: accounting.compensationAndMedical, isDeduction: true },
  ];

  return (
    <div
      data-testid="day-summary-modal"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9700,
        background: 'rgba(2, 6, 23, 0.92)',
        backdropFilter: 'blur(20px)',
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
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: '28px',
          border: '1px solid rgba(255, 255, 255, 0.15)',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9), 0 0 40px rgba(34, 197, 94, 0.15)',
          padding: '28px 24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <span style={{ fontSize: '12px', fontWeight: 800, color: '#38bdf8', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Day {accounting.day} Summary
          </span>
          <h2 style={{ fontSize: '22px', fontWeight: 900, color: '#ffffff', margin: '4px 0 0' }}>
            দিনের চূড়ান্ত হিসাবনিকাশ
          </h2>
        </div>

        {/* Accounting Table */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.75)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '16px',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {rows.map((r) => (
            <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', color: '#cbd5e1' }}>{r.label}</span>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 800,
                  color: r.isDeduction
                    ? r.amount > 0
                      ? '#f87171'
                      : '#94a3b8'
                    : '#4ade80',
                }}
              >
                {r.isDeduction && r.amount > 0 ? '-' : ''}{formatTaka(r.amount)}
              </span>
            </div>
          ))}

          <div
            style={{
              borderTop: '2px dashed rgba(255, 255, 255, 0.15)',
              paddingTop: '12px',
              marginTop: '4px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
            }}
          >
            <span style={{ fontSize: '15px', fontWeight: 800, color: '#ffffff' }}>
              দিনের চূড়ান্ত লাভ (Net Savings)
            </span>
            <span
              style={{
                fontSize: '24px',
                fontWeight: 900,
                color: accounting.netSavings >= 0 ? '#22c55e' : '#ef4444',
              }}
            >
              {formatTaka(accounting.netSavings)}
            </span>
          </div>
        </div>

        {/* Sleep / Next Day Button */}
        <button
          onClick={onSleepNextDay}
          style={{
            background: '#22c55e',
            border: 'none',
            borderRadius: '16px',
            color: '#052e16',
            padding: '14px 0',
            fontSize: '16px',
            fontWeight: 900,
            cursor: 'pointer',
            boxShadow: '0 8px 25px rgba(34, 197, 94, 0.4)',
          }}
        >
          🌙 বাসায় ফিরে ঘুম দিন (End Shift & Sleep)
        </button>
      </div>
    </div>
  );
}
