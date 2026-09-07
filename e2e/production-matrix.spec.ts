import { expect, test } from '@playwright/test';

test('le build de production reste utilisable', async ({ page, context, browserName }) => {
  await page.goto('/auth');
  await expect(page.getByRole('heading', { name: 'LoL Rogue' })).toBeVisible();
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await expect(page.getByText('Mode invité')).toBeVisible();
  await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');

  const settingsButton = page.getByRole('button', { name: 'Réglages' });
  await expect(settingsButton).toBeEnabled();

  if (browserName === 'chromium') {
    await context.setOffline(true);
    // Offline contract: an already loaded guest session remains readable and
    // interactive; routes not loaded yet are not promised without a service worker.
    await expect(page.getByText('Mode invité')).toBeVisible();
    await expect(settingsButton).toBeEnabled();
    await context.setOffline(false);
  }
});
