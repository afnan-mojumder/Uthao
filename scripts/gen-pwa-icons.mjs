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

function generatePng(size) {
  const width = size;
  const height = size;
  const rawScanlines = Buffer.alloc((width * 4 + 1) * height);

  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.45;

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
        if (dist > radius - 8) {
          // Emerald rim
          r = 16; g = 185; b = 129; // #10b981
        } else {
          // Motorcycle wheels and chassis stylized silhouette
          const distWheelL = Math.hypot(x - (cx - size * 0.2), y - (cy + size * 0.12));
          const distWheelR = Math.hypot(x - (cx + size * 0.2), y - (cy + size * 0.12));

          const wheelRadius = size * 0.11;
          const rimRadius = size * 0.07;

          if (
            (distWheelL <= wheelRadius && distWheelL >= rimRadius * 0.5) ||
            (distWheelR <= wheelRadius && distWheelR >= rimRadius * 0.5)
          ) {
            r = 0; g = 255; b = 102; // #00ff66 neon green
          } else if (distWheelL < rimRadius * 0.5 || distWheelR < rimRadius * 0.5) {
            r = 15; g = 23; b = 42;
          } else if (
            x >= cx - size * 0.25 &&
            x <= cx + size * 0.25 &&
            y >= cy - size * 0.18 &&
            y <= cy + size * 0.12
          ) {
            const relX = (x - cx) / size;
            const relY = (y - cy) / size;
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

const outDir = path.resolve('public/icons');
fs.mkdirSync(outDir, { recursive: true });

const png192 = generatePng(192);
fs.writeFileSync(path.join(outDir, 'icon-192x192.png'), png192);

const png512 = generatePng(512);
fs.writeFileSync(path.join(outDir, 'icon-512x512.png'), png512);

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
fs.writeFileSync(path.resolve('public/apple-touch-icon.png'), png192);
fs.writeFileSync(path.resolve('public/favicon.ico'), png192);

console.log('PWA icons generated successfully in public/icons');
