import * as THREE from 'three';

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
    { repeatX: 1, repeatY: 6, srgb: true }
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
    { repeatX: 1, repeatY: 12, srgb: true }
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

      // Faint storey horizontal bands
      ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
      for (let y = 0; y < h; y += 32) {
        ctx.fillRect(0, y, w, 2);
      }
    },
    { repeatX: 2, repeatY: 4, srgb: true }
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
