import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import {
  ADMIN_PLAYER_SNAPSHOT,
  adminPlayerDetailFixture,
  adminPlayerFixture,
  adminPlayerPageFixture,
} from '../tests/fixtures/adminPlayerExplorer';
import { captureLoadedAdminPage, enterAdminExplorer } from './helpers/admin-explorer';

async function backend(page: Page) {
  const api = { searches: [] as Record<string, unknown>[], detailFail: false, detailReads: 0 };
  await page.route('**/rest/v1/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (name === 'admin_search_players') {
      const args = route.request().postDataJSON() as {
        p_filters: Record<string, unknown>;
        p_cursor: { after: number } | null;
        p_snapshot: string | null;
        p_page_size: number;
      };
      api.searches.push(args);
      if (args.p_filters.accountState === 'guest') {
        await route.fulfill({ json: adminPlayerPageFixture(1, 50, 0) });
      } else if (args.p_filters.search) {
        const item = { ...adminPlayerFixture(120), displayName: 'Remote Élise%_,.()' };
        await route.fulfill({
          json: {
            items: [item],
            total: 1,
            hasMore: false,
            nextCursor: null,
            snapshotAt: ADMIN_PLAYER_SNAPSHOT,
          },
        });
      } else {
        await route.fulfill({
          json: adminPlayerPageFixture((args.p_cursor?.after ?? 0) + 1, args.p_page_size),
        });
      }
      return;
    }
    if (name === 'admin_get_player_detail') {
      api.detailReads++;
      if (api.detailFail)
        await route.fulfill({
          status: 500,
          json: { code: 'XX000', message: 'Simulated profile read failure' },
        });
      else {
        const detail = adminPlayerDetailFixture(120);
        detail.profile.displayName = 'Remote Élise%_,.()';
        await route.fulfill({ json: detail });
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
          snapshotAt: ADMIN_PLAYER_SNAPSHOT,
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

test('player search spans server pages, preserves literal filters and returns from a profile', async ({
  page,
}, info) => {
  const api = await backend(page);
  await enterAdminExplorer(page);
  await page.getByRole('tab', { name: /Joueurs/ }).click();
  const panel = page.getByRole('tabpanel', { name: /Joueurs/ });
  const pagination = panel.getByRole('navigation');
  await expect(pagination.getByRole('status')).toContainText(/Total filtré : 123/);
  await pagination.getByRole('button', { name: 'Page suivante', exact: true }).click();
  await expect(panel.getByText('Player 51', { exact: true })).toBeVisible();
  await pagination.getByRole('button', { name: 'Page suivante', exact: true }).click();
  await expect(panel.getByText('Player 101', { exact: true })).toBeVisible();
  await expect(panel.getByRole('row')).toHaveCount(24);
  await expect(
    pagination.getByRole('button', { name: 'Page suivante', exact: true }),
  ).toBeDisabled();
  await pagination.getByRole('button', { name: 'Page précédente', exact: true }).click();
  await expect(panel.getByText('Player 51', { exact: true })).toBeVisible();
  expect(api.searches.slice(1, 4).map((args) => args.p_snapshot)).toEqual(
    Array(3).fill(ADMIN_PLAYER_SNAPSHOT),
  );
  const search = panel.getByRole('searchbox', { name: 'Identifiant public, nom ou pseudo' });
  await search.fill('éLISE%_,.()');
  await expect(panel.getByRole('row')).toHaveCount(2);
  expect((api.searches.at(-1)?.p_filters as Record<string, unknown>).search).toBe('éLISE%_,.()');
  expect(api.searches.at(-1)?.p_cursor).toBeNull();
  const open = panel.getByRole('button', {
    name: 'Voir la fiche — Remote Élise%_,.()',
    exact: true,
  });
  await open.click();
  await expect(
    panel.getByRole('heading', { name: 'Fiche joueur — Remote Élise%_,.()', exact: true }),
  ).toBeVisible();
  await expect(panel.getByText(/Historique antérieur incomplet/)).toBeVisible();
  await expect(panel.getByText('arcane_power: 1', { exact: true })).toBeVisible();
  await expect(panel.getByText('Attribution historique', { exact: true })).toBeVisible();
  await captureLoadedAdminPage(page, info, 'admin-player-desktop-fr');
  await panel.getByRole('button', { name: 'Retour aux résultats', exact: true }).click();
  await expect(search).toHaveValue('éLISE%_,.()');
  await expect(open).toBeFocused();
  const count = api.searches.length;
  await page.getByRole('tab', { name: /Tableau de bord/ }).click();
  await page.getByRole('tab', { name: /Joueurs/ }).click();
  await expect(search).toHaveValue('éLISE%_,.()');
  expect(api.searches).toHaveLength(count);
});

test('English player profile recovers independently and remains keyboard-accessible at 320px', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 320, height: 780 });
  const api = await backend(page);
  await enterAdminExplorer(page, 'en-US');
  await page.getByRole('tab', { name: /Players/ }).click();
  const panel = page.getByRole('tabpanel', { name: /Players/ });
  const search = panel.getByRole('searchbox', { name: 'Public ID, name or username' });
  await search.fill(adminPlayerFixture(120).id);
  const open = panel.getByRole('button', {
    name: 'View profile — Remote Élise%_,.()',
    exact: true,
  });
  await expect(open).toBeVisible();
  const count = api.searches.length;
  api.detailFail = true;
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(panel.getByRole('alert')).toContainText('The admin request failed.');
  api.detailFail = false;
  await panel.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(
    panel.getByRole('heading', { name: 'Player profile — Remote Élise%_,.()', exact: true }),
  ).toBeVisible();
  expect(api.searches).toHaveLength(count);
  expect(api.detailReads).toBe(2);
  const shards = panel.getByRole('region', { name: 'Shards', exact: true });
  await expect(shards.getByText('Unavailable', { exact: true })).toHaveCount(4);
  await expect(panel.getByText(/Earlier history is incomplete/)).toBeVisible();
  await expect(panel.getByText(/No email or authentication identifier/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  const accessibility = await new AxeBuilder({ page })
    .include('#admin-panel-players')
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await captureLoadedAdminPage(page, info, 'admin-player-mobile-en');
  await panel.getByRole('button', { name: 'Back to results', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(open).toBeFocused();
  await expect(search).toHaveValue(adminPlayerFixture(120).id);
});
