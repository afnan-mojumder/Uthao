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

test('autosaves on hidden', async ({ page }) => {
  await page.goto('/?district=testloop');
  await page.waitForFunction(() => (window as unknown as { __uthao?: unknown }).__uthao !== undefined);

  // Clear previous storage
  await page.evaluate(() => {
    localStorage.removeItem('uthao.save.auto');
  });

  // Emulate visibilitychange -> hidden
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
    Object.defineProperty(document, 'hidden', { value: true, writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // Verify that uthao.save.auto was stored in localStorage
  const savedData = await page.evaluate(() => {
    return localStorage.getItem('uthao.save.auto');
  });

  expect(savedData).not.toBeNull();
  const parsed = JSON.parse(savedData!);
  expect(parsed.version).toBe(1);
  expect(parsed.slot).toBe('auto');
});

test('portrait shows rotate overlay on pixel7 portrait', async ({ page }) => {
  // Set viewport to mobile portrait
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await expect(page.locator('[data-testid="rotate-overlay"]')).toBeVisible();
});
