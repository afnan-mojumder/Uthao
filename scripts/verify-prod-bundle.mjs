import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIST_DIR = path.resolve(__dirname, '..', 'dist');

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
 * Audits a built `dist/` folder for:
 * 1. Zero debug surfaces / testloop leaks in `dist/assets/*.js`.
 * 2. Initial entry JS shell (entry `<script type="module">` + any `<link rel="modulepreload">` in `dist/index.html`) <= 400 KB gzipped.
 * 3. Every district chunk <= 2.5 MB gzipped.
 */
export function verifyProdBundle(distDir = DEFAULT_DIST_DIR) {
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
