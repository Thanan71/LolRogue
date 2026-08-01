// @vitest-environment jsdom

import type { Session, User } from '@supabase/supabase-js';
import { act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player } from '@/types/models';

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  getPlayer: vi.fn(),
  touchLastLogin: vi.fn(),
  listener: null as ((event: string, session: Session | null) => void) | null,
  unsubscribe: vi.fn(),
  run: {
    isActive: false,
    isEnding: false,
    authorityAttempt: null as null | { ownerUserId: string },
  },
}));

vi.mock('@/services/supabaseClient', () => ({ supabase: {}, isSupabaseConfigured: true }));
vi.mock('@/services/container', () => ({
  RepositoryContainerFactory: {
    create: () => ({
      auth: {
        signIn: mocks.signIn,
        signUp: mocks.signUp,
        signOut: mocks.signOut,
        getSession: mocks.getSession,
        onAuthStateChange: (listener: typeof mocks.listener) => {
          mocks.listener = listener;
          return { subscription: { unsubscribe: mocks.unsubscribe } };
        },
      },
      player: { getPlayer: mocks.getPlayer, touchLastLogin: mocks.touchLastLogin },
    }),
  },
}));
vi.mock('@/stores/masteryStore', () => ({
  useMasteryStore: {
    getState: () => ({
      isHydrated: true,
      activateGuestScope: vi.fn(),
      clearSession: vi.fn(),
      activateAuthenticatedScope: vi.fn(),
    }),
  },
}));
vi.mock('@/stores/enhancementStore', () => ({
  useEnhancementStore: {
    getState: () => ({ reset: vi.fn(), initialize: vi.fn().mockResolvedValue(undefined) }),
  },
}));
vi.mock('@/stores/runStore', () => ({ useRunStore: { getState: () => mocks.run } }));

const { useAuthStore } = await import('@/stores/authStore');

function user(id: string): User {
  return { id, email: `${id}@example.test` } as User;
}

function session(id: string): Session {
  return { user: user(id), access_token: `token-${id}`, refresh_token: `refresh-${id}` } as Session;
}

function player(id: string): Player {
  return {
    id: `player-${id}`,
    user_id: id,
    username: id,
    display_name: id,
    total_candies: 0,
    is_admin: false,
  } as Player;
}

function resetStore(): void {
  useAuthStore.setState({
    session: null,
    user: null,
    player: null,
    authStatus: 'signedOut',
    isLoading: false,
    isAuthenticated: false,
    isGuest: false,
    isInitialized: true,
    isAdmin: false,
    error: null,
  });
}

describe('auth identity lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listener = null;
    mocks.run = { isActive: false, isEnding: false, authorityAttempt: null };
    mocks.touchLastLogin.mockResolvedValue({ data: null, error: null });
    mocks.signOut.mockResolvedValue(undefined);
    resetStore();
  });

  it('does not authenticate a session before its durable profile is ready', async () => {
    let resolveProfile!: (value: { data: Player; error: null }) => void;
    mocks.signIn.mockResolvedValue({ user: user('a'), session: session('a'), error: null });
    mocks.getPlayer.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveProfile = resolve;
      }),
    );

    const login = useAuthStore.getState().login('a@example.test', 'secret');
    await act(async () => Promise.resolve());
    expect(useAuthStore.getState()).toMatchObject({
      authStatus: 'profileLoading',
      isAuthenticated: false,
      player: null,
    });

    resolveProfile({ data: player('a'), error: null });
    await expect(login).resolves.toEqual({ success: true });
    expect(useAuthStore.getState()).toMatchObject({
      authStatus: 'ready',
      isAuthenticated: true,
      player: { user_id: 'a' },
    });
  });

  it('ignores a late profile response from an obsolete account', async () => {
    let resolveA!: (value: { data: Player; error: null }) => void;
    mocks.getPlayer
      .mockReturnValueOnce(new Promise((resolve) => (resolveA = resolve)))
      .mockResolvedValueOnce({ data: player('b'), error: null });
    const unsubscribe = useAuthStore.getState().subscribeToAuthChanges();

    mocks.listener?.('SIGNED_IN', session('a'));
    await act(async () => Promise.resolve());
    mocks.listener?.('SIGNED_IN', session('b'));
    await act(async () => Promise.resolve());
    await act(async () => Promise.resolve());
    resolveA({ data: player('a'), error: null });
    await act(async () => Promise.resolve());

    expect(useAuthStore.getState()).toMatchObject({
      authStatus: 'ready',
      user: { id: 'b' },
      player: { user_id: 'b' },
    });
    unsubscribe();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it('keeps the current identity when Supabase refuses sign out', async () => {
    useAuthStore.setState({
      session: session('a'),
      user: user('a'),
      player: player('a'),
      authStatus: 'ready',
      isAuthenticated: true,
    });
    mocks.signOut.mockRejectedValue(new Error('network logout failed'));

    await expect(useAuthStore.getState().logout()).resolves.toMatchObject({ success: false });
    expect(useAuthStore.getState()).toMatchObject({
      authStatus: 'ready',
      isAuthenticated: true,
      user: { id: 'a' },
    });
  });

  it('exposes a retryable profile-unavailable state after the server trigger stays absent', async () => {
    vi.useFakeTimers();
    mocks.signIn.mockResolvedValue({
      user: user('missing'),
      session: session('missing'),
      error: null,
    });
    mocks.getPlayer.mockResolvedValue({ data: null, error: null });

    const login = useAuthStore.getState().login('missing@example.test', 'secret');
    await vi.runAllTimersAsync();
    await expect(login).resolves.toMatchObject({ success: false });
    expect(useAuthStore.getState()).toMatchObject({
      authStatus: 'profileUnavailable',
      isAuthenticated: false,
      user: { id: 'missing' },
      player: null,
    });
    vi.useRealTimers();
  });

  it('refuses identity changes while a run still belongs to the current account', async () => {
    mocks.run = {
      isActive: true,
      isEnding: false,
      authorityAttempt: { ownerUserId: 'a' },
    };
    useAuthStore.setState({ user: user('a'), authStatus: 'ready', isAuthenticated: true });

    await expect(useAuthStore.getState().logout()).resolves.toMatchObject({ success: false });
    await expect(useAuthStore.getState().enterGuestMode()).resolves.toMatchObject({
      success: false,
    });
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
