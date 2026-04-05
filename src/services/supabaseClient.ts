/**
 * Supabase Client Configuration
 * 
 * This file sets up the Supabase client for database operations.
 */

import { createClient } from '@supabase/supabase-js';

// Extend ImportMetaEnv for Vite
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Environment variables
const supabaseUrl = (import.meta as unknown as ImportMeta).env.VITE_SUPABASE_URL;
const supabaseAnonKey = (import.meta as unknown as ImportMeta).env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '[Supabase] Missing environment variables. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.'
  );
}

// Create Supabase client
export const supabase = createClient(
  supabaseUrl || 'https://curffughsmpukeprryaq.supabase.co',
  supabaseAnonKey || ''
);