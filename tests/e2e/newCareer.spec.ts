import { test, expect } from '@playwright/test';

// A new career starts from a fresh game. Before this, the debt, relationships,
// bikes and endings of the previous career carried over.
test('a new career starts with no debt and default relationships', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('main-menu')).toBeVisible();

  // Arrange: leave the first career in a bad state
  await page.evaluate(() => {
    const gm = (window as unknown as { __uthao: { gm: { economyManager: { debt: number }; story: { characterRelationships: Record<string, number> } } } }).__uthao.gm;
    gm.economyManager.debt = 5000;
    gm.story.characterRelationships['char_ma'] = 80;
  });

  // Act
  await page.getByTestId('menu-btn-new-career').click();
  await expect(page.getByTestId('tutorial-btn-alarm')).toBeVisible({ timeout: 20000 });

  // Assert
  const state = await page.evaluate(() => {
    const gm = (window as unknown as { __uthao: { gm: { economyManager: { debt: number }; story: { characterRelationships: Record<string, number> } } } }).__uthao.gm;
    return { debt: gm.economyManager.debt, ma: gm.story.characterRelationships['char_ma'] };
  });
  expect(state.debt).toBe(0);
  expect(state.ma).not.toBe(80);
});
