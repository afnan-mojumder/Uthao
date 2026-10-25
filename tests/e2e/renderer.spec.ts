import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

test('screenshot chase cam and fps probe', async ({ page }, testInfo) => {
  await page.goto('/?debug=1');
  await page.waitForSelector('#game-canvas');
  await page.waitForTimeout(600); // Allow several frames to render

  const screenshotsDir = path.resolve('tests/e2e/__screenshots__');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir, { recursive: true });
  }

  const projectName = testInfo.project.name;
  const screenshotPath = path.join(
    screenshotsDir,
    `chase-cam-${projectName}.png`
  );
  await page.screenshot({ path: screenshotPath });

  expect(fs.existsSync(screenshotPath)).toBe(true);

  // Probe FPS and renderer metrics via debugApi
  const metrics = await page.evaluate(() => {
    const api = window.__uthao;
    return {
      fps: api?.getFps() ?? 0,
      drawCalls: api?.getDrawCalls() ?? 0,
      triangles: api?.getTriangles() ?? 0,
    };
  });

  console.log(`[${projectName}] FPS probe:`, metrics);
  expect(metrics.drawCalls).toBeGreaterThan(0);
  expect(metrics.triangles).toBeGreaterThan(0);
});
