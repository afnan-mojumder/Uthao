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

function isContextDestroyedError(err: unknown): boolean {
  return err instanceof Error && /Execution context was destroyed|Cannot find context/i.test(err.message);
}

async function press(page: Page, button: number): Promise<void> {
  await page.evaluate((b) => {
    (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[b]!.pressed = true;
    (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[b]!.value = 1;
  }, button);
  // Hold for a real button-press length: the pad is read once per frame, and
  // emulated devices run at low frame rates.
  await page.waitForTimeout(200);
  try {
    await page.evaluate((b) => {
      (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[b]!.pressed = false;
      (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[b]!.value = 0;
    }, button);
  } catch (err) {
    // Pressing A on New Career triggers window.location.reload() while held.
    if (!isContextDestroyedError(err)) throw err;
    return;
  }
  await page.waitForTimeout(150);
}

const DPAD_DOWN = 13;
const BTN_A = 0;
const BTN_B = 1;

test.describe('keyboard focus and escape', () => {
  test('Tab moves focus between title-screen buttons instead of being swallowed', async ({ page }) => {
    test.setTimeout(60000);
    // Arrange
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });

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
    test.setTimeout(60000);
    // Arrange
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });
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
    test.setTimeout(60000);
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('menu-btn-endless').click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('hud')).toBeVisible();
    await expect(page.getByTestId('hud-first-person')).toHaveCount(0);

    // Act: hold each press for a human-length tap (the sim samples input per frame)
    const tap = async () => {
      await page.keyboard.down('KeyC');
      await page.waitForTimeout(140);
      await page.keyboard.up('KeyC');
      await page.waitForTimeout(150);
    };
    await tap();
    await expect(page.getByTestId('hud-first-person')).toBeVisible({ timeout: 5000 });
    await tap();
    await expect(page.getByTestId('hud')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('hud-first-person')).toHaveCount(0);
  });
});

test.describe('gamepad only', () => {
  test('a gamepad alone can focus New Career, press it, and reach the alarm', async ({ page }) => {
    test.setTimeout(60000);
    // Arrange
    await page.addInitScript(GAMEPAD_SHIM);
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });

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

    // Act: A clicks the focused button; retry across SwiftShader frame gaps until
    // New Career triggers the fresh-career reload and reaches the tutorial alarm.
    await expect
      .poll(
        async () => {
          try {
            if (await page.getByTestId('tutorial-btn-alarm').isVisible()) return true;
            if ((await page.getByTestId('main-menu').count()) > 0) {
              if ((await focusedTestId()) === 'menu-btn-new-career') {
                await press(page, BTN_A);
              } else {
                await press(page, DPAD_DOWN);
              }
            }
            return await page.getByTestId('tutorial-btn-alarm').isVisible();
          } catch (err) {
            if (isContextDestroyedError(err)) return false;
            throw err;
          }
        },
        { timeout: 40000 }
      )
      .toBe(true);

    // Assert: the game starts and the tutorial alarm appears
    await expect(page.getByTestId('tutorial-btn-alarm')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('main-menu')).toHaveCount(0);
  });

  test('B on a dialogue card chooses its second option @dev-only', async ({ page }) => {
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
    test.setTimeout(60000);
    // Arrange
    await page.addInitScript(GAMEPAD_SHIM);
    await page.goto('/');
    await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });
    await page.getByTestId('menu-btn-endless').click();
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });
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

