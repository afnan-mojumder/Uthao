import { test, expect, type Page } from '@playwright/test';

// A fake gamepad the page polls through navigator.getGamepads. Each press
// holds a button down for one animation frame or more, so the real edge
// detection in src/input/gamepadNav.ts sees it exactly as a controller would.
const GAMEPAD_SHIM = () => {
  const pad = {
    id: 'fake-pad',
    index: 0,
    connected: true,
    mapping: 'standard',
    timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  (window as unknown as { __pad: typeof pad }).__pad = pad;
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    value: () => [pad],
  });
};

async function press(page: Page, button: number): Promise<void> {
  await page.evaluate((b) => {
    (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[b]!.pressed = true;
    (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[b]!.value = 1;
  }, button);
  // Hold for a real button-press length: the pad is read once per frame, and
  // emulated devices run at low frame rates.
  await page.waitForTimeout(200);
  await page.evaluate((b) => {
    (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[b]!.pressed = false;
    (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[b]!.value = 0;
  }, button);
  await page.waitForTimeout(150);
}

const DPAD_DOWN = 13;
const BTN_A = 0;
const BTN_B = 1;

test.describe('keyboard focus and escape', () => {
  test('Tab moves focus between title-screen buttons instead of being swallowed', async ({ page }) => {
    // Arrange
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible();

    // Act
    await page.keyboard.press('Tab');

    // Assert: focus lands on a button inside the main menu
    const focusedInMenu = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return !!el && el.tagName === 'BUTTON' && !!el.closest('[data-testid="main-menu"]');
    });
    expect(focusedInMenu).toBe(true);
  });

  test('Escape closes Settings opened from the title screen', async ({ page }) => {
    // Arrange
    await page.goto('/');
    await page.getByTestId('menu-btn-settings').click();
    await expect(page.getByTestId('settings-screen')).toBeVisible();

    // Act
    await page.keyboard.press('Escape');

    // Assert
    await expect(page.getByTestId('settings-screen')).toHaveCount(0);
  });
});

test.describe('camera key', () => {
  test('C toggles chase and first-person camera on each press', async ({ page }) => {
    // Arrange: debug boot starts directly in the game world
    await page.goto('/?debug=1&encounters=0');
    await page.waitForFunction(() => (window as unknown as { __uthao?: unknown }).__uthao !== undefined);
    const mode = () =>
      page.evaluate(
        () =>
          (window as unknown as { __uthao: { renderer: { cameraRig: { mode: string } } } }).__uthao.renderer
            .cameraRig.mode
      );
    const before = await mode();

    // Act: hold each press for a human-length tap (the sim samples input per frame)
    const tap = async () => {
      await page.keyboard.down('KeyC');
      await page.waitForTimeout(120);
      await page.keyboard.up('KeyC');
      await page.waitForTimeout(150);
    };
    await tap();
    const afterFirst = await mode();
    await tap();
    const afterSecond = await mode();

    // Assert
    expect(before).toBe('chase');
    expect(afterFirst).toBe('firstPerson');
    expect(afterSecond).toBe('chase');
  });
});

test.describe('gamepad only', () => {
  test('a gamepad alone can focus New Career, press it, and reach the alarm', async ({ page }) => {
    // Arrange
    await page.addInitScript(GAMEPAD_SHIM);
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible();

    // Act: D-pad moves focus down the menu until New Career has it
    const focusedTestId = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    await expect
      .poll(
        async () => {
          if ((await focusedTestId()) !== 'menu-btn-new-career') await press(page, DPAD_DOWN);
          return focusedTestId();
        },
        { timeout: 20000 }
      )
      .toBe('menu-btn-new-career');

    // Act: A clicks the focused button
    await press(page, BTN_A);

    // Assert: the game starts and the tutorial alarm appears
    await expect(page.getByTestId('tutorial-btn-alarm')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('main-menu')).toHaveCount(0);
  });

  test('B on a dialogue card chooses its second option', async ({ page }) => {
    // Arrange
    await page.addInitScript(GAMEPAD_SHIM);
    await page.goto('/?debug=1&encounters=0');
    await page.waitForFunction(() => (window as unknown as { __uthao?: unknown }).__uthao !== undefined);
    await page.evaluate(() => {
      (window as unknown as { __uthao: { startEncounter: (id: string) => boolean } }).__uthao.startEncounter(
        'enc_friend_package'
      );
    });
    await expect(page.getByTestId('choice-card')).toBeVisible();

    // Act: B is choice 2 (decline) in the default mapping
    await press(page, BTN_B);

    // Assert
    await expect(page.getByTestId('choice-card')).toHaveCount(0);
  });
});

test.describe('gamepad map', () => {
  test('RB opens the map and A on a focused point of interest selects it', async ({ page }) => {
    // Arrange
    await page.addInitScript(GAMEPAD_SHIM);
    await page.goto('/?debug=1&encounters=0');
    await page.waitForFunction(() => (window as unknown as { __uthao?: unknown }).__uthao !== undefined);
    await expect(page.getByTestId('map-screen')).toHaveCount(0);

    // Act: RB opens the map
    await press(page, 5);
    await expect(page.getByTestId('map-screen')).toBeVisible();

    // Act: D-pad moves focus onto a point of interest, A selects it
    const focusedTestId = () =>
      page.evaluate(() => document.activeElement?.getAttribute('data-testid') ?? '');
    await expect
      .poll(
        async () => {
          if (!(await focusedTestId()).startsWith('map-poi-')) await press(page, DPAD_DOWN);
          return focusedTestId();
        },
        { timeout: 20000 }
      )
      .toMatch(/^map-poi-/);

    // Act: A selects the focused point. Retry the press until the card shows,
    // since a press can be lost when the emulated device drops frames.
    await expect
      .poll(
        async () => {
          if (await page.getByTestId('map-poi-card').isVisible()) return true;
          if ((await focusedTestId()).startsWith('map-poi-')) {
            await press(page, BTN_A);
          } else {
            await press(page, DPAD_DOWN);
          }
          return page.getByTestId('map-poi-card').isVisible();
        },
        { timeout: 20000 }
      )
      .toBe(true);

    // Assert: the detail card for that point appears, as it does on click
    await expect(page.getByTestId('map-poi-card')).toBeVisible();
  });
});
