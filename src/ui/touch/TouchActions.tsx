import type { JSX } from 'preact';
import { DEFAULT_BINDINGS } from '../../input/bindings';
import { touchLayout } from '../../input/layout';
import { t } from '../i18n';

/** True on devices with a touch screen. */
export function isTouchDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return 'ontouchstart' in window || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
}

/** Tap a key the App handles itself (Escape, M, Tab): both events, so it works as a press. */
function tapKey(key: string, code: string): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, code }));
  window.dispatchEvent(new KeyboardEvent('keyup', { key, code }));
}

/** Press a key the input manager reads while held (horn, camera). */
function holdKey(code: string, down: boolean): void {
  const key = code.replace('Key', '').toLowerCase();
  window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { key, code }));
}

const HELD_CODES = { horn: DEFAULT_BINDINGS.keyboard.horn[0] ?? 'KeyH', camera: DEFAULT_BINDINGS.keyboard.camera[0] ?? 'KeyC' };

const iconStyle = {
  flex: 1,
  minWidth: '44px',
  minHeight: '44px',
  borderRadius: '12px',
  border: '1px solid rgba(255, 255, 255, 0.2)',
  background: 'rgba(15, 23, 42, 0.7)',
  color: '#f8fafc',
  fontSize: '1.2rem',
  touchAction: 'none',
} as const;

/**
 * Touch controls for what the keyboard does with a key. Taps reach the App's
 * own hotkeys; horn and camera are pressed and held. The zone outlines come
 * from the same layout the input manager uses, so what is drawn is what works.
 */
export function TouchActions(): JSX.Element {
  // touchLayout is linear, so laying it out in a 100x100 box gives percentages.
  const L = touchLayout(100, 100);
  const pct = (r: { x: number; y: number; width: number; height: number }) => ({
    left: `${r.x}%`,
    top: `${r.y}%`,
    width: `${r.width}%`,
    height: `${r.height}%`,
  });
  const zone = { position: 'absolute' as const, pointerEvents: 'none' as const, border: '1px dashed rgba(148, 163, 184, 0.35)', borderRadius: '12px' };

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
          data-testid="touch-btn-pause"
          aria-label={t('touch.pause')}
          style={iconStyle}
          onClick={() => tapKey('Escape', 'Escape')}
        >
          ⏸
        </button>
        <button
          data-testid="touch-btn-map"
          aria-label={t('touch.map')}
          style={iconStyle}
          onClick={() => tapKey('m', 'KeyM')}
        >
          🗺️
        </button>
        <button
          data-testid="touch-btn-phone"
          aria-label={t('touch.phone')}
          style={iconStyle}
          onClick={() => tapKey('Tab', 'Tab')}
        >
          📱
        </button>
        <button
          data-testid="touch-btn-horn"
          aria-label={t('touch.horn')}
          style={iconStyle}
          onPointerDown={() => holdKey(HELD_CODES.horn, true)}
          onPointerUp={() => holdKey(HELD_CODES.horn, false)}
          onPointerLeave={() => holdKey(HELD_CODES.horn, false)}
          onPointerCancel={() => holdKey(HELD_CODES.horn, false)}
        >
          📯
        </button>
        <button
          data-testid="touch-btn-camera"
          aria-label={t('touch.camera')}
          style={iconStyle}
          onPointerDown={() => holdKey(HELD_CODES.camera, true)}
          onPointerUp={() => holdKey(HELD_CODES.camera, false)}
          onPointerLeave={() => holdKey(HELD_CODES.camera, false)}
          onPointerCancel={() => holdKey(HELD_CODES.camera, false)}
        >
          🎥
        </button>
      </div>
    </div>
  );
}
