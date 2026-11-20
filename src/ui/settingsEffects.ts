// Settings that change what the player sees. Pure, so the mapping is unit tested.

/** The normal route line on the minimap. */
export const ROUTE_COLOR = '#10b981';
/** High-contrast route line: bright yellow stands out on the dark map for colour-blind players. */
export const HIGH_CONTRAST_ROUTE_COLOR = '#fde047';

export type UiScale = 1 | 1.15 | 1.3;

export const HIGH_CONTRAST_PALETTE = {
  positive: '#00E5FF',
  warning: '#FDE047',
  danger: '#FF6B4A',
  info: '#7DD3FC',
} as const;

export const STANDARD_PALETTE = {
  positive: '#22C55E',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#38BDF8',
} as const;

export function routeColorFor(settings: { colorblindRoute: boolean }): string {
  return settings.colorblindRoute ? HIGH_CONTRAST_ROUTE_COLOR : ROUTE_COLOR;
}

export function highContrastPaletteFor(settings: { colorblindRoute: boolean }) {
  return settings.colorblindRoute ? HIGH_CONTRAST_PALETTE : STANDARD_PALETTE;
}

export function normalizeUiScale(scale: unknown): UiScale {
  if (scale === 1.15 || scale === 1.3) return scale;
  return 1;
}

export function applyDocumentSettings(
  settings: { reduceMotion: boolean; colorblindRoute: boolean; uiScale?: number },
  doc: Document | undefined = typeof document !== 'undefined' ? document : undefined
): void {
  if (!doc?.documentElement) return;
  doc.documentElement.dataset.reduceMotion = String(settings.reduceMotion);
  doc.documentElement.dataset.highContrast = String(settings.colorblindRoute);
  doc.documentElement.dataset.uiScale = String(normalizeUiScale(settings.uiScale));
}
