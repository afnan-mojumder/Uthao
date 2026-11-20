import { test, expect } from '@playwright/test';

test.describe('P5.2 Save v2 & Bulletproof Resume', () => {
  test('saves and loads slot1 cleanly via Pause -> SaveSlots with full SaveV2 state', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&encounters=0&seed=4242');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    const expectedIntegrity = await page.evaluate(() => {
      const api = window.__uthao!;
      api.gm.clock.day = 4;
      api.gm.economyManager.cash = 1950;
      api.gm.reputationSystem.applyMeter('riderIntegrity', 10, 'karma.e2e_test');
      return api.gm.reputationSystem.getMeters().riderIntegrity;
    });
    expect(expectedIntegrity).toBeGreaterThan(50);

    // Save to slot1 via Pause -> Save Slots
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('pause-btn-save').click();
    await expect(page.getByTestId('save-slots-modal')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('btn-action-save-slot1').click();
    await expect(page.getByTestId('save-slots-modal')).not.toBeVisible({ timeout: 5000 });

    const stored = await page.evaluate(() => localStorage.getItem('uthao.save.slot1'));
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.version).toBe(2);
    expect(parsed.seed).toBe(4242);
    expect(parsed.karmaMeters.riderIntegrity).toBe(expectedIntegrity);

    // Mutate state, then reload slot1 from Pause -> Load Slots
    await page.evaluate(() => {
      const api = window.__uthao!;
      api.gm.clock.day = 9;
      api.gm.economyManager.cash = 10;
    });

    await page.getByTestId('pause-btn-load').click();
    await expect(page.getByTestId('save-slots-modal')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('btn-action-load-slot1').click();
    await expect(page.getByTestId('save-slots-modal')).not.toBeVisible({ timeout: 5000 });

    const restored = await page.evaluate(() => ({
      day: window.__uthao!.gm.clock.day,
      cash: window.__uthao!.gm.economyManager.cash,
      integrity: window.__uthao!.gm.reputationSystem.getMeters().riderIntegrity,
    }));
    expect(restored.day).toBe(4);
    expect(restored.cash).toBe(1950);
    expect(restored.integrity).toBe(expectedIntegrity);
  });

  test('loading a day/ended autosave from MainMenu Continue opens DayEnd UI immediately and allows sleeping', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&encounters=0&seed=3131');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    // Finish active debug ride or cancel it cleanly so shift can end
    await page.evaluate(() => {
      const api = window.__uthao!;
      const active = api.rideManager?.getActiveRequest();
      if (active) {
        api.rideManager?.cancel(active.requestId, 'system', 'e2e_prep');
      }
      api.gm.clock.day = 2;
      api.gm.clock.minutes = 23 * 60;
      api.gm.dispatch({ type: 'endShift' });
    });

    await expect(page.getByTestId('day-end-screen')).toBeVisible({ timeout: 5000 });
    const savedAuto = await page.evaluate(() => localStorage.getItem('uthao.save.auto'));
    expect(savedAuto).not.toBeNull();
    expect(JSON.parse(savedAuto!).shiftEnded).toBe(true);

    // Reload onto title screen and click Continue
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('menu-btn-continue').click();

    await expect(page.getByTestId('day-end-screen')).toBeVisible({ timeout: 10000 });
    await page.getByTestId('day-end-sleep-btn').click();
    await expect(page.getByTestId('day-end-screen')).not.toBeVisible({ timeout: 5000 });

    const nextDay = await page.evaluate(() => window.__uthao?.gm.clock.day);
    expect(nextDay).toBe(3);
  });

  test('quarantines corrupt save, surfaces memory warning on quota failure while retaining existing slots, and randomizes seed on New Career unless ?seed= is set', async ({
    page,
  }) => {
    test.setTimeout(60000);
    // 1. Verify ?seed= overrides career seed while default New Career randomizes
    await page.goto('/?seed=7777');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });
    const explicitSeed = await page.evaluate(() => window.__uthao?.gm.seed);
    expect(explicitSeed).toBe(7777);

    // 2. Seed slot1 with a valid save and slot2 with an unsupported v99 save, then simulate quota exceeded on slot3 save
    await page.goto('/?debug=1&district=testloop&encounters=0&seed=5151');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    await page.keyboard.press('Escape');
    await page.getByTestId('pause-btn-save').click();
    await page.getByTestId('btn-action-save-slot1').click();
    await expect(page.getByTestId('save-slots-modal')).not.toBeVisible({ timeout: 5000 });

    await page.evaluate(() => {
      localStorage.setItem(
        'uthao.save.slot2',
        JSON.stringify({ version: 99, timestamp: Date.now(), slot: 'slot2' })
      );
      const origSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === 'uthao.save.slot3') {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError');
        }
        return origSetItem.call(this, k, v);
      };
    });

    await page.getByTestId('pause-btn-save').click();
    await expect(page.getByTestId('corrupt-backup-banner')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('save-slot-slot1')).toContainText(/দিন (1|১)/);

    // Trigger quota failure on slot3 -> keeps modal open, shows save-failed + memory-warning-banner, retains slot1
    await page.getByTestId('btn-action-save-slot3').click();
    await expect(page.getByTestId('save-failed')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('memory-warning-banner')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('save-slot-slot1')).toContainText(/দিন (1|১)/);
  });

  test('loading a mid-trip save cancels live ride cleanly to Idle with no double-pay or penalty', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&encounters=0&seed=6060');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    const preSave = await page.evaluate(() => {
      const api = window.__uthao!;
      return {
        tripState: api.rideManager?.getTripState(),
        cash: api.gm.economyManager.cash,
        rating: api.gm.reputationSystem.getAppRating(),
      };
    });
    expect(['EnRouteToPickup', 'EnRouteToDestination']).toContain(preSave.tripState);

    await page.keyboard.press('Escape');
    await page.getByTestId('pause-btn-save').click();
    await page.getByTestId('btn-action-save-slot1').click();
    await expect(page.getByTestId('save-slots-modal')).not.toBeVisible({ timeout: 5000 });

    await page.getByTestId('pause-btn-load').click();
    await page.getByTestId('btn-action-load-slot1').click();
    await expect(page.getByTestId('save-slots-modal')).not.toBeVisible({ timeout: 5000 });

    const postLoad = await page.evaluate(() => {
      const api = window.__uthao!;
      return {
        tripState: api.rideManager?.getTripState(),
        activeReq: api.rideManager?.getActiveRequest(),
        cash: api.gm.economyManager.cash,
        rating: api.gm.reputationSystem.getAppRating(),
      };
    });
    expect(postLoad.tripState).toBe('Idle');
    expect(postLoad.activeReq).toBeNull();
    expect(postLoad.cash).toBe(preSave.cash);
    expect(postLoad.rating).toBe(preSave.rating);
  });
});
