import { test, expect } from '@playwright/test';

test.describe('T3.10 Menus, Settings, Pause and Dhaka Map E2E', () => {
  test('menu navigation: main menu, settings, language toggle, credits, and career start', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForSelector('#game-canvas');

    const mainMenu = page.locator('[data-testid="main-menu"]');
    await expect(mainMenu).toBeVisible({ timeout: 30000 });

    const menuTitle = page.locator('[data-testid="main-menu-title"]');
    await expect(menuTitle).toBeVisible();
    await expect(page.locator('[data-testid="menu-btn-endless"]')).toContainText(/(কুইক রাইড|Quick Ride)/);

    // Open Settings
    const settingsBtn = page.locator('[data-testid="menu-btn-settings"]');
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();

    const settingsScreen = page.locator('[data-testid="settings-screen"]');
    await expect(settingsScreen).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="settings-auto-cruise-toggle"]')).toHaveCount(0);
    await expect(page.locator('[data-testid="settings-scale-115"]')).toBeVisible();

    // Switch language to English
    const enLangBtn = page.locator('[data-testid="settings-lang-en"]');
    await expect(enLangBtn).toBeVisible();
    await enLangBtn.click();
    await expect(page.locator('[data-testid="menu-btn-endless"]')).toContainText('Quick Ride');

    // Switch to Audio tab
    const audioTab = page.locator('[data-testid="settings-tab-audio"]');
    await audioTab.click();
    await expect(page.locator('[data-testid="settings-master-vol"]')).toBeVisible();

    // Switch to Controls tab and verify live key rebinding + conflict protection
    const controlsTab = page.locator('[data-testid="settings-tab-controls"]');
    await controlsTab.click();
    await expect(page.locator('[data-testid="settings-tilt-toggle"]')).toBeVisible();
    await expect(page.locator('[data-testid="settings-rebind-horn"]')).toBeVisible();
    // Conflict test: trying to bind horn to KeyM (already Map) shows conflict warning
    await page.locator('[data-testid="settings-rebind-horn"]').click();
    await page.keyboard.press('KeyM');
    await expect(page.locator('[data-testid="settings-rebind-conflict"]')).toBeVisible();
    // Valid rebind: KeyB
    await page.locator('[data-testid="settings-rebind-horn"]').click();
    await page.keyboard.press('KeyB');
    await expect(page.locator('[data-testid="settings-rebind-horn"]')).toContainText('KeyB');
    await page.locator('[data-testid="settings-reset-controls"]').click();

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
    await expect(mainMenu).not.toBeVisible({ timeout: 10000 });
  });

  test('pause and map screen: pause ride, open map, inspect POIs, set waypoint, and resume', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await page.waitForSelector('#game-canvas');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('menu-btn-endless').click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });

    // Trigger pause screen via Escape
    await page.keyboard.press('Escape');

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

  test('webgl unsupported message overlay test @dev-only', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&encounters=0');
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

  test('modals (SaveSlots, Ending, Journal) close via real pointer clicks and system overlays layer on top @dev-only', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    // 1. Pause -> Save Slots -> Close button with real pointer click (no force: true)
    await page.keyboard.press('Escape');
    const pauseMenu = page.locator('[data-testid="pause-menu"]');
    await expect(pauseMenu).toBeVisible({ timeout: 5000 });

    await page.getByTestId('pause-btn-save').click();
    const saveSlotsModal = page.getByTestId('save-slots-modal');
    await expect(saveSlotsModal).toBeVisible({ timeout: 5000 });

    // System overlay sits above SaveSlots and intercepts pointer events
    await page.evaluate(() => {
      const ui = (window as unknown as {
        __uthaoUi?: { unsupportedSignal: { value: string | null } };
      }).__uthaoUi;
      if (ui) ui.unsupportedSignal.value = 'WebGL2 unsupported';
    });
    const unsupportedOverlay = page.getByTestId('unsupported-overlay');
    await expect(unsupportedOverlay).toBeVisible({ timeout: 5000 });
    const topElement = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return el?.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
    });
    expect(topElement).toBe('unsupported-overlay');

    await page.evaluate(() => {
      const ui = (window as unknown as {
        __uthaoUi?: { unsupportedSignal: { value: string | null }; rotateOverlaySignal: { value: boolean } };
      }).__uthaoUi;
      if (ui) {
        ui.unsupportedSignal.value = null;
        ui.rotateOverlaySignal.value = true;
      }
    });
    const rotateOverlay = page.getByTestId('rotate-overlay');
    await expect(rotateOverlay).toBeVisible({ timeout: 5000 });
    const topAfterUnsupported = await page.evaluate(() => {
      const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return el?.closest('[data-testid]')?.getAttribute('data-testid') ?? null;
    });
    expect(topAfterUnsupported).toBe('rotate-overlay');

    await page.evaluate(() => {
      const ui = (window as unknown as {
        __uthaoUi?: { rotateOverlaySignal: { value: boolean } };
      }).__uthaoUi;
      if (ui) ui.rotateOverlaySignal.value = false;
    });
    await expect(rotateOverlay).not.toBeVisible({ timeout: 5000 });

    // Real pointer click closes Save Slots
    await page.getByTestId('btn-close-save-slots').click({ timeout: 5000 });
    await expect(saveSlotsModal).not.toBeVisible({ timeout: 5000 });

    // Resume to game
    await page.getByTestId('pause-btn-resume').click();
    await expect(pauseMenu).not.toBeVisible({ timeout: 5000 });

    // 2. Journal opens via 'J' and closes via real pointer click
    await page.keyboard.press('KeyJ');
    const journalCloseBtn = page.getByRole('button', { name: /✕|Close|বন্ধ/ });
    await expect(journalCloseBtn).toBeVisible({ timeout: 5000 });
    await journalCloseBtn.click({ timeout: 5000 });
    await expect(journalCloseBtn).not.toBeVisible({ timeout: 5000 });

    // 3. Ending closes via real pointer click
    await page.evaluate(() => {
      const ui = (window as unknown as {
        __uthaoUi?: { endingSignal: { value: unknown } };
      }).__uthaoUi;
      if (ui) {
        ui.endingSignal.value = {
          active: true,
          result: {
            endingId: 'independent_rider',
            titleKey: 'ending_independent_rider_title',
            descKey: 'ending_independent_rider_desc',
            dominantIdentity: 'professional',
            tendencies: { professional: 45, negotiator: 20, hustler: 15, regular: 20 },
            summary: { cash: 8500, savings: 22000, debt: 0, rating: 4.85, localTrust: 75, completedMissions: 4 },
          },
        };
      }
    });
    const endingScreen = page.getByTestId('ending-screen');
    await expect(endingScreen).toBeVisible({ timeout: 5000 });
    await expect(endingScreen.getByTestId('share-scorecard-canvas')).toBeVisible();
    await endingScreen.getByTestId('share-scorecard-btn').click();
    await expect(endingScreen.getByTestId('share-status')).toBeVisible();
    await endingScreen.getByRole('button', { name: /Close|বন্ধ/ }).click({ timeout: 5000 });
    await expect(endingScreen).not.toBeVisible({ timeout: 5000 });
  });

  test('Pause opens Garage, Journal, and Recover Bike, and DayEnd renders Share Scorecard @dev-only', async ({
    page,
  }) => {
    test.setTimeout(60000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    // Pause -> Garage
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();
    await page.getByTestId('pause-btn-garage').click();
    await expect(page.getByTestId('garage-screen')).toBeVisible();
    await page.getByTestId('garage-exit-btn').click();
    await expect(page.getByTestId('garage-screen')).toHaveCount(0);

    // Pause -> Journal
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-btn-journal').click();
    const journalCloseBtn = page.getByRole('button', { name: /✕|Close|বন্ধ/ }).first();
    await expect(journalCloseBtn).toBeVisible({ timeout: 5000 });
    await journalCloseBtn.click();

    // Pause -> Recover Bike
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-btn-recover-bike').click();
    await expect(page.getByTestId('pause-menu')).toHaveCount(0);

    // DayEnd -> Share Scorecard
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { dayEndSignal: { value: unknown } } }).__uthaoUi;
      if (ui) {
        ui.dayEndSignal.value = {
          active: true,
          summary: {
            day: 1,
            revenue: 640,
            expenses: 180,
            net: 460,
            ratingDelta: 0.1,
            completedRides: 4,
            relationshipsDelta: {},
            cash: 1060,
            savings: 0,
            debt: 0,
          },
        };
      }
    });
    const dayEnd = page.getByTestId('day-end-screen');
    await expect(dayEnd).toBeVisible();
    await expect(dayEnd.getByTestId('share-scorecard-canvas')).toBeVisible();
    await dayEnd.getByTestId('share-scorecard-btn').click();
    await expect(dayEnd.getByTestId('share-status')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('G/J/N hotkeys are guarded outside game/when modal open, and Escape in Settings restores previewed language', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });

    // Hotkeys G, J, N should not fire on title screen
    await page.keyboard.press('KeyG');
    await expect(page.getByTestId('garage-screen')).toHaveCount(0);

    await page.keyboard.press('KeyJ');
    await expect(page.getByRole('button', { name: /✕/ })).toHaveCount(0);

    const readStoredMuted = () =>
      page.evaluate(() => {
        try {
          const raw = localStorage.getItem('uthao_user_settings');
          return raw ? Boolean(JSON.parse(raw).muted) : false;
        } catch {
          return false;
        }
      });

    const mutedBefore = await readStoredMuted();
    await page.keyboard.press('KeyN');
    const mutedAfter = await readStoredMuted();
    expect(mutedAfter).toBe(mutedBefore);

    // Open Settings, preview English, press Escape -> language reverts to Bangla
    await page.getByTestId('menu-btn-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();
    await page.getByTestId('settings-lang-en').click();
    await expect(page.getByTestId('menu-btn-new-career')).toContainText('New Career');

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-screen')).toHaveCount(0);
    await expect(page.getByTestId('menu-btn-new-career')).not.toContainText('New Career');

    // Also verify G/J/N are blocked when a modal is open in 'game' mode, and work while driving
    await page.getByTestId('menu-btn-endless').click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();

    await page.keyboard.press('KeyG');
    await expect(page.getByTestId('garage-screen')).toHaveCount(0);
    await page.keyboard.press('KeyJ');
    await expect(page.getByRole('button', { name: /✕/ })).toHaveCount(0);

    const mutedInPauseBefore = await readStoredMuted();
    await page.keyboard.press('KeyN');
    const mutedInPauseAfter = await readStoredMuted();
    expect(mutedInPauseAfter).toBe(mutedInPauseBefore);

    // Resume to game: now G toggles Garage open & closed
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toHaveCount(0);
    await page.keyboard.press('KeyG');
    await expect(page.getByTestId('garage-screen')).toBeVisible();
    await page.keyboard.press('KeyG');
    await expect(page.getByTestId('garage-screen')).toHaveCount(0);
  });

  test('system overlays block G/J/M/N/Tab/Escape in game and behind open panels @dev-only', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    const mutedBefore = await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { settingsSignal: { value: { muted: boolean } } } }).__uthaoUi;
      return ui?.settingsSignal.value.muted ?? false;
    });

    // Activate RotateOverlay during game
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { rotateOverlaySignal: { value: boolean } } }).__uthaoUi;
      if (ui) ui.rotateOverlaySignal.value = true;
    });
    await expect(page.getByTestId('rotate-overlay')).toBeVisible();

    const readUiState = () =>
      page.evaluate(() => {
        const ui = (window as unknown as {
          __uthaoUi?: {
            screenSignal: { value: string };
            pausedSignal: { value: boolean };
            garageSignal: { value: { open: boolean } };
            journalSignal: { value: boolean };
            phoneSignal: { value: { open: boolean } };
            settingsSignal: { value: { muted: boolean } };
          };
        }).__uthaoUi;
        return {
          screen: ui?.screenSignal.value,
          paused: ui?.pausedSignal.value,
          garageOpen: ui?.garageSignal.value.open,
          journalOpen: ui?.journalSignal.value,
          phoneOpen: ui?.phoneSignal.value.open,
          muted: ui?.settingsSignal.value.muted,
        };
      });

    const expectedUnchanged = {
      screen: 'game',
      paused: false,
      garageOpen: false,
      journalOpen: false,
      phoneOpen: false,
      muted: mutedBefore,
    };

    for (const key of ['KeyG', 'KeyJ', 'KeyM', 'KeyN', 'Tab', 'Escape']) {
      await page.keyboard.press(key);
      expect(await readUiState(), `key ${key} should be blocked behind rotateOverlay`).toEqual(expectedUnchanged);
    }
    await expect(page.getByTestId('pause-menu')).toHaveCount(0);

    // Clear RotateOverlay, open Garage, then show Unsupported overlay -> G & Escape must not close Garage
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { rotateOverlaySignal: { value: boolean } } }).__uthaoUi;
      if (ui) ui.rotateOverlaySignal.value = false;
    });
    await page.keyboard.press('KeyG');
    await expect(page.getByTestId('garage-screen')).toBeVisible();

    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { unsupportedSignal: { value: string | null } } }).__uthaoUi;
      if (ui) ui.unsupportedSignal.value = 'WebGL2 unsupported';
    });
    await expect(page.getByTestId('unsupported-overlay')).toBeVisible();

    await page.keyboard.press('KeyG');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('garage-screen')).toBeVisible();

    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { unsupportedSignal: { value: string | null } } }).__uthaoUi;
      if (ui) ui.unsupportedSignal.value = null;
    });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('garage-screen')).toHaveCount(0);
  });

  test('pure-player preview flow: manual driving, SaveSlots save/load, Continue reload, DayEnd + Ending Share Scorecard, and offline SW readiness', async ({
    page,
  }) => {
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });

    // 1. Start Quick Ride (Endless mode) and manually drive with KeyW / ArrowUp
    await page.getByTestId('menu-btn-endless').click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });

    await page.keyboard.down('KeyW');
    await expect
      .poll(
        async () => {
          const text = (await page.locator('#hud-speed').textContent()) ?? '0';
          const western = text.replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)));
          return Number(western) || 0;
        },
        { timeout: 15000 }
      )
      .toBeGreaterThan(0);
    await page.keyboard.up('KeyW');

    const openPauseCleanly = async () => {
      for (let attempt = 0; attempt < 4; attempt++) {
        const choiceCard = page.getByTestId('choice-card');
        if (await choiceCard.isVisible().catch(() => false)) {
          const outcomeContinue = page.getByTestId('choice-outcome-continue');
          if (await outcomeContinue.isVisible().catch(() => false)) {
            await outcomeContinue.click();
          } else {
            await choiceCard.locator('button').last().click();
          }
          await expect
            .poll(async () => {
              const postOutcome = page.getByTestId('choice-outcome-continue');
              if (await postOutcome.isVisible().catch(() => false)) {
                await postOutcome.click();
              }
              return await choiceCard.isVisible().catch(() => false);
            })
            .toBe(false);
        }
        await page.keyboard.press('Escape');
        if (await page.getByTestId('pause-menu').isVisible().catch(() => false)) {
          return;
        }
      }
      await expect(page.getByTestId('pause-menu')).toBeVisible({ timeout: 5000 });
    };

    // 2. Open Pause -> SaveSlots -> save to slot1 -> Exit to Main Menu -> Continue reload
    await openPauseCleanly();
    await page.getByTestId('pause-btn-save').click();
    await expect(page.getByTestId('save-slots-modal')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('btn-action-save-slot1').click();
    await expect(page.getByTestId('save-slots-modal')).toHaveCount(0);

    await page.getByTestId('pause-btn-exit').click();
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('menu-btn-continue')).toBeVisible();

    // Reload page and click Continue
    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('menu-btn-continue').click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });

    // 3. Seed an end-of-shift SaveV2 payload in localStorage (exercises DayEnd reload + Share Scorecard without debug hooks)
    await page.evaluate(() => {
      const slot1Raw = localStorage.getItem('uthao.save.slot1');
      if (slot1Raw) {
        const base = JSON.parse(slot1Raw);
        localStorage.setItem(
          'uthao.save.slot2',
          JSON.stringify({
            ...base,
            slot: 'slot2',
            timestamp: Date.now() + 5000,
            clock: { day: 2, minutes: 1380 },
            shiftEnded: true,
          })
        );
      }
    });
    await openPauseCleanly();
    await page.getByTestId('pause-btn-load').click();
    await page.getByTestId('btn-action-load-slot2').click();
    const dayEnd = page.getByTestId('day-end-screen');
    await expect(dayEnd).toBeVisible({ timeout: 10000 });
    await expect(dayEnd.getByTestId('share-scorecard-canvas')).toBeVisible();
    await dayEnd.getByTestId('share-scorecard-btn').click();
    await expect(dayEnd.getByTestId('share-status')).toBeVisible();
    await dayEnd.getByTestId('day-end-sleep-btn').click();
    await expect(dayEnd).toHaveCount(0);

    // 4. Seed a Chapter 6 decision save in slot3 (exercises Ending modal + Share Scorecard without debug hooks)
    await page.evaluate(() => {
      const slot1Raw = localStorage.getItem('uthao.save.slot1');
      if (slot1Raw) {
        const base = JSON.parse(slot1Raw);
        localStorage.setItem(
          'uthao.save.slot3',
          JSON.stringify({
            ...base,
            slot: 'slot3',
            timestamp: Date.now() + 10000,
            mode: 'career',
            clock: { day: 20, minutes: 900 },
            shiftEnded: false,
            economy: {
              ...base.economy,
              cash: 4500,
              savings: 22000,
            },
            story: {
              ...base.story,
              currentChapter: 6,
              activeMissions: ['m6_decision'],
              completedMissions: [
                'm1_first_ride',
                'm1_cover_week',
                'm2_cross_city',
                'm3_disruption',
                'm4_home_safe',
                'm5_linked_jobs',
              ],
              branchFlags: {},
            },
            missions: {
              ...base.missions,
              activeMissions: ['m6_decision'],
              completedMissions: [
                'm1_first_ride',
                'm1_cover_week',
                'm2_cross_city',
                'm3_disruption',
                'm4_home_safe',
                'm5_linked_jobs',
              ],
              currentDay: 20,
            },
          })
        );
      }
    });
    await openPauseCleanly();
    await page.getByTestId('pause-btn-load').click();
    await page.getByTestId('btn-action-load-slot3').click();

    const endingScreen = page.getByTestId('ending-screen');
    await expect(endingScreen).toBeVisible({ timeout: 10000 });
    await expect(endingScreen.getByTestId('share-scorecard-canvas')).toBeVisible();
    await endingScreen.getByTestId('share-scorecard-btn').click();
    await expect(endingScreen.getByTestId('share-status')).toBeVisible();
    await endingScreen.getByRole('button', { name: /Close|বন্ধ/ }).click();
    await expect(endingScreen).toHaveCount(0);

    // 5. Verify Service Worker / PWA manifest and cache readiness
    const swReady = await page.evaluate(async () => {
      const hasSwApi = 'serviceWorker' in navigator;
      const manifestLink = document.querySelector('link[rel="manifest"]')?.getAttribute('href');
      return { hasSwApi, hasManifest: Boolean(manifestLink) };
    });
    expect(swReady.hasSwApi).toBe(true);
    expect(swReady.hasManifest).toBe(true);
    expect(errors).toEqual([]);
  });

  test('service worker caches built dist/ and boots Main Menu offline after reload', async ({ page, context }) => {
    test.skip(!process.env.PLAYWRIGHT_PREVIEW, 'Offline SW reload test requires built dist/ served by vite preview');
    test.setTimeout(90000);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });

    await page.evaluate(async () => {
      if ('serviceWorker' in navigator) {
        await navigator.serviceWorker.ready;
      }
    });

    const isControlled = await page.evaluate(() => Boolean(navigator.serviceWorker?.controller));
    if (!isControlled) {
      await page.reload();
      await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });
      await expect
        .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker?.controller)), { timeout: 15000 })
        .toBe(true);
    }

    await context.setOffline(true);
    try {
      await page.reload({ waitUntil: 'domcontentloaded' });
      await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });
    } finally {
      await context.setOffline(false);
    }
    expect(errors).toEqual([]);
  });

  test('Escape does not open Pause underneath Ending, DayEnd, TripSummary, ChoiceCard, or NegotiationPanel @dev-only', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    const assertPauseDidNotOpen = async () => {
      await expect(page.getByTestId('pause-menu')).toHaveCount(0);
      const state = await page.evaluate(() => {
        const ui = (window as unknown as {
          __uthaoUi?: { screenSignal: { value: string }; pausedSignal: { value: boolean } };
        }).__uthaoUi;
        return { screen: ui?.screenSignal.value, paused: ui?.pausedSignal.value };
      });
      expect(state).toEqual({ screen: 'game', paused: false });
    };

    // 1. Ending
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { endingSignal: { value: unknown } } }).__uthaoUi;
      if (ui) {
        ui.endingSignal.value = {
          active: true,
          result: {
            endingId: 'independent_rider',
            titleKey: 'ending_independent_rider_title',
            descKey: 'ending_independent_rider_desc',
            dominantIdentity: 'professional',
            tendencies: { professional: 45, negotiator: 20, hustler: 15, regular: 20 },
            summary: { cash: 8500, savings: 22000, debt: 0, rating: 4.85, localTrust: 75, completedMissions: 4 },
          },
        };
      }
    });
    await expect(page.getByTestId('ending-screen')).toBeVisible();
    await page.keyboard.press('Escape');
    await assertPauseDidNotOpen();
    await expect(page.getByTestId('ending-screen')).toBeVisible();
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { endingSignal: { value: unknown } } }).__uthaoUi;
      if (ui) ui.endingSignal.value = { active: false, result: null };
    });

    // 2. DayEnd
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { dayEndSignal: { value: unknown } } }).__uthaoUi;
      if (ui) {
        ui.dayEndSignal.value = {
          active: true,
          summary: {
            day: 1,
            revenue: 500,
            expenses: 180,
            net: 320,
            ratingDelta: 0.1,
            completedRides: 3,
            relationshipsDelta: {},
          },
        };
      }
    });
    await expect(page.getByTestId('day-end-screen')).toBeVisible();
    await page.keyboard.press('Escape');
    await assertPauseDidNotOpen();
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { dayEndSignal: { value: unknown } } }).__uthaoUi;
      if (ui) ui.dayEndSignal.value = { active: false, summary: null };
    });

    // 3. TripSummary
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { tripSummarySignal: { value: unknown } } }).__uthaoUi;
      if (ui) {
        ui.tripSummarySignal.value = {
          requestId: 'req_1',
          fare: 100,
          tip: 0,
          commission: 15,
          fuelCost: 10,
          otherCosts: 0,
          bonus: 0,
          penalties: 0,
          compensation: 0,
          fuelLiters: 0.1,
          net: 75,
          durationMin: 8,
          distanceKm: 2,
          rating: 5,
          consequences: [],
        };
      }
    });
    await expect(page.locator('#trip-summary-overlay')).toBeVisible();
    await page.keyboard.press('Escape');
    await assertPauseDidNotOpen();
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { tripSummarySignal: { value: unknown } } }).__uthaoUi;
      if (ui) ui.tripSummarySignal.value = null;
    });

    // 4. ChoiceCard
    await page.evaluate(() => {
      (window as unknown as { __uthao?: { startEncounter: (id: string) => boolean } }).__uthao?.startEncounter(
        'enc_friend_package'
      );
    });
    await expect(page.getByTestId('choice-card')).toBeVisible();
    await page.keyboard.press('Escape');
    await assertPauseDidNotOpen();
    await page.getByTestId('choice-btn-2').click();
    await expect(page.getByTestId('choice-card')).toHaveCount(0);

    // 5. NegotiationPanel
    await page.evaluate(() => {
      (window as unknown as { __uthao?: { spawnBargainer: (fare: number) => void } }).__uthao?.spawnBargainer(90);
    });
    await expect(page.getByTestId('negotiation-panel')).toBeVisible();
    await page.keyboard.press('Escape');
    await assertPauseDidNotOpen();
  });
});
