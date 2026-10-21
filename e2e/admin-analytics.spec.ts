import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import type { AnalyticsFilters } from '../src/features/administration/domain/analytics/analyticsTypes';
import {
  adminFunnelUiFixture,
  adminRetentionUiFixture,
  adminSeriesUiFixture,
} from '../tests/fixtures/adminAnalyticsUi';
import { captureLoadedAdminPage, enterAdminExplorer } from './helpers/admin-explorer';

async function analyticsBackend(page: Page) {
  const api = {
    series: [] as AnalyticsFilters[],
    retention: [] as AnalyticsFilters[],
    funnel: [] as AnalyticsFilters[],
    failSeries: false,
  };
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop();
    if (name?.startsWith('admin_analytics_')) {
      const args = route.request().postDataJSON() as {
        p_filters: AnalyticsFilters;
      };
      if (name === 'admin_analytics_series') {
        api.series.push(args.p_filters);
        if (api.failSeries)
          await route.fulfill({
            status: 500,
            json: {
              code: 'XX000',
              message: 'Controlled analytics read failure',
            },
          });
        else await route.fulfill({ json: adminSeriesUiFixture(args.p_filters) });
      } else if (name === 'admin_analytics_retention') {
        api.retention.push(args.p_filters);
        await route.fulfill({ json: adminRetentionUiFixture(args.p_filters) });
      } else {
        api.funnel.push(args.p_filters);
        await route.fulfill({ json: adminFunnelUiFixture(args.p_filters) });
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
          snapshotAt: '2026-10-17T12:00:00Z',
        },
      });
      return;
    }
    await route.fulfill({
      json: [],
      headers: {
        'access-control-expose-headers': 'content-range',
        'content-range': '*/0',
      },
    });
  });
  return api;
}

async function openAnalytics(page: Page, language: 'fr-FR' | 'en-US' = 'fr-FR') {
  await enterAdminExplorer(page, language);
  await page
    .getByRole('tab', {
      name: language === 'fr-FR' ? /Analyses temporelles/ : /Time analytics/,
      exact: true,
    })
    .click();
  const panel = page.locator('#admin-panel-analytics');
  await expect(panel.locator('#admin-analytics-series svg')).toBeVisible();
  await expect(panel.locator('#admin-analytics-retention table')).toBeVisible();
  await expect(panel.locator('#admin-analytics-funnel progress')).toHaveCount(5);
  return panel;
}

test('French UTC charts preserve the chosen metric across filters, tabs and an independent stale retry', async ({
  page,
}, info) => {
  const api = await analyticsBackend(page);
  const panel = await openAnalytics(page);
  const series = panel.locator('#admin-analytics-series');
  await series.getByLabel('Indicateur affiché').selectOption('starts');
  await panel.getByLabel('Date de début incluse (UTC)').fill('2026-10-01');
  await panel.getByLabel('Date de fin incluse (UTC)').fill('2026-10-16');
  await panel.getByLabel('Regroupement des courbes').selectOption('week');
  await panel.getByRole('button', { name: 'Appliquer les filtres', exact: true }).click();
  await expect(series).toHaveAttribute('aria-busy', 'false');
  await expect(series.getByLabel('Indicateur affiché')).toHaveValue('starts');
  await series.getByText('Afficher le tableau de données', { exact: true }).click();
  await expect(series.getByRole('row')).toHaveCount(4);
  await expect(series.getByRole('row').nth(2)).toContainText('12');
  expect(api.series[api.series.length - 1]).toMatchObject({
    from: '2026-10-01',
    to: '2026-10-16',
    granularity: 'week',
  });
  expect(api.retention[api.retention.length - 1]).not.toHaveProperty('granularity');
  await expect(
    series.getByText(/Certaines périodes ont une couverture inconnue ou partielle/),
  ).toBeVisible();
  await expect(series.getByText(/Les périodes marquées partielles/)).toBeVisible();
  const retentionCount = api.retention.length;
  const funnelCount = api.funnel.length;
  api.failSeries = true;
  await series.getByRole('button', { name: 'Actualiser', exact: true }).click();
  await expect(series.getByRole('alert')).toContainText('Cette analyse n’a pas pu être chargée.');
  await expect(series.getByRole('table')).toBeVisible();
  await expect(series.getByText(/dernière lecture réussie/)).toBeVisible();
  await expect(panel.locator('#admin-analytics-retention table')).toBeVisible();
  api.failSeries = false;
  await series.getByRole('button', { name: 'Réessayer cette section', exact: true }).click();
  await expect(series.getByRole('alert')).toHaveCount(0);
  await expect(series).toHaveAttribute('aria-busy', 'false');
  expect(api.retention).toHaveLength(retentionCount);
  expect(api.funnel).toHaveLength(funnelCount);
  await expect(series.getByLabel('Indicateur affiché')).toHaveValue('starts');
  await page.getByRole('tab', { name: /Vue globale/ }).click();
  await page.getByRole('tab', { name: /Analyses temporelles/ }).click();
  await expect(series.getByLabel('Indicateur affiché')).toHaveValue('starts');
  await expect(panel.getByLabel('Date de début incluse (UTC)')).toHaveValue('2026-10-01');
  await expect(series).toHaveAttribute('aria-busy', 'false');
  await captureLoadedAdminPage(page, info, 'admin-analytics-desktop-fr');
});

