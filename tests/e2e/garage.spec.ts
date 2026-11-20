import { test, expect } from '@playwright/test';

test('T4.4 Garage and Bike Upgrades e2e: condition gauges, repair actions, tab switching, and exit @dev-only', async ({
  page,
}) => {
  test.setTimeout(60000);
  await page.goto('/?debug=1&district=testloop&encounters=0');
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
  await expect(cashElem).toContainText(/(850|৮৫০)/);

  // Verify condition percentages
  const engineCond = page.locator('[data-testid="garage-condition-engine"]');
  await expect(engineCond).toContainText(/(50%|৫০%)/);

  const tiresCond = page.locator('[data-testid="garage-condition-tires"]');
  await expect(tiresCond).toContainText(/(40%|৪০%)/);

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

  // Switch to Bikes tab and verify scrolling works cleanly even on 915x412 mobile viewport
  const bikesTab = page.locator('[data-testid="garage-tab-bikes"]');
  await bikesTab.click();
  const new150Card = page.locator('[data-testid="bike-card-new150"]');
  await new150Card.scrollIntoViewIfNeeded();
  await expect(new150Card).toBeVisible();
  const insideScroller = await page.evaluate(() => {
    const card = document.querySelector('[data-testid="bike-card-new150"]');
    const scroller = document.querySelector('[data-testid="garage-tab-content"]');
    return Boolean(card && scroller && scroller.contains(card));
  });
  expect(insideScroller).toBe(true);
  const box = await new150Card.boundingBox();
  const vh = page.viewportSize()?.height ?? 720;
  expect(box).not.toBeNull();
  expect((box!.y + box!.height)).toBeLessThanOrEqual(vh);

  // Click Exit button to return to road
  const exitBtn = page.locator('[data-testid="garage-exit-btn"]');
  await expect(exitBtn).toBeVisible();
  await exitBtn.click();

  // Modal closes
  await expect(garageScreen).not.toBeVisible({ timeout: 5000 });
});
