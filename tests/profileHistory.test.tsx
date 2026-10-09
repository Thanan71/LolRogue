// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from '@/pages/ProfilePage';
import { useAuthStore } from '@/stores/authStore';
import type { Player, Run, RunTeamMember } from '@/types/models';

const historyMocks = vi.hoisted(() => ({
  getPlayerRunHistory: vi.fn(),
  getRunHistoryDetails: vi.fn(),
  endRun: vi.fn(),
  exitGuestMode: vi.fn(),
  activeRun: false,
}));

vi.mock('@/stores/runStore', () => ({
  useRunStore: {
    getState: () => ({
      isActive: historyMocks.activeRun,
      runId: 'guest-active',
      endRun: historyMocks.endRun,
    }),
  },
}));

vi.mock('@/services/container', () => ({
  RepositoryContainerFactory: {
    create: () => ({
      run: {
        getPlayerRunHistory: historyMocks.getPlayerRunHistory,
        getRunHistoryDetails: historyMocks.getRunHistoryDetails,
      },
    }),
  },
}));

vi.mock('@/services/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/audio', () => ({ playUIClick: vi.fn(), playUIHover: vi.fn(), playSFX: vi.fn() }));

const run = {
  id: 'run-13',
  progression_source: 'verified',
  won: true,
  run_level: 6,
  waves_completed: 42,
  total_kills: 17,
  total_damage_dealt: 12_500,
  total_healing_done: 900,
  total_shielding_done: 450,
  gold_earned: 820,
  total_gold_spent: 600,
  items_purchased: 4,
  rune_ids: ['press_the_attack'],
  augment_ids: ['field_medic'],
  completed_at: '2026-08-08T10:00:00.000Z',
  created_at: '2026-08-08T09:00:00.000Z',
} as Run;

