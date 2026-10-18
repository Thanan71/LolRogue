import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { validateModerationDecision } from '../src/pages/admin/moderation/moderationValidation';
import type { Database } from '../src/types/database';
import {
  cleanupExplorer,
  explorerAccount,
  explorerSql,
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
      ['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname)
    );
  } catch {
    return false;
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Expected a moderation object');
  return value as Record<string, unknown>;
}

// Real browser signup, reporting and moderation RPCs against disposable local
// PostgreSQL. Completed Daily rows are explicit Node fixtures, not replay proof.
test('modération connectée : signalement, décision auditée, réessai et révocation sur le même JWT', async ({
  page,
}) => {
  const local =
    loopback(url, ['http:', 'https:']) && loopback(database, ['postgres:', 'postgresql:']);
  if (process.env.E2E_REQUIRE_CONNECTED === '1') {
    expect(available, 'Four local Supabase parameters are required').toBe(true);
    expect(local, 'Moderation fixtures require disposable loopback PostgreSQL').toBe(true);
  }
  test.skip(!available || !local, 'Local Supabase is required');
  test.setTimeout(90_000);
  page.setDefaultTimeout(20_000);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const service = createClient<Database>(url!, serviceKey!, options);
  const actor = createClient<Database>(url!, anon!, options);
  const users: string[] = [];
  const suffix = randomUUID().slice(0, 12);
  const email = `moderation-${suffix}@example.test`;
  const password = 'Moderation-local-E2E-42!';
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: 'fr-FR' } }));
  });
  try {
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Créer un compte' }).click();
    await page.getByLabel("Nom d'utilisateur").fill(`moderation_${suffix}`);
    await page.getByLabel("Nom d'affichage").fill('Modération locale');
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
    const signedIn = await actor.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.user?.id).toBe(userId);
    explorerSql(`UPDATE public.players SET is_admin=TRUE WHERE user_id='${userId}'::uuid;`);
    const reporter = await explorerAccount(service, users);
    const dailyRunId = randomUUID();
    const otherDailyRunId = randomUUID();
    const dailyDate = '2020-02-29';
    const daily = await service.from('daily_runs').insert([
      {
        id: dailyRunId,
        player_id: reporter.playerId,
        daily_date: dailyDate,
        daily_seed: 20200229,
        score: 12345,
        completed_at: new Date().toISOString(),
      },
      {
        id: otherDailyRunId,
        player_id: reporter.playerId,
        daily_date: '2020-03-01',
        daily_seed: 20200301,
        score: 23456,
        completed_at: new Date().toISOString(),
      },
    ]);
    expect(daily.error).toBeNull();
    for (const id of [dailyRunId, otherDailyRunId]) {
      const report = await reporter.client.rpc('report_daily_score', {
        p_daily_run_id: id,
        p_reason: 'Une incohérence précise du score doit être examinée.',
      });
      expect(report.error).toBeNull();
    }
    const before = await service
      .from('daily_runs')
      .select('score,completed_at,daily_date')
      .eq('id', dailyRunId)
      .single();
    expect(before.error).toBeNull();
    await page.reload();
    await page.getByRole('button', { name: "Panneau d'administration", exact: true }).click();
    const queueResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/rest/v1/rpc/admin_moderation_queue',
    );
    await page.getByRole('tab', { name: /Modération/ }).click();
    const queue = await queueResponse;
    expect(queue.status()).toBe(200);
    const panel = page.locator('#admin-panel-moderation');
    await panel.getByLabel('Identifiant exact du score quotidien').fill(dailyRunId);
    const filteredResponse = page.waitForResponse((response) => {
      if (new URL(response.url()).pathname !== '/rest/v1/rpc/admin_moderation_queue') return false;
      return record(response.request().postDataJSON()).p_daily_run_id === dailyRunId;
    });
    await panel.getByRole('button', { name: 'Appliquer les filtres', exact: true }).click();
    const filtered = await filteredResponse;
    expect(filtered.status()).toBe(200);
    const projected = record(await filtered.json());
    expect(projected.total).toBe(1);
    const target = record((projected.rows as unknown[])[0]);
    expect(target.dailyRunId).toBe(dailyRunId);
    expect(record(target.target).dailyDate).toBe(dailyDate);
    await panel.getByRole('button', { name: /Examiner le dossier/ }).click();
    await panel
      .getByRole('combobox', { name: 'Action', exact: true })
      .selectOption('invalidate_score');
    await panel
      .getByLabel('Justification de la décision')
      .fill('La revue locale confirme une anomalie du score de ce défi.');
    await panel.getByRole('button', { name: 'Préparer la décision', exact: true }).click();
    await expect(panel).toContainText(dailyDate);
    await panel.getByLabel('Recopiez l’identifiant exact du score pour confirmer').fill(dailyRunId);
    const decisionResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/rest/v1/rpc/admin_moderation_decide',
    );
    await panel
      .getByRole('button', { name: 'Confirmer et enregistrer la décision', exact: true })
      .click();
    const decision = await decisionResponse;
    expect(decision.status()).toBe(200);
    const receipt = record(await decision.json());
    expect(receipt).toMatchObject({ outcome: 'applied', code: 'score_invalidated', dailyRunId });
    await expect(
      panel.getByRole('region', { name: 'Reçu de la décision', exact: true }),
    ).toContainText(String(receipt.auditId));
    const request = validateModerationDecision(decision.request().postDataJSON());
    const replay = await actor.rpc('admin_moderation_decide', request);
    expect(replay.error).toBeNull();
    expect(replay.data).toMatchObject({ outcome: 'replayed', auditId: receipt.auditId });
    const after = await service
      .from('daily_runs')
      .select('score,completed_at,daily_date,invalidated_at')
      .eq('id', dailyRunId)
      .single();
    expect(after.error).toBeNull();
    expect(after.data).toMatchObject(before.data!);
    expect(after.data?.invalidated_at).toBeTruthy();
    expect(
      explorerSql(
        `SELECT count(*) FROM private.moderation_events WHERE request_id='${String(receipt.requestId)}'::uuid AND outcome='applied';`,
      ),
    ).toBe('1');

    // The browser keeps its existing JWT. PostgreSQL role revocation must deny
    // a later mutation and the production UI must purge every cached surface.
    await panel.getByLabel('Identifiant exact du score quotidien').fill(otherDailyRunId);
    await panel.getByRole('button', { name: 'Appliquer les filtres', exact: true }).click();
    await panel.getByRole('button', { name: /Examiner le dossier/ }).click();
    await panel
      .getByLabel('Justification de la décision')
      .fill('Une seconde décision sera refusée après retrait des droits.');
    await panel.getByRole('button', { name: 'Préparer la décision', exact: true }).click();
    await panel
      .getByLabel('Recopiez l’identifiant exact du score pour confirmer')
      .fill(otherDailyRunId);
    explorerSql(`UPDATE public.players SET is_admin=FALSE WHERE user_id='${userId}'::uuid;`);
    const deniedResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/rest/v1/rpc/admin_moderation_decide',
    );
    await panel
      .getByRole('button', { name: 'Confirmer et enregistrer la décision', exact: true })
      .click();
    const denied = await deniedResponse;
    expect(denied.status()).toBe(200);
    expect(record(await denied.json())).toMatchObject({
      outcome: 'rejected',
      code: 'admin_access_denied',
    });
    expect(
      decision.request().headers().authorization === denied.request().headers().authorization,
    ).toBe(true);
    await expect(panel.getByRole('alert')).toContainText('Accès refusé.');
    await expect(panel.getByRole('table')).toHaveCount(0);
    await expect(
      panel.getByRole('region', { name: 'Reçu de la décision', exact: true }),
    ).toHaveCount(0);
    const other = await service
      .from('daily_runs')
      .select('invalidated_at')
      .eq('id', otherDailyRunId)
      .single();
    expect(other.data?.invalidated_at).toBeNull();
    expect(errors).toEqual([]);
    await reporter.client.auth.signOut();
  } finally {
    await actor.auth.signOut();
    await cleanupExplorer(service, users);
  }
});
