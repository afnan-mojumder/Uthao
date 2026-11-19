import * as THREE from 'three';

export const ASPHALT_TILE_M = 4.0;
export const SIDEWALK_TILE_M = 1.6;
export const FACADE_TILE_U_M = 6.4;
export const FACADE_TILE_V_M = 12.8;

/**
 * Scales PlaneGeometry UVs in world meters so road/paving textures never stretch
 * with segment length or width.
 */
export function scalePlaneUvs(
  geo: THREE.BufferGeometry,
  widthM: number,
  lengthM: number,
  tileUM: number,
  tileVM: number
): void {
  const uv = geo.getAttribute('uv');
  if (!uv) return;
  const su = widthM / Math.max(tileUM, 0.01);
  const sv = lengthM / Math.max(tileVM, 0.01);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
}

/**
 * Scales CircleGeometry / disk UVs in world meters around the center.
 */
export function scaleDiskUvs(
  geo: THREE.BufferGeometry,
  radiusM: number,
  tileUM: number,
  tileVM: number
): void {
  const uv = geo.getAttribute('uv');
  if (!uv) return;
  const dia = radiusM * 2;
  const su = dia / Math.max(tileUM, 0.01);
  const sv = dia / Math.max(tileVM, 0.01);
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  }
  uv.needsUpdate = true;
}

/**
 * Scales BoxGeometry UVs per face in world meters:
 * faces 0,1 (+X/-X): depth x height; faces 2,3 (+Y/-Y): width x depth;
 * faces 4,5 (+Z/-Z): width x height.
 */
export function scaleBoxUvs(
  geo: THREE.BufferGeometry,
  widthM: number,
  heightM: number,
  depthM: number,
  tileUM: number,
  tileVM: number
): void {
  const uv = geo.getAttribute('uv');
  if (!uv || uv.count < 24) return;
  const uTile = Math.max(tileUM, 0.01);
  const vTile = Math.max(tileVM, 0.01);
  const faceScales: readonly [number, number][] = [
    [depthM / uTile, heightM / vTile], // +X
    [depthM / uTile, heightM / vTile], // -X
    [widthM / uTile, depthM / vTile],  // +Y
    [widthM / uTile, depthM / vTile],  // -Y
    [widthM / uTile, heightM / vTile], // +Z
    [widthM / uTile, heightM / vTile], // -Z
  ];
  for (let f = 0; f < 6; f++) {
    const [su, sv] = faceScales[f]!;
    const base = f * 4;
    for (let k = 0; k < 4; k++) {
      const idx = base + k;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  uv.needsUpdate = true;
}

function makeCanvasTexture(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  opts: { repeatX?: number; repeatY?: number; srgb?: boolean } = {}
): THREE.CanvasTexture | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  draw(ctx, width, height);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (opts.repeatX !== undefined && opts.repeatY !== undefined) {
    tex.repeat.set(opts.repeatX, opts.repeatY);
  }
  if (opts.srgb) {
    tex.colorSpace = THREE.SRGBColorSpace;
  }
  tex.userData.shared = true;
  tex.needsUpdate = true;
  return tex;
}

let cachedAsphalt: THREE.CanvasTexture | null | undefined;
let cachedSidewalk: THREE.CanvasTexture | null | undefined;
let cachedFacade: THREE.CanvasTexture | null | undefined;
let cachedWindowEmissive: THREE.CanvasTexture | null | undefined;

export function getAsphaltTexture(): THREE.CanvasTexture | null {
  if (cachedAsphalt !== undefined) return cachedAsphalt;
  cachedAsphalt = makeCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#2a2e33';
      ctx.fillRect(0, 0, w, h);

      // Subtle aggregate grain (deterministic LCG)
      let s = 1337;
      const rand = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
      };

      for (let i = 0; i < 900; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const v = Math.floor(32 + rand() * 34);
        ctx.fillStyle = `rgb(${v},${v + 1},${v + 3})`;
        ctx.fillRect(x, y, 2, 2);
      }

      // Subtle tire-wear tracks along lanes
      ctx.fillStyle = 'rgba(18, 20, 24, 0.25)';
      ctx.fillRect(w * 0.2, 0, w * 0.16, h);
      ctx.fillRect(w * 0.64, 0, w * 0.16, h);
    },
    { repeatX: 1, repeatY: 1, srgb: true }
  );
  return cachedAsphalt;
}

export function getSidewalkTexture(): THREE.CanvasTexture | null {
  if (cachedSidewalk !== undefined) return cachedSidewalk;
  cachedSidewalk = makeCanvasTexture(
    64,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#8b877d';
      ctx.fillRect(0, 0, w, h);

      ctx.strokeStyle = 'rgba(60, 58, 52, 0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
      ctx.beginPath();
      ctx.moveTo(0, h / 2);
      ctx.lineTo(w, h / 2);
      ctx.stroke();
    },
    { repeatX: 1, repeatY: 1, srgb: true }
  );
  return cachedSidewalk;
}

export function getFacadeTexture(): THREE.CanvasTexture | null {
  if (cachedFacade !== undefined) return cachedFacade;
  cachedFacade = makeCanvasTexture(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#e5e5e0';
      ctx.fillRect(0, 0, w, h);

      let s = 4242;
      const rand = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
      };

      // Subtle plaster weathering
      for (let i = 0; i < 450; i++) {
        const x = rand() * w;
        const y = rand() * h;
        const shade = Math.floor(205 + rand() * 35);
        ctx.fillStyle = `rgb(${shade},${shade - 2},${shade - 6})`;
        ctx.fillRect(x, y, 3, 2);
      }

      // Faint storey horizontal bands (4 bands per tile = 3.2m per storey over 12.8m tile)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      for (let y = 0; y < h; y += 32) {
        ctx.fillRect(0, y, w, 2);
      }
    },
    { repeatX: 1, repeatY: 1, srgb: true }
  );
  return cachedFacade;
}

export function getWindowEmissiveTexture(): THREE.CanvasTexture | null {
  if (cachedWindowEmissive !== undefined) return cachedWindowEmissive;
  cachedWindowEmissive = makeCanvasTexture(
    64,
    64,
    (ctx, w, h) => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, w, h);

      // Warm lit window panes
      const cols = 4;
      const rows = 4;
      const cw = w / cols;
      const rh = h / rows;
      let s = 9001;
      const rand = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0xffffffff;
      };

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (rand() < 0.62) {
            ctx.fillStyle = rand() < 0.7 ? '#fde68a' : '#bae6fd';
            ctx.fillRect(c * cw + 3, r * rh + 3, cw - 6, rh - 6);
          }
        }
      }
    },
    { repeatX: 1, repeatY: 1, srgb: true }
  );
  return cachedWindowEmissive;
}
