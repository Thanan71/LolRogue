import type { SupabaseClient } from '@supabase/supabase-js';
import { balanceFilters } from './helpers/adminBalanceFixtures';
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
if (process.env.DB_TEST_REQUIRED === '1' && !hasAdminExplorerCredentials)
  throw new Error(
    'Admin balance privilege tests require disposable loopback Supabase API and SQL credentials.',
  );
const operations = [
  'admin_balance_champions',
  'admin_balance_builds',
  'admin_balance_trees',
  'admin_balance_config',
];
const args = (name: string, valid = true) =>
  name === 'admin_balance_config'
    ? {}
    : { p_filters: valid ? balanceFilters : { invalid_secret: true } };

describeDatabase('current administrator balance privileges', () => {
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
    'denies %s all resources before validating supplied filters',
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
        const result = await client.rpc(name, args(name, false));
        expect(result.data, name).toBeNull();
        expect(result.error?.code, name).toBe('42501');
      }
    },
  );

  it('immediately refuses a revoked admin with the same authenticated JWT', async () => {
    const token = (await admin.client.auth.getSession()).data.session!.access_token;
    for (const name of operations)
      expect(await rpcData(admin.client, name, args(name))).toHaveProperty('snapshotAt');
    explorerSql(`UPDATE public.players SET is_admin=FALSE WHERE id='${admin.playerId}'`);
    try {
      for (const name of operations)
        expect((await admin.client.rpc(name, args(name))).error?.code, name).toBe('42501');
      expect((await admin.client.auth.getSession()).data.session!.access_token).toBe(token);
    } finally {
      explorerSql(`UPDATE public.players SET is_admin=TRUE WHERE id='${admin.playerId}'`);
    }
  });

  it('refuses anonymous Auth identities even with an actual admin player flag', async () => {
    explorerSql(`UPDATE auth.users SET is_anonymous=TRUE WHERE id='${admin.userId}'`);
    try {
      for (const name of operations)
        expect((await admin.client.rpc(name, args(name))).error?.code, name).toBe('42501');
    } finally {
      explorerSql(`UPDATE auth.users SET is_anonymous=FALSE WHERE id='${admin.userId}'`);
    }
  });

  it('has only four invoker entrypoints and one guarded private definer with no unguarded helper grants', () => {
    const acl = JSON.parse(
      explorerSql(`SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'definer',p.prosecdef,
      'emptyPath',p.proconfig@>ARRAY['search_path=""'],'anon',has_function_privilege('anon',p.oid,'execute'),
      'authenticated',has_function_privilege('authenticated',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute')))
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN('public','private') AND p.proname LIKE 'admin_balance%'`),
    );
    expect(acl.filter((r: { schema: string }) => r.schema === 'public')).toHaveLength(4);
    expect(acl.filter((r: { definer: boolean }) => r.definer)).toHaveLength(1);
    for (const row of acl)
      expect(row).toMatchObject({
        emptyPath: true,
        anon: false,
        service: false,
        authenticated: row.schema === 'public' || row.name === 'admin_balance',
      });
    expect(() =>
      explorerSql(
        `BEGIN;SET LOCAL ROLE authenticated;SELECT private.admin_balance_config_data(NOW());ROLLBACK;`,
      ),
    ).toThrow(/permission denied/);
    expect(() =>
      explorerSql(
        `BEGIN;SET LOCAL ROLE authenticated;SELECT private.admin_balance('config',NULL,NULL);ROLLBACK;`,
      ),
    ).toThrow(/admin_access_denied/);
  });

  it('keeps rules and economy mutations inaccessible to ordinary and browser-admin roles', async () => {
    for (const account of [ordinary, admin]) {
      expect(
        (
          await account.client.rpc('set_champion_economy_enabled', {
            p_enabled: true,
          })
        ).error?.code,
      ).toBe('42501');
      const denied = JSON.parse(
        explorerSql(`SELECT jsonb_build_object('gameplay',has_table_privilege('authenticated','public.gameplay_rulesets','UPDATE'),
      'progression',has_table_privilege('authenticated','public.progression_rulesets','UPDATE'),'economy',has_table_privilege('authenticated','public.champion_economy_config','UPDATE'))`),
      );
      expect(denied).toEqual({
        gameplay: false,
        progression: false,
        economy: false,
      });
    }
  });

  it('performs no authority, economy, historical run or event mutation when reading all resources', async () => {
    const snapshot = () =>
      explorerSql(`SELECT md5(jsonb_build_object('rules',(SELECT jsonb_agg(to_jsonb(t)ORDER BY version)FROM public.gameplay_rulesets t),
      'progression',(SELECT jsonb_agg(to_jsonb(t)ORDER BY version)FROM public.progression_rulesets t),
      'economy',(SELECT jsonb_agg(to_jsonb(t))FROM public.champion_economy_config t),
      'runs',(SELECT COUNT(*)FROM public.runs),'commands',(SELECT COUNT(*)FROM public.run_attempt_commands))::TEXT)`);
    const before = snapshot();
    for (const name of operations) await rpcData(admin.client, name, args(name));
    expect(snapshot()).toBe(before);
  });
});
