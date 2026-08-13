// @vitest-environment jsdom

import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '@/pages/SettingsPage';
import { SupabaseDailyRunRepository } from '@/services/repositories/SupabaseDailyRunRepository';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Player } from '@/types/models';

vi.mock('@/audio', () => ({ playUIClick: vi.fn() }));
vi.mock('@/services/supabaseClient', () => ({ supabase: {} }));

function player(id: string, publicDisplayName: string | null, leaderboardOptOut: boolean): Player {
  return {
    id,
    username: `player-${id}`,
    display_name: `Player ${id}`,
    public_display_name: publicDisplayName,
    leaderboard_opt_out: leaderboardOptOut,
  } as Player;
}

describe('Settings identity synchronization', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    useAuthStore.setState({
      player: player('one', 'Premier alias', false),
      isGuest: false,
      isAuthenticated: true,
      isInitialized: true,
      isLoading: false,
    });
    useSettingsStore.setState({
      textSize: 'medium',
      battleSpeed: 1,
      difficulty: 'normal',
      particlesEnabled: true,
      keyboardShortcutsEnabled: true,
    });
  });

  it('replaces unsaved privacy fields when the authenticated player changes', () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    const publicName = screen.getByLabelText('Alias public facultatif');
    const optOut = screen.getByRole('checkbox', {
      name: 'Masquer mes scores des classements publics',
    });
    expect(publicName).toHaveValue('Premier alias');
    expect(optOut).not.toBeChecked();

    fireEvent.change(publicName, { target: { value: 'Brouillon local' } });
    fireEvent.click(optOut);
    expect(publicName).toHaveValue('Brouillon local');
    expect(optOut).toBeChecked();

    act(() => {
      useAuthStore.setState({ player: player('two', 'Second alias', true) });
    });

    expect(screen.getByLabelText('Alias public facultatif')).toHaveValue('Second alias');
    expect(
      screen.getByRole('checkbox', {
        name: 'Masquer mes scores des classements publics',
      }),
    ).toBeChecked();
  });

  it('does not expose account privacy controls without an active player', () => {
    act(() => {
      useAuthStore.setState({ player: null, isAuthenticated: false });
    });

    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText('Alias public facultatif')).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Réglages du jeu' })).toBeInTheDocument();
  });

  it("ignores a privacy response belonging to the previous player's request", async () => {
    let resolveSave: ((result: { error: null }) => void) | undefined;
    vi.spyOn(SupabaseDailyRunRepository.prototype, 'setLeaderboardPrivacy').mockReturnValue(
      new Promise((resolve) => {
        resolveSave = resolve;
      }),
    );
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer la confidentialité' }));
    expect(screen.getByRole('button', { name: 'Enregistrement…' })).toBeDisabled();

    act(() => {
      useAuthStore.setState({ player: player('two', 'Second alias', true) });
    });
    expect(screen.getByRole('button', { name: 'Enregistrer la confidentialité' })).toBeEnabled();

    await act(async () => resolveSave?.({ error: null }));

    expect(screen.queryByText('Préférences de classement enregistrées.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Alias public facultatif')).toHaveValue('Second alias');
  });
});
