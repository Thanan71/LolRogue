import type { Session, Subscription, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { RepositoryContainerFactory } from '@/services/container';
import type { IRepositoryContainer } from '@/services/interfaces';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';
import { useMasteryStore } from '@/stores/masteryStore';
import type { Player } from '@/types/models';
import { safeLocalStorage } from '@/utils/persistence';

const container: IRepositoryContainer = RepositoryContainerFactory.create(supabase);
const GUEST_MODE_KEY = 'lolrogue-guest-mode';

export type AuthStatus =
  | 'bootstrapping'
  | 'profileLoading'
  | 'ready'
  | 'profileUnavailable'
  | 'guest'
  | 'signedOut';

export interface AuthActionResult {
  success: boolean;
  error?: string;
}

export interface AuthState {
  session: Session | null;
  user: User | null;
  player: Player | null;
  authStatus: AuthStatus;
  isLoading: boolean;
  isAuthenticated: boolean;
  isGuest: boolean;
  isInitialized: boolean;
  isAdmin: boolean;
  error: string | null;
  successMessage: string | null;
}

export interface AuthActions {
  login: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (
    email: string,
    password: string,
    username: string,
    displayName?: string,
  ) => Promise<AuthActionResult>;
  logout: () => Promise<AuthActionResult>;
  refreshPlayer: () => Promise<AuthActionResult>;
  clearError: () => void;
  clearSuccessMessage: () => void;
  checkSession: () => Promise<void>;
  checkAdminStatus: () => Promise<boolean>;
  enterGuestMode: () => Promise<AuthActionResult>;
  exitGuestMode: () => Promise<AuthActionResult>;
  subscribeToAuthChanges: () => () => void;
}

export type AuthStore = AuthState & AuthActions;

let identityGeneration = 0;
let authSubscription: Subscription | null = null;

function nextGeneration(): number {
  identityGeneration += 1;
  return identityGeneration;
}

function isCurrent(generation: number): boolean {
  return generation === identityGeneration;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function getAuthErrorMessage(error: unknown): string {
  const message = getErrorMessage(error);
  if (/invalid login credentials/i.test(message)) return 'Identifiants incorrects.';
  if (/user.*not found|invalid.*email|invalid email/i.test(message)) {
    return 'E-mail ou mot de passe invalide.';
  }
  if (/unconfirmed|confirm.*email|email.*not.*confirmed/i.test(message)) {
    return 'Veuillez confirmer votre adresse e-mail avant de vous connecter.';
  }
  if (/network|failed to fetch|request failed/i.test(message)) {
    return 'Erreur réseau. Vérifiez votre connexion et réessayez.';
  }
  return message || 'Une erreur est survenue lors de la connexion.';
}

function readGuestMode(): boolean {
  const value = safeLocalStorage.getItem(GUEST_MODE_KEY);
  return typeof value === 'string' && value === 'true';
}

function setStoredGuestMode(enabled: boolean): void {
  if (enabled) safeLocalStorage.setItem(GUEST_MODE_KEY, 'true');
  else safeLocalStorage.removeItem(GUEST_MODE_KEY);
}

async function resetProgressionCaches(target: 'guest' | 'signed-out'): Promise<void> {
  if (target === 'guest') useMasteryStore.getState().activateGuestScope();
  else useMasteryStore.getState().clearSession();
  const { useEnhancementStore } = await import('@/stores/enhancementStore');
  useEnhancementStore.getState().reset();
}

async function hydrateAuthenticatedProgression(userId: string, player: Player): Promise<void> {
  useMasteryStore.getState().activateAuthenticatedScope(userId);
  const { useEnhancementStore } = await import('@/stores/enhancementStore');
  useEnhancementStore.getState().reset();
  await useEnhancementStore.getState().initialize(userId, player.total_candies);
  if (!useMasteryStore.getState().isHydrated) {
    throw new Error('La maîtrise du compte n’a pas pu être chargée.');
  }
}

async function waitForPlayer(userId: string, retries = 8): Promise<Player> {
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    const result = await container.player.getPlayer(userId);
    if (result.data) return result.data;
    lastError = result.error;
    if (attempt + 1 < retries) await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw lastError ?? new Error('Le profil joueur est indisponible. Réessayez.');
}

async function withLastLogin(player: Player): Promise<Player> {
  const result = await container.player.touchLastLogin();
  return result.data ? { ...player, last_login_at: result.data } : player;
}

async function hasBlockingRun(targetUserId: string | null): Promise<boolean> {
  const { useRunStore } = await import('@/stores/runStore');
  const run = useRunStore.getState();
  if (!run.isActive && !run.isEnding) return false;
  const owner = run.authorityAttempt?.ownerUserId ?? null;
  return owner !== targetUserId || targetUserId === null;
}

const guestAtStartup = readGuestMode();
const INITIAL_STATE: AuthState = {
  session: null,
  user: null,
  player: null,
  authStatus: 'bootstrapping',
  isLoading: true,
  isAuthenticated: false,
  isGuest: guestAtStartup,
  isInitialized: false,
  isAdmin: false,
  error: null,
  successMessage: null,
};

async function establishSession(session: Session, generation: number): Promise<AuthActionResult> {
  if (await hasBlockingRun(session.user.id)) {
    return {
      success: false,
      error: 'Terminez ou abandonnez la run active avant de changer de compte.',
    };
  }
  if (!isCurrent(generation)) return { success: false, error: 'Session obsolète.' };
  useAuthStore.setState({
    session,
    user: session.user,
    player: null,
    authStatus: 'profileLoading',
    isLoading: true,
    isInitialized: false,
    isAuthenticated: false,
    isGuest: false,
    isAdmin: false,
    error: null,
  });
  try {
    const player = await waitForPlayer(session.user.id);
    if (!isCurrent(generation)) return { success: false, error: 'Session obsolète.' };
    const refreshedPlayer = await withLastLogin(player);
    await hydrateAuthenticatedProgression(session.user.id, refreshedPlayer);
    if (!isCurrent(generation)) return { success: false, error: 'Session obsolète.' };
    setStoredGuestMode(false);
    useAuthStore.setState({
      session,
      user: session.user,
      player: refreshedPlayer,
      authStatus: 'ready',
      isLoading: false,
      isInitialized: true,
      isAuthenticated: true,
      isGuest: false,
      isAdmin: refreshedPlayer.is_admin === true,
      error: null,
    });
    return { success: true };
  } catch (error) {
    if (!isCurrent(generation)) return { success: false, error: 'Session obsolète.' };
    await resetProgressionCaches('signed-out');
    const message = getAuthErrorMessage(error);
    useAuthStore.setState({
      session,
      user: session.user,
      player: null,
      authStatus: 'profileUnavailable',
      isLoading: false,
      isInitialized: true,
      isAuthenticated: false,
      isGuest: false,
      isAdmin: false,
      error: message,
    });
    return { success: false, error: message };
  }
}

async function establishSignedOut(generation: number, preserveGuest: boolean): Promise<void> {
  await resetProgressionCaches(preserveGuest ? 'guest' : 'signed-out');
  if (!isCurrent(generation)) return;
  useAuthStore.setState({
    session: null,
    user: null,
    player: null,
    authStatus: preserveGuest ? 'guest' : 'signedOut',
    isLoading: false,
    isInitialized: true,
    isAuthenticated: false,
    isGuest: preserveGuest,
    isAdmin: false,
  });
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...INITIAL_STATE,

  login: async (email, password) => {
    if (!isSupabaseConfigured) {
      const error = 'Supabase is not configured. Guest mode is still available.';
      set({ error, isLoading: false, isInitialized: true, authStatus: 'signedOut' });
      return { success: false, error };
    }
    const generation = nextGeneration();
    set({ authStatus: 'bootstrapping', isLoading: true, isInitialized: false, error: null });
    try {
      const result = await container.auth.signIn(email, password);
      if (result.error) throw result.error;
      if (!result.session) throw new Error('No session data returned');
      return await establishSession(result.session, generation);
    } catch (error) {
      if (!isCurrent(generation)) return { success: false, error: 'Session obsolète.' };
      const message = getAuthErrorMessage(error);
      await establishSignedOut(generation, false);
      set({ error: message });
      return { success: false, error: message };
    }
  },

  signUp: async (email, password, username, displayName) => {
    if (!isSupabaseConfigured) {
      const error = 'Supabase is not configured. Guest mode is still available.';
      set({ error, isLoading: false, isInitialized: true, authStatus: 'signedOut' });
      return { success: false, error };
    }
    const generation = nextGeneration();
    set({ authStatus: 'bootstrapping', isLoading: true, isInitialized: false, error: null });
    try {
      const result = await container.auth.signUp(email, password, {
        username,
        display_name: displayName || username,
      });
      if (result.error) throw result.error;
      if (!result.session) {
        throw new Error(
          'Signup did not return a session. Disable Confirm email in Supabase Auth settings.',
        );
      }
      return await establishSession(result.session, generation);
    } catch (error) {
      if (!isCurrent(generation)) return { success: false, error: 'Session obsolète.' };
      const message = getAuthErrorMessage(error);
      await establishSignedOut(generation, false);
      set({ error: message });
      return { success: false, error: message };
    }
  },

  logout: async () => {
    if (await hasBlockingRun(null)) {
      const error = 'Terminez ou abandonnez la run active avant de vous déconnecter.';
      set({ error });
      return { success: false, error };
    }
    const generation = nextGeneration();
    set({ isLoading: true, error: null });
    try {
      if (isSupabaseConfigured) await container.auth.signOut();
      setStoredGuestMode(false);
      await establishSignedOut(generation, false);
      return { success: true };
    } catch (error) {
      if (!isCurrent(generation)) return { success: false, error: 'Session obsolète.' };
      const message = getAuthErrorMessage(error);
      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  enterGuestMode: async () => {
    if (await hasBlockingRun(null)) {
      const error = 'Terminez ou abandonnez la run active avant de passer en invité.';
      set({ error });
      return { success: false, error };
    }
    const generation = nextGeneration();
    set({ isLoading: true, isInitialized: false, error: null });
    await resetProgressionCaches('guest');
    if (!isCurrent(generation)) return { success: false, error: 'Session obsolète.' };
    setStoredGuestMode(true);
    set({
      session: null,
      user: null,
      player: null,
      authStatus: 'guest',
      isAuthenticated: false,
      isGuest: true,
      isAdmin: false,
      isLoading: false,
      isInitialized: true,
      error: null,
    });
    return { success: true };
  },

  exitGuestMode: async () => {
    if (await hasBlockingRun(null)) {
      const error = 'Terminez ou abandonnez la run active avant de quitter le mode invité.';
      set({ error });
      return { success: false, error };
    }
    const generation = nextGeneration();
    setStoredGuestMode(false);
    await establishSignedOut(generation, false);
    return { success: true };
  },

  refreshPlayer: async () => {
    const { session } = get();
    if (!session) return { success: false, error: 'Aucune session active.' };
    return establishSession(session, nextGeneration());
  },

  checkSession: async () => {
    const generation = nextGeneration();
    set({ authStatus: 'bootstrapping', isLoading: true, isInitialized: false });
    if (!isSupabaseConfigured) {
      await establishSignedOut(generation, get().isGuest);
      return;
    }
    try {
      const result = await container.auth.getSession();
      if (result.error) throw result.error;
      if (result.session) await establishSession(result.session, generation);
      else await establishSignedOut(generation, get().isGuest);
    } catch (error) {
      if (!isCurrent(generation)) return;
      const message = getAuthErrorMessage(error);
      await establishSignedOut(generation, get().isGuest);
      set({ error: message });
    }
  },

  checkAdminStatus: async () => {
    const admin = get().authStatus === 'ready' && get().player?.is_admin === true;
    set({ isAdmin: admin });
    return admin;
  },

  clearError: () => set({ error: null }),
  clearSuccessMessage: () => set({ successMessage: null }),

  subscribeToAuthChanges: () => {
    authSubscription?.unsubscribe();
    const result = container.auth.onAuthStateChange((event, session) => {
      if (event === 'TOKEN_REFRESHED' && session && session.user.id === get().user?.id) {
        set({ session, user: session.user });
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (!session) return;
        void establishSession(session, nextGeneration());
        return;
      }
      if (event === 'SIGNED_OUT') {
        const generation = nextGeneration();
        void establishSignedOut(generation, get().isGuest);
      }
    });
    authSubscription = result.subscription;
    return () => {
      if (authSubscription === result.subscription) authSubscription = null;
      result.subscription.unsubscribe();
    };
  },
}));
