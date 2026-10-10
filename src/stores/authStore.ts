import type { Session, Subscription, User } from '@supabase/supabase-js';
import { create } from 'zustand';
import { initialPasswordRecovery } from '@/auth/passwordRecovery';
import { authRecoveryCopy } from '@/i18n/authRecoveryContent';
import { fr } from '@/i18n/fr';
import { RepositoryContainerFactory } from '@/services/container';
import type { IRepositoryContainer } from '@/services/interfaces';
import { isSupabaseConfigured, supabase } from '@/services/supabaseClient';
import { useChampionEconomyStore } from '@/stores/championEconomyStore';
import { useMasteryStore } from '@/stores/masteryStore';
import type { Player } from '@/types/models';
import { readGuestMode, setStoredGuestMode } from '@/utils/ancillaryStorage';

const container: IRepositoryContainer = RepositoryContainerFactory.create(supabase);

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
  isPasswordRecovery: boolean;
  isRecoveryLoading: boolean;
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
  setPlayerCandyBalance: (candies: number) => void;
  clearError: () => void;
  clearSuccessMessage: () => void;
  checkSession: () => Promise<void>;
  checkAdminStatus: () => Promise<boolean>;
  enterGuestMode: () => Promise<AuthActionResult>;
  exitGuestMode: () => Promise<AuthActionResult>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  updateRecoveredPassword: (password: string) => Promise<AuthActionResult>;
  cancelPasswordRecovery: () => void;
  subscribeToAuthChanges: () => () => void;
}

export type AuthStore = AuthState & AuthActions;

let identityGeneration = 0;
let authSubscription: Subscription | null = null;
let recoveryCallbackPending = initialPasswordRecovery.requested;

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

export function localizeAuthError(error: unknown): string {
  const message = getErrorMessage(error);
  if (/invalid login credentials/i.test(message)) return fr.auth.invalidCredentials;
  if (/user.*not found|invalid.*email|invalid email/i.test(message)) {
    return fr.auth.invalidEmailOrPassword;
  }
  if (/unconfirmed|confirm.*email|email.*not.*confirmed/i.test(message)) {
    return fr.auth.emailUnconfirmed;
  }
  if (/already (?:been )?registered|user already exists/i.test(message)) {
    return fr.auth.userAlreadyRegistered;
  }
  if (/password.*(?:weak|least|characters)|weak password/i.test(message)) {
    return fr.auth.weakPassword;
  }
  if (/rate limit|too many requests/i.test(message)) return fr.auth.rateLimited;
  if (/duplicate key.*username|username.*already (?:exists|taken)/i.test(message)) {
    return fr.auth.usernameTaken;
  }
  if (/network|failed to fetch|request failed/i.test(message)) {
    return fr.auth.networkError;
  }
  if (
    [
      fr.auth.masteryUnavailable,
      fr.auth.profileUnavailable,
      fr.auth.missingSession,
      fr.auth.signupMissingSession,
    ].some((localizedMessage) => localizedMessage === message)
  ) {
    return message;
  }
  return fr.auth.genericError;
}

async function resetProgressionCaches(
  target: 'guest' | 'signed-out',
  generation: number,
): Promise<void> {
  if (!isCurrent(generation)) return;
  useChampionEconomyStore.getState().reset();
  if (target === 'guest') useMasteryStore.getState().activateGuestScope();
  else useMasteryStore.getState().clearSession();
  const { useEnhancementStore } = await import('@/stores/enhancementStore');
  if (!isCurrent(generation)) return;
  useEnhancementStore.getState().reset();
}

