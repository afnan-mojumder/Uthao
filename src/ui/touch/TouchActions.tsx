import type { JSX } from 'preact';
import { loadBindings } from '../../input/bindings';
import { touchLayout } from '../../input/layout';
import { IconBell, IconFullscreen, IconMap, IconPause, IconPhone } from '../components/icons';
import { t } from '../i18n';

/** True on devices with a touch screen. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

/** Tap a key the App handles itself (pause, map, phone): both events, so it works as a press. */
function tapCode(code: string): void {
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key, code }));
}

/** Press a key the input manager reads while held (horn, camera). */
function holdCode(code: string, down: boolean): void {
  const key = code.startsWith('Key') ? code.slice(3).toLowerCase() : code;
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, code }));
}

const iconStyle = {
  flex: 1,
  minWidth: '44px',
  minHeight: '44px',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  background: 'rgba(15, 23, 42, 0.7)',
  color: '#f8fafc',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  touchAction: 'none',
} as const;

/**
 * Touch controls for what the keyboard does with a key. Taps reach the App's
 * own hotkeys; horn and camera are pressed and held. The zone outlines come
 * from the same layout the input manager uses, so what is drawn is what works.
 */
export function TouchActions(): JSX.Element {
  const L = touchLayout(100, 100);
  const pct = (r: { x: number; y: number; width: number; height: number }) => ({
    left: `${r.x}%`,
    top: `${r.y}%`,
    width: `${r.width}%`,
    height: `${r.height}%`,
  });
  const zone = {
    position: 'absolute' as const,
    pointerEvents: 'none' as const,
    border: '1px dashed rgba(148, 163, 184, 0.35)',
    borderRadius: '12px',
  };

  return (
    <div data-testid="touch-actions" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      <div data-testid="touch-zone-steer" style={{ ...zone, ...pct(L.steerZone) }} />
      <div data-testid="touch-zone-throttle" style={{ ...zone, ...pct(L.throttlePad) }} />
      <div data-testid="touch-zone-brake" style={{ ...zone, ...pct(L.brakePad) }} />
      <div
        data-testid="touch-icons"
        style={{ position: 'absolute', display: 'flex', gap: '6px', pointerEvents: 'auto', ...pct(L.iconsZone) }}
      >
        <button
          type="button"
          data-testid="touch-btn-pause"
          aria-label={t('touch.pause')}
          style={iconStyle}
          onClick={() => tapCode(loadBindings().keyboard.pause[0] ?? 'Escape')}
        >
          <IconPause size={18} />
        </button>
        <button
          type="button"
          data-testid="touch-btn-map"
          aria-label={t('touch.map')}
          style={iconStyle}
          onClick={() => tapCode(loadBindings().keyboard.map[0] ?? 'KeyM')}
        >
          <IconMap size={18} />
        </button>
        <button
          type="button"
          data-testid="touch-btn-phone"
          aria-label={t('touch.phone')}
          style={iconStyle}
          onClick={() => tapCode(loadBindings().keyboard.phone[0] ?? 'Tab')}
        >
          <IconPhone size={18} />
        </button>
        <button
          type="button"
          data-testid="touch-btn-horn"
          aria-label={t('touch.horn')}
          style={iconStyle}
          onPointerDown={() => holdCode(loadBindings().keyboard.horn[0] ?? 'KeyH', true)}
          onPointerUp={() => holdCode(loadBindings().keyboard.horn[0] ?? 'KeyH', false)}
          onPointerLeave={() => holdCode(loadBindings().keyboard.horn[0] ?? 'KeyH', false)}
          onPointerCancel={() => holdCode(loadBindings().keyboard.horn[0] ?? 'KeyH', false)}
        >
          <IconBell size={18} />
        </button>
        <button
          type="button"
          data-testid="touch-btn-camera"
          aria-label={t('touch.camera')}
          style={iconStyle}
          onPointerDown={() => holdCode(loadBindings().keyboard.camera[0] ?? 'KeyC', true)}
          onPointerUp={() => holdCode(loadBindings().keyboard.camera[0] ?? 'KeyC', false)}
          onPointerLeave={() => holdCode(loadBindings().keyboard.camera[0] ?? 'KeyC', false)}
          onPointerCancel={() => holdCode(loadBindings().keyboard.camera[0] ?? 'KeyC', false)}
        >
          <IconFullscreen size={18} />
        </button>
      </div>
    </div>
  );
}
