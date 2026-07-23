/**
 * Auth Store -- Zustand store for authentication state.
 * Manages user session, login/logout, and syncs with Supabase auth.
 *
 * Uses the repository pattern for data access, following SOLID principles.
 * Dependencies are injected via the container for better testability.
 */

import type { User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { RepositoryContainerFactory } from '@/services/container';
import type { IRepositoryContainer } from '@/services/interfaces';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';
import type { Player } from '@/types/models';

// Create repository container for dependency injection
const container: IRepositoryContainer = RepositoryContainerFactory.create(supabase);

export interface AuthState {
  user: User | null;
  player: Player | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  isInitialized: boolean;
  isAdmin: boolean;
  error: string | null;
  successMessage: string | null;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (
    email: string,
    password: string,
    username: string,
    displayName?: string,
  ) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  refreshPlayer: () => Promise<void>;
  clearError: () => void;
  clearSuccessMessage: () => void;
  checkSession: () => Promise<void>;
  checkAdminStatus: () => Promise<boolean>;
  enterGuestMode: () => void;
  exitGuestMode: () => void;
}

export type AuthStore = AuthState & AuthActions;

const GUEST_MODE_KEY = 'lolrogue-guest-mode';

function readGuestMode(): boolean {
  return typeof window !== 'undefined' && window.localStorage.getItem(GUEST_MODE_KEY) === 'true';
}

function setStoredGuestMode(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  if (enabled) {
    window.localStorage.setItem(GUEST_MODE_KEY, 'true');
  } else {
    window.localStorage.removeItem(GUEST_MODE_KEY);
  }
}

const INITIAL_STATE: AuthState = {
  user: null,
  player: null,
  isLoading: true,
  isAuthenticated: false,
  isGuest: readGuestMode(),
  isInitialized: false,
  isAdmin: false,
  error: null,
  successMessage: null,
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...INITIAL_STATE,

  enterGuestMode: () => {
    setStoredGuestMode(true);
    set({
      user: null,
      player: null,
      isAuthenticated: false,
      isGuest: true,
      isAdmin: false,
      isLoading: false,
      isInitialized: true,
      error: null,
    });
  },

  exitGuestMode: () => {
    setStoredGuestMode(false);
    set({ isGuest: false });
  },

  checkAdminStatus: async () => {
    const { user, player } = get();
    if (!user || !player) {
      set({ isAdmin: false });
      return false;
    }

    // Check if player has admin flag
    const isAdmin = player.is_admin === true;
    set({ isAdmin });
    return isAdmin;
  },

  login: async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      const error = 'Supabase is not configured. Guest mode is still available.';
      set({ error, isLoading: false, isInitialized: true });
      return { success: false, error };
    }
    activeAuthOperation = 'login';
    lastAuthOperationTimestamp = Date.now();
    set({ isLoading: true, error: null });
    try {
      const result = await container.auth.signIn(email, password);

      if (result.error) throw result.error;

      if (result.user) {
        // Fetch player data using repository
        const { data: playerData } = await container.player.getPlayer(result.user.id);

        // Update last login using repository
        if (playerData) {
          await container.player.updatePlayer(result.user.id, {
            last_login_at: new Date().toISOString(),
          });
        }

        // Check admin status
        const isAdmin = playerData?.is_admin === true;

        set({
          user: result.user,
          player: playerData || null,
          isAuthenticated: true,
          isGuest: false,
          isInitialized: true,
          isAdmin,
          isLoading: false,
        });
        setStoredGuestMode(false);

        return { success: true };
      }

      throw new Error('No user data returned');
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Login failed',
        isAuthenticated: false,
      });
      return { success: false, error: error.message };
    } finally {
      activeAuthOperation = null;
    }
  },

  signUp: async (email: string, password: string, username: string, displayName?: string) => {
    if (!isSupabaseConfigured) {
      const error = 'Supabase is not configured. Guest mode is still available.';
      set({ error, isLoading: false, isInitialized: true });
      return { success: false, error };
    }
    activeAuthOperation = 'signup';
    lastAuthOperationTimestamp = Date.now();
    set({ isLoading: true, error: null });
    try {
      const result = await container.auth.signUp(email, password, {
        username,
        display_name: displayName || username,
      });

      if (result.error) throw result.error;

      if (result.user) {
        // LolRogue does not use confirmation emails. Supabase must return a
        // session immediately after signup.
        if (!result.session) {
          throw new Error(
            'Signup did not return a session. Disable Confirm email in Supabase Auth settings.',
          );
        }

        // Wait for the database trigger to create the player profile.
        let playerData = null;
        const maxRetries = 10;
        const retryDelay = 300;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          const { data, error } = await container.player.getPlayer(result.user.id);

          if (data) {
            playerData = data;
            break;
          }

          if (error && error.message !== 'No rows found') {
            console.warn(
              `[AuthStore] Attempt ${attempt + 1}/${maxRetries}: Error fetching player:`,
              error.message,
            );
          }

          if (attempt === maxRetries - 1 && !playerData) {
            console.error(
              '[AuthStore] Player record not created after signup. Trigger is failing.',
            );

            set({
              isLoading: false,
              error:
                'Account created but player profile could not be initialized. Please try logging in.',
              isAuthenticated: false,
            });
            return {
              success: false,
              error: 'Player profile initialization failed. Please try logging in.',
            };
          }
        }

        const isAdmin = playerData?.is_admin === true;

        set({
          user: result.user,
          player: playerData || null,
          isAuthenticated: true,
          isGuest: false,
          isInitialized: true,
          isAdmin,
          isLoading: false,
        });
        setStoredGuestMode(false);

        return { success: true };
      }

      throw new Error('No user data returned');
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Sign up failed',
        isAuthenticated: false,
      });
      return { success: false, error: error.message };
    } finally {
      activeAuthOperation = null;
    }
  },

  logout: async () => {
    activeAuthOperation = 'logout';
    lastAuthOperationTimestamp = Date.now();
    set({ isLoading: true });
    try {
      if (isSupabaseConfigured) {
        await container.auth.signOut();
      }
      setStoredGuestMode(false);
      set({
        user: null,
        player: null,
        isAuthenticated: false,
        isGuest: false,
        isInitialized: true,
        isAdmin: false,
        isLoading: false,
        error: null,
      });
    } catch (error: any) {
      set({
        isLoading: false,
        error: error.message || 'Logout failed',
      });
    } finally {
      activeAuthOperation = null;
    }
  },

  refreshPlayer: async () => {
    const { user } = get();
    if (!user) return;

    try {
      const { data: playerData } = await container.player.getPlayer(user.id);
      const isAdmin = playerData?.is_admin === true;
      set({ player: playerData || null, isAdmin });
    } catch (error) {
      console.error('[AuthStore] Failed to refresh player:', error);
    }
  },

  clearError: () => {
    set({ error: null });
  },

  clearSuccessMessage: () => {
    set({ successMessage: null });
  },

  checkSession: async () => {
    if (!isSupabaseConfigured) {
      set({
        user: null,
        player: null,
        isAuthenticated: false,
        isAdmin: false,
        isLoading: false,
        isInitialized: true,
      });
      return;
    }
    // Don't set isLoading if we're already loading (from login/signup)
    const currentState = get();
    if (!currentState.isLoading) {
      set({ isLoading: true });
    }

    try {
      const { session } = await container.auth.getSession();

      if (session?.user) {
        const { data: playerData } = await container.player.getPlayer(session.user.id);

        // Update last login using repository
        if (playerData) {
          await container.player.updatePlayer(session.user.id, {
            last_login_at: new Date().toISOString(),
          });
        }

        // Check admin status
        const isAdmin = playerData?.is_admin === true;

        set({
          user: session.user,
          player: playerData || null,
          isAuthenticated: true,
          isGuest: false,
          isInitialized: true,
          isAdmin,
          isLoading: false,
        });
        setStoredGuestMode(false);
      } else {
        set({
          user: null,
          player: null,
          isAuthenticated: false,
          isGuest: get().isGuest,
          isInitialized: true,
          isAdmin: false,
          isLoading: false,
        });
      }
    } catch (error) {
      console.error('[AuthStore] Session check failed:', error);
      set({
        user: null,
        player: null,
        isAuthenticated: false,
        isGuest: get().isGuest,
        isInitialized: true,
        isAdmin: false,
        isLoading: false,
      });
    }
  },
}));

