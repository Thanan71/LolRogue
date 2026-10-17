import { expect, type Page, type TestInfo, test } from '@playwright/test';

async function captureAdminPage(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((image) => image.decode()));
  });
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

// Browser → actual admin hook/query/client → controlled Data API responses → UI.
// Admin authorization and ledger integrity are verified against PostgreSQL separately.
async function enterAdmin(page: Page, language: 'fr-FR' | 'en-US' = 'fr-FR') {
  await page.addInitScript((selected) => {
    localStorage.clear();
    localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: selected } }));
  }, language);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/auth');
  await page
    .getByRole('button', {
      name: language === 'fr-FR' ? 'Jouer en invité' : 'Play as guest',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL('/');
  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/authStore.ts');
    const user = { id: '00000000-0000-4000-8000-000000000099' } as NonNullable<
      ReturnType<typeof useAuthStore.getState>['user']
    >;
    const session = {
      user,
      access_token: 'admin-ui-fixture',
      refresh_token: 'admin-ui-fixture',
      token_type: 'bearer',
    } as NonNullable<ReturnType<typeof useAuthStore.getState>['session']>;
    useAuthStore.setState({
      user,
      session,
      isAdmin: true,
      isAuthenticated: true,
      isGuest: false,
      isInitialized: true,
      isLoading: false,
      authStatus: 'ready',
      player: {
        id: user.id,
        username: 'admin-ui-fixture',
        display_name: 'Admin UI fixture',
        is_admin: true,
        level: 1,
        total_candies: 0,
        total_runs_completed: 0,
        total_wins: 0,
      } as NonNullable<ReturnType<typeof useAuthStore.getState>['player']>,
    });
  });
  await page
    .getByRole('button', {
      name: language === 'fr-FR' ? "Panneau d'administration" : 'Admin panel',
      exact: true,
    })
    .click();
  await expect(page).toHaveURL('/admin');
}

async function backend(page: Page, emptyPlayers = false) {
  const state = { statsFail: false, logsFail: true, reads: new Map<string, number>() };
  await page.route('**/rest/v1/**', async (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    state.reads.set(table, (state.reads.get(table) ?? 0) + 1);
    if ((table === 'admin_stats' && state.statsFail) || (table === 'logs' && state.logsFail)) {
      await route.fulfill({
        status: 500,
        json: { code: 'XX000', message: 'Simulated unavailable source' },
      });
      return;
    }
    if (table === 'admin_stats') {
      await route.fulfill({
        json: [
          { stat_name: 'active_today', stat_value: '0' },
          { stat_name: 'total_players', stat_value: '1001' },
          { stat_name: 'total_candies_balance', stat_value: '9007199254740993' },
          { stat_name: 'total_candies_earned', stat_value: null },
          { stat_name: 'candies_ledger_started_at', stat_value: '2026-10-17T04:00:00.000Z' },
        ],
      });
      return;
    }
    if (table === 'admin_player_stats') {
      const rows = emptyPlayers
        ? []
        : Array.from({ length: 100 }, (_, index) => ({
            id: `player-${index}`,
            username: `Player ${index}`,
            display_name: null,
            level: 1,
            total_runs_completed: 0,
            total_wins: 0,
            win_rate: 0,
            total_candies: 0,
            last_login_at: null,
            created_at: '2026-10-17T04:00:00Z',
            is_admin: false,
          }));
      expect(route.request().headers().prefer).toContain('count=exact');
      await route.fulfill({
        json: rows,
        headers: {
          'access-control-expose-headers': 'content-range',
          'content-range': emptyPlayers ? '*/0' : '0-99/1001',
        },
      });
      return;
    }
    if (table === 'logs') {
      await route.fulfill({
        json: [
          {
            id: 'log-1',
            created_at: '2026-10-17T04:00:00Z',
            level: 'info',
            repository: 'admin-ui-fixture',
            method: 'read',
            operation: 'select',
            duration_ms: 0,
            error_message: null,
            error_stack: null,
          },
        ],
        headers: { 'access-control-expose-headers': 'content-range', 'content-range': '0-0/1' },
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

test('admin sections recover independently and distinguish absent metrics, exact counts and stale data', async ({
  page,
}, testInfo) => {
  const api = await backend(page);
  await enterAdmin(page);
  const dashboard = page.getByRole('tabpanel', { name: /Tableau de bord/ });
  await expect(dashboard.locator('[data-metric="active_today"] .stat-value')).toHaveText('0');
  await expect(dashboard.locator('[data-metric="total_candies_earned"] .stat-value')).toHaveText(
    'Indisponible',
  );
  await expect(dashboard.locator('[data-metric="total_runs"] .stat-value')).toHaveText(
    'Indisponible',
  );
  await expect(dashboard.locator('[data-metric="total_candies_balance"] .stat-value')).toHaveText(
    '9 007 199 254 740 993',
  );
  await dashboard.locator('[data-metric="active_today"] summary').click();
  await expect(dashboard.getByText(/last_login_at/)).toBeVisible();
  await expect(dashboard.getByText(/00:00 UTC suivant/)).toBeVisible();

  await page.getByRole('tab', { name: /Joueurs/ }).click();
  const players = page.getByRole('tabpanel', { name: /Joueurs/ });
  await expect(players.getByRole('row')).toHaveCount(101);
  await expect(players.getByRole('status')).toContainText(
    /Lignes affichées : 100.*Total correspondant aux filtres : 1\s001/,
  );

  await page.getByRole('tab', { name: /Journaux/ }).click();
  const logs = page.getByRole('tabpanel', { name: /Journaux/ });
  await expect(logs.getByRole('alert')).toContainText('La requête d’administration a échoué.');
  api.logsFail = false;
  await logs.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(logs.getByRole('cell', { name: 'admin-ui-fixture', exact: true })).toBeVisible();
  expect(api.reads.get('admin_player_stats')).toBe(1);
  expect(api.reads.get('admin_stats')).toBe(1);

  await page.getByRole('tab', { name: /Tableau de bord/ }).click();
  api.statsFail = true;
  await dashboard.getByRole('button', { name: 'Actualiser les statistiques' }).click();
  await expect(dashboard.getByRole('alert')).toBeVisible();
  await expect(dashboard.getByRole('status')).toContainText('Données périmées');
  await expect(dashboard.locator('[data-metric="active_today"] .stat-value')).toHaveText('0');
  api.statsFail = false;
  await dashboard.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await expect(dashboard.getByRole('alert')).toHaveCount(0);
  await expect(dashboard.getByRole('status')).toHaveCount(0);
  await captureAdminPage(page, testInfo, 'admin-desktop-fr');
});

test('English admin definitions and a true empty count remain usable at 320px', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await backend(page, true);
  await enterAdmin(page, 'en-US');
  const dashboard = page.getByRole('tabpanel', { name: /Dashboard/ });
  await expect(dashboard.locator('[data-metric="total_candies_earned"] .stat-value')).toHaveText(
    'Unavailable',
  );
  await dashboard.locator('[data-metric="active_today"] summary').click();
  await expect(dashboard.getByText(/next 00:00 UTC/)).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await captureAdminPage(page, testInfo, 'admin-mobile-en');
  await page.getByRole('tab', { name: /Players/ }).click();
  const players = page.getByRole('tabpanel', { name: /Players/ });
  await expect(players.getByRole('status')).toContainText(/Total matching the filters\s*:\s*0/);
  await expect(players.getByText('No players found')).toBeVisible();
});
