/**
 * Supabase Client Configuration
 *
 * This file sets up the Supabase client for database operations.
 */

import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

// Environment variables
const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn(
    '[Supabase] Online features are disabled. Set VITE_PUBLIC_SUPABASE_URL and VITE_PUBLIC_SUPABASE_ANON_KEY to enable them.',
  );
}

// Repositories share one client. The non-empty offline values prevent an
// invalid empty-key client while route/auth logic keeps network calls disabled.
export const supabase = createClient<Database>(
  supabaseUrl || 'http://127.0.0.1:54321',
  supabaseAnonKey || 'offline-anon-key',
);
