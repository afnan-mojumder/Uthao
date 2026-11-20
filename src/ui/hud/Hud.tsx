import type { JSX } from 'preact';
import { passengerHintKey } from './passengerHint';
import { t } from '../i18n';
import {
  hudSignal,
  settingsSignal,
  onRefuelCallback,
  onFuelRescueCallback,
  onChargePhoneCallback,
  type HudState,
  type HudPassengerInfo,
  type HudNavigationTurn,
  type HudMissionInfo,
} from '../store';
import {
  IconChat,
  IconFuel,
  IconFullscreen,
  IconMotorcycle,
  IconUser,
  IconWarning,
} from '../components/icons';
import { BALANCE } from '../../config/balance';

export type { HudState, HudPassengerInfo, HudNavigationTurn, HudMissionInfo };

function turnDirectionIcon(direction: string): string {
  switch (direction) {
    case 'left':
      return '↰';
    case 'right':
      return '↱';
    case 'uturn':
      return '↶';
    default:
      return '↑';
  }
}

async function handleToggleFullscreenAndLock(): Promise<void> {
  try {
    if (typeof document === 'undefined') return;
    if (!document.fullscreenElement) {
      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
      try {
        if (typeof screen !== 'undefined' && 'orientation' in screen && screen.orientation) {
          await (screen.orientation as unknown as { lock: (mode: string) => Promise<void> }).lock('landscape');
        }
      } catch {
        // screen orientation lock optional or rejected on unsupported platforms
      }
    } else {
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      }
    }
  } catch {
    // fullscreen request optional
  }
}

const fuelBtnStyle = {
  pointerEvents: 'auto' as const,
  marginTop: '6px',
  background: 'rgba(15, 23, 42, 0.88)',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  borderRadius: '10px',
  color: '#f8fafc',
  padding: '6px 10px',
  fontSize: '13px',
  fontWeight: 700,
  cursor: 'pointer',
  minHeight: '36px',
};

/** Only renders actions that really exist right now: refuel needs a station nearby,
 * rescue needs a (nearly) empty tank. Both dispatch Commands; the UI never mutates state. */
function FuelActions({ state }: { state: HudState }): JSX.Element | null {
  const canRescue = state.fuelL < BALANCE.FUEL.rescueBelowL;
  const canRefuel = !!state.nearStation && state.fuelL < state.fuelMaxL - 0.5;
  const worn = (state.conditionPct ?? 100) < BALANCE.WEAR.warnBelow;
  const canCharge = !!state.chargeSpot;
  if (!canRescue && !canRefuel && !worn && !canCharge) return null;
  return (
    <div data-testid="hud-fuel-actions" style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
      {canRescue && (
        <div data-testid="hud-fuel-empty" style={{ color: 'var(--danger-red, #EF4444)', fontSize: '13px', fontWeight: 700 }}>
          {t('hud.fuel_empty')}
        </div>
      )}
      {worn && (
        <div data-testid="hud-bike-warn" style={{ color: 'var(--dhaka-amber, #F59E0B)', fontSize: '13px', fontWeight: 700 }}>
          {t('hud.bike_warn')}
        </div>
      )}
      {canRefuel && (
        <button data-testid="hud-btn-refuel" style={fuelBtnStyle} onClick={() => onRefuelCallback?.()}>
          {t('hud.refuel')}
        </button>
      )}
      {canCharge && (
        <button data-testid="hud-btn-charge-phone" style={fuelBtnStyle} onClick={() => onChargePhoneCallback?.(state.chargeSpot!)}>
          {t('hud.charge_phone')}
        </button>
      )}
      {canRescue && (
        <button data-testid="hud-btn-fuel-rescue" style={fuelBtnStyle} onClick={() => onFuelRescueCallback?.()}>
          {t('hud.fuel_rescue', { cost: BALANCE.FUEL.rescue.cost, min: BALANCE.FUEL.rescue.waitMin })}
        </button>
      )}
    </div>
  );
}

