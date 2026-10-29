import { test, expect } from '@playwright/test';

test.describe('T4.3 Phone Contacts and Regulars E2E', () => {
  test('opens phone modal, navigates to contacts tab, and shows locked/unlocked regulars', async ({ page }) => {
    await page.goto('/?debug=1&district=testloop');
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
    await expect(tanvirLocked).toContainText('5 / 15');

    // Close Phone
    const closeBtn = page.locator('[data-testid="phone-close-btn"]');
    await closeBtn.click();
    await expect(phoneModal).not.toBeVisible();
  });
});
