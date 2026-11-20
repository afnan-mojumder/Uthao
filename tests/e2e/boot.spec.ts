import { test, expect } from '@playwright/test';

test('page loads, canvas visible, no console errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    errors.push(err.message);
  });

  await page.goto('/');
  await expect(page.locator('#boot-text')).toHaveText('Uthao');
  await expect(page.locator('#game-canvas')).toBeVisible();
  expect(errors).toEqual([]);
});

test('pauses on hidden @dev-only', async ({ page }) => {
  await page.goto('/?district=testloop');
  await page.waitForFunction(() => (window as unknown as { __uthao?: unknown }).__uthao !== undefined);

  // Emulate visibilitychange -> hidden
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { value: true, writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  const isPaused = await page.evaluate(() => {
    return (window as unknown as { __uthao: { snapshot: () => { paused: boolean } } }).__uthao.snapshot().paused;
  });
  expect(isPaused).toBe(true);
});

test('autosaves on hidden', async ({ page }) => {
  // A career under way. On the title screen a hidden tab must not save, see saveIntegrity.test.ts.
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible({ timeout: 30000 });
  await page.getByTestId('menu-btn-endless').click();
  await expect(page.locator('#hud')).toBeVisible({ timeout: 15000 });

  // Clear previous storage
  await page.evaluate(() => {
    localStorage.removeItem('uthao.save.auto');
  });

  // Emulate visibilitychange -> hidden
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', writable: true });
    Object.defineProperty(document, 'hidden', { value: true, writable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });

  // Verify that uthao.save.auto was stored in localStorage and pause indicator appeared
  await expect(page.getByTestId('pause-indicator')).toBeVisible({ timeout: 5000 });
  const savedData = await page.evaluate(() => {
    return localStorage.getItem('uthao.save.auto');
  });

  expect(savedData).not.toBeNull();
  const parsed = JSON.parse(savedData!);
  expect(parsed.version).toBe(2);
  expect(parsed.slot).toBe('auto');
});

test('portrait shows rotate overlay on pixel7 portrait', async ({ page }) => {
  // Set viewport to mobile portrait
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await expect(page.locator('[data-testid="rotate-overlay"]')).toBeVisible();
});

test('main-menu waits for boot readiness so first click on New Career never hits a null callback', async ({
  page,
}) => {
  // Click New Career on the exact DOM mutation where main-menu first appears.
  // Before P0.3, main-menu rendered before PhysicsWorld/Renderer/bindUi() finished,
  // so clicking immediately invoked a null callback and stranded the player.
  await page.addInitScript(() => {
    let clicked = false;
    const tryClick = () => {
      if (clicked) return;
      const btn = document.querySelector('[data-testid="menu-btn-new-career"]') as HTMLButtonElement | null;
      if (btn) {
        clicked = true;
        btn.click();
      }
    };
    const observer = new MutationObserver(() => tryClick());
    window.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      tryClick();
    });
  });

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('tutorial-btn-alarm')).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId('main-menu')).toHaveCount(0);
});

test('aborts boot cleanly before physics/renderer/rAF when WebGL2 is unavailable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.addInitScript(() => {
    Object.defineProperty(window, 'WebGL2RenderingContext', {
      configurable: true,
      value: undefined,
    });
    const origGetContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === 'webgl2') return null;
      return origGetContext.apply(this, [type, ...args] as Parameters<typeof origGetContext>);
    } as typeof origGetContext;
  });

  await page.goto('/');
  const unsupported = page.getByTestId('unsupported-overlay');
  await expect(unsupported).toBeVisible({ timeout: 10000 });
  await expect(unsupported).toContainText('উঠাও চালাতে WebGL2 প্রয়োজন');
  await expect(page.getByTestId('loading-overlay')).toHaveCount(0);
  await expect(page.getByTestId('main-menu')).toHaveCount(0);
  const hasDebugApi = await page.evaluate(
    () => (window as unknown as { __uthao?: unknown }).__uthao !== undefined
  );
  expect(hasDebugApi).toBe(false);
  expect(errors).toEqual([]);
});
