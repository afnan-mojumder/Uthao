import type { JSX } from 'preact';
import type { RideRequest } from '../../core/types';
import { t } from '../i18n';

export interface RequestCardProps {
  request: RideRequest;
  timeoutRemaining: number; // 0..15
  onAccept: (requestId: string) => void;
  onDecline: (requestId: string) => void;
}

export function RequestCard({
  request,
  timeoutRemaining,
  onAccept,
  onDecline,
}: RequestCardProps): JSX.Element {
  const timeoutPct = Math.max(0, Math.min(100, (timeoutRemaining / 15) * 100));

  const getArchetypeIcon = () => {
    // Archetype hint icon
    if (request.specialCircumstance === 'rain') return '🌧️';
    if (request.specialCircumstance === 'luggage') return '🧳';
    if (request.specialCircumstance === 'child') return '👶';
    if (request.specialCircumstance === 'urgent') return '⚡';
    return '💼';
  };

  return (
    <div
      data-testid="request-card"
      style={{
        background: 'rgba(15, 23, 42, 0.88)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        border: '1px solid rgba(56, 189, 248, 0.25)',
        borderRadius: '16px',
        padding: '16px',
        color: '#f8fafc',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.6)',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        width: '100%',
        maxWidth: '380px',
        margin: '0 auto',
      }}
    >
      {/* Header Row: Archetype hint, Circumstance & Timer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '20px' }}>{getArchetypeIcon()}</span>
          <span style={{ fontSize: '12px', fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
            {t('phone.incoming_request')}
          </span>
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
            border: timeoutRemaining <= 4 ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(245, 158, 11, 0.3)',
          }}
        >
          {t('phone.timeout', { seconds: Math.ceil(timeoutRemaining) })}
        </span>
      </div>

      {/* Timeout Progress Bar */}
      <div
        style={{
          width: '100%',
          height: '4px',
          background: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '2px',
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

      {/* Special circumstance tag if any */}
      {request.specialCircumstance && (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '4px 10px',
            borderRadius: '8px',
            background: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            fontSize: '11px',
            color: '#fbbf24',
            fontWeight: 600,
            alignSelf: 'flex-start',
          }}
        >
          <span>{getArchetypeIcon()}</span>
          <span>{t(`phone.circumstance.${request.specialCircumstance}`)}</span>
        </div>
      )}

      {/* Route Info: Pickup -> Destination */}
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
          <span style={{ color: '#22c55e', fontSize: '14px' }}>🟢</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{t('phone.pickup')}</span>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{request.pickupNodeId}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ color: '#ef4444', fontSize: '14px' }}>🏁</span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '10px', color: '#94a3b8' }}>{t('phone.destination')}</span>
            <span style={{ fontSize: '13px', fontWeight: 600 }}>{request.destinationNodeId}</span>
          </div>
        </div>
      </div>

      {/* Metrics Row: Distance, ETA, App Fare */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', textAlign: 'center' }}>
        <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '6px', borderRadius: '8px' }}>
          <span style={{ display: 'block', fontSize: '10px', color: '#94a3b8' }}>Distance</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
            {t('phone.distance', { distance: request.estimatedDistance.toFixed(1) })}
          </span>
        </div>

        <div style={{ background: 'rgba(30, 41, 59, 0.5)', padding: '6px', borderRadius: '8px' }}>
          <span style={{ display: 'block', fontSize: '10px', color: '#94a3b8' }}>ETA</span>
          <span style={{ fontSize: '13px', fontWeight: 700, color: '#f8fafc' }}>
            {t('phone.eta', { eta: request.estimatedDuration })}
          </span>
        </div>

        <div style={{ background: 'rgba(34, 197, 94, 0.12)', border: '1px solid rgba(34, 197, 94, 0.3)', padding: '6px', borderRadius: '8px' }}>
          <span style={{ display: 'block', fontSize: '10px', color: '#86efac' }}>Fare</span>
          <span style={{ fontSize: '14px', fontWeight: 800, color: '#22c55e' }}>
            {t('phone.fare', { fare: request.initialFare })}
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
