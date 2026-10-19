import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';
import {
  cleanupExplorer,
  explorerSql,
  seedExplorerAttempt,
} from '../tests/helpers/adminExplorerFixtures';

const url = process.env.VITE_PUBLIC_SUPABASE_URL;
const anon = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const database = process.env.SUPABASE_DB_URL;
const available = Boolean(url && anon && serviceKey && database);

function loopback(value: string | undefined, protocols: string[]) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return (
      protocols.includes(parsed.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a balance response object.');
  return value as Record<string, unknown>;
}

// Real Auth and RPCs, with one persisted verified-result fixture installed only
// by privileged Node SQL on disposable loopback PostgreSQL. This tests the
// analytics boundary; authority gameplay verification has its own replay tests.
test('équilibrage connecté : résultat persistant, trois RPC réelles et révocation du même JWT', async ({
  page,
}) => {
  const local =
    loopback(url, ['http:', 'https:']) && loopback(database, ['postgres:', 'postgresql:']);
  if (process.env.E2E_REQUIRE_CONNECTED === '1') {
    expect(available, 'Les quatre paramètres Supabase locaux sont obligatoires.').toBe(true);
    expect(local, 'Les fixtures admin exigent une base jetable en loopback.').toBe(true);
  }
  test.skip(!available || !local, 'Supabase local est requis pour ce parcours connecté.');
  test.setTimeout(90_000);
  page.setDefaultTimeout(20_000);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const service = createClient<Database>(url!, serviceKey!, options);
  const actor = createClient<Database>(url!, anon!, options);
  const suffix = randomUUID().slice(0, 12);
  const email = `balance-${suffix}@example.test`;
  const password = 'Balance-local-E2E-42!';
  let userId: string | undefined;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: 'fr-FR' } }));
  });
  try {
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Créer un compte' }).click();
    await page.getByLabel("Nom d'utilisateur").fill(`balance_${suffix}`);
    await page.getByLabel("Nom d'affichage").fill('Balance local');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    const signupResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/auth/v1/signup',
    );
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    const signup = await signupResponse;
    expect(signup.ok()).toBe(true);
    const signupData = record(await signup.json());
    userId = String(record(signupData.user ?? signupData).id);
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page).toHaveURL('/');
    const signedIn = await actor.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.user?.id).toBe(userId);
    const profile = await service.from('players').select('id').eq('user_id', userId).single();
    expect(profile.error).toBeNull();
    explorerSql(`UPDATE public.players SET is_admin=TRUE WHERE user_id='${userId}'::uuid;`);
    const fixture = await seedExplorerAttempt({
      client: actor,
      userId,
      playerId: profile.data!.id,
    });
    explorerSql(`UPDATE public.runs SET progression_payload_hash=(
      SELECT result_hash FROM public.run_attempts WHERE id='${fixture.attemptId}'::uuid
      ) WHERE id='${fixture.runId}'::uuid;`);
    const identity = record(
      JSON.parse(
        explorerSql(`SELECT jsonb_build_object('day',
        (verified_at AT TIME ZONE 'UTC')::date,'engine',engine_version)::text
        FROM public.run_attempts WHERE id='${fixture.attemptId}'::uuid;`),
      ),
    );
    const day = String(identity.day);
    expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await page.reload();
    await page.getByRole('button', { name: "Panneau d'administration", exact: true }).click();
    const configuration = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/rest/v1/rpc/admin_balance_config',
    );
    await page.getByRole('tab', { name: /Équilibrage/ }).click();
    const configResponse = await configuration;
    expect(configResponse.status()).toBe(200);
    expect(record(await configResponse.json()).readOnly).toBe(true);
    const panel = page.locator('#admin-panel-balance');
    const form = panel.getByRole('form', { name: 'Équilibrage : période et population' });
    await form.getByLabel('Début inclus (UTC)', { exact: true }).fill(day);
    await form.getByLabel('Fin incluse (UTC)', { exact: true }).fill(day);
    await form.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('normal');
    await form.getByRole('combobox', { name: 'Difficulté', exact: true }).selectOption('normal');
    const resources = ['champions', 'builds'] as const;
    const responses = resources.map((resource) =>
      page.waitForResponse((response) => {
        if (new URL(response.url()).pathname !== `/rest/v1/rpc/admin_balance_${resource}`)
          return false;
        const filters = record(record(response.request().postDataJSON()).p_filters);
        return filters.from === day && filters.to === day && filters.difficulty === 'normal';
      }),
    );
    await form.getByRole('button', { name: 'Appliquer les filtres', exact: true }).click();
    const reads = await Promise.all(responses);
    for (const response of reads) expect(response.status()).toBe(200);
    const champions = panel.locator('#admin-balance-champions');
    await expect(champions).toHaveAttribute('aria-busy', 'false');
    const championData = record(await reads[0].json());
    expect((record(championData.population).verifiedRuns as number) > 0).toBe(true);
    expect((championData.rows as unknown[]).map(record)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ championId: 'Garen', runs: expect.any(Number) }),
      ]),
    );
    await expect(champions.locator('#admin-balance-final-champions table')).toBeVisible();
    await expect(champions.locator('#admin-balance-picks table')).toBeVisible();
    await expect(champions.getByRole('row').filter({ hasText: 'Garen' }).first()).toBeVisible();
    await expect(panel.locator('#admin-balance-builds').getByRole('table')).toBeVisible();
    await expect(panel.locator('#admin-balance-config table')).toBeVisible();
    await expect(panel).toContainText('TREE-10');
    await expect(panel.getByRole('alert')).toHaveCount(0);

    // The same browser session must lose every cached balance resource on42501.
    explorerSql(`UPDATE public.players SET is_admin=FALSE WHERE user_id='${userId}'::uuid;`);
    const refused = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/rest/v1/rpc/admin_balance_champions',
    );
    await champions.getByRole('button', { name: 'Actualiser', exact: true }).click();
    const denied = await refused;
    expect(denied.status()).toBe(403);
    expect(record(await denied.json()).code).toBe('42501');
    const token = reads[0].request().headers().authorization;
    expect(Boolean(token) && token === denied.request().headers().authorization).toBe(true);
    for (const resource of [...resources, 'config', 'field'])
      await expect(panel.locator(`#admin-balance-${resource}`).getByRole('table')).toHaveCount(0);
    await expect(panel.getByRole('alert').first()).toBeVisible();
    expect(pageErrors).toEqual([]);
  } finally {
    await actor.auth.signOut();
    if (userId) await cleanupExplorer(service, [userId]);
  }
});
