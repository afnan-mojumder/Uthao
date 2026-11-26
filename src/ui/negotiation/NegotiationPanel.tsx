import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import type {
  NegotiationAction,
  NegotiationResult,
  NegotiationSession,
} from '../../sim/negotiation/NegotiationSystem';
import { CharacterPortrait, ModalPanel } from '../components';
import {
  IconCheck,
  IconClock,
  IconFlag,
  IconMapPin,
  IconShield,
  IconWarning,
} from '../components/icons';
import { localDigits, t } from '../i18n';

export interface NegotiationPanelProps {
  active: boolean;
  session: NegotiationSession;
  lastResult?: NegotiationResult | null;
  /** 0-1 passenger mood. */
  mood?: number;
  /** A relocation the sim can really perform right now (null: none, no button). */
  pickup?: { nodeId: string; walkM: number; savesMin: number } | null;
  /** A non-alley entrance the passenger could meet/leave at (null: none, no button). */
  alley?: { nodeId: string; walkM: number; target: 'pickup' | 'destination' } | null;
  /** Name key of the destination's place. */
  destinationKey?: string;
  onAction: (action: NegotiationAction) => void;
  onClose?: () => void;
}

function ReasonIcon({ reason }: { reason?: string }): JSX.Element {
  switch (reason) {
    case 'TOO_EXPENSIVE':
    case 'OUT_OF_PATIENCE':
      return <IconClock size={14} />;
    case 'URGENT':
    case 'BAD_TRAFFIC':
      return <IconWarning size={14} />;
    case 'TRUSTS_YOU':
      return <IconShield size={14} />;
    case 'WALK_TOO_FAR':
      return <IconMapPin size={14} />;
    case 'FAIR_PRICE':
    default:
      return <IconCheck size={14} />;
  }
}

export interface NegotiationPanelViewProps extends NegotiationPanelProps {
  counterAmount: number;
  draftCounter: string;
  onStepFare: (delta: number) => void;
  onDraftInput: (raw: string) => void;
  onCommitDraft: () => number;
}

export function NegotiationPanel({
  active,
  session,
  lastResult,
  mood = 1,
  pickup = null,
  alley = null,
  destinationKey,
  onAction,
}: NegotiationPanelProps): JSX.Element | null {
  const initialOffer = Math.max(
    50,
    Math.round(session.currentRiderOffer ?? session.currentPassengerOffer)
  );
  const [counterAmount, setCounterAmount] = useState<number>(initialOffer);
  const [draftCounter, setDraftCounter] = useState<string>(String(initialOffer));
  const syncKey = `${session.req.requestId}:${session.round}:${session.currentPassengerOffer}`;
  const prevSyncKeyRef = useRef(syncKey);

  useEffect(() => {
    if (prevSyncKeyRef.current === syncKey) return;
    prevSyncKeyRef.current = syncKey;
    const synced = Math.max(50, Math.round(session.currentPassengerOffer));
    setCounterAmount(synced);
    setDraftCounter(String(synced));
  }, [syncKey, session.currentPassengerOffer]);

  const commitDraftCounter = (): number => {
    const parsed = Number(draftCounter);
    const clamped =
      draftCounter.trim() !== '' && Number.isFinite(parsed)
        ? Math.max(50, Math.round(parsed))
        : Math.max(50, counterAmount);
    setCounterAmount(clamped);
    setDraftCounter(String(clamped));
    return clamped;
  };

  const stepFare = (delta: number) => {
    const parsed = Number(draftCounter);
    const base =
      draftCounter.trim() !== '' && Number.isFinite(parsed)
        ? Math.max(50, Math.round(parsed))
        : counterAmount;
    const next = Math.max(50, base + delta);
    setCounterAmount(next);
    setDraftCounter(String(next));
  };

  const handleDraftInput = (raw: string) => {
    setDraftCounter(raw);
    const parsed = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(parsed)) {
      setCounterAmount(Math.max(50, Math.round(parsed)));
    }
  };

  return (
    <NegotiationPanelView
      active={active}
      session={session}
      lastResult={lastResult}
      mood={mood}
      pickup={pickup}
      alley={alley}
      destinationKey={destinationKey}
      onAction={onAction}
      counterAmount={counterAmount}
      draftCounter={draftCounter}
      onStepFare={stepFare}
      onDraftInput={handleDraftInput}
      onCommitDraft={commitDraftCounter}
    />
  );
}

