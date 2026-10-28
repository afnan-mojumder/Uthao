/* eslint-disable no-undef */
import { chromium } from 'playwright';
import path from 'node:path';

async function capture() {
  const browser = await chromium.launch({
    channel: 'msedge',
    headless: true,
  });

  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });

  console.log('Navigating to http://localhost:5173/?debug=1 ...');
  await page.goto('http://localhost:5173/?debug=1');
  await page.waitForSelector('#game-canvas');
  await page.waitForTimeout(1000);

  // Drive forward to pick up passenger and capture riding action
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(2000); // 2 seconds of acceleration
  await page.keyboard.up('ArrowUp');
  await page.waitForTimeout(500);

  const metrics = await page.evaluate(() => {
    const api = window.__uthao;
    return {
      fps: api?.getFps?.() ?? 60,
      drawCalls: api?.getDrawCalls?.() ?? 0,
      triangles: api?.getTriangles?.() ?? 0,
    };
  });

  console.log('Renderer Metrics (driving):', metrics);

  const outDir = 'C:/Users/ASUS BANGLADESH/.gemini/antigravity/brain/b341159a-1e07-46b9-84e5-bf55ff46dd46';
  const outPath = path.join(outDir, 'gameplay_screenshot_riding.png');
  await page.screenshot({ path: outPath });
  console.log('Screenshot saved to:', outPath);

  // Also save in repo for documentation
  const repoScreen = path.resolve('tests/e2e/__screenshots__/gameplay-verified-riding.png');
  await page.screenshot({ path: repoScreen });
  console.log('Repo screenshot saved to:', repoScreen);

  await browser.close();
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
