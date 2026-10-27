import { test, expect } from '@playwright/test';

test.describe('Performance check (T3.3)', () => {
  test('low quality autopilot 30s budget check', async ({ page }, testInfo) => {
    test.setTimeout(60000);

    await page.goto('/?debug=1&district=mirpara&quality=low');
    await page.waitForSelector('#game-canvas');
    await page.waitForTimeout(1000);

    // Turn on autopilot
    await page.evaluate(() => {
      window.__uthao?.autopilot(true);
    });

    const samples: { timeSec: number; fps: number; drawCalls: number; triangles: number }[] = [];
    const durationMs = 30000;
    const intervalMs = 2500;
    const startTime = Date.now();

    while (Date.now() - startTime < durationMs) {
      await page.waitForTimeout(intervalMs);
      const metrics = await page.evaluate(() => {
        const api = window.__uthao;
        return {
          fps: api?.getFps() ?? 0,
          drawCalls: api?.getDrawCalls() ?? 0,
          triangles: api?.getTriangles() ?? 0,
        };
      });

      const elapsed = Math.round((Date.now() - startTime) / 1000);
      samples.push({ timeSec: elapsed, ...metrics });

      // Check per-sample budget
      expect(metrics.drawCalls).toBeLessThanOrEqual(150);
      expect(metrics.triangles).toBeLessThanOrEqual(300000);
    }

    const maxDrawCalls = Math.max(...samples.map((s) => s.drawCalls));
    const maxTriangles = Math.max(...samples.map((s) => s.triangles));
    const avgFps = Math.round(samples.reduce((acc, s) => acc + s.fps, 0) / (samples.length || 1));

    console.log(
      `[${testInfo.project.name}] 30s Autopilot Perf Summary: ` +
      `Max Draw Calls = ${maxDrawCalls} (budget <= 150), ` +
      `Max Triangles = ${maxTriangles} (budget <= 300,000), ` +
      `Avg FPS = ${avgFps}`
    );

    expect(maxDrawCalls).toBeGreaterThan(0);
    expect(maxDrawCalls).toBeLessThanOrEqual(150);
    expect(maxTriangles).toBeGreaterThan(0);
    expect(maxTriangles).toBeLessThanOrEqual(300000);
  });

  test('cross-district drive keeps fps >= 30 on pixel7 low', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel7', 'Pixel 7 profile only');
    test.setTimeout(60000);

    await page.goto('/?debug=1&district=world&quality=low');
    await page.waitForSelector('#game-canvas');
    await page.waitForTimeout(1000);

    // Turn on autopilot to drive across districts
    await page.evaluate(() => {
      window.__uthao?.autopilot(true);
    });

    // Allow warm-up for initial district streaming and shader compilation
    await page.waitForTimeout(2000);

    const samples: number[] = [];
    const durationMs = 15000;
    const intervalMs = 2500;
    const startTime = Date.now();

    while (Date.now() - startTime < durationMs) {
      await page.waitForTimeout(intervalMs);
      const metrics = await page.evaluate(() => {
        const api = window.__uthao;
        return {
          fps: api?.getFps() ?? 0,
          drawCalls: api?.getDrawCalls() ?? 0,
        };
      });
      samples.push(metrics.fps);
      expect(metrics.fps).toBeGreaterThanOrEqual(25);
      expect(metrics.drawCalls).toBeLessThanOrEqual(150);
    }

    const avgFps = Math.round(samples.reduce((a, b) => a + b, 0) / (samples.length || 1));
    console.log(`[${testInfo.project.name}] Cross-district drive avg FPS = ${avgFps}`);
    expect(avgFps).toBeGreaterThanOrEqual(30);
  });
});