export function NegotiationPanelView({
  active,
  session,
  lastResult,
  mood = 1,
  pickup = null,
  alley = null,
  destinationKey,
  onAction,
  counterAmount,
  draftCounter,
  onStepFare: stepFare,
  onDraftInput,
  onCommitDraft: commitDraftCounter,
}: NegotiationPanelViewProps): JSX.Element | null {
  if (!active) return null;

  const resolvedDestKey = destinationKey || session.req.destinationPlaceKey;
  const translatedDest = resolvedDestKey ? t(resolvedDestKey) : '';
  const destinationLabel =
    translatedDest && translatedDest !== resolvedDestKey
      ? translatedDest
      : t('phone.unknown_stop');

  // Passenger lines in active language
  const rawKey = lastResult?.passengerLine ?? 'dialogue.negotiation.opening';
  const isCounterReply =
    lastResult?.outcome?.kind === 'rejected' &&
    rawKey.includes('.counter.') &&
    session.currentRiderOffer !== undefined;
  const vars: Record<string, string | number> = {
    fare: localDigits(
      isCounterReply ? session.currentRiderOffer! : session.currentPassengerOffer
    ),
    offer: localDigits(session.currentPassengerOffer),
    counter: localDigits(session.currentPassengerOffer),
    destination: destinationLabel,
  };
  const primaryLine = t(rawKey, vars);

  const patiencePct = Math.max(0, Math.min(100, session.currentPatience * 100));
  const passengerName =
    (session.profile.nameKey ? t(session.profile.nameKey) : null) ||
    session.profile.passengerId;

  return (
    <ModalPanel
      testId="negotiation-panel"
      ariaLabel={passengerName}
      maxWidth="520px"
      zIndex={9500}
      style={{
        border: '1px solid rgba(56, 189, 248, 0.35)',
        borderRadius: '20px',
      }}
    >
      {/* Top Header: Passenger Info & Patience */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
          <CharacterPortrait
            characterId={session.profile.characterId ?? session.req.characterId}
            archetype={session.profile.archetype}
            mood={mood}
            size={44}
            hideLabels={true}
          />
          <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <span style={{ fontSize: '16px', fontWeight: 700, color: '#f8fafc' }}>
              {passengerName}
            </span>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              {t(`phone.archetype.${session.profile.archetype}`)} •{' '}
              {t('negotiation.round', {
                current: localDigits(Math.min(session.round, session.maxRounds)),
                max: localDigits(session.maxRounds),
              })}
            </span>
          </div>
        </div>

        {/* Patience Gauge */}
        <div style={{ width: '104px', display: 'flex', flexDirection: 'column', gap: '4px', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#94a3b8' }}>
            <span>{t('negotiation.patience')}</span>
            <span>{localDigits(Math.round(patiencePct))}%</span>
          </div>
          <div style={{ height: '6px', background: 'rgba(255, 255, 255, 0.1)', borderRadius: '3px', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${patiencePct}%`,
                background:
                  patiencePct > 50 ? '#22c55e' : patiencePct > 25 ? '#f59e0b' : '#ef4444',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>

      {/* Mood, Destination & Route */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '8px',
          fontSize: '12px',
          color: '#94a3b8',
        }}
      >
        <span data-testid="mood-text">
          {t('negotiation.mood')}: {localDigits(Math.round(mood * 100))}%
        </span>
        <span
          data-testid="negotiation-destination"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            color: '#e2e8f0',
            fontWeight: 600,
          }}
        >
          <IconFlag size={13} />
          <span>
            {t('negotiation.destination_label', { place: destinationLabel })}
          </span>
        </span>
        <span data-testid="route-text">
          {t('negotiation.route', {
            distance: localDigits(session.req.estimatedDistance.toFixed(1)),
            eta: localDigits(session.req.estimatedDuration),
          })}
        </span>
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
          <ReasonIcon reason={lastResult.topFactor} />
          <span>{t(`reason.${lastResult.topFactor}`)}</span>
        </div>
      )}

      {/* Passenger Speech Bubble */}
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
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            {t('negotiation.passenger_offer', { fare: '' }).replace(/:\s*৳\s*$/, '')}
          </span>
          <span style={{ display: 'block', fontSize: '18px', fontWeight: 800, color: '#38bdf8' }}>
            ৳{localDigits(session.currentPassengerOffer)}
          </span>
        </div>
        <div>
          <span style={{ fontSize: '11px', color: '#94a3b8' }}>
            {t('negotiation.fair_fare', { fare: '' }).replace(/:\s*৳\s*$/, '')}
          </span>
          <span style={{ display: 'block', fontSize: '18px', fontWeight: 800, color: '#94a3b8' }}>
            ৳{localDigits(session.fairFare)}
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
          -৳{localDigits(10)}
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
          -৳{localDigits(5)}
        </button>

        <div style={{ padding: '0 14px', textAlign: 'center' }}>
          <span style={{ fontSize: '10px', color: '#94a3b8', textTransform: 'uppercase', display: 'block' }}>
            {t('negotiation.your_quote')}
          </span>
          <span style={{ fontSize: '22px', fontWeight: 800, color: '#f59e0b' }}>
            ৳{localDigits(counterAmount)}
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
          +৳{localDigits(5)}
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
          +৳{localDigits(10)}
        </button>
      </div>

      {/* Custom counteroffer: draft string while typing, clamped to >= 50 on blur / Enter / submit */}
      <label
        htmlFor="negotiation-custom-counter"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '10px',
          padding: '6px 10px',
          borderRadius: '10px',
          background: '#0f172a',
          border: '1px solid rgba(255, 255, 255, 0.15)',
        }}
      >
        <span style={{ fontSize: '12px', color: '#94a3b8', fontWeight: 600 }}>
          {t('negotiation.custom_counter').replace(/:\s*৳\s*$/, '')}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: '14px', color: '#fbbf24', fontWeight: 800 }}>৳</span>
          <input
            id="negotiation-custom-counter"
            name="customCounter"
            type="number"
            min={50}
            max={Math.max(2000, Math.round(session.fairFare * 5))}
            step={5}
            data-testid="custom-counter-input"
            aria-label={t('negotiation.custom_counter')}
            value={draftCounter}
            onInput={(e) => onDraftInput((e.target as HTMLInputElement).value)}
            onBlur={() => {
              commitDraftCounter();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                commitDraftCounter();
              }
            }}
            style={{
              width: '86px',
              padding: '4px 6px',
              borderRadius: '6px',
              background: 'rgba(30, 41, 59, 0.9)',
              border: '1px solid rgba(148, 163, 184, 0.25)',
              color: '#f8fafc',
              fontSize: '14px',
              fontWeight: 700,
              textAlign: 'right',
            }}
          />
        </div>
      </label>

      {/* Primary Action Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
        <button
          type="button"
          data-testid="accept-btn"
          data-autofocus="true"
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
          {t('negotiation.accept', { fare: localDigits(session.currentPassengerOffer) })}
        </button>

        {(() => {
          const canCounter = counterAmount > session.currentPassengerOffer;
          return (
            <button
              type="button"
              data-testid="counter-btn"
              disabled={!canCounter}
              onClick={() => {
                if (canCounter) {
                  onAction({ kind: 'counter', amount: commitDraftCounter() });
                }
              }}
              style={{
                padding: '12px',
                borderRadius: '12px',
                background: canCounter ? '#f59e0b' : 'rgba(51, 65, 85, 0.6)',
                border: 'none',
                color: canCounter ? '#0f172a' : '#94a3b8',
                fontSize: '14px',
                fontWeight: 800,
                cursor: canCounter ? 'pointer' : 'not-allowed',
                opacity: canCounter ? 1 : 0.5,
                boxShadow: canCounter ? '0 4px 12px rgba(245, 158, 11, 0.3)' : 'none',
              }}
            >
              {t('negotiation.counter', { fare: localDigits(counterAmount) })}
            </button>
          );
        })()}

        {(() => {
          const discountAmount = Math.max(50, counterAmount - 10);
          const canDiscount = discountAmount <= session.fairFare;
          return (
            <button
              type="button"
              data-testid="discount-btn"
              disabled={!canDiscount}
              onClick={() => onAction({ kind: 'discount', amount: discountAmount })}
              style={{
                padding: '9px 10px',
                borderRadius: '10px',
                background: canDiscount ? 'rgba(56, 189, 248, 0.2)' : 'rgba(30, 41, 59, 0.35)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                color: canDiscount ? '#38bdf8' : '#64748b',
                fontSize: '12px',
                fontWeight: 700,
                cursor: canDiscount ? 'pointer' : 'not-allowed',
                opacity: canDiscount ? 1 : 0.65,
              }}
            >
              {t('negotiation.discount', { fare: localDigits(discountAmount) })}
            </button>
          );
        })()}

        <button
          type="button"
          data-testid="decline-btn"
          onClick={() => onAction({ kind: 'decline' })}
          style={{
            padding: '9px 10px',
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

      {/* Secondary Negotiation Tactics */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: '8px',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          paddingTop: '8px',
        }}
      >
        {pickup && (
          <button
            type="button"
            data-testid="cross-side-btn"
            onClick={() =>
              onAction({ kind: 'pickupAdjust', walkM: pickup.walkM, savesMin: pickup.savesMin })
            }
            style={{
              padding: '7px 10px',
              borderRadius: '10px',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('negotiation.relocate', {
              walk: localDigits(Math.round(pickup.walkM)),
              min: localDigits(Math.round(pickup.savesMin)),
            })}
          </button>
        )}

        {alley && !session.alleyRefused && (
          <button
            type="button"
            data-testid="refuse-alley-btn"
            onClick={() => onAction({ kind: 'refuseAlley', walkM: alley.walkM })}
            style={{
              padding: '7px 10px',
              borderRadius: '10px',
              background: 'rgba(30, 41, 59, 0.8)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#f8fafc',
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('negotiation.refuse_alley')}
          </button>
        )}

        {(() => {
          const canExplainDetour =
            !session.detourExplained &&
            (session.ctx.hasDetour === true || session.ctx.traffic >= 0.5);
          return (
            <button
              type="button"
              data-testid="explain-detour-btn"
              disabled={!canExplainDetour}
              onClick={() => onAction({ kind: 'explainDetour', extraMin: 8 })}
              style={{
                padding: '7px 10px',
                borderRadius: '10px',
                background: canExplainDetour
                  ? 'rgba(30, 41, 59, 0.8)'
                  : 'rgba(30, 41, 59, 0.35)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: canExplainDetour ? '#f8fafc' : '#64748b',
                fontSize: '11px',
                fontWeight: 600,
                cursor: canExplainDetour ? 'pointer' : 'not-allowed',
                opacity: canExplainDetour ? 1 : 0.65,
              }}
            >
              {t('negotiation.explain_detour', { min: localDigits(8) })}
            </button>
          );
        })()}

        <button
          type="button"
          data-testid="off-app-btn"
          onClick={() => onAction({ kind: 'offApp', amount: commitDraftCounter() })}
          style={{
            padding: '7px 10px',
            borderRadius: '10px',
            background: 'rgba(234, 179, 8, 0.2)',
            border: '1px solid rgba(234, 179, 8, 0.4)',
            color: '#eab308',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t('negotiation.off_app', { fare: localDigits(counterAmount) })}
        </button>

        <button
          type="button"
          data-testid="mislead-distance-btn"
          onClick={() => onAction({ kind: 'misleadDistance' })}
          style={{
            padding: '7px 10px',
            borderRadius: '10px',
            background: 'rgba(249, 115, 22, 0.18)',
            border: '1px solid rgba(249, 115, 22, 0.4)',
            color: '#fb923c',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t('negotiation.mislead_distance')}
        </button>

        <button
          type="button"
          data-testid="pressure-btn"
          onClick={() => onAction({ kind: 'pressure', amount: commitDraftCounter() })}
          style={{
            padding: '7px 10px',
            borderRadius: '10px',
            background: 'rgba(244, 63, 94, 0.18)',
            border: '1px solid rgba(244, 63, 94, 0.4)',
            color: '#fb7185',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t('negotiation.pressure')}
        </button>
      </div>
    </ModalPanel>
  );
}