test('retention distinguishes observed history, eligible N and immature horizons while the funnel uses eligible conversions', async ({
  page,
}) => {
  await analyticsBackend(page);
  const panel = await openAnalytics(page);
  await panel.getByLabel('Date de début incluse (UTC)').fill('2026-10-01');
  await panel.getByLabel('Date de fin incluse (UTC)').fill('2026-10-16');
  await panel.getByRole('button', { name: 'Appliquer les filtres', exact: true }).click();
  const retention = panel.locator('#admin-analytics-retention');
  await expect(retention).toHaveAttribute('aria-busy', 'false');
  const historical = retention.getByRole('row').nth(1);
  await expect(historical).toContainText('1 oct. 2026');
  await expect(historical.locator('[data-status="unavailable"]')).toHaveCount(3);
  await expect(historical.getByRole('group').first()).toContainText('1 / 4');
  await expect(
    historical.getByText('Comptes éligibles à cet horizon (N) : 0', {
      exact: true,
    }),
  ).toHaveCount(3);
  const small = retention.getByRole('row').nth(2);
  await expect(small).toContainText('4 oct. 2026');
  await expect(small.locator('[data-status="insufficient"]')).toHaveCount(2);
  await expect(small.locator('[data-status="immature"]')).toHaveCount(1);
  await expect(small.getByRole('group').first()).toContainText('1 / 1');
  await expect(small.getByRole('group').first()).toContainText('100,0');
  const funnel = panel.locator('#admin-analytics-funnel');
  await expect(funnel).toHaveAttribute('aria-busy', 'false');
  await expect(funnel.getByText(/Comptes exclus des taux : couverture inconnue : 4/)).toBeVisible();
  await expect(funnel.getByRole('listitem').first()).toContainText(
    'Effectif observé : 12 · Effectif couvert et mature : 5',
  );
  await expect(funnel.getByRole('group').first()).toContainText('4 / 5');
  await expect(funnel.getByText(/ne prouve pas l’exécution/)).toBeVisible();
  const select = retention.getByLabel('Population — Rétention des cohortes de création');
  await select.selectOption('segment-daily');
  await expect(retention.getByRole('row')).toHaveCount(4);
  await expect(select).toHaveValue('segment-daily');
});

test('English analytics reflows at 320px with keyboard filters, accessible tables and honest maturity', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 780 });
  await analyticsBackend(page);
  const panel = await openAnalytics(page, 'en-US');
  await panel.getByLabel('Inclusive start date (UTC)').fill('2026-10-01');
  await panel.getByLabel('Inclusive end date (UTC)').fill('2026-10-16');
  await panel.getByRole('button', { name: 'Apply filters', exact: true }).focus();
  await page.keyboard.press('Enter');
  const retention = panel.locator('#admin-analytics-retention');
  await expect(retention).toHaveAttribute('aria-busy', 'false');
  await expect(retention.getByRole('row').nth(1)).toContainText('Oct 1, 2026');
  await expect(retention.locator('[data-status="immature"]')).not.toHaveCount(0);
  await expect(retention.getByText(/Accounts eligible for this horizon/).first()).toBeVisible();
  const region = retention.getByRole('region', {
    name: 'Registration cohort retention',
    exact: true,
  });
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
    .include('#admin-panel-analytics')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await captureLoadedAdminPage(page, info, 'admin-analytics-mobile-en');
});
