import { describe, it, expect } from 'vitest';
import { routeColorFor, ROUTE_COLOR, HIGH_CONTRAST_ROUTE_COLOR } from '../../../src/ui/settingsEffects';

describe('high-contrast route setting', () => {
  it('uses the normal route colour when the setting is off', () => {
    expect(routeColorFor({ colorblindRoute: false })).toBe(ROUTE_COLOR);
  });

  it('uses a different colour when the setting is on, so the change is visible', () => {
    // Before this, the toggle saved but the minimap always drew the same green.
    expect(routeColorFor({ colorblindRoute: true })).toBe(HIGH_CONTRAST_ROUTE_COLOR);
    expect(HIGH_CONTRAST_ROUTE_COLOR).not.toBe(ROUTE_COLOR);
  });
});
