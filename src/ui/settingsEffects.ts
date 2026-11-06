// Settings that change what the player sees. Pure, so the mapping is unit tested.

/** The normal route line on the minimap. */
export const ROUTE_COLOR = '#10b981';
/** High-contrast route line: bright yellow stands out on the dark map for colour-blind players. */
export const HIGH_CONTRAST_ROUTE_COLOR = '#fde047';

export function routeColorFor(settings: { colorblindRoute: boolean }): string {
  return settings.colorblindRoute ? HIGH_CONTRAST_ROUTE_COLOR : ROUTE_COLOR;
}
