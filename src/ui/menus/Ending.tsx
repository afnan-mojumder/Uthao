import type { JSX } from 'preact';
import { t } from '../i18n';
import type { EndingResult, CareerChoiceOption, CareerChoice } from '../../sim/mission/endings';

export interface EndingProps {
  result: EndingResult;
  choices?: CareerChoiceOption[];
  onSelectChoice?: (choice: CareerChoice) => void;
  onRestartCareer?: () => void;
  onEnterEndless?: () => void;
  onMainMenu?: () => void;
  onClose?: () => void;
}

export interface EndingTheme {
  color: string;
  bgGrad: string;
  icon: string;
}

const DEFAULT_THEME: EndingTheme = {
  color: '#38bdf8',
  bgGrad: 'linear-gradient(145deg, rgba(14, 116, 144, 0.4), rgba(15, 23, 42, 0.95))',
  icon: '🏍️',
};

const ENDING_THEMES: Record<string, EndingTheme> = {
  independent_rider: DEFAULT_THEME,
  workshop_owner: {
    color: '#f97316',
    bgGrad: 'linear-gradient(145deg, rgba(194, 65, 12, 0.4), rgba(15, 23, 42, 0.95))',
    icon: '🔧',
  },
  trusted_local: {
    color: '#10b981',
    bgGrad: 'linear-gradient(145deg, rgba(4, 120, 87, 0.4), rgba(15, 23, 42, 0.95))',
    icon: '🤝',
  },
  fast_money: {
    color: '#ef4444',
    bgGrad: 'linear-gradient(145deg, rgba(185, 28, 28, 0.4), rgba(15, 23, 42, 0.95))',
    icon: '💵',
  },
  fresh_start: {
    color: '#a855f7',
    bgGrad: 'linear-gradient(145deg, rgba(126, 34, 206, 0.4), rgba(15, 23, 42, 0.95))',
    icon: '🌱',
  },
  ending_v1_first_week: {
    color: '#f59e0b',
    bgGrad: 'linear-gradient(145deg, rgba(180, 83, 9, 0.4), rgba(15, 23, 42, 0.95))',
    icon: '⭐',
  },
};

