import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;
const credentialsAvailable = Boolean(supabaseUrl && anonKey && serviceRoleKey && databaseUrl);

function isLoopbackEndpoint(value: string, protocols = ['http:', 'https:']): boolean {
  try {
    const url = new URL(value);
    return (
      protocols.includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      (protocols.includes('postgres:') || (!url.username && !url.password))
    );
  } catch {
    return false;
  }
}

/** No routed responses or injected auth stores: the UI talks to disposable local Supabase. */
test('Sprint G connecté : historique paginé et notes lues synchronisées entre appareils', async ({
  page,
  browser,
  baseURL,
}) => {
  test.skip(!credentialsAvailable, 'Supabase local et ses credentials sont requis.');
  test.skip(
    !isLoopbackEndpoint(supabaseUrl!) ||
      !isLoopbackEndpoint(databaseUrl!, ['postgres:', 'postgresql:']),
    'Ce parcours crée des fixtures uniquement en local.',
  );
  test.setTimeout(120_000);
  page.setDefaultTimeout(15_000);

  function localSql(statement: string): void {
    const connection = new URL(databaseUrl!);
    execFileSync('psql', ['--no-psqlrc', '--no-password', '--set', 'ON_ERROR_STOP=1'], {
      input: statement,
      env: {
        ...process.env,
        PGHOST: connection.hostname,
        PGPORT: connection.port,
        PGDATABASE: decodeURIComponent(connection.pathname.slice(1)),
        PGUSER: decodeURIComponent(connection.username),
        PGPASSWORD: decodeURIComponent(connection.password),
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 15_000,
    });
  }
  function uuidLiteral(value: string): string {
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/iu.test(value)) {
      throw new Error('Invalid local fixture UUID');
    }
    return `'${value}'::uuid`;
  }

  // The service role stays in this Node fixture, never in page scripts or browser storage.
  const options = { auth: { persistSession: false, autoRefreshToken: false } };
  const service = createClient<Database>(supabaseUrl!, serviceRoleKey!, options);
  const actor = createClient<Database>(supabaseUrl!, anonKey!, options);
  const suffix = randomUUID().replace(/-/g, '').slice(0, 16);
  const username = `sprintg-${suffix}`;
  const email = `${username}@example.test`;
  const password = 'Sprint-G-local-2026!';
  let userId: string | undefined;
  let playerId: string | undefined;
  let teamReads = 0;
  let fullRunReads = 0;
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname === '/rest/v1/run_team_members') teamReads++;
    if (url.pathname === '/rest/v1/runs' && url.searchParams.get('select') === '*') {
      fullRunReads++;
    }
  });
  const secondDevice = await browser.newContext({ baseURL });
  secondDevice.setDefaultTimeout(15_000);

  try {
    await page.goto('/auth');
    await page.getByRole('tab', { name: 'Créer un compte' }).click();
    await page.getByLabel("Nom d'utilisateur").fill(username);
    await page.getByLabel("Nom d'affichage").fill('Sprint G local');
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe').fill(password);
    const signupResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/auth/v1/signup',
    );
    await page.getByRole('button', { name: 'Créer un compte', exact: true }).click();
    const signup = await signupResponse;
    expect(signup.ok()).toBe(true);
    const signupData = (await signup.json()) as { user?: { id?: string }; id?: string };
    userId = signupData.user?.id ?? signupData.id;
    expect(userId).toBeTruthy();
    await expect(page).toHaveURL('/', { timeout: 30_000 });

    const profile = await service.from('players').select('id').eq('user_id', userId!).single();
    expect(profile.error).toBeNull();
    playerId = profile.data!.id;
    const signedIn = await actor.auth.signInWithPassword({ email, password });
    expect(signedIn.error).toBeNull();
    expect(signedIn.data.user?.id).toBe(userId);

    // Stored history fixtures exercise retrieval and cohort labels, not authority replay itself.
    const started = await actor.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'hard',
      p_mode: 'normal',
    });
    expect(started.error).toBeNull();
    const currentAttemptId = (started.data as { attempt_id: string }).attempt_id;
    const currentAttempt = await actor
      .from('run_attempts')
      .select('id, engine_version, gameplay_ruleset_version, ruleset_version, seed, journal_hash')
      .eq('id', currentAttemptId)
      .single();
    expect(currentAttempt.error).toBeNull();
    const attempt = currentAttempt.data!;
    const ids = Array.from({ length: 22 }, () => randomUUID())
      .sort()
      .reverse();
    const timestamp = '2026-10-07T12:00:00.123456+00:00';
    const rows = ids.map((id, index) => ({
      id,
      player_id: playerId!,
      run_uuid: `sprintg_${id}`,
      created_at: timestamp,
      started_at: '2026-10-07T11:59:00Z',
      completed_at: '2026-10-07T12:00:00Z',
      run_attempt_id: index === 0 ? currentAttemptId : null,
      progression_source: index === 0 ? 'verified' : 'legacy',
      won: index === 0,
      run_level: index + 1,
      waves_completed: index === 0 ? 73 : index,
      total_kills: index === 0 ? 17 : index,
      candies_earned: index === 0 ? 42 : 0,
      gold_earned: index === 0 ? 500 : 0,
      total_damage_dealt: index === 0 ? 12345 : 0,
      seed: attempt.seed,
    }));
    expect((await service.from('runs').insert(rows)).error).toBeNull();
    // Verification-table writes are intentionally unavailable even to the service Data API.
    // Only this loopback PostgreSQL fixture marks its synthetic stored history row.
    expect(attempt.journal_hash).toMatch(/^[0-9a-f]{64}$/u);
    localSql(`UPDATE public.run_attempts SET
      status = 'verified', finish_command_id = ${uuidLiteral(randomUUID())},
      finished_at = now(), sealed_sequence = 0,
      sealed_journal_hash = '${attempt.journal_hash}',
      result_run_id = ${uuidLiteral(ids[0])}, result_hash = '${'a'.repeat(64)}',
      result = '{}'::jsonb, response = '{}'::jsonb, verified_at = now()
      WHERE id = ${uuidLiteral(currentAttemptId)};`);
    expect(
      (
        await service.from('run_team_members').insert({
          run_id: ids[0],
          champion_id: 'Garen',
          final_level: 6,
          final_hp: 900,
          damage_dealt: 12345,
          kills: 17,
          survived: true,
        })
      ).error,
    ).toBeNull();

    const rejectionStart = await actor.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    expect(rejectionStart.error).toBeNull();
    const rejectedAttemptId = (rejectionStart.data as { attempt_id: string }).attempt_id;
    expect(
      (
        await actor.rpc('seal_run_attempt', {
          p_attempt_id: rejectedAttemptId,
          p_expected_sequence: 0,
          p_finish_command_id: randomUUID(),
        })
      ).error,
    ).toBeNull();
    const claimed = await service.rpc('claim_run_verification', {
      p_attempt_id: rejectedAttemptId,
      p_worker_id: randomUUID(),
    });
    expect(claimed.error).toBeNull();
    expect(
      (
        await service.rpc('reject_run_verification', {
          p_attempt_id: rejectedAttemptId,
          p_lease_token: (claimed.data as { lease_token: string }).lease_token,
          p_rejection_code: 'pending_choice',
        })
      ).error,
    ).toBeNull();

    const summary = page.getByRole('region', { name: /Du nouveau depuis ta dernière visite/ });
    await expect(summary).toBeVisible();
    const markReadResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/rest/v1/rpc/mark_patch_notes_seen',
    );
    await summary.getByRole('button', { name: 'J’ai compris' }).click();
    const readResponse = await markReadResponse;
    expect(readResponse.ok()).toBe(true);
    const readState = (await readResponse.json()) as {
      user_id: string;
      last_seen_sequence: number;
      last_seen_version: string;
    };
    expect(readState.user_id).toBe(userId);
    expect(readState.last_seen_sequence).toBeGreaterThan(0);
    const persisted = await service
      .from('player_patch_note_state')
      .select('last_seen_sequence, last_seen_version')
      .eq('user_id', userId!)
      .single();
    expect(persisted.error).toBeNull();
    expect(persisted.data).toMatchObject({
      last_seen_sequence: readState.last_seen_sequence,
      last_seen_version: readState.last_seen_version,
    });
    await expect(summary).toHaveCount(0);

    await page.getByRole('button', { name: 'Profil et historique', exact: true }).click();
    await expect(page).toHaveURL('/profile');
    const historyRows = page.locator('li.profile-run');
    await expect(historyRows).toHaveCount(20);
    expect(teamReads).toBe(0);
    expect(fullRunReads).toBe(0);
    await expect(page.getByText('Legacy · non comparable', { exact: true }).first()).toBeVisible();
    const currentRow = historyRows.filter({ hasText: 'Versions de jeu actuelles' });
    await expect(currentRow).toHaveCount(1);
    const detailResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return (
        url.pathname === '/rest/v1/run_team_members' &&
        url.searchParams.get('run_id') === `eq.${ids[0]}`
      );
    });
    await currentRow.locator('summary').click();
    const loadedTeam = await detailResponse;
    expect(loadedTeam.ok()).toBe(true);
    expect(await loadedTeam.json()).toEqual(
      expect.arrayContaining([expect.objectContaining({ champion_id: 'Garen', final_level: 6 })]),
    );
    await expect(currentRow.getByText('Garen niv. 6', { exact: true })).toBeVisible();
    await expect(currentRow.getByText(/500 or gagné/)).toBeVisible();
    expect(teamReads).toBe(1);
    expect(fullRunReads).toBe(1);

    const cursorResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === '/rest/v1/runs' && url.searchParams.has('or');
    });
    await page.getByRole('button', { name: 'Charger les parties suivantes' }).click();
    const nextPage = await cursorResponse;
    expect(nextPage.ok()).toBe(true);
    expect((await nextPage.json()).length).toBe(2);
    await expect(historyRows).toHaveCount(22);
    await expect(page.getByRole('button', { name: 'Charger les parties suivantes' })).toHaveCount(
      0,
    );

    await page.getByRole('combobox', { name: 'Résultat', exact: true }).selectOption('victory');
    await page.getByRole('combobox', { name: 'Difficulté', exact: true }).selectOption('hard');
    await page.getByRole('combobox', { name: 'Mode', exact: true }).selectOption('normal');
    await page.getByRole('searchbox', { name: 'Moteur', exact: true }).fill(attempt.engine_version);
    await page
      .getByRole('spinbutton', { name: 'Version des règles de jeu', exact: true })
      .fill(String(attempt.gameplay_ruleset_version));
    await page
      .getByRole('spinbutton', { name: 'Version des règles de progression', exact: true })
      .fill(String(attempt.ruleset_version));
    await expect(historyRows).toHaveCount(1);
    await expect(historyRows.first()).toContainText('73 vagues');
    await page
      .getByRole('spinbutton', { name: 'Version des règles de jeu', exact: true })
      .fill(String(attempt.gameplay_ruleset_version + 1));
    await expect(page.getByText('Aucune partie enregistrée', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
    await expect(historyRows).toHaveCount(20);

    const rejections = page.getByRole('region', { name: 'Tentatives rejetées', exact: true });
    const rejectionResponse = page.waitForResponse(
      (response) => new URL(response.url()).pathname === '/rest/v1/rpc/get_player_run_rejections',
    );
    await rejections.getByRole('button', { name: 'Afficher les tentatives rejetées' }).click();
    const diagnostics = await rejectionResponse;
    expect(diagnostics.ok()).toBe(true);
    expect(await diagnostics.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attempt_id: rejectedAttemptId,
          rejection_code: 'pending_choice',
        }),
      ]),
    );
    await rejections.locator('li > details > summary').click();
    await rejections.getByText('Diagnostic technique', { exact: true }).click();
    await expect(rejections.getByText('pending_choice', { exact: true })).toBeVisible();

    const secondPage = await secondDevice.newPage();
    await secondPage.goto('/auth');
    expect(
      await secondPage.evaluate(() =>
        Object.keys(localStorage).some((key) => key.startsWith('lolrogue:patch-notes:')),
      ),
    ).toBe(false);
    await secondPage.getByLabel('Adresse e-mail').fill(email);
    await secondPage.getByLabel('Mot de passe').fill(password);
    const secondRead = secondPage.waitForResponse(
      (response) => new URL(response.url()).pathname === '/rest/v1/player_patch_note_state',
    );
    await secondPage.getByRole('button', { name: 'Connexion', exact: true }).click();
    await expect(secondPage).toHaveURL('/', { timeout: 30_000 });
    expect((await secondRead).ok()).toBe(true);
    await expect(
      secondPage.getByRole('region', { name: /Du nouveau depuis ta dernière visite/ }),
    ).toHaveCount(0);
    await expect(secondPage.locator('#patch-notes-menu-link')).not.toContainText('Nouveau');
    const redeployedRead = secondPage.waitForResponse(
      (response) => new URL(response.url()).pathname === '/rest/v1/player_patch_note_state',
    );
    await secondPage.goto('/?deployment=sprint-g-another-sha');
    expect((await redeployedRead).ok()).toBe(true);
    await expect(
      secondPage.getByRole('region', { name: /Du nouveau depuis ta dernière visite/ }),
    ).toHaveCount(0);
    await secondPage.getByRole('button', { name: 'Déconnexion', exact: true }).click();
    await expect(secondPage).toHaveURL('/auth');
  } finally {
    await secondDevice.close();
    await actor.auth.signOut({ scope: 'local' });
    if (userId) {
      // Remove the explicit fixture's run/attempt FK cycle before deleting its Auth owner.
      localSql(`UPDATE public.run_attempts SET status = 'expired',
        verified_at = NULL, rejected_at = NULL, expired_at = now(), result_run_id = NULL
        WHERE user_id = ${uuidLiteral(userId)};`);
      if (playerId)
        expect((await service.from('runs').delete().eq('player_id', playerId)).error).toBeNull();
      expect((await service.auth.admin.deleteUser(userId)).error).toBeNull();
    }
  }
});