test.describe('human steering direction', () => {
  test('KeyA turns screen-left and KeyD turns screen-right in chase camera @dev-only', async ({ page }) => {
    test.setTimeout(60000);
    const driveAndMeasure = async (steerKey: 'KeyA' | 'KeyD') => {
      await page.goto('/?debug=1&district=testloop&encounters=0');
      await page.waitForFunction(() => {
        const u = (
          window as unknown as {
            __uthao?: {
              renderer?: {
                bikeMesh?: { root: { rotation: { y: number } } };
                cameraRig?: { camera: { matrixWorld: { elements: number[] }; updateMatrixWorld: (f?: boolean) => void } };
              };
            };
          }
        ).__uthao;
        const bm = u?.renderer?.bikeMesh;
        const cam = u?.renderer?.cameraRig?.camera;
        if (!bm || !cam) return false;
        cam.updateMatrixWorld(true);
        const e = cam.matrixWorld.elements;
        const h = bm.root.rotation.y;
        // Wait until chase camera has settled behind the bike (-Z_cam aligns with bike forward).
        const dotForward = -e[8]! * Math.sin(h) + -e[10]! * Math.cos(h);
        return dotForward > 0.9;
      });

      // Snapshot initial bike pose and chase camera world-right vector (+X_cam).
      const start = await page.evaluate(() => {
        const r = (
          window as unknown as {
            __uthao: {
              renderer: {
                bikeMesh: { root: { position: { x: number; z: number }; rotation: { y: number } } };
                cameraRig: { camera: { matrixWorld: { elements: number[] }; updateMatrixWorld: (f?: boolean) => void } };
              };
            };
          }
        ).__uthao.renderer;
        r.cameraRig.camera.updateMatrixWorld(true);
        const e = r.cameraRig.camera.matrixWorld.elements;
        return {
          x: r.bikeMesh.root.position.x,
          z: r.bikeMesh.root.position.z,
          heading: r.bikeMesh.root.rotation.y,
          camRightX: e[0]!,
          camRightZ: e[2]!,
        };
      });

      await page.keyboard.down('KeyW');
      await page.keyboard.down(steerKey);
      try {
        let measured = { lateralDot: 0, headingDelta: 0, dist: 0 };
        await expect
          .poll(
            async () => {
              measured = await page.evaluate((s) => {
                const root = (
                  window as unknown as {
                    __uthao: {
                      renderer: {
                        bikeMesh: { root: { position: { x: number; z: number }; rotation: { y: number } } };
                      };
                    };
                  }
                ).__uthao.renderer.bikeMesh.root;
                const dx = root.position.x - s.x;
                const dz = root.position.z - s.z;
                let dh = (root.rotation.y - s.heading) % (Math.PI * 2);
                if (dh < -Math.PI) dh += Math.PI * 2;
                if (dh > Math.PI) dh -= Math.PI * 2;
                return {
                  lateralDot: dx * s.camRightX + dz * s.camRightZ,
                  headingDelta: dh,
                  dist: Math.hypot(dx, dz),
                };
              }, start);
              return measured.dist > 1.5 && Math.abs(measured.headingDelta) > 0.08;
            },
            { timeout: 25000 }
          )
          .toBe(true);
        return measured;
      } finally {
        await page.keyboard.up(steerKey);
        await page.keyboard.up('KeyW');
      }
    };

    const left = await driveAndMeasure('KeyA');
    expect(left.lateralDot).toBeLessThan(-0.05);
    expect(left.headingDelta).toBeGreaterThan(0.05);

    const right = await driveAndMeasure('KeyD');
    expect(right.lateralDot).toBeGreaterThan(0.05);
    expect(right.headingDelta).toBeLessThan(-0.05);
  });
});

