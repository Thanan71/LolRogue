import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeDatabase = supabaseUrl && anonKey && serviceRoleKey ? describe : describe.skip;
if (process.env.DB_TEST_REQUIRED === '1' && !(supabaseUrl && anonKey && serviceRoleKey)) {
  throw new Error('Admin metric privilege tests require local Supabase credentials.');
}
const metricViews = ['admin_stats', 'admin_player_stats'] as const;
const ledgerTables = ['candy_accounts', 'candy_transactions', 'candy_ledger_settings'] as const;

async function ledgerRequest(
  table: (typeof ledgerTables)[number],
  {
    token,
    apiKey = anonKey!,
    method = 'GET',
    body,
    playerId,
  }: {
    token?: string;
    apiKey?: string;
    method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    body?: Record<string, unknown>;
    playerId?: string;
  },
) {
  const url = new URL(`${supabaseUrl}/rest/v1/${table}`);
  if (playerId && table !== 'candy_ledger_settings') {
    url.searchParams.set('player_id', `eq.${playerId}`);
  }
  if (table === 'candy_ledger_settings' && (method === 'PATCH' || method === 'DELETE')) {
    url.searchParams.set('singleton', 'eq.false');
  }
  return fetch(url, {
    method,
    headers: {
      apikey: apiKey,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describeDatabase('admin metrics authorization', () => {
  const createdUserIds: string[] = [];
  let service: SupabaseClient<Database>;

  beforeAll(() => {
    service = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  });

  afterAll(async () => {
    const errors: string[] = [];
    for (const userId of createdUserIds) {
      const deleted = await service.auth.admin.deleteUser(userId);
      if (deleted.error) errors.push(deleted.error.message);
    }
    expect(errors).toEqual([]);
  });

  async function createAccount(prefix: string) {
    const suffix = randomUUID();
    const client = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const signup = await client.auth.signUp({
      email: `${prefix}-${suffix}@example.test`,
      password: 'Test-password-42!',
      options: { data: { username: `${prefix}-${suffix}`.slice(0, 50), is_admin: true } },
    });
    if (signup.error || !signup.data.user || !signup.data.session) {
      throw signup.error ?? new Error('Admin metrics account did not receive a session');
    }
    createdUserIds.push(signup.data.user.id);
    const profile = await service
      .from('players')
      .select('id')
      .eq('user_id', signup.data.user.id)
      .single();
    if (profile.error || !profile.data) throw profile.error ?? new Error('Player profile missing');
    return {
      client,
      userId: signup.data.user.id,
      playerId: profile.data.id,
      accessToken: signup.data.session.access_token,
    };
  }

  it('does not expose metric values, player rows or counts to anonymous callers', async () => {
    const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    for (const view of metricViews) {
      const read = await anonymous.from(view).select('*', { count: 'exact' });
      expect(read.data, view).toBeNull();
      expect(read.count, view).toBeNull();
      expect(read.error, view).not.toBeNull();
    }
  });

  it('keeps both admin views empty despite forged admin metadata', async () => {
    const regular = await createAccount('metrics-regular');
    expect(await regular.client.rpc('is_current_user_admin')).toMatchObject({
      data: false,
      error: null,
    });
    for (const view of metricViews) {
      expect(await regular.client.from(view).select('*', { count: 'exact' })).toMatchObject({
        data: [],
        count: 0,
        error: null,
      });
    }
  });

  it('does not turn service credentials into an authenticated admin identity', async () => {
    for (const view of metricViews) {
      const read = await service.from(view).select('*', { count: 'exact' });
      expect(read.data, view).toBeNull();
      expect(read.count, view).toBeNull();
      expect(read.error?.code, view).toBe('42501');
    }
  });

  it('revokes access to values and counts on the same authenticated session', async () => {
    const administrator = await createAccount('metrics-revoked');
    const promotion = await service
      .from('players')
      .update({ is_admin: true })
      .eq('id', administrator.playerId);
    expect(promotion.error).toBeNull();
    for (const view of metricViews) {
      const allowed = await administrator.client.from(view).select('*', { count: 'exact' });
      expect(allowed.error, view).toBeNull();
      expect(allowed.data?.length, view).toBeGreaterThan(0);
      expect(allowed.count, view).toBeGreaterThan(0);
    }

    const revocation = await service
      .from('players')
      .update({ is_admin: false })
      .eq('id', administrator.playerId);
    expect(revocation.error).toBeNull();
    for (const view of metricViews) {
      expect(await administrator.client.from(view).select('*', { count: 'exact' })).toMatchObject({
        data: [],
        count: 0,
        error: null,
      });
    }
    const session = await administrator.client.auth.getSession();
    expect(session.data.session?.access_token).toBe(administrator.accessToken);
  });

  it('keeps administrator metric and role writes outside authenticated clients', async () => {
    const administrator = await createAccount('metrics-writes');
    const regular = await createAccount('metrics-target');
    const promotion = await service
      .from('players')
      .update({ is_admin: true })
      .eq('id', administrator.playerId);
    expect(promotion.error).toBeNull();

    const before = await administrator.client
      .from('admin_stats')
      .select('stat_value')
      .eq('stat_name', 'candies_ledger_started_at')
      .single();
    expect(before.error).toBeNull();
    // Bypass the generated client's read-only view type to exercise the actual API boundary.
    const metricWrite = await fetch(
      `${supabaseUrl}/rest/v1/admin_stats?stat_name=eq.candies_ledger_started_at`,
      {
        method: 'PATCH',
        headers: {
          apikey: anonKey!,
          Authorization: `Bearer ${administrator.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ stat_value: '999999' }),
      },
    );
    expect(metricWrite.ok).toBe(false);
    // The UNION view can report 55000 even when its write ACLs are revoked.
    expect(await metricWrite.json()).toMatchObject({
      code: expect.stringMatching(/^(42501|55000)$/),
    });
    const after = await administrator.client
      .from('admin_stats')
      .select('stat_value')
      .eq('stat_name', 'candies_ledger_started_at')
      .single();
    expect(after).toMatchObject({ data: before.data, error: null });
    const roleWrite = await administrator.client
      .from('players')
      .update({ is_admin: true })
      .eq('id', regular.playerId);
    expect(roleWrite.error).not.toBeNull();
    const profile = await service
      .from('players')
      .select('is_admin')
      .eq('id', regular.playerId)
      .single();
    expect(profile).toMatchObject({ data: { is_admin: false }, error: null });
  });

  it('protects real ledger rows and their counts, including after admin revocation', async () => {
    const owner = await createAccount('ledger-owner');
    const administrator = await createAccount('ledger-reader');
    const credited = await service
      .from('players')
      .update({ total_candies: 100 })
      .eq('id', owner.playerId);
    expect(credited.error).toBeNull();
    const promoted = await service
      .from('players')
      .update({ is_admin: true })
      .eq('id', administrator.playerId);
    expect(promoted.error).toBeNull();

    for (const table of ledgerTables) {
      const anonymous = await ledgerRequest(table, { playerId: owner.playerId });
      expect([401, 403], table).toContain(anonymous.status);
      expect(anonymous.headers.get('content-range'), table).toBeNull();

      const hidden = await ledgerRequest(table, {
        token: owner.accessToken,
        playerId: owner.playerId,
      });
      expect(hidden.status, table).toBe(200);
      expect(await hidden.json(), table).toEqual([]);
      expect(hidden.headers.get('content-range'), table).toBe('*/0');

      for (const credentials of [
        { token: administrator.accessToken },
        { token: serviceRoleKey!, apiKey: serviceRoleKey! },
      ]) {
        const visible = await ledgerRequest(table, { ...credentials, playerId: owner.playerId });
        expect(visible.status, table).toBe(200);
        const rows: unknown = await visible.json();
        expect(Array.isArray(rows), table).toBe(true);
        expect(Array.isArray(rows) ? rows.length : 0, table).toBeGreaterThan(0);
      }
    }

    const revoked = await service
      .from('players')
      .update({ is_admin: false })
      .eq('id', administrator.playerId);
    expect(revoked.error).toBeNull();
    for (const table of ledgerTables) {
      const hidden = await ledgerRequest(table, {
        token: administrator.accessToken,
        playerId: owner.playerId,
      });
      expect(hidden.status, table).toBe(200);
      expect(await hidden.json(), table).toEqual([]);
      expect(hidden.headers.get('content-range'), table).toBe('*/0');
    }
  });

  it('denies direct ledger writes even to authenticated admins and the service API', async () => {
    const owner = await createAccount('ledger-write-target');
    const administrator = await createAccount('ledger-write-admin');
    const promoted = await service
      .from('players')
      .update({ is_admin: true })
      .eq('id', administrator.playerId);
    expect(promoted.error).toBeNull();

    const payloads = {
      candy_accounts: { player_id: owner.playerId, opening_balance: 999, history_complete: true },
      candy_transactions: {
        player_id: owner.playerId,
        kind: 'earned',
        amount: 999,
        source_key: `forged-${randomUUID()}`,
      },
      candy_ledger_settings: { singleton: true, started_at: '1970-01-01T00:00:00Z' },
    };
    for (const credentials of [
      {},
      { token: owner.accessToken },
      { token: administrator.accessToken },
      { token: serviceRoleKey!, apiKey: serviceRoleKey! },
    ]) {
      for (const table of ledgerTables) {
        for (const method of ['POST', 'PATCH', 'DELETE'] as const) {
          const denied = await ledgerRequest(table, {
            ...credentials,
            method,
            ...(method !== 'DELETE' ? { body: payloads[table] } : {}),
            playerId: owner.playerId,
          });
          expect([401, 403], `${table} ${method}`).toContain(denied.status);
          expect(await denied.json(), `${table} ${method}`).toMatchObject({ code: '42501' });
        }
      }
    }
  });
});
