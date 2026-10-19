import type { SupabaseClient } from '@supabase/supabase-js';
import {
  cleanupExplorer,
  type ExplorerAccount,
  explorerAccount,
  explorerClient,
  explorerSql,
  hasAdminExplorerCredentials,
  rpcData,
} from './helpers/adminExplorerFixtures';

const describeDatabase = hasAdminExplorerCredentials ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !hasAdminExplorerCredentials) {
  throw new Error(
    'Admin analytics privilege tests require disposable loopback Supabase credentials.',
  );
}
const operations = [
  'admin_analytics_series',
  'admin_analytics_retention',
  'admin_analytics_funnel',
];
const filters = { from: '2024-02-01', to: '2024-02-01' };

describeDatabase('temporal analytics access and immutable coverage', () => {
  const users: string[] = [];
  let service: SupabaseClient;
  let admin: ExplorerAccount;
  let ordinary: ExplorerAccount;
  let forged: ExplorerAccount;
  beforeAll(async () => {
    service = explorerClient('service');
    admin = await explorerAccount(service, users, { admin: true });
    ordinary = await explorerAccount(service, users);
    forged = await explorerAccount(service, users, { forgedAdmin: true });
  });
  afterAll(async () => {
    await cleanupExplorer(service, users);
  });

  it.each(['anon', 'ordinary', 'forged', 'service'] as const)(
    'refuses %s before filter validation and exposes no aggregates',
    async (role) => {
      const client =
        role === 'anon'
          ? explorerClient()
          : role === 'ordinary'
            ? ordinary.client
            : role === 'forged'
              ? forged.client
              : service;
      for (const name of operations) {
        const response = await client.rpc(name, { p_filters: { secret_invalid_filter: true } });
        expect(response.data, name).toBeNull();
        expect(response.error?.code, name).toBe('42501');
      }
    },
  );

  it('revokes every resource immediately while the caller keeps the same JWT', async () => {
    const token = (await admin.client.auth.getSession()).data.session!.access_token;
    for (const name of operations)
      expect(await rpcData(admin.client, name, { p_filters: filters })).toHaveProperty(
        'snapshotAt',
      );
    explorerSql(`UPDATE public.players SET is_admin=FALSE WHERE id='${admin.playerId}'`);
    try {
      for (const name of operations)
        expect((await admin.client.rpc(name, { p_filters: filters })).error?.code).toBe('42501');
      expect((await admin.client.auth.getSession()).data.session!.access_token).toBe(token);
    } finally {
      explorerSql(`UPDATE public.players SET is_admin=TRUE WHERE id='${admin.playerId}'`);
    }
  });

  it('rejects anonymous Auth identities even when the current player flag is admin', async () => {
    explorerSql(`UPDATE auth.users SET is_anonymous=TRUE WHERE id='${admin.userId}'`);
    try {
      for (const name of operations)
        expect((await admin.client.rpc(name, { p_filters: filters })).error?.code).toBe('42501');
    } finally {
      explorerSql(`UPDATE auth.users SET is_anonymous=FALSE WHERE id='${admin.userId}'`);
    }
  });

  it('restricts invoker wrappers and the one private definer without opening authority tables', () => {
    const acl = JSON.parse(
      explorerSql(`SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definer',p.prosecdef,
      'emptyPath',p.proconfig@>ARRAY['search_path=""'],'anon',has_function_privilege('anon',p.oid,'execute'),
      'authenticated',has_function_privilege('authenticated',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute')))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private')
      AND (p.proname LIKE 'admin_analytics%' OR p.proname='preserve_admin_analytics_coverage')`),
    );
    expect(acl.filter((r: { schema: string }) => r.schema === 'public')).toHaveLength(3);
    expect(acl.filter((r: { definer: boolean }) => r.definer)).toHaveLength(1);
    for (const row of acl)
      expect(row).toMatchObject({
        emptyPath: true,
        anon: false,
        service: false,
        authenticated: row.schema === 'public' || row.name === 'admin_analytics',
      });
    const tables = JSON.parse(
      explorerSql(`SELECT jsonb_agg(jsonb_build_object('role',r,'select',has_table_privilege(r,'private.admin_analytics_coverage','SELECT'),
      'insert',has_table_privilege(r,'private.admin_analytics_coverage','INSERT'),'update',has_table_privilege(r,'private.admin_analytics_coverage','UPDATE'),
      'delete',has_table_privilege(r,'private.admin_analytics_coverage','DELETE'))) FROM unnest(ARRAY['anon','authenticated','service_role'])r`),
    );
    for (const row of tables)
      expect(row).toMatchObject({ select: false, insert: false, update: false, delete: false });
    expect(
      explorerSql(
        "SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='run_attempt_commands'",
      ),
    ).toBe('1');
  });

  it('guards direct private execution and rejects mutations of the permanent marker', () => {
    expect(() =>
      explorerSql(`BEGIN; SELECT set_config('request.jwt.claims','{"sub":"${forged.userId}","role":"authenticated"}',TRUE); SET LOCAL ROLE authenticated;
      SELECT private.admin_analytics('series','{}',NULL); ROLLBACK;`),
    ).toThrow(/admin_access_denied/);
    expect(() => explorerSql('DELETE FROM private.admin_analytics_coverage')).toThrow(
      /admin_analytics_coverage_immutable/,
    );
  });

  it('keeps retained business sources byte-for-byte unchanged across the three resources', async () => {
    const state = () =>
      explorerSql(`SELECT md5(jsonb_build_object('players',(SELECT jsonb_agg(to_jsonb(p)ORDER BY id)FROM public.players p),
      'attempts',(SELECT jsonb_agg(to_jsonb(a)ORDER BY id)FROM public.run_attempts a),
      'coverage',(SELECT jsonb_agg(to_jsonb(c))FROM private.admin_analytics_coverage c))::text)`);
    const before = state();
    for (const name of operations) await rpcData(admin.client, name, { p_filters: filters });
    expect(state()).toBe(before);
  });
});
