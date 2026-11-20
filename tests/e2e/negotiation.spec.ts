import { test, expect } from '@playwright/test';

test('negotiation flow: debug-spawn a bargainer, counter twice, accept, assert the fare on the receipt @dev-only', async ({
  page,
}) => {
  test.setTimeout(120000);

  await page.goto('/?debug=1&district=testloop&encounters=0');
  await page.waitForSelector('#game-canvas');
  await expect(page.locator('#hud')).toBeVisible();

  const acceptedBefore = await page.evaluate(
    () => window.__uthao?.eventLog.filter((e) => e === 'ride/accepted').length ?? 0
  );

  // Offer a bargainer (fare 90) and accept it. Negotiation comes BEFORE pickup (MASTER 6-7).
  await page.evaluate(() => {
    window.__uthao?.spawnBargainer(90);
  });

  // Panel opens immediately on accept, while the rider has not yet headed to pickup
  const negPanel = page.locator('[data-testid="negotiation-panel"]');
  await expect(negPanel).toBeVisible({ timeout: 5000 });

  // P4.1: explain-detour is disabled when no real congestion/detour exists, and ride/accepted waits for agreement
  await expect(page.locator('[data-testid="explain-detour-btn"]')).toBeDisabled();
  const acceptedWhileNegotiating = await page.evaluate(
    () => window.__uthao?.eventLog.filter((e) => e === 'ride/accepted').length ?? 0
  );
  expect(acceptedWhileNegotiating).toBe(acceptedBefore);

  // P6.2: custom counter input must NOT snap "1" to "50" mid-typing when typing "120"
  const customInput = page.locator('[data-testid="custom-counter-input"]');
  await customInput.fill('');
  await customInput.pressSequentially('120');
  await expect(customInput).toHaveValue('120');
  await expect(page.locator('[data-testid="counter-btn"]')).toContainText(/(120|১২০)/);

  // Clamps cleanly on blur if below minimum 50
  await customInput.fill('30');
  await customInput.blur();
  await expect(customInput).toHaveValue('50');

  // Counter 1: step up high (+৳100 from 50 -> 150) and counter (passenger rejects)
  const plus10Btn = page.locator('[data-testid="stepper-plus-10"]');
  for (let i = 0; i < 10; i++) {
    await plus10Btn.click();
  }
  const counterBtn = page.locator('[data-testid="counter-btn"]');
  await counterBtn.click();

  // Wait for reaction chip / round 2 and verify destination stays preserved across rounds
  await expect(page.locator('[data-testid="top-factor-chip"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-testid="negotiation-destination"]')).toBeVisible();
  await expect(page.locator('[data-testid="negotiation-destination"]')).not.toHaveText('');
  await expect(negPanel).not.toContainText(/\{(destination|place)\}/);

  // Counter 2: step up high (+৳30) and counter again (passenger rejects)
  for (let i = 0; i < 3; i++) {
    await plus10Btn.click();
  }
  await counterBtn.click();

  // Round 3: Accept the passenger's negotiated fare
  const acceptBtn = page.locator('[data-testid="accept-btn"]');
  await expect(acceptBtn).toBeVisible({ timeout: 5000 });
  await acceptBtn.click();

  // Panel should close; only now does the rider head to pickup (autopilot drives pickup + trip)
  await expect(negPanel).not.toBeVisible({ timeout: 5000 });
  const acceptedAfterAgreement = await page.evaluate(
    () => window.__uthao?.eventLog.filter((e) => e === 'ride/accepted').length ?? 0
  );
  expect(acceptedAfterAgreement).toBe(acceptedBefore + 1);
  await page.evaluate(() => window.__uthao?.autopilot(true));

  // Wait for trip completion on autopilot
  await page.waitForFunction(
    () => {
      const api = window.__uthao;
      return api?.eventLog.includes('ride/completed');
    },
    null,
    { timeout: 90000 }
  );

  // Assert receipt fare
  const receipt = await page.evaluate(() => {
    return window.__uthao?.lastReceipt;
  });

  expect(receipt).toBeDefined();
  expect(receipt?.fare).toBeGreaterThanOrEqual(50);
  expect(receipt?.net).toBeGreaterThan(0);
});
