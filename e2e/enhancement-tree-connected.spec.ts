import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';
import { cleanupExplorer, explorerSql } from '../tests/helpers/adminExplorerFixtures';

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
    throw new Error('Expected an enhancement response object.');
  return value as Record<string, unknown>;
}
function rpcPath(value: string, name: string) {
  return new URL(value).pathname === `/rest/v1/rpc/${name}`;
}
function frozenAttempt(attemptId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(attemptId))
    throw new Error('Expected a local fixture attempt UUID.');
  // service_role intentionally cannot SELECT this authority table over HTTP.
  return record(
    JSON.parse(
      explorerSql(`SELECT jsonb_build_object(
    'enhancement_snapshot',enhancement_snapshot,'mastery_snapshot',mastery_snapshot,
    'journal_hash',journal_hash) FROM public.run_attempts WHERE id='${attemptId}'::uuid;`),
    ),
  );
}
async function selectGaren(page: Page) {
  await page.locator('#champion-search').fill('Garen');
  await page.locator('#database-champion-Garen').click();
  await page.getByRole('tab', { name: /Améliorations/ }).click();
  await expect(page.locator('.enhancement-tree')).toBeVisible();
}

// Real Auth, UI, RPCs and ledgers. Privileged setup/assertions stay exclusively
// in Node. Only one already-committed reset response is deliberately discarded.
test('arbre connecté : achats confirmés, restauration après reload et reset rejoué après réponse perdue', async ({
  page,
}) => {
  const local =
    loopback(url, ['http:', 'https:']) && loopback(database, ['postgres:', 'postgresql:']);
  if (process.env.E2E_REQUIRE_CONNECTED === '1') {
    expect(available, 'Les quatre paramètres Supabase locaux sont obligatoires.').toBe(true);
    expect(local, 'Ce parcours exige une base jetable en loopback.').toBe(true);
  }
  test.skip(!available || !local, 'Supabase local est requis pour ce parcours connecté.');
  test.setTimeout(90_000);
  page.setDefaultTimeout(20_000);
  const options = { auth: { autoRefreshToken: false, persistSession: false } };
  const service = createClient<Database>(url!, serviceKey!, options);
  const actor = createClient<Database>(url!, anon!, options);
  const suffix = randomUUID().slice(0, 12);
  const email = `tree-${suffix}@example.test`;
  const password = 'Tree-local-E2E-42!';
  let userId: string | undefined;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: 'fr-FR' } }));
  });
  try {
    await page.goto('/auth');
    // A reused local Vite server must target the same disposable backend as Node.
    const browserUrl = await page.evaluate(async () => {
      const shared: unknown = (await import('/src/services/supabaseClient.ts')).supabase;
      return shared && typeof shared === 'object' && 'supabaseUrl' in shared
        ? shared.supabaseUrl
        : null;
    });
    expect(browserUrl).toBe(url);
    await page.getByRole('tab', { name: 'Créer un compte' }).click();
    await page.getByLabel("Nom d'utilisateur").fill(`tree_${suffix}`);
    await page.getByLabel("Nom d'affichage").fill('Arbre connecté local');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    const signupResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/auth/v1/signup',
    );
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    const signup = await signupResponse;
    expect(signup.ok()).toBe(true);
    const signupData = record(await signup.json());
    const id = record(signupData.user ?? signupData).id;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    userId = String(id);
    await expect(page).toHaveURL('/');
    const signedIn = await actor.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.user?.id).toBe(userId);
    const profile = await service.from('players').select('id').eq('user_id', userId).single();
    expect(profile.error).toBeNull();
    const playerId = profile.data!.id;
    // This explicit maintenance fixture is unattributed in the existing Candy
    // ledger. Mastery derives every cached field through the real SQL functions.
    explorerSql(`BEGIN;UPDATE public.players SET total_candies=1000 WHERE id='${playerId}'::uuid;
      INSERT INTO public.champion_mastery(player_id,champion_id,total_candies,mastery_level,current_level_candies,unlocked_ids)
      VALUES('${playerId}'::uuid,'Garen',700,public.mastery_level_from_candies(700),
        public.mastery_current_level_candies(700),public.mastery_unlock_ids(700))
      ON CONFLICT(player_id,champion_id) DO UPDATE SET total_candies=700,
        mastery_level=public.mastery_level_from_candies(700),current_level_candies=public.mastery_current_level_candies(700),
        unlocked_ids=public.mastery_unlock_ids(700);COMMIT;`);
    const masteryBefore = await service
      .from('champion_mastery')
      .select('*')
      .eq('player_id', playerId)
      .eq('champion_id', 'Garen')
      .single();
    const walletBefore = await service
      .from('account_wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    expect(masteryBefore.error).toBeNull();
    expect(masteryBefore.data?.mastery_level).toBe(4);
    expect(walletBefore.error).toBeNull();
    await page.reload();
    await page.getByRole('button', { name: 'Champions', exact: true }).click();
    await expect(page).toHaveURL('/database');
    await selectGaren(page);
    const tree = page.locator('.enhancement-tree');
    const balance = tree.locator('.enhancement-facts').first().locator('dd').first();
    await expect(balance).toHaveText(/1\s*000/);
    const purchases: Record<string, unknown>[] = [];
    for (const [nodeId, revision, cost, remaining] of [
      ['fighter_core_1', 0, 20, 980],
      ['fighter_core_2', 1, 30, 950],
    ] as const) {
      const card = page.locator(`#enhancement-${nodeId}`);
      await card.getByRole('button', { name: 'Débloquer', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Confirmer cet achat' });
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText(String(cost));
      // Opening confirmation must not create ownership or a debit.
      const beforeConfirm = await service
        .from('champion_enhancements')
        .select('unlocked_nodes')
        .eq('user_id', userId)
        .eq('champion_id', 'Garen')
        .maybeSingle();
      expect(beforeConfirm.error).toBeNull();
      expect(record(beforeConfirm.data?.unlocked_nodes ?? {})[nodeId]).toBeUndefined();
      const response = page.waitForResponse((entry) =>
        rpcPath(entry.url(), 'unlock_champion_enhancement_v2'),
      );
      await dialog.getByRole('button', { name: 'Dépenser les Candies', exact: true }).click();
      const purchased = await response;
      expect(purchased.status()).toBe(200);
      const payload = record(purchased.request().postDataJSON());
      expect(payload).toMatchObject({
        p_champion_id: 'Garen',
        p_node_id: nodeId,
        p_expected_rank: 0,
        p_expected_revision: revision,
        p_expected_catalog_version: 4,
      });
      expect(payload.p_command_id).toMatch(/^[0-9a-f-]{36}$/);
      purchases.push(payload);
      expect(record(await purchased.json())).toMatchObject({
        revision: revision + 1,
        current_rank: 1,
        catalog_version: 4,
        candy_cost: cost,
        remaining_candies: remaining,
        replayed: false,
      });
      await expect(dialog).not.toBeVisible();
      await expect(card.locator('.enhancement-rank')).toHaveText('Rang 1/1');
      await expect(balance).toHaveText(String(remaining));
    }
    await page.reload();
    await selectGaren(page);
    await expect(balance).toHaveText('950');
    for (const nodeId of ['fighter_core_1', 'fighter_core_2'])
      await expect(page.locator(`#enhancement-${nodeId} .enhancement-rank`)).toHaveText('Rang 1/1');

    // Open a real backend run before resetting the account tree. Its frozen
    // loadout must survive even though this browser has no local run fixture.
    const run = await actor.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    expect(run.error).toBeNull();
    const attemptId = String(record(run.data).attempt_id);
    const frozenBefore = frozenAttempt(attemptId);
    expect(record(frozenBefore.enhancement_snapshot).Garen).toEqual({
      fighter_core_1: 1,
      fighter_core_2: 1,
    });
    const resets: Record<string, unknown>[] = [];
    let lostReceipt: Record<string, unknown> | undefined;
    page.on('request', (request) => {
      if (request.method() === 'POST' && rpcPath(request.url(), 'reset_champion_enhancements'))
        resets.push(record(request.postDataJSON()));
    });
    await page.route(
      '**/rest/v1/rpc/reset_champion_enhancements',
      async (route) => {
        const committed = await route.fetch();
        expect(committed.status()).toBe(200);
        lostReceipt = record(await committed.json());
        await route.abort('failed');
      },
      { times: 1 },
    );
    const quoteResponse = page.waitForResponse((response) =>
      rpcPath(response.url(), 'get_enhancement_reset_preview'),
    );
    await tree.getByRole('button', { name: 'Réinitialiser cet arbre', exact: true }).click();
    const quote = await quoteResponse;
    expect(quote.status()).toBe(200);
    expect(record(await quote.json())).toMatchObject({
      revision: 2,
      actual_spend: 50,
      refund_amount: 50,
      fee_amount: 0,
      remaining_candies: 1000,
      policy_version: 1,
      eligible: true,
    });
    const resetDialog = page.getByRole('dialog', { name: 'Vérifier le remboursement' });
    await expect(resetDialog).toContainText('Candies remboursées');
    expect(resets).toEqual([]);
    const replayResponse = page.waitForResponse((response) =>
      rpcPath(response.url(), 'reset_champion_enhancements'),
    );
    await resetDialog
      .getByRole('button', { name: 'Réinitialiser et rembourser', exact: true })
      .click();
    const replay = await replayResponse;
    expect(replay.status()).toBe(200);
    expect(record(await replay.json())).toMatchObject({
      replayed: true,
      new_revision: 3,
      refund_amount: 50,
    });
    expect(lostReceipt).toMatchObject({ replayed: false, new_revision: 3, refund_amount: 50 });
    expect(resets).toHaveLength(2);
    expect(resets[0]).toMatchObject({
      p_champion_id: 'Garen',
      p_expected_revision: 2,
      p_expected_policy_version: 1,
    });
    expect(resets[1]).toEqual(resets[0]);
    await expect(resetDialog).not.toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Arbre réinitialisé.' })).toBeVisible();
    await expect(balance).toHaveText(/1\s*000/);
    const state = await service
      .from('champion_enhancements')
      .select('unlocked_nodes,total_candies_spent,revision,reset_count')
      .eq('user_id', userId)
      .eq('champion_id', 'Garen')
      .single();
    expect(state.error).toBeNull();
    expect(state.data).toEqual({
      unlocked_nodes: {},
      total_candies_spent: 0,
      revision: 3,
      reset_count: 1,
    });
    const profileAfter = await service
      .from('players')
      .select('total_candies')
      .eq('id', playerId)
      .single();
    expect(profileAfter.error).toBeNull();
    expect(profileAfter.data?.total_candies).toBe(1000);
    const ledger = await service
      .from('candy_transactions')
      .select('kind,amount,source_key')
      .eq('player_id', playerId);
    expect(ledger.error).toBeNull();
    expect(ledger.data?.filter((entry) => entry.kind === 'spent')).toEqual(
      expect.arrayContaining(
        purchases.map((entry, index) => ({
          kind: 'spent',
          amount: index === 0 ? -20 : -30,
          source_key: `purchase:${entry.p_command_id}`,
        })),
      ),
    );
    expect(ledger.data?.filter((entry) => entry.kind === 'spent')).toHaveLength(2);
    expect(ledger.data?.filter((entry) => entry.kind === 'refunded')).toEqual([
      { kind: 'refunded', amount: 50, source_key: `refund:${resets[0].p_command_id}` },
    ]);
    const commands = await service
      .from('progression_commands')
      .select('command_id')
      .eq('user_id', userId)
      .eq('command_type', 'enhancement_reset');
    expect(commands.error).toBeNull();
    expect(commands.data).toEqual([{ command_id: resets[0].p_command_id }]);
    const masteryAfter = await service
      .from('champion_mastery')
      .select('*')
      .eq('player_id', playerId)
      .eq('champion_id', 'Garen')
      .single();
    const walletAfter = await service
      .from('account_wallets')
      .select('*')
      .eq('user_id', userId)
      .single();
    const frozenAfter = frozenAttempt(attemptId);
    expect(masteryAfter.error).toBeNull();
    expect(walletAfter.error).toBeNull();
    expect(masteryAfter.data).toEqual(masteryBefore.data);
    expect(walletAfter.data).toEqual(walletBefore.data);
    expect(frozenAfter).toEqual(frozenBefore);
    expect(pageErrors).toEqual([]);
  } finally {
    await actor.auth.signOut();
    if (userId) await cleanupExplorer(service, [userId]);
  }
});
