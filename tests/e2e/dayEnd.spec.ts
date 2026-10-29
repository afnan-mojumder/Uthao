import { test, expect } from '@playwright/test';

test('T4.1 Day end lifecycle e2e: end shift, assert breakdown, sleep to start next day', async ({
  page,
}) => {
  await page.goto('/?debug=1&district=testloop');
  await page.waitForSelector('#game-canvas');
  await expect(page.locator('#hud')).toBeVisible();

  // Advance clock to afternoon (13:00) and trigger endShift
  await page.evaluate(() => {
    if (window.__uthao?.gm) {
      window.__uthao.gm.clock.minutes = 13 * 60;
      window.__uthao.gm.dispatch({ type: 'endShift' });
    }
  });

  // Verify DayEnd modal appears with glassmorphism styling
  const dayEndScreen = page.locator('[data-testid="day-end-screen"]');
  await expect(dayEndScreen).toBeVisible({ timeout: 5000 });

  // Verify Title and Living expenses itemized breakdown
  const title = page.locator('[data-testid="day-end-title"]');
  await expect(title).toContainText('1');

  const foodExpense = page.locator('[data-testid="day-end-food"]');
  await expect(foodExpense).toContainText('150');

  const dataExpense = page.locator('[data-testid="day-end-data"]');
  await expect(dataExpense).toContainText('30');

  // Click sleep button to finish day and start next day at 07:00
  const sleepBtn = page.locator('[data-testid="day-end-sleep-btn"]');
  await expect(sleepBtn).toBeVisible();
  await sleepBtn.click();

  // Modal closes
  await expect(dayEndScreen).not.toBeVisible({ timeout: 5000 });

  // Verify next day started at 07:00 (420 min)
  const nextDayState = await page.evaluate(() => ({
    day: window.__uthao?.gm.clock.day,
    minutes: window.__uthao?.gm.clock.minutes,
  }));
  expect(nextDayState.day).toBe(2);
  expect(Math.floor(nextDayState.minutes ?? 0)).toBeGreaterThanOrEqual(420);
  expect(Math.floor(nextDayState.minutes ?? 0)).toBeLessThan(430);
});
