import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cleanupExplorer,
  type ExplorerAccount,
  explorerAccount,
  explorerClient,
  explorerSql,
  hasAdminExplorerCredentials,
  rpcData,
  seedExplorerAttempt,
} from './helpers/adminExplorerFixtures';

const describeDatabase = hasAdminExplorerCredentials ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !hasAdminExplorerCredentials) {
  throw new Error(
    'Admin explorer privilege tests require disposable loopback Supabase credentials.',
  );
}
const operations = [
  ['admin_search_players', {}],
  ['admin_search_runs', {}],
  ['admin_search_attempts', {}],
  ['admin_export_runs', {}],
  ['admin_get_player_detail', { p_player_id: randomUUID() }],
  ['admin_get_run_detail', { p_run_id: randomUUID() }],
  ['admin_get_attempt_detail', { p_attempt_id: randomUUID() }],
] as const;

describeDatabase('admin explorer permissions and read-only scope', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let admin: ExplorerAccount;
  let ordinary: ExplorerAccount;
  let forged: ExplorerAccount;
  let foreignAttemptId: string;
  beforeAll(async () => {
    service = explorerClient('service');
    admin = await explorerAccount(service, users, { admin: true });
    ordinary = await explorerAccount(service, users);
    forged = await explorerAccount(service, users, { forgedAdmin: true });
    foreignAttemptId = (await seedExplorerAttempt(ordinary)).attemptId;
  });
  afterAll(async () => {
    await cleanupExplorer(service, users);
  });

  it.each(['anonymous', 'ordinary', 'forged', 'service'] as const)(
    'denies every explorer API to %s before validating any requested entity',
    async (role) => {
      const client =
        role === 'anonymous'
          ? explorerClient()
          : role === 'ordinary'
            ? ordinary.client
            : role === 'forged'
              ? forged.client
              : service;
      for (const [name, args] of operations) {
        const response = await client.rpc(name, args);
        expect(response.data, name).toBeNull();
        expect(response.error?.code, name).toBe('42501');
      }
    },
  );

  it('revokes access immediately with the same JWT and never trusts editable metadata', async () => {
    const token = (await admin.client.auth.getSession()).data.session!.access_token;
    expect((await rpcData(admin.client, 'admin_search_players')).total).toBeGreaterThanOrEqual(3);
    explorerSql(`UPDATE public.players SET is_admin=FALSE WHERE id='${admin.playerId}'`);
    try {
      for (const [name, args] of operations)
        expect((await admin.client.rpc(name, args)).error?.code).toBe('42501');
      expect((await admin.client.auth.getSession()).data.session!.access_token).toBe(token);
    } finally {
      explorerSql(`UPDATE public.players SET is_admin=TRUE WHERE id='${admin.playerId}'`);
    }
  });

  it('keeps public wrappers invoker and private entry ACLs exact without SELECT expansion', async () => {
    const result = JSON.parse(
      explorerSql(`SELECT jsonb_agg(jsonb_build_object('name',p.proname,'definer',p.prosecdef,'stable',p.provolatile='s',
      'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),
      'service',has_function_privilege('service_role',p.oid,'execute'))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='public' AND p.proname=ANY(ARRAY['admin_search_players','admin_search_runs','admin_search_attempts','admin_export_runs','admin_get_player_detail','admin_get_run_detail','admin_get_attempt_detail'])`),
    );
    expect(result).toHaveLength(7);
    for (const row of result)
      expect(row).toMatchObject({
        definer: false,
        stable: true,
        anon: false,
        authenticated: true,
        service: false,
      });
    const privateAcl = JSON.parse(
      explorerSql(`SELECT jsonb_agg(jsonb_build_object('name',p.proname,'emptyPath',p.proconfig@>ARRAY['search_path=""'],
      'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),
      'service',has_function_privilege('service_role',p.oid,'execute'))) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='private' AND p.proname=ANY(ARRAY['admin_explorer_page','admin_player_detail','admin_run_detail'])`),
    );
    expect(privateAcl).toHaveLength(3);
    for (const row of privateAcl)
      expect(row).toMatchObject({
        emptyPath: true,
        anon: false,
        authenticated: true,
        service: false,
      });
    const foreignJournal = await admin.client
      .from('run_attempt_commands')
      .select('attempt_id')
      .eq('attempt_id', foreignAttemptId);
    expect(foreignJournal.error).toBeNull();
    expect(foreignJournal.data).toEqual([]);
    const ownJournal = await ordinary.client
      .from('run_attempt_commands')
      .select('sequence')
      .eq('attempt_id', foreignAttemptId);
    expect(ownJournal.error).toBeNull();
    expect(ownJournal.data).toHaveLength(5);
    expect(
      explorerSql(
        `SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='run_attempt_commands'`,
      ),
    ).toBe('1');
  });

  it('applies the same current-admin guard to direct private SQL entrypoints', () => {
    const calls = [
      `private.admin_explorer_page('runs','{}',NULL,NULL,50,FALSE)`,
      `private.admin_player_detail('${ordinary.playerId}',NULL)`,
      `private.admin_run_detail('${randomUUID()}','run',NULL,NULL,50)`,
    ];
    for (const call of calls) {
      expect(() =>
        explorerSql(
          `BEGIN; SELECT set_config('request.jwt.claims','{"sub":"${ordinary.userId}","role":"authenticated","user_metadata":{"is_admin":true}}',TRUE); SET LOCAL ROLE authenticated; SELECT ${call}; ROLLBACK;`,
        ),
      ).toThrow(/admin_access_denied/);
    }
  });
});
