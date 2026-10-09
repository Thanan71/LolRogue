import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { expect, type Page, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { getRotationForInstant } from '../src/domain/championEconomy';
import type { Database } from '../src/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;
const credentialsAvailable = Boolean(supabaseUrl && anonKey && serviceRoleKey && databaseUrl);

function isLoopback(value: string, protocols: string[]): boolean {
  try {
    const url = new URL(value);
    return (
      protocols.includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      (!protocols.includes('http:') || (!url.username && !url.password))
    );
  } catch {
    return false;
  }
}

function localSql(statement: string): string {
  const connection = new URL(databaseUrl!);
  return execFileSync(
    'psql',
    ['--no-psqlrc', '--no-password', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1'],
    {
      input: statement,
      env: {
        ...process.env,
        PGHOST: connection.hostname,
        PGPORT: connection.port,
        PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
        PGUSER: decodeURIComponent(connection.username),
        PGPASSWORD: decodeURIComponent(connection.password),
      },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15_000,
    },
  ).trim();
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function setLocalEconomyClock(instant: string): void {
  if (!Number.isFinite(Date.parse(instant))) throw new Error('Invalid fixture clock');
  // The private function has no client grant, configuration toggle or production override API.
  localSql(`CREATE OR REPLACE FUNCTION private.champion_economy_now()
    RETURNS TIMESTAMPTZ LANGUAGE sql VOLATILE SET search_path = ''
    AS $$ SELECT ${sqlLiteral(instant)}::timestamptz $$;`);
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Expected a connected server response object');
  }
  return value as Record<string, unknown>;
}

async function closeTutorial(page: Page, name: string): Promise<void> {
  const tutorial = page.getByRole('dialog', { name });
  if (
    await tutorial
      .waitFor({ state: 'visible', timeout: 1_500 })
      .then(() => true)
      .catch(() => false)
  ) {
    await tutorial.getByRole('button', { name: 'Fermer le tutoriel' }).click();
  }
}

async function showFullChampionCatalog(page: Page): Promise<void> {
  const accessFilter = page.getByLabel('Filtrer les champions par accès');
  await accessFilter.selectOption('all');
  await expect(accessFilter).toHaveValue('all');
  const economyDisclosure = page.locator('.starter-select__economy-disclosure');
  if ((await economyDisclosure.getAttribute('open')) === null) {
    await economyDisclosure.locator('summary').click();
  }
  await expect(economyDisclosure).toHaveAttribute('open');
}

async function reloadAndRevalidateSelector(page: Page): Promise<void> {
  await page.reload();
  // Existing authority recovery revalidates a saved terminal attempt after reload.
  await expect(page.getByRole('button', { name: 'Relancer la vérification' })).toBeVisible();
  await page.getByRole('button', { name: 'Relancer la vérification' }).click();
  await expect(page.getByRole('button', { name: 'Nouvelle partie', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Nouvelle partie', exact: true }).click();
  await expect(page).toHaveURL('/starter-select');
  await showFullChampionCatalog(page);
}

/** Real auth/RPC/Edge replay: no routed responses, injected stores or SQL verified-run fixtures. */
test('économie connectée : vague vérifiée, rotation expirée, achat permanent et reconnexion mobile', async ({
  page,
}, testInfo) => {
  if (process.env.E2E_REQUIRE_CONNECTED === '1') {
    expect(credentialsAvailable, 'Credentials Supabase locaux obligatoires.').toBe(true);
    expect(isLoopback(supabaseUrl!, ['http:', 'https:'])).toBe(true);
    expect(isLoopback(databaseUrl!, ['postgres:', 'postgresql:'])).toBe(true);
  }
  test.skip(!credentialsAvailable, 'Supabase local est requis pour ce parcours connecté.');
  test.skip(
    !isLoopback(supabaseUrl!, ['http:', 'https:']) ||
      !isLoopback(databaseUrl!, ['postgres:', 'postgresql:']),
    'Les fixtures et la simulation de rotation sont réservées à une base locale.',
  );
  expect(testInfo.config.workers, 'L’horloge de la base exige --workers=1.').toBe(1);
  test.setTimeout(240_000);
  page.setDefaultTimeout(20_000);

  // Privileged credentials stay in Node; purchases use the player's real browser session.
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient<Database>(supabaseUrl!, serviceRoleKey!, options);
  const actor = createClient<Database>(supabaseUrl!, anonKey!, options);
  const firstWeek = '2026-10-26T12:00:00.000Z';
  const secondWeek = '2026-11-02T12:00:00.000Z';
  const thirdWeek = '2026-11-09T12:00:00.000Z';
  const rotation = getRotationForInstant(firstWeek, 21);
  const nextRotation = getRotationForInstant(secondWeek, 21);
  const championId = rotation.championIds.find((id) => !nextRotation.championIds.includes(id))!;
  expect(championId).toBe('Darius');
  const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
  const username = `eco-e2e-${suffix}`;
  const email = `${username}@example.test`;
  const password = 'Champion-economy-E2E-2026!';
  let userId: string | undefined;
  const originalClock = localSql(
    "SELECT pg_get_functiondef('private.champion_economy_now()'::regprocedure);",
  );
  const originalConfig = localSql(
    'SELECT row_to_json(config)::text FROM public.champion_economy_config AS config WHERE singleton;',
  );
  expect(originalClock).toContain('champion_economy_now');
  expect(originalConfig).toBeTruthy();

  try {
    if (process.env.E2E_EXPECT_COMMIT_SHA) {
      const identity = await page.request.get('/deployment-identity.json');
      expect(identity.ok()).toBe(true);
      expect(await identity.json()).toEqual({ commit: process.env.E2E_EXPECT_COMMIT_SHA });
    }
    setLocalEconomyClock(firstWeek);
    const enabled = await service.rpc('set_champion_economy_enabled', { p_enabled: true });
    expect(enabled.error).toBeNull();
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Créer un compte' }).click();
    await page.getByLabel("Nom d'utilisateur").fill(username);
    await page.getByLabel("Nom d'affichage").fill('Champion Economy E2E');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    const signupResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/auth/v1/signup',
    );
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    const signup = await signupResponse;
    expect(signup.ok()).toBe(true);
    const signupData = record(await signup.json());
    const createdId = signupData.user ? record(signupData.user).id : signupData.id;
    if (typeof createdId !== 'string') throw new Error('Signup did not return a user UUID');
    userId = createdId;
    await expect(page).toHaveURL('/', { timeout: 30_000 });
    const signedIn = await actor.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    const profile = await actor.from('players').select('id').eq('user_id', userId).single();
    expect(profile.error).toBeNull();
    const playerId = profile.data!.id;
    const grants = await actor
      .from('account_champion_unlocks')
      .select('champion_id, source')
      .eq('user_id', userId);
    expect(grants.error).toBeNull();
    expect(grants.data).toEqual([]);
    const wallet = page.getByRole('region', { name: 'Éclats de champion' });
    await expect(wallet.getByText('0 Éclats', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Réglages', exact: true }).click();
    await page.getByLabel('Difficulté', { exact: true }).selectOption('easy');
    await page.getByRole('button', { name: 'Retour au menu', exact: true }).click();
    await page.getByRole('button', { name: 'Jouer', exact: true }).click();
    await expect(page).toHaveURL('/starter-select');
    await expect(page.getByLabel('Filtrer les champions par accès')).toHaveValue('available');
    await showFullChampionCatalog(page);
    await expect(page.locator('.champion-economy-card')).toHaveCount(10);
    await page.getByLabel('Filtrer les champions par accès').selectOption('available');
    await expect(page.locator('.champion-economy-card')).toHaveCount(8);
    await page.getByLabel('Filtrer les champions par accès').selectOption('all');
    const championCard = page.locator(`#starter-economy-${championId}`);
    await expect(championCard.getByText('Rotation hebdomadaire', { exact: true })).toBeVisible();
    await championCard.getByRole('button', { name: `Choisir ${championId}`, exact: true }).click();
    await page.getByRole('button', { name: 'Choisir Garen', exact: true }).click();
    const runeDisclosure = page.locator('.starter-select__rune-disclosure');
    await expect(runeDisclosure).not.toHaveAttribute('open');
    await runeDisclosure.locator('summary').click();
    await expect(runeDisclosure).toHaveAttribute('open');
    const runes = page.getByRole('checkbox');
    for (let index = 0; index < 3; index++) {
      if (!(await runes.nth(index).isChecked())) {
        await runes.nth(index).focus();
        await page.keyboard.press('Space');
      }
      await expect(runes.nth(index)).toBeChecked();
    }
    const startResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/rest/v1/rpc/start_run_attempt',
    );
    await page.getByRole('button', { name: 'Confirmer le choix', exact: true }).click();
    const start = await startResponse;
    expect(start.ok()).toBe(true);
    const started = record(await start.json());
    expect(started.economy_version).toBe(1);
    expect(started.rune_ids).not.toContain('e2e_assured_victory');
    expect(started.champion_access_snapshot).toMatchObject({
      enabled: true,
      economyVersion: 1,
      rotationId: rotation.id,
      rotationChampionIds: rotation.championIds,
    });
    if (typeof started.attempt_id !== 'string') throw new Error('Missing authority attempt UUID');
    const attemptId = started.attempt_id;
    await expect(page).toHaveURL('/run', { timeout: 30_000 });
    await closeTutorial(page, 'Comprendre la carte');
    await page.locator('.run-map-node--combat.run-map-node--selectable').first().click();
    await expect(page).toHaveURL('/combat');
    await closeTutorial(page, 'Ton premier combat');
    await page.getByRole('radio', { name: 'Vitesse 3×' }).click();
    // Wait for an actionable player turn before enabling normal autoplay. DOM-only
    // readiness works against the production bundle and avoids the starting-phase reset.
    const auto = page.locator('.combat-auto-toggle');
    if (await auto.isEnabled()) {
      await expect(page.locator('.combat-action-button').first()).toBeEnabled();
      if ((await auto.getAttribute('aria-pressed')) !== 'true') await auto.click();
    }
    await expect(auto).toHaveAttribute('aria-pressed', 'true');
    await Promise.race([
      page.getByText(/VICTOIRE !|DÉFAITE/, { exact: true }).waitFor({ timeout: 90_000 }),
      page.waitForURL(/\/(?:run|game-over)$/, { timeout: 90_000 }),
    ]);
    if (new URL(page.url()).pathname === '/combat') {
      await expect(page.getByText('VICTOIRE !', { exact: true })).toBeVisible();
      await page.getByRole('button', { name: /Continuer/ }).click();
    }
    await expect(page).toHaveURL('/run');
    await expect(page.getByRole('heading', { name: 'Carte de la partie', level: 1 })).toBeVisible();
    const rewards = page.getByRole('region', { name: /Récompenses du combat/ });
    if (await rewards.isVisible()) await rewards.getByRole('button', { name: 'Fermer' }).click();

    // An in-flight run retains the server snapshot even when the current rotation changes.
    setLocalEconomyClock(secondWeek);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Carte de la partie', level: 1 })).toBeVisible();
    const frozen = await actor
      .from('run_attempts')
      .select('champion_access_snapshot')
      .eq('id', attemptId)
      .single();
    expect(frozen.error).toBeNull();
    expect(frozen.data?.champion_access_snapshot).toEqual(started.champion_access_snapshot);
    await page.getByRole('button', { name: '← Menu', exact: true }).click();
    const verification = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/functions/v1/verify-run',
    );
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Abandonner et recommencer', exact: true }).click();
    const verified = await verification;
    expect(verified.ok()).toBe(true);
    const verifiedEnvelope = record(await verified.json());
    const verifiedResult = record(verifiedEnvelope.response ?? verifiedEnvelope);
    expect(verifiedResult).toMatchObject({
      shards_earned: 25,
      shards_balance: 25,
      shard_economy_version: 1,
      shard_rotation_first_win_champion_ids: [],
    });
    await expect(page).toHaveURL('/starter-select');
    await showFullChampionCatalog(page);
    await expect(wallet.getByText('25 Éclats', { exact: true })).toBeVisible();
    await expect(championCard.getByText('Verrouillé', { exact: true })).toBeVisible();
    await expect(
      championCard.getByRole('button', { name: `Choisir ${championId}` }),
    ).toBeDisabled();
    const mastery = await actor
      .from('champion_mastery')
      .select('total_candies, mastery_level')
      .eq('player_id', playerId)
      .eq('champion_id', championId)
      .single();
    expect(mastery.error).toBeNull();
    expect(mastery.data!.total_candies).toBeGreaterThan(0);
    const attempt = await actor
      .from('run_attempts')
      .select('status, result, shard_reward_context')
      .eq('id', attemptId)
      .single();
    expect(attempt.error).toBeNull();
    expect(attempt.data).toMatchObject({
      status: 'verified',
      shard_reward_context: { version: 1, waves_completed: 1, biomes_completed: 0 },
    });
    expect(record(attempt.data!.result).economy).toBeUndefined();
    const lockedStart = await actor.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: [championId, 'Garen'],
      p_rune_ids: [],
      p_difficulty: 'easy',
      p_mode: 'normal',
    });
    expect(lockedStart.data).toBeNull();
    expect(lockedStart.error?.message).toContain('champion_access_expired');

    const adjusted = await service.rpc('adjust_champion_shards', {
      p_user_id: userId,
      p_amount: 375,
      p_command_id: randomUUID(),
    });
    expect(adjusted.error).toBeNull();
    await reloadAndRevalidateSelector(page);
    await expect(wallet.getByText('400 Éclats', { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    const purchase = championCard.getByRole('button', {
      name: `Acheter ${championId} · 400 Éclats`,
      exact: true,
    });
    await purchase.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog');
    await expect(
      dialog.getByRole('heading', { name: `Débloquer ${championId} définitivement ?` }),
    ).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await dialog.getByRole('button', { name: 'Confirmer l’achat', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    const choose = championCard.getByRole('button', { name: `Choisir ${championId}`, exact: true });
    await expect(choose).toBeEnabled();
    await expect(choose).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(choose).toHaveAttribute('aria-pressed', 'true');
    await expect(wallet.getByText('0 Éclats', { exact: true })).toBeVisible();
    await expect(championCard.getByText('Possédé', { exact: true })).toBeVisible();
    await reloadAndRevalidateSelector(page);
    await expect(championCard.getByRole('button', { name: `Choisir ${championId}` })).toBeEnabled();

    await page.getByRole('button', { name: 'Retour', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.getByRole('button', { name: 'Déconnexion', exact: true }).click();
    await expect(page).toHaveURL('/auth');
    setLocalEconomyClock(thirdWeek);
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    await page.getByRole('button', { name: 'Connexion', exact: true }).click();
    await expect(page).toHaveURL('/');
    await page.getByRole('button', { name: 'Jouer', exact: true }).click();
    await expect(page).toHaveURL('/starter-select');
    await showFullChampionCatalog(page);
    await expect(championCard.getByText('Possédé', { exact: true })).toBeVisible();
    await expect(championCard.getByRole('button', { name: `Choisir ${championId}` })).toBeEnabled();
    const preservedMastery = await actor
      .from('champion_mastery')
      .select('total_candies, mastery_level')
      .eq('player_id', playerId)
      .eq('champion_id', championId)
      .single();
    expect(preservedMastery.error).toBeNull();
    expect(preservedMastery.data).toEqual(mastery.data);
    const ledger = await actor
      .from('shard_transactions')
      .select('amount, reason')
      .eq('user_id', userId);
    expect(ledger.error).toBeNull();
    expect(ledger.data).toEqual(
      expect.arrayContaining([
        { amount: 25, reason: 'run_reward' },
        { amount: 375, reason: 'admin_adjustment' },
        { amount: -400, reason: 'champion_purchase' },
      ]),
    );
    expect(ledger.data?.length).toBe(3);
    expect(ledger.data!.reduce((sum, entry) => sum + entry.amount, 0)).toBe(0);
    const unlock = await actor
      .from('account_champion_unlocks')
      .select('champion_id, source, price_paid')
      .eq('user_id', userId)
      .single();
    expect(unlock.error).toBeNull();
    expect(unlock.data).toEqual({ champion_id: championId, source: 'purchase', price_paid: 400 });
    if (process.env.E2E_EXPECT_COMMIT_SHA) {
      const cards = page.locator('.champion-economy-card');
      await expect(cards).toHaveCount(10);
      for (const card of await cards.all()) {
        const portrait = card.locator('.champion-card__splash');
        await portrait.scrollIntoViewIfNeeded();
        await expect
          .poll(() =>
            portrait.evaluate(
              (image) =>
                image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0,
            ),
          )
          .toBe(true);
        const imageBounds = await portrait.boundingBox();
        expect(imageBounds).not.toBeNull();
        for (const content of [
          '.champion-economy-card__status',
          '.champion-economy-card__actions',
        ]) {
          const bounds = await card.locator(content).boundingBox();
          expect(bounds).not.toBeNull();
          expect(bounds!.y).toBeGreaterThanOrEqual(imageBounds!.y + imageBounds!.height);
        }
      }
      await championCard.scrollIntoViewIfNeeded();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    }
    const evidencePath = testInfo.outputPath('verified-champion-economy.json');
    await mkdir(testInfo.outputDir, { recursive: true });
    await writeFile(
      evidencePath,
      JSON.stringify(
        {
          deploymentCommit: process.env.E2E_EXPECT_COMMIT_SHA ?? null,
          attemptId,
          engineVersion: started.engine_version,
          gameplayRulesetVersion: started.gameplay_ruleset_version,
          accessSnapshot: started.champion_access_snapshot,
          replayRewardFacts: attempt.data!.shard_reward_context,
          verifiedShards: verifiedResult.shards_earned,
          preservedCandies: preservedMastery.data,
          ledger: ledger.data,
          permanentUnlock: unlock.data,
        },
        null,
        2,
      ),
      'utf8',
    );
    await testInfo.attach('verified-champion-economy', {
      contentType: 'application/json',
      path: evidencePath,
    });
    await page.screenshot({
      path: testInfo.outputPath('champion-economy-connected-mobile.png'),
      fullPage: true,
    });
  } finally {
    // Restore the exact private clock and activation boundary, including on assertion failure.
    localSql(`${originalClock};
      UPDATE public.champion_economy_config SET
        enabled = (${sqlLiteral(originalConfig)}::jsonb ->> 'enabled')::boolean,
        activated_at = (${sqlLiteral(originalConfig)}::jsonb ->> 'activated_at')::timestamptz,
        updated_at = (${sqlLiteral(originalConfig)}::jsonb ->> 'updated_at')::timestamptz
      WHERE singleton;`);
    if (userId) {
      // Only after collecting replay/ledger evidence, release this disposable
      // fixture's run/result FK cycle so Auth erasure can cascade the account.
      localSql(`UPDATE public.run_attempts SET status = 'expired',
        verified_at = NULL, rejected_at = NULL, expired_at = clock_timestamp(), result_run_id = NULL
        WHERE user_id = ${sqlLiteral(userId)}::uuid;`);
      const deleted = await service.auth.admin.deleteUser(userId);
      expect(deleted.error).toBeNull();
    }
    await actor.auth.signOut();
  }
});
