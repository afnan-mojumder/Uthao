import { test, expect } from '@playwright/test';

test('ride completes via autopilot', async ({ page }) => {
  test.setTimeout(60000);

  await page.goto('/?debug=1');
  await page.waitForSelector('#game-canvas');
  await expect(page.locator('#hud')).toBeVisible();

  // Initial objective
  await expect(page.locator('#hud-objective')).toHaveText(
    'Pick up passenger at N1'
  );

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
    { timeout: 25000 }
  );

  // Objective should update to drop off
  await expect(page.locator('#hud-objective')).toHaveText(
    'Drop off passenger at N2'
  );

  // Wait for ride/completed
  await page.waitForFunction(
    () => {
      const api = window.__uthao;
      return api?.eventLog.includes('ride/completed');
    },
    null,
    { timeout: 30000 }
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
    'Trip complete! Looking for fares...'
  );
});
