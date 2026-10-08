// @vitest-environment jsdom

import type { User } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { CHAMPION_ECONOMY_CATALOG } from '@/domain/championEconomy';
import { DailyRunPage } from '@/pages/DailyRunPage';
import { StarterSelectPage } from '@/pages/StarterSelectPage';
import { useAuthStore } from '@/stores/authStore';
import { useChampionEconomyStore } from '@/stores/championEconomyStore';
import { useDailyRunStore } from '@/stores/dailyRunStore';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { DailyChallenge } from '@/types/dailyRun';
import type { Player } from '@/types/models';

const dailyMocks = vi.hoisted(() => ({
  getChallenge: vi.fn(),
  getLeaderboard: vi.fn(),
  reportScore: vi.fn(),
}));

vi.mock('@/services/repositories/SupabaseDailyRunRepository', () => ({
  SupabaseDailyRunRepository: class {
    getDailyChallenge = dailyMocks.getChallenge;
    getDailyLeaderboard = dailyMocks.getLeaderboard;
    reportDailyScore = dailyMocks.reportScore;
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
    dailyMocks.reportScore.mockResolvedValue({ data: undefined, error: null });
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
    useChampionEconomyStore.getState().reset('user-1');
    useChampionEconomyStore.setState({
      snapshot: {
        enabled: false,
        economyVersion: 1,
        catalogVersion: 1,
        gameplayRulesetVersion: 21,
        serverNow: '2026-07-26T12:00:00.000Z',
        rotation: null,
        catalog: CHAMPION_ECONOMY_CATALOG.map((entry) => ({ ...entry })),
        wallet: null,
        ownedChampionIds: [],
        firstWinChampionIds: [],
      },
      status: 'ready',
      refresh: vi.fn(async () => undefined),
    });
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

    expect(await screen.findByText('26 juillet 2026 UTC')).toBeInTheDocument();
    expect(screen.getByText('Normale')).toBeInTheDocument();
    expect(screen.getAllByText('v1')).not.toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Commencer le défi quotidien' })).toBeEnabled();
    expect(await screen.findByText('Public Player')).toBeInTheDocument();
    expect(screen.getByText(/1.360/)).toBeInTheDocument();
    expect(
      screen.getByText('Classement du 26 juillet 2026 UTC, trié du meilleur au moins bon score.'),
    ).toBeInTheDocument();
    for (const column of ['Rang', 'Joueur', 'Score', 'Vagues', 'Niveau']) {
      expect(screen.getByRole('columnheader', { name: column })).toBeInTheDocument();
    }
    expect(document.querySelector('[data-label="Score"]')).toHaveTextContent(/1.360/);
    expect(document.querySelector('[data-label="Vagues"]')).toHaveTextContent('1');
    expect(document.querySelector('[data-label="Niveau"]')).toHaveTextContent('1');
    expect(useDailyRunStore.getState()).toMatchObject({
      dateKey: '2026-07-26',
      seed: 424242,
      expiresAt: '2026-07-27T00:00:00.000Z',
    });
  });

  it('announces score-report feedback with the appropriate live role', async () => {
    dailyMocks.getLeaderboard.mockResolvedValue({
      data: [
        {
          entryId: 'entry-1',
          rank: 1,
          playerName: 'Public Player',
          score: 1360,
          wavesCompleted: 8,
          runLevel: 3,
          scoreVersion: 1,
        },
      ],
      error: null,
    });

    render(
      <MemoryRouter>
        <DailyRunPage />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Signaler' }));
    fireEvent.change(screen.getByLabelText(/Motif du signalement/i), {
      target: { value: 'Ce score paraît manifestement impossible.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Envoyer le signalement' }));

    const feedback = await screen.findByText('Signalement transmis à la modération.');
    expect(feedback).toHaveAttribute('role', 'status');
    expect(dailyMocks.reportScore).toHaveBeenCalledWith(
      'entry-1',
      'Ce score paraît manifestement impossible.',
    );
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
    expect(screen.getByText(/1\/1 emplacement sélectionné/i)).toBeInTheDocument();
  });

  it('allows the authoritative Daily offer to start even when the economy snapshot is unavailable', async () => {
    useChampionEconomyStore.setState({
      snapshot: null,
      status: 'error',
      error: 'economy_unavailable',
    });
    const originalStart = useRunStore.getState().startRun;
    const startRun = vi.fn<typeof originalStart>(async () => ({
      success: false,
      code: 'start_failed',
      error: 'server_unavailable',
      retryable: true,
    }));
    useRunStore.setState({ startRun });
    try {
      render(
        <MemoryRouter initialEntries={['/starter-select?mode=daily']}>
          <StarterSelectPage />
        </MemoryRouter>,
      );
      const chooseLux = await screen.findByRole('button', { name: 'Choisir Lux' });
      expect(chooseLux).toBeEnabled();
      fireEvent.click(chooseLux);
      expect(chooseLux).toHaveAttribute('aria-pressed', 'true');
      const confirm = screen.getByRole('button', { name: 'Confirmer le choix' });
      expect(confirm).toBeEnabled();
      fireEvent.click(confirm);
      await waitFor(() => expect(startRun).toHaveBeenCalledTimes(1));
      expect(startRun).toHaveBeenCalledWith(['Lux'], {
        mode: 'daily',
        seed: challenge.seed,
        runeIds: [],
        difficulty: 'normal',
      });
      expect(useChampionEconomyStore.getState().snapshot).toBeNull();
    } finally {
      useRunStore.setState({ startRun: originalStart });
    }
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

    expect(await screen.findByText(/L’offre du défi quotidien a changé/i)).toBeInTheDocument();
    expect(useRunStore.getState().pendingAuthorityStart).toBeNull();
    for (const championName of ['Garen', 'Annie', 'Ashe', 'Darius', 'Lux', 'Soraka']) {
      expect(screen.getByRole('button', { name: `Choisir ${championName}` })).toBeInTheDocument();
    }
  });
});
