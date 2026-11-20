import { ModalPanel, StatusBar } from '../components';
import { IconCheck, IconShield, IconStar, IconWarning } from '../components/icons';
import { t, localDigits } from '../i18n';
import { CHARACTERS } from '../../sim/passenger/PassengerAI';
import type { KarmaEvent, MeterId } from '../../sim/reputation/ReputationSystem';
import { Z_LAYER, type KarmaPanelData } from '../store';

export interface KarmaPanelProps {
  isOpen?: boolean;
  data: KarmaPanelData | null;
  relationships?: Record<string, number>;
  onClose: () => void;
  zIndex?: number;
}

const PUBLIC_METERS: MeterId[] = [
  'riderIntegrity',
  'publicReputation',
  'platformStanding',
  'safetyRecord',
];

const EXPOSURE_METERS: MeterId[] = ['criminalExposure', 'evidenceExposure'];

function meterTone(id: MeterId, value: number): 'green' | 'amber' | 'red' | 'sky' {
  if (id === 'criminalExposure' || id === 'evidenceExposure') {
    return value >= 50 ? 'red' : 'amber';
  }
  if (value >= 65) return 'green';
  if (value >= 35) return 'amber';
  return 'red';
}

function resolvePassengerName(passengerId: string): string {
  const direct = CHARACTERS.find((c) => c.id === passengerId);
  if (direct) return t(direct.nameKey);
  if (passengerId.startsWith('p_')) {
    const charKey = `char_${passengerId.slice(2)}`;
    const matched = CHARACTERS.find((c) => c.id === charKey);
    if (matched) return t(matched.nameKey);
  }
  return t('karma.passenger_unknown', { id: passengerId });
}

function formatEventClock(minutes: number): string {
  const m = Math.max(0, Math.floor(minutes)) % (24 * 60);
  const hh = String(Math.floor(m / 60)).padStart(2, '0');
  const mm = String(m % 60).padStart(2, '0');
  return localDigits(`${hh}:${mm}`);
}

function renderEventIcon(ev: KarmaEvent) {
  const isExposure = ev.meter === 'criminalExposure' || ev.meter === 'evidenceExposure';
  const isPositive = isExposure ? ev.applied <= 0 : ev.applied >= 0;
  if (isExposure) {
    return <IconWarning size={16} color={ev.applied > 0 ? '#EF4444' : '#22C55E'} />;
  }
  if (isPositive) {
    return ev.applied >= 5 ? (
      <IconStar size={16} color="#22C55E" />
    ) : (
      <IconCheck size={16} color="#22C55E" />
    );
  }
  return <IconWarning size={16} color="#F59E0B" />;
}

