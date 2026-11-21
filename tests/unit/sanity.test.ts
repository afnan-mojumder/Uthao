import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  verifyProdBundle,
  parseWebpDimensions,
  FORBIDDEN_PROD_PATTERNS,
  MAX_ENTRY_SHELL_GZ_BYTES,
} from '../../scripts/verify-prod-bundle.mjs';

const VALID_INDEX_HTML = `<!DOCTYPE html>
<html>
  <head>
    <meta name="description" content="Uthao — Dhaka motorcycle ride-hailing simulator" />
    <meta property="og:title" content="Uthao" />
    <meta property="og:description" content="Ride the streets of Dhaka" />
    <meta property="og:image" content="/og-cover.webp" />
    <meta property="og:type" content="website" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Uthao" />
    <meta name="twitter:description" content="Ride the streets of Dhaka" />
    <meta name="twitter:image" content="/og-cover.webp" />
    <script type="module" src="/assets/index-test.js"></script>
  </head>
  <body></body>
</html>`;

const VALID_HEADERS = `/*
  Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; connect-src 'self' blob:
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/fonts/*
  Cache-Control: public, max-age=31536000, immutable
`;

function makeMinimal1200x630WebpHeader(): Buffer {
  // Minimal valid RIFF....WEBPVP8X header with width=1200 (1199 LE24) and height=630 (629 LE24)
  const buf = Buffer.alloc(30);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(22, 4);
  buf.write('WEBP', 8, 'ascii');
  buf.write('VP8X', 12, 'ascii');
  buf.writeUInt32LE(10, 16);
  buf.writeUIntLE(1200 - 1, 24, 3);
  buf.writeUIntLE(630 - 1, 27, 3);
  return buf;
}

describe('Sanity & P8.1/P8.3 Production Bundle Verification Gate', () => {
  it('1 + 1 equals 2', () => {
    expect(1 + 1).toBe(2);
  });

  it('rejects bundles containing forbidden debug strings, missing SEO/headers, or oversize entry shell', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'uthao-bundle-test-'));
    const assetsDir = path.join(tmpDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });

    fs.writeFileSync(
      path.join(tmpDir, 'index.html'),
      '<!DOCTYPE html><html><head><script type="module" src="/assets/index-test.js"></script></head><body></body></html>'
    );
    fs.writeFileSync(
      path.join(assetsDir, 'index-test.js'),
      'console.log(window.__uthao, window.__uthaoUi, "spawnBargainer", "req_debug_spawn", "Uthao Map Viewer", "testloop");'
    );

    const failRes = verifyProdBundle(tmpDir, { rootDir: tmpDir });
    expect(failRes.ok).toBe(false);
    for (const pattern of FORBIDDEN_PROD_PATTERNS) {
      expect(failRes.errors.some((e: string) => e.includes(pattern))).toBe(true);
    }
    expect(failRes.errors.some((e: string) => e.includes('og:image'))).toBe(true);
    expect(failRes.errors.some((e: string) => e.includes('dist/_headers'))).toBe(true);
    expect(failRes.errors.some((e: string) => e.includes('LICENSE'))).toBe(true);

    // Populate clean bundle + SEO/OG/headers/legal files
    fs.writeFileSync(path.join(tmpDir, 'index.html'), VALID_INDEX_HTML);
    fs.writeFileSync(path.join(assetsDir, 'index-test.js'), 'console.log("Uthao clean prod");');
    fs.writeFileSync(path.join(tmpDir, 'og-cover.webp'), makeMinimal1200x630WebpHeader());
    fs.writeFileSync(path.join(tmpDir, '_headers'), VALID_HEADERS);
    fs.writeFileSync(path.join(tmpDir, 'robots.txt'), 'User-agent: *\nAllow: /\n');
    fs.writeFileSync(path.join(tmpDir, 'LICENSE'), 'MIT License '.repeat(20));
    fs.writeFileSync(path.join(tmpDir, 'PRIVACY.md'), '# Privacy Policy '.repeat(20));
    fs.writeFileSync(path.join(tmpDir, 'THIRD_PARTY_LICENSES.md'), '# Third-Party Licenses '.repeat(20));

    const passRes = verifyProdBundle(tmpDir, { rootDir: tmpDir });
    expect(passRes.errors).toEqual([]);
    expect(passRes.ok).toBe(true);
    expect(passRes.entryShellGzBytes).toBeLessThanOrEqual(MAX_ENTRY_SHELL_GZ_BYTES);

    // Reject _headers if WASM or blob: CSP directives required by Meshopt + GLTFLoader are stripped
    fs.writeFileSync(
      path.join(tmpDir, '_headers'),
      VALID_HEADERS.replace(" 'wasm-unsafe-eval'", '').replace(" blob:", '')
    );
    const badCspRes = verifyProdBundle(tmpDir, { rootDir: tmpDir });
    expect(badCspRes.ok).toBe(false);
    expect(badCspRes.errors.some((e: string) => e.includes('wasm-unsafe-eval'))).toBe(true);
    expect(badCspRes.errors.some((e: string) => e.includes("connect-src 'self' blob:"))).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('verifies root legal files, public/og-cover.webp (1200x630 WebP), public/_headers, and public/robots.txt exist', () => {
    const rootDir = process.cwd();
    for (const file of ['LICENSE', 'PRIVACY.md', 'THIRD_PARTY_LICENSES.md']) {
      const p = path.join(rootDir, file);
      expect(fs.existsSync(p), `Missing ${file}`).toBe(true);
      expect(fs.statSync(p).size).toBeGreaterThan(200);
    }

    const ogPath = path.join(rootDir, 'public', 'og-cover.webp');
    expect(fs.existsSync(ogPath), 'Missing public/og-cover.webp').toBe(true);
    const dim = parseWebpDimensions(fs.readFileSync(ogPath));
    expect(dim).toEqual({ valid: true, width: 1200, height: 630 });

    const headersPath = path.join(rootDir, 'public', '_headers');
    expect(fs.existsSync(headersPath), 'Missing public/_headers').toBe(true);
    const headersText = fs.readFileSync(headersPath, 'utf8');
    expect(headersText).toContain('Content-Security-Policy');
    expect(headersText).toContain("'wasm-unsafe-eval'");
    expect(headersText).toContain("connect-src 'self' blob:");
    expect(headersText).toContain('X-Content-Type-Options: nosniff');
    expect(headersText).toContain('Referrer-Policy: strict-origin-when-cross-origin');
    expect(headersText).toContain('max-age=31536000, immutable');

    const robotsPath = path.join(rootDir, 'public', 'robots.txt');
    expect(fs.existsSync(robotsPath), 'Missing public/robots.txt').toBe(true);
  });

  it('verifies built dist/ passes P8.1 & P8.3 production bundle hygiene and <= 400 KB gz entry shell budget when dist/ exists', () => {
    const distDir = path.resolve(process.cwd(), 'dist');
    if (!fs.existsSync(path.join(distDir, 'index.html'))) {
      return;
    }
    const result = verifyProdBundle(distDir);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.entryShellGzBytes).toBeGreaterThan(0);
    expect(result.entryShellGzBytes).toBeLessThanOrEqual(MAX_ENTRY_SHELL_GZ_BYTES);
  });
});
