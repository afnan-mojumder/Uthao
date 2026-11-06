import { test, expect } from '@playwright/test';

// Settings must take real effect: a saved change applies now, the saved
// language survives a reload, and Cancel discards a language preview.

async function openSettings(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();
  await page.getByTestId('menu-btn-settings').click();
  await expect(page.getByTestId('settings-screen')).toBeVisible();
}

test.describe('settings take effect', () => {
  test('reduce motion applies to the page as soon as it is saved', async ({ page }) => {
    // Arrange
    await openSettings(page);

    // Act
    await page.getByTestId('settings-reduce-motion-toggle').check();
    await page.getByTestId('settings-save-btn').click();

    // Assert: one attribute on <html> drives the CSS that stops animations
    const attr = await page.evaluate(() => document.documentElement.dataset.reduceMotion);
    expect(attr).toBe('true');
  });

  test('the saved language is still in use after a reload', async ({ page }) => {
    // Arrange: English is saved from the settings screen
    await openSettings(page);
    await page.getByTestId('settings-lang-en').click();
    await page.getByTestId('settings-save-btn').click();

    // Act
    await page.reload();

    // Assert
    await expect(page.getByTestId('menu-btn-new-career')).toContainText('New Career');
  });

  test('Cancel discards a language shown as a preview', async ({ page }) => {
    // Arrange: the default is Bangla
    await openSettings(page);
    await page.getByTestId('settings-lang-en').click();
    // The preview is live: the menu behind the settings already shows English.
    await expect(page.getByTestId('menu-btn-new-career')).toContainText('New Career');

    // Act: cancel without saving
    await page.getByTestId('settings-cancel-btn').click();

    // Assert: the menu is back in the saved language (Bangla), not English
    await expect(page.getByTestId('menu-btn-new-career')).not.toContainText('New Career');
    await expect(page.getByTestId('menu-btn-new-career')).toBeVisible();
  });
});
