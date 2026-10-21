import { expect, type Page, type TestInfo, test } from '@playwright/test';
import { getAdminDiagnosticsCopy } from '../src/i18n/adminDiagnostics';
import { validateDiagnosticsFilters } from '../src/features/administration/domain/diagnostics/adminDiagnosticsValidation';
import { diagnosticsLog, diagnosticsResponse } from '../tests/helpers/adminDiagnosticsUiFixtures';

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
  const state = {
    statsFail: false,
    logsFail: true,
    reads: new Map<string, number>(),
  };
  await page.route('**/rest/v1/**', async (route) => {
    const table = new URL(route.request().url()).pathname.split('/').at(-1) ?? '';
    state.reads.set(table, (state.reads.get(table) ?? 0) + 1);
    if (table === 'admin_stats' && state.statsFail) {
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
          {
            stat_name: 'total_candies_balance',
            stat_value: '9007199254740993',
          },
          { stat_name: 'total_candies_earned', stat_value: null },
          {
            stat_name: 'candies_ledger_started_at',
            stat_value: '2026-10-17T04:00:00.000Z',
          },
        ],
      });
      return;
    }
    if (table === 'admin_search_players') {
      const rows = emptyPlayers
        ? []
        : Array.from({ length: 50 }, (_, index) => ({
            id: `00000000-0000-4000-8000-${String(index + 100).padStart(12, '0')}`,
            username: `Player ${index}`,
            displayName: null,
            level: 1,
            verifiedRuns: 0,
            verifiedWins: 0,
            candiesBalance: '0',
            createdAt: '2026-10-17T04:00:00Z',
            lastLoginAt: null,
          }));
      await route.fulfill({
        json: {
          items: rows,
          total: emptyPlayers ? 0 : 1001,
          hasMore: !emptyPlayers,
          nextCursor: emptyPlayers ? null : { id: rows.at(-1)?.id, value: '2026-10-17T04:00:00Z' },
          snapshotAt: '2026-10-17T05:00:00Z',
        },
      });
      return;
    }
    if (table === 'admin_diagnostics') {
      const input = route.request().postDataJSON() as Record<string, unknown>;
      expect(input.p_section).toBe('logs');
      const filters = validateDiagnosticsFilters('logs', input.p_filters);
      if (state.logsFail) {
        await route.fulfill({
          status: 500,
          json: { code: 'XX000', message: 'Simulated unavailable source' },
        });
        return;
      }
      const snapshotAt = `${filters.to}T12:15:30.123456Z`;
      await route.fulfill({
        json: diagnosticsResponse(
          { section: 'logs', filters },
          {
            rows: [diagnosticsLog({ createdAt: `${filters.to}T12:10:00.123456Z` })],
            total: 1,
          },
          snapshotAt,
        ),
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
  await expect(players.getByRole('row')).toHaveCount(51);
  await expect(players.getByRole('status')).toContainText(/Affichées : 50.*Total filtré : 1\s001/);

  await page.getByRole('tab', { name: /Surveillance/ }).click();
  await page.getByRole('tab', { name: /Journaux/ }).click();
  const logs = page.getByRole('tabpanel', { name: /Journaux/ });
  const diagnosticsCopy = getAdminDiagnosticsCopy('fr-FR');
  await expect(logs.getByRole('alert')).toContainText(diagnosticsCopy.failed);
  api.logsFail = false;
  await logs.getByRole('button', { name: diagnosticsCopy.retry, exact: true }).click();
  await expect(logs.getByRole('cell', { name: /RunAttemptService/ })).toBeVisible();
  await expect(logs.getByRole('table')).toContainText('sealRunAttempt');
  expect(api.reads.get('admin_diagnostics')).toBe(2);
  expect(api.reads.has('logs')).toBe(false);
  expect(api.reads.get('admin_search_players')).toBe(1);
  expect(api.reads.get('admin_stats')).toBe(1);

  await page.getByRole('tab', { name: /Vue globale/ }).click();
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
  await expect(
    players.getByRole('navigation', { name: 'Admin results pagination' }).getByRole('status'),
  ).toContainText(/Filtered total\s*:\s*0/);
  await expect(players.getByText(/No players/)).toBeVisible();
});
