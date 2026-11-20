import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

function createCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) c = 0xedb88320 ^ (c >>> 1);
      else c = c >>> 1;
    }
    table[n] = c;
  }
  return table;
}

const crcTable = createCrcTable();
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function writePngChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(12 + len);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const typeAndData = chunk.subarray(4, 8 + len);
  const crc = crc32(typeAndData);
  chunk.writeUInt32BE(crc, 8 + len);
  return chunk;
}

/**
 * Generates an RGBA PNG icon.
 * @param {number} size - Width and height in pixels.
 * @param {object} [opts]
 * @param {boolean} [opts.maskable=false] - When true, scales badge & artwork into the 80% W3C maskable safe zone (radius <= 0.38 * size).
 */
function generatePng(size, opts = {}) {
  const maskable = Boolean(opts.maskable);
  const width = size;
  const height = size;
  const rawScanlines = Buffer.alloc((width * 4 + 1) * height);

  const cx = width / 2;
  const cy = height / 2;
  const scale = maskable ? 0.8 : 1.0;
  const drawSize = size * scale;
  const radius = drawSize * 0.45; // 0.36 * size when maskable (strictly inside 0.40 * size 80% safe zone)
  const rimThickness = Math.max(2, Math.round((size / 64) * scale));

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawScanlines[offset++] = 0; // Filter: none
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.hypot(dx, dy);

      let r = 17, g = 24, b = 39, a = 255; // #111827 dark slate background

      if (dist <= radius) {
        // Outer badge circle
        r = 30; g = 41; b = 59; // #1e293b
        if (dist > radius - rimThickness) {
          // Emerald rim
          r = 16; g = 185; b = 129; // #10b981
        } else {
          // Motorcycle wheels and chassis stylized silhouette
          const distWheelL = Math.hypot(x - (cx - drawSize * 0.2), y - (cy + drawSize * 0.12));
          const distWheelR = Math.hypot(x - (cx + drawSize * 0.2), y - (cy + drawSize * 0.12));

          const wheelRadius = drawSize * 0.11;
          const rimRadius = drawSize * 0.07;

          if (
            (distWheelL <= wheelRadius && distWheelL >= rimRadius * 0.5) ||
            (distWheelR <= wheelRadius && distWheelR >= rimRadius * 0.5)
          ) {
            r = 0; g = 255; b = 102; // #00ff66 neon green
          } else if (distWheelL < rimRadius * 0.5 || distWheelR < rimRadius * 0.5) {
            r = 15; g = 23; b = 42;
          } else if (
            x >= cx - drawSize * 0.25 &&
            x <= cx + drawSize * 0.25 &&
            y >= cy - drawSize * 0.18 &&
            y <= cy + drawSize * 0.12
          ) {
            const relX = (x - cx) / drawSize;
            const relY = (y - cy) / drawSize;
            if (relY >= -0.15 && relY <= 0.05 && relX >= -0.2 && relX <= 0.15) {
              r = 245; g = 158; b = 11; // #f59e0b amber
            } else if (relY >= -0.22 && relY <= -0.12 && relX >= 0.08 && relX <= 0.2) {
              r = 0; g = 255; b = 102; // #00ff66 neon
            }
          }
        }
      }

      rawScanlines[offset++] = r;
      rawScanlines[offset++] = g;
      rawScanlines[offset++] = b;
      rawScanlines[offset++] = a;
    }
  }

  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // 8-bit
  ihdrData[9] = 6; // RGBA
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;
  const ihdrChunk = writePngChunk('IHDR', ihdrData);

  const compressed = zlib.deflateSync(rawScanlines);
  const idatChunk = writePngChunk('IDAT', compressed);

  const iendChunk = writePngChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

/**
 * Wraps a PNG buffer inside a valid Windows ICO container (`00 00 01 00` header).
 */
function generateIcoFromPng(pngBuf, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved = 0
  header.writeUInt16LE(1, 2); // Type = 1 (ICO)
  header.writeUInt16LE(1, 4); // Image count = 1

  const dirEntry = Buffer.alloc(16);
  dirEntry[0] = size >= 256 ? 0 : size; // Width
  dirEntry[1] = size >= 256 ? 0 : size; // Height
  dirEntry[2] = 0; // Color palette
  dirEntry[3] = 0; // Reserved
  dirEntry.writeUInt16LE(1, 4); // Color planes
  dirEntry.writeUInt16LE(32, 6); // Bits per pixel
  dirEntry.writeUInt32LE(pngBuf.length, 8); // Image byte size
  dirEntry.writeUInt32LE(6 + 16, 12); // Offset to PNG data (22)

  return Buffer.concat([header, dirEntry, pngBuf]);
}

const outDir = path.resolve('public/icons');
fs.mkdirSync(outDir, { recursive: true });

const png192 = generatePng(192, { maskable: false });
const png192Maskable = generatePng(192, { maskable: true });
const png512 = generatePng(512, { maskable: false });
const png512Maskable = generatePng(512, { maskable: true });
const png180 = generatePng(180, { maskable: false });
const png32 = generatePng(32, { maskable: false });
const icoBuf = generateIcoFromPng(png32, 32);

// Standard & alias filenames so both legacy and separate any/maskable references resolve cleanly
fs.writeFileSync(path.join(outDir, 'icon-192x192.png'), png192);
fs.writeFileSync(path.join(outDir, 'icon-192.png'), png192);
fs.writeFileSync(path.join(outDir, 'icon-192-maskable.png'), png192Maskable);
fs.writeFileSync(path.join(outDir, 'maskable-icon-192x192.png'), png192Maskable);

fs.writeFileSync(path.join(outDir, 'icon-512x512.png'), png512);
fs.writeFileSync(path.join(outDir, 'icon-512.png'), png512);
fs.writeFileSync(path.join(outDir, 'icon-512-maskable.png'), png512Maskable);
fs.writeFileSync(path.join(outDir, 'maskable-icon-512x512.png'), png512Maskable);

const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <rect width="512" height="512" rx="128" fill="#111827"/>
  <circle cx="256" cy="256" r="220" fill="#1e293b" stroke="#10b981" stroke-width="12"/>
  <circle cx="160" cy="310" r="55" fill="none" stroke="#00ff66" stroke-width="20"/>
  <circle cx="160" cy="310" r="15" fill="#00ff66"/>
  <circle cx="352" cy="310" r="55" fill="none" stroke="#00ff66" stroke-width="20"/>
  <circle cx="352" cy="310" r="15" fill="#00ff66"/>
  <path d="M160 310 L230 310 L270 240 L352 310" fill="none" stroke="#94a3b8" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M210 240 Q240 200 290 220 L270 250 Z" fill="#f59e0b"/>
  <path d="M170 240 Q195 240 220 240" fill="none" stroke="#e2e8f0" stroke-width="14" stroke-linecap="round"/>
  <path d="M352 310 L310 180 L290 190" fill="none" stroke="#00ff66" stroke-width="14" stroke-linecap="round"/>
  <circle cx="320" cy="185" r="12" fill="#fef08a"/>
  <text x="256" y="420" font-family="system-ui, sans-serif" font-size="44" font-weight="900" fill="#10b981" text-anchor="middle" letter-spacing="4">UTHAO</text>
</svg>`;
fs.writeFileSync(path.join(outDir, 'icon.svg'), svgIcon);
fs.writeFileSync(path.resolve('public/apple-touch-icon.png'), png180);
fs.writeFileSync(path.resolve('public/favicon.ico'), icoBuf);

console.log('PWA icons generated successfully in public/icons');
