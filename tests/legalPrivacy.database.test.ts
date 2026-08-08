import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const anonKey = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const describeLive = supabaseUrl && anonKey && serviceRoleKey ? describe : describe.skip;

describeLive('legal privacy live contract', () => {
  it('keeps social retention purge privileged and callable by the service role', async () => {
    const anonymous = createClient<Database>(supabaseUrl!, anonKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const service = createClient<Database>(supabaseUrl!, serviceRoleKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const denied = await anonymous.rpc('purge_expired_social_data');
    expect(denied.error).not.toBeNull();

    const purged = await service.rpc('purge_expired_social_data');
    expect(purged.error).toBeNull();
    expect(purged.data).toBe(0);
  });
});
