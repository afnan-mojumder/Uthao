import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_DIST_DIR = path.resolve(ROOT_DIR, 'dist');

export const FORBIDDEN_PROD_PATTERNS = [
  '__uthao',
  '__uthaoUi',
  'spawnBargainer',
  'req_debug_spawn',
  'Uthao Map Viewer',
  'testloop',
];

export const MAX_ENTRY_SHELL_GZ_BYTES = 400 * 1024; // 400 KB gzipped
export const MAX_DISTRICT_CHUNK_GZ_BYTES = 2.5 * 1024 * 1024; // 2.5 MB gzipped

/**
 * Inspects a WebP buffer header (VP8 / VP8L / VP8X) and returns { valid, width, height }.
 */
export function parseWebpDimensions(buf) {
  if (!buf || buf.byteLength < 30) {
    return { valid: false, width: 0, height: 0 };
  }
  const riff = buf.subarray(0, 4).toString('ascii');
  const webp = buf.subarray(8, 12).toString('ascii');
  if (riff !== 'RIFF' || webp !== 'WEBP') {
    return { valid: false, width: 0, height: 0 };
  }
  const chunkType = buf.subarray(12, 16).toString('ascii');
  if (chunkType === 'VP8X' && buf.byteLength >= 30) {
    const width = 1 + buf.readUIntLE(24, 3);
    const height = 1 + buf.readUIntLE(27, 3);
    return { valid: true, width, height };
  }
  if (chunkType === 'VP8 ' && buf.byteLength >= 30) {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { valid: true, width, height };
  }
  if (chunkType === 'VP8L' && buf.byteLength >= 25) {
    const bits = buf.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return { valid: true, width, height };
  }
  return { valid: true, width: 0, height: 0 };
}

/**
 * Audits a built `dist/` folder for:
 * 1. Zero debug surfaces / testloop leaks in `dist/assets/*.js`.
 * 2. Initial entry JS shell (entry `<script type="module">` + any `<link rel="modulepreload">` in `dist/index.html`) <= 400 KB gzipped.
 * 3. Every district chunk <= 2.5 MB gzipped.
 * 4. P8.3 SEO, OpenGraph (`og-cover.webp` 1200x630), Twitter Card meta tags, `_headers` (CSP + immutable cache), `robots.txt`, and root legal files (`LICENSE`, `PRIVACY.md`, `THIRD_PARTY_LICENSES.md`).
 */
