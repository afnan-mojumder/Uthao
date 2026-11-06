import * as THREE from 'three';
import signsBn from '../../data/dialogue/bn/signs.json';
import signsEn from '../../data/dialogue/en/signs.json';

export type SignLanguage = 'bn' | 'en';

const SIGN_TEXT: Record<SignLanguage, Record<string, string>> = { bn: signsBn, en: signsEn };

/** Language for atlases built from now on. Synced from the saved settings. */
let defaultSignLanguage: SignLanguage = 'bn';

export function setDefaultSignLanguage(lang: SignLanguage): void {
  defaultSignLanguage = lang;
}

/** The contact line printed under each sign, in the sign's language. */
function contactLine(lang: SignLanguage, n: number): string {
  return lang === 'en'
    ? `Prop. Rafiq • Mob 01712-${n}`
    : `প্রোঃ মোঃ রফিক • মোবাঃ ০১৭১২-${n}`;
}

export interface SignUv {
  uMin: number;
  vMin: number;
  uMax: number;
  vMax: number;
}

export interface SignageAtlasOptions {
  signs?: Record<string, string>;
  atlasWidth?: number;
  atlasHeight?: number;
}

const SIGN_COLORS = [
  { bg: '#b91c1c', border: '#fef08a', text: '#ffffff', sub: '#fef08a' }, // Red / Yellow
  { bg: '#15803d', border: '#bbf7d0', text: '#ffffff', sub: '#bbf7d0' }, // Green / White
  { bg: '#1d4ed8', border: '#bfdbfe', text: '#ffffff', sub: '#93c5fd' }, // Blue
  { bg: '#c2410c', border: '#fed7aa', text: '#ffffff', sub: '#ffedd5' }, // Orange
  { bg: '#0f766e', border: '#99f6e4', text: '#ffffff', sub: '#ccfbf1' }, // Teal
  { bg: '#6b21a8', border: '#f3e8ff', text: '#ffffff', sub: '#e9d5ff' }, // Purple
];

export class SignageAtlas {
  signs: Record<string, string>;
  readonly texture: THREE.Texture;
  readonly material: THREE.MeshStandardMaterial;
  readonly uvs: Map<string, SignUv> = new Map();
  readonly signKeys: string[] = [];

  private lang: SignLanguage;
  private canvas: HTMLCanvasElement | null = null;

  constructor(opts: SignageAtlasOptions = {}) {
    this.lang = defaultSignLanguage;
    this.signs = opts.signs ?? SIGN_TEXT[this.lang];
    this.signKeys = Object.keys(this.signs);
    const width = opts.atlasWidth ?? 1024;
    const height = opts.atlasHeight ?? 1024;

    const canvas = this.createAtlasCanvas(width, height);
    if (canvas) {
      this.texture = new THREE.CanvasTexture(canvas as unknown as HTMLCanvasElement);
      this.texture.colorSpace = THREE.SRGBColorSpace;
      this.texture.generateMipmaps = true;
      this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    } else {
      // Fallback in headless / node environment without HTMLCanvas
      const data = new Uint8Array([255, 255, 255, 255]);
      this.texture = new THREE.DataTexture(data, 1, 1);
      this.texture.needsUpdate = true;
    }

    this.material = new THREE.MeshStandardMaterial({
      map: this.texture,
      roughness: 0.5,
      metalness: 0.1,
    });
  }

  private createAtlasCanvas(totalWidth: number, totalHeight: number): unknown {
    if (typeof document === 'undefined' || !document.createElement) {
      // Assign fallback UVs for headless tests
      const cols = 2;
      const rows = Math.ceil(this.signKeys.length / cols);
      for (let i = 0; i < this.signKeys.length; i++) {
        const key = this.signKeys[i]!;
        const col = i % cols;
        const row = Math.floor(i / cols);
        this.uvs.set(key, {
          uMin: col / cols,
          vMin: row / rows,
          uMax: (col + 1) / cols,
          vMax: (row + 1) / rows,
        });
      }
      return null;
    }

    const canvas = document.createElement('canvas');
    canvas.width = totalWidth;
    canvas.height = totalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    this.canvas = canvas;
    this.paint(ctx, totalWidth, totalHeight);
    return canvas;
  }

