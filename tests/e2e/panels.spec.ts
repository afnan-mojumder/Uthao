import { test, expect } from '@playwright/test';

async function openWorldDebug(page: import('@playwright/test').Page): Promise<void> {
  await page.goto('/?debug=1&encounters=0');
  await page.waitForSelector('#game-canvas', { timeout: 30000 });
  await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });
}

test.describe('P6.3 UiSheet, KarmaPanel, Journal & Hotkeys E2E', () => {
  test('U, J, K open UiSheet, Journal, KarmaPanel and Escape closes each back to gameplay', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await openWorldDebug(page);

    // 1. UiSheet ('KeyU')
    await page.keyboard.press('KeyU');
    const uiSheet = page.getByTestId('ui-sheet');
    await expect(uiSheet).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(uiSheet).not.toBeVisible({ timeout: 5000 });

    // 2. Journal ('KeyJ')
    await page.keyboard.press('KeyJ');
    const journalPanel = page.getByTestId('journal-panel');
    await expect(journalPanel).toBeVisible({ timeout: 5000 });

    // Check all 10 characters and records tabs inside Journal
    await page.getByTestId('journal-tab-relations').click();
    await expect(page.locator('[data-testid^="journal-char-"]')).toHaveCount(10);
    await page.getByTestId('journal-tab-records').click();
    await expect(page.getByTestId('journal-promises-section')).toBeVisible();
    await expect(page.getByTestId('journal-decisions-section')).toBeVisible();
    await expect(page.getByTestId('journal-opportunities-section')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(journalPanel).not.toBeVisible({ timeout: 5000 });

    // 3. KarmaPanel ('KeyK')
    await page.keyboard.press('KeyK');
    const karmaPanel = page.getByTestId('karma-panel');
    await expect(karmaPanel).toBeVisible({ timeout: 5000 });
    await page.keyboard.press('Escape');
    await expect(karmaPanel).not.toBeVisible({ timeout: 5000 });

    // HUD still visible and game resumed
    await expect(page.locator('#hud')).toBeVisible();
  });

  test('typing "ujk" inside negotiation custom-counter-input opens no panel', async ({ page }) => {
    test.setTimeout(60000);
    await openWorldDebug(page);

    await page.evaluate(() => {
      const ui = (
        window as unknown as {
          __uthaoUi?: {
            negotiationSignal: { value: unknown };
          };
        }
      ).__uthaoUi;
      if (ui) {
        ui.negotiationSignal.value = {
          active: true,
          lastResult: null,
          session: {
            req: {
              requestId: 'req_ujk_test',
              passengerId: 'p_nabila',
              pickupNodeId: 'MIR_N0',
              destinationNodeId: 'MIR_N5',
              initialFare: 120,
              estimatedDistance: 2.5,
              estimatedDuration: 10,
              requestedArrivalTime: null,
              bookingType: 'app',
              status: 'Negotiating',
              surge: 1.0,
            },
            profile: {
              passengerId: 'p_nabila',
              nameKey: 'char.nabila',
              archetype: 'commuter',
              budget: 140,
              patience: 0.9,
              urgency: 0.4,
              bargainingTendency: 0.4,
              safetySensitivity: 0.6,
              trustInRider: 0.5,
              localKnowledge: 0.5,
              personalBias: 0,
              paymentReliability: 0.95,
              relationshipLevel: 20,
              traits: { luggage: false, child: false, walkTolerance: 0.5 },
            },
            ctx: { traffic: 0.3, day: 1, walkM: 0, rng: { next: () => 0.5 } },
            fairFare: 120,
            expectedBudget: 135,
            currentPassengerOffer: 105,
            currentRiderOffer: null,
            round: 1,
            maxRounds: 3,
            currentPatience: 0.9,
            status: 'active',
            walkM: 0,
            detourExtraMin: 0,
            salt: 1,
          },
        };
      }
    });

    const input = page.getByTestId('custom-counter-input');
    await expect(input).toBeVisible({ timeout: 5000 });
    await input.click();
    await page.keyboard.type('ujk');

    await expect(page.getByTestId('ui-sheet')).not.toBeVisible();
    await expect(page.getByTestId('journal-panel')).not.toBeVisible();
    await expect(page.getByTestId('karma-panel')).not.toBeVisible();
  });

  test('Karma panel reveals criminalExposure and evidenceExposure only when > 0 and logs attributed events', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await openWorldDebug(page);

    // Before exposure: both exposure meters stay hidden
    await page.keyboard.press('KeyK');
    await expect(page.getByTestId('karma-panel')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('karma-meter-riderIntegrity')).toBeVisible();
    await expect(page.getByTestId('karma-meter-criminalExposure')).toHaveCount(0);
    await expect(page.getByTestId('karma-meter-evidenceExposure')).toHaveCount(0);

    // Trigger live sim karma updates
    await page.evaluate(() => {
      const gm = window.__uthao?.gm;
      if (gm) {
        gm.reputationSystem.applyMeter('riderIntegrity', 6, 'karma.safe_trip');
        gm.reputationSystem.applyMeter('criminalExposure', 14, 'karma.fled_police');
        gm.reputationSystem.applyMeter('evidenceExposure', 9, 'karma.fled_accident');
      }
    });

    await expect(page.getByTestId('karma-meter-criminalExposure')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('karma-meter-evidenceExposure')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('karma-events-list')).toContainText(/14|১৪/);
    await expect(page.getByTestId('karma-events-list')).toContainText(/9|৯/);
  });

  test('7-district World Map renders all 7 districts, prototype badge, road/river/greenery legend, tea filter & closest node selection', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await openWorldDebug(page);

    await page.keyboard.press('KeyM');
    const mapScreen = page.getByTestId('map-screen');
    await expect(mapScreen).toBeVisible({ timeout: 5000 });

    // All 7 districts & prototype badge & legend
    await expect(page.locator('[data-testid^="map-district-badge-"]')).toHaveCount(7);
    await expect(page.getByTestId('map-prototype-badge')).toBeVisible();
    const legend = page.getByTestId('map-legend-panel');
    await expect(legend).toBeVisible();
    await expect(legend).toContainText(/River|নদী/i);
    await expect(legend).toContainText(/Greenery|সবুজ/i);

    // Tea filter chip works cleanly
    const teaFilter = page.getByTestId('map-filter-tea');
    await expect(teaFilter).toBeVisible();
    await teaFilter.click();

    // Clicking the southern Motinagar/Puran Para region of the map selects a southern district (not Mirpara / nodes[0])
    const canvas = page.locator('#map-canvas');
    const box = await canvas.boundingBox();
    expect(box).not.toBeNull();
    await canvas.click({ position: { x: box!.width * 0.5, y: box!.height * 0.78 } });

    const selectionCard = page.getByTestId('map-selection-card');
    await expect(selectionCard).toBeVisible({ timeout: 5000 });
    await expect(selectionCard).toContainText(/Motinagar|Puran Para|মতি|পুরান/);
    await expect(selectionCard).not.toContainText(/Mirpara|মিরপাড়া/);
  });
});
