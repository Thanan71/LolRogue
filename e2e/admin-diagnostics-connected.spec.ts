import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';
import { cleanupExplorer, explorerSql } from '../tests/helpers/adminExplorerFixtures';
import { seedDiagnosticLogs } from '../tests/helpers/adminDiagnosticsFixtures';

const url = process.env.VITE_PUBLIC_SUPABASE_URL;
const anon = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const database = process.env.SUPABASE_DB_URL;
function loopback(value: string | undefined) {
  if (!value) return false;
  try {
    return ['127.0.0.1', 'localhost', '[::1]'].includes(new URL(value).hostname);
  } catch {
    return false;
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected diagnostic object');
  return value as Record<string, unknown>;
}

// Real browser signup and production diagnostic RPC/parser against disposable local
// PostgreSQL. The log is an explicit Node fixture; the attempt starts through its real RPC.
test('diagnostics connectés : Auth, projection minimale, corrélation et révocation sur le même JWT', async ({
  page,
}) => {
  const available = Boolean(url && anon && serviceKey && database);
  const local = loopback(url) && loopback(database);
  if (process.env.E2E_REQUIRE_CONNECTED === '1') {
    expect(available, 'Four local Supabase parameters are required').toBe(true);
    expect(local, 'Diagnostic fixtures require disposable loopback PostgreSQL').toBe(true);
  }
  test.skip(!available || !local, 'Local Supabase is required');
  test.setTimeout(90_000);
  page.setDefaultTimeout(20_000);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const service = createClient<Database>(url!, serviceKey!, options);
  const actor = createClient<Database>(url!, anon!, options);
  const users: string[] = [];
  const suffix = randomUUID().slice(0, 12);
  const email = `diagnostics-${suffix}@example.test`;
  const password = 'Diagnostics-local-E2E-42!';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: 'fr-FR' } }));
  });
  try {
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Créer un compte' }).click();
    await page.getByLabel("Nom d'utilisateur").fill(`diagnostic_${suffix}`);
    await page.getByLabel("Nom d'affichage").fill('Diagnostic local');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    const signupResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/auth/v1/signup',
    );
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    const signup = await signupResponse;
    expect(signup.ok()).toBe(true);
    const signedUp = record(await signup.json());
    const userId = String(record(signedUp.user ?? signedUp).id);
    expect(userId).toMatch(/^[0-9a-f-]{36}$/);
    users.push(userId);
    await expect(page).toHaveURL('/');
    const login = await actor.auth.signInWithPassword({ email, password });
    expect(login.error).toBeNull();
    const profile = await service.from('players').select('id').eq('user_id', userId).single();
    expect(profile.error).toBeNull();
    const playerId = profile.data!.id;
    explorerSql(`UPDATE public.players SET is_admin=TRUE WHERE id='${playerId}'::uuid;`);
    const started = await actor.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    expect(started.error).toBeNull();
    const attemptId = String(record(started.data).attempt_id);
    expect(attemptId).toMatch(/^[0-9a-f-]{36}$/);
    seedDiagnosticLogs(
      { client: actor, userId, playerId },
      { date: new Date().toISOString(), attemptId },
    );
    await page.reload();
    await page.getByRole('button', { name: "Panneau d'administration", exact: true }).click();
    await page.getByRole('tab', { name: /Journaux/ }).click();
    const panel = page.locator('#admin-panel-logs');
    await expect(panel.getByRole('table').first()).toBeVisible();
    await expect(panel.getByText('Désactivée', { exact: true })).toBeVisible();
    await panel.getByLabel('Identifiant exact de tentative').fill(attemptId);
    const filteredResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/rest/v1/rpc/admin_diagnostics' &&
        record(response.request().postDataJSON()).p_section === 'logs' &&
        record(record(response.request().postDataJSON()).p_filters).attemptId === attemptId,
    );
    await panel.getByRole('button', { name: 'Appliquer les filtres' }).click();
    const filtered = await filteredResponse;
    expect(filtered.status()).toBe(200);
    const projected = record(await filtered.json());
    expect(record(projected.data).total).toBe(1);
    const serialized = JSON.stringify(projected);
    expect(serialized).toContain('[REDACTED]');
    for (const secret of [
      'secret-access-marker',
      'secret-stack-marker',
      'sensitive-command-marker',
      '192.0.2.99',
      'user_id',
      'player_id',
    ])
      expect(serialized).not.toContain(secret);
    await expect(panel.getByText('[REDACTED]')).toBeVisible();
    await panel.getByRole('button', { name: 'Diagnostiquer cette tentative' }).click();
    await expect(
      panel.getByRole('heading', { name: 'Corrélation d’une tentative', level: 2 }),
    ).toBeFocused();
    await expect(panel.getByRole('table')).toHaveCount(2);
    const authorityRead = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/rest/v1/rpc/admin_diagnostics' &&
        record(response.request().postDataJSON()).p_section === 'authority',
    );
    await page.getByRole('tab', { name: /Autorité/ }).click();
    expect((await authorityRead).status()).toBe(200);
    const authority = page.locator('#admin-panel-authority');
    await expect(
      authority
        .getByRole('region', { name: 'Tentatives et rejets authority', exact: true })
        .getByRole('table'),
    ).toContainText(attemptId);
    await expect(authority.getByText('Non instrumenté')).toHaveCount(3);
    explorerSql(`UPDATE public.players SET is_admin=FALSE WHERE id='${playerId}'::uuid;`);
    const deniedResponse = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/rest/v1/rpc/admin_diagnostics' &&
        record(response.request().postDataJSON()).p_section === 'authority',
    );
    await authority
      .getByRole('region', { name: 'Tentatives et rejets authority', exact: true })
      .getByRole('button', { name: 'Actualiser', exact: true })
      .click();
    expect((await deniedResponse).status()).toBe(403);
    await expect(authority.getByRole('alert')).toContainText('Accès refusé');
    await expect(authority.getByRole('table')).toHaveCount(0);
    await expect(authority.getByText(attemptId, { exact: true })).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    if (users.length)
      explorerSql(
        `DELETE FROM public.logs WHERE user_id=ANY(ARRAY[${users.map((id) => `'${id}'`).join(',')}]::uuid[]);`,
      );
    await cleanupExplorer(service, users);
    await actor.auth.signOut({ scope: 'local' });
  }
});
