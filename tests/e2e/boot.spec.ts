import { test, expect } from '@playwright/test';

test('page loads, canvas visible, no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });

  await page.goto('/');
  await expect(page.locator('#boot-text')).toHaveText('Uthao');
  await expect(page.locator('#game-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pauses on hidden', async ({ page }) => {
  await page.goto('/?district=testloop');
  await page.waitForFunction(() => (window as unknown as { __uthao?: unknown }).__uthao !== undefined);

  // Emulate visibilitychange -> hidden
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const isPaused = await page.evaluate(() => {
    return (window as unknown as { __uthao: { snapshot: () => { paused: boolean } } }).__uthao.snapshot().paused;
  });
  expect(isPaused).toBe(true);
});

test('portrait shows rotate overlay on pixel7 portrait', async ({ page }) => {
  // Set viewport to mobile portrait
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await expect(page.locator('[data-testid="rotate-overlay"]')).toBeVisible();
});
