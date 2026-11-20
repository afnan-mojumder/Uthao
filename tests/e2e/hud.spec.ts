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

  // Verify speedometer, objective, gear, district, condition, and fuel bar
  const speed = page.locator('#hud-speed');
  await expect(speed).toBeVisible();
  const objective = page.locator('#hud-objective');
  await expect(objective).toBeVisible();
  await expect(page.locator('[data-testid="hud-objective-pill"]')).toBeVisible();
  await expect(page.locator('[data-testid="hud-district"]')).toBeVisible();
  await expect(page.locator('[data-testid="hud-district"]')).not.toHaveText('');
  await expect(page.locator('[data-testid="hud-condition-bar"]')).toBeVisible();
  await expect(page.locator('[data-testid="hud-gear"]')).toHaveText(/G[1-5১-৫]/);
  const fuelBar = page.locator('[data-testid="hud-fuel-bar"]');
  await expect(fuelBar).toBeVisible();

  // Verify earnings badge, passenger chip, and quick actions
  const earnings = page.locator('[data-testid="hud-earnings"]');
  await expect(earnings).toBeVisible();
  const passengerStatus = page.locator('[data-testid="hud-passenger-status"]');
  await expect(passengerStatus).toBeVisible();
  await expect(page.locator('[data-testid="hud-passenger-mood"]')).toBeVisible();
  const quickActions = page.locator('[data-testid="hud-quick-actions"]');
  await expect(quickActions).toBeVisible();
  await expect(page.locator('[data-testid="hud-btn-recover-bike"]')).toBeVisible();

  // Verify zero bounding-box overlap between core HUD pods and quick actions
  const overlaps = await page.evaluate(() => {
    const ids = [
      'hud-minimap-host',
      'hud-objective-pill',
      'hud-earnings',
      'hud-passenger-status',
      'hud-speed-pod',
      'hud-quick-actions',
    ];
    const boxes = ids
      .map((id) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0 ? { id, r } : null;
      })
      .filter((x): x is { id: string; r: DOMRect } => x !== null);
    const hits: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const inter =
          !(a.r.right <= b.r.left + 1 || b.r.right <= a.r.left + 1 || a.r.bottom <= b.r.top + 1 || b.r.bottom <= a.r.top + 1);
        if (inter) hits.push(`${a.id}<->${b.id}`);
      }
    }
    return hits;
  });
  expect(overlaps).toEqual([]);

  // Verify U-turn SVG icon and dialogue subtitle render cleanly
  await page.evaluate(() => {
    const ui = (window as unknown as { __uthaoUi?: { hudSignal: { value: Record<string, unknown> } } }).__uthaoUi;
    if (ui) {
      ui.hudSignal.value = {
        ...ui.hudSignal.value,
        nextTurn: { direction: 'uturn', text: 'Make a U-turn' },
        dialogueSubtitle: { speaker: 'character.nabila.name', text: 'Bhai, please take the U-turn.' },
        etaMinutes: 4,
      };
    }
  });
  await expect(page.locator('[data-testid="hud-turn-icon"][data-direction="uturn"]')).toBeVisible();
  await expect(page.locator('[data-testid="hud-dialogue-subtitle"]')).toBeVisible();
  await expect(passengerStatus).toContainText(/(মিনিট|মি\.|min)/i);

  // Toggle camera mode to first-person view
  await page.evaluate(() => {
    window.__uthao?.toggleCamera();
  });

  // Verify HUD collapses into complete handlebar instrument pod in first-person mode
  const collapsedPod = page.locator('[data-testid="hud-first-person"]');
  await expect(collapsedPod).toBeVisible({ timeout: 5000 });
  await expect(collapsedPod.locator('[data-testid="hud-district"]')).toBeVisible();
  await expect(collapsedPod.locator('[data-testid="hud-condition-bar"]')).toBeVisible();
  await expect(collapsedPod.locator('[data-testid="hud-gear"]')).toHaveText(/G[1-5১-৫]/);
  await expect(collapsedPod.locator('[data-testid="hud-turn-icon"][data-direction="uturn"]')).toBeVisible();
  await expect(collapsedPod.locator('#hud-objective')).toBeVisible();

  // Toggle back to third-person chase camera
  await page.evaluate(() => {
    window.__uthao?.toggleCamera();
  });

  // Verify standard HUD returns
  await expect(page.locator('[data-testid="hud"]')).toBeVisible({ timeout: 5000 });
});
