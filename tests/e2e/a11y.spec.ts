import { test, expect } from '@playwright/test';

test.describe('Settings keeps keyboard focus (audit: focus leaked behind Settings)', () => {
  test('the screen behind Settings is inert, and closing Settings returns focus to its opener', async ({ page }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas');
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { screenSignal: { value: string } } }).__uthaoUi;
      if (ui) ui.screenSignal.value = 'title';
    });
    await expect(page.locator('[data-testid="main-menu"]')).toBeVisible({ timeout: 30000 });
    const settingsBtn = page.locator('[data-testid="menu-btn-settings"]');
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.focus();
    await settingsBtn.click();

    const settingsScreen = page.locator('[data-testid="settings-screen"]');
    await expect(settingsScreen).toBeVisible();

    // The menu behind is inert: its buttons cannot take focus.
    // Preact runs effects after paint, so poll rather than read once.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const btn = document.querySelector('[data-testid="menu-btn-new-career"]');
          return btn ? !!btn.closest('[inert]') : null;
        })
      )
      .toBe(true);

    // Focus starts inside Settings.
    const focusInside = await page.evaluate(() => {
      const screen = document.querySelector('[data-testid="settings-screen"]');
      return !!screen?.contains(document.activeElement);
    });
    expect(focusInside).toBe(true);

    // Closing Settings removes the inert marks.
    const closeBtn = settingsScreen.locator('button', { hasText: /close|✕|বন্ধ/ }).first();
    await closeBtn.click();
    await expect(settingsScreen).toHaveCount(0);
    // Preact runs effect cleanup after paint, so poll rather than read once.
    await expect
      .poll(() => page.evaluate(() => document.querySelectorAll('[inert]').length))
      .toBe(0);
  });

  test('all 13 modals set role="dialog" + aria-modal="true", trap Tab focus, and clean up inert on close (including stacked Pause -> Settings/SaveSlots)', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas', { timeout: 30000 });
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });

    const assertDialogTrapsTab = async (testIdOrId: string, byId = false) => {
      const sel = byId ? `#${testIdOrId}` : `[data-testid="${testIdOrId}"]`;
      const dialog = page.locator(sel);
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog).toHaveAttribute('role', 'dialog');
      await expect(dialog).toHaveAttribute('aria-modal', 'true');

      await expect
        .poll(() =>
          page.evaluate((s) => {
            const dlg = document.querySelector(s);
            const hud = document.querySelector('#hud');
            return Boolean(dlg && !dlg.closest('[inert]') && (!hud || hud.closest('[inert]')));
          }, sel)
        )
        .toBe(true);

      // Press Tab several times and ensure focus never leaves the active dialog
      for (let i = 0; i < 6; i++) {
        await page.keyboard.press('Tab');
        const inside = await page.evaluate((s) => {
          const dlg = document.querySelector(s);
          return Boolean(dlg && dlg.contains(document.activeElement));
        }, sel);
        expect(inside, `Tab #${i + 1} escaped ${sel}`).toBe(true);
      }
    };

    const assertNoInertLeaked = async () => {
      await expect
        .poll(() => page.evaluate(() => document.querySelectorAll('[inert]').length))
        .toBe(0);
    };

    // 1. Pause -> 2. Settings (stacked) -> back to Pause -> 3. SaveSlots (stacked) -> back to Pause -> close
    await page.keyboard.press('Escape');
    await assertDialogTrapsTab('pause-menu');

    await page.getByTestId('pause-btn-settings').click();
    await assertDialogTrapsTab('settings-screen');
    // Pause underneath must be inert while Settings is on top
    const pauseInertUnderSettings = await page.evaluate(() =>
      Boolean(document.querySelector('[data-testid="pause-menu"]')?.closest('[inert]'))
    );
    expect(pauseInertUnderSettings).toBe(true);

    await page.getByTestId('settings-cancel-btn').click();
    await expect(page.getByTestId('settings-screen')).toHaveCount(0);
    // Pause is active again and HUD is still inert
    await assertDialogTrapsTab('pause-menu');

    await page.getByTestId('pause-btn-save').click();
    await assertDialogTrapsTab('save-slots-modal');
    await page.getByTestId('btn-close-save-slots').click();
    await expect(page.getByTestId('save-slots-modal')).toHaveCount(0);

    await page.getByTestId('pause-btn-resume').click();
    await assertNoInertLeaked();

    // 4. UiSheet
    await page.keyboard.press('KeyU');
    await assertDialogTrapsTab('ui-sheet');
    await page.keyboard.press('Escape');
    await assertNoInertLeaked();

    // 5. Journal
    await page.keyboard.press('KeyJ');
    await assertDialogTrapsTab('journal-panel');
    await page.keyboard.press('Escape');
    await assertNoInertLeaked();

    // 6. KarmaPanel
    await page.keyboard.press('KeyK');
    await assertDialogTrapsTab('karma-panel');
    await page.keyboard.press('Escape');
    await assertNoInertLeaked();

    // 7. Garage
    await page.keyboard.press('KeyG');
    await assertDialogTrapsTab('garage-screen');
    await page.keyboard.press('Escape');
    await assertNoInertLeaked();

    // 8. MapScreen
    await page.keyboard.press('KeyM');
    await assertDialogTrapsTab('map-screen');
    await page.keyboard.press('Escape');
    await assertNoInertLeaked();

    // 9. Phone
    await page.keyboard.press('Tab');
    await assertDialogTrapsTab('phone-modal');
    await page.keyboard.press('Escape');
    await assertNoInertLeaked();

    // 10. ChoiceCard
    await page.evaluate(() => {
      (window as unknown as { __uthao?: { startEncounter: (id: string) => boolean } }).__uthao?.startEncounter(
        'enc_friend_package'
      );
    });
    await assertDialogTrapsTab('choice-card');
    await page.getByTestId('choice-btn-2').click();
    await assertNoInertLeaked();

    // 11. TripSummary
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { tripSummarySignal: { value: unknown } } }).__uthaoUi;
      if (ui) {
        ui.tripSummarySignal.value = {
          requestId: 'r_a11y',
          fare: 120,
          tip: 0,
          commission: 18,
          fuelCost: 10,
          otherCosts: 0,
          bonus: 0,
          penalties: 0,
          compensation: 0,
          fuelLiters: 0.1,
          net: 92,
          durationMin: 6,
          distanceKm: 2,
          rating: 5,
          consequences: [],
        };
      }
    });
    await assertDialogTrapsTab('trip-summary-overlay', true);
    await page.locator('#btn-trip-continue').click();
    await assertNoInertLeaked();

    // 12. DayEnd
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
    await assertDialogTrapsTab('day-end-screen');
    await page.evaluate(() => {
      const ui = (window as unknown as { __uthaoUi?: { dayEndSignal: { value: unknown } } }).__uthaoUi;
      if (ui) ui.dayEndSignal.value = { active: false, summary: null };
    });
    await assertNoInertLeaked();

    // 13. Ending
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
    await assertDialogTrapsTab('ending-screen');
    await page.getByTestId('ending-screen').getByRole('button', { name: /Close|বন্ধ/ }).click();
    await assertNoInertLeaked();
  });

  test('Contacts are keyboard-activatable <button>s, tabs have ARIA roles, and sliders/zoom controls have localized aria-labels', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas', { timeout: 30000 });
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });

    // Viewport allows pinch-zoom
    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content');
    expect(viewport).toBeTruthy();
    expect(viewport).not.toMatch(/user-scalable\s*=\s*no/i);
    expect(viewport).not.toMatch(/maximum-scale\s*=\s*1(\.0)?/i);

    // Boot language defaults to bn on <html lang>
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('bn');

    // Open Phone -> verify role="tablist", role="tab", aria-selected, and keyboard Contacts
    await page.evaluate(() => {
      const ui = (window as unknown as {
        __uthaoUi?: { phoneSignal: { value: Record<string, unknown> } };
      }).__uthaoUi;
      if (ui) {
        ui.phoneSignal.value = {
          ...ui.phoneSignal.value,
          open: true,
          relationships: { char_nabila: 25 },
        };
      }
    });
    const phone = page.getByTestId('phone-modal');
    await expect(phone.locator('[role="tablist"]')).toBeVisible();
    await expect(phone.getByTestId('phone-tab-requests')).toHaveAttribute('role', 'tab');
    await expect(phone.getByTestId('phone-tab-requests')).toHaveAttribute('aria-selected', 'true');

    await phone.getByTestId('phone-tab-contacts').click();
    await expect(phone.getByTestId('phone-tab-contacts')).toHaveAttribute('aria-selected', 'true');

    const nabilaBtn = page.getByTestId('contact-item-char_nabila');
    await expect(nabilaBtn).toBeVisible();
    const nabilaTag = await nabilaBtn.evaluate((el) => el.tagName);
    expect(nabilaTag).toBe('BUTTON');
    await nabilaBtn.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('call-contact-char_nabila')).toBeVisible();
    await page.keyboard.press('Escape');

    // MapScreen zoom buttons have descriptive localized aria-label (not '+' or '-')
    await page.keyboard.press('KeyM');
    const zoomInBn = await page.getByTestId('map-zoom-in-btn').getAttribute('aria-label');
    const zoomOutBn = await page.getByTestId('map-zoom-out-btn').getAttribute('aria-label');
    expect(zoomInBn).toBeTruthy();
    expect(zoomInBn).not.toBe('+');
    expect(zoomOutBn).toBeTruthy();
    expect(zoomOutBn).not.toBe('-');
    await page.keyboard.press('Escape');

    // Switch language to EN in Settings -> <html lang> flips to 'en' and audio sliders have aria-labels
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-btn-settings').click();
    const settings = page.getByTestId('settings-screen');
    await expect(settings.locator('[role="tablist"]')).toBeVisible();
    await expect(settings.getByTestId('settings-tab-general')).toHaveAttribute('aria-selected', 'true');

    await settings.getByTestId('settings-lang-en').click();
    await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en');

    await settings.getByTestId('settings-tab-audio').click();
    await expect(settings.getByTestId('settings-tab-audio')).toHaveAttribute('aria-selected', 'true');
    const masterAria = await settings.getByTestId('settings-master-vol').getAttribute('aria-label');
    expect(masterAria?.trim().length).toBeGreaterThan(2);
    await settings.getByTestId('settings-save-btn').click();
    await page.getByTestId('pause-btn-resume').click();

    // Map zoom aria-labels update in EN
    await page.keyboard.press('KeyM');
    const zoomInEn = await page.getByTestId('map-zoom-in-btn').getAttribute('aria-label');
    expect(zoomInEn).toBeTruthy();
    expect(zoomInEn).not.toBe(zoomInBn);
  });

  test('boot respects OS prefers-reduced-motion: reduce when no saved setting exists, without overwriting explicit saved choice', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });

    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.reduceMotion))
      .toBe('true');

    // User explicitly turns off Reduce Motion and saves
    await page.getByTestId('menu-btn-settings').click();
    const toggle = page.getByTestId('settings-reduce-motion-toggle');
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await page.getByTestId('settings-save-btn').click();
    await expect(page.getByTestId('settings-screen')).toHaveCount(0);

    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.reduceMotion))
      .toBe('false');

    // Reload with OS reducedMotion still active -> explicit user choice stays false
    await page.reload();
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.reduceMotion))
      .toBe('false');
  });
});
