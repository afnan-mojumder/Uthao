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