/** Modal panel showing the player's karma meters, passenger trust, and recent karma ledger. */
export function KarmaPanel({
  isOpen = true,
  data,
  onClose,
  zIndex = Z_LAYER.PANEL,
}: KarmaPanelProps) {
  if (!isOpen || !data) return null;

  const visibleExposureMeters = EXPOSURE_METERS.filter((m) => (data.meters[m] ?? 0) > 0);
  const trustEntries = Object.entries(data.passengerTrust)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const recentEvents = data.karmaLog.slice(0, 20);

  return (
    <ModalPanel
      testId="karma-panel"
      title={t('karma.title')}
      subtitle={t('karma.subtitle', { day: localDigits(data.day) })}
      onClose={onClose}
      closeLabel={t('btn_close')}
      zIndex={zIndex}
      maxWidth="min(680px, 94vw)"
      panelStyle={{ maxHeight: '90dvh', overflowY: 'auto' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {/* Account & Promise Summary Strip */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 12px',
            borderRadius: '10px',
            backgroundColor: data.appSuspended
              ? 'rgba(239, 68, 68, 0.14)'
              : data.appWarned
                ? 'rgba(245, 158, 11, 0.14)'
                : 'rgba(34, 197, 94, 0.12)',
            border: `1px solid ${
              data.appSuspended
                ? 'rgba(239, 68, 68, 0.4)'
                : data.appWarned
                  ? 'rgba(245, 158, 11, 0.4)'
                  : 'rgba(34, 197, 94, 0.35)'
            }`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 700 }}>
            <IconShield
              size={16}
              color={data.appSuspended ? '#EF4444' : data.appWarned ? '#F59E0B' : '#22C55E'}
            />
            <span>
              {data.appSuspended
                ? t('karma.app_suspended', { day: localDigits(data.appSuspendedUntilDay) })
                : data.appWarned
                  ? t('karma.app_warned')
                  : t('karma.app_clear')}
            </span>
          </div>
          <span style={{ fontSize: '12px', color: 'var(--uthao-text-muted, #94A3B8)', fontWeight: 600 }}>
            {t('karma.promises_summary', {
              kept: localDigits(data.promises.kept),
              broken: localDigits(data.promises.broken),
            })}
          </span>
        </div>

        {/* Bounded 0..100 Karma Meters */}
        <section data-testid="karma-meters">
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--uthao-text-muted, #94A3B8)',
              marginBottom: '8px',
            }}
          >
            {t('karma.meters_title')}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
              gap: '10px',
            }}
          >
            {PUBLIC_METERS.map((meterId) => {
              const val = Math.max(0, Math.min(100, Math.round(data.meters[meterId] ?? 0)));
              return (
                <div
                  key={meterId}
                  data-testid={`karma-meter-${meterId}`}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '10px',
                    backgroundColor: 'rgba(30, 41, 59, 0.72)',
                    border: '1px solid rgba(148, 163, 184, 0.16)',
                  }}
                >
                  <StatusBar
                    label={t(`karma.meter.${meterId}`)}
                    value={val}
                    max={100}
                    tone={meterTone(meterId, val)}
                    valueText={`${localDigits(val)}/${localDigits(100)}`}
                  />
                </div>
              );
            })}
          </div>

          {/* Exposure meters remain hidden until > 0 */}
          {visibleExposureMeters.length > 0 && (
            <div style={{ marginTop: '12px' }}>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  color: '#FCA5A5',
                  marginBottom: '8px',
                }}
              >
                {t('karma.exposure_warning')}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '10px',
                }}
              >
                {visibleExposureMeters.map((meterId) => {
                  const val = Math.max(0, Math.min(100, Math.round(data.meters[meterId] ?? 0)));
                  return (
                    <div
                      key={meterId}
                      data-testid={`karma-meter-${meterId}`}
                      style={{
                        padding: '10px 12px',
                        borderRadius: '10px',
                        backgroundColor: 'rgba(127, 29, 29, 0.28)',
                        border: '1px solid rgba(239, 68, 68, 0.4)',
                      }}
                    >
                      <StatusBar
                        label={t(`karma.meter.${meterId}`)}
                        value={val}
                        max={100}
                        tone={meterTone(meterId, val)}
                        valueText={`${localDigits(val)}/${localDigits(100)}`}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Passenger Trust Summary */}
        <section data-testid="karma-passenger-trust">
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--uthao-text-muted, #94A3B8)',
              marginBottom: '8px',
            }}
          >
            {t('karma.passenger_trust_title')}
          </div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '8px',
            }}
          >
            {trustEntries.map(([id, score]) => {
              const clamped = Math.max(0, Math.min(100, Math.round(score)));
              return (
                <div
                  key={id}
                  data-testid={`karma-trust-${id}`}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '8px',
                    backgroundColor: 'rgba(30, 41, 59, 0.58)',
                    border: '1px solid rgba(148, 163, 184, 0.14)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '13px',
                  }}
                >
                  <span style={{ fontWeight: 600 }}>{resolvePassengerName(id)}</span>
                  <span
                    style={{
                      fontWeight: 700,
                      color: clamped >= 60 ? '#4ADE80' : clamped >= 35 ? '#FBBF24' : '#F87171',
                    }}
                  >
                    {localDigits(clamped)}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        {/* Recent 20 Karma Events Ledger */}
        <section data-testid="karma-events-list">
          <div
            style={{
              fontSize: '12px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              color: 'var(--uthao-text-muted, #94A3B8)',
              marginBottom: '8px',
            }}
          >
            {t('karma.events_title')}
          </div>

          {recentEvents.length === 0 ? (
            <div
              style={{
                padding: '16px',
                borderRadius: '10px',
                backgroundColor: 'rgba(30, 41, 59, 0.5)',
                color: 'var(--uthao-text-muted, #94A3B8)',
                fontSize: '13px',
                textAlign: 'center',
              }}
            >
              {t('karma.log_empty')}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {recentEvents.map((ev) => {
                const sign = ev.applied > 0 ? '+' : ev.applied < 0 ? '-' : '';
                const absVal = Math.abs(Math.round(ev.applied));
                const isExposure =
                  ev.meter === 'criminalExposure' || ev.meter === 'evidenceExposure';
                const badgeColor =
                  ev.applied === 0
                    ? '#94A3B8'
                    : isExposure
                      ? ev.applied > 0
                        ? '#F87171'
                        : '#4ADE80'
                      : ev.applied > 0
                        ? '#4ADE80'
                        : '#F87171';

                return (
                  <div
                    key={ev.id}
                    data-testid="karma-event-item"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '8px 10px',
                      borderRadius: '8px',
                      backgroundColor: 'rgba(30, 41, 59, 0.58)',
                      border: '1px solid rgba(148, 163, 184, 0.14)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      {renderEventIcon(ev)}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: 600 }}>
                          {t(ev.reasonKey)}
                        </div>
                        <div style={{ fontSize: '11px', color: '#94A3B8' }}>
                          {t(`karma.meter.${ev.meter}`)} •{' '}
                          {t('karma.event_time', {
                            day: localDigits(ev.day),
                            time: formatEventClock(ev.minute),
                          })}
                        </div>
                      </div>
                    </div>
                    <span
                      style={{
                        fontWeight: 700,
                        fontSize: '13px',
                        color: badgeColor,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {sign}
                      {localDigits(absVal)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </ModalPanel>
  );
}
