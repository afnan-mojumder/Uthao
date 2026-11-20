import type { JSX, Ref } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { passengerHintKey } from './passengerHint';
import { t, localDigits } from '../i18n';
import {
  hudSignal,
  minimapCanvasSignal,
  settingsSignal,
  onRefuelCallback,
  onFuelRescueCallback,
  onChargePhoneCallback,
  onRecoverBikeCallback,
  type HudState,
  type HudPassengerInfo,
  type HudNavigationTurn,
  type HudMissionInfo,
} from '../store';
import { CharacterPortrait } from '../components';
import {
  IconChat,
  IconFuel,
  IconFullscreen,
  IconMapPin,
  IconMotorcycle,
  IconStar,
  IconTurnLeft,
  IconTurnRight,
  IconTurnStraight,
  IconTurnUTurn,
  IconUser,
  IconWarning,
  IconWrench,
} from '../components/icons';
import { BALANCE } from '../../config/balance';
import { isTouchDevice } from '../touch/TouchActions';

export type { HudState, HudPassengerInfo, HudNavigationTurn, HudMissionInfo };

function TurnDirectionIcon({ direction, size = 18 }: { direction: string; size?: number }): JSX.Element {
  let icon: JSX.Element;
  switch (direction) {
    case 'left':
      icon = <IconTurnLeft size={size} color="var(--info-sky, #38BDF8)" />;
      break;
    case 'right':
      icon = <IconTurnRight size={size} color="var(--info-sky, #38BDF8)" />;
      break;
    case 'uturn':
      icon = <IconTurnUTurn size={size} color="var(--dhaka-amber, #F59E0B)" />;
      break;
    default:
      icon = <IconTurnStraight size={size} color="var(--info-sky, #38BDF8)" />;
      break;
  }
  return (
    <span
      data-testid="hud-turn-icon"
      data-direction={direction}
      style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
    >
      {icon}
    </span>
  );
}

function moodMeta(mood: number | undefined): { key: string; color: string } {
  if (mood === undefined) return { key: 'hud.mood.neutral', color: 'var(--info-sky, #38BDF8)' };
  if (mood >= 0.7) return { key: 'hud.mood.happy', color: 'var(--uthao-green, #22C55E)' };
  if (mood >= 0.35) return { key: 'hud.mood.neutral', color: 'var(--info-sky, #38BDF8)' };
  if (mood >= 0.15) return { key: 'hud.mood.tense', color: 'var(--dhaka-amber, #F59E0B)' };
  return { key: 'hud.mood.angry', color: 'var(--danger-red, #EF4444)' };
}

