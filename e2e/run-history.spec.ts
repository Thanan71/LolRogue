import { expect, test } from '@playwright/test';

// Browser → actual repository/client query → bounded API response → disclosure.
// Owner/admin authorization is tested against local Supabase in runHistory.database.test.ts.
test('history filters, cursor pages and lazy diagnostics remain usable on mobile', async ({
  page,
}, testInfo) => {
  const requests: URL[] = [];
  let detailRequests = 0;
  let teamRequests = 0;
  const id = (value: number) => `00000000-0000-0000-0000-${String(value).padStart(12, '0')}`;
  const summary = (value: number, won = true) => ({
    id: id(value),
    player_id: id(99),
    won,
    run_level: 6,
    waves_completed: 42,
    total_kills: 17,
    created_at: '2026-10-07T10:00:00.123456+00:00',
    completed_at: '2026-10-07T11:00:00Z',
    progression_source: 'verified',
    run_attempt_id: id(98),
    run_attempts: {
      difficulty: 'hard',
      mode: 'normal',
      engine_version: 'run-engine-v21',
      gameplay_ruleset_version: 21,
      ruleset_version: 3,
    },
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/rest/v1/runs*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    if (url.searchParams.get('select') === '*') {
      detailRequests += 1;
      await route.fulfill({
        json: {
          ...summary(21),
          rune_ids: [],
          augment_ids: [],
          gold_earned: 820,
          total_gold_spent: 600,
          items_purchased: 4,
          total_damage_dealt: 12500,
          total_healing_done: 900,
          total_shielding_done: 450,
        },
      });
    } else {
      expect(url.searchParams.get('select')).not.toContain('*');
      expect(url.searchParams.get('select')).not.toContain('run_team_members');
      const rows =
        url.searchParams.get('won') === 'eq.false'
          ? [summary(31, false)]
          : url.searchParams.has('or')
            ? [summary(1)]
            : Array.from({ length: 21 }, (_, index) => summary(21 - index));
      await route.fulfill({ json: rows });
    }
  });
  await page.route('**/rest/v1/run_team_members*', async (route) => {
    teamRequests += 1;
    await route.fulfill({ json: [{ champion_id: 'Garen', final_level: 6 }] });
  });
  await page.route('**/rest/v1/rpc/get_player_run_rejections', async (route) => {
    await route.fulfill({
      json: [
        {
          attempt_id: id(97),
          started_at: '2026-10-07T09:00:00Z',
          rejected_at: '2026-10-07T10:00:00Z',
          difficulty: 'hard',
          mode: 'normal',
          engine_version: 'run-engine-v21',
          gameplay_ruleset_version: 21,
          progression_ruleset_version: 3,
          rejection_code: 'pending_choice',
        },
      ],
    });
  });
  await page.goto('/auth');
  await page.getByRole('button', { name: 'Jouer en invité' }).click();
  await expect(page).toHaveURL('/');
  await page.evaluate(async () => {
    const { useAuthStore } = await import('/src/stores/authStore.ts');
    useAuthStore.setState({
      isGuest: false,
      isAuthenticated: true,
      authStatus: 'ready',
      player: {
        id: '00000000-0000-0000-0000-000000000099',
        username: 'history-test',
        display_name: 'History test',
        level: 1,
        total_candies: 0,
        total_runs_completed: 21,
        total_wins: 21,
      } as NonNullable<ReturnType<typeof useAuthStore.getState>['player']>,
    });
  });
  await page.getByRole('button', { name: 'Profil et historique' }).click();
  await expect(page.locator('.profile-run')).toHaveCount(20);
  expect(detailRequests).toBe(0);
  expect(teamRequests).toBe(0);
  const first = page.locator('.profile-run').first();
  await first.locator('summary').click();
  await expect(first.getByText('Garen niv. 6')).toBeVisible();
  expect(detailRequests).toBe(1);
  expect(teamRequests).toBe(1);
  await page.getByRole('button', { name: 'Charger les parties suivantes' }).click();
  await expect(page.locator('.profile-run')).toHaveCount(21);
  await expect(page.getByRole('button', { name: 'Charger les parties suivantes' })).toHaveCount(0);
  await page.getByRole('combobox', { name: 'Résultat', exact: true }).selectOption('defeat');
  await expect(page.locator('.profile-run')).toHaveCount(1);
  await page.getByRole('combobox', { name: 'Difficulté', exact: true }).selectOption('hard');
  await expect
    .poll(() =>
      requests.some(
        (url) =>
          url.searchParams.get('run_attempts.difficulty') === 'eq.hard' &&
          url.searchParams.get('select')?.includes('!inner'),
      ),
    )
    .toBe(true);
  await page.getByRole('button', { name: 'Afficher les tentatives rejetées' }).click();
  const rejected = page.getByLabel('Tentatives rejetées').locator('li');
  await expect(rejected).toHaveCount(1);
  await rejected.locator('summary').first().click();
  await rejected.getByText('Diagnostic technique').click();
  await expect(rejected.getByText('pending_choice')).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ),
  ).toBeLessThanOrEqual(1);
  const screenshot = testInfo.outputPath('run-history-mobile.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await testInfo.attach('run-history-mobile', { path: screenshot, contentType: 'image/png' });
});
