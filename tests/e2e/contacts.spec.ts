import { test, expect } from '@playwright/test';

test.describe('T4.3 Phone Contacts and Regulars E2E @dev-only', () => {
  test('opens phone modal, navigates to contacts tab, and shows locked/unlocked regulars', async ({ page }) => {
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    // Open phone with mock relationships
    await page.evaluate(() => {
      const ui = (window as unknown as {
        __uthaoUi?: {
          phoneSignal: {
            value: {
              open: boolean;
              unreadCount: number;
              incomingRequest: null;
              timeoutRemaining: number;
              tripHistory: [];
              navigationTurn: null;
              relationships: Record<string, number>;
            };
          };
        };
      }).__uthaoUi;

      if (ui) {
        ui.phoneSignal.value = {
          open: true,
          unreadCount: 0,
          incomingRequest: null,
          timeoutRemaining: 15,
          tripHistory: [],
          navigationTurn: null,
          relationships: {
            char_ma: 80,
            char_mintu: 35,
            char_kamal: 25,
            char_nabila: 20, // >= 15 -> unlocked
            char_tanvir: 5,  // < 15 -> locked
          },
        };
      }
    });

    const phoneModal = page.locator('[data-testid="phone-modal"]');
    await expect(phoneModal).toBeVisible({ timeout: 5000 });

    // Click Contacts Tab
    const contactsTabBtn = page.locator('[data-testid="phone-tab-contacts"]');
    await expect(contactsTabBtn).toBeVisible();
    await contactsTabBtn.click();

    // Verify Contacts Container is visible
    const contactsContainer = page.locator('[data-testid="contacts-container"]');
    await expect(contactsContainer).toBeVisible();

    // Verify Unlocked Contact (Nabila)
    const nabilaItem = page.locator('[data-testid="contact-item-char_nabila"]');
    await expect(nabilaItem).toBeVisible();
    await expect(nabilaItem).toContainText(/(নাবিলা|Nabila)/);

    // Click Nabila to expand details
    await nabilaItem.click();
    const callNabilaBtn = page.locator('[data-testid="call-contact-char_nabila"]');
    await expect(callNabilaBtn).toBeVisible();

    // Verify Locked Contact (Tanvir, 5 / 15)
    const tanvirLocked = page.locator('[data-testid="contact-locked-char_tanvir"]');
    await expect(tanvirLocked).toBeVisible();
    await expect(tanvirLocked).toContainText(/(5 \/ 15|৫ \/ ১৫)/);

    // Close Phone
    const closeBtn = page.locator('[data-testid="phone-close-btn"]');
    await closeBtn.click();
    await expect(phoneModal).not.toBeVisible();
  });

  test('shows localized RequestCard places, risk badges, live countdown, battery, earnings tab, real passenger history, and quick-chat', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas');
    await expect(page.locator('#hud')).toBeVisible();

    await page.evaluate(() => {
      const ui = (window as unknown as {
        __uthaoUi?: {
          phoneSignal: { value: Record<string, unknown> };
        };
      }).__uthaoUi;
      if (ui) {
        ui.phoneSignal.value = {
          ...ui.phoneSignal.value,
          open: true,
          phoneBattery: 82,
          incomingRequest: {
            requestId: 'req_e2e_card',
            passengerId: 'p_nabila',
            characterId: 'char_nabila',
            pickupNodeId: 'res_n2_1',
            destinationNodeId: 'art_n_2',
            pickupPlaceKey: 'poi.mirpara.tea_stall',
            destinationPlaceKey: 'poi.mirpara.bazaar',
            initialFare: 125,
            estimatedDistance: 2.1,
            estimatedDuration: 8,
            requestedArrivalTime: null,
            bookingType: 'app',
            status: 'WaitingForPickup',
            surge: 1.35,
            specialCircumstance: 'rain',
          },
          timeoutRemaining: 12,
          tripHistory: [
            {
              requestId: 'req_hist_1',
              passengerName: 'Nabila',
              passengerNameKey: 'character.nabila.name',
              fare: 120,
              net: 102,
              rating: 5,
              timestamp: '08:15',
            },
          ],
          earningsSummary: {
            cash: 750,
            savings: 500,
            debt: 0,
            todayRevenue: 120,
            todayExpenses: 18,
            todayNet: 102,
            completedRides: 1,
            rating: 5.0,
          },
        };
      }
    });

    const phoneModal = page.getByTestId('phone-modal');
    await expect(phoneModal).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('phone-battery')).toContainText(/(82%|৮২%)/);

    const requestCard = page.getByTestId('request-card');
    await expect(requestCard).toBeVisible();
    await expect(requestCard).not.toContainText('res_n2_1');
    await expect(requestCard).not.toContainText('art_n_2');
    await expect(requestCard).toContainText(/(মিন্টুর চায়ের টং|Mintu's Tea Stall)/);
    await expect(requestCard).toContainText(/(মিরপাড়া কাঁচাবাজার|Mirpara Kacha Bazaar)/);
    await expect(page.getByTestId('request-timeout-bar')).toBeVisible();
    await expect(page.getByTestId('request-risk-badges')).toBeVisible();

    // Quick-chat message sends cleanly
    const quickChat = page.getByTestId('phone-quick-chat');
    await expect(quickChat).toBeVisible();
    await quickChat.locator('button').first().click();
    await expect(page.getByTestId('phone-quick-chat-msg').first()).toBeVisible();

    // History tab shows real passenger name (never generic 'Passenger')
    await page.getByTestId('phone-tab-history').click();
    await expect(phoneModal).toContainText(/(নাবিলা|Nabila)/);

    // Earnings tab renders live breakdown
    await page.getByTestId('phone-tab-earnings').click();
    await expect(page.getByTestId('phone-earnings-panel')).toBeVisible();
    await expect(page.getByTestId('phone-earnings-panel')).toContainText(/(750|৭৫০)/);
  });
});
