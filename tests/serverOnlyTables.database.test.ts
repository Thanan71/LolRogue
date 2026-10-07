import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

type TableAccess = {
  name: keyof Database['public']['Tables'];
  exposure: 'client-data-api' | 'server-only';
  reason: string;
};
const manifest = JSON.parse(
  readFileSync(new URL('../config/public-table-access.json', import.meta.url), 'utf8'),
) as { schemaVersion: number; schema: string; tables: TableAccess[] };
const internalTables = manifest.tables.filter((entry) => entry.exposure === 'server-only');
const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const databaseUrl = process.env.SUPABASE_DB_URL;
const hasCredentials = Boolean(supabaseUrl && anonKey && serviceRoleKey && databaseUrl);
const describeDatabase = hasCredentials ? describe : describe.skip;

if (process.env.DB_TEST_REQUIRED === '1' && !hasCredentials) {
  throw new Error('Server-only privilege tests require Supabase API keys and SUPABASE_DB_URL');
}

function executeSql(sql: string) {
  return spawnSync(
    'psql',
    [
      databaseUrl!,
      '--no-psqlrc',
      '--quiet',
      '--tuples-only',
      '--no-align',
      '--set',
      'ON_ERROR_STOP=1',
      '--set',
      'VERBOSITY=verbose',
    ],
    { encoding: 'utf8', input: sql },
  );
}

function readSqlJson<T>(sql: string): T {
  const result = executeSql(sql);
  if (result.error || result.status !== 0) {
    throw result.error ?? new Error(result.stderr);
  }
  return JSON.parse(result.stdout.trim()) as T;
}

describe('public table boundary manifest', () => {
  it('assigns a documented explicit boundary to every listed table', () => {
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.schema).toBe('public');
    expect(new Set(manifest.tables.map((entry) => entry.name)).size).toBe(manifest.tables.length);
    for (const entry of manifest.tables) {
      expect(entry.name).toMatch(/^[a-z_][a-z0-9_]*$/);
      expect(['client-data-api', 'server-only']).toContain(entry.exposure);
      expect(entry.reason.length).toBeGreaterThan(30);
    }
    expect(internalTables.map((entry) => entry.name)).toEqual([
      'daily_challenge_rulesets',
      'progression_commands',
      'progression_enhancement_security_baselines',
    ]);
  });
});

