import { test, expect } from '@playwright/test';

test.describe('T7.1 Real-game boot gate smoke test', () => {
  test('new player reaches riding, and a choice card resolves', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/');

    // Boots on the main menu, not directly into the game world.
    await expect(page.getByTestId('main-menu')).toBeVisible();
    await expect(page.getByTestId('choice-card')).toHaveCount(0);

    await page.getByTestId('menu-btn-new-career').click();
    await expect(page.getByTestId('main-menu')).not.toBeVisible();

    // Completes via tutorial steps until the HUD is interactive.
    await page.getByTestId('tutorial-btn-alarm').click();
    await page.getByTestId('tutorial-btn-ma').click();
    await page.getByTestId('tutorial-btn-wallet').click();
    await page.getByTestId('tutorial-btn-bike').click();
    await page.getByTestId('tutorial-btn-tea-stall').click();
    await page.getByTestId('tutorial-btn-open-request').click();
    await page.getByTestId('tutorial-nego-counter-100').click();
    await expect(page.getByTestId('tutorial-btn-start-ride')).toBeEnabled({ timeout: 5000 });
    await page.getByTestId('tutorial-btn-start-ride').click();
    await page.getByTestId('tutorial-btn-arrive-destination').click();
    await page.getByTestId('tutorial-btn-finish-receipt').click();

    await expect(page.locator('#hud')).toBeVisible();
  });

  test('debug-started encounter can be answered', async ({ page }) => {
    await page.goto('/?debug=1&encounters=0');
    await page.waitForFunction(() => (window as unknown as { __uthao?: unknown }).__uthao !== undefined);

    await page.evaluate(() => {
      (window as unknown as { __uthao: { startEncounter: (id: string) => void } }).__uthao.startEncounter(
        'enc_friend_package'
      );
    });

    await expect(page.getByTestId('choice-card')).toBeVisible();
    await page.getByTestId('choice-btn-1').click();
    await expect(page.getByTestId('choice-card')).toHaveCount(0);

    const isPaused = await page.evaluate(() =>
      (window as unknown as { __uthao: { isPaused: () => boolean } }).__uthao.isPaused()
    );
    expect(isPaused).toBe(false);
  });
});