function conditionColor(pct: number): string {
  if (pct >= 70) return 'var(--uthao-green, #22C55E)';
  if (pct >= BALANCE.WEAR.warnBelow) return 'var(--dhaka-amber, #F59E0B)';
  return 'var(--danger-red, #EF4444)';
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

const quickBtnStyle = {
  pointerEvents: 'auto' as const,
  background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
  border: '1px solid var(--border-strong, rgba(148, 163, 184, 0.35))',
  borderRadius: '10px',
  color: 'var(--text-primary, #F8FAFC)',
  padding: '6px 10px',
  fontSize: '12px',
  fontWeight: 700,
  cursor: 'pointer',
  minHeight: '36px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '6px',
  whiteSpace: 'nowrap' as const,
};

/** Renders contextual fuel/charge alerts and quick actions (refuel, rescue, charge, recover bike). */
function QuickActions({ state, compact = false }: { state: HudState; compact?: boolean }): JSX.Element {
  const canRescue = state.fuelL < BALANCE.FUEL.rescueBelowL;
  const canRefuel = !!state.nearStation && state.fuelL < state.fuelMaxL - 0.5;
  const worn = (state.conditionPct ?? 100) < BALANCE.WEAR.warnBelow;
  const canCharge = !!state.chargeSpot;
  const showRecover = state.canRecoverBike !== false;

  return (
    <div
      data-testid="hud-quick-actions"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        pointerEvents: 'none',
      }}
    >
      {(canRescue || worn) && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
          {canRescue && (
            <div data-testid="hud-fuel-empty" style={{ color: 'var(--danger-red, #EF4444)', fontSize: '12px', fontWeight: 700, background: 'var(--surface-panel)', padding: '2px 8px', borderRadius: '6px' }}>
              {t('hud.fuel_empty')}
            </div>
          )}
          {worn && (
            <div data-testid="hud-bike-warn" style={{ color: 'var(--dhaka-amber, #F59E0B)', fontSize: '12px', fontWeight: 700, background: 'var(--surface-panel)', padding: '2px 8px', borderRadius: '6px' }}>
              {t('hud.bike_warn')}
            </div>
          )}
        </div>
      )}
      <div
        data-testid="hud-fuel-actions"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        {canRefuel && (
          <button type="button" data-testid="hud-btn-refuel" style={quickBtnStyle} onClick={() => onRefuelCallback?.()}>
            <IconFuel size={14} color="var(--uthao-green, #22C55E)" />
            <span>{t('hud.refuel')}</span>
          </button>
        )}
        {canCharge && (
          <button
            type="button"
            data-testid="hud-btn-charge-phone"
            style={quickBtnStyle}
            onClick={() => onChargePhoneCallback?.(state.chargeSpot!)}
          >
            <span>{t('hud.charge_phone')}</span>
          </button>
        )}
        {canRescue && (
          <button type="button" data-testid="hud-btn-fuel-rescue" style={quickBtnStyle} onClick={() => onFuelRescueCallback?.()}>
            <IconWarning size={14} color="var(--danger-red, #EF4444)" />
            <span>{t('hud.fuel_rescue', { cost: localDigits(BALANCE.FUEL.rescue.cost), min: localDigits(BALANCE.FUEL.rescue.waitMin) })}</span>
          </button>
        )}
        {showRecover && (
          <button
            type="button"
            data-testid="hud-btn-recover-bike"
            style={{
              ...quickBtnStyle,
              padding: compact ? '4px 8px' : '6px 10px',
              minHeight: compact ? '32px' : '36px',
            }}
            onClick={() => onRecoverBikeCallback?.()}
          >
            <IconWrench size={14} color="var(--info-sky, #38BDF8)" />
            <span>{t('hud.recover_bike')}</span>
          </button>
        )}
      </div>
    </div>
  );
}

function DistrictBadge({ districtName, districtId }: { districtName?: string; districtId?: string }): JSX.Element {
  const label = districtName || t(`district.${districtId ?? 'mirpara'}`);
  return (
    <div
      data-testid="hud-district"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
        borderRadius: 'var(--radius-pill, 9999px)',
        padding: '4px 10px',
        fontSize: '12px',
        fontWeight: 700,
        color: 'var(--text-primary, #F8FAFC)',
        backdropFilter: 'blur(8px)',
        boxShadow: '0 4px 10px rgba(0, 0, 0, 0.35)',
        alignSelf: 'flex-start',
      }}
    >
      <IconMapPin size={13} color="var(--uthao-green, #22C55E)" />
      <span>{label}</span>
    </div>
  );
}

