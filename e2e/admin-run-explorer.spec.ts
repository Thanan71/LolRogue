import { readFile } from 'node:fs/promises';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  adminAttemptFixture,
  adminRunDetailFixture,
  adminRunFixture,
  runSnapshot,
} from '../tests/helpers/adminRunExplorerFixtures';
import { enterAdminExplorer } from './helpers/admin-explorer';

// Browser → production hook/client/validators → controlled RPC envelopes → UI/CSV.
// Real authorization, filters and concurrency are checked in the migrated database suite.
async function enterAdmin(page: Page, language: 'fr-FR' | 'en-US' = 'fr-FR') {
  await enterAdminExplorer(page, language);
  await page.getByRole('tab', { name: /Runs/ }).click();
}

async function backend(page: Page) {
  const state = {
    exports: 0,
    filters: {} as Record<string, unknown>,
    requests: [] as Record<string, unknown>[],
  };
  const items = Array.from({ length: 1001 }, (_, index) =>
    adminRunFixture({
      id: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      runUuid: `run-${index + 1}`,
      username: index === 0 ? '=FORMULA' : `player-${index + 1}`,
      displayName: `Étoile雪 ${index + 1}`,
      difficulty: 'hard',
    }),
  );
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    const body = route.request().method() === 'POST' ? route.request().postDataJSON() : {};
    if (name === 'admin_search_runs') {
      state.filters = body.p_filters;
      state.requests.push(body);
      const start = Number(body.p_cursor?.after ?? 0);
      const size = Number(body.p_page_size ?? 50);
      const hasMore = start + size < items.length;
      await route.fulfill({
        json: {
          items: items.slice(start, start + size),
          total: items.length,
          hasMore,
          nextCursor: hasMore ? { after: start + size } : null,
          snapshotAt: runSnapshot,
        },
      });
      return;
    }
    if (name === 'admin_search_attempts') {
      await route.fulfill({
        json: {
          items: [adminAttemptFixture()],
          total: 1,
          hasMore: false,
          nextCursor: null,
          snapshotAt: runSnapshot,
        },
      });
      return;
    }
    if (name === 'admin_get_run_detail') {
      await route.fulfill({
        json: {
          ...adminRunDetailFixture(),
          run: items.find((item) => item.id === body.p_run_id),
          leaseToken: 'FORBIDDEN_LEASE',
          rawResult: 'FORBIDDEN_RAW',
        },
      });
      return;
    }
    if (name === 'admin_get_attempt_detail') {
      await route.fulfill({
        json: {
          ...adminRunDetailFixture(),
          run: null,
          attempt: adminAttemptFixture(),
          timeline: [{ kind: 'rejected', at: runSnapshot, code: 'pending_choice' }],
        },
      });
      return;
    }
    if (name === 'admin_export_runs') {
      state.exports += 1;
      expect(body.p_max_rows).toBe(5_000);
      await route.fulfill({
        json: {
          items: body.p_population === 'attempts' ? [adminAttemptFixture()] : items,
          total: body.p_population === 'attempts' ? 1 : items.length,
          snapshotAt: runSnapshot,
        },
      });
      return;
    }
    if (name === 'admin_stats') {
      await route.fulfill({
        json: [
          { stat_name: 'total_players', stat_value: '101' },
          { stat_name: 'active_today', stat_value: '0' },
        ],
      });
      return;
    }
    if (name === 'admin_search_players') {
      await route.fulfill({
        json: { items: [], total: 0, hasMore: false, nextCursor: null, snapshotAt: runSnapshot },
      });
      return;
    }
    await route.fulfill({
      json: [],
      headers: { 'access-control-expose-headers': 'content-range', 'content-range': '*/0' },
    });
  });
  return state;
}