export function Ending({
  result,
  choices,
  onSelectChoice,
  onRestartCareer,
  onEnterEndless,
  onMainMenu,
  onClose,
}: EndingProps): JSX.Element {
  const theme: EndingTheme = ENDING_THEMES[result.endingId] ?? DEFAULT_THEME;
  const { summary, tendencies } = result;

  return (
    <div
      data-testid="ending-screen"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: 'rgba(10, 15, 29, 0.92)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        fontFamily: "'Noto Sans Bengali', 'Segoe UI', system-ui, sans-serif",
        color: '#f8fafc',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '680px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: theme.bgGrad,
          borderRadius: '20px',
          border: `1px solid ${theme.color}44`,
          padding: '28px',
          boxShadow: `0 25px 60px -15px ${theme.color}33`,
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Header */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '8px' }}>{theme.icon}</div>
          <div
            style={{
              fontSize: '0.85rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: theme.color,
              marginBottom: '4px',
            }}
          >
            ক্যাম্পেইন সমাপ্তি · Campaign Ending
          </div>
          <h1
            style={{
              margin: '0 0 12px 0',
              fontSize: '1.8rem',
              fontWeight: 800,
              color: '#f8fafc',
            }}
          >
            {t(result.titleKey)}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: '1rem',
              lineHeight: 1.6,
              color: '#cbd5e1',
            }}
          >
            {t(result.descKey)}
          </p>
        </div>

        {/* Identity Tendencies Radar/Bars */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.6)',
            padding: '16px 20px',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div
            style={{
              fontSize: '0.9rem',
              fontWeight: 700,
              color: '#94a3b8',
              marginBottom: '12px',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            রাইডার প্রবণতা ও পরিচয় (Identity Breakdown)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {[
              { label: 'পেশাদার (Professional)', score: tendencies.professional, color: '#38bdf8' },
              { label: 'দরকষাকষিবিদ (Negotiator)', score: tendencies.negotiator, color: '#fbbf24' },
              { label: 'হাঁটুরে / ঝুঁকিপ্রিয় (Hustler)', score: tendencies.hustler, color: '#f97316' },
              { label: 'পাড়ার নিয়মিত (Regular)', score: tendencies.regular, color: '#10b981' },
            ].map((tend) => (
              <div key={tend.label}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.85rem',
                    marginBottom: '4px',
                  }}
                >
                  <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{tend.label}</span>
                  <span style={{ color: tend.color, fontWeight: 700 }}>{tend.score}%</span>
                </div>
                <div
                  style={{
                    height: '8px',
                    background: '#1e293b',
                    borderRadius: '4px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      height: '100%',
                      width: `${tend.score}%`,
                      background: tend.color,
                      borderRadius: '4px',
                      transition: 'width 0.6s ease',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Career Stats Grid */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '12px',
          }}
        >
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              padding: '12px 14px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>মোট সঞ্চয় (Savings)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#10b981', marginTop: '2px' }}>
              ৳{summary.savings.toLocaleString()}
            </div>
          </div>
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              padding: '12px 14px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>চূড়ান্ত রেটিং (Rating)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#f59e0b', marginTop: '2px' }}>
              ★ {summary.rating.toFixed(2)}
            </div>
          </div>
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.6)',
              padding: '12px 14px',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              textAlign: 'center',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>লোকাল আস্থা (Trust)</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
              {summary.localTrust}/100
            </div>
          </div>
        </div>

        {/* Optional Career Choices if in Decision phase */}
        {choices && choices.length > 0 && onSelectChoice && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#e2e8f0' }}>
              আপনার ভবিষ্যতের পথ বেছে নিন (Choose Your Career Path):
            </div>
            {choices.map((c) => (
              <button
                key={c.id}
                disabled={!c.available}
                onClick={() => onSelectChoice(c.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '14px 18px',
                  borderRadius: '12px',
                  border: c.available ? `1px solid ${theme.color}88` : '1px solid #334155',
                  background: c.available ? 'rgba(30, 41, 59, 0.8)' : 'rgba(15, 23, 42, 0.4)',
                  color: c.available ? '#f8fafc' : '#64748b',
                  cursor: c.available ? 'pointer' : 'not-allowed',
                  textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{t(c.titleKey)}</div>
                  <div style={{ fontSize: '0.8rem', color: c.available ? '#94a3b8' : '#475569' }}>
                    {t(c.descKey)}
                  </div>
                  {!c.available && c.disabledReason && (
                    <div style={{ fontSize: '0.75rem', color: '#ef4444', marginTop: '2px' }}>
                      ⚠️ {c.disabledReason}
                    </div>
                  )}
                </div>
                {c.cost > 0 && (
                  <div
                    style={{
                      fontWeight: 800,
                      fontSize: '1rem',
                      color: c.available ? '#10b981' : '#64748b',
                      marginLeft: '12px',
                    }}
                  >
                    ৳{c.cost.toLocaleString()}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Navigation Action Buttons */}
        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          {onRestartCareer && (
            <button
              onClick={onRestartCareer}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '10px',
                border: 'none',
                background: theme.color,
                color: '#0f172a',
                fontWeight: 800,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              🔄 নতুন ক্যারিয়ার (New Career)
            </button>
          )}
          {onEnterEndless && (
            <button
              onClick={onEnterEndless}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                background: '#1e293b',
                color: '#f8fafc',
                fontWeight: 700,
                fontSize: '0.95rem',
                cursor: 'pointer',
              }}
            >
              ♾️ এন্ডলেস রাইড (Endless Mode)
            </button>
          )}
          {onMainMenu && (
            <button
              onClick={onMainMenu}
              style={{
                padding: '12px 20px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'transparent',
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              মূল মেনু (Main Menu)
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              style={{
                padding: '12px 18px',
                borderRadius: '10px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: 'transparent',
                color: '#94a3b8',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              বন্ধ (Close)
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
