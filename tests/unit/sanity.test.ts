import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  verifyProdBundle,
  FORBIDDEN_PROD_PATTERNS,
  MAX_ENTRY_SHELL_GZ_BYTES,
} from '../../scripts/verify-prod-bundle.mjs';

describe('Sanity & P8.1 Production Bundle Verification Gate', () => {
  it('1 + 1 equals 2', () => {
    expect(1 + 1).toBe(2);
  });

  it('rejects bundles containing forbidden debug strings or oversize entry shell', () => {
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

    const failRes = verifyProdBundle(tmpDir);
    expect(failRes.ok).toBe(false);
    for (const pattern of FORBIDDEN_PROD_PATTERNS) {
      expect(failRes.errors.some((e: string) => e.includes(pattern))).toBe(true);
    }

    // Clean small bundle passes
    fs.writeFileSync(path.join(assetsDir, 'index-test.js'), 'console.log("Uthao clean prod");');
    const passRes = verifyProdBundle(tmpDir);
    expect(passRes.ok).toBe(true);
    expect(passRes.errors).toEqual([]);
    expect(passRes.entryShellGzBytes).toBeLessThanOrEqual(MAX_ENTRY_SHELL_GZ_BYTES);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('verifies built dist/ passes P8.1 production bundle hygiene and <= 400 KB gz entry shell budget when dist/ exists', () => {
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
