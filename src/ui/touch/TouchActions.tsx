import type { JSX } from 'preact';
import { useEffect } from 'preact/hooks';
import { loadBindings } from '../../input/bindings';
import { touchLayout } from '../../input/layout';
import {
  IconBell,
  IconCamera,
  IconMap,
  IconPause,
  IconPhone,
  IconScroll,
  IconShield,
  IconTurnLeft,
  IconTurnRight,
  IconTurnStraight,
  IconWarning,
  IconWrench,
} from '../components/icons';
import { t } from '../i18n';
import { settingsSignal, touchFeedbackSignal } from '../store';

/** True on devices with a touch screen. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

/** Tap a key the App handles itself (pause, map, phone, garage, journal, karma): both events, so it works as a press. */
function tapCode(code: string): void {
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key, code }));
}

function setHoldFeedback(field: 'horn' | 'camera', down: boolean): void {
  const prev = touchFeedbackSignal.value;
  if (Boolean(prev[field]) === down) return;
  touchFeedbackSignal.value = { ...prev, [field]: down };
}

/** Press a key the input manager reads while held (horn, camera). */
function holdCode(code: string, down: boolean, field?: 'horn' | 'camera'): void {
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
  if (field) setHoldFeedback(field, down);
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, code }));
}

const heldCodes: { horn: string | null; camera: string | null } = {
  horn: null,
  camera: null,
};

function releaseHold(field: 'horn' | 'camera'): void {
  const code = heldCodes[field];
  if (!code) return;
  heldCodes[field] = null;
  holdCode(code, false, field);
}

function pressHold(field: 'horn' | 'camera', code: string): void {
  if (heldCodes[field] && heldCodes[field] !== code) {
    releaseHold(field);
  }
  heldCodes[field] = code;
  holdCode(code, true, field);
}

function releaseAllHolds(): void {
  releaseHold('horn');
  releaseHold('camera');
}

function TouchHoldLifecycle(): null {
  useEffect(() => {
    window.addEventListener('blur', releaseAllHolds);
    return () => {
      window.removeEventListener('blur', releaseAllHolds);
      releaseAllHolds();
    };
  }, []);
  return null;
}

const iconStyle = {
  flex: '0 0 44px',
  width: '44px',
  height: '44px',
  minWidth: '44px',
  minHeight: '44px',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.24)',
  background: 'rgba(15, 23, 42, 0.82)',
  color: '#f8fafc',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  touchAction: 'none',
  cursor: 'pointer',
  backdropFilter: 'blur(6px)',
} as const;

/**
 * Touch controls for driving pads and compact action strip. Taps reach the
 * App's own hotkeys; horn and camera are pressed and held. The zone outlines
 * come from the same layout the input manager uses, so what is drawn is what works.
 */