function ConditionMeter({ conditionPct, compact = false }: { conditionPct: number; compact?: boolean }): JSX.Element {
  const clamped = Math.max(0, Math.min(100, Math.round(conditionPct)));
  const color = conditionColor(clamped);
  return (
    <div style={{ width: '100%', minWidth: compact ? '76px' : undefined }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '6px',
          fontSize: compact ? '11px' : '12px',
          color: clamped < BALANCE.WEAR.warnBelow ? 'var(--dhaka-amber, #F59E0B)' : 'var(--text-muted, #94A3B8)',
          fontWeight: 700,
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
          <IconWrench size={12} color={color} />
          {t('hud.condition')}
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{localDigits(clamped)}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={t('hud.condition')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={clamped}
        style={{
          height: compact ? '5px' : '6px',
          width: '100%',
          background: 'rgba(255, 255, 255, 0.15)',
          borderRadius: '4px',
          overflow: 'hidden',
          marginTop: '3px',
        }}
      >
        <div
          data-testid="hud-condition-bar"
          style={{
            height: '100%',
            width: `${clamped}%`,
            background: color,
            transition: 'width 0.25s ease',
          }}
        />
      </div>
    </div>
  );
}

function ObjectivePill({
  state,
  compact = false,
  topOffsetPx = 0,
}: {
  state: HudState;
  compact?: boolean;
  topOffsetPx?: number;
}): JSX.Element {
  return (
    <div
      data-testid="hud-objective-pill"
      style={{
        alignSelf: 'center',
        marginTop: topOffsetPx > 0 ? `${topOffsetPx}px` : undefined,
        background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
        border: '1px solid var(--uthao-green-border, rgba(34, 197, 94, 0.45))',
        borderRadius: state.activeMission || (state.activeSideMissions?.length ?? 0) > 0 || state.roadEventAlert ? '14px' : 'var(--radius-pill, 9999px)',
        padding: compact ? '6px 14px' : '7px 16px',
        color: 'var(--text-primary, #F8FAFC)',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
        textAlign: 'center',
        backdropFilter: 'blur(8px)',
        maxWidth: compact ? '320px' : '360px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span
          style={{
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: 'var(--uthao-green, #22C55E)',
            fontWeight: 800,
          }}
        >
          {t('hud.objective')}
        </span>
        <span id="hud-objective" style={{ fontSize: compact ? '13px' : '14px', fontWeight: 700, lineHeight: 1.25 }}>
          {state.objectiveText}
        </span>
        {state.fare !== undefined && (
          <span
            style={{
              fontSize: '12px',
              color: 'var(--dhaka-amber, #F59E0B)',
              background: 'var(--dhaka-amber-dim, rgba(245, 158, 11, 0.2))',
              padding: '1px 8px',
              borderRadius: '9999px',
              fontWeight: 800,
            }}
          >
            ৳{localDigits(state.fare)}
          </span>
        )}
      </div>

      {!compact && state.activeMission && (
        <div
          data-testid="hud-active-mission"
          style={{
            marginTop: '4px',
            paddingTop: '4px',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            fontSize: '12px',
            color: 'var(--text-secondary, #CBD5E1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
          }}
        >
          <div style={{ color: 'var(--info-sky, #38BDF8)', fontWeight: 700 }}>
            {t(state.activeMission.titleKey)}
          </div>
          <div>
            {t(state.activeMission.objectiveDescKey)} ({localDigits(state.activeMission.progress)}/{localDigits(state.activeMission.target)})
            {state.activeMission.targetDistM !== undefined && (
              <span style={{ color: 'var(--dhaka-amber, #F59E0B)', marginLeft: '6px', fontWeight: 700 }}>
                • {localDigits(Math.round(state.activeMission.targetDistM))}m
              </span>
            )}
          </div>
        </div>
      )}

      {!compact && state.activeSideMissions && state.activeSideMissions.length > 0 && (
        <div
          data-testid="hud-active-side-missions"
          style={{
            marginTop: '4px',
            paddingTop: '4px',
            borderTop: '1px solid rgba(255, 255, 255, 0.12)',
            fontSize: '11px',
            color: 'var(--text-secondary, #CBD5E1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '3px',
          }}
        >
          {state.activeSideMissions.map((sm) => (
            <div
              key={sm.id ?? sm.titleKey}
              data-testid={sm.id ? `hud-side-mission-${sm.id}` : 'hud-side-mission'}
            >
              <div style={{ color: 'var(--dhaka-amber, #F59E0B)', fontWeight: 700 }}>
                {t(sm.titleKey)}
              </div>
              <div>
                {t(sm.objectiveDescKey)} ({localDigits(sm.progress)}/{localDigits(sm.target)})
                {sm.targetDistM !== undefined && (
                  <span style={{ color: 'var(--info-sky, #38BDF8)', marginLeft: '6px', fontWeight: 700 }}>
                    • {localDigits(Math.round(sm.targetDistM))}m
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
            marginTop: '4px',
            padding: '3px 8px',
            borderRadius: '8px',
            background: 'var(--dhaka-amber-dim, rgba(245, 158, 11, 0.2))',
            border: '1px solid var(--dhaka-amber-border, rgba(245, 158, 11, 0.45))',
            color: '#fde68a',
            fontSize: '11px',
            fontWeight: 700,
          }}
        >
          {t('hud.road_event')}: {state.roadEventAlert.title}
        </div>
      )}
    </div>
  );
}

function DialogueSubtitleBubble({ subtitle }: { subtitle: NonNullable<HudState['dialogueSubtitle']> }): JSX.Element {
  return (
    <div
      data-testid="hud-dialogue-subtitle"
      style={{
        alignSelf: 'center',
        marginBottom: '10px',
        background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
        border: '1px solid var(--info-sky-border, rgba(56, 189, 248, 0.42))',
        borderRadius: '16px',
        padding: '8px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)',
        maxWidth: '620px',
        pointerEvents: 'auto',
        backdropFilter: 'blur(10px)',
      }}
    >
      <IconChat size={18} color="var(--info-sky, #38BDF8)" />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {subtitle.speaker && (
          <span style={{ fontSize: '12px', color: 'var(--info-sky, #38BDF8)', fontWeight: 800 }}>
            {t(subtitle.speaker)}
          </span>
        )}
        <span
          style={{
            fontSize: settingsSignal.value.subtitlesSize === 'large' ? '18px' : '15px',
            color: 'var(--text-primary, #F8FAFC)',
            fontWeight: 600,
          }}
        >
          {subtitle.text}
        </span>
      </div>
    </div>
  );
}

function PassengerChip({
  state,
  compact = false,
  maxWidth,
}: {
  state: HudState;
  compact?: boolean;
  maxWidth?: string;
}): JSX.Element {
  const moodInfo = moodMeta(state.passengerStatus?.mood);
  const hasActivePassenger = Boolean(state.passengerStatus?.name || state.passengerStatus?.status === 'OnTrip');
  const displayName =
    state.passengerStatus?.name ||
    (state.passengerStatus?.status === 'OnTrip' ? t('hud.passenger.on_bike') : t('hud.passenger.waiting'));

  return (
    <div
      data-testid="hud-passenger-status"
      style={{
        background: 'var(--surface-panel, rgba(15, 23, 42, 0.9))',
        border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
        backdropFilter: 'blur(8px)',
        borderRadius: '14px',
        padding: compact ? '6px 10px' : '10px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: compact ? '8px' : '10px',
        boxShadow: '0 6px 20px rgba(0, 0, 0, 0.45)',
        maxWidth: maxWidth ?? (compact ? '210px' : '260px'),
      }}
    >
      <CharacterPortrait
        characterId={state.passengerStatus?.characterId}
        archetype={state.passengerStatus?.archetype}
        mood={state.passengerStatus?.mood}
        size={compact ? 32 : 38}
        hideLabels={true}
        icon={
          state.passengerStatus?.status === 'OnTrip' ? (
            <IconUser size={compact ? 16 : 19} color="var(--text-primary, #F8FAFC)" />
          ) : (
            <IconMotorcycle size={compact ? 16 : 19} color="var(--info-sky, #38BDF8)" />
          )
        }
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: compact ? '13px' : '14px',
              fontWeight: 800,
              color: 'var(--text-primary, #F8FAFC)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {displayName}
          </span>
          <span
            data-testid="hud-passenger-mood"
            style={{
              fontSize: '10px',
              fontWeight: 800,
              color: moodInfo.color,
              background: 'rgba(15, 23, 42, 0.7)',
              border: `1px solid ${moodInfo.color}`,
              borderRadius: '9999px',
              padding: '1px 6px',
              whiteSpace: 'nowrap',
            }}
          >
            {hasActivePassenger && state.passengerStatus?.mood !== undefined
              ? `${t(moodInfo.key)} ${localDigits(Math.round(state.passengerStatus.mood * 100))}%`
              : t(moodInfo.key)}
          </span>
        </div>
        <div style={{ fontSize: compact ? '11px' : '13px', color: 'var(--text-muted, #94A3B8)', fontWeight: 600 }}>
          {t(passengerHintKey(state.passengerStatus?.status))}
          {state.etaMinutes !== undefined && ` • ${t('hud.eta', { min: localDigits(state.etaMinutes) })}`}
        </div>
      </div>
    </div>
  );
}

export function HudView({
  state,
  minimapHostRef,
}: {
  state: HudState;
  minimapHostRef?: Ref<HTMLDivElement>;
}): JSX.Element {
  const fuelPct = Math.max(0, Math.min(100, Math.round((state.fuelL / (state.fuelMaxL || 8)) * 100)));
  const isLowFuel = fuelPct <= 20;
  const conditionPct = state.conditionPct ?? 100;
  const gearLabel = `G${localDigits(state.gear ?? 1)}`;
  const isTouch = isTouchDevice();

  // 1. Complete First-Person Helmet/Handlebar View
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
          justifyContent: 'space-between',
          alignItems: 'stretch',
          padding: 'calc(12px + env(safe-area-inset-top, 0px)) calc(12px + env(safe-area-inset-right, 0px)) calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px))',
          boxSizing: 'border-box',
          fontFamily: "var(--font-sans, 'Hind Siliguri', 'Segoe UI', system-ui, sans-serif)",
          color: 'var(--text-primary, #F8FAFC)',
          userSelect: 'none',
        }}
      >
        {/* Top Helmet Visor Strip: District, Objective Pill, Rating & Clock (+ Earnings on touch) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', width: '100%' }}>
          <DistrictBadge districtName={state.districtName} districtId={state.districtId} />
          <ObjectivePill state={state} compact={true} topOffsetPx={isTouch ? 56 : 0} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
            {isTouch && (
              <div
                data-testid="hud-earnings"
                style={{
                  background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
                  border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
                  backdropFilter: 'blur(8px)',
                  borderRadius: '12px',
                  padding: '4px 10px',
                  textAlign: 'right',
                  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                }}
              >
                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: 'var(--text-muted, #94A3B8)', fontWeight: 700 }}>
                  {t('hud.earnings', { amount: '' }).replace(/: ৳/, '')}
                </div>
                <div style={{ fontSize: '15px', fontWeight: 900, color: 'var(--uthao-green, #22C55E)', lineHeight: 1.2 }}>
                  ৳{localDigits(Math.round(state.todayNetEarnings))}
                </div>
              </div>
            )}
            <div
              style={{
                background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
                border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
                borderRadius: '12px',
                padding: isTouch ? '4px 8px' : '5px 10px',
                display: 'flex',
                alignItems: 'center',
                gap: isTouch ? '6px' : '8px',
                fontSize: isTouch ? '11px' : '12px',
                fontWeight: 700,
                backdropFilter: 'blur(8px)',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--dhaka-amber, #F59E0B)' }}>
                <IconStar size={isTouch ? 12 : 13} color="var(--dhaka-amber, #F59E0B)" />
                {localDigits(state.rating ? state.rating.toFixed(1) : '5.0')}
              </span>
              <span style={{ color: '#475569' }}>|</span>
              <span style={{ color: 'var(--text-secondary, #CBD5E1)' }}>
                {localDigits(state.shiftClock)} • {t('hud.day', { day: localDigits(state.shiftDay || 1) })}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Cluster: Subtitle, Quick Actions, Handlebar Pod + Passenger Chip */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          {state.dialogueSubtitle && <DialogueSubtitleBubble subtitle={state.dialogueSubtitle} />}

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-end',
              width: '100%',
              gap: isTouch ? '6px' : '10px',
              paddingLeft: isTouch ? '27%' : undefined,
              paddingRight: isTouch ? '27%' : undefined,
              boxSizing: 'border-box',
            }}
          >
            {isTouch ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', minWidth: 0, maxWidth: '142px' }}>
                <QuickActions state={state} compact={true} />
                <PassengerChip state={state} compact={true} maxWidth="142px" />
              </div>
            ) : (
              <PassengerChip state={state} compact={true} />
            )}

            {/* Compact Instrument Pod on Handlebars */}
            <div
              data-testid="hud-speed-pod"
              style={{
                background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
                border: '2px solid var(--info-sky-border, rgba(56, 189, 248, 0.42))',
                borderRadius: isTouch ? '14px' : '18px',
                padding: isTouch ? '6px 8px' : '10px 18px',
                display: 'flex',
                alignItems: 'center',
                flexWrap: isTouch ? 'wrap' : 'nowrap',
                gap: isTouch ? '6px' : '16px',
                maxWidth: isTouch ? '156px' : undefined,
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.7)',
                backdropFilter: 'blur(8px)',
              }}
            >
              {/* Gear + Speed */}
              <div style={{ display: 'flex', alignItems: 'center', gap: isTouch ? '6px' : '10px' }}>
                <span
                  data-testid="hud-gear"
                  style={{
                    fontSize: isTouch ? '12px' : '14px',
                    fontWeight: 800,
                    color: 'var(--info-sky, #38BDF8)',
                    background: 'var(--info-sky-dim, rgba(56, 189, 248, 0.2))',
                    padding: isTouch ? '2px 6px' : '3px 8px',
                    borderRadius: '6px',
                  }}
                >
                  {gearLabel}
                </span>
                <div style={{ textAlign: 'center' }}>
                  <div
                    id="hud-speed"
                    style={{
                      fontSize: isTouch ? '22px' : '28px',
                      fontWeight: 900,
                      lineHeight: 1,
                      color: '#ffffff',
                      fontVariantNumeric: 'tabular-nums',
                    }}
                  >
                    {localDigits(Math.round(state.speedKmh))}
                  </div>
                  <div style={{ fontSize: isTouch ? '10px' : '11px', color: 'var(--text-muted, #94A3B8)', letterSpacing: '1px', fontWeight: 700 }}>
                    {t('hud.speed_unit')}
                  </div>
                </div>
              </div>

              <div style={{ width: '1px', height: isTouch ? '28px' : '36px', background: 'rgba(255, 255, 255, 0.15)' }} />

              {/* Fuel & Bike Condition */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: isTouch ? '4px' : '6px', minWidth: isTouch ? '68px' : '100px' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '4px', fontSize: '11px', fontWeight: 700, color: isLowFuel ? 'var(--danger-red, #EF4444)' : 'var(--text-muted, #94A3B8)' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      <IconFuel size={12} /> {t('hud.fuel')}
                    </span>
                    <span>{localDigits(fuelPct)}%</span>
                  </div>
                  <div style={{ height: '5px', width: '100%', background: 'rgba(255, 255, 255, 0.15)', borderRadius: '4px', marginTop: '3px', overflow: 'hidden' }}>
                    <div
                      data-testid="hud-fuel-bar"
                      style={{
                        height: '100%',
                        width: `${fuelPct}%`,
                        background: isLowFuel ? 'var(--danger-red, #EF4444)' : 'linear-gradient(90deg, var(--uthao-green, #22C55E), var(--info-sky, #38BDF8))',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>
                <ConditionMeter conditionPct={conditionPct} compact={true} />
              </div>

              {/* Turn Guidance */}
              {state.nextTurn && (
                <>
                  {!isTouch && <div style={{ width: '1px', height: '36px', background: 'rgba(255, 255, 255, 0.15)' }} />}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      fontSize: isTouch ? '11px' : '13px',
                      fontWeight: 700,
                      color: 'var(--info-sky, #38BDF8)',
                      width: isTouch ? '100%' : undefined,
                      borderTop: isTouch ? '1px solid rgba(255, 255, 255, 0.12)' : undefined,
                      paddingTop: isTouch ? '4px' : undefined,
                    }}
                  >
                    <TurnDirectionIcon direction={state.nextTurn.direction} size={isTouch ? 15 : 18} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{state.nextTurn.text}</span>
                  </div>
                </>
              )}

              {/* Earnings (desktop handlebar pod only; touch renders in top-right) */}
              {!isTouch && (
                <div data-testid="hud-earnings" style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '15px', fontWeight: 800, color: 'var(--uthao-green, #22C55E)' }}>
                    ৳{localDigits(Math.round(state.todayNetEarnings))}
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted, #94A3B8)' }}>
                    {localDigits(state.shiftClock)}
                  </div>
                </div>
              )}
            </div>

            {!isTouch && <QuickActions state={state} compact={true} />}
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
        padding: 'calc(12px + env(safe-area-inset-top, 0px)) calc(12px + env(safe-area-inset-right, 0px)) calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px))',
        boxSizing: 'border-box',
        fontFamily: "var(--font-sans, 'Hind Siliguri', 'Segoe UI', system-ui, sans-serif)",
        color: 'var(--text-primary, #F8FAFC)',
        userSelect: 'none',
      }}
    >
      {/* Top Header Bar: Minimap + District (Left), Objective Pill (Center), Earnings + Rating + Clock (Right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', width: '100%' }}>
        {/* Top-Left: Minimap Container Anchor, District Badge & Next Turn */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <div
            id="minimap-container"
            data-testid="hud-minimap-host"
            ref={minimapHostRef}
            style={{
              width: isTouch ? 'clamp(92px, 22vh, 152px)' : 'clamp(108px, 24vh, 152px)',
              height: isTouch ? 'clamp(92px, 22vh, 152px)' : 'clamp(108px, 24vh, 152px)',
              position: 'relative',
              borderRadius: '50%',
              overflow: 'hidden',
            }}
          />

          <DistrictBadge districtName={state.districtName} districtId={state.districtId} />

          {/* Next Turn Instruction Pill */}
          {state.nextTurn && (
            <div
              style={{
                alignSelf: 'flex-start',
                background: 'var(--surface-panel, rgba(15, 23, 42, 0.9))',
                border: '1px solid var(--info-sky-border, rgba(56, 189, 248, 0.42))',
                backdropFilter: 'blur(8px)',
                borderRadius: '12px',
                padding: '6px 12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '13px',
                fontWeight: 700,
                color: 'var(--info-sky, #38BDF8)',
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              }}
            >
              <TurnDirectionIcon direction={state.nextTurn.direction} size={18} />
              <span>{state.nextTurn.text}</span>
            </div>
          )}
        </div>

        {/* Top-Center: Compact Objective & Fare Pill */}
        <ObjectivePill state={state} compact={isTouch} topOffsetPx={isTouch ? 56 : 0} />

        {/* Top-Right: Fullscreen button, Earnings, Rating & Shift Clock */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: isTouch ? '4px' : '6px' }}>
          <button
            type="button"
            data-testid="hud-btn-fullscreen"
            onClick={handleToggleFullscreenAndLock}
            style={{
              pointerEvents: 'auto',
              background: 'var(--surface-panel, rgba(15, 23, 42, 0.9))',
              border: '1px solid var(--border-strong, rgba(255, 255, 255, 0.2))',
              borderRadius: '12px',
              color: 'var(--text-primary, #F8FAFC)',
              padding: isTouch ? '4px 8px' : '6px 12px',
              fontSize: isTouch ? '11px' : '13px',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
              minHeight: isTouch ? '30px' : '36px',
            }}
            title={t('hud.fullscreen')}
          >
            <IconFullscreen size={isTouch ? 12 : 14} /> {t('hud.fullscreen')}
          </button>

          {/* Earnings Badge */}
          <div
            data-testid="hud-earnings"
            style={{
              background: 'var(--surface-panel, rgba(15, 23, 42, 0.9))',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
              backdropFilter: 'blur(8px)',
              borderRadius: '12px',
              padding: isTouch ? '4px 10px' : '6px 14px',
              textAlign: 'right',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            }}
          >
            <div style={{ fontSize: isTouch ? '10px' : '12px', textTransform: 'uppercase', color: 'var(--text-muted, #94A3B8)', fontWeight: 700 }}>
              {t('hud.earnings', { amount: '' }).replace(/: ৳/, '')}
            </div>
            <div style={{ fontSize: isTouch ? '15px' : '18px', fontWeight: 900, color: 'var(--uthao-green, #22C55E)', lineHeight: 1.2 }}>
              ৳{localDigits(Math.round(state.todayNetEarnings))}
            </div>
          </div>

          {/* Rating & Shift Clock Badge */}
          <div
            style={{
              background: 'var(--surface-panel, rgba(15, 23, 42, 0.9))',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
              backdropFilter: 'blur(8px)',
              borderRadius: '12px',
              padding: isTouch ? '4px 8px' : '6px 12px',
              display: 'flex',
              alignItems: 'center',
              gap: isTouch ? '6px' : '10px',
              fontSize: isTouch ? '11px' : '13px',
              fontWeight: 700,
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--dhaka-amber, #F59E0B)' }}>
              <IconStar size={isTouch ? 12 : 14} color="var(--dhaka-amber, #F59E0B)" />
              {localDigits(state.rating ? state.rating.toFixed(1) : '5.0')}
            </span>
            <span style={{ color: '#475569' }}>|</span>
            <span style={{ color: 'var(--text-secondary, #CBD5E1)' }}>
              {localDigits(state.shiftClock || '07:30')} • {t('hud.day', { day: localDigits(state.shiftDay || 1) })}
            </span>
          </div>
        </div>
      </div>

      {/* Passenger Dialogue Subtitle Bubble */}
      {state.dialogueSubtitle && <DialogueSubtitleBubble subtitle={state.dialogueSubtitle} />}

      {/* Bottom Bar: Passenger Chip (Left), Quick Actions (Center), Speedometer / Gear / Condition / Fuel Cluster (Right) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: isTouch ? '8px' : '12px',
          width: '100%',
          paddingLeft: isTouch ? '27%' : undefined,
          paddingRight: isTouch ? '27%' : undefined,
          boxSizing: 'border-box',
        }}
      >
        {isTouch ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '6px', minWidth: 0 }}>
            <QuickActions state={state} compact={true} />
            <PassengerChip state={state} compact={true} />
          </div>
        ) : (
          <>
            <PassengerChip state={state} />
            <QuickActions state={state} />
          </>
        )}

        {/* Bottom-Right: Speedometer, Gear, Condition & Fuel Gauge Pod */}
        <div
          data-testid="hud-speed-pod"
          style={{
            background: 'var(--surface-panel, rgba(15, 23, 42, 0.92))',
            border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
            borderRadius: '16px',
            padding: isTouch ? '8px 10px' : '12px 18px',
            color: 'var(--text-primary, #F8FAFC)',
            boxShadow: '0 8px 30px rgba(0, 0, 0, 0.6)',
            textAlign: 'right',
            minWidth: isTouch ? '124px' : '165px',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            flexDirection: 'column',
            gap: isTouch ? '4px' : '6px',
          }}
        >
          {/* Speed & Gear */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: isTouch ? '8px' : '14px' }}>
            <span
              data-testid="hud-gear"
              style={{
                fontSize: isTouch ? '12px' : '14px',
                fontWeight: 800,
                color: 'var(--info-sky, #38BDF8)',
                background: 'var(--info-sky-dim, rgba(56, 189, 248, 0.18))',
                padding: isTouch ? '2px 7px' : '3px 9px',
                borderRadius: '6px',
              }}
            >
              {gearLabel}
            </span>
            <div>
              <div
                id="hud-speed"
                style={{
                  fontSize: isTouch ? '24px' : '36px',
                  fontWeight: 900,
                  lineHeight: 1,
                  color: '#ffffff',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {localDigits(Math.round(state.speedKmh))}
              </div>
              <div
                style={{
                  fontSize: isTouch ? '10px' : '12px',
                  letterSpacing: '1px',
                  color: 'var(--text-muted, #94A3B8)',
                  fontWeight: 700,
                  marginTop: '2px',
                }}
              >
                {t('hud.speed_unit')}
              </div>
            </div>
          </div>

          {/* Bike Condition Bar */}
          <ConditionMeter conditionPct={conditionPct} compact={isTouch} />

          {/* Fuel Level Bar */}
          <div style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', fontSize: isTouch ? '11px' : '12px', color: isLowFuel ? 'var(--danger-red, #EF4444)' : 'var(--text-muted, #94A3B8)', fontWeight: 700 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                {isLowFuel ? <IconWarning size={13} color="var(--danger-red, #EF4444)" /> : <IconFuel size={13} />}
                {isLowFuel ? t('hud.fuel_low') : t('hud.fuel')}
              </span>
              <span>{localDigits(fuelPct)}% ({localDigits(state.fuelL.toFixed(1))}L)</span>
            </div>
            <div
              style={{
                height: '6px',
                width: '100%',
                background: 'rgba(255, 255, 255, 0.15)',
                borderRadius: '4px',
                overflow: 'hidden',
                marginTop: '3px',
              }}
            >
              <div
                data-testid="hud-fuel-bar"
                style={{
                  height: '100%',
                  width: `${fuelPct}%`,
                  background: isLowFuel
                    ? 'var(--danger-red, #EF4444)'
                    : 'linear-gradient(90deg, var(--uthao-green, #22C55E) 0%, var(--info-sky, #38BDF8) 100%)',
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
export function Hud({ minimapCanvas }: { minimapCanvas?: HTMLCanvasElement | null } = {}): JSX.Element {
  const state = hudSignal.value;
  const minimapHostRef = useRef<HTMLDivElement | null>(null);
  const canvasToMount = minimapCanvas ?? minimapCanvasSignal.value;

  useEffect(() => {
    const host = minimapHostRef.current;
    if (!host || !canvasToMount) return;
    if (canvasToMount.parentNode !== host) {
      host.appendChild(canvasToMount);
    }
    return () => {
      if (canvasToMount.parentNode === host) {
        host.removeChild(canvasToMount);
      }
    };
  }, [canvasToMount, state.isFirstPerson]);

  return <HudView state={state} minimapHostRef={minimapHostRef} />;
}
