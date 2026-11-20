import type { JSX } from 'preact';
import type { RideRequest } from '../../core/types';
import {
  IconClock,
  IconFlag,
  IconMapPin,
  IconPhone,
  IconShield,
  IconWarning,
} from '../components/icons';
import { localDigits, t } from '../i18n';

export interface RequestCardProps {
  request: RideRequest;
  timeoutRemaining: number; // 0..15
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

function resolvePlaceName(placeKey?: string): string {
  if (placeKey) {
    const translated = t(placeKey);
    if (translated && translated !== placeKey) {
      return translated;
    }
  }
  return t('phone.unknown_stop');
}

export function RequestCard({
  request,
  timeoutRemaining,
  onAccept,
  onDecline,
}: RequestCardProps): JSX.Element {
  const timeoutPct = Math.max(0, Math.min(100, (timeoutRemaining / 15) * 100));
  const isDirect = request.bookingType === 'direct';
  const pickupLabel = resolvePlaceName(request.pickupPlaceKey);
  const destinationLabel = resolvePlaceName(request.destinationPlaceKey);

  const hasSurge = request.surge > 1.01;
  const riskTier: 'low' | 'medium' | 'high' =
    request.specialCircumstance === 'urgent' || request.surge >= 1.5
      ? 'high'
      : request.specialCircumstance || hasSurge
        ? 'medium'
        : 'low';

  const riskColor =
    riskTier === 'high' ? '#f87171' : riskTier === 'medium' ? '#fbbf24' : '#34d399';
  const riskBg =
    riskTier === 'high'
      ? 'rgba(239, 68, 68, 0.16)'
      : riskTier === 'medium'
        ? 'rgba(245, 158, 11, 0.16)'
        : 'rgba(16, 185, 129, 0.14)';

  return (
    <div
      data-testid="request-card"
      style={{
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: isDirect
          ? '2px solid rgba(34, 197, 94, 0.6)'
          : '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: '16px',
        padding: '14px',
        color: '#f8fafc',
        boxShadow: isDirect
          ? '0 10px 30px rgba(34, 197, 94, 0.25)'
          : '0 10px 30px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        width: '100%',
        maxWidth: '380px',
        margin: '0 auto',
      }}
    >
      {/* Header Row: Booking badge & Timer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
          <span
            aria-hidden="true"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: isDirect ? '#22c55e' : '#38bdf8',
            }}
          >
            {isDirect ? <IconPhone size={18} /> : <IconClock size={18} />}
          </span>
          <span
            style={{
              fontSize: '12px',
              fontWeight: 700,
              color: isDirect ? '#22c55e' : '#38bdf8',
              textTransform: 'uppercase',
            }}
          >
            {isDirect
              ? t('phone.contacts.incoming_call')
              : t('phone.incoming_request')}
          </span>
          {isDirect && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                color: '#15803d',
                background: '#86efac',
                padding: '2px 6px',
                borderRadius: '6px',
              }}
            >
              {t('phone.contacts.zero_commission')}
            </span>
          )}
        </div>

        {/* 15s Countdown Badge */}
        <span
          data-testid="request-timeout-text"
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: timeoutRemaining <= 4 ? '#ef4444' : '#f59e0b',
            background: 'rgba(0, 0, 0, 0.4)',
            padding: '4px 8px',
            borderRadius: '8px',
            border:
              timeoutRemaining <= 4
                ? '1px solid rgba(239, 68, 68, 0.4)'
                : '1px solid rgba(245, 158, 11, 0.3)',
            whiteSpace: 'nowrap',
          }}
        >
          {t('phone.timeout', { seconds: localDigits(Math.ceil(timeoutRemaining)) })}
        </span>
      </div>