test('saved run filters, keyset return, safe detail and confirmed complete UTF-8 CSV', async ({
  page,
}) => {
  const api = await backend(page);
  await enterAdmin(page);
  const panel = page.getByRole('tabpanel', { name: /Runs/ });
  await expect(panel.getByRole('row')).toHaveCount(51);
  await panel.getByRole('combobox', { name: 'Difficulté', exact: true }).selectOption('hard');
  await panel.getByLabel('Depuis (UTC, inclus)').fill('2026-10-17T00:00');
  await panel.getByLabel('Vagues minimum').fill('2');
  await panel.getByRole('button', { name: 'Appliquer les filtres' }).click();
  await expect
    .poll(() => api.filters)
    .toMatchObject({ difficulty: 'hard', minWaves: 2, from: '2026-10-17T00:00:00.000Z' });
  await panel.getByRole('button', { name: 'Suivant' }).click();
  await expect(panel.getByText('Étoile雪 51', { exact: true })).toBeVisible();
  expect(api.requests.at(-1)).toMatchObject({ p_snapshot: runSnapshot, p_cursor: { after: 50 } });
  await panel
    .getByRole('button', { name: /Voir le détail/ })
    .first()
    .click();
  await expect(panel.getByRole('heading', { name: 'Détail de la run' })).toBeVisible();
  await expect(panel.getByText('item-fixture', { exact: true })).toBeVisible();
  await expect(panel.getByText('Candies : 20', { exact: true })).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/FORBIDDEN_LEASE|FORBIDDEN_RAW/);
  await panel.getByRole('button', { name: 'Retour aux résultats' }).click();
  await expect(panel.getByText('Étoile雪 51', { exact: true })).toBeVisible();
  await expect(panel.getByRole('combobox', { name: 'Difficulté', exact: true })).toHaveValue(
    'hard',
  );
  await expect(page).toHaveURL(/\/admin(?:\?|$)/);
  await panel.getByRole('button', { name: 'Exporter tous les résultats filtrés' }).click();
  const dialog = page.getByRole('dialog', { name: 'Confirmer l’export filtré' });
  await expect(dialog).toContainText('1 001');
  expect(api.exports).toBe(0);
  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Confirmer et exporter' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error('Complete run CSV was not downloaded.');
  const csv = await readFile(path, 'utf8');
  expect(csv.split('\r\n')).toHaveLength(1002);
  expect(csv).toContain("'=FORMULA");
  expect(csv).toContain('Étoile雪');
  expect(csv).toContain('9007199254740993');
  expect(api.exports).toBe(1);
  await expect(
    panel.getByRole('button', { name: 'Exporter tous les résultats filtrés' }),
  ).toBeFocused();
});

test('English attempts stay separate, show rejection and export only the selected population', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 800 });
  const api = await backend(page);
  await enterAdmin(page, 'en-US');
  const panel = page.getByRole('tabpanel', { name: /Runs/ });
  await panel.getByRole('radio', { name: 'Authority attempts' }).click();
  await expect(panel.getByRole('radio', { name: 'Authority attempts' })).toBeChecked();
  await expect(panel.getByLabel('Minimum waves')).toBeDisabled();
  await expect(panel.getByRole('combobox', { name: 'Biome', exact: true })).toBeDisabled();
  await expect(panel.getByRole('row')).toHaveCount(2);
  await panel.getByRole('button', { name: /View details/ }).click();
  await expect(panel.getByText('pending_choice').first()).toBeVisible();
  await expect(panel.getByText('No verified rewards for this attempt.')).toBeVisible();
  await panel.getByRole('button', { name: 'Back to results' }).click();
  await panel.getByRole('button', { name: 'Export all filtered results' }).click();
  await expect(page.getByRole('dialog')).toContainText('Authority attempts');
  await expect(page.getByRole('button', { name: 'Confirm and export' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeFocused();
  const accessibility = await new AxeBuilder({ page }).include('#admin-panel-runs').analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  expect(api.exports).toBe(0);
  await expect(page).toHaveURL(/\/admin(?:\?|$)/);
});