export function HudView({ state }: { state: HudState }): JSX.Element {
  const fuelPct = Math.max(0, Math.min(100, Math.round((state.fuelL / (state.fuelMaxL || 8)) * 100)));
  const isLowFuel = fuelPct <= 20;

  // 1. Collapsed Dashboard for First-Person Helmet/Handlebar View
  if (state.isFirstPerson) {
    return (
      <div
        id="hud"
        data-testid="hud-first-person"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: 'calc(16px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) calc(16px + env(safe-area-inset-bottom, 0px)) calc(16px + env(safe-area-inset-left, 0px))',
          boxSizing: 'border-box',
          fontFamily: "var(--font-sans, 'Hind Siliguri', 'Segoe UI', system-ui, sans-serif)",
          color: '#f8fafc',
          userSelect: 'none',
        }}
      >
        {/* Hidden objective and speed for test contract compatibility */}
        <div id="hud-objective" style={{ display: 'none' }}>
          {state.objectiveText}
        </div>

        {/* Passenger Dialogue Subtitle Bubble */}
        {state.dialogueSubtitle && (
          <div
            data-testid="hud-dialogue-subtitle"
            style={{
              alignSelf: 'center',
              marginBottom: '12px',
              background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
              border: '1px solid rgba(56, 189, 248, 0.4)',
              borderRadius: '16px',
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
              maxWidth: '650px',
              pointerEvents: 'auto',
              backdropFilter: 'blur(10px)',
            }}
          >
            <IconChat size={20} color="#38bdf8" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {state.dialogueSubtitle.speaker && (
                <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 800 }}>
                  {t(state.dialogueSubtitle.speaker)}
                </span>
              )}
              <span
                style={{
                  fontSize: settingsSignal.value.subtitlesSize === 'large' ? '18px' : '15px',
                  color: '#f8fafc',
                  fontWeight: 600,
                }}
              >
                {state.dialogueSubtitle.text}
              </span>
            </div>
          </div>
        )}

        {/* Compact Instrument Pod on Handlebars */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.92)',
            border: '2px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '20px',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(8px)',
          }}
        >
          {/* Speed */}
          <div style={{ textAlign: 'center' }}>
            <div
              id="hud-speed"
              style={{
                fontSize: '32px',
                fontWeight: 900,
                lineHeight: 1,
                color: '#ffffff',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Math.round(state.speedKmh)}
            </div>
            <div style={{ fontSize: '14px', color: '#94a3b8', letterSpacing: '1px', fontWeight: 700 }}>
              {t('hud.speed_unit')}
            </div>
          </div>

          <div style={{ width: '1px', height: '36px', background: 'rgba(255, 255, 255, 0.15)' }} />

          {/* Compact Fuel Pod */}
          <div style={{ minWidth: '90px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', fontSize: '14px', fontWeight: 700, color: isLowFuel ? 'var(--danger-red, #EF4444)' : '#94a3b8' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <IconFuel size={14} /> {t('hud.fuel')}
              </span>
              <span>{fuelPct}%</span>
            </div>
            <div style={{ height: '8px', width: '100%', background: 'rgba(255, 255, 255, 0.15)', borderRadius: '4px', marginTop: '4px', overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${fuelPct}%`,
                  background: isLowFuel ? 'var(--danger-red, #EF4444)' : 'linear-gradient(90deg, var(--uthao-green, #22C55E), #06b6d4)',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
            <FuelActions state={state} />
          </div>

          {/* Turn Guidance */}
          {state.nextTurn && (
            <>
              <div style={{ width: '1px', height: '36px', background: 'rgba(255, 255, 255, 0.15)' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontWeight: 700, color: '#38bdf8' }}>
                <span style={{ fontSize: '18px' }}>
                  {turnDirectionIcon(state.nextTurn.direction)}
                </span>
                <span>{state.nextTurn.text}</span>
              </div>
            </>
          )}

          {/* Earnings */}
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--uthao-green, #22C55E)' }}>
              ৳{Math.round(state.todayNetEarnings)}
            </div>
            <div style={{ fontSize: '14px', color: '#94a3b8' }}>
              {state.shiftClock}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. Full Standard Third-Person Riding HUD
  return (
    <div
      id="hud"
      data-testid="hud"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: 'calc(16px + env(safe-area-inset-top, 0px)) calc(16px + env(safe-area-inset-right, 0px)) calc(16px + env(safe-area-inset-bottom, 0px)) calc(16px + env(safe-area-inset-left, 0px))',
        boxSizing: 'border-box',
        fontFamily: "var(--font-sans, 'Hind Siliguri', 'Segoe UI', system-ui, sans-serif)",
        color: '#f8fafc',
        userSelect: 'none',
      }}
    >
      {/* Top Header Bar: Minimap Anchor (Left), Objective (Center), Earnings, Clock & Fullscreen (Right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
        {/* Top-Left: Minimap Container Anchor & Next Turn */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div
            id="minimap-container"
            style={{
              width: '160px',
              height: '160px',
              position: 'relative',
              borderRadius: '50%',
              overflow: 'hidden',
            }}
          />

          {/* Next Turn Instruction Pill */}
          {state.nextTurn && (
            <div
              style={{
                alignSelf: 'flex-start',
                background: 'rgba(15, 23, 42, 0.88)',
                border: '1px solid rgba(56, 189, 248, 0.4)',
                backdropFilter: 'blur(8px)',
                borderRadius: '12px',
                padding: '8px 14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 700,
                color: '#38bdf8',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              }}
            >
              <span style={{ fontSize: '18px' }}>
                {turnDirectionIcon(state.nextTurn.direction)}
              </span>
              <span>{state.nextTurn.text}</span>
            </div>
          )}
        </div>

        {/* Top-Center: Objective & Fare Banner */}
        <div
          style={{
            alignSelf: 'center',
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(16, 185, 129, 0.6)',
            borderRadius: '16px',
            padding: '12px 24px',
            color: '#ffffff',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
            textAlign: 'center',
            backdropFilter: 'blur(8px)',
            maxWidth: '380px',
          }}
        >
          <div
            style={{
              fontSize: '14px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              color: 'var(--uthao-green, #22C55E)',
              fontWeight: 800,
              marginBottom: '2px',
            }}
          >
            {t('hud.objective')}
          </div>
          <div id="hud-objective" style={{ fontSize: '16px', fontWeight: 700, lineHeight: 1.3 }}>
            {state.objectiveText}
          </div>
          {state.fare !== undefined && (
            <div style={{ fontSize: '14px', color: '#fbbf24', marginTop: '3px', fontWeight: 700 }}>
              {t('hud.fare', { fare: state.fare })}
            </div>
          )}
          {state.activeMission && (
            <div
              data-testid="hud-active-mission"
              style={{
                marginTop: '6px',
                paddingTop: '6px',
                borderTop: '1px solid rgba(255, 255, 255, 0.14)',
                fontSize: '13px',
                color: '#cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                gap: '2px',
              }}
            >
              <div style={{ color: '#38bdf8', fontWeight: 700 }}>
                {t(state.activeMission.titleKey)}
              </div>
              <div>
                {t(state.activeMission.objectiveDescKey)} ({state.activeMission.progress}/{state.activeMission.target})
                {state.activeMission.targetDistM !== undefined && (
                  <span style={{ color: '#fbbf24', marginLeft: '6px', fontWeight: 700 }}>
                    • {Math.round(state.activeMission.targetDistM)}m
                  </span>
                )}
              </div>
            </div>
          )}
          {state.activeSideMissions && state.activeSideMissions.length > 0 && (
            <div
              data-testid="hud-active-side-missions"
              style={{
                marginTop: '6px',
                paddingTop: '6px',
                borderTop: '1px solid rgba(255, 255, 255, 0.14)',
                fontSize: '12px',
                color: '#cbd5e1',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
              }}
            >
              {state.activeSideMissions.map((sm) => (
                <div
                  key={sm.id ?? sm.titleKey}
                  data-testid={sm.id ? `hud-side-mission-${sm.id}` : 'hud-side-mission'}
                >
                  <div style={{ color: '#fbbf24', fontWeight: 700 }}>
                    {t(sm.titleKey)}
                  </div>
                  <div>
                    {t(sm.objectiveDescKey)} ({sm.progress}/{sm.target})
                    {sm.targetDistM !== undefined && (
                      <span style={{ color: '#38bdf8', marginLeft: '6px', fontWeight: 700 }}>
                        • {Math.round(sm.targetDistM)}m
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {state.roadEventAlert && (
            <div
              data-testid="hud-road-event"
              style={{
                marginTop: '6px',
                padding: '4px 10px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.2)',
                border: '1px solid rgba(245, 158, 11, 0.45)',
                color: '#fde68a',
                fontSize: '12px',
                fontWeight: 700,
              }}
            >
              {t('hud.road_event')}: {state.roadEventAlert.title}
            </div>
          )}
        </div>

        {/* Top-Right: Fullscreen button, Earnings, Rating & Shift Clock */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
          {/* Fullscreen & Orientation Lock Button */}
          <button
            data-testid="hud-btn-fullscreen"
            onClick={handleToggleFullscreenAndLock}
            style={{
              pointerEvents: 'auto',
              background: 'rgba(15, 23, 42, 0.88)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '12px',
              color: '#f8fafc',
              padding: '8px 14px',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              minHeight: '40px',
            }}
            title="Fullscreen & Landscape Lock"
          >
            <IconFullscreen size={15} /> {t('hud.fullscreen') || 'পূর্ণপর্দা'}
          </button>

          {/* Earnings Badge */}
          <div
            data-testid="hud-earnings"
            style={{
              background: 'rgba(15, 23, 42, 0.88)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(8px)',
              borderRadius: '12px',
              padding: '8px 16px',
              textAlign: 'right',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ fontSize: '14px', textTransform: 'uppercase', color: '#94a3b8', fontWeight: 700 }}>
              {t('hud.earnings', { amount: '' }).replace(/: ৳/, '')}
            </div>
            <div style={{ fontSize: '20px', fontWeight: 900, color: 'var(--uthao-green, #22C55E)', lineHeight: 1.2 }}>
              ৳{Math.round(state.todayNetEarnings)}
            </div>
          </div>

          {/* Rating & Shift Clock Badge */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.88)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(8px)',
              borderRadius: '12px',
              padding: '8px 14px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              fontSize: '14px',
              fontWeight: 700,
            }}
          >
            <span style={{ color: 'var(--dhaka-amber, #F59E0B)' }}>
              ★ {state.rating ? state.rating.toFixed(1) : '5.0'}
            </span>
            <span style={{ color: '#475569' }}>|</span>
            <span style={{ color: '#e2e8f0' }}>
              {state.shiftClock || '07:30'} • {t('hud.day', { day: state.shiftDay || 1 })}
            </span>
          </div>
        </div>
      </div>

      {/* Passenger Dialogue Subtitle Bubble */}
      {state.dialogueSubtitle && (
        <div
          data-testid="hud-dialogue-subtitle"
          style={{
            alignSelf: 'center',
            marginBottom: '16px',
            background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
            border: '1px solid rgba(56, 189, 248, 0.4)',
            borderRadius: '16px',
            padding: '10px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
            maxWidth: '650px',
            pointerEvents: 'auto',
            backdropFilter: 'blur(10px)',
          }}
        >
          <IconChat size={20} color="#38bdf8" />
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {state.dialogueSubtitle.speaker && (
              <span style={{ fontSize: '12px', color: '#38bdf8', fontWeight: 800 }}>
                {t(state.dialogueSubtitle.speaker)}
              </span>
            )}
            <span
              style={{
                fontSize: settingsSignal.value.subtitlesSize === 'large' ? '18px' : '15px',
                color: '#f8fafc',
                fontWeight: 600,
              }}
            >
              {state.dialogueSubtitle.text}
            </span>
          </div>
        </div>
      )}

      {/* Bottom Bar: Passenger Chip (Left) & Speedometer / Fuel Cluster (Right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', width: '100%' }}>
        {/* Bottom-Left: Passenger Status Chip */}
        <div
          data-testid="hud-passenger-status"
          style={{
            background: 'rgba(15, 23, 42, 0.88)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(8px)',
            borderRadius: '16px',
            padding: '12px 20px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            boxShadow: '0 6px 20px rgba(0, 0, 0, 0.5)',
          }}
        >
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              background: '#334155',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid #38bdf8',
            }}
          >
            {state.passengerStatus?.status === 'OnTrip' ? (
              <IconUser size={20} color="#f8fafc" />
            ) : (
              <IconMotorcycle size={20} color="#38bdf8" />
            )}
          </div>
          <div>
            <div style={{ fontSize: '15px', fontWeight: 800, color: '#f8fafc' }}>
              {state.passengerStatus?.name || (state.passengerStatus?.status === 'OnTrip' ? t('hud.passenger.on_bike') : t('hud.passenger.waiting'))}
            </div>
            <div style={{ fontSize: '14px', color: '#94a3b8', fontWeight: 600 }}>
              {t(passengerHintKey(state.passengerStatus?.status))}
              {state.etaMinutes !== undefined && ` • ${t('hud.eta', { min: state.etaMinutes })}`}
            </div>
          </div>
        </div>

        {/* Bottom-Right: Speedometer, Gear & Fuel Gauge Pod */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.9)',
            border: '1px solid rgba(51, 65, 85, 0.8)',
            borderRadius: '18px',
            padding: '16px 24px',
            color: '#ffffff',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
            textAlign: 'right',
            minWidth: '160px',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          {/* Speed & Gear */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '16px' }}>
            <span
              style={{
                fontSize: '15px',
                fontWeight: 800,
                color: '#38bdf8',
                background: 'rgba(56, 189, 248, 0.15)',
                padding: '3px 10px',
                borderRadius: '6px',
              }}
            >
              {state.gear !== undefined ? `G${state.gear}` : 'D'}
            </span>
            <div>
              <div
                id="hud-speed"
                style={{
                  fontSize: '44px',
                  fontWeight: 900,
                  lineHeight: 1,
                  color: '#ffffff',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {Math.round(state.speedKmh)}
              </div>
              <div
                style={{
                  fontSize: '14px',
                  letterSpacing: '1px',
                  color: '#94a3b8',
                  fontWeight: 700,
                  marginTop: '2px',
                }}
              >
                {t('hud.speed_unit')}
              </div>
            </div>
          </div>

          <FuelActions state={state} />
          {/* Fuel Level Bar */}
          <div style={{ width: '100%', marginTop: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: '14px', color: isLowFuel ? 'var(--danger-red, #EF4444)' : '#94a3b8', fontWeight: 700 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                {isLowFuel ? <IconWarning size={14} color="var(--danger-red, #EF4444)" /> : <IconFuel size={14} />}
                {isLowFuel ? t('hud.fuel_low') : t('hud.fuel')}
              </span>
              <span>{fuelPct}% ({state.fuelL.toFixed(1)}L)</span>
            </div>
            <div
              style={{
                height: '8px',
                width: '100%',
                background: 'rgba(255, 255, 255, 0.15)',
                borderRadius: '4px',
                overflow: 'hidden',
                marginTop: '4px',
              }}
            >
              <div
                data-testid="hud-fuel-bar"
                style={{
                  height: '100%',
                  width: `${fuelPct}%`,
                  background: isLowFuel
                    ? 'var(--danger-red, #EF4444)'
                    : 'linear-gradient(90deg, var(--uthao-green, #22C55E) 0%, #06b6d4 100%)',
                  transition: 'width 0.25s ease',
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Reactive HUD panel mounted inside the single `<App />` Preact root. */
export function Hud(): JSX.Element {
  return <HudView state={hudSignal.value} />;
}
