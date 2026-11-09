import { test, expect } from '@playwright/test';

test.describe('Settings keeps keyboard focus (audit: focus leaked behind Settings)', () => {
  test('the screen behind Settings is inert, and closing Settings returns focus to its opener', async ({ page }) => {
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas');
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { screenSignal: { value: string } } }).__uthaoUi;
      if (ui) ui.screenSignal.value = 'title';
    });
    await expect(page.locator('[data-testid="main-menu"]')).toBeVisible({ timeout: 5000 });
    const settingsBtn = page.locator('[data-testid="menu-btn-settings"]');
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.focus();
    await settingsBtn.click();

    const settingsScreen = page.locator('[data-testid="settings-screen"]');
    await expect(settingsScreen).toBeVisible();

    // The menu behind is inert: its buttons cannot take focus.
    const behindInert = await page.evaluate(() => {
      const btn = document.querySelector('[data-testid="menu-btn-new-career"]');
      return btn ? !!btn.closest('[inert]') : null;
    });
    expect(behindInert).toBe(true);

    // Focus starts inside Settings.
    const focusInside = await page.evaluate(() => {
      const screen = document.querySelector('[data-testid="settings-screen"]');
      return !!screen?.contains(document.activeElement);
    });
    expect(focusInside).toBe(true);

    // Closing Settings removes the inert marks.
    const closeBtn = settingsScreen.locator('button', { hasText: /close|✕|বন্ধ/ }).first();
    await closeBtn.click();
    await expect(settingsScreen).toHaveCount(0);
    // Preact runs effect cleanup after paint, so poll rather than read once.
    await expect
      .poll(() => page.evaluate(() => document.querySelectorAll('[inert]').length))
      .toBe(0);
  });
});
