import { expect, test } from '@playwright/test';

test.use({ hasTouch: true });

test('la sélection mobile ouvre la fiche et permet de revenir au champion choisi', async ({
  context,
  page,
}) => {
  await context.addInitScript(() => localStorage.clear());
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await page.getByRole('button', { name: 'Champions' }).click();

  const champion = page.getByRole('button', { name: /Garen/ }).first();
  await champion.tap();

  const detail = page.getByRole('region', { name: 'Fiche de Garen' });
  await expect(detail).toBeFocused();
  await expect(page.getByRole('button', { name: /Retour à la liste/ })).toBeVisible();

  await page.getByRole('tab', { name: /Améliorations/ }).tap();
  const enhancementActions = page.locator('.node-unlock-btn');
  expect(await enhancementActions.count()).toBeGreaterThan(0);
  for (let index = 0; index < (await enhancementActions.count()); index++) {
    const box = await enhancementActions.nth(index).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.getByRole('button', { name: /Retour à la liste/ }).tap();
  await expect(champion).toBeFocused();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