test.describe('mobile landscape touch ergonomics (P6.4) @dev-only', () => {
  test('TouchActions pads and 8-button strip have >=44px targets and zero HUD overlap at 915x412 and 667x375', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel7', 'TouchActions only renders on touch devices');
    test.setTimeout(60000);

    for (const vp of [
      { width: 915, height: 412 },
      { width: 667, height: 375 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto('/?debug=1&district=testloop&encounters=0');
      await page.waitForSelector('#game-canvas', { timeout: 30000 });
      await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('touch-actions')).toBeVisible({ timeout: 15000 });

      const report = await page.evaluate(() => {
        const touchIds = ['touch-zone-steer', 'touch-zone-throttle', 'touch-zone-brake', 'touch-icons'];
        const hudIds = [
          'hud-minimap-host',
          'hud-district',
          'hud-btn-fullscreen',
          'hud-earnings',
          'hud-objective-pill',
          'hud-passenger-status',
          'hud-quick-actions',
          'hud-speed-pod',
        ];
        const buttonIds = [
          'touch-btn-phone',
          'touch-btn-map',
          'touch-btn-garage',
          'touch-btn-journal',
          'touch-btn-karma',
          'touch-btn-pause',
          'touch-btn-horn',
          'touch-btn-camera',
          'touch-zone-throttle',
          'touch-zone-brake',
        ];

        const boxOf = (id: string) => {
          const el = document.querySelector(`[data-testid="${id}"]`);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return {
            id,
            left: r.left,
            top: r.top,
            right: r.right,
            bottom: r.bottom,
            width: r.width,
            height: r.height,
          };
        };

        const touchBoxes = touchIds.map(boxOf);
        const hudBoxes = hudIds.map(boxOf);
        const buttonBoxes = buttonIds.map(boxOf);

        const missingTouch = touchIds.filter((_id, i) => !touchBoxes[i] || touchBoxes[i]!.width <= 0 || touchBoxes[i]!.height <= 0);
        const missingHud = hudIds.filter((_id, i) => !hudBoxes[i] || hudBoxes[i]!.width <= 0 || hudBoxes[i]!.height <= 0);
        const undersizedButtons = buttonIds.filter((_id, i) => {
          const b = buttonBoxes[i];
          return !b || b.width < 44 || b.height < 44;
        });

        const overlaps: string[] = [];
        for (const tb of touchBoxes) {
          if (!tb) continue;
          for (const hb of hudBoxes) {
            if (!hb) continue;
            const inter = !(tb.right <= hb.left + 1 || hb.right <= tb.left + 1 || tb.bottom <= hb.top + 1 || hb.bottom <= tb.top + 1);
            if (inter) overlaps.push(`${tb.id}<->${hb.id}`);
          }
        }

        return { missingTouch, missingHud, undersizedButtons, overlaps };
      });

      expect(report.missingTouch, `missing touch at ${vp.width}x${vp.height}`).toEqual([]);
      expect(report.missingHud, `missing hud at ${vp.width}x${vp.height}`).toEqual([]);
      expect(report.undersizedButtons, `undersized buttons at ${vp.width}x${vp.height}`).toEqual([]);
      expect(report.overlaps, `overlaps at ${vp.width}x${vp.height}`).toEqual([]);
    }
  });

  test('first-person HUD with active ride & quick actions has zero overlap and fits viewport at 915x412 and 667x375', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel7', 'TouchActions only renders on touch devices');
    test.setTimeout(60000);

    for (const vp of [
      { width: 915, height: 412 },
      { width: 667, height: 375 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto('/?debug=1&district=testloop&encounters=0');
      await page.waitForSelector('#game-canvas', { timeout: 30000 });
      await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId('touch-actions')).toBeVisible({ timeout: 15000 });

      await page.evaluate(() => {
        window.__uthao?.toggleCamera();
        const ui = (window as unknown as { __uthaoUi?: { hudSignal: { value: Record<string, unknown> } } }).__uthaoUi;
        if (ui) {
          ui.hudSignal.value = {
            ...ui.hudSignal.value,
            isFirstPerson: true,
            nearStation: true,
            canRecoverBike: true,
            nextTurn: { direction: 'right', text: 'Turn right in 50m' },
            passengerStatus: { status: 'OnTrip', name: 'Nabila', mood: 0.85 },
            etaMinutes: 4,
          };
        }
      });

      await expect(page.getByTestId('hud-first-person')).toBeVisible({ timeout: 5000 });

      const report = await page.evaluate(
        ({ vw, vh }) => {
          const touchIds = ['touch-zone-steer', 'touch-zone-throttle', 'touch-zone-brake', 'touch-icons'];
          const hudIds = [
            'hud-district',
            'hud-objective-pill',
            'hud-earnings',
            'hud-passenger-status',
            'hud-quick-actions',
            'hud-speed-pod',
          ];

          const boxOf = (id: string) => {
            const el = document.querySelector(`[data-testid="${id}"]`);
            if (!el) return null;
            const r = el.getBoundingClientRect();
            return { id, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
          };

          const touchBoxes = touchIds.map(boxOf);
          const hudBoxes = hudIds.map(boxOf);

          const missingHud = hudIds.filter((_id, i) => !hudBoxes[i] || hudBoxes[i]!.width <= 0 || hudBoxes[i]!.height <= 0);
          const overlaps: string[] = [];
          for (const tb of touchBoxes) {
            if (!tb) continue;
            for (const hb of hudBoxes) {
              if (!hb) continue;
              const inter = !(tb.right <= hb.left + 1 || hb.right <= tb.left + 1 || tb.bottom <= hb.top + 1 || hb.bottom <= tb.top + 1);
              if (inter) overlaps.push(`${tb.id}<->${hb.id}`);
            }
          }

          const outOfBounds: string[] = [];
          for (const b of [...touchBoxes, ...hudBoxes]) {
            if (!b) continue;
            if (b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1) {
              outOfBounds.push(`${b.id}(${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)})`);
            }
          }

          return { missingHud, overlaps, outOfBounds };
        },
        { vw: vp.width, vh: vp.height }
      );

      expect(report.missingHud, `missing first-person hud at ${vp.width}x${vp.height}`).toEqual([]);
      expect(report.overlaps, `first-person overlaps at ${vp.width}x${vp.height}`).toEqual([]);
      expect(report.outOfBounds, `first-person outOfBounds at ${vp.width}x${vp.height}`).toEqual([]);
    }
  });

  test('dual L/R buttons steer mode renders >=44px buttons with zero overlap at 915x412 and 667x375', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel7', 'TouchActions only renders on touch devices');
    test.setTimeout(60000);

    for (const vp of [
      { width: 915, height: 412 },
      { width: 667, height: 375 },
    ]) {
      await page.setViewportSize(vp);
      await page.goto('/?debug=1&district=testloop&encounters=0');
      await page.waitForSelector('#game-canvas', { timeout: 30000 });
      await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });

      await page.evaluate(() => {
        const ui = (
          window as unknown as {
            __uthaoUi?: { settingsSignal: { value: { controls?: Record<string, unknown> } & Record<string, unknown> } };
          }
        ).__uthaoUi;
        if (ui) {
          const prev = ui.settingsSignal.value;
          ui.settingsSignal.value = {
            ...prev,
            controls: { ...(prev.controls ?? {}), touchSteerMode: 'buttons' },
          };
        }
      });

      await expect(page.getByTestId('touch-steer-left')).toBeVisible({ timeout: 5000 });
      await expect(page.getByTestId('touch-steer-right')).toBeVisible({ timeout: 5000 });

      const report = await page.evaluate(() => {
        const left = document.querySelector('[data-testid="touch-steer-left"]')?.getBoundingClientRect();
        const right = document.querySelector('[data-testid="touch-steer-right"]')?.getBoundingClientRect();
        const steer = document.querySelector('[data-testid="touch-zone-steer"]')?.getBoundingClientRect();
        const hudIds = ['hud-minimap-host', 'hud-passenger-status', 'hud-speed-pod'];
        const overlaps: string[] = [];
        if (steer) {
          for (const id of hudIds) {
            const r = document.querySelector(`[data-testid="${id}"]`)?.getBoundingClientRect();
            if (!r) continue;
            const inter = !(steer.right <= r.left + 1 || r.right <= steer.left + 1 || steer.bottom <= r.top + 1 || r.bottom <= steer.top + 1);
            if (inter) overlaps.push(`touch-zone-steer<->${id}`);
          }
        }
        return {
          leftSize: left ? { w: left.width, h: left.height } : null,
          rightSize: right ? { w: right.width, h: right.height } : null,
          lrDisjoint: Boolean(left && right && left.right <= right.left + 1),
          overlaps,
        };
      });

      expect(report.leftSize).not.toBeNull();
      expect(report.leftSize!.w).toBeGreaterThanOrEqual(44);
      expect(report.leftSize!.h).toBeGreaterThanOrEqual(44);
      expect(report.rightSize).not.toBeNull();
      expect(report.rightSize!.w).toBeGreaterThanOrEqual(44);
      expect(report.rightSize!.h).toBeGreaterThanOrEqual(44);
      expect(report.lrDisjoint).toBe(true);
      expect(report.overlaps).toEqual([]);
    }
  });
});
