/**
 * Supabase Auth Repository Implementation
 * 
 * Implements IAuthRepository using Supabase client.
 * This class handles all authentication operations.
 */

import type { SupabaseClient, User, Session } from '@supabase/supabase-js';
import type { IAuthRepository, AuthResponseResult, SignUpMetadata } from '../interfaces/IAuthRepository';

export class SupabaseAuthRepository implements IAuthRepository {
  private supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async signUp(
    email: string,
    password: string,
    metadata?: SignUpMetadata
  ): Promise<AuthResponseResult> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: metadata,
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
      user: data.user,
      session: data.session,
      error: error,
    };
  }

  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
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

  onAuthStateChange(
    callback: (event: string, session: Session | null) => void
  ): { subscription: any } {
    const { data: subscription } = this.supabase.auth.onAuthStateChange(callback);
    return { subscription };
  }
}