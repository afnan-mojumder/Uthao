import { test, expect } from '@playwright/test';

test.describe('World-grounded rides, tutorial & mobile HUD E2E', () => {
  test('live 3D first-ride tutorial unlocks driving during riding step and cleans up on arrival @dev-only', async ({
    page,
  }) => {
    test.setTimeout(90000);
    await page.goto('/');
    await page.waitForSelector('#game-canvas', { timeout: 30000 });

    const mainMenu = page.getByTestId('main-menu');
    await expect(mainMenu).toBeVisible({ timeout: 30000 });
    await page.getByTestId('menu-btn-new-career').click();
    await expect(mainMenu).not.toBeVisible({ timeout: 15000 });

    await page.getByTestId('tutorial-btn-alarm').click();
    await page.getByTestId('tutorial-btn-ma').click();
    await page.getByTestId('tutorial-btn-wallet').click();
    await page.getByTestId('tutorial-btn-bike').click();
    await page.getByTestId('tutorial-btn-tea-stall').click();
    await page.getByTestId('tutorial-btn-open-request').click();
    await page.getByTestId('tutorial-nego-counter-100').click();
    await page.getByTestId('tutorial-btn-start-ride').click();

    const arriveBtn = page.getByTestId('tutorial-btn-arrive-destination');
    await expect(arriveBtn).toBeVisible({ timeout: 10000 });

    // Confirm req_tutorial_01 is live in RideManager during 'riding'
    await expect
      .poll(
        () =>
          page.evaluate(
            () => window.__uthao?.rideManager?.getActiveRequest()?.requestId ?? ''
          ),
        { timeout: 10000 }
      )
      .toBe('req_tutorial_01');

    // Confirm keyboard driving is unlocked during tutorial 'riding'
    const startPose = await page.evaluate(() => {
      const pos = window.__uthao?.renderer?.bikeMesh?.root?.position;
      return pos ? { x: pos.x, z: pos.z } : null;
    });
    expect(startPose).not.toBeNull();

    await page.keyboard.down('KeyW');
    try {
      await expect
        .poll(
          () =>
            page.evaluate((s) => {
              const pos = window.__uthao?.renderer?.bikeMesh?.root?.position;
              if (!pos || !s) return 0;
              return Math.hypot(pos.x - s.x, pos.z - s.z);
            }, startPose),
          { timeout: 10000 }
        )
        .toBeGreaterThan(0.5);
    } finally {
      await page.keyboard.up('KeyW');
    }

    // Fast-forward finish cleanly settles req_tutorial_01 without leaving an active tutorial ride
    await arriveBtn.click();
    await expect(page.getByTestId('tutorial-receipt-fuel')).toBeVisible({ timeout: 5000 });
    await page.getByTestId('tutorial-btn-finish-receipt').click();

    await expect(page.getByTestId('tutorial-overlay')).not.toBeVisible({ timeout: 5000 });
    await expect(page.locator('#hud')).toBeVisible();
    const danglingReq = await page.evaluate(
      () => window.__uthao?.rideManager?.getActiveRequest() ?? null
    );
    expect(danglingReq).toBeNull();
  });

  test('world-grounded 3D renderers, stationary encounter safety, and RideWaitBanner cancel flow @dev-only', async ({
    page,
  }) => {
    test.setTimeout(60000);
    await page.goto('/?debug=1&district=testloop&seed=101');
    await page.waitForSelector('#game-canvas', { timeout: 30000 });
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });

    // All Milestones 1-3 world renderers & markers are attached in Renderer
    const rendererWired = await page.evaluate(() => {
      const r = window.__uthao?.renderer as unknown as Record<string, unknown> | undefined;
      const markers = (r?.markers as Record<string, unknown> | undefined) ?? undefined;
      return Boolean(
        markers?.mission &&
          r?.passengerActor &&
          r?.missionCharacterActor &&
          r?.streetHailRenderer &&
          r?.worldEventRenderer &&
          r?.encounterStageRenderer
      );
    });
    expect(rendererWired).toBe(true);

    // Standing stationary must not spam premature ride choices/modais
    await page.waitForTimeout(1500);
    await expect(page.getByTestId('choice-card')).toHaveCount(0);

    // Stage a real RideWaitState via RideManager on an EnRouteToPickup leg and cancel it via HUD
    const stagedWait = await page.evaluate(() => {
      const rm = window.__uthao?.rideManager;
      if (!rm) return false;
      const active = rm.getActiveRequest();
      if (active) {
        rm.cancel(active.requestId, 'system', 'e2e_reset');
      }
      const nodes = rm.roadNetwork.getAllNodes();
      const pickupNodeId = nodes[2]?.nodeId ?? nodes[1]?.nodeId ?? 'N2';
      const destinationNodeId = nodes[3]?.nodeId ?? nodes[0]?.nodeId ?? 'N3';
      rm.offer({
        requestId: 'req_e2e_wait',
        passengerId: 'pax_e2e',
        pickupNodeId,
        destinationNodeId,
        initialFare: 120,
        estimatedDistance: 0.5,
        estimatedDuration: 3,
        requestedArrivalTime: null,
        bookingType: 'app',
        status: 'WaitingForPickup',
        surge: 1,
      });
      if (!rm.accept('req_e2e_wait', undefined, true)) return false;
      rm.update({ x: 0, z: 0, speed: 0 }, 0.05);
      rm.startPickupWait(4, 15);
      return rm.getActiveWait() !== null;
    });
    expect(stagedWait).toBe(true);

    const waitBanner = page.getByTestId('hud-wait-banner');
    const waitCancel = page.getByTestId('hud-wait-cancel');
    await expect(waitBanner).toBeVisible({ timeout: 5000 });
    await expect(waitCancel).toBeVisible({ timeout: 5000 });

    await waitCancel.click();
    await expect(waitBanner).toHaveCount(0, { timeout: 5000 });
    const remainingWait = await page.evaluate(
      () => window.__uthao?.rideManager?.getActiveWait() ?? null
    );
    expect(remainingWait).toBeNull();
  });

  test('mobile 667x375 first-person HUD stays strictly in-bounds with active dialogueSubtitle and RideWaitBanner @dev-only', async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'pixel7', 'Mobile first-person touch HUD check');
    test.setTimeout(60000);

    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto('/?debug=1&district=testloop&encounters=0');
    await page.waitForSelector('#game-canvas', { timeout: 30000 });
    await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('touch-actions')).toBeVisible({ timeout: 15000 });

    await page.evaluate(() => {
      window.__uthao?.toggleCamera();
      const ui = (
        window as unknown as {
          __uthaoUi?: {
            hudSignal: { value: Record<string, unknown> };
            dialogueSubtitleSignal: { value: unknown };
            rideWaitSignal: { value: unknown };
          };
        }
      ).__uthaoUi;
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
        ui.dialogueSubtitleSignal.value = {
          speaker: 'p_debug',
          text: 'বাইকে করে কি প্রধান মোড়ের জ্যামটা কাটিয়ে বের হওয়া যাবে?',
        };
        ui.rideWaitSignal.value = {
          kind: 'pickupWait',
          labelKey: 'hud.wait.pickup',
          placeKey: 'poi.mirpara.clinic',
          totalSimSec: 6,
          remainingSimSec: 4,
          totalGameMin: 3,
          remainingGameMin: 2,
          canCancel: true,
        };
      }
    });

    await expect(page.getByTestId('hud-first-person')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('hud-wait-banner')).toBeVisible({ timeout: 5000 });

    const report = await page.evaluate(() => {
      const vw = 667;
      const vh = 375;
      const touchIds = ['touch-zone-steer', 'touch-zone-throttle', 'touch-zone-brake', 'touch-icons'];
      const hudIds = [
        'hud-district',
        'hud-objective-pill',
        'hud-earnings',
        'hud-passenger-status',
        'hud-quick-actions',
        'hud-speed-pod',
        'hud-wait-banner',
      ];
      const boxOf = (id: string) => {
        const el = document.querySelector(`[data-testid="${id}"]`);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { id, left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
      };
      const touchBoxes = touchIds.map(boxOf);
      const hudBoxes = hudIds.map(boxOf);
      const overlaps: string[] = [];
      for (const tb of touchBoxes) {
        if (!tb) continue;
        for (const hb of hudBoxes) {
          if (!hb) continue;
          const inter = !(
            tb.right <= hb.left + 1 ||
            hb.right <= tb.left + 1 ||
            tb.bottom <= hb.top + 1 ||
            hb.bottom <= tb.top + 1
          );
          if (inter) overlaps.push(`${tb.id}<->${hb.id}`);
        }
      }
      const outOfBounds: string[] = [];
      for (const b of [...touchBoxes, ...hudBoxes]) {
        if (!b) continue;
        if (b.left < -1 || b.top < -1 || b.right > vw + 1 || b.bottom > vh + 1) {
          outOfBounds.push(
            `${b.id}(${Math.round(b.left)},${Math.round(b.top)},${Math.round(b.right)},${Math.round(b.bottom)})`
          );
        }
      }
      return { overlaps, outOfBounds };
    });

    expect(report.overlaps).toEqual([]);
    expect(report.outOfBounds).toEqual([]);
  });
});
