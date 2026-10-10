import { expect, type Page, test } from '@playwright/test';
import {
  CHAMPION_CATALOG_VERSION,
  CHAMPION_ECONOMY_CATALOG,
  CHAMPION_ECONOMY_VERSION,
  getRotationForInstant,
  PERMANENT_FREE_CHAMPION_IDS,
} from '../src/domain/championEconomy';
import { en } from '../src/i18n/en';
import { fr } from '../src/i18n/fr';

const ATTEMPT_ID = '11111111-1111-4111-8111-111111111111';
const RUN_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const PLAYER_ID = '44444444-4444-4444-8444-444444444444';
const HISTORY_ID = '55555555-5555-4555-8555-555555555555';

declare global {
  interface Window {
    runSaveReloadAlerts: string[];
  }
}

// Mock only HTTP boundaries. Auth, finalization, persistence, automatic recovery,
// economy hydration and history queries all use their production implementations.
// No request in these scenarios reaches a real account or database.
async function mockSavedRunBackend(page: Page) {
  const now = new Date().toISOString();
  const rotation = getRotationForInstant(now, 22);
  const requests = { start: 0, append: 0, seal: 0, verify: 0, status: 0 };
  const unexpectedRequests: string[] = [];
  const history: Array<Record<string, unknown>> = [];
  const shardLedger: Array<{ attemptId: string; amount: number }> = [];
  let lastSequence = 0;
  let blockStatus = false;
  let failStatus = false;
  let releaseStatus: (() => void) | undefined;
  let statusGate: Promise<void> | undefined;
  const player = {
    id: PLAYER_ID,
    user_id: USER_ID,
    username: 'saved-run-fixture',
    display_name: 'Saved run fixture',
    public_display_name: null,
    avatar_url: null,
    is_admin: false,
    leaderboard_opt_out: false,
    level: 1,
    total_candies: 100,
    total_runs_completed: 0,
    total_waves_completed: 0,
    total_wins: 0,
    created_at: now,
    updated_at: now,
    last_login_at: now,
  };
  const user = {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: 'saved-run@example.test',
    email_confirmed_at: now,
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    created_at: now,
  };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const session = {
    access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
      sub: USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      exp: expiresAt,
    })}.fixture-signature`,
    refresh_token: 'fixture-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: expiresAt,
    user,
  };
  const attempt = {
    attempt_id: ATTEMPT_ID,
    run_uuid: RUN_ID,
    ruleset_version: 3,
    gameplay_ruleset_version: 22,
    engine_version: 'run-engine-v22',
    seed: 3,
    difficulty: 'normal',
    mode: 'normal',
    initial_team: ['Annie', 'Ashe'],
    rune_ids: [],
    enhancement_snapshot: { Annie: {}, Ashe: {} },
    mastery_snapshot: { Annie: 0, Ashe: 0 },
    daily_date: null,
    daily_ruleset_version: null,
    daily_score_version: null,
    started_at: now,
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    champion_access_snapshot: {
      version: 1,
      enabled: true,
      economyVersion: CHAMPION_ECONOMY_VERSION,
      catalogVersion: CHAMPION_CATALOG_VERSION,
      rotationId: rotation.id,
      rotationStartsAt: rotation.startsAt,
      rotationEndsAt: rotation.endsAt,
      allowedChampionIds: [...PERMANENT_FREE_CHAMPION_IDS, ...rotation.championIds],
      rotationChampionIds: rotation.championIds,
    },
    economy_version: CHAMPION_ECONOMY_VERSION,
    last_sequence: 0,
    journal_hash: 'fixture-journal',
    replayed: false,
  };
  const receipt = {
    run_id: HISTORY_ID,
    replayed: false,
    candies_earned: 20,
    candies_by_champion: { Annie: 10, Ashe: 10 },
    candies_per_champion: 10,
    progression_version: 3,
    progression_source: 'verified',
    shards_earned: 25,
    shards_balance: 200,
    shard_economy_version: CHAMPION_ECONOMY_VERSION,
    shard_rotation_first_win_champion_ids: [],
  };

  await page.addInitScript(() => {
    window.runSaveReloadAlerts = [];
    new MutationObserver(() => {
      const alert = document.querySelector('.game-over-error');
      if (alert) window.runSaveReloadAlerts.push(alert.textContent ?? 'save error');
    }).observe(document, { childList: true, subtree: true });
  });
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const backend = /^\/(auth|rest|functions)\/v1(?:\/|$)/.test(path);
    if (!backend) {
      if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') await route.continue();
      else await route.abort('blockedbyclient');
      return;
    }
    const reply = (json: unknown, status = 200) =>
      route.fulfill({ status, json, headers: { 'access-control-allow-origin': '*' } });
    if (request.method() === 'OPTIONS') {
      await route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,OPTIONS',
        },
      });
      return;
    }
    if (path === '/auth/v1/token') return reply(session);
    if (path === '/auth/v1/user') return reply(user);
    if (path === '/rest/v1/players' && request.method() === 'GET') return reply(player);
    if (
      ['/rest/v1/champion_mastery', '/rest/v1/champion_enhancements'].includes(path) &&
      request.method() === 'GET'
    )
      return reply([]);
    if (path === '/rest/v1/run_attempts' && request.method() === 'GET') return reply(null);
    if (path === '/rest/v1/runs' && request.method() === 'GET') return reply(history);
    if (
      ['/rest/v1/patch_notes', '/rest/v1/player_patch_note_state'].includes(path) &&
      request.method() === 'GET'
    )
      return reply([]);
    if (path.endsWith('/rpc/touch_player_last_login')) return reply(now);
    if (path.endsWith('/rpc/get_champion_economy_snapshot')) {
      return reply({
        enabled: true,
        economyVersion: CHAMPION_ECONOMY_VERSION,
        catalogVersion: CHAMPION_CATALOG_VERSION,
        gameplayRulesetVersion: 22,
        serverNow: now,
        rotation,
        catalog: [...CHAMPION_ECONOMY_CATALOG],
        wallet: {
          shardsBalance: 175 + shardLedger.reduce((sum, entry) => sum + entry.amount, 0),
          lifetimeEarned: 175 + shardLedger.reduce((sum, entry) => sum + entry.amount, 0),
          lifetimeSpent: 0,
        },
        ownedChampionIds: [],
        firstWinChampionIds: [],
      });
    }
    if (path.endsWith('/rpc/start_run_attempt')) {
      requests.start++;
      expect(request.postDataJSON()).toMatchObject({
        p_team: ['Annie', 'Ashe'],
        p_rune_ids: [],
        p_mode: 'normal',
      });
      return reply({ ...attempt, status: 'started' });
    }
    if (path.endsWith('/rpc/append_run_attempt_commands')) {
      requests.append++;
      const body = request.postDataJSON() as {
        p_attempt_id: string;
        p_commands: Array<{ sequence: number; kind: string }>;
      };
      expect(body.p_attempt_id).toBe(ATTEMPT_ID);
      expect(body.p_commands.map((command) => command.kind)).toEqual(['abandon_run']);
      lastSequence = body.p_commands.at(-1)!.sequence;
      return reply({
        ...attempt,
        status: 'started',
        last_sequence: lastSequence,
        accepted: body.p_commands.length,
      });
    }
    if (path.endsWith('/rpc/seal_run_attempt')) {
      requests.seal++;
      expect(request.postDataJSON()).toMatchObject({
        p_attempt_id: ATTEMPT_ID,
        p_expected_sequence: lastSequence,
      });
      return reply({ ...attempt, status: 'finished', last_sequence: lastSequence, accepted: true });
    }
    if (path === '/functions/v1/verify-run') {
      requests.verify++;
      expect(request.postDataJSON()).toEqual({ attempt_id: ATTEMPT_ID });
      // A duplicate submission deliberately duplicates this fixture's ledger,
      // rather than hiding an erroneous client write behind mock idempotency.
      history.push({
        id: HISTORY_ID,
        player_id: PLAYER_ID,
        won: false,
        run_level: 1,
        waves_completed: 0,
        total_kills: 0,
        created_at: now,
        completed_at: now,
        progression_source: 'verified',
        run_attempt_id: ATTEMPT_ID,
        run_attempts: {
          difficulty: 'normal',
          mode: 'normal',
          engine_version: attempt.engine_version,
          gameplay_ruleset_version: 22,
          ruleset_version: 3,
        },
      });
      shardLedger.push({ attemptId: ATTEMPT_ID, amount: 25 });
      player.total_candies += 20;
      player.total_runs_completed++;
      return reply({ response: receipt });
    }
    if (path.endsWith('/rpc/get_run_attempt_status')) {
      requests.status++;
      expect(request.postDataJSON()).toEqual({ p_attempt_id: ATTEMPT_ID });
      if (blockStatus) await statusGate;
      if (failStatus) return reply({ message: 'fixture status temporarily unavailable' }, 503);
      return reply({
        ...attempt,
        status: 'verified',
        last_sequence: lastSequence,
        rejection_code: null,
        response: receipt,
      });
    }
    unexpectedRequests.push(`${request.method()} ${path}`);
    await reply({ message: 'Unexpected fixture request' }, 400);
  });

  return {
    requests,
    unexpectedRequests,
    history,
    shardLedger,
    player,
    holdStatus() {
      blockStatus = true;
      statusGate = new Promise<void>((resolve) => {
        releaseStatus = resolve;
      });
    },
    releaseStatus() {
      blockStatus = false;
      releaseStatus?.();
    },
    failStatus(value: boolean) {
      failStatus = value;
    },
  };
}

async function signInAndFinish(page: Page, language: 'fr-FR' | 'en-US') {
  const copy = language === 'fr-FR' ? fr : en;
  await page.goto('/auth');
  if (language === 'en-US') await page.getByLabel('Langue').selectOption(language);
  await page.getByLabel(copy.auth.email, { exact: true }).fill('saved-run@example.test');
  await page.getByLabel(copy.auth.password, { exact: true }).fill('fixture-password');
  await page.locator('form').getByRole('button', { name: copy.auth.login, exact: true }).click();
  await expect(page).toHaveURL('/');
  const snapshot = await page.evaluate(async () => {
    const { useRunStore } = await import('/src/stores/runStore.ts');
    const started = await useRunStore.getState().startRun(['Annie', 'Ashe']);
    if (!started.success) throw new Error(`Unable to start save fixture: ${started.code}`);
    const ended = await useRunStore.getState().endRun(false, started.runId);
    if (!ended.success) throw new Error(`Unable to finish save fixture: ${ended.code}`);
    const completed = JSON.stringify(useRunStore.getState().completedRunSnapshot);
    window.history.pushState(null, '', '/game-over');
    window.dispatchEvent(new PopStateEvent('popstate'));
    return completed;
  });
  await expect(page.locator('.game-over-save-state').getByRole('status')).toContainText(
    copy.gameOver.verifiedSaved,
  );
  return snapshot;
}

async function assertRecoveredRun(page: Page, snapshot: string) {
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const { useRunStore } = await import('/src/stores/runStore.ts');
        const state = useRunStore.getState();
        return {
          saveStatus: state.saveStatus,
          isActive: state.isActive,
          candiesEarned: state.serverProgression?.candiesEarned,
          shardsBalance: state.serverProgression?.shardsBalance,
          snapshot: JSON.stringify(state.completedRunSnapshot),
        };
      }),
    )
    .toEqual({
      saveStatus: 'saved',
      isActive: false,
      candiesEarned: 20,
      shardsBalance: 200,
      snapshot,
    });
}

for (const language of ['fr-FR', 'en-US'] as const) {
  test(`a saved run recovers after reload without resubmission or duplicate rewards in ${language}`, async ({
    page,
  }) => {
    const copy = language === 'fr-FR' ? fr : en;
    const runtimeErrors: string[] = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    const backend = await mockSavedRunBackend(page);
    const snapshot = await signInAndFinish(page, language);
    expect(backend.requests).toEqual({ start: 1, append: 1, seal: 1, verify: 1, status: 0 });
    backend.holdStatus();
    // A persisted success is not a server receipt. Forged cached rewards must
    // disappear while the automatic, read-only recovery is still pending.
    await page.evaluate(async () => {
      const { RUN_STORAGE_KEY } = await import('/src/game/run/runPersistence.ts');
      const stored = JSON.parse(localStorage.getItem(RUN_STORAGE_KEY)!);
      stored.state.serverProgression.candiesEarned = 999999;
      stored.state.serverProgression.shardsBalance = 999999;
      localStorage.setItem(RUN_STORAGE_KEY, JSON.stringify(stored));
    });
    await page.reload();
    await expect.poll(() => backend.requests.status).toBe(1);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { useRunStore } = await import('/src/stores/runStore.ts');
          return {
            status: useRunStore.getState().saveStatus,
            progression: useRunStore.getState().serverProgression,
          };
        }),
      )
      .toEqual({ status: 'recovering', progression: null });
    await expect(page.locator('.game-over-error')).toHaveCount(0);
    await expect(page.getByRole('button', { name: copy.gameOver.retryVerification })).toHaveCount(
      0,
    );
    await expect(page.locator('.game-over-save-status--success')).toHaveCount(0);
    await expect(page.locator('.game-over-rewards')).toHaveCount(0);
    backend.releaseStatus();
    await expect(page.locator('.game-over-save-state').getByRole('status')).toContainText(
      copy.gameOver.verifiedSaved,
    );
    await expect(
      page.getByRole('button', { name: copy.gameOver.newRun, exact: true }),
    ).toBeEnabled();
    await assertRecoveredRun(page, snapshot);
    expect(await page.evaluate(() => window.runSaveReloadAlerts)).toEqual([]);

    // Recovery also completes away from Game Over. The actual history query
    // renders the one durable row; economy hydration still reads the same balance.
    await page.goto('/profile');
    await expect(page.locator('.profile-run')).toHaveCount(1);
    await assertRecoveredRun(page, snapshot);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const { useChampionEconomyStore } = await import('/src/stores/championEconomyStore.ts');
          return useChampionEconomyStore.getState().snapshot?.wallet?.shardsBalance;
        }),
      )
      .toBe(200);
    expect(backend.requests).toEqual({ start: 1, append: 1, seal: 1, verify: 1, status: 2 });
    expect(backend.history).toHaveLength(1);
    expect(backend.shardLedger).toEqual([{ attemptId: ATTEMPT_ID, amount: 25 }]);
    expect(backend.player.total_candies).toBe(120);
    expect(backend.player.total_runs_completed).toBe(1);
    expect(backend.unexpectedRequests).toEqual([]);
    expect(runtimeErrors).toEqual([]);
  });
}

test('retrying a failed receipt read never reseals or re-verifies the saved run', async ({
  page,
}) => {
  const backend = await mockSavedRunBackend(page);
  const snapshot = await signInAndFinish(page, 'fr-FR');
  backend.failStatus(true);
  await page.reload();
  const retry = page.getByRole('button', { name: fr.gameOver.retryVerification, exact: true });
  await expect(retry).toBeVisible();
  expect(backend.requests).toEqual({ start: 1, append: 1, seal: 1, verify: 1, status: 1 });
  backend.failStatus(false);
  await retry.click();
  await expect(page.locator('.game-over-save-state').getByRole('status')).toContainText(
    fr.gameOver.verifiedSaved,
  );
  await expect(retry).toHaveCount(0);
  await assertRecoveredRun(page, snapshot);
  expect(backend.requests).toEqual({ start: 1, append: 1, seal: 1, verify: 1, status: 2 });
  expect(backend.history).toHaveLength(1);
  expect(backend.shardLedger).toEqual([{ attemptId: ATTEMPT_ID, amount: 25 }]);
  expect(backend.player.total_candies).toBe(120);
  expect(backend.player.total_runs_completed).toBe(1);
  expect(backend.unexpectedRequests).toEqual([]);
});