// Track active auth operations to prevent race conditions
let activeAuthOperation: 'login' | 'signup' | 'logout' | null = null;
let lastAuthOperationTimestamp = 0;
const RACE_CONDITION_WINDOW_MS = 2000; // Window to ignore listener after operation

// Set up auth state change listener
// Only update state on explicit events, don't override during login/signup flow
container.auth.onAuthStateChange(async (event, session) => {
  const now = Date.now();
  const currentState = useAuthStore.getState();

  // Skip if we're actively in a login/signup/logout operation
  if (activeAuthOperation) {
    // If the operation started recently, skip to avoid race condition
    if (now - lastAuthOperationTimestamp < RACE_CONDITION_WINDOW_MS) {
      return;
    }
    // If the operation was too long ago, clear it (safety mechanism)
    activeAuthOperation = null;
  }

  // Skip if we're in a loading state from a recent operation
  if (currentState.isLoading && now - lastAuthOperationTimestamp < RACE_CONDITION_WINDOW_MS) {
    return;
  }

  if (event === 'SIGNED_IN' && session?.user) {
    // Only update if not already authenticated with this user
    if (currentState.user?.id !== session.user.id) {
      const { data: playerData } = await container.player.getPlayer(session.user.id);
      const isAdmin = playerData?.is_admin === true;
      useAuthStore.setState({
        user: session.user,
        player: playerData || null,
        isAuthenticated: true,
        isGuest: false,
        isInitialized: true,
        isAdmin,
        isLoading: false,
      });
      setStoredGuestMode(false);
    }
  } else if (event === 'SIGNED_OUT') {
    useAuthStore.setState({
      user: null,
      player: null,
      isAuthenticated: false,
      isGuest: currentState.isGuest,
      isInitialized: true,
      isAdmin: false,
      isLoading: false,
      error: null,
    });
  } else if (event === 'TOKEN_REFRESHED' && session?.user) {
    // Update user session but don't change loading state
    // Only update if the session is different to avoid unnecessary re-renders
    if (currentState.user?.id !== session.user.id) {
      useAuthStore.setState({
        user: session.user,
      });
    }
  } else if (event === 'USER_UPDATED' && session?.user) {
    // Refresh player data on user update
    const { data: playerData } = await container.player.getPlayer(session.user.id);
    const isAdmin = playerData?.is_admin === true;
    useAuthStore.setState({
      player: playerData || null,
      isAdmin,
    });
  }
});
