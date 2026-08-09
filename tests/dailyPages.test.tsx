// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { User } from '@supabase/supabase-js';
import { vi } from 'vitest';
import { DailyRunPage } from '@/pages/DailyRunPage';
import { StarterSelectPage } from '@/pages/StarterSelectPage';
import { useAuthStore } from '@/stores/authStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { DailyChallenge } from '@/types/dailyRun';
import type { Player } from '@/types/models';

const dailyMocks = vi.hoisted(() => ({
  getChallenge: vi.fn(),
  getLeaderboard: vi.fn(),
}));

vi.mock('@/services/repositories/SupabaseDailyRunRepository', () => ({
  SupabaseDailyRunRepository: class {
    getDailyChallenge = dailyMocks.getChallenge;
    getDailyLeaderboard = dailyMocks.getLeaderboard;
  },
}));

vi.mock('@/services/supabaseClient', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
  isSupabaseConfigured: true,
}));

vi.mock('@/audio', () => ({
  playUIClick: vi.fn(),
  playUIHover: vi.fn(),
  playSFX: vi.fn(),
}));

const challenge: DailyChallenge = {
  dailyDate: '2026-07-26',
  seed: 424242,
  startsAt: '2026-07-26T00:00:00.000Z',
  expiresAt: '2026-07-27T00:00:00.000Z',
  difficulty: 'normal',
  dailyRulesetVersion: 1,
  gameplayRulesetVersion: 1,
  engineVersion: 'run-engine-v1',
  gameplayContentHash: 'a'.repeat(64),
  scoreVersion: 1,
  starterIds: ['Garen', 'Annie', 'Ashe', 'Darius', 'Lux', 'Soraka'],
  attemptPolicy: 'one_official_attempt_per_utc_day',
  hasAttempted: false,
  attemptId: null,
  attemptStatus: null,
  published: false,
  score: null,
};

describe('authoritative Daily pages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dailyMocks.getChallenge.mockResolvedValue({ data: challenge, error: null });
    dailyMocks.getLeaderboard.mockResolvedValue({
      data: [
        {
          rank: 1,
          playerName: 'Public Player',
          score: 1360,
          wavesCompleted: 1,
          runLevel: 1,
          scoreVersion: 1,
        },
      ],
      error: null,
    });
    useAuthStore.setState({
      isAuthenticated: true,
      isGuest: false,
      isInitialized: true,
      isLoading: false,
      user: { id: 'user-1' } as User,
      player: { id: 'player-1' } as Player,
      error: null,
    });
    useRunStore.setState({ ...RUN_INITIAL_STATE });
    useDailyRunStore.setState({
      dateKey: '2026-07-25',
      seed: 1,
      hasCompletedToday: false,
      expiresAt: null,
    });
  });

  it('displays the server UTC date, rules and sanitized rank', async () => {
    render(
      <MemoryRouter>
        <DailyRunPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/2026-07-26 UTC · normal · score v1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Commencer le défi quotidien' })).toBeEnabled();
    expect(await screen.findByText('Public Player')).toBeInTheDocument();
    expect(screen.getByText(/1.360/)).toBeInTheDocument();
    expect(useDailyRunStore.getState()).toMatchObject({
      dateKey: '2026-07-26',
      seed: 424242,
      expiresAt: '2026-07-27T00:00:00.000Z',
    });
  });

  it('renders exactly the starter offer supplied by the server', async () => {
    render(
      <MemoryRouter initialEntries={[{ pathname: '/starter-select', state: { mode: 'daily' } }]}>
        <StarterSelectPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /^Choisir /i })).toHaveLength(6);
    });
    for (const championName of ['Garen', 'Annie', 'Ashe', 'Darius', 'Lux', 'Soraka']) {
      expect(screen.getByRole('button', { name: `Choisir ${championName}` })).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Choisir Jinx' })).not.toBeInTheDocument();

    const garen = screen.getByRole('button', { name: 'Choisir Garen' });
    const annie = screen.getByRole('button', { name: 'Choisir Annie' });
    fireEvent.click(garen);
    expect(garen).toHaveAttribute('aria-pressed', 'true');
    expect(annie).toBeDisabled();
    expect(screen.getByText(/1\/1 slot\(s\) sélectionné/i)).toBeInTheDocument();
  });

  it('drops a persisted multi-champion Daily team even when every starter is offered', async () => {
    useRunStore.setState({
      pendingAuthorityStart: {
        commandId: '11111111-1111-4111-8111-111111111111',
        ownerUserId: 'user-1',
        mode: 'daily',
        team: ['Garen', 'Annie', 'Ashe'],
        runeIds: ['press_the_attack'],
        difficulty: 'normal',
      },
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/starter-select', state: { mode: 'daily' } }]}>
        <StarterSelectPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(/L'offre Daily a changé/i)).toBeInTheDocument();
    expect(useRunStore.getState().pendingAuthorityStart).toBeNull();
    for (const championName of ['Garen', 'Annie', 'Ashe', 'Darius', 'Lux', 'Soraka']) {
      expect(screen.getByRole('button', { name: `Choisir ${championName}` })).toBeInTheDocument();
    }
  });
});
