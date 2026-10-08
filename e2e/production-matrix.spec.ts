import { expect, test } from '@playwright/test';
import {
  CHAMPION_CATALOG_VERSION,
  CHAMPION_ECONOMY_CATALOG,
  CHAMPION_ECONOMY_VERSION,
} from '../src/domain/championEconomy';
import type { ChampionEconomySnapshot } from '../src/types/championEconomy';

test('le build de production reste utilisable', async ({ page, context, browserName }) => {
  // This compatibility matrix exercises the historical guest flow; connected
  // economy ON and persistence are verified separately against the real server.
  await page.route('**/rest/v1/rpc/get_champion_economy_snapshot', async (route) => {
    if (route.request().method() !== 'POST') return route.fallback();
    const snapshot: ChampionEconomySnapshot = {
      enabled: false,
      economyVersion: CHAMPION_ECONOMY_VERSION,
      catalogVersion: CHAMPION_CATALOG_VERSION,
      gameplayRulesetVersion: 21,
      serverNow: new Date().toISOString(),
      rotation: null,
      catalog: [...CHAMPION_ECONOMY_CATALOG],
      wallet: null,
      ownedChampionIds: [],
      firstWinChampionIds: [],
    };
    await route.fulfill({ status: 200, contentType: 'application/json', json: snapshot });
  });
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
  await page.locator('#patch-notes-menu-link').click();
  await expect(page).toHaveURL('/patch-notes');
  await expect(
    page.getByRole('heading', { name: 'Notes de mise à jour', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Les nouveautés à portée de main' }),
  ).toBeVisible();
});
