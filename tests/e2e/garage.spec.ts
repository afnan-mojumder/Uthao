import { test, expect } from '@playwright/test';

test('T4.4 Garage and Bike Upgrades e2e: condition gauges, repair actions, tab switching, and exit', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/?debug=1&district=testloop');
  await page.waitForSelector('#game-canvas');
  await expect(page.locator('#hud')).toBeVisible();

  // Open garage via reactive store signal with Kamal discount active (rel: 25)
  await page.evaluate(() => {
    const ui = (window as unknown as { __uthaoUi?: { garageSignal: { value: unknown } } }).__uthaoUi;
    if (ui) {
      ui.garageSignal.value = {
        open: true,
        atKamalBhai: true,
        kamalRelationship: 25,
        cash: 850,
        engineCondition: 50,
        tiresCondition: 40,
        brakesCondition: 60,
        kmSinceOilChange: 45,
        ownedUpgrades: [],
      };
    }
  });

  // Verify garage modal appears with glassmorphism container
  const garageScreen = page.locator('[data-testid="garage-screen"]');
  await expect(garageScreen).toBeVisible({ timeout: 5000 });

  // Verify Title and Kamal Bhai 20% discount badge
  const title = page.locator('[data-testid="garage-title"]');
  await expect(title).toBeVisible();

  const discountBadge = page.locator('[data-testid="garage-discount-badge"]');
  await expect(discountBadge).toBeVisible();
  await expect(discountBadge).toContainText(/20%|২০%/);

  // Verify cash display
  const cashElem = page.locator('[data-testid="garage-cash"]');
  await expect(cashElem).toContainText('850');

  // Verify condition percentages
  const engineCond = page.locator('[data-testid="garage-condition-engine"]');
  await expect(engineCond).toContainText('50%');

  const tiresCond = page.locator('[data-testid="garage-condition-tires"]');
  await expect(tiresCond).toContainText('40%');

  // Click repair engine button
  const repairEngineBtn = page.locator('[data-testid="garage-repair-engine-btn"]');
  await expect(repairEngineBtn).toBeVisible();
  await repairEngineBtn.click();

  // Switch to Upgrades tab
  const upgradesTab = page.locator('[data-testid="garage-tab-upgrades"]');
  await upgradesTab.click();

  // Verify Tubeless Tires upgrade card is present
  const tiresCard = page.locator('[data-testid="upgrade-card-upgrade_good_tires"]');
  await expect(tiresCard).toBeVisible();

  // Switch to Cosmetics tab
  const cosmeticsTab = page.locator('[data-testid="garage-tab-cosmetics"]');
  await cosmeticsTab.click();

  // Verify Crimson Red paint card is present
  const crimsonCard = page.locator('[data-testid="cosmetic-card-cosmetic_paint_crimson"]');
  await expect(crimsonCard).toBeVisible();

  // Click Exit button to return to road
  const exitBtn = page.locator('[data-testid="garage-exit-btn"]');
  await expect(exitBtn).toBeVisible();
  await exitBtn.click();

  // Modal closes
  await expect(garageScreen).not.toBeVisible({ timeout: 5000 });
});
