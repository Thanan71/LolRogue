import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { CURRENT_AUTHORITY_VERSION } from '@/game/authority/versionRegistry';
import { SupabaseRunRepository } from '@/services/repositories/SupabaseRunRepository';
import type { Database } from '@/types/database';

const sql = readFileSync(
  new URL(
    '../supabase/migrations/20261007170143_run_history_rejection_details.sql',
    import.meta.url,
  ),
  'utf8',
);
describe('history rejection database contract', () => {
  it('enforces caller RLS and revokes anonymous execution without returning sensitive payloads', () => {
    expect(sql).toContain('SECURITY INVOKER');
    expect(sql).toContain("SET search_path = ''");
    expect(sql).toContain('(SELECT auth.uid()) = attempt.user_id');
    expect(sql).toContain('(SELECT public.is_current_user_admin())');
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role');
    const projection = sql.split('RETURNS TABLE (')[1]?.split(')\nLANGUAGE')[0];
    expect(projection).not.toMatch(/user_id|player_id|result|payload|journal|seed|lease/);
  });
});

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeLive = supabaseUrl && anonKey && serviceRoleKey ? describe : describe.skip;

describeLive('history diagnostics live RLS and keyset', () => {
  const createdUserIds: string[] = [];
  let service: SupabaseClient<Database>;
  beforeAll(() => {
    service = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });
  afterAll(async () => {
    for (const id of createdUserIds) await service.auth.admin.deleteUser(id);
  });
  async function account(label: string, metadata: Record<string, unknown> = {}) {
    const suffix = randomUUID();
    const client = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signup = await client.auth.signUp({
      email: `history-${label}-${suffix}@example.test`,
      password: 'Test-password-42!',
      options: { data: { username: `${label}-${suffix}`, ...metadata } },
    });
    if (signup.error || !signup.data.session || !signup.data.user)
      throw signup.error ?? new Error('History test account did not receive a session');
    createdUserIds.push(signup.data.user.id);
    const player = await service
      .from('players')
      .select('id')
      .eq('user_id', signup.data.user.id)
      .single();
    if (player.error || !player.data) throw player.error ?? new Error('History profile missing');
    return { client, playerId: player.data.id };
  }
  async function reject(client: SupabaseClient<Database>) {
    const start = await client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'normal',
      p_mode: 'normal',
    });
    expect(start.error).toBeNull();
    const id = (start.data as { attempt_id: string }).attempt_id;
    const seal = await client.rpc('seal_run_attempt', {
      p_attempt_id: id,
      p_expected_sequence: 0,
      p_finish_command_id: randomUUID(),
    });
    expect(seal.error).toBeNull();
    const claim = await service.rpc('claim_run_verification', {
      p_attempt_id: id,
      p_worker_id: randomUUID(),
    });
    expect(claim.error).toBeNull();
    const rejection = await service.rpc('reject_run_verification', {
      p_attempt_id: id,
      p_lease_token: (claim.data as { lease_token: string }).lease_token,
      p_rejection_code: 'pending_choice',
    });
    expect(rejection.error).toBeNull();
    return id;
  }
  it('returns diagnostics to the owner and a server-authorized admin while denying another user, forged metadata and anon', async () => {
    const owner = await account('owner');
    const other = await account('other', { is_admin: true });
    const administrator = await account('admin');
    expect(
      (await service.from('players').update({ is_admin: true }).eq('id', administrator.playerId))
        .error,
    ).toBeNull();
    const attemptId = await reject(owner.client);
    const args = { p_player_id: owner.playerId };
    const [own, denied, admin, anonymous] = await Promise.all([
      owner.client.rpc('get_player_run_rejections', args),
      other.client.rpc('get_player_run_rejections', args),
      administrator.client.rpc('get_player_run_rejections', args),
      createClient<Database>(supabaseUrl!, anonKey!).rpc('get_player_run_rejections', args),
    ]);
    expect(own).toMatchObject({
      error: null,
      data: [{ attempt_id: attemptId, rejection_code: 'pending_choice' }],
    });
    expect(admin).toMatchObject({ error: null, data: [{ attempt_id: attemptId }] });
    expect(denied).toMatchObject({ error: null, data: [] });
    expect(anonymous.error).not.toBeNull();
    expect(Object.keys(own.data![0])).toEqual([
      'attempt_id',
      'started_at',
      'rejected_at',
      'difficulty',
      'mode',
      'engine_version',
      'gameplay_ruleset_version',
      'progression_ruleset_version',
      'rejection_code',
    ]);
    expect(
      (await service.from('players').update({ is_admin: false }).eq('id', administrator.playerId))
        .error,
    ).toBeNull();
    expect(await administrator.client.rpc('get_player_run_rejections', args)).toMatchObject({
      error: null,
      data: [],
    });
  });
  it('paginates rejected attempts without duplicates and keeps a newer insertion out of later pages', async () => {
    const owner = await account('pages');
    const firstId = await reject(owner.client);
    const secondId = await reject(owner.client);
    const repository = new SupabaseRunRepository(owner.client);
    const firstPage = await repository.getPlayerRunRejections(owner.playerId, 1);
    expect(firstPage.error).toBeNull();
    expect(firstPage.data?.map((row) => row.attemptId)).toEqual([secondId]);
    expect(firstPage.nextCursor).not.toBeNull();
    await reject(owner.client);
    const secondPage = await repository.getPlayerRunRejections(
      owner.playerId,
      1,
      firstPage.nextCursor!,
    );
    expect(secondPage.error).toBeNull();
    expect(secondPage.data?.map((row) => row.attemptId)).toEqual([firstId]);
    expect(secondPage.nextCursor).toBeNull();
  });
  it('keeps equal-timestamp runs stable across pages and filters authoritative metadata on the server', async () => {
    const owner = await account('run-pages');
    const start = await owner.client.rpc('start_run_attempt', {
      p_command_id: randomUUID(),
      p_team: ['Garen'],
      p_rune_ids: [],
      p_difficulty: 'hard',
      p_mode: 'normal',
    });
    expect(start.error).toBeNull();
    const attemptId = (start.data as { attempt_id: string }).attempt_id;
    const timestamp = '2026-10-07T10:00:00.123456+00:00';
    const ids = [randomUUID(), randomUUID(), randomUUID()].sort().reverse();
    const rows = ids.map((id, index) => ({
      id,
      player_id: owner.playerId,
      run_uuid: `history_${id}`,
      created_at: timestamp,
      run_attempt_id: index === 0 ? attemptId : null,
      progression_source: 'legacy',
      won: index === 0,
    }));
    expect((await service.from('runs').insert(rows)).error).toBeNull();
    const repository = new SupabaseRunRepository(owner.client);
    const first = await repository.getPlayerRunHistory(owner.playerId, 2);
    expect(first.error).toBeNull();
    expect(first.data?.map((row) => row.run.id)).toEqual(ids.slice(0, 2));
    expect(first.nextCursor?.createdAt).toContain('.123456');
    const newerId = randomUUID();
    expect(
      (
        await service.from('runs').insert({
          id: newerId,
          player_id: owner.playerId,
          run_uuid: `history_${newerId}`,
          progression_source: 'legacy',
          created_at: '2026-10-07T11:00:00Z',
        })
      ).error,
    ).toBeNull();
    const second = await repository.getPlayerRunHistory(owner.playerId, 2, {
      cursor: first.nextCursor!,
    });
    expect(second.error).toBeNull();
    expect(second.data?.map((row) => row.run.id)).toEqual(ids.slice(2));
    expect(second.nextCursor).toBeNull();
    const filtered = await repository.getPlayerRunHistory(owner.playerId, 20, {
      filters: {
        outcome: 'victory',
        difficulty: 'hard',
        mode: 'normal',
        engineVersion: CURRENT_AUTHORITY_VERSION.engine,
        gameplayRulesetVersion: CURRENT_AUTHORITY_VERSION.gameplay,
        progressionRulesetVersion: (start.data as { ruleset_version: number }).ruleset_version,
      },
    });
    expect(filtered.error).toBeNull();
    expect(filtered.data?.map((row) => row.run.id)).toEqual([ids[0]]);
    const noMatching = await repository.getPlayerRunHistory(owner.playerId, 20, {
      filters: { mode: 'daily' },
    });
    expect(noMatching.error).toBeNull();
    expect(noMatching.data).toEqual([]);
  });
});
