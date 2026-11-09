import { test, expect } from '@playwright/test';

test('ride completes via autopilot', async ({ page }) => {
  // Generous: this runs in parallel with the other specs, which slows autopilot.
  test.setTimeout(120000);

  await page.goto('/?debug=1&district=testloop&encounters=0');
  await page.waitForSelector('#game-canvas');
  await expect(page.locator('#hud')).toBeVisible();

  // T8.1: the bike spawns on the pickup node (T7.3), so the ride can already be
  // under way by the first assertion; the pickup objective is covered in unit tests.

  // Turn on autopilot
  await page.evaluate(() => {
    window.__uthao?.autopilot(true);
  });

  // Wait for ride/arrivedPickup and ride/started
  await page.waitForFunction(
    () => {
      const api = window.__uthao;
      return (
        api?.eventLog.includes('ride/arrivedPickup') &&
        api?.eventLog.includes('ride/started')
      );
    },
    null,
    { timeout: 50000 }
  );

  // Objective should update to drop off
  // The drop-off names a place, never the raw road node id (audit T9.22).
  await expect(page.locator('#hud-objective')).toHaveText(/যাত্রী নামিয়ে দিন/);
  await expect(page.locator('#hud-objective')).not.toContainText('N2');

  // Wait for ride/completed
  await page.waitForFunction(
    () => {
      const api = window.__uthao;
      return api?.eventLog.includes('ride/completed');
    },
    null,
    { timeout: 60000 }
  );

  // Verify receipt
  const receipt = await page.evaluate(() => {
    return window.__uthao?.lastReceipt;
  });

  expect(receipt).toBeDefined();
  expect(receipt?.fare).toBe(120);
  expect(receipt?.net).toBeGreaterThan(0);

  // Verify HUD shows trip completion
  await expect(page.locator('#hud-objective')).toHaveText(
    'যাত্রী খোঁজা হচ্ছে...'
  );
});