describeDatabase('server-only table live privilege boundary', () => {
  let server: SupabaseClient<Database>;
  let anonymous: SupabaseClient<Database>;
  let signedIn: SupabaseClient<Database>;
  let userId: string | undefined;

  beforeAll(async () => {
    const auth = { autoRefreshToken: false, persistSession: false };
    server = createClient<Database>(supabaseUrl!, serviceRoleKey!, { auth });
    anonymous = createClient<Database>(supabaseUrl!, anonKey!, { auth });
    signedIn = createClient<Database>(supabaseUrl!, anonKey!, { auth });
    const suffix = randomUUID();
    const signup = await signedIn.auth.signUp({
      email: `table-boundary-${suffix}@example.test`,
      password: 'Test-password-42!',
      options: { data: { username: `boundary-${suffix}`.slice(0, 50) } },
    });
    userId = signup.data.user?.id;
    if (signup.error || !userId || !signup.data.session) {
      throw signup.error ?? new Error('Boundary test account did not receive a session');
    }
  });

  afterAll(async () => {
    if (userId) {
      const removed = await server.auth.admin.deleteUser(userId);
      expect(removed.error).toBeNull();
    }
  });

  it('matches the entire live public table inventory and keeps RLS enabled', () => {
    const tables = readSqlJson<Array<{ name: string; rls: boolean; clientAccess: boolean }>>(`
      SELECT json_agg(boundary ORDER BY name) FROM (
        SELECT relation.relname AS name, relation.relrowsecurity AS rls,
          EXISTS (
            SELECT 1 FROM (VALUES ('anon'), ('authenticated')) AS clients(role_name)
            WHERE has_table_privilege(clients.role_name, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
              OR has_any_column_privilege(clients.role_name, relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
          ) AS "clientAccess"
        FROM pg_class AS relation
        JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
        WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
      ) AS boundary;
    `);
    expect(tables.map((table) => table.name)).toEqual(manifest.tables.map((entry) => entry.name));
    for (const table of tables) {
      expect(table.rls, `${table.name} must enable RLS`).toBe(true);
      expect(table.clientAccess, table.name).toBe(
        manifest.tables.find((entry) => entry.name === table.name)?.exposure === 'client-data-api',
      );
    }
  });

  it.each(internalTables)(
    '$name has no PUBLIC, inherited client or column grants and no policy',
    (entry) => {
      const boundary = readSqlJson<{
        publicGrants: number;
        clientGrants: number;
        policies: number;
        serviceRead: boolean;
      }>(`
      SELECT json_build_object(
        'publicGrants', (
          SELECT count(*) FROM (
            SELECT acl.grantee FROM aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) AS acl
            UNION ALL
            SELECT acl.grantee FROM pg_attribute AS attribute,
              LATERAL aclexplode(attribute.attacl) AS acl
            WHERE attribute.attrelid = relation.oid
          ) AS grants WHERE grantee = 0
        ),
        'clientGrants', (
          SELECT count(*) FROM (VALUES ('anon'), ('authenticated')) AS clients(role_name)
          WHERE has_table_privilege(clients.role_name, relation.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
            OR has_any_column_privilege(clients.role_name, relation.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
        ),
        'policies', (SELECT count(*) FROM pg_policy WHERE polrelid = relation.oid),
        'serviceRead', has_table_privilege('service_role', relation.oid, 'SELECT')
      ) FROM pg_class AS relation WHERE relation.oid = 'public.${entry.name}'::regclass;
    `);
      expect(boundary).toEqual({
        publicGrants: 0,
        clientGrants: 0,
        policies: 0,
        serviceRead: true,
      });
    },
  );

  it.each(internalTables)(
    '$name rejects actual SQL operations under both client roles',
    (entry) => {
      const firstColumn = readSqlJson<string>(`
      SELECT to_json(attname) FROM pg_attribute
      WHERE attrelid = 'public.${entry.name}'::regclass AND attnum > 0 AND NOT attisdropped
      ORDER BY attnum LIMIT 1;
    `);
      expect(firstColumn).toMatch(/^[a-z_][a-z0-9_]*$/);
      for (const role of ['anon', 'authenticated']) {
        for (const statement of [
          `SELECT * FROM public.${entry.name} LIMIT 0`,
          `INSERT INTO public.${entry.name} DEFAULT VALUES`,
          `UPDATE public.${entry.name} SET "${firstColumn}" = "${firstColumn}" WHERE FALSE`,
          `DELETE FROM public.${entry.name} WHERE FALSE`,
        ]) {
          // A failed assertion cannot persist a write: each connection rolls back its transaction.
          const result = executeSql(`BEGIN; SET LOCAL ROLE ${role}; ${statement}; ROLLBACK;`);
          expect(result.error, statement).toBeUndefined();
          expect(result.status, `${role}: ${statement}`).not.toBe(0);
          expect(result.stderr).toContain(`42501: permission denied for table ${entry.name}`);
        }
      }
    },
  );

  it.each(internalTables)(
    '$name denies anonymous/authenticated Data API reads while server reads work',
    async (entry) => {
      for (const client of [anonymous, signedIn]) {
        const read = await client.from(entry.name).select('*').limit(1);
        expect(read.error?.code).toBe('42501');
        expect(read.error?.message).toContain(`permission denied for table ${entry.name}`);
      }
      const serverRead = await server.from(entry.name).select('*').limit(1);
      expect(serverRead.error).toBeNull();
    },
  );

  it('preserves the bounded Daily RPC while keeping the table inaccessible to browser admins', async () => {
    const challenge = await anonymous.rpc('get_daily_challenge');
    expect(challenge.error).toBeNull();
    const promoted = await server.from('players').update({ is_admin: true }).eq('user_id', userId!);
    expect(promoted.error).toBeNull();
    try {
      const adminCheck = await signedIn.rpc('is_current_user_admin');
      expect(adminCheck).toMatchObject({ data: true, error: null });
      for (const entry of internalTables) {
        const read = await signedIn.from(entry.name).select('*').limit(1);
        expect(read.error?.code).toBe('42501');
      }
    } finally {
      const demoted = await server
        .from('players')
        .update({ is_admin: false })
        .eq('user_id', userId!);
      expect(demoted.error).toBeNull();
    }
  });
});