export function TouchActions(): JSX.Element {
  const L = touchLayout(100, 100);
  const bindings = settingsSignal.value.controls ?? loadBindings();
  const feedback = touchFeedbackSignal.value;
  const steerButtonsMode = bindings.touchSteerMode === 'buttons';

  const pct = (r: { x: number; y: number; width: number; height: number }) => ({
    left: `${r.x}%`,
    top: `${r.y}%`,
    width: `${r.width}%`,
    height: `${r.height}%`,
  });

  const padBase = {
    position: 'absolute' as const,
    pointerEvents: 'none' as const,
    borderRadius: '16px',
    touchAction: 'none' as const,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backdropFilter: 'blur(4px)',
    transition: 'background-color 0.1s ease, border-color 0.1s ease, transform 0.1s ease',
  };

  const steerActive = Math.abs(feedback.steer) > 0.05;
  const throttleActive = feedback.throttle;
  const brakeActive = feedback.brake;
  const thumbOffsetPct = Math.max(-36, Math.min(36, feedback.steer * 36));

  return (
    <div
      data-testid="touch-actions"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', touchAction: 'none' }}
    >
      <TouchHoldLifecycle />
      {/* Bottom-left steering pad (slider or dual L/R visual buttons) */}
      <div
        data-testid="touch-zone-steer"
        aria-label={t('touch.steer')}
        style={{
          ...padBase,
          ...pct(L.steerZone),
          border: steerActive
            ? '2px solid rgba(56, 189, 248, 0.85)'
            : '1.5px solid rgba(148, 163, 184, 0.38)',
          background: steerActive ? 'rgba(56, 189, 248, 0.16)' : 'rgba(15, 23, 42, 0.36)',
          flexDirection: 'column',
          gap: '8px',
          padding: '8px',
        }}
      >
        {steerButtonsMode ? (
          <div style={{ display: 'flex', width: '100%', height: '100%', gap: '8px', alignItems: 'center' }}>
            <div
              data-testid="touch-steer-left"
              aria-label={t('touch.steer_left')}
              style={{
                flex: 1,
                minWidth: '44px',
                minHeight: '44px',
                height: '65%',
                borderRadius: '12px',
                border: feedback.steer < -0.1 ? '2px solid #38BDF8' : '1px solid rgba(255,255,255,0.2)',
                background: feedback.steer < -0.1 ? 'rgba(56, 189, 248, 0.28)' : 'rgba(15, 23, 42, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f8fafc',
              }}
            >
              <IconTurnLeft size={24} color={feedback.steer < -0.1 ? '#38BDF8' : '#e2e8f0'} />
            </div>
            <div
              data-testid="touch-steer-right"
              aria-label={t('touch.steer_right')}
              style={{
                flex: 1,
                minWidth: '44px',
                minHeight: '44px',
                height: '65%',
                borderRadius: '12px',
                border: feedback.steer > 0.1 ? '2px solid #38BDF8' : '1px solid rgba(255,255,255,0.2)',
                background: feedback.steer > 0.1 ? 'rgba(56, 189, 248, 0.28)' : 'rgba(15, 23, 42, 0.55)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f8fafc',
              }}
            >
              <IconTurnRight size={24} color={feedback.steer > 0.1 ? '#38BDF8' : '#e2e8f0'} />
            </div>
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '86%',
                color: '#cbd5e1',
              }}
            >
              <IconTurnLeft size={20} color={feedback.steer < -0.1 ? '#38BDF8' : '#94a3b8'} />
              <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.4px', color: '#cbd5e1' }}>
                {t('touch.steer')}
              </span>
              <IconTurnRight size={20} color={feedback.steer > 0.1 ? '#38BDF8' : '#94a3b8'} />
            </div>
            <div
              style={{
                position: 'relative',
                width: '86%',
                height: '18px',
                borderRadius: '9999px',
                background: 'rgba(255, 255, 255, 0.12)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: steerActive ? '#38BDF8' : '#e2e8f0',
                  boxShadow: steerActive ? '0 0 12px rgba(56, 189, 248, 0.7)' : '0 2px 6px rgba(0,0,0,0.5)',
                  transform: `translateX(${thumbOffsetPct}px)`,
                }}
              />
            </div>
          </>
        )}
      </div>

      {/* Bottom-right Brake pedal */}
      <div
        data-testid="touch-zone-brake"
        aria-label={t('touch.brake')}
        style={{
          ...padBase,
          ...pct(L.brakePad),
          flexDirection: 'column',
          gap: '4px',
          border: brakeActive
            ? '2px solid rgba(239, 68, 68, 0.9)'
            : '1.5px solid rgba(239, 68, 68, 0.48)',
          background: brakeActive ? 'rgba(239, 68, 68, 0.34)' : 'rgba(127, 29, 29, 0.36)',
          color: '#fecaca',
        }}
      >
        <IconWarning size={20} color={brakeActive ? '#ffffff' : '#fca5a5'} />
        <span style={{ fontSize: '11px', fontWeight: 800, color: '#fee2e2' }}>{t('touch.brake')}</span>
      </div>

      {/* Bottom-right Throttle pedal */}
      <div
        data-testid="touch-zone-throttle"
        aria-label={t('touch.throttle')}
        style={{
          ...padBase,
          ...pct(L.throttlePad),
          flexDirection: 'column',
          gap: '4px',
          border: throttleActive
            ? '2px solid rgba(34, 197, 94, 0.95)'
            : '1.5px solid rgba(34, 197, 94, 0.5)',
          background: throttleActive ? 'rgba(34, 197, 94, 0.36)' : 'rgba(6, 78, 59, 0.4)',
          color: '#bbf7d0',
        }}
      >
        <IconTurnStraight size={22} color={throttleActive ? '#ffffff' : '#4ade80'} />
        <span style={{ fontSize: '11px', fontWeight: 800, color: '#dcfce7' }}>{t('touch.throttle')}</span>
      </div>

      {/* Top-center-right compact 44px icon strip */}
      <div
        data-testid="touch-icons"
        style={{
          position: 'absolute',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: '3px',
          pointerEvents: 'auto',
          touchAction: 'none',
          ...pct(L.iconsZone),
        }}
      >
        <button
          type="button"
          className="uthao-touch-icon-btn"
          data-testid="touch-btn-phone"
          aria-label={t('touch.phone')}
          title={t('touch.phone')}
          style={iconStyle}
          onClick={() => tapCode(bindings.keyboard.phone[0] ?? 'Tab')}
        >
          <IconPhone size={18} />
        </button>
        <button
          type="button"
          className="uthao-touch-icon-btn"
          data-testid="touch-btn-map"
          aria-label={t('touch.map')}
          title={t('touch.map')}
          style={iconStyle}
          onClick={() => tapCode(bindings.keyboard.map[0] ?? 'KeyM')}
        >
          <IconMap size={18} />
        </button>
        <button
          type="button"
          className="uthao-touch-icon-btn"
          data-testid="touch-btn-garage"
          aria-label={t('touch.garage')}
          title={t('touch.garage')}
          style={iconStyle}
          onClick={() => tapCode(bindings.keyboard.garage[0] ?? 'KeyG')}
        >
          <IconWrench size={18} />
        </button>
        <button
          type="button"
          className="uthao-touch-icon-btn"
          data-testid="touch-btn-journal"
          aria-label={t('touch.journal')}
          title={t('touch.journal')}
          style={iconStyle}
          onClick={() => tapCode(bindings.keyboard.journal[0] ?? 'KeyJ')}
        >
          <IconScroll size={18} />
        </button>
        <button
          type="button"
          className="uthao-touch-icon-btn"
          data-testid="touch-btn-karma"
          aria-label={t('touch.karma')}
          title={t('touch.karma')}
          style={iconStyle}
          onClick={() => tapCode(bindings.keyboard.karma[0] ?? 'KeyK')}
        >
          <IconShield size={18} />
        </button>
        <button
          type="button"
          className="uthao-touch-icon-btn"
          data-testid="touch-btn-pause"
          aria-label={t('touch.pause')}
          title={t('touch.pause')}
          style={iconStyle}
          onClick={() => tapCode(bindings.keyboard.pause[0] ?? 'Escape')}
        >
          <IconPause size={18} />
        </button>
        <button
          type="button"
          className="uthao-touch-icon-btn"
          data-testid="touch-btn-horn"
          data-active={feedback.horn ? 'true' : undefined}
          aria-label={t('touch.horn')}
          title={t('touch.horn')}
          style={iconStyle}
          onPointerDown={() => pressHold('horn', bindings.keyboard.horn[0] ?? 'KeyH')}
          onPointerUp={() => releaseHold('horn')}
          onPointerLeave={() => releaseHold('horn')}
          onPointerCancel={() => releaseHold('horn')}
        >
          <IconBell size={18} />
        </button>
        <button
          type="button"
          className="uthao-touch-icon-btn"
          data-testid="touch-btn-camera"
          data-active={feedback.camera ? 'true' : undefined}
          aria-label={t('touch.camera')}
          title={t('touch.camera')}
          style={iconStyle}
          onPointerDown={() => pressHold('camera', bindings.keyboard.camera[0] ?? 'KeyC')}
          onPointerUp={() => releaseHold('camera')}
          onPointerLeave={() => releaseHold('camera')}
          onPointerCancel={() => releaseHold('camera')}
        >
          <IconCamera size={18} />
        </button>
      </div>
    </div>
  );
}