async function hydrateAuthenticatedProgression(
  userId: string,
  player: Player,
  generation: number,
): Promise<void> {
  if (!isCurrent(generation)) return;
  useChampionEconomyStore.getState().reset(userId);
  await useChampionEconomyStore.getState().initialize(userId);
  if (!isCurrent(generation)) return;
  useMasteryStore.getState().activateAuthenticatedScope(userId);
  const { useEnhancementStore } = await import('@/stores/enhancementStore');
  if (!isCurrent(generation)) return;
  useEnhancementStore.getState().reset();
  await useEnhancementStore.getState().initialize(userId, player.total_candies);
  if (!isCurrent(generation)) return;
  if (!useMasteryStore.getState().isHydrated) {
    throw new Error(fr.auth.masteryUnavailable);
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
  throw lastError ?? new Error(fr.auth.profileUnavailable);
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

/** A guest run has no account owner and must be explicitly finalized before login. */
async function hasBlockingGuestRun(): Promise<boolean> {
  const { useRunStore } = await import('@/stores/runStore');
  const run = useRunStore.getState();
  return (run.isActive || run.isEnding) && run.authorityAttempt === null;
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
  isPasswordRecovery: initialPasswordRecovery.requested,
  isRecoveryLoading: false,
};

function rejectAccountChange(generation: number): AuthActionResult {
  const error = fr.auth.activeRunAccountChange;
  if (isCurrent(generation)) {
    const state = useAuthStore.getState();
    useAuthStore.setState({
      authStatus: state.isGuest ? 'guest' : state.isAuthenticated ? 'ready' : 'signedOut',
      isLoading: false,
      isInitialized: true,
      error,
    });
  }
  return { success: false, error };
}

async function establishRecoverySession(session: Session, generation: number): Promise<void> {
  if (await hasBlockingRun(session.user.id)) {
    rejectAccountChange(generation);
    return;
  }
  if (!isCurrent(generation)) return;
  setStoredGuestMode(false);
  useAuthStore.setState({
    session,
    user: session.user,
    player: null,
    authStatus: 'signedOut',
    isPasswordRecovery: true,
    isLoading: false,
    isInitialized: true,
    isAuthenticated: false,
    isGuest: false,
    isAdmin: false,
    error: null,
  });
}

function recoveryError(error: unknown, fallback: string): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  const message = getErrorMessage(error);
  if (
    /otp_expired|session_not_found|refresh_token_not_found|bad_jwt/i.test(code) ||
    /expired|invalid.*(?:token|link)|session.*missing|auth session missing/i.test(message)
  )
    return authRecoveryCopy.expired;
  if (/password|rate limit|too many requests|fetch|network|connection/i.test(message))
    return localizeAuthError(error);
  return fallback;
}

async function establishSession(session: Session, generation: number): Promise<AuthActionResult> {
  if (await hasBlockingRun(session.user.id)) {
    return rejectAccountChange(generation);
  }
  if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
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
    isPasswordRecovery: false,
    error: null,
  });
  try {
    const player = await waitForPlayer(session.user.id);
    if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
    const refreshedPlayer = await withLastLogin(player);
    if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
    await hydrateAuthenticatedProgression(session.user.id, refreshedPlayer, generation);
    if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
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
    if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
    await resetProgressionCaches('signed-out', generation);
    if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
    const message = localizeAuthError(error);
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
  await resetProgressionCaches(preserveGuest ? 'guest' : 'signed-out', generation);
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
    isPasswordRecovery: false,
    isRecoveryLoading: false,
  });
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...INITIAL_STATE,

  login: async (email, password) => {
    // A guest run must be finalized explicitly. For an authenticated run we
    // cannot determine ownership from an email or a signed-out store: validate
    // the provider's verified user ID in establishSession after sign-in.
    if (await hasBlockingGuestRun()) return rejectAccountChange(identityGeneration);
    if (!isSupabaseConfigured) {
      const error = fr.auth.unavailable;
      set({ error, isLoading: false, isInitialized: true, authStatus: 'signedOut' });
      return { success: false, error };
    }
    const generation = nextGeneration();
    set({ authStatus: 'bootstrapping', isLoading: true, isInitialized: false, error: null });
    try {
      const result = await container.auth.signIn(email, password);
      if (result.error) throw result.error;
      if (!result.session) throw new Error(fr.auth.missingSession);
      // The provider can only prove ownership after validating credentials.
      // Never let a different signed-in identity inherit a local authoritative run.
      if (await hasBlockingRun(result.session.user.id)) {
        await container.auth.signOut();
        return rejectAccountChange(identityGeneration);
      }
      return await establishSession(result.session, generation);
    } catch (error) {
      if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
      const message = localizeAuthError(error);
      await establishSignedOut(generation, false);
      set({ error: message });
      return { success: false, error: message };
    }
  },

  signUp: async (email, password, username, displayName) => {
    if (await hasBlockingRun(null)) return rejectAccountChange(identityGeneration);
    if (!isSupabaseConfigured) {
      const error = fr.auth.unavailable;
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
        throw new Error(fr.auth.signupMissingSession);
      }
      return await establishSession(result.session, generation);
    } catch (error) {
      if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
      const message = localizeAuthError(error);
      await establishSignedOut(generation, false);
      set({ error: message });
      return { success: false, error: message };
    }
  },

  logout: async () => {
    if (await hasBlockingRun(null)) {
      const error = fr.auth.activeRunLogout;
      set({ error });
      return { success: false, error };
    }
    const generation = nextGeneration();
    set({ isLoading: true, error: null });
    try {
      if (isSupabaseConfigured) await container.auth.signOut();
      if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
      setStoredGuestMode(false);
      await establishSignedOut(generation, false);
      return { success: true };
    } catch (error) {
      if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
      const message = localizeAuthError(error);
      set({ isLoading: false, error: message });
      return { success: false, error: message };
    }
  },

  enterGuestMode: async () => {
    if (await hasBlockingRun(null)) {
      const error = fr.auth.activeRunGuestEnter;
      set({ error });
      return { success: false, error };
    }
    const generation = nextGeneration();
    set({ isLoading: true, isInitialized: false, error: null });
    await resetProgressionCaches('guest', generation);
    if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
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
      const error = fr.auth.activeRunGuestExit;
      set({ error });
      return { success: false, error };
    }
    const generation = nextGeneration();
    setStoredGuestMode(false);
    await establishSignedOut(generation, false);
    return { success: true };
  },

  requestPasswordReset: async (email) => {
    if (get().isRecoveryLoading) return { success: false };
    if (!isSupabaseConfigured) {
      set({ error: fr.auth.unavailable });
      return { success: false, error: fr.auth.unavailable };
    }
    const generation = identityGeneration;
    set({ isRecoveryLoading: true, error: null, successMessage: null });
    try {
      const result = await container.auth.requestPasswordReset(email.trim());
      if (result.error) throw result.error;
      if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
      set({ successMessage: authRecoveryCopy.sent });
      return { success: true };
    } catch (error) {
      if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
      const message = recoveryError(error, authRecoveryCopy.requestFailed);
      set({ error: message });
      return { success: false, error: message };
    } finally {
      if (isCurrent(generation)) set({ isRecoveryLoading: false });
    }
  },

  cancelPasswordRecovery: () => {
    recoveryCallbackPending = false;
    set({ isPasswordRecovery: false, error: null, successMessage: null });
  },

  updateRecoveredPassword: async (password) => {
    const session = get().session;
    if (!get().isPasswordRecovery || !session) {
      set({ error: authRecoveryCopy.expired });
      return { success: false, error: authRecoveryCopy.expired };
    }
    if (get().isRecoveryLoading) return { success: false };
    if (password.length < 6) {
      set({ error: fr.auth.weakPassword });
      return { success: false, error: fr.auth.weakPassword };
    }
    if (await hasBlockingRun(session.user.id)) return rejectAccountChange(identityGeneration);
    const generation = identityGeneration;
    set({ isRecoveryLoading: true, error: null, successMessage: null });
    try {
      const result = await container.auth.updatePassword({ password });
      if (result.error) throw result.error;
      if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
      if (!result.user) throw new Error('Auth session missing');
      set({ isPasswordRecovery: false });
      await establishSession({ ...session, user: result.user }, generation);
      if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
      set({ successMessage: authRecoveryCopy.updated });
      return { success: true };
    } catch (error) {
      if (!isCurrent(generation)) return { success: false, error: fr.auth.staleSession };
      const message = recoveryError(error, authRecoveryCopy.updateFailed);
      set({ error: message });
      if (message === authRecoveryCopy.expired) set({ session: null, user: null });
      return { success: false, error: message };
    } finally {
      if (isCurrent(generation)) set({ isRecoveryLoading: false });
    }
  },

  refreshPlayer: async () => {
    const { session } = get();
    if (!session) return { success: false, error: fr.auth.noActiveSession };
    return establishSession(session, nextGeneration());
  },

  setPlayerCandyBalance: (candies: number) => {
    if (!Number.isInteger(candies) || candies < 0) return;
    set((state) => ({
      player: state.player ? { ...state.player, total_candies: candies } : null,
    }));
  },

  checkSession: async () => {
    const generation = nextGeneration();
    const recovering = get().isPasswordRecovery || recoveryCallbackPending;
    set({ authStatus: 'bootstrapping', isLoading: true, isInitialized: false });
    if (!isSupabaseConfigured) {
      await establishSignedOut(generation, get().isGuest);
      if (recovering && isCurrent(generation))
        set({ isPasswordRecovery: true, error: fr.auth.unavailable });
      return;
    }
    try {
      const result = await container.auth.getSession();
      if (result.error) throw result.error;
      if (get().isPasswordRecovery || recoveryCallbackPending) {
        recoveryCallbackPending = false;
        if (result.session && !initialPasswordRecovery.failed) {
          await establishRecoverySession(result.session, generation);
        } else {
          await establishSignedOut(generation, get().isGuest);
          if (isCurrent(generation))
            set({ isPasswordRecovery: true, error: authRecoveryCopy.expired });
        }
      } else if (result.session) await establishSession(result.session, generation);
      else await establishSignedOut(generation, get().isGuest);
    } catch (error) {
      if (!isCurrent(generation)) return;
      const message = recovering
        ? recoveryError(error, authRecoveryCopy.expired)
        : localizeAuthError(error);
      await establishSignedOut(generation, get().isGuest);
      set({ error: message, isPasswordRecovery: recovering });
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
      if (event === 'PASSWORD_RECOVERY' && session) {
        void establishRecoverySession(session, nextGeneration());
        return;
      }
      if (event === 'TOKEN_REFRESHED' && session && session.user.id === get().user?.id) {
        set({ session, user: session.user });
        return;
      }
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        if (!session) return;
        if (get().isPasswordRecovery) {
          set({ session, user: session.user });
          return;
        }
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
