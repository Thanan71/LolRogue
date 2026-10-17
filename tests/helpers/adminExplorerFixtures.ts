import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const adminExplorerCredentials = {
  url: process.env.VITE_PUBLIC_SUPABASE_URL,
  anon: process.env.VITE_PUBLIC_SUPABASE_ANON_KEY,
  service: process.env.SUPABASE_SERVICE_ROLE_KEY,
  database: process.env.SUPABASE_DB_URL,
};
export const hasAdminExplorerCredentials = Object.values(adminExplorerCredentials).every(Boolean);
const auth = { autoRefreshToken: false, persistSession: false };
export function explorerClient(role: 'anon' | 'service' = 'anon') {
  return createClient(adminExplorerCredentials.url!, adminExplorerCredentials[role]!, { auth });
}
export function explorerSql(query: string) {
  for (const input of [adminExplorerCredentials.url, adminExplorerCredentials.database]) {
    if (!input || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(input).hostname)) {
      throw new Error('Admin explorer fixtures require a disposable loopback database.');
    }
  }
  const connection = new URL(adminExplorerCredentials.database!);
  return execFileSync(
    'psql',
    [
      '--no-psqlrc',
      '--no-password',
      '--quiet',
      '--tuples-only',
      '--no-align',
      '--set',
      'ON_ERROR_STOP=1',
    ],
    {
      encoding: 'utf8',
      input: query,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PGHOST: connection.hostname,
        PGPORT: connection.port,
        PGDATABASE: connection.pathname.slice(1),
        PGUSER: decodeURIComponent(connection.username),
        PGPASSWORD: decodeURIComponent(connection.password),
      },
    },
  ).trim();
}
export interface ExplorerAccount {
  client: SupabaseClient;
  userId: string;
  playerId: string;
}
export async function explorerAccount(
  service: SupabaseClient,
  users: string[],
  options: { admin?: boolean; name?: string; forgedAdmin?: boolean } = {},
): Promise<ExplorerAccount> {
  const client = explorerClient();
  const suffix = randomUUID();
  const signup = await client.auth.signUp({
    email: `adm-explorer-${suffix}@example.test`,
    password: 'Explorer-local-test-42!',
    options: {
      data: { username: `s2_${suffix}`, ...(options.forgedAdmin ? { is_admin: true } : {}) },
    },
  });
  if (signup.error || !signup.data.user || !signup.data.session)
    throw signup.error ?? new Error('Missing fixture session');
  const userId = signup.data.user.id;
  users.push(userId);
  const profile = await service.from('players').select('id').eq('user_id', userId).single();
  if (profile.error || !profile.data) throw profile.error ?? new Error('Missing fixture profile');
  if (options.admin)
    explorerSql(`UPDATE public.players SET is_admin=TRUE WHERE id='${profile.data.id}'::uuid`);
  if (options.name) {
    const updated = await service
      .from('players')
      .update({ display_name: options.name })
      .eq('id', profile.data.id);
    if (updated.error) throw updated.error;
  }
  return { client, userId, playerId: profile.data.id };
}
export async function cleanupExplorer(service: SupabaseClient, users: string[]) {
  // Fixtures may have canonical bidirectional run/attempt foreign keys. Use the
  // existing account-erasure preparation only for these exact disposable users.
  for (const id of users) {
    explorerSql(
      `UPDATE public.run_attempts SET status='expired',verified_at=NULL,rejected_at=NULL,result_run_id=NULL,expired_at=NOW() WHERE user_id='${id}'::uuid`,
    );
    const deleted = await service.auth.admin.deleteUser(id);
    if (deleted.error) throw deleted.error;
  }
}
export function seedExplorerRuns(account: ExplorerAccount, count: number, prefix: string) {
  if (!Number.isSafeInteger(count) || count < 1 || count > 6000 || !/^[a-z0-9_-]+$/.test(prefix))
    throw new Error('Invalid local fixture');
  explorerSql(`INSERT INTO public.runs(player_id,run_uuid,won,waves_completed,run_level,biomes_visited,seed,started_at,completed_at,created_at)
   SELECT '${account.playerId}'::uuid,'${prefix}_'||n,n%2=0,n%17,n%4+1,ARRAY['top_lane'],9007199254740993::bigint,
   '2026-01-01T00:00:00Z'::timestamptz,'2026-01-01T01:00:00Z'::timestamptz,'2026-01-01T01:00:00Z'::timestamptz
   FROM generate_series(1,${count}) n;
   INSERT INTO public.run_team_members(run_id,champion_id,items_collected,damage_dealt)
   SELECT id,'Garen',ARRAY['long_sword'],9007199254740993::bigint FROM public.runs WHERE player_id='${account.playerId}' AND run_uuid LIKE '${prefix}_%';`);
}
export async function seedExplorerAttempt(account: ExplorerAccount) {
  const started = await account.client.rpc('start_run_attempt', {
    p_command_id: randomUUID(),
    p_team: ['Garen'],
    p_rune_ids: [],
    p_difficulty: 'normal',
    p_mode: 'normal',
  });
  if (started.error || !started.data?.attempt_id)
    throw started.error ?? new Error(`Missing attempt: ${JSON.stringify(started.data)}`);
  const id = started.data.attempt_id as string;
  const runId = randomUUID();
  explorerSql(`INSERT INTO public.run_attempt_commands(attempt_id,sequence,command_id,kind,payload,payload_hash,previous_hash,chain_hash)
   SELECT '${id}'::uuid,n,gen_random_uuid(),CASE WHEN n=3 THEN 'unknown_future' WHEN n=2 THEN 'resolve_combat' ELSE 'move_node' END,
   jsonb_build_object('node_id','node_'||n,'actions_json','auto','lease_token','secret-lease-marker','user_id','secret-auth-marker','result',jsonb_build_object('secret','nested-secret-marker')),
   repeat('a',64),repeat('b',64),repeat('c',64) FROM generate_series(1,5)n;
   INSERT INTO public.runs(id,player_id,run_uuid,won,waves_completed,run_level,candies_earned,progression_version,progression_source,run_attempt_id)
   VALUES('${runId}','${account.playerId}','verified_${randomUUID()}',TRUE,3,2,7,3,'verified','${id}');
   INSERT INTO public.run_team_members(run_id,champion_id,items_collected)VALUES('${runId}','Garen',ARRAY['long_sword']);
   UPDATE public.run_attempts SET status='verified',last_sequence=5,finish_command_id=gen_random_uuid(),sealed_sequence=5,sealed_journal_hash=repeat('d',64),finished_at=NOW(),verified_at=NOW(),result_run_id='${runId}',
   result_hash=repeat('e',64),result=jsonb_build_object('secret','raw-result-marker'),response=jsonb_build_object('token','raw-response-marker') WHERE id='${id}';`);
  return { attemptId: id, runId };
}
export async function rpcData(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown> = {},
) {
  const result = await client.rpc(name, args);
  if (result.error) throw result.error;
  return result.data;
}
