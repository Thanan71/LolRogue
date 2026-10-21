import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  adminExplorerCredentials,
  cleanupExplorer,
  explorerClient,
  explorerSql,
  hasAdminExplorerCredentials,
  seedExplorerRuns,
} from '../tests/helpers/adminExplorerFixtures';

function loopback(value: string | undefined) {
  if (!value) return false;
  return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected an Auth response object');
  return value as Record<string, unknown>;
}

// Real Auth and production RPCs; a single aborted browser request exercises retry.
// Privileged credentials and deterministic fixtures remain exclusively in Node.
test('connected navigation: role guards, deep-link reload, server pages, history and interrupted retry', async ({
  page,
}) => {
  const required = process.env.E2E_REQUIRE_CONNECTED === '1';
  const local =
    loopback(adminExplorerCredentials.url) && loopback(adminExplorerCredentials.database);
  if (required) {
    expect(hasAdminExplorerCredentials, 'Four local Supabase parameters are required').toBe(true);
    expect(local, 'Navigation fixtures require disposable loopback PostgreSQL').toBe(true);
  }
  test.skip(
    !required || !hasAdminExplorerCredentials || !local,
    'Dedicated local connected gate is required',
  );
  test.setTimeout(150_000);
  page.setDefaultTimeout(20_000);
  const service = explorerClient('service');
  const actor = explorerClient();
  const users: string[] = [];
  const suffix = randomUUID().slice(0, 12);
  const email = `admin-navigation-${suffix}@example.test`;
  const password = 'Navigation-local-E2E-42!';
  const errors: string[] = [];
  const adminRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/rest/v1/rpc/admin_')) adminRequests.push(path);
  });
  await page.addInitScript(() => {
    localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: 'fr-FR' } }));
  });
  try {
    await page.goto('/admin?group=players&view=list');
    await expect(page).toHaveURL('/auth');
    expect(adminRequests).toEqual([]);
    const anonymous = await actor.rpc('admin_search_players', {
      p_filters: {},
      p_page_size: 50,
    });
    expect(anonymous.error).not.toBeNull();

    await page.getByRole('tab', { name: 'Créer un compte', exact: true }).click();
    await page.getByLabel("Nom d'utilisateur").fill(`navigation_${suffix}`);
    await page.getByLabel("Nom d'affichage").fill(`Navigation ${suffix}`);
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    const signingUp = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/auth/v1/signup',
    );
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    const signedUp = await signingUp;
    expect(signedUp.ok()).toBe(true);
    const body = record(await signedUp.json());
    const userId = String(record(body.user ?? body).id);
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
    users.push(userId);
    await expect(page).toHaveURL('/');
    const login = await actor.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    const profile = await service.from('players').select('id').eq('user_id', userId).single();
    expect(profile.error).toBeNull();
    const playerId = profile.data!.id as string;
    const denied = await actor.rpc('admin_search_players', {
      p_filters: {},
      p_page_size: 50,
    });
    expect(denied.error).not.toBeNull();
    await page.goto(`/admin?group=players&view=list&player=${playerId}`);
    await expect(page).toHaveURL('/');
    expect(adminRequests).toEqual([]);

    explorerSql(`UPDATE public.players SET is_admin=TRUE WHERE id='${playerId}'::uuid;`);
    seedExplorerRuns(
      { client: actor, userId, playerId },
      101,
      `navigation_${suffix.replaceAll('-', '')}`,
    );
    await page.setViewportSize({ width: 320, height: 780 });
    await page.goto(`/admin?group=players&view=list&player=${playerId}`);
    const players = page.locator('#admin-panel-players');
    const profileHeading = players.getByRole('heading', {
      name: `Fiche joueur — Navigation ${suffix}`,
      exact: true,
    });
    await expect(profileHeading).toBeVisible();
    await page.reload();
    await expect(profileHeading).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`player=${playerId}`));
    await players
      .getByRole('button', {
        name: 'Voir les runs sauvegardées de ce joueur',
        exact: true,
      })
      .click();
    const runs = page.locator('#admin-panel-runs');
    const pagination = runs.getByRole('navigation');
    await expect(pagination.getByRole('status')).toContainText('101');
    await expect(runs.getByRole('row')).toHaveCount(51);
    await pagination.getByRole('button', { name: 'Page suivante', exact: true }).click();
    await expect(runs.getByRole('row')).toHaveCount(51);
    await pagination.getByRole('button', { name: 'Page suivante', exact: true }).click();
    await expect(runs.getByRole('row')).toHaveCount(2);
    await expect(
      pagination.getByRole('button', { name: 'Page suivante', exact: true }),
    ).toBeDisabled();
    await pagination.getByRole('button', { name: 'Page précédente', exact: true }).click();
    await expect(runs.getByRole('row')).toHaveCount(51);
    const open = runs.locator('[data-admin-run-open]').first();
    const runId = await open.getAttribute('data-admin-run-open');
    await open.click();
    await expect(page).toHaveURL(new RegExp(`run=${runId}`));
    const detail = runs.locator('.admin-run-detail');
    await expect(detail).toContainText(`Navigation ${suffix}`);
    await page.reload();
    await expect(detail).toContainText(`Navigation ${suffix}`);
    await expect(page).toHaveURL(new RegExp(`run=${runId}`));
    await page.goBack();
    await expect(runs.getByRole('table')).toBeVisible();
    await page.goForward();
    await expect(detail).toBeVisible();
    await detail.getByRole('button', { name: 'Retour aux résultats', exact: true }).click();
    await expect(runs.getByRole('table')).toBeVisible();
    await page.route(
      '**/rest/v1/rpc/admin_search_runs',
      (route) => route.abort('internetdisconnected'),
      { times: 1 },
    );
    await runs.getByRole('button', { name: 'Actualiser les résultats', exact: true }).click();
    await expect(runs.getByRole('alert')).toContainText('Impossible de charger ces résultats');
    await runs.getByRole('button', { name: 'Réessayer', exact: true }).click();
    await expect(runs.getByRole('alert')).toHaveCount(0);
    await expect(runs.getByRole('table')).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);

    explorerSql(`UPDATE public.players SET is_admin=FALSE WHERE id='${playerId}'::uuid;`);
    await runs.getByRole('button', { name: 'Actualiser les résultats', exact: true }).click();
    await expect(runs.getByRole('table')).toHaveCount(0);
    await page.reload();
    await expect(page).toHaveURL('/');
    expect(errors).toEqual([]);
  } finally {
    await actor.auth.signOut({ scope: 'local' });
    await cleanupExplorer(service, users);
  }
});
