import { describe, it, expect } from 'vitest';
import { TouchActions, isTouchDevice } from '../../../src/ui/touch/TouchActions';
import { touchLayout } from '../../../src/input/layout';

/** Every data-testid and style in a Preact vnode tree. */
function collect(node: unknown, out: Map<string, Record<string, unknown>>): void {
  if (!node || typeof node !== 'object') return;
  const vnode = node as { props?: Record<string, unknown>; children?: unknown };
  const props = vnode.props ?? {};
  if (typeof props['data-testid'] === 'string') {
    out.set(props['data-testid'], (props.style as Record<string, unknown>) ?? {});
  }
  const kids = props.children;
  for (const k of Array.isArray(kids) ? kids : [kids]) collect(k, out);
}

describe('touch actions (audit H-17: touch players had no pause, save, map, phone, horn or camera)', () => {
  const found = new Map<string, Record<string, unknown>>();
  collect(TouchActions(), found);

  it('offers pause, map, phone, horn and camera', () => {
    for (const id of ['touch-btn-pause', 'touch-btn-map', 'touch-btn-phone', 'touch-btn-horn', 'touch-btn-camera']) {
      expect(found.has(id), id).toBe(true);
    }
  });

  it('draws the steer, throttle and brake zones where the input reads them', () => {
    const L = touchLayout(100, 100);
    expect(found.get('touch-zone-throttle')).toMatchObject({
      left: `${L.throttlePad.x}%`,
      width: `${L.throttlePad.width}%`,
    });
    expect(found.get('touch-zone-brake')).toMatchObject({ left: `${L.brakePad.x}%` });
    expect(found.get('touch-zone-steer')).toMatchObject({ width: `${L.steerZone.width}%` });
  });

  it('is not shown without a touch screen (node tests have none)', () => {
    expect(isTouchDevice()).toBe(false);
  });
});
