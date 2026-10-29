import type { JSX } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import type {
  NegotiationSession,
  NegotiationAction,
  NegotiationResult,
} from '../../sim/negotiation/NegotiationSystem';
import { t, getLanguage, getDictionary } from '../i18n';
import bnDialogue from '../../../data/dialogue/bn/negotiation.json';
import enDialogue from '../../../data/dialogue/en/negotiation.json';

export interface NegotiationPanelProps {
  active: boolean;
  bikeSpeed: number; // m/s
  session: NegotiationSession;
  lastResult?: NegotiationResult | null;
  onAction: (action: NegotiationAction) => void;
  onClose?: () => void;
}

export function NegotiationPanel({
  active,
  bikeSpeed,
  session,
  lastResult,
  onAction,
}: NegotiationPanelProps): JSX.Element | null {
  // Only opens when the bike is stopped at pickup (< 2.0 m/s)
  if (!active || bikeSpeed > 2.0) {
    return null;
  }

  const [counterAmount, setCounterAmount] = useState<number>(() => {
    return session.currentRiderOffer ?? session.currentPassengerOffer;
  });

  useEffect(() => {
    setCounterAmount(session.currentPassengerOffer);
  }, [session.currentPassengerOffer]);

  const stepFare = (delta: number) => {
    setCounterAmount((prev) => Math.max(50, prev + delta));
  };

  const getReasonIcon = (reason?: string) => {
    switch (reason) {
      case 'TOO_EXPENSIVE':
        return '💸';
      case 'OUT_OF_PATIENCE':
        return '⌛';
      case 'URGENT':
        return '⚡';
      case 'TRUSTS_YOU':
        return '🤝';
      case 'BAD_TRAFFIC':
        return '🚦';
      case 'WALK_TOO_FAR':
        return '🚶';
      case 'FAIR_PRICE':
      default:
        return '✅';
    }
  };

  // Passenger lines: Bangla-first with English subtitle, or vice-versa
  const rawKey = lastResult?.passengerLine ?? 'dialogue.negotiation.opening';
  const currentLang = getLanguage();
  const vars: Record<string, string | number> = {
    fare: session.currentPassengerOffer,
    offer: session.currentPassengerOffer,
    counter: counterAmount,
    destination: session.req.destinationNodeId ?? 'destination',
  };
  const primaryLine = t(rawKey, vars);
  const otherLang = currentLang === 'bn' ? 'en' : 'bn';
  const otherDict = getDictionary(otherLang);
  const subtitleTemplate =
    otherDict[rawKey] ??
    (currentLang === 'bn'
      ? (enDialogue as Record<string, string>)[rawKey]
      : (bnDialogue as Record<string, string>)[rawKey]) ??
    '';
  const subtitleLine = subtitleTemplate.replace(/\{(\w+)\}/g, (_: string, k: string) => String(vars[k] ?? ''));

  const patiencePct = Math.max(0, Math.min(100, session.currentPatience * 100));

  return (
    <div
      data-testid="negotiation-panel"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9500,
        background: 'rgba(15, 23, 42, 0.75)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        pointerEvents: 'auto',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(56, 189, 248, 0.3)',
          borderRadius: '24px',
          padding: '24px',
          boxShadow: '0 25px 60px rgba(0, 0, 0, 0.75)',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Top Header: Passenger Info & Rounds */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: '#334155',
                border: '2px solid #38bdf8',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '22px',
              }}
            >
              🧑‍💼
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '16px', fontWeight: 700 }}>
                {(session.profile.nameKey ? t(session.profile.nameKey) : null) || session.profile.passengerId}
              </span>
              <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                {session.profile.archetype} • {t('negotiation.round', { current: session.round, max: session.maxRounds })}
              </span>
            </div>
          </div>

          {/* Patience Gauge */}
          <div style={{ width: '100px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
              <span>{t('negotiation.patience')}</span>
              <span>{Math.round(patiencePct)}%</span>
            </div>
            <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${patiencePct}%`,
                  background: patiencePct > 50 ? '#22c55e' : patiencePct > 25 ? '#f59e0b' : '#ef4444',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        </div>

        {/* Reaction Chip after Round */}
        {lastResult && (
          <div
            data-testid="top-factor-chip"
            style={{
              alignSelf: 'flex-start',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 10px',
              borderRadius: '20px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              fontSize: '12px',
              fontWeight: 600,
              color: '#f59e0b',
            }}
          >
            <span>{getReasonIcon(lastResult.topFactor)}</span>
            <span>{t(`reason.${lastResult.topFactor}`)}</span>
          </div>
        )}

        {/* Passenger Speech Bubble (Bangla first, Subtitle second) */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.7)',
            borderLeft: '4px solid #38bdf8',
            borderRadius: '0 14px 14px 0',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          <span style={{ fontSize: '15px', fontWeight: 600, color: '#f8fafc', lineHeight: 1.4 }}>
            "{primaryLine}"
          </span>
          {subtitleLine && (
            <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>
              {subtitleLine}
            </span>
          )}
        </div>

        {/* Offer Comparison Box */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '12px',
            background: 'rgba(30, 41, 59, 0.4)',
            padding: '10px 14px',
            borderRadius: '12px',
          }}
        >
          <div>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t('negotiation.passenger_offer', { fare: '' })}</span>
            <span style={{ display: 'block', fontSize: '18px', fontWeight: 800, color: '#38bdf8' }}>
              ৳{session.currentPassengerOffer}
            </span>
          </div>
          <div>
            <span style={{ fontSize: '11px', color: '#94a3b8' }}>{t('negotiation.fair_fare', { fare: '' })}</span>
            <span style={{ display: 'block', fontSize: '18px', fontWeight: 800, color: '#94a3b8' }}>
              ৳{session.fairFare}
            </span>
          </div>
        </div>

        {/* Stepper Controls: [ -10 ] [ -5 ] [ ৳ Counter ] [ +5 ] [ +10 ] */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: 'rgba(15, 23, 42, 0.8)',
            padding: '8px',
            borderRadius: '16px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <button
            type="button"
            data-testid="stepper-minus-10"
            onClick={() => stepFare(-10)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            -৳১০
          </button>

          <button
            type="button"
            data-testid="stepper-minus"
            onClick={() => stepFare(-5)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            -৳৫
          </button>

          <div style={{ padding: '0 16px', textAlign: 'center' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>
              Your Quote
            </span>
            <span style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b' }}>
              ৳{counterAmount}
            </span>
          </div>

          <button
            type="button"
            data-testid="stepper-plus"
            onClick={() => stepFare(5)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            +৳৫
          </button>

          <button
            type="button"
            data-testid="stepper-plus-10"
            onClick={() => stepFare(10)}
            style={{
              padding: '8px 12px',
              borderRadius: '8px',
              background: '#1e293b',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            +৳১০
          </button>
        </div>

        {/* Quick Action Buttons Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
          {/* 1. Accept Current Offer */}
          <button
            type="button"
            data-testid="accept-btn"
            onClick={() => onAction({ kind: 'accept' })}
            style={{
              padding: '12px',
              borderRadius: '12px',
              background: '#22c55e',
              border: 'none',
              color: '#0f172a',
              fontSize: '14px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)',
            }}
          >
            {t('negotiation.accept', { fare: session.currentPassengerOffer })}
          </button>

          {/* 2. Counter with stepper quote */}
          <button
            type="button"
            data-testid="counter-btn"
            onClick={() => onAction({ kind: 'counter', amount: counterAmount })}
            style={{
              padding: '12px',
              borderRadius: '12px',
              background: '#f59e0b',
              border: 'none',
              color: '#0f172a',
              fontSize: '14px',
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(245, 158, 11, 0.3)',
            }}
          >
            {t('negotiation.counter', { fare: counterAmount })}
          </button>

          {/* 3. Discount */}
          <button
            type="button"
            data-testid="discount-btn"
            onClick={() => onAction({ kind: 'discount', amount: Math.max(50, counterAmount - 10) })}
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: 'rgba(56, 189, 248, 0.2)',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              color: '#38bdf8',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('negotiation.discount', { fare: Math.max(50, counterAmount - 10) })}
          </button>

          {/* 4. Cross to other side */}
          <button
            type="button"
            data-testid="cross-side-btn"
            onClick={() => onAction({ kind: 'pickupAdjust', walkM: 60, savesMin: 5 })}
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('negotiation.cross')}
          </button>

          {/* 5. Not entering alley */}
          <button
            type="button"
            data-testid="refuse-alley-btn"
            onClick={() => onAction({ kind: 'refuseAlley', walkM: 40 })}
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('negotiation.refuse_alley')}
          </button>

          {/* 6. Explain detour */}
          <button
            type="button"
            data-testid="explain-detour-btn"
            onClick={() => onAction({ kind: 'explainDetour', extraMin: 8 })}
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('negotiation.explain_detour', { min: 8 })}
          </button>

          {/* 7. Off-app direct ride */}
          <button
            type="button"
            data-testid="off-app-btn"
            onClick={() => onAction({ kind: 'offApp', amount: counterAmount })}
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: 'rgba(234, 179, 8, 0.2)',
              border: '1px solid rgba(234, 179, 8, 0.4)',
              color: '#eab308',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('negotiation.off_app', { fare: counterAmount })}
          </button>

          {/* 8. Decline / Walk away */}
          <button
            type="button"
            data-testid="decline-btn"
            onClick={() => onAction({ kind: 'decline' })}
            style={{
              padding: '10px',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.2)',
              border: '1px solid rgba(239, 68, 68, 0.4)',
              color: '#ef4444',
              fontSize: '12px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {t('negotiation.decline')}
          </button>
        </div>
      </div>
    </div>
  );
}