      {/* Live Countdown Bar */}
      <div
        data-testid="request-timeout-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={15}
        aria-valuenow={Math.max(0, Math.round(timeoutRemaining))}
        style={{
          width: '100%',
          height: '5px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '3px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${timeoutPct}%`,
            height: '100%',
            background: timeoutRemaining <= 4 ? '#ef4444' : '#22c55e',
            transition: 'width 0.2s linear',
          }}
        />
      </div>

      {/* Risk / Surge / Circumstance Badges */}
      <div
        data-testid="request-risk-badges"
        style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '3px 8px',
            borderRadius: '9999px',
            background: riskBg,
            border: `1px solid ${riskColor}55`,
            fontSize: '11px',
            color: riskColor,
            fontWeight: 700,
          }}
        >
          {riskTier === 'high' ? <IconWarning size={12} /> : <IconShield size={12} />}
          <span>{t(`phone.risk.${riskTier}`)}</span>
        </span>

        {hasSurge && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '9999px',
              background: 'rgba(56, 189, 248, 0.15)',
              border: '1px solid rgba(56, 189, 248, 0.35)',
              fontSize: '11px',
              color: '#38bdf8',
              fontWeight: 700,
            }}
          >
            {t('phone.risk.surge', { surge: localDigits(request.surge.toFixed(2)) })}
          </span>
        )}

        {request.specialCircumstance && (
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '3px 8px',
              borderRadius: '9999px',
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.35)',
              fontSize: '11px',
              color: '#fbbf24',
              fontWeight: 600,
            }}
          >
            <IconWarning size={12} />
            <span>{t(`phone.circumstance.${request.specialCircumstance}`)}</span>
          </span>
        )}
      </div>

      {/* Route Info: Localized Pickup -> Destination (never raw node IDs) */}
      <div
        style={{
          background: 'rgba(30, 41, 59, 0.6)',
          borderRadius: '12px',
          padding: '10px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          border: '1px solid rgba(255, 255, 255, 0.06)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#22c55e', display: 'inline-flex' }} aria-hidden="true">
            <IconMapPin size={15} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{t('phone.pickup')}</span>
            <span data-testid="request-pickup-label" style={{ fontSize: '13px', fontWeight: 600 }}>
              {pickupLabel}
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#ef4444', display: 'inline-flex' }} aria-hidden="true">
            <IconFlag size={15} />
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{t('phone.destination')}</span>
            <span data-testid="request-destination-label" style={{ fontSize: '13px', fontWeight: 600 }}>
              {destinationLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Metrics Row: Distance, ETA, App Fare */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '6px', borderRadius: '8px' }}>
          <span style={{ display: 'block', fontSize: '10px', color: '#94a3b8' }}>
            {t('phone.metrics.distance')}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
            {t('phone.distance', { distance: localDigits(request.estimatedDistance.toFixed(1)) })}
          </span>
        </div>

        <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '6px', borderRadius: '8px' }}>
          <span style={{ display: 'block', fontSize: '10px', color: '#94a3b8' }}>
            {t('phone.metrics.eta')}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
            {t('phone.eta', { eta: localDigits(request.estimatedDuration) })}
          </span>
        </div>

        <div
          style={{
            background: 'rgba(34, 197, 94, 0.12)',
            border: '1px solid rgba(34, 197, 94, 0.3)',
            padding: '6px',
            borderRadius: '8px',
          }}
        >
          <span style={{ display: 'block', fontSize: '10px', color: '#86efac' }}>
            {t('phone.metrics.fare')}
          </span>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#22c55e' }}>
            {t('phone.fare', { fare: localDigits(request.initialFare) })}
          </span>
        </div>
      </div>

      {/* Action Buttons: Accept / Decline */}
      <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
        <button
          type="button"
          data-testid="decline-request"
          onClick={() => onDecline(request.requestId)}
          style={{
            flex: 1,
            padding: '10px',
            borderRadius: '10px',
            background: 'rgba(239, 68, 68, 0.2)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            color: '#ef4444',
            fontSize: '13px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.2s',
          }}
        >
          {t('phone.decline')}
        </button>

        <button
          type="button"
          data-testid="accept-request"
          onClick={() => onAccept(request.requestId)}
          style={{
            flex: 2,
            padding: '10px',
            borderRadius: '10px',
            background: '#22c55e',
            border: 'none',
            color: '#0f172a',
            fontSize: '13px',
            fontWeight: 800,
            cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(34, 197, 94, 0.4)',
            transition: 'transform 0.1s',
          }}
        >
          {t('phone.accept')}
        </button>
      </div>
    </div>
  );
}
