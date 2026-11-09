/** CSS pixels the POI chip row covers at the top of the map. */
export const CHIP_ROW_INSET_CSS = 84;

export interface MapBounds {
  minX: number;
  minZ: number;
  spanX: number;
  spanZ: number;
}

/**
 * World-to-canvas transform for the map. The district is fitted below the chip
 * row, so nothing (the player marker included) is drawn under the chips (audit).
 */
export function mapLayout(
  width: number,
  height: number,
  dpr: number,
  bounds: MapBounds,
  zoom: number
): { scale: number; offsetX: number; offsetZ: number } {
  const { minX, minZ, spanX, spanZ } = bounds;
  const topInset = CHIP_ROW_INSET_CSS * dpr;
  const margin = 60 * dpr;
  const usableH = height - topInset;
  const baseScale = Math.min((width - margin * 2) / spanX, (usableH - margin * 2) / spanZ) * 0.95;
  const scale = baseScale * zoom;
  const offsetX = (width - spanX * scale) / 2 - minX * scale;
  const offsetZ = topInset + (usableH - spanZ * scale) / 2 - minZ * scale;
  return { scale, offsetX, offsetZ };
}
