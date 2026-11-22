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
  const desiredTopInset = CHIP_ROW_INSET_CSS * dpr;
  const minMapHeight = 100 * dpr;
  const topInset =
    height >= desiredTopInset + minMapHeight
      ? desiredTopInset
      : Math.max(0, Math.min(desiredTopInset, height - minMapHeight));
  const usableH = Math.max(24 * dpr, height - topInset);
  const margin = Math.min(60 * dpr, Math.max(8 * dpr, Math.min(width, usableH) * 0.12));
  const availW = Math.max(24 * dpr, width - margin * 2);
  const availH = Math.max(24 * dpr, usableH - margin * 2);
  const baseScale = Math.min(availW / spanX, availH / spanZ) * 0.95;
  const scale = baseScale * zoom;
  const offsetX = (width - spanX * scale) / 2 - minX * scale;
  const offsetZ = topInset + (usableH - spanZ * scale) / 2 - minZ * scale;
  return { scale, offsetX, offsetZ };
}
