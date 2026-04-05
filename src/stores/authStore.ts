/**
 * Auth Store -- Zustand store for authentication state.
 * Manages user session, login/logout, and syncs with Supabase auth.
 * 
 * Uses the repository pattern for data access, following SOLID principles.
 * Dependencies are injected via the container for better testability.
 */

import { create } from 'zustand';
import { supabase } from '@/services/supabaseClient';
import { RepositoryContainerFactory } from '@/services/container';
import type { User } from '@supabase/supabase-js';
import type { Player } from '@/types/database';
import type { IRepositoryContainer } from '@/services/interfaces';

// Create repository container for dependency injection
const container: IRepositoryContainer = RepositoryContainerFactory.create(supabase);

export interface AuthState {
  user: User | null;
  player: Player | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  error: string | null;
  successMessage: string | null;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, username: string, displayName?: string) => Promise<{ success: boolean; error?: string; needsConfirmation?: boolean }>;
  logout: () => Promise<void>;
  refreshPlayer: () => Promise<void>;
  clearError: () => void;
  clearSuccessMessage: () => void;
  checkSession: () => Promise<void>;
  checkAdminStatus: () => Promise<boolean>;
}

export type AuthStore = AuthState & AuthActions;

const INITIAL_STATE: AuthState = {
  user: null,
  player: null,
  isLoading: true,
  isAuthenticated: false,
  isAdmin: false,
  error: null,
  successMessage: null,
};

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...INITIAL_STATE,

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
    set({ isLoading: true, error: null });
    try {
      const result = await container.auth.signIn(email, password);

      if (result.error) throw result.error;

      if (result.user) {
        // Fetch player data using repository
        const { data: playerData } = await container.player.getPlayer(result.user.id);
        
        // Update last login using repository
        if (playerData) {
          await container.player.updatePlayer(result.user.id, { last_login_at: new Date().toISOString() });
        }

        // Check admin status
        const isAdmin = playerData?.is_admin === true;

        set({
          user: result.user,
          player: playerData || null,
          isAuthenticated: true,
          isAdmin,
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
      const result = await container.auth.signUp(email, password, { username, display_name: displayName || username });

      if (result.error) throw result.error;

      if (result.user) {
        // Vérifier si l'email doit être confirmé
        // Si email_confirmed_at est null, l'utilisateur doit confirmer son email
        const needsEmailConfirmation = !result.user.email_confirmed_at;
        
        if (needsEmailConfirmation) {
          // L'utilisateur doit confirmer son email avant de se connecter
          // Le player sera créé après la confirmation via le trigger ou le listener
          set({
            user: result.user,
            player: null,
            isAuthenticated: false, // Pas encore authentifié tant que l'email n'est pas confirmé
            isAdmin: false,
            isLoading: false,
            error: null,
            successMessage: 'Account created! Please check your email and click the confirmation link to complete your registration.',
          });
          
          return { 
            success: false, 
            needsConfirmation: true 
          };
        }

        // Si pas de confirmation email requise, attendre que le trigger crée le player
        let playerData = null;
        const maxRetries = 10;
        const retryDelay = 300;
        
        for (let attempt = 0; attempt < maxRetries; attempt++) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          const { data, error } = await container.player.getPlayer(result.user.id);
          
          if (data) {
            playerData = data;
            break;
          }
          
          if (error && error.message !== 'No rows found') {
            console.warn(`[AuthStore] Attempt ${attempt + 1}/${maxRetries}: Error fetching player:`, error.message);
          }
          
          if (attempt === maxRetries - 1 && !playerData) {
            console.error('[AuthStore] Player record not created after signup. Trigger is failing.');
            
            set({ 
              isLoading: false, 
              error: 'Account created but player profile could not be initialized. Please try logging in.',
              isAuthenticated: false 
            });
            return { success: false, error: 'Player profile initialization failed. Please try logging in.' };
          }
        }

        const isAdmin = playerData?.is_admin === true;

        set({
          user: result.user,
          player: playerData || null,
          isAuthenticated: true,
          isAdmin,
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
      await container.auth.signOut();
      set({
        user: null,
        player: null,
        isAuthenticated: false,
        isAdmin: false,
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
          await container.player.updatePlayer(session.user.id, { last_login_at: new Date().toISOString() });
        }

        // Check admin status
        const isAdmin = playerData?.is_admin === true;

        set({
          user: session.user,
          player: playerData || null,
          isAuthenticated: true,
          isAdmin,
          isLoading: false,
        });
      } else {
        set({
          user: null,
          player: null,
          isAuthenticated: false,
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
        isAdmin: false,
        isLoading: false,
      });
    }
  },
}));

// Set up auth state change listener
// Only update state on explicit events, don't override during login/signup flow
container.auth.onAuthStateChange(async (event, session) => {
  const currentState = useAuthStore.getState();
  
  // Skip if we're already in the middle of a login/signup operation
  if (currentState.isLoading) {
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
        isAdmin,
        isLoading: false,
      });
    }
  } else if (event === 'SIGNED_OUT') {
    useAuthStore.setState({
      user: null,
      player: null,
      isAuthenticated: false,
      isAdmin: false,
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
    const { data: playerData } = await container.player.getPlayer(session.user.id);
    const isAdmin = playerData?.is_admin === true;
    useAuthStore.setState({
      player: playerData || null,
      isAdmin,
    });
  }
});