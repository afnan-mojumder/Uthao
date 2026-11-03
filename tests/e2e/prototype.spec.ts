import { test, expect } from '@playwright/test';

// T8.7 / Gate M1: the spec's prototype success criterion, end to end.
// accept -> negotiate -> ride on autopilot -> one debug-started encounter -> drop off
// -> summary reconciles with the ledger -> continue returns the rider to finding a fare.
// Runs on every project in playwright.config.ts (desktop-chrome and pixel7).

test('prototype: accept, negotiate, ride, encounter, drop off, reconcile, continue', async ({ page }) => {
  test.setTimeout(90000);

  await page.goto('/?debug=1&district=testloop&encounters=0');
  await page.waitForSelector('#game-canvas');
  await expect(page.locator('#hud')).toBeVisible();

  // 1. Accept a fare request. Negotiation comes before pickup.
  await page.evaluate(() => window.__uthao?.spawnBargainer(90));
  const negPanel = page.locator('[data-testid="negotiation-panel"]');
  await expect(negPanel).toBeVisible({ timeout: 5000 });

  // 2. Negotiate: accepting the passenger's own offer always succeeds.
  await page.locator('[data-testid="accept-btn"]').click();
  await expect(negPanel).not.toBeVisible({ timeout: 5000 });

  // 3. Ride on autopilot, and wait until the trip is under way.
  await page.evaluate(() => window.__uthao?.autopilot(true));
  await page.waitForFunction(() => window.__uthao?.eventLog.includes('ride/started') ?? false, null, {
    timeout: 30000,
  });

  // 4. One encounter, started through the debug API, must be answerable and must resume the sim.
  await page.evaluate(() => window.__uthao?.startEncounter('enc_friend_package'));
  await expect(page.getByTestId('choice-card')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('choice-btn-1').click();
  await expect(page.getByTestId('choice-card')).toHaveCount(0);
  expect(await page.evaluate(() => window.__uthao?.isPaused())).toBe(false);

  // 5. Drop off: the trip completes and the summary appears.
  await page.waitForFunction(() => window.__uthao?.eventLog.includes('ride/completed') ?? false, null, {
    timeout: 60000,
  });
  const summary = page.locator('#trip-summary-overlay');
  await expect(summary).toBeVisible({ timeout: 5000 });

  // 6. The summary reconciles with the ledger (decision 7): net + fuelCost equals the ledger sum for the request.
  const reconciled = await page.evaluate(() => {
    const api = window.__uthao;
    const r = api?.lastReceipt;
    if (!r || !api) return null;
    const rows = api.gm.economyManager.ledgerFor(r.requestId);
    const ledgerSum = rows.reduce((sum, row) => sum + row.amount, 0);
    return { rows: rows.length, ledgerSum, expected: r.net + r.fuelCost };
  });
  expect(reconciled).not.toBeNull();
  expect(reconciled!.rows).toBeGreaterThan(0);
  expect(reconciled!.ledgerSum).toBe(reconciled!.expected);

  // 7. Continue: the summary closes and the rider is back to finding a fare.
  await page.locator('#btn-trip-continue').click();
  await expect(summary).toHaveCount(0);
  await expect(page.locator('#hud-objective')).toHaveText('যাত্রী খোঁজা হচ্ছে...');
});
