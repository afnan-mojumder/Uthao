import * as THREE from 'three';

/**
 * Creates procedural canvas-backed textures for Dhaka roads, crosswalks, sidewalks, and signs.
 * Fully self-contained, CC0, and memory-efficient.
 */

// Helper to check if canvas is available (browser vs headless test)
function createCanvas(w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  return canvas;
}

/**
 * Procedural asphalt road texture with lane markings and road borders.
 */
export function createRoadTexture(lanes: number = 2, isAlley: boolean = false): THREE.Texture {
  const canvas = createCanvas(256, 512);
  if (!canvas) {
    // Headless fallback
    return new THREE.Texture();
  }

  const ctx = canvas.getContext('2d')!;

  // 1. Base asphalt color (weathered Dhaka asphalt)
  ctx.fillStyle = isAlley ? '#242220' : '#22252a';
  ctx.fillRect(0, 0, 256, 512);

  // 2. Subtle asphalt gravel noise
  ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
  for (let i = 0; i < 400; i++) {
    const rx = Math.random() * 256;
    const ry = Math.random() * 512;
    ctx.fillRect(rx, ry, 2, 2);
  }

  if (!isAlley) {
    // 3. Road edge solid white lines
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(10, 0, 6, 512); // Left edge
    ctx.fillRect(240, 0, 6, 512); // Right edge

    // 4. Center lane divider (Dashed yellow or white)
    if (lanes >= 2) {
      ctx.fillStyle = '#f59e0b'; // Dhaka Amber dashed center
      const dashLength = 48;
      const gapLength = 32;
      for (let y = 0; y < 512; y += dashLength + gapLength) {
        ctx.fillRect(125, y, 6, dashLength);
      }
    }
  } else {
    // Alley details: brick patches, worn edges, potholes
    ctx.fillStyle = 'rgba(15, 12, 10, 0.4)';
    ctx.beginPath();
    ctx.ellipse(80, 160, 24, 16, 0.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(170, 340, 28, 18, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // Roadside drain grate on the side
    ctx.fillStyle = '#111111';
    ctx.fillRect(12, 200, 14, 50);
    ctx.fillStyle = '#444444';
    for (let dy = 204; dy < 248; dy += 8) {
      ctx.fillRect(14, dy, 10, 3);
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  return texture;
}

/**
 * Procedural Zebra Crosswalk texture for Dhaka intersections (e.g. Farmgate / Dhanmondi).
 */
export function createCrosswalkTexture(): THREE.Texture {
  const canvas = createCanvas(256, 128);
  if (!canvas) return new THREE.Texture();

  const ctx = canvas.getContext('2d')!;

  // Dark asphalt base
  ctx.fillStyle = '#1e2124';
  ctx.fillRect(0, 0, 256, 128);

  // Bold white zebra bars
  ctx.fillStyle = '#f1f5f9';
  const barWidth = 24;
  const gap = 16;
  for (let x = 12; x < 256 - barWidth; x += barWidth + gap) {
    ctx.fillRect(x, 10, barWidth, 108);
  }

  // Stop line at top
  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 120, 256, 8);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}

/**
 * Procedural Sidewalk / Footpath texture with concrete tiles and black/yellow striped curb.
 */
export function createSidewalkTexture(): THREE.Texture {
  const canvas = createCanvas(128, 128);
  if (!canvas) return new THREE.Texture();

  const ctx = canvas.getContext('2d')!;

  // Concrete pavers
  ctx.fillStyle = '#78828f';
  ctx.fillRect(0, 0, 128, 128);

  // Grid mortar joints
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  for (let x = 0; x <= 128; x += 32) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 128);
    ctx.stroke();
  }
  for (let y = 0; y <= 128; y += 32) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(128, y);
    ctx.stroke();
  }

  // Black and yellow striped curb band along one side
  const stripeWidth = 16;
  for (let y = 0; y < 128; y += stripeWidth * 2) {
    ctx.fillStyle = '#f59e0b'; // Dhaka yellow curb
    ctx.fillRect(0, y, 12, stripeWidth);
    ctx.fillStyle = '#1e293b'; // Charcoal black curb
    ctx.fillRect(0, y + stripeWidth, 12, stripeWidth);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(1, 4);
  return texture;
}

/**
 * Procedural Bengali Signboards (Bengali script rendered via HTML5 canvas).
 */
export function createBengaliSignboardTexture(
  mainText: string,
  subText: string,
  bgColor: string = '#d32f2f',
  textColor: string = '#ffffff'
): THREE.Texture {
  const canvas = createCanvas(512, 128);
  if (!canvas) return new THREE.Texture();

  const ctx = canvas.getContext('2d')!;

  // Sign background
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, 512, 128);

  // Outer border
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 6;
  ctx.strokeRect(4, 4, 504, 120);

  // Main Bengali header text
  ctx.fillStyle = textColor;
  ctx.font = 'bold 38px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(mainText, 256, 50);

  // Subtitle / English / contact
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#fef08a'; // Soft yellow secondary text
  ctx.fillText(subText, 256, 95);

  const texture = new THREE.CanvasTexture(canvas);
  return texture;
}
