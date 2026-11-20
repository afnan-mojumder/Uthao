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

async function generateOgCoverWebp() {
  const sharp = (await import('sharp')).default;
  const ogSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0b1120"/>
      <stop offset="35%" stop-color="#1e1b4b"/>
      <stop offset="68%" stop-color="#7c2d12"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <radialGradient id="sunGlow" cx="72%" cy="54%" r="36%">
      <stop offset="0%" stop-color="#fde047" stop-opacity="0.95"/>
      <stop offset="35%" stop-color="#f97316" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#7c2d12" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="roadGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#090d16"/>
    </linearGradient>
    <linearGradient id="brandGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#22c55e"/>
      <stop offset="55%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <linearGradient id="cardBg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f172a" stop-opacity="0.92"/>
      <stop offset="100%" stop-color="#020617" stop-opacity="0.82"/>
    </linearGradient>
  </defs>

  <!-- Dhaka Golden-Hour Sunset Sky -->
  <rect width="1200" height="630" fill="url(#skyGrad)"/>
  <rect width="1200" height="630" fill="url(#sunGlow)"/>

  <!-- Setting Sun over Dhaka Flyover -->
  <circle cx="865" cy="325" r="88" fill="#fef08a" opacity="0.9"/>
  <circle cx="865" cy="325" r="118" fill="#f59e0b" opacity="0.28"/>

  <!-- Distant Dhaka Skyline & Rooftop Water Tanks -->
  <g fill="#0f172a" opacity="0.88">
    <rect x="40" y="190" width="75" height="240"/>
    <rect x="58" y="176" width="22" height="14"/>
    <rect x="125" y="230" width="90" height="200"/>
    <rect x="225" y="155" width="105" height="275"/>
    <rect x="250" y="140" width="28" height="15"/>
    <rect x="345" y="205" width="85" height="225"/>
    <rect x="445" y="170" width="110" height="260"/>
    <rect x="570" y="215" width="95" height="215"/>
    <rect x="680" y="185" width="88" height="245"/>
    <rect x="785" y="240" width="78" height="190"/>
    <rect x="975" y="195" width="92" height="235"/>
    <rect x="1080" y="160" width="95" height="270"/>
    <rect x="1105" y="144" width="26" height="16"/>
  </g>

  <!-- Glowing Apartment Windows & Neon Shop Signs -->
  <g fill="#fbbf24" opacity="0.75">
    <rect x="242" y="180" width="14" height="18" rx="2"/>
    <rect x="272" y="180" width="14" height="18" rx="2"/>
    <rect x="242" y="215" width="14" height="18" rx="2"/>
    <rect x="298" y="215" width="14" height="18" rx="2"/>
    <rect x="465" y="195" width="16" height="20" rx="2"/>
    <rect x="498" y="195" width="16" height="20" rx="2"/>
    <rect x="465" y="230" width="16" height="20" rx="2"/>
    <rect x="702" y="210" width="14" height="18" rx="2"/>
    <rect x="732" y="242" width="14" height="18" rx="2"/>
    <rect x="1102" y="190" width="16" height="20" rx="2"/>
    <rect x="1134" y="222" width="16" height="20" rx="2"/>
  </g>

  <!-- Mohakhal Flyover Viaduct & Pillars -->
  <path d="M0 355 Q620 325 1200 348 L1200 374 Q620 352 0 382 Z" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5" opacity="0.92"/>
  <rect x="180" y="370" width="26" height="70" fill="#0f172a"/>
  <rect x="520" y="362" width="28" height="78" fill="#0f172a"/>
  <rect x="880" y="364" width="28" height="76" fill="#0f172a"/>

  <!-- Overhead Utility Wires -->
  <path d="M0 130 Q320 175 640 135 T1200 150" fill="none" stroke="#0f172a" stroke-width="2" opacity="0.65"/>
  <path d="M0 142 Q320 190 640 148 T1200 165" fill="none" stroke="#0f172a" stroke-width="1.5" opacity="0.5"/>

  <!-- Dhaka Asphalt Road & Lane Markings -->
  <rect x="0" y="420" width="1200" height="210" fill="url(#roadGrad)"/>
  <line x1="0" y1="422" x2="1200" y2="422" stroke="#f59e0b" stroke-width="4" opacity="0.85"/>
  <line x1="0" y1="518" x2="1200" y2="518" stroke="#e2e8f0" stroke-width="5" stroke-dasharray="48 34" opacity="0.7"/>

  <!-- Green CNG Auto-Rickshaw Silhouette (Midground Right) -->
  <g transform="translate(950, 385)">
    <path d="M15 62 L28 18 Q65 8 112 20 L128 62 Z" fill="#15803d" stroke="#22c55e" stroke-width="2.5"/>
    <rect x="34" y="25" width="36" height="24" rx="4" fill="#0f172a"/>
    <rect x="76" y="25" width="32" height="24" rx="4" fill="#0f172a"/>
    <circle cx="34" cy="68" r="16" fill="#090d16" stroke="#94a3b8" stroke-width="4"/>
    <circle cx="110" cy="68" r="16" fill="#090d16" stroke="#94a3b8" stroke-width="4"/>
    <circle cx="16" cy="52" r="5" fill="#fef08a"/>
  </g>

  <!-- Colorful Cycle Rickshaw Hood Silhouette (Midground Center-Right) -->
  <g transform="translate(650, 376)">
    <path d="M35 65 Q38 15 80 18 L92 65 Z" fill="#dc2626" stroke="#f59e0b" stroke-width="3"/>
    <circle cx="48" cy="74" r="20" fill="none" stroke="#cbd5e1" stroke-width="3.5"/>
    <circle cx="106" cy="74" r="20" fill="none" stroke="#cbd5e1" stroke-width="3.5"/>
    <line x1="68" y1="58" x2="106" y2="74" stroke="#38bdf8" stroke-width="3.5"/>
  </g>

  <!-- Foreground Hero Motorcycle & Rider (Right Golden-Hour Spotlight) -->
  <g transform="translate(745, 425)">
    <!-- Headlight beam -->
    <polygon points="235,55 445,15 445,125" fill="#fef08a" opacity="0.22"/>
    <!-- Rear & Front Wheels -->
    <circle cx="62" cy="108" r="44" fill="#090d16" stroke="#22c55e" stroke-width="8"/>
    <circle cx="62" cy="108" r="16" fill="#38bdf8"/>
    <circle cx="222" cy="108" r="44" fill="#090d16" stroke="#22c55e" stroke-width="8"/>
    <circle cx="222" cy="108" r="16" fill="#38bdf8"/>
    <!-- Frame, Tank & Exhaust -->
    <path d="M48 108 L115 104 L158 52 L222 108" fill="none" stroke="#cbd5e1" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M108 55 Q142 26 184 44 L166 74 L112 74 Z" fill="#f59e0b" stroke="#fef08a" stroke-width="2.5"/>
    <path d="M68 62 L120 64 L112 80 L58 76 Z" fill="#1e293b" stroke="#94a3b8" stroke-width="2"/>
    <path d="M222 108 L184 22 L162 28" fill="none" stroke="#22c55e" stroke-width="9" stroke-linecap="round"/>
    <!-- Headlight -->
    <circle cx="198" cy="42" r="11" fill="#fef08a"/>
    <!-- Rider Silhouette + Helmet -->
    <path d="M95 62 Q105 15 138 12 L156 38 L128 64 Z" fill="#0f172a" stroke="#38bdf8" stroke-width="2.5"/>
    <circle cx="132" cy="-6" r="20" fill="#22c55e" stroke="#f8fafc" stroke-width="3"/>
    <path d="M136 -12 L152 -6 L148 4 L134 2 Z" fill="#38bdf8"/>
  </g>

  <!-- Left Glassmorphic Title & Viral Preview Card -->
  <rect x="52" y="64" width="615" height="485" rx="28" fill="url(#cardBg)" stroke="#22c55e" stroke-opacity="0.45" stroke-width="2.5"/>

  <!-- Top Pill Badge -->
  <rect x="88" y="102" width="385" height="42" rx="21" fill="#052e16" stroke="#22c55e" stroke-width="1.8"/>
  <circle cx="114" cy="123" r="7" fill="#22c55e"/>
  <text x="132" y="129" font-family="'Hind Siliguri', 'Noto Sans Bengali', system-ui, sans-serif" font-size="18" font-weight="800" fill="#22c55e" letter-spacing="1.5">DHAKA MOTORCYCLE RIDE-SHARE SIM</text>

  <!-- Main Bilingual Brand Title -->
  <text x="88" y="232" font-family="'Hind Siliguri', 'Noto Sans Bengali', system-ui, sans-serif" font-size="86" font-weight="900" fill="#f8fafc" letter-spacing="2">উঠাও • UTHAO</text>
  <rect x="88" y="254" width="520" height="6" rx="3" fill="url(#brandGrad)"/>

  <!-- Subtitle & Hook -->
  <text x="88" y="308" font-family="'Hind Siliguri', 'Noto Sans Bengali', system-ui, sans-serif" font-size="29" font-weight="700" fill="#38bdf8">মিটার চলে না — Bargain, Ride &amp; Hustle</text>
  <text x="88" y="352" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="500" fill="#cbd5e1">Navigate 7 Dhaka districts, negotiate fares, dodge</text>
  <text x="88" y="384" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="500" fill="#cbd5e1">rush-hour CNGs &amp; monsoon floods, and build your workshop.</text>

  <!-- Feature Pills -->
  <g transform="translate(88, 422)">
    <rect x="0" y="0" width="166" height="44" rx="12" fill="#1e293b" stroke="#38bdf8" stroke-width="1.5"/>
    <text x="83" y="28" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#f8fafc" text-anchor="middle">7 Districts</text>

    <rect x="182" y="0" width="176" height="44" rx="12" fill="#1e293b" stroke="#f59e0b" stroke-width="1.5"/>
    <text x="270" y="28" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#fbbf24" text-anchor="middle">20-Day Career</text>

    <rect x="374" y="0" width="168" height="44" rx="12" fill="#1e293b" stroke="#22c55e" stroke-width="1.5"/>
    <text x="458" y="28" font-family="system-ui, sans-serif" font-size="18" font-weight="700" fill="#4ade80" text-anchor="middle"> বাংলা + EN</text>
  </g>

  <!-- Footer tag -->
  <text x="88" y="514" font-family="system-ui, sans-serif" font-size="17" font-weight="600" fill="#94a3b8" letter-spacing="1">PLAY INSTANTLY IN BROWSER • DESKTOP &amp; MOBILE WEBGL2</text>
</svg>`;

  const ogOutPath = path.resolve('public/og-cover.webp');
  await sharp(Buffer.from(ogSvg))
    .resize(1200, 630, { fit: 'fill' })
    .webp({ quality: 90, effort: 6 })
    .toFile(ogOutPath);
  console.log('OpenGraph cover generated successfully at public/og-cover.webp (1200x630)');
}

await generateOgCoverWebp();
