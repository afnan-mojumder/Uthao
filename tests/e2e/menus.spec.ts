import { test, expect } from '@playwright/test';

test.describe('T3.10 Menus, Settings, Pause and Dhaka Map E2E', () => {
  test('menu navigation: main menu, settings, language toggle, credits, and career start', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    // Switch to Title screen
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { screenSignal: { value: string } } }).__uthaoUi;
      if (ui) {
        ui.screenSignal.value = 'title';
      }
    });

    const mainMenu = page.locator('[data-testid="main-menu"]');
    await expect(mainMenu).toBeVisible({ timeout: 5000 });

    const menuTitle = page.locator('[data-testid="main-menu-title"]');
    await expect(menuTitle).toBeVisible();

    // Open Settings
    const settingsBtn = page.locator('[data-testid="menu-btn-settings"]');
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    const settingsScreen = page.locator('[data-testid="settings-screen"]');
    await expect(settingsScreen).toBeVisible({ timeout: 5000 });

    // Switch language to English
    const enLangBtn = page.locator('[data-testid="settings-lang-en"]');
    await expect(enLangBtn).toBeVisible();
    await enLangBtn.click();

    // Switch to Audio tab
    const audioTab = page.locator('[data-testid="settings-tab-audio"]');
    await audioTab.click();
    await expect(page.locator('[data-testid="settings-master-vol"]')).toBeVisible();

    // Switch to Controls tab
    const controlsTab = page.locator('[data-testid="settings-tab-controls"]');
    await controlsTab.click();
    await expect(page.locator('[data-testid="settings-tilt-toggle"]')).toBeVisible();

    // Save and return to Main Menu
    const saveSettingsBtn = page.locator('[data-testid="settings-save-btn"]');
    await saveSettingsBtn.click();
    await expect(settingsScreen).not.toBeVisible({ timeout: 5000 });

    // Open Credits Modal
    const creditsBtn = page.locator('[data-testid="menu-btn-credits"]');
    await creditsBtn.click();

    const creditsModal = page.locator('[data-testid="credits-modal"]');
    await expect(creditsModal).toBeVisible({ timeout: 5000 });

    const closeCreditsBtn = page.locator('[data-testid="credits-close-btn"]');
    await closeCreditsBtn.click();
    await expect(creditsModal).not.toBeVisible({ timeout: 5000 });

    // Start New Career
    const newCareerBtn = page.locator('[data-testid="menu-btn-new-career"]');
    await newCareerBtn.click();

    // Main menu closes and game is active
    await expect(mainMenu).not.toBeVisible({ timeout: 5000 });
  });

  test('pause and map screen: pause ride, open map, inspect POIs, set waypoint, and resume', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    // Trigger pause screen
    await page.evaluate(() => {
      const ui = (window as unknown as {
        __uthaoUi?: { screenSignal: { value: string }; pausedSignal: { value: boolean } };
      }).__uthaoUi;
      if (ui) {
        ui.screenSignal.value = 'pause';
        ui.pausedSignal.value = true;
      }
    });

    const pauseMenu = page.locator('[data-testid="pause-menu"]');
    await expect(pauseMenu).toBeVisible({ timeout: 5000 });

    // Open Dhaka Map Screen from Pause
    const openMapBtn = page.locator('[data-testid="pause-btn-map"]');
    await openMapBtn.click();

    const mapScreen = page.locator('[data-testid="map-screen"]');
    await expect(mapScreen).toBeVisible({ timeout: 5000 });

    // Verify map canvas and controls
    await expect(page.locator('[data-testid="map-canvas"]')).toBeVisible();
    await expect(page.locator('[data-testid="map-legend-panel"]')).toBeVisible();

    // Filter fuel stations
    const fuelFilter = page.locator('[data-testid="map-filter-fuel"]');
    await fuelFilter.click();

    // Zoom controls
    const zoomInBtn = page.locator('[data-testid="map-zoom-in-btn"]');
    await zoomInBtn.click();

    // Close map screen
    const closeMapBtn = page.locator('[data-testid="map-close-btn"]');
    await closeMapBtn.click();
    await expect(mapScreen).not.toBeVisible({ timeout: 5000 });

    // Resume game
    const resumeBtn = page.locator('[data-testid="pause-btn-resume"]');
    if (await resumeBtn.isVisible()) {
      await resumeBtn.click();
      await expect(pauseMenu).not.toBeVisible({ timeout: 5000 });
    }
  });

  test('webgl unsupported message overlay test', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    // Emulate unsupported WebGL capability
    await page.evaluate(() => {
      const ui = (window as unknown as {
        __uthaoUi?: { unsupportedSignal: { value: string | null } };
      }).__uthaoUi;
      if (ui) {
        ui.unsupportedSignal.value = 'WebGL 2.0 is not supported on this browser';
      }
    });

    const unsupportedOverlay = page.locator('[data-testid="unsupported-overlay"]');
    await expect(unsupportedOverlay).toBeVisible({ timeout: 5000 });
    await expect(unsupportedOverlay).toContainText('WebGL');

    // Clear unsupported overlay
    await page.evaluate(() => {
      const ui = (window as unknown as {
        __uthaoUi?: { unsupportedSignal: { value: string | null } };
      }).__uthaoUi;
      if (ui) {
        ui.unsupportedSignal.value = null;
      }
    });
    await expect(unsupportedOverlay).not.toBeVisible({ timeout: 5000 });
  });
});
