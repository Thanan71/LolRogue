/**
 * Supabase Auth Repository Implementation
 *
 * Implements IAuthRepository using Supabase client.
 * This class handles all authentication operations.
 */

import type { Session, Subscription, SupabaseClient, User } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type {
  AuthResponseResult,
  IAuthRepository,
  SignUpMetadata,
} from '../interfaces/IAuthRepository';

function getEmailRedirectTo(): string | undefined {
  if (typeof window === 'undefined' || !window.location?.origin) return undefined;
  return `${window.location.origin}/`;
}

export class SupabaseAuthRepository implements IAuthRepository {
  private supabase: SupabaseClient<Database>;

  constructor(supabase: SupabaseClient<Database>) {
    this.supabase = supabase;
  }

  async signUp(
    email: string,
    password: string,
    metadata?: SignUpMetadata,
  ): Promise<AuthResponseResult> {
    const emailRedirectTo = getEmailRedirectTo();
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
        ...(emailRedirectTo ? { emailRedirectTo } : {}),
      },
    });

    return {
      user: data.user,
      session: data.session,
      error: error,
    };
  }

  async signIn(email: string, password: string): Promise<AuthResponseResult> {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    return {
      user: data?.user ?? null,
      session: data?.session ?? null,
      error: error ?? null,
    };
  }

  async signOut(): Promise<void> {
    const { error } = await this.supabase.auth.signOut();
    if (error) throw error;
  }

  async getSession(): Promise<{ session: Session | null; error: Error | null }> {
    const { data, error } = await this.supabase.auth.getSession();
    return {
      session: data.session,
      error: error,
    };
  }

  async getCurrentUser(): Promise<User | null> {
    const { data, error } = await this.supabase.auth.getUser();
    if (error || !data.user) {
      return null;
    }
    return data.user;
  }

  onAuthStateChange(callback: (event: string, session: Session | null) => void): {
    subscription: Subscription;
  } {
    const { data } = this.supabase.auth.onAuthStateChange(callback);
    return { subscription: data.subscription };
  }
}
