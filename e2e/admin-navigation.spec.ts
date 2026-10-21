import { writeFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { browserZoomContext } from './helpers/admin-browser-zoom';
import { enterAdminExplorer } from './helpers/admin-explorer';
import { adminNavigationBackend } from './helpers/admin-navigation-backend';

async function noPageOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
}

async function essentialTable(panel: Locator, label: string) {
  await expect(panel.getByRole('columnheader')).toHaveCount(3);
  const toggle = panel.getByRole('checkbox', { name: label });
  await toggle.focus();
  await toggle.press('Space');
  await expect(panel.getByRole('columnheader')).toHaveCount(8);
  const region = panel.locator('.admin-responsive-table [role="region"]');
  await region.focus();
  await expect(region).toBeFocused();
  await region.press('ArrowRight');
  await expect.poll(() => region.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  await toggle.focus();
  await toggle.press('Space');
  await expect(panel.getByRole('columnheader')).toHaveCount(3);
}

for (const language of ['fr-FR', 'en-US'] as const) {
  const english = language === 'en-US';
  test(`${language}: essential mobile columns, server pagination, detail focus and browser history`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 780 });
    const api = await adminNavigationBackend(page);
    await enterAdminExplorer(page, language);
    await page.getByRole('tab', { name: english ? /Players/ : /Joueurs/ }).click();
    const panel = page.locator('#admin-panel-players');
    await expect(panel.getByRole('heading', { level: 2 })).toBeVisible();
    await essentialTable(panel, english ? 'Show all columns' : 'Afficher toutes les colonnes');
    await noPageOverflow(page);
    const next = panel.getByRole('button', {
      name: english ? 'Next page' : 'Page suivante',
      exact: true,
    });
    await next.focus();
    await next.press('Enter');
    await expect(panel.getByText('Player 51', { exact: true })).toBeVisible();
    expect(api.playerRequests.at(-1)?.p_cursor).not.toBeNull();
    const open = panel.getByRole('button', {
      name: /(?:View profile|Voir la fiche).*Player 51/,
    });
    await open.focus();
    await open.press('Enter');
    await expect(panel.getByRole('heading', { level: 3 }).first()).toBeFocused();
    await expect(page).toHaveURL(/player=10000000-0000-4000-8000-000000000051/);
    await noPageOverflow(page);
    await panel
      .getByRole('button', {
        name: english ? 'Back to results' : 'Retour aux résultats',
        exact: true,
      })
      .click();
    await expect(open).toBeFocused();
    await page.goBack();
    await expect(panel.getByRole('heading', { level: 3 }).first()).toBeVisible();
    await page.goForward();
    await expect(open).toBeVisible();
    const audit = await new AxeBuilder({ page })
      .include('#admin-panel-players')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    expect(audit.violations).toEqual([]);
  });

  test(`${language}: real Chromium 200% and 400% browser zoom keeps table actions and export dialog usable`, async ({
    baseURL,
  }, info) => {
    test.setTimeout(90_000);
    const zoomed = await browserZoomContext(baseURL!);
    try {
      const page = await zoomed.context.newPage();
      page.setDefaultTimeout(20_000);
      await adminNavigationBackend(page);
      await enterAdminExplorer(page, language);
      for (const factor of [2, 4] as const) {
        const evidence = await zoomed.setZoom(page, factor);
        const metricsPath = info.outputPath(`browser-zoom-${language}-${factor * 100}.json`);
        await writeFile(metricsPath, JSON.stringify(evidence, null, 2));
        await info.attach(`browser-zoom-${language}-${factor * 100}`, {
          path: metricsPath,
          contentType: 'application/json',
        });
        await page.getByRole('tab', { name: english ? /Players/ : /Joueurs/ }).click();
        await essentialTable(
          page.locator('#admin-panel-players'),
          english ? 'Show all columns' : 'Afficher toutes les colonnes',
        );
        await noPageOverflow(page);
        await page.getByRole('tab', { name: /Runs/ }).click();
        const runs = page.locator('#admin-panel-runs');
        await essentialTable(runs, english ? 'Show all columns' : 'Afficher toutes les colonnes');
        const exportAll = runs.getByRole('button', {
          name: english ? 'Export all filtered results' : 'Exporter tous les résultats filtrés',
          exact: true,
        });
        await exportAll.focus();
        await exportAll.press('Enter');
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        const confirm = dialog.getByRole('button', {
          name: english ? 'Confirm and export' : 'Confirmer et exporter',
          exact: true,
        });
        await expect(confirm).toBeFocused();
        await confirm.press('Shift+Tab');
        await expect(
          dialog.getByRole('button', {
            name: english ? 'Cancel' : 'Annuler',
            exact: true,
          }),
        ).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);
        await expect(exportAll).toBeFocused();
        await noPageOverflow(page);
        const audit = await new AxeBuilder({ page })
          .include('#admin-panel-runs')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(audit.violations).toEqual([]);
        const screenshotPath = info.outputPath(`admin-real-zoom-${language}-${factor * 100}.png`);
        await zoomed.screenshot(page, screenshotPath);
        await info.attach(`admin-real-zoom-${language}-${factor * 100}`, {
          path: screenshotPath,
          contentType: 'image/png',
        });
      }
    } finally {
      await zoomed.close();
    }
  });
}

test('a superseded player search cannot replace the current filter after tab navigation', async ({
  page,
}) => {
  const api = await adminNavigationBackend(page);
  await enterAdminExplorer(page, 'en-US');
  await page.getByRole('tab', { name: /Players/ }).click();
  const panel = page.locator('#admin-panel-players');
  const search = panel.getByRole('searchbox');
  api.holdSearch = 'Earlier request';
  try {
    await search.fill(api.holdSearch);
    await expect
      .poll(() =>
        api.playerRequests.some(
          (args) => (args.p_filters as Record<string, unknown>)?.search === api.holdSearch,
        ),
      )
      .toBe(true);
    await search.fill('Current request');
    await expect(panel.getByText('Current request', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: /Runs/ }).click();
    api.releaseSearch();
    await page.getByRole('tab', { name: /Players/ }).click();
    await expect(search).toHaveValue('Current request');
    await expect(panel.getByText('Current request', { exact: true })).toBeVisible();
    await expect(panel.getByText('Earlier request', { exact: true })).toHaveCount(0);
  } finally {
    api.releaseSearch();
  }
});