export function verifyProdBundle(distDir = DEFAULT_DIST_DIR, opts = {}) {
  const rootDir = opts.rootDir ?? ROOT_DIR;
  const errors = [];
  const assetsDir = path.join(distDir, 'assets');
  const indexHtmlPath = path.join(distDir, 'index.html');

  if (!fs.existsSync(indexHtmlPath)) {
    return {
      ok: false,
      errors: [`Missing ${indexHtmlPath}. Run 'npm run build' first.`],
      entryShellGzBytes: 0,
      entryFiles: [],
      districtChunks: [],
    };
  }

  if (!fs.existsSync(assetsDir)) {
    return {
      ok: false,
      errors: [`Missing ${assetsDir}. Run 'npm run build' first.`],
      entryShellGzBytes: 0,
      entryFiles: [],
      districtChunks: [],
    };
  }

  const assetFiles = fs.readdirSync(assetsDir);
  const jsFiles = assetFiles.filter((f) => f.endsWith('.js'));

  // 1. Scan all JS files in dist/assets/*.js for forbidden debug/test strings
  for (const jsFile of jsFiles) {
    const fullPath = path.join(assetsDir, jsFile);
    const content = fs.readFileSync(fullPath, 'utf8');
    for (const pattern of FORBIDDEN_PROD_PATTERNS) {
      if (content.includes(pattern)) {
        errors.push(`Forbidden debug/test pattern "${pattern}" found in dist/assets/${jsFile}`);
      }
    }
  }

  // 2. Compute gzipped size of initial entry JS shell from dist/index.html
  const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
  const entryAssetSet = new Set();

  // Match <script type="module" ... src="/assets/...">
  for (const m of indexHtml.matchAll(/<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']\/?assets\/([^"']+\.js)["'][^>]*>/gi)) {
    entryAssetSet.add(m[1]);
  }
  for (const m of indexHtml.matchAll(/<script\b[^>]*\bsrc=["']\/?assets\/([^"']+\.js)["'][^>]*\btype=["']module["'][^>]*>/gi)) {
    entryAssetSet.add(m[1]);
  }

  // Match <link rel="modulepreload" ... href="/assets/...">
  for (const m of indexHtml.matchAll(/<link\b[^>]*\brel=["']modulepreload["'][^>]*\bhref=["']\/?assets\/([^"']+\.js)["'][^>]*>/gi)) {
    entryAssetSet.add(m[1]);
  }
  for (const m of indexHtml.matchAll(/<link\b[^>]*\bhref=["']\/?assets\/([^"']+\.js)["'][^>]*\brel=["']modulepreload["'][^>]*>/gi)) {
    entryAssetSet.add(m[1]);
  }

  // Also trace static ESM imports inside any entry/modulepreload JS files
  const queue = [...entryAssetSet];
  while (queue.length > 0) {
    const file = queue.shift();
    const fullPath = path.join(assetsDir, file);
    if (!fs.existsSync(fullPath)) {
      errors.push(`Entry asset referenced in index.html does not exist: dist/assets/${file}`);
      continue;
    }
    const src = fs.readFileSync(fullPath, 'utf8');
    // Match static `from"./chunk.js"` or `import"./chunk.js"` (not dynamic `import("./chunk.js")`)
    for (const m of src.matchAll(/(?:\bfrom\s*|(?:\bimport\s*(?!\()))["']\.\/([^"']+\.js)["']/g)) {
      const imported = m[1];
      if (!entryAssetSet.has(imported)) {
        entryAssetSet.add(imported);
        queue.push(imported);
      }
    }
  }

  let entryShellGzBytes = 0;
  const entryFiles = [];
  for (const file of entryAssetSet) {
    const fullPath = path.join(assetsDir, file);
    if (!fs.existsSync(fullPath)) continue;
    const raw = fs.readFileSync(fullPath);
    const gz = zlib.gzipSync(raw, { level: 9 });
    entryShellGzBytes += gz.byteLength;
    entryFiles.push({ file, rawBytes: raw.byteLength, gzBytes: gz.byteLength });
  }

  if (entryFiles.length === 0) {
    errors.push('Could not locate any entry module script in dist/index.html');
  }

  if (entryShellGzBytes > MAX_ENTRY_SHELL_GZ_BYTES) {
    const kb = (entryShellGzBytes / 1024).toFixed(2);
    const maxKb = (MAX_ENTRY_SHELL_GZ_BYTES / 1024).toFixed(2);
    errors.push(
      `Initial entry JS shell is ${kb} KB gzipped (exceeds ${maxKb} KB budget). Files: ${entryFiles
        .map((e) => `${e.file} (${(e.gzBytes / 1024).toFixed(1)} KB gz)`)
        .join(', ')}`
    );
  }

  // 3. Check district chunk budgets (< 2.5 MB gz each)
  const districtNames = [
    'mirpara',
    'fulgate',
    'dhanbagh',
    'mohakhal',
    'gulbari',
    'puranpara',
    'motinagar',
  ];
  const districtChunks = [];
  for (const jsFile of jsFiles) {
    const lower = jsFile.toLowerCase();
    if (districtNames.some((d) => lower.includes(d))) {
      const fullPath = path.join(assetsDir, jsFile);
      const raw = fs.readFileSync(fullPath);
      const gz = zlib.gzipSync(raw, { level: 9 });
      districtChunks.push({ file: jsFile, rawBytes: raw.byteLength, gzBytes: gz.byteLength });
      if (gz.byteLength > MAX_DISTRICT_CHUNK_GZ_BYTES) {
        errors.push(
          `District chunk ${jsFile} is ${(gz.byteLength / (1024 * 1024)).toFixed(2)} MB gzipped (exceeds 2.50 MB budget)`
        );
      }
    }
  }

  // 4. P8.3 SEO, OpenGraph, Twitter Cards, static CDN headers, robots.txt & legal notices
  const requiredMetaChecks = [
    { label: '<meta name="description">', regex: /<meta\b[^>]*\bname=["']description["'][^>]*\bcontent=["'][^"']+["'][^>]*>/i },
    { label: 'og:title', regex: /<meta\b[^>]*\bproperty=["']og:title["'][^>]*\bcontent=["'][^"']+["'][^>]*>/i },
    { label: 'og:description', regex: /<meta\b[^>]*\bproperty=["']og:description["'][^>]*\bcontent=["'][^"']+["'][^>]*>/i },
    { label: 'og:image (/og-cover.webp)', regex: /<meta\b[^>]*\bproperty=["']og:image["'][^>]*\bcontent=["'][^"']*\/og-cover\.webp["'][^>]*>/i },
    { label: 'og:type', regex: /<meta\b[^>]*\bproperty=["']og:type["'][^>]*\bcontent=["'][^"']+["'][^>]*>/i },
    { label: 'twitter:card', regex: /<meta\b[^>]*\bname=["']twitter:card["'][^>]*\bcontent=["']summary_large_image["'][^>]*>/i },
    { label: 'twitter:title', regex: /<meta\b[^>]*\bname=["']twitter:title["'][^>]*\bcontent=["'][^"']+["'][^>]*>/i },
    { label: 'twitter:description', regex: /<meta\b[^>]*\bname=["']twitter:description["'][^>]*\bcontent=["'][^"']+["'][^>]*>/i },
    { label: 'twitter:image (/og-cover.webp)', regex: /<meta\b[^>]*\bname=["']twitter:image["'][^>]*\bcontent=["'][^"']*\/og-cover\.webp["'][^>]*>/i },
  ];

  for (const check of requiredMetaChecks) {
    if (!check.regex.test(indexHtml)) {
      errors.push(`Missing required SEO/OpenGraph/Twitter tag in dist/index.html: ${check.label}`);
    }
  }

  const ogCoverPath = path.join(distDir, 'og-cover.webp');
  if (!fs.existsSync(ogCoverPath)) {
    errors.push('Missing dist/og-cover.webp OpenGraph cover image');
  } else {
    const ogBuf = fs.readFileSync(ogCoverPath);
    const dim = parseWebpDimensions(ogBuf);
    if (!dim.valid || dim.width !== 1200 || dim.height !== 630) {
      errors.push(
        `Invalid dist/og-cover.webp dimensions or header: expected 1200x630 WebP, got valid=${dim.valid} ${dim.width}x${dim.height}`
      );
    }
  }

  const headersPath = path.join(distDir, '_headers');
  if (!fs.existsSync(headersPath)) {
    errors.push('Missing dist/_headers static CDN headers config');
  } else {
    const headersText = fs.readFileSync(headersPath, 'utf8');
    const requiredHeaderSnippets = [
      'Content-Security-Policy',
      "'wasm-unsafe-eval'",
      "connect-src 'self' blob:",
      'X-Content-Type-Options: nosniff',
      'Referrer-Policy: strict-origin-when-cross-origin',
      '/assets/*',
      '/fonts/*',
      'max-age=31536000, immutable',
    ];
    for (const snippet of requiredHeaderSnippets) {
      if (!headersText.includes(snippet)) {
        errors.push(`dist/_headers missing required directive: "${snippet}"`);
      }
    }
  }

  const robotsPath = path.join(distDir, 'robots.txt');
  if (!fs.existsSync(robotsPath)) {
    errors.push('Missing dist/robots.txt');
  } else {
    const robotsText = fs.readFileSync(robotsPath, 'utf8');
    if (!/User-agent:\s*\*/i.test(robotsText)) {
      errors.push('dist/robots.txt missing "User-agent: *" directive');
    }
  }

  const requiredLegalFiles = ['LICENSE', 'PRIVACY.md', 'THIRD_PARTY_LICENSES.md'];
  for (const legalFile of requiredLegalFiles) {
    const p = path.join(rootDir, legalFile);
    if (!fs.existsSync(p)) {
      errors.push(`Missing root legal/compliance document: ${legalFile}`);
    } else if (fs.statSync(p).size < 100) {
      errors.push(`Root legal/compliance document is empty or too short: ${legalFile}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
    entryShellGzBytes,
    entryFiles,
    districtChunks,
  };
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  const result = verifyProdBundle();
  const entryKb = (result.entryShellGzBytes / 1024).toFixed(2);
  console.log(
    `[verify-prod-bundle] Entry JS shell: ${entryKb} KB gz (${result.entryFiles
      .map((f) => `${f.file}: ${(f.gzBytes / 1024).toFixed(1)} KB`)
      .join(', ')})`
  );
  if (result.districtChunks.length > 0) {
    console.log(
      `[verify-prod-bundle] District chunks: ${result.districtChunks
        .map((f) => `${f.file}: ${(f.gzBytes / 1024).toFixed(1)} KB gz`)
        .join(', ')}`
    );
  }
  if (!result.ok) {
    for (const err of result.errors) {
      console.error(`[verify-prod-bundle] FAIL: ${err}`);
    }
    process.exit(1);
  }
  console.log('[verify-prod-bundle] PASS: 0 debug leaks, entry shell within 400 KB gz budget.');
}
