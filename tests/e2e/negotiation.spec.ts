import { test, expect } from '@playwright/test';

test('negotiation flow: debug-spawn a bargainer, counter twice, accept, assert the fare on the receipt', async ({
  page,
}) => {
  test.setTimeout(60000);

  await page.goto('/?debug=1&district=testloop');
  await page.waitForSelector('#game-canvas');
  await expect(page.locator('#hud')).toBeVisible();

  // Turn on autopilot and spawn bargainer with initial fare 90
  await page.evaluate(() => {
    window.__uthao?.spawnBargainer(90);
    window.__uthao?.autopilot(true);
  });

  // Wait for bike to reach pickup point and negotiation panel to open
  const negPanel = page.locator('[data-testid="negotiation-panel"]');
  await expect(negPanel).toBeVisible({ timeout: 25000 });

  // Counter 1: step up high (+৳40) and counter (passenger rejects)
  const plus10Btn = page.locator('[data-testid="stepper-plus-10"]');
  for (let i = 0; i < 4; i++) {
    await plus10Btn.click();
  }
  const counterBtn = page.locator('[data-testid="counter-btn"]');
  await counterBtn.click();

  // Wait for reaction chip / round 2
  await expect(page.locator('[data-testid="top-factor-chip"]')).toBeVisible({ timeout: 5000 });

  // Counter 2: step up high (+৳30) and counter again (passenger rejects)
  for (let i = 0; i < 3; i++) {
    await plus10Btn.click();
  }
  await counterBtn.click();

  // Round 3: Accept the passenger's negotiated fare
  const acceptBtn = page.locator('[data-testid="accept-btn"]');
  await expect(acceptBtn).toBeVisible({ timeout: 5000 });
  await acceptBtn.click();

  // Panel should close and trip starts
  await expect(negPanel).not.toBeVisible({ timeout: 5000 });

  // Wait for trip completion on autopilot
  await page.waitForFunction(
    () => {
      const api = window.__uthao;
      return api?.eventLog.includes('ride/completed');
    },
    null,
    { timeout: 45000 }
  );

  // Assert receipt fare
  const receipt = await page.evaluate(() => {
    return window.__uthao?.lastReceipt;
  });

  expect(receipt).toBeDefined();
  expect(receipt?.fare).toBeGreaterThanOrEqual(50);
  expect(receipt?.net).toBeGreaterThan(0);
});
