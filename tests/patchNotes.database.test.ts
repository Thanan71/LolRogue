import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const url = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (process.env.DB_TEST_REQUIRED === '1' && !(url && anonKey && serviceKey)) {
  throw new Error('patch-notes database contract requires local Supabase credentials');
}
const describeLive = url && anonKey && serviceKey ? describe : describe.skip;

describeLive('patch-note reading ownership live contract', () => {
  it('shares reading between devices, prevents regression and isolates guests and other accounts', async () => {
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    const service = createClient<Database>(url!, serviceKey!, options);
    const anonymous = createClient<Database>(url!, anonKey!, options);
    const first = createClient<Database>(url!, anonKey!, options);
    const second = createClient<Database>(url!, anonKey!, options);
    const stranger = createClient<Database>(url!, anonKey!, options);
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const password = 'Patchnotes-test-password-42!';
    const accounts: { id: string; email: string }[] = [];
    try {
      for (let index = 0; index < 2; index++) {
        const email = `patchnotes-${suffix}-${index}@example.test`;
        const result = await service.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          user_metadata: { username: `notes-${suffix}-${index}`.slice(0, 50) },
        });
        if (result.error || !result.data.user)
          throw result.error ?? new Error('test account missing');
        accounts.push({ id: result.data.user.id, email });
      }
      expect(
        (await first.auth.signInWithPassword({ email: accounts[0].email, password })).error,
      ).toBeNull();
      expect(
        (await second.auth.signInWithPassword({ email: accounts[0].email, password })).error,
      ).toBeNull();
      expect(
        (await stranger.auth.signInWithPassword({ email: accounts[1].email, password })).error,
      ).toBeNull();
      const loginBefore = await service
        .from('players')
        .select('last_login_at')
        .eq('user_id', accounts[0].id)
        .single();
      expect(loginBefore.error).toBeNull();
      const saved = await first.rpc('mark_patch_notes_seen', {
        p_user_id: accounts[0].id,
        p_sequence: 2,
        p_version: 'release-2',
      });
      expect(saved.error).toBeNull();
      expect(saved.data).toMatchObject({
        user_id: accounts[0].id,
        last_seen_sequence: 2,
        last_seen_version: 'release-2',
      });
      const otherDevice = await second
        .from('player_patch_note_state')
        .select('*')
        .eq('user_id', accounts[0].id)
        .single();
      expect(otherDevice.error).toBeNull();
      expect(otherDevice.data).toMatchObject({
        last_seen_sequence: 2,
        last_seen_version: 'release-2',
      });
      const stale = await second.rpc('mark_patch_notes_seen', {
        p_user_id: accounts[0].id,
        p_sequence: 1,
        p_version: 'release-1',
      });
      expect(stale.error).toBeNull();
      expect(stale.data).toMatchObject({ last_seen_sequence: 2, last_seen_version: 'release-2' });
      const hidden = await stranger
        .from('player_patch_note_state')
        .select('*')
        .eq('user_id', accounts[0].id);
      expect(hidden.error).toBeNull();
      expect(hidden.data).toEqual([]);
      const foreignWrite = await stranger
        .from('player_patch_note_state')
        .upsert({ user_id: accounts[0].id, last_seen_sequence: 99, last_seen_version: 'forged' });
      expect(foreignWrite.error).not.toBeNull();
      const foreignRpc = await stranger.rpc('mark_patch_notes_seen', {
        p_user_id: accounts[0].id,
        p_sequence: 99,
        p_version: 'forged',
      });
      expect(foreignRpc.data).toBeNull();
      const guestRead = await anonymous.from('player_patch_note_state').select('*');
      expect(guestRead.error).not.toBeNull();
      const guestRpc = await anonymous.rpc('mark_patch_notes_seen', {
        p_user_id: accounts[0].id,
        p_sequence: 99,
        p_version: 'forged',
      });
      expect(guestRpc.error).not.toBeNull();
      const retained = await first.from('player_patch_note_state').select('*').single();
      expect(retained.data?.last_seen_sequence).toBe(2);
      const loginAfter = await service
        .from('players')
        .select('last_login_at')
        .eq('user_id', accounts[0].id)
        .single();
      expect(loginAfter.data?.last_login_at).toBe(loginBefore.data?.last_login_at);
    } finally {
      await Promise.all([first.auth.signOut(), second.auth.signOut(), stranger.auth.signOut()]);
      for (const account of accounts) await service.auth.admin.deleteUser(account.id);
    }
  });
});