describe('comparable profile history', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    historyMocks.activeRun = false;
    historyMocks.endRun.mockReset();
    historyMocks.exitGuestMode.mockReset();
    historyMocks.endRun.mockResolvedValue({ success: true });
    historyMocks.exitGuestMode.mockResolvedValue({ success: true });
    historyMocks.getRunHistoryDetails.mockReset();
    historyMocks.getRunHistoryDetails.mockResolvedValue({
      data: {
        run,
        teamMembers: [
          { champion_id: 'Garen', final_level: 6 } as RunTeamMember,
          { champion_id: 'Lux', final_level: 5 } as RunTeamMember,
        ],
      },
      error: null,
    });
    historyMocks.getPlayerRunHistory.mockReset();
    historyMocks.getPlayerRunHistory.mockResolvedValue({
      data: [
        {
          run,
          attempt: {
            difficulty: 'hard',
            mode: 'normal',
            engineVersion: 'run-engine-v13',
            gameplayRulesetVersion: 13,
            progressionRulesetVersion: 2,
          },
          teamMembers: [
            { champion_id: 'Garen', final_level: 6 } as RunTeamMember,
            { champion_id: 'Lux', final_level: 5 } as RunTeamMember,
          ],
        },
      ],
      error: null,
    });
    useAuthStore.setState({
      player: {
        id: 'player-1',
        username: 'player',
        display_name: 'Player',
        level: 4,
        total_candies: 700,
        total_runs_completed: 10,
        total_wins: 4,
      } as Player,
      isGuest: false,
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
      exitGuestMode: historyMocks.exitGuestMode,
    });
  });

  it('loads versioned history and reveals team, economy and combat details', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(historyMocks.getPlayerRunHistory).toHaveBeenCalledWith('player-1', 20, {
        filters: {},
      }),
    );
    const summary = await screen.findByText('Victoire', { selector: 'span' });
    expect(historyMocks.getRunHistoryDetails).not.toHaveBeenCalled();
    fireEvent.click(summary.closest('summary') ?? summary);
    await screen.findByText(/Garen niv. 6, Lux niv. 5/);
    expect(historyMocks.getRunHistoryDetails).toHaveBeenCalledWith('run-13');

    expect(screen.getByText('Anciennes versions · non comparable')).toBeVisible();
    expect(screen.getByText('run-engine-v13 · jeu v13 · progression v2')).toBeVisible();
    expect(screen.getByText(/normal · difficile · règles de jeu v13/)).toBeVisible();
    expect(screen.getByText(/Garen niv. 6, Lux niv. 5/)).toBeVisible();
    expect(screen.getByText(/820 or gagné · 600 or dépensé · 4 objets achetés/)).toBeVisible();
    expect(screen.getByText(/12.500 dégâts · 900 soins · 450 boucliers/)).toBeVisible();
    expect(screen.getByText('Attaque soutenue')).toBeVisible();
    expect(screen.getByText('Médecin de terrain')).toBeVisible();
  });

  it('renders legacy nested-select rows without attempt, team or content metadata', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    historyMocks.getPlayerRunHistory.mockResolvedValue({
      data: [
        {
          run: {
            ...run,
            id: 'run-legacy',
            won: false,
            completed_at: null,
            rune_ids: [],
            augment_ids: [],
          },
          attempt: null,
          teamMembers: [],
        },
      ],
      error: null,
    });

    const legacy = await historyMocks.getPlayerRunHistory.getMockImplementation()?.();
    historyMocks.getRunHistoryDetails.mockResolvedValue({
      data: { run: legacy.data[0].run, teamMembers: [] },
      error: null,
    });
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Legacy · non comparable')).toBeVisible();
    const summary = await screen.findByText('Défaite', { selector: 'span' });
    fireEvent.click(summary.closest('summary') ?? summary);
    await screen.findByText('Équipe non conservée');

    expect(screen.getByText(/Connexion perdue/)).toBeVisible();
    expect(screen.getByText(/Partie historique/)).toBeVisible();
    expect(screen.getByText('Équipe non conservée')).toBeVisible();
    expect(screen.getByText('aucun')).toBeVisible();
  });

  it('applies all filters on the server and resets them', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );
    await screen.findByText('Victoire', { selector: 'span' });
    fireEvent.change(screen.getByLabelText('Résultat'), { target: { value: 'defeat' } });
    fireEvent.change(screen.getByLabelText('Difficulté'), { target: { value: 'hard' } });
    fireEvent.change(screen.getByLabelText('Mode'), { target: { value: 'daily' } });
    fireEvent.change(screen.getByLabelText('Moteur'), { target: { value: 'run-engine-v21' } });
    fireEvent.change(screen.getByLabelText('Version des règles de jeu'), {
      target: { value: '21' },
    });
    fireEvent.change(screen.getByLabelText('Version des règles de progression'), {
      target: { value: '2' },
    });
    await waitFor(() =>
      expect(historyMocks.getPlayerRunHistory).toHaveBeenLastCalledWith('player-1', 20, {
        filters: {
          outcome: 'defeat',
          difficulty: 'hard',
          mode: 'daily',
          engineVersion: 'run-engine-v21',
          gameplayRulesetVersion: 21,
          progressionRulesetVersion: 2,
        },
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Réinitialiser les filtres' }));
    await waitFor(() =>
      expect(historyMocks.getPlayerRunHistory).toHaveBeenLastCalledWith('player-1', 20, {
        filters: {},
      }),
    );
  });

  it('appends later pages, preserves rows after a page failure and resets the cursor on filtering', async () => {
    const first = await historyMocks.getPlayerRunHistory.getMockImplementation()?.();
    historyMocks.getPlayerRunHistory
      .mockResolvedValueOnce({ ...first, nextCursor: { createdAt: run.created_at, id: run.id } })
      .mockResolvedValueOnce({ data: null, error: new Error('offline'), nextCursor: null })
      .mockResolvedValueOnce({
        data: [{ ...first.data[0], run: { ...run, id: 'second-run', won: false } }],
        error: null,
        nextCursor: null,
      });
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );
    await screen.findByText('Victoire', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: 'Charger les parties suivantes' }));
    await screen.findByText('Historique indisponible');
    expect(screen.getByText('Victoire', { selector: 'span' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer le chargement' }));
    expect(await screen.findByText('Défaite', { selector: 'span' })).toBeVisible();
    expect(screen.getByText('Victoire', { selector: 'span' })).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Charger les parties suivantes' }),
    ).not.toBeInTheDocument();
    expect(historyMocks.getPlayerRunHistory).toHaveBeenCalledWith('player-1', 20, {
      filters: {},
      cursor: { createdAt: run.created_at, id: run.id },
    });
    fireEvent.change(screen.getByLabelText('Résultat'), { target: { value: 'victory' } });
    await waitFor(() =>
      expect(historyMocks.getPlayerRunHistory).toHaveBeenLastCalledWith('player-1', 20, {
        filters: { outcome: 'victory' },
      }),
    );
  });

  it('ignores a later page when the account changes before it resolves', async () => {
    const first = await historyMocks.getPlayerRunHistory.getMockImplementation()?.();
    let finishPage: (value: unknown) => void = () => {};
    historyMocks.getPlayerRunHistory
      .mockResolvedValueOnce({ ...first, nextCursor: { createdAt: run.created_at, id: run.id } })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          finishPage = resolve;
        }),
      )
      .mockResolvedValueOnce({ data: [], error: null, nextCursor: null });
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );
    await screen.findByText('Victoire', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: 'Charger les parties suivantes' }));
    act(() =>
      useAuthStore.setState({
        player: { ...useAuthStore.getState().player, id: 'player-2' } as Player,
      }),
    );
    await screen.findByText('Aucune partie enregistrée');
    await act(async () => finishPage({ ...first, nextCursor: null }));
    expect(screen.queryByText('Victoire', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('updates the synchronization status when connectivity changes', async () => {
    let isOnline = true;
    vi.spyOn(window.navigator, 'onLine', 'get').mockImplementation(() => isOnline);

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Profil connecté'));

    act(() => {
      isOnline = false;
      window.dispatchEvent(new Event('offline'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Connexion perdue');
    expect(screen.getByRole('status')).toHaveClass('ui-status-line--offline');

    act(() => {
      isOnline = true;
      window.dispatchEvent(new Event('online'));
    });
    expect(screen.getByRole('status')).toHaveTextContent('Profil connecté');
    expect(screen.getByRole('status')).toHaveClass('ui-status-line--online');
  });

  it("does not expose the previous player's runs when the next history load fails", async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Victoire', { selector: 'span' })).toBeVisible();
    historyMocks.getPlayerRunHistory.mockResolvedValueOnce({
      data: null,
      error: new Error('profile switched while offline'),
    });

    const previousPlayer = useAuthStore.getState().player;
    act(() => {
      useAuthStore.setState({
        player: {
          ...previousPlayer,
          id: 'player-2',
          username: 'second-player',
          display_name: 'Second Player',
        } as Player,
      });
    });

    expect(await screen.findByText('Historique indisponible')).toBeVisible();
    expect(historyMocks.getPlayerRunHistory).toHaveBeenLastCalledWith('player-2', 20, {
      filters: {},
    });
    expect(screen.queryByText('Victoire', { selector: 'span' })).not.toBeInTheDocument();
  });

  it('shows repository failures and retries the nested history query', async () => {
    historyMocks.getPlayerRunHistory
      .mockResolvedValueOnce({ data: null, error: new Error('offline') })
      .mockResolvedValueOnce({ data: null, error: null });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Historique indisponible')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer le chargement' }));

    await waitFor(() => expect(historyMocks.getPlayerRunHistory).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Aucune partie enregistrée')).toBeVisible();
  });

  it('reports unexpected initial and later page exceptions without exposing stale rows', async () => {
    const first = await historyMocks.getPlayerRunHistory.getMockImplementation()?.();
    historyMocks.getPlayerRunHistory
      .mockRejectedValueOnce(new Error('network exception'))
      .mockResolvedValueOnce({ ...first, nextCursor: { createdAt: run.created_at, id: run.id } })
      .mockRejectedValueOnce(new Error('page exception'));
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );
    await screen.findByText('Historique indisponible');
    fireEvent.click(screen.getByRole('button', { name: 'Réessayer le chargement' }));
    await screen.findByText('Victoire', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: 'Charger les parties suivantes' }));
    await screen.findByText('Historique indisponible');
    expect(screen.getByText('Victoire', { selector: 'span' })).toBeVisible();
  });

  it('uses singular labels and the username when no display name is set', async () => {
    useAuthStore.setState({
      player: {
        ...useAuthStore.getState().player,
        display_name: '',
        total_candies: 1,
        total_runs_completed: 1,
        total_wins: 1,
      } as Player,
    });
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'player' })).toBeVisible();
    expect(screen.getByText('bonbon', { exact: true })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: '← Menu' }));
  });

  it('ignores an initial rejected promise after unmount', async () => {
    let fail: (reason: Error) => void = () => {};
    historyMocks.getPlayerRunHistory.mockReturnValueOnce(
      new Promise((_, reject) => {
        fail = reject;
      }),
    );
    const view = render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );
    view.unmount();
    await act(async () => fail(new Error('stale initial load')));
    expect(screen.queryByText('Historique indisponible')).not.toBeInTheDocument();
  });

  it('keeps local profiles out of the remote history repository', () => {
    useAuthStore.setState({ player: null, isGuest: true, isAuthenticated: false });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(screen.getByText('Profil local')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter pour synchroniser' }));
    expect(historyMocks.getPlayerRunHistory).not.toHaveBeenCalled();
  });

  it('preserves an active guest run when login abandonment is declined', async () => {
    historyMocks.activeRun = true;
    useAuthStore.setState({ player: null, isGuest: true, isAuthenticated: false });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter pour synchroniser' }));
    await waitFor(() => expect(window.confirm).toHaveBeenCalledOnce());
    expect(historyMocks.endRun).not.toHaveBeenCalled();
    expect(historyMocks.exitGuestMode).not.toHaveBeenCalled();
    expect(screen.getByText('Profil local')).toBeVisible();
  });

  it('ends an active guest run only after confirmation before opening login', async () => {
    historyMocks.activeRun = true;
    useAuthStore.setState({ player: null, isGuest: true, isAuthenticated: false });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <MemoryRouter initialEntries={['/profile']}>
        <Routes>
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/auth" element={<h1>Login ready</h1>} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Se connecter pour synchroniser' }));
    await screen.findByRole('heading', { name: 'Login ready' });
    expect(historyMocks.endRun).toHaveBeenCalledWith(false, 'guest-active');
    expect(historyMocks.exitGuestMode).toHaveBeenCalledOnce();
    expect(historyMocks.endRun.mock.invocationCallOrder[0]).toBeLessThan(
      historyMocks.exitGuestMode.mock.invocationCallOrder[0]!,
    );
  });

  it('ignores a nested history response after the profile unmounts', async () => {
    let resolveHistory: ((value: { data: []; error: null }) => void) | undefined;
    historyMocks.getPlayerRunHistory.mockReturnValue(
      new Promise((resolve) => {
        resolveHistory = resolve;
      }),
    );
    const view = render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Synchronisation du profil…')).toBeVisible();
    view.unmount();
    await act(async () => resolveHistory?.({ data: [], error: null }));

    expect(historyMocks.getPlayerRunHistory).toHaveBeenCalledWith('player-1', 20, { filters: {} });
  });
});
