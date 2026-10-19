import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import type { BalanceFilters } from '../src/pages/admin/balance/balanceTypes';
import {
  balanceBuildFixture,
  balanceChampionFixture,
  balanceConfigFixture,
} from '../tests/fixtures/adminBalanceUi';
import { captureLoadedAdminPage, enterAdminExplorer } from './helpers/admin-explorer';

async function balanceBackend(page: Page) {
  const api = {
    champions: [] as BalanceFilters[],
    builds: [] as BalanceFilters[],
    failChampions: false,
    denyChampions: false,
    configReads: 0,
  };
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name === 'admin_balance_config') {
      api.configReads += 1;
      await route.fulfill({ json: balanceConfigFixture() });
      return;
    }
    if (name === 'admin_balance_champions' || name === 'admin_balance_builds') {
      const filters = (route.request().postDataJSON() as { p_filters: BalanceFilters }).p_filters;
      if (name === 'admin_balance_champions') {
        api.champions.push(filters);
        if (api.denyChampions) {
          await route.fulfill({ status: 403, json: { code: '42501', message: 'Admin required' } });
          return;
        }
        if (api.failChampions) {
          await route.fulfill({
            status: 500,
            json: { code: 'XX000', message: 'Controlled balance read failure' },
          });
          return;
        }
        await route.fulfill({ json: balanceChampionFixture(filters) });
      } else {
        api.builds.push(filters);
        await route.fulfill({ json: balanceBuildFixture(filters) });
      }
      return;
    }
    if (name?.startsWith('admin_search_')) {
      await route.fulfill({
        json: {
          items: [],
          total: 0,
          hasMore: false,
          nextCursor: null,
          snapshotAt: '2026-10-18T12:00:00Z',
        },
      });
      return;
    }
    await route.fulfill({
      json: [],
      headers: { 'access-control-expose-headers': 'content-range', 'content-range': '*/0' },
    });
  });
  return api;
}

async function openBalance(page: Page, language: 'fr-FR' | 'en-US' = 'fr-FR') {
  await enterAdminExplorer(page, language);
  await page.getByRole('tab', { name: language === 'fr-FR' ? /Équilibrage/ : /Balance/ }).click();
  const panel = page.locator('#admin-panel-balance');
  await expect(panel.locator('#admin-balance-final-champions table')).toBeVisible();
  await expect(panel.locator('#admin-balance-picks table')).toBeVisible();
  await expect(panel.locator('#admin-balance-builds table')).toBeVisible();
  await expect(panel.locator('#admin-balance-config table')).toBeVisible();
  await expect(panel).toContainText('TREE-10');
  return panel;
}

test('balance has one dedicated tab, versioned populations and independent stale retry', async ({
  page,
}, info) => {
  const api = await balanceBackend(page);
  const panel = await openBalance(page);
  await expect(page.getByRole('tab', { name: /Équilibrage/ })).toHaveCount(1);
  const form = panel.getByRole('form', { name: 'Équilibrage : période et population' });
  await form.getByLabel('Début inclus (UTC)', { exact: true }).fill('2026-10-01');
  await form.getByLabel('Fin incluse (UTC)', { exact: true }).fill('2026-10-17');
  await form.getByRole('combobox', { name: 'Difficulté', exact: true }).selectOption('hard');
  await form.getByRole('button', { name: 'Appliquer les filtres', exact: true }).click();
  const champions = panel.locator('#admin-balance-champions');
  await expect(champions).toHaveAttribute('aria-busy', 'false');
  expect(api.champions.at(-1)).toMatchObject({
    from: '2026-10-01',
    to: '2026-10-17',
    difficulty: 'hard',
  });
  expect(api.builds.at(-1)).toEqual(api.champions.at(-1));
  await expect(champions).toContainText('run-engine-0.2.5');
  await expect(champions).toContainText(/moins de 30 comptes/);
  await expect(champions).toContainText(/Runs répétées par compte/);
  const buildReads = api.builds.length;
  const configReads = api.configReads;
  api.failChampions = true;
  await champions.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(champions.getByRole('alert')).toBeVisible();
  await expect(champions.locator('#admin-balance-final-champions table')).toBeVisible();
  await expect(champions).toContainText(/dernière lecture réussie/);
  await expect(panel.locator('#admin-balance-builds table')).toBeVisible();
  api.failChampions = false;
  await champions.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(champions.getByRole('alert')).toHaveCount(0);
  await expect(champions).toHaveAttribute('aria-busy', 'false');
  expect(api.builds).toHaveLength(buildReads);
  expect(api.configReads).toBe(configReads);
  await page.getByRole('tab', { name: /Autorité/ }).click();
  await expect(page.locator('#admin-panel-authority .field-calibration')).toHaveCount(0);
  await page.getByRole('tab', { name: /Équilibrage/ }).click();
  await expect(panel.locator('.field-calibration')).toHaveCount(1);
  await expect(form.getByRole('combobox', { name: 'Difficulté', exact: true })).toHaveValue('hard');
  await captureLoadedAdminPage(page, info, 'admin-balance-desktop-fr');
});

test('English balance reflows at320px with keyboard tables, honest missing metrics and sources', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await balanceBackend(page);
  const panel = await openBalance(page, 'en-US');
  const form = panel.getByRole('form', { name: 'Balance: period and population' });
  await form.getByRole('combobox', { name: 'Difficulty', exact: true }).selectOption('easy');
  await form.getByRole('button', { name: 'Apply filters', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(panel.locator('#admin-balance-champions')).toHaveAttribute('aria-busy', 'false');
  await expect(panel).toContainText('DPS and control duration are not collected');
  await expect(panel).toContainText('Waiting for TREE-10');
  await expect(panel).toContainText('without guaranteed simultaneity');
  await panel.getByText('Baseline provenance', { exact: true }).click();
  await expect(
    panel.getByRole('link', { name: 'P2-BAL-01: human validation protocol' }),
  ).toHaveAttribute('href', /docs\/field-calibration\.md/);
  const region = panel.locator('#admin-balance-final-champions');
  await region.focus();
  await expect(region).toBeFocused();
  const position = await region.evaluate((element) => element.scrollLeft);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => region.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(position);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page })
    .include('#admin-panel-balance')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await captureLoadedAdminPage(page, info, 'admin-balance-mobile-en');
});

test('permission denial clears every cached balance resource and disables retries', async ({
  page,
}) => {
  const api = await balanceBackend(page);
  const panel = await openBalance(page);
  api.denyChampions = true;
  await panel
    .locator('#admin-balance-champions')
    .getByRole('button', { name: 'Actualiser', exact: true })
    .click();
  await expect(panel.getByRole('alert').first()).toContainText('Accès refusé');
  for (const resource of ['champions', 'builds', 'config', 'field'])
    await expect(panel.locator(`#admin-balance-${resource}`).getByRole('table')).toHaveCount(0);
  expect(api.champions.length).toBeGreaterThan(1);
  await expect(
    panel
      .locator('#admin-balance-champions')
      .getByRole('button', { name: 'Actualiser', exact: true }),
  ).toBeDisabled();
});

test('a forged balance URL cannot bypass the admin route guard', async ({ page }) => {
  let balanceReads = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.startsWith('/rest/v1/rpc/admin_balance_'))
      balanceReads += 1;
  });
  await page.goto('/admin?tab=balance');
  await expect(page).toHaveURL('/auth');
  await expect(page.locator('#admin-panel-balance')).toHaveCount(0);
  expect(balanceReads).toBe(0);
});
