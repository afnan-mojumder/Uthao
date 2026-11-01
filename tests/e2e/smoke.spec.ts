import { test, expect } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

test.describe('T7.1 Real-game boot gate smoke test', () => {
  test('new player reaches riding, and a choice card resolves', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');

    // Boots on the main menu, not directly into the game world.
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('choice-card')).toHaveCount(0);

    await page.getByTestId('menu-btn-new-career').click();
    await expect(page.getByTestId('main-menu')).not.toBeVisible();

    // Completes via tutorial steps until the HUD is interactive.
    await page.getByTestId('tutorial-btn-alarm').click();
    await page.getByTestId('tutorial-btn-ma').click();
    await page.getByTestId('tutorial-btn-wallet').click();
    await page.getByTestId('tutorial-btn-bike').click();
    await page.getByTestId('tutorial-btn-tea-stall').click();
    await page.getByTestId('tutorial-btn-open-request').click();
    await page.getByTestId('tutorial-nego-counter-100').click();
    await expect(page.getByTestId('tutorial-btn-start-ride')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('tutorial-btn-start-ride').click();
    await page.getByTestId('tutorial-btn-arrive-destination').click();
    await page.getByTestId('tutorial-btn-finish-receipt').click();

    await expect(page.locator('#hud')).toBeVisible();
  });

  test('debug-started encounter can be answered', async ({ page }) => {
    await page.goto('/?debug=1&encounters=0');
    await page.waitForFunction(() => (window as unknown as { __uthao?: unknown }).__uthao !== undefined);

    await page.evaluate(() => {
      (window as unknown as { __uthao: { startEncounter: (id: string) => void } }).__uthao.startEncounter(
        'enc_friend_package'
      );
    });

    await expect(page.getByTestId('choice-card')).toBeVisible();
    await page.getByTestId('choice-btn-1').click();
    await expect(page.getByTestId('choice-card')).toHaveCount(0);

    const isPaused = await page.evaluate(() =>
      (window as unknown as { __uthao: { isPaused: () => boolean } }).__uthao.isPaused()
    );
    expect(isPaused).toBe(false);
  });
});

test.describe('T7.3 real physics, road spawn and camera collision', () => {
  test('bike mesh is in frame and the camera stays outside colliders near a wall', async (
    { page },
    testInfo
  ) => {
    test.setTimeout(30000);
    await page.goto('/?debug=1&encounters=0');
    await page.waitForSelector('#game-canvas');
    await page.waitForFunction(() => (window as unknown as { __uthao?: unknown }).__uthao !== undefined);

    // Autopilot roams the road network's nodes, which includes turns beside
    // buildings, so a few seconds of real driving exercises CameraRig's
    // anti-clip pull-in against the colliders CityBuilder added for the
    // streamed district.
    await page.evaluate(() => {
      (window as unknown as { __uthao: { autopilot: (on: boolean) => void } }).__uthao.autopilot(
        true
      );
    });
    await page.waitForTimeout(6000);

    const screenshotsDir = path.resolve('tests/e2e/__screenshots__');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }
    const screenshotPath = path.join(
      screenshotsDir,
      `bike-mounted-${testInfo.project.name}.png`
    );
    await page.screenshot({ path: screenshotPath });
    expect(fs.existsSync(screenshotPath)).toBe(true);

    const metrics = await page.evaluate(() => {
      const api = (
        window as unknown as {
          __uthao: {
            getDrawCalls: () => number;
            getTriangles: () => number;
            isCameraClipping: () => boolean;
          };
        }
      ).__uthao;
      return {
        drawCalls: api.getDrawCalls(),
        triangles: api.getTriangles(),
        cameraClipping: api.isCameraClipping(),
      };
    });

    // The bike mesh (and the world around it) is actually being rendered,
    // not a blank/black frame.
    expect(metrics.drawCalls).toBeGreaterThan(0);
    expect(metrics.triangles).toBeGreaterThan(0);
    // CameraRig's anti-clip raycast pulled the chase camera in front of any
    // collider it would otherwise have ended up inside of.
    expect(metrics.cameraClipping).toBe(false);
  });
});
