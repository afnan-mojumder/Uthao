import { test, expect } from '@playwright/test';

test.describe('T3.8 Opening Sequence First Ride E2E', () => {
  test('first ride tutorial completes via autopilot + scripted choices', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    // 1. Switch to Title screen and click "New Career"
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { screenSignal: { value: string } } }).__uthaoUi;
      if (ui) {
        ui.screenSignal.value = 'title';
      }
    });

    const mainMenu = page.locator('[data-testid="main-menu"]');
    await expect(mainMenu).toBeVisible({ timeout: 5000 });

    const newCareerBtn = page.locator('[data-testid="menu-btn-new-career"]');
    await expect(newCareerBtn).toBeVisible();
    await newCareerBtn.click();
    await expect(mainMenu).not.toBeVisible({ timeout: 5000 });

    // 2. Alarm Step
    const alarmBtn = page.locator('[data-testid="tutorial-btn-alarm"]');
    await expect(alarmBtn).toBeVisible({ timeout: 5000 });
    await alarmBtn.click();

    // 3. Ma's Reminder Step (1,200 Tk due on Day 3)
    const maBtn = page.locator('[data-testid="tutorial-btn-ma"]');
    await expect(maBtn).toBeVisible({ timeout: 5000 });
    await maBtn.click();

    // 4. Wallet Check Step (600 Tk)
    const walletBtn = page.locator('[data-testid="tutorial-btn-wallet"]');
    await expect(walletBtn).toBeVisible({ timeout: 5000 });
    await walletBtn.click();

    // 5. Bike Inspection Step (1.2 L Fuel)
    const bikeBtn = page.locator('[data-testid="tutorial-btn-bike"]');
    await expect(bikeBtn).toBeVisible({ timeout: 5000 });
    await bikeBtn.click();

    // 6. Tea Stall Advice from Mintu
    const teaStallBtn = page.locator('[data-testid="tutorial-btn-tea-stall"]');
    await expect(teaStallBtn).toBeVisible({ timeout: 5000 });
    await teaStallBtn.click();

    // 7. Open Uthao App & View Nabila Request
    const openRequestBtn = page.locator('[data-testid="tutorial-btn-open-request"]');
    await expect(openRequestBtn).toBeVisible({ timeout: 5000 });
    await openRequestBtn.click();

    // 8. Negotiation Tutorial (Pick ৳100 Counteroffer)
    const counter100Btn = page.locator('[data-testid="tutorial-nego-counter-100"]');
    await expect(counter100Btn).toBeVisible({ timeout: 5000 });
    await counter100Btn.click();

    // Start Ride
    const startRideBtn = page.locator('[data-testid="tutorial-btn-start-ride"]');
    await expect(startRideBtn).toBeEnabled({ timeout: 5000 });
    await startRideBtn.click();

    // 9. Riding Phase: Floating banner
    const arriveBtn = page.locator('[data-testid="tutorial-btn-arrive-destination"]');
    await expect(arriveBtn).toBeVisible({ timeout: 5000 });
    await arriveBtn.click();

    // 10. Trip Receipt Phase
    const finishReceiptBtn = page.locator('[data-testid="tutorial-btn-finish-receipt"]');
    await expect(finishReceiptBtn).toBeVisible({ timeout: 5000 });
    await finishReceiptBtn.click();

    // 11. Tutorial completed!
    await expect(page.locator('[data-testid="tutorial-overlay"]')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('#hud')).toBeVisible();
  });
});
