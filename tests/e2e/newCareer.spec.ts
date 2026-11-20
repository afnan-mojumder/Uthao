import { test, expect } from '@playwright/test';

// A new career starts from a fresh game. Before this, the debt, relationships,
// bikes and endings of the previous career carried over.
test('a new career starts with no debt and default relationships', async ({ page }) => {
  test.setTimeout(60000);
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });

  // Act: start a new career and verify fresh wallet (৳600) and default relationship values
  await page.getByTestId('menu-btn-new-career').click();
  await expect(page.getByTestId('tutorial-btn-alarm')).toBeVisible({ timeout: 20000 });
  await page.getByTestId('tutorial-btn-skip').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 10000 });

  // Assert via Journal Relationships & Phone Earnings tabs (pure player UI, zero debug hooks)
  await page.keyboard.press('KeyJ');
  await expect(page.getByTestId('journal-panel')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('journal-tab-relations').click();
  await expect(page.getByTestId('journal-char-char_ma')).toContainText(/(80|৮০)/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('journal-panel')).toHaveCount(0);

  await page.keyboard.press('Tab');
  await expect(page.getByTestId('phone-modal')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('phone-tab-earnings').click();
  await expect(page.getByTestId('phone-earnings-panel')).toContainText(/(700|৭০০)/);
  await expect(page.getByTestId('phone-earnings-panel')).not.toContainText(/ऋণ|Debt/i);
});