  /** Paints every sign into the atlas and records where each one sits. */
  private paint(ctx: CanvasRenderingContext2D, totalWidth: number, totalHeight: number): void {
    // Fill dark background
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, totalWidth, totalHeight);

    const cols = 2;
    const rows = Math.ceil(Math.max(1, this.signKeys.length) / cols);
    const cellW = totalWidth / cols;
    const cellH = totalHeight / rows;

    for (let i = 0; i < this.signKeys.length; i++) {
      const key = this.signKeys[i]!;
      const text = this.signs[key] ?? key;
      const col = i % cols;
      const row = Math.floor(i / cols);

      const x = col * cellW;
      const y = row * cellH;
      const colorScheme = SIGN_COLORS[i % SIGN_COLORS.length]!;

      // Background plate
      ctx.fillStyle = colorScheme.bg;
      ctx.fillRect(x + 4, y + 4, cellW - 8, cellH - 8);

      // Border accents
      ctx.strokeStyle = colorScheme.border;
      ctx.lineWidth = 4;
      ctx.strokeRect(x + 8, y + 8, cellW - 16, cellH - 16);

      // Top corner brackets (Dhaka shop design touch)
      ctx.fillStyle = colorScheme.border;
      ctx.fillRect(x + 10, y + 10, 16, 4);
      ctx.fillRect(x + 10, y + 10, 4, 16);
      ctx.fillRect(x + cellW - 26, y + 10, 16, 4);
      ctx.fillRect(x + cellW - 14, y + 10, 4, 16);

      // Main Bengali text
      ctx.fillStyle = colorScheme.text;
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x + cellW / 2, y + cellH / 2 - 10, cellW - 40);

      // Decorative subtitle / contact banner
      ctx.fillStyle = colorScheme.sub;
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(
        contactLine(this.lang, 100000 + i * 27),
        x + cellW / 2,
        y + cellH / 2 + 28,
        cellW - 50
      );

      // Invert Y for Three.js texture coordinate system
      const uMin = (x + 4) / totalWidth;
      const uMax = (x + cellW - 4) / totalWidth;
      const vMax = 1.0 - (y + 4) / totalHeight;
      const vMin = 1.0 - (y + cellH - 4) / totalHeight;

      this.uvs.set(key, { uMin, vMin, uMax, vMax });
    }
  }

  /** Switches the sign text of an existing atlas, e.g. after a language change. */
  setLanguage(lang: SignLanguage): void {
    if (lang === this.lang) return;
    this.lang = lang;
    this.signs = SIGN_TEXT[lang];
    if (this.canvas) {
      const ctx = this.canvas.getContext('2d');
      if (ctx) this.paint(ctx, this.canvas.width, this.canvas.height);
      this.texture.needsUpdate = true;
    }
  }

  getUv(signKey: string): SignUv {
    const uv = this.uvs.get(signKey);
    if (uv) return uv;
    // Default UV fallback
    return { uMin: 0, vMin: 0, uMax: 0.5, vMax: 0.5 };
  }

  createSignboardMesh(
    signKey: string,
    width = 3.6,
    height = 0.9,
    depth = 0.08
  ): THREE.Mesh {
    const geo = new THREE.BoxGeometry(width, height, depth);
    const uv = this.getUv(signKey);

    // Apply custom UVs to the front face (face index 4, vertices 16..19 in standard BoxGeometry)
    const uvAttr = geo.attributes.uv;
    if (uvAttr) {
      // Front face (+Z)
      uvAttr.setXY(16, uv.uMin, uv.vMax);
      uvAttr.setXY(17, uv.uMax, uv.vMax);
      uvAttr.setXY(18, uv.uMin, uv.vMin);
      uvAttr.setXY(19, uv.uMax, uv.vMin);
      uvAttr.needsUpdate = true;
    }

    const mesh = new THREE.Mesh(geo, this.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
