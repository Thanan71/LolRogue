/**
 * Auth Repository Interface
 * 
 * Defines the contract for authentication operations.
 * Follows the Repository pattern for dependency inversion.
 */

import type { User, Session } from '@supabase/supabase-js';

export interface SignUpMetadata {
  username?: string;
  display_name?: string;
}

export interface AuthResponseResult {
  user: User | null;
  session: Session | null;
  error: Error | null;
}

export interface IAuthRepository {
  /**
   * Sign up a new user
   */
  signUp(
    email: string,
    password: string,
    metadata?: SignUpMetadata
  ): Promise<AuthResponseResult>;

  /**
   * Sign in a user
   */
  signIn(email: string, password: string): Promise<AuthResponseResult>;

  /**
   * Sign out the current user
   */
  signOut(): Promise<void>;

  /**
   * Get the current user session
   */
  getSession(): Promise<{ session: Session | null; error: Error | null }>;

  /**
   * Get the current user
   */
  getCurrentUser(): Promise<User | null>;

  /**
   * Subscribe to auth state changes
   */
  onAuthStateChange(
    callback: (event: string, session: Session | null) => void
  ): { subscription: any };
}