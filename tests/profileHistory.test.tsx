// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProfilePage } from '@/pages/ProfilePage';
import { useAuthStore } from '@/stores/authStore';
import type { Player, Run, RunTeamMember } from '@/types/models';

const historyMocks = vi.hoisted(() => ({ getPlayerRunHistory: vi.fn() }));

vi.mock('@/services/container', () => ({
  RepositoryContainerFactory: {
    create: () => ({ run: { getPlayerRunHistory: historyMocks.getPlayerRunHistory } }),
  },
}));

vi.mock('@/services/supabaseClient', () => ({ supabase: {} }));
vi.mock('@/audio', () => ({ playUIClick: vi.fn(), playUIHover: vi.fn(), playSFX: vi.fn() }));

const run = {
  id: 'run-13',
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
    });
  });

  it('loads versioned history and reveals team, economy and combat details', async () => {
    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(historyMocks.getPlayerRunHistory).toHaveBeenCalledWith('player-1', 20),
    );
    const summary = await screen.findByText(/Victoire/);
    fireEvent.click(summary.closest('summary') ?? summary);

    expect(screen.getByText(/normal · hard · gameplay v13/)).toBeVisible();
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

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    const summary = await screen.findByText(/Défaite/);
    fireEvent.click(summary.closest('summary') ?? summary);

    expect(screen.getByText(/Connexion perdue/)).toBeVisible();
    expect(screen.getByText(/Partie historique/)).toBeVisible();
    expect(screen.getByText('Équipe non conservée')).toBeVisible();
    expect(screen.getByText('aucun')).toBeVisible();
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

    expect(await screen.findByText('Victoire')).toBeVisible();
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
    expect(historyMocks.getPlayerRunHistory).toHaveBeenLastCalledWith('player-2', 20);
    expect(screen.queryByText('Victoire')).not.toBeInTheDocument();
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

    expect(historyMocks.getPlayerRunHistory).toHaveBeenCalledWith('player-1', 20);
  });
});
