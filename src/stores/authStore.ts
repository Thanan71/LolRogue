/**
 * Auth Store -- Zustand store for authentication state.
 * Manages user session, login/logout, and syncs with Supabase auth.
 */

import { create } from 'zustand';
import { supabase, getPlayer, updatePlayer } from '@/services/supabaseClient';
import type { User } from '@supabase/supabase-js';
import type { Player } from '@/types/database';

export interface AuthState {
  user: User | null;
  player: Player | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, username: string, displayName?: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshPlayer: () => Promise<void>;
  clearError: () => void;
  checkSession: () => Promise<void>;
}

export type AuthStore = AuthState & AuthActions;

const INITIAL_STATE: AuthState = {
  user: null,
  player: null,
  isLoading: true,
  isAuthenticated: false,
  error: null,
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...INITIAL_STATE,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        // Fetch player data
        const { data: playerData } = await getPlayer(data.user.id);
        
        // Update last login
        if (playerData) {
          await updatePlayer(data.user.id, { last_login_at: new Date().toISOString() });
        }

        set({
          user: data.user,
          player: playerData || null,
          isAuthenticated: true,
          isLoading: false,
        });

        return { success: true };
      }

      throw new Error('No user data returned');
    } catch (error: any) {
      set({ 
        isLoading: false, 
        error: error.message || 'Login failed',
        isAuthenticated: false 
      });
      return { success: false, error: error.message };
    }
  },

  signUp: async (email: string, password: string, username: string, displayName?: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            username,
            display_name: displayName || username,
          },
        },
      });

      if (error) throw error;

      if (data.user) {
        // The handle_new_user trigger should create the player record
        // But we'll wait a moment and then fetch it
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const { data: playerData } = await getPlayer(data.user.id);

        set({
          user: data.user,
          player: playerData || null,
          isAuthenticated: true,
          isLoading: false,
        });

        return { success: true };
      }

      throw new Error('No user data returned');
    } catch (error: any) {
      set({ 
        isLoading: false, 
        error: error.message || 'Sign up failed',
        isAuthenticated: false 
      });
      return { success: false, error: error.message };
    }
  },

  logout: async () => {
    set({ isLoading: true });
    try {
      await supabase.auth.signOut();
      set({
        user: null,
        player: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      set({ 
        isLoading: false, 
        error: error.message || 'Logout failed' 
      });
    }
  },

  refreshPlayer: async () => {
    const { user } = get();
    if (!user) return;

    try {
      const { data: playerData } = await getPlayer(user.id);
      set({ player: playerData || null });
    } catch (error) {
      console.error('[AuthStore] Failed to refresh player:', error);
    }
  },

  clearError: () => {
    set({ error: null });
  },

  checkSession: async () => {
    // Don't set isLoading if we're already loading (from login/signup)
    const currentState = get();
    if (!currentState.isLoading) {
      set({ isLoading: true });
    }
    
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (session?.user) {
        const { data: playerData } = await getPlayer(session.user.id);
        
        // Update last login
        if (playerData) {
          await updatePlayer(session.user.id, { last_login_at: new Date().toISOString() });
        }

        set({
          user: session.user,
          player: playerData || null,
          isAuthenticated: true,
          isLoading: false,
        });
      } else {
        set({
          user: null,
          player: null,
          isAuthenticated: false,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('[AuthStore] Session check failed:', error);
      set({
        user: null,
        player: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  },
}));

// Set up auth state change listener
// Only update state on explicit events, don't override during login/signup flow
supabase.auth.onAuthStateChange(async (event, session) => {
  const currentState = useAuthStore.getState();
  
  // Skip if we're already in the middle of a login/signup operation
  if (currentState.isLoading) {
    return;
  }

  if (event === 'SIGNED_IN' && session?.user) {
    // Only update if not already authenticated with this user
    if (currentState.user?.id !== session.user.id) {
      const { data: playerData } = await getPlayer(session.user.id);
      useAuthStore.setState({
        user: session.user,
        player: playerData || null,
        isAuthenticated: true,
        isLoading: false,
      });
    }
  } else if (event === 'SIGNED_OUT') {
    useAuthStore.setState({
      user: null,
      player: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  } else if (event === 'TOKEN_REFRESHED' && session?.user) {
    // Update user session but don't change loading state
    useAuthStore.setState({
      user: session.user,
    });
  } else if (event === 'USER_UPDATED' && session?.user) {
    // Refresh player data on user update
    const { data: playerData } = await getPlayer(session.user.id);
    useAuthStore.setState({
      player: playerData || null,
    });
  }
});
