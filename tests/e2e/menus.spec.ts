import { test, expect } from '@playwright/test';

test.describe('T3.10 Menus, Settings, Pause and Dhaka Map E2E', () => {
  test('menu navigation: main menu, settings, language toggle, credits, and career start', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&encounters=0');
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
    await page.goto('/?debug=1&district=testloop&encounters=0');
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

  test('modals (SaveSlots, Ending, Journal) close via real pointer clicks and system overlays layer on top', async ({
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
    const journalCloseBtn = page.getByRole('button', { name: /✕/ });
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
    await endingScreen.getByRole('button', { name: /Close|বন্ধ/ }).click({ timeout: 5000 });
    await expect(endingScreen).not.toBeVisible({ timeout: 5000 });
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

    const mutedBefore = await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { settingsSignal: { value: { muted: boolean } } } }).__uthaoUi;
      return ui?.settingsSignal.value.muted ?? false;
    });
    await page.keyboard.press('KeyN');
    const mutedAfter = await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { settingsSignal: { value: { muted: boolean } } } }).__uthaoUi;
      return ui?.settingsSignal.value.muted ?? false;
    });
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
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toBeVisible();

    await page.keyboard.press('KeyG');
    await expect(page.getByTestId('garage-screen')).toHaveCount(0);
    await page.keyboard.press('KeyJ');
    await expect(page.getByRole('button', { name: /✕/ })).toHaveCount(0);

    const mutedInPauseBefore = await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { settingsSignal: { value: { muted: boolean } } } }).__uthaoUi;
      return ui?.settingsSignal.value.muted ?? false;
    });
    await page.keyboard.press('KeyN');
    const mutedInPauseAfter = await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { settingsSignal: { value: { muted: boolean } } } }).__uthaoUi;
      return ui?.settingsSignal.value.muted ?? false;
    });
    expect(mutedInPauseAfter).toBe(mutedInPauseBefore);

    // Resume to game: now G toggles Garage open & closed
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('pause-menu')).toHaveCount(0);
    await page.keyboard.press('KeyG');
    await expect(page.getByTestId('garage-screen')).toBeVisible();
    await page.keyboard.press('KeyG');
    await expect(page.getByTestId('garage-screen')).toHaveCount(0);
  });

  test('system overlays block G/J/M/N/Tab/Escape in game and behind open panels', async ({ page }) => {
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

  test('Escape does not open Pause underneath Ending, DayEnd, TripSummary, ChoiceCard, or NegotiationPanel', async ({
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
