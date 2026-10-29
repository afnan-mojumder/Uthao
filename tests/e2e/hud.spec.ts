import { test, expect } from '@playwright/test';

test('T2.8 Rider HUD & Minimap e2e verification', async ({ page }) => {
  await page.goto('/?debug=1&district=testloop');
  await page.waitForSelector('#game-canvas');

  // Verify standard riding HUD elements are rendered
  const hud = page.locator('#hud');
  await expect(hud).toBeVisible();

  // Verify Minimap 2D canvas is attached and visible
  const minimapCanvas = page.locator('#minimap-canvas');
  await expect(minimapCanvas).toBeVisible();

  // Verify speedometer, objective, and fuel bar
  const speed = page.locator('#hud-speed');
  await expect(speed).toBeVisible();
  const objective = page.locator('#hud-objective');
  await expect(objective).toBeVisible();
  const fuelBar = page.locator('[data-testid="hud-fuel-bar"]');
  await expect(fuelBar).toBeVisible();

  // Verify earnings badge and passenger chip
  const earnings = page.locator('[data-testid="hud-earnings"]');
  await expect(earnings).toBeVisible();
  const passengerStatus = page.locator('[data-testid="hud-passenger-status"]');
  await expect(passengerStatus).toBeVisible();

  // Toggle camera mode to first-person view
  await page.evaluate(() => {
    window.__uthao?.toggleCamera();
  });

  // Verify HUD collapses into compact handlebar instrument pod in first-person mode
  const collapsedPod = page.locator('[data-testid="hud-first-person"]');
  await expect(collapsedPod).toBeVisible({ timeout: 5000 });

  // Toggle back to third-person chase camera
  await page.evaluate(() => {
    window.__uthao?.toggleCamera();
  });

  // Verify standard HUD returns
  await expect(page.locator('[data-testid="hud"]')).toBeVisible({ timeout: 5000 });
});
