// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { User } from '@supabase/supabase-js';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { calculateRunCandyRewards } from '@/game/run/runRewards';
import { AuthPage } from '@/pages/AuthPage';
import { EventPage } from '@/pages/EventPage';
import { GameOverPage } from '@/pages/GameOverPage';
import { MenuPage } from '@/pages/MenuPage';
import { RestPage } from '@/pages/RestPage';
import { ShopPage } from '@/pages/ShopPage';
import { TreasurePage } from '@/pages/TreasurePage';
import { RunMapScreen } from '@/components/RunMapScreen';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { useAuthStore } from '@/stores/authStore';
import { useRunStore } from '@/stores/runStore';
import type { CompletedRunSnapshot, RunSummary } from '@/types/run';

vi.mock('@/audio/AudioManager', () => ({
  playSFX: vi.fn(),
  playUIClick: vi.fn(),
  playUIHover: vi.fn(),
}));

vi.mock('@/components/ParticleBackground', () => ({
  ParticleBackground: () => null,
}));

function renderAt(element: React.ReactNode, path = '/') {
  return render(<MemoryRouter initialEntries={[path]}>{element}</MemoryRouter>);
}

function completedSnapshot(summary: RunSummary, championIds: string[]): CompletedRunSnapshot {
  return {
    mode: 'normal',
    runId: 'completed-run',
    won: summary.won,
    runLevel: summary.runLevel,
    wavesCompleted: summary.wavesCompleted,
    biomesVisited: summary.biomesVisited,
    goldEarned: summary.goldEarned,
    summary,
    teamMembers: championIds.map((championId) => ({
      championId,
      level: 1,
      currentHp: 100,
    })),
    startedAt: '2026-07-23T12:00:00.000Z',
    seed: 42,
    runeIds: [],
    augmentIds: [],
    daily: null,
  };
}

describe('P2 page smoke tests', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      player: null,
      isAuthenticated: true,
      isGuest: true,
      isInitialized: true,
      isLoading: false,
      error: null,
    });
    useRunStore.setState({
      isActive: false,
      biomeMaps: [],
      currentBiomeIndex: 0,
      currentNodeId: null,
      currentBiome: null,
      pendingEncounter: null,
      currentEncounter: null,
      team: [],
      inventory: [],
      gold: 0,
      saveStatus: 'idle',
      saveError: null,
      completedRunSnapshot: null,
      serverProgression: null,
    });
  });

  it('renders authentication controls', () => {
    renderAt(<AuthPage />, '/auth');
    expect(screen.getByRole('heading', { name: 'LoL Rogue' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Login' })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Sign Up' })).toBeInTheDocument();
  });

  it('renders the guest menu', () => {
    renderAt(<MenuPage />);
    expect(screen.getByRole('heading', { name: 'LoL Rogue' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play$/i })).toBeInTheDocument();
    expect(screen.getByText('Guest Mode')).toBeInTheDocument();
  });

  it('renders an active run map', () => {
    const maps = generateRunMap(12345);
    useRunStore.setState({
      isActive: true,
      biomeMaps: maps,
      currentBiomeIndex: 0,
      currentBiome: maps[0].biome,
      currentNodeId: maps[0].startNodeId,
    });
    renderAt(<RunMapScreen />, '/run');
    expect(screen.getByRole('button', { name: /aide/i })).toBeInTheDocument();
    expect(screen.getByText('Top_lane')).toBeInTheDocument();
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it.each([
    ['Shop', <ShopPage />],
    ['Rest', <RestPage />],
    ['Event', <EventPage />],
    ['Treasure', <TreasurePage />],
  ])('renders the %s encounter fallback safely', (label, page) => {
    useRunStore.setState({ isActive: true });
    renderAt(page, `/${label.toLowerCase()}`);
    expect(screen.getAllByText(new RegExp(label, 'i')).length).toBeGreaterThan(0);
  });

  it('renders the game over summary supplied by the router', () => {
    const summary: RunSummary = {
      won: false,
      runLevel: 3,
      wavesCompleted: 8,
      biomesVisited: ['top_lane'],
      goldEarned: 200,
      totalKills: 4,
      totalDamage: 1200,
      championStats: [],
    };
    render(
      <MemoryRouter initialEntries={[{ pathname: '/game-over', state: { summary } }]}>
        <GameOverPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Game Over' })).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('uses canonical server rewards and the snapshot team for an authenticated run', () => {
    const summary: RunSummary = {
      won: true,
      runLevel: 2,
      wavesCompleted: 7,
      biomesVisited: ['top_lane'],
      goldEarned: 180,
      totalKills: 3,
      totalDamage: 900,
      // Lux did not emit a combat statistic, but was still part of the saved team.
      championStats: [
        {
          championId: 'Garen',
          kills: 3,
          totalDamage: 900,
          survived: true,
        },
      ],
    };
    useAuthStore.setState({
      user: { id: 'user-1' } as User,
      isAuthenticated: true,
      isGuest: false,
    });
    useRunStore.setState({
      saveStatus: 'success',
      completedRunSnapshot: completedSnapshot(summary, ['Garen', 'Lux']),
      serverProgression: {
        runId: 'database-run',
        replayed: false,
        candiesEarned: 78,
        candiesPerChampion: 39,
        progressionVersion: 7,
        progressionSource: 'verified',
      },
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/game-over', state: { summary } }]}>
        <GameOverPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(/🍬 78 Candies/)).toBeInTheDocument();
    expect(screen.getAllByText('+39 candies')).toHaveLength(2);
    expect(screen.getByText('Team Size').parentElement).toHaveTextContent('2');
    expect(screen.getByTestId('server-progression')).toHaveTextContent('Progression v7 · Verified');
  });

  it('keeps local reward calculation for a guest run', () => {
    const summary: RunSummary = {
      won: false,
      runLevel: 1,
      wavesCompleted: 3,
      biomesVisited: ['top_lane'],
      goldEarned: 80,
      totalKills: 1,
      totalDamage: 250,
      championStats: [
        {
          championId: 'Garen',
          kills: 1,
          totalDamage: 250,
          survived: false,
        },
      ],
    };
    const localRewards = calculateRunCandyRewards(summary);
    useAuthStore.setState({
      user: null,
      player: null,
      isAuthenticated: false,
      isGuest: true,
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/game-over', state: { summary } }]}>
        <GameOverPage />
      </MemoryRouter>,
    );

    expect(screen.getByText(new RegExp(`🍬 ${localRewards.total} Candies`))).toBeInTheDocument();
    expect(screen.queryByTestId('server-progression')).not.toBeInTheDocument();
  });

  it('does not show speculative local rewards while an authenticated save is in error', () => {
    const summary: RunSummary = {
      won: false,
      runLevel: 1,
      wavesCompleted: 3,
      biomesVisited: ['top_lane'],
      goldEarned: 80,
      totalKills: 1,
      totalDamage: 250,
      championStats: [
        {
          championId: 'Garen',
          kills: 1,
          totalDamage: 250,
          survived: false,
        },
      ],
    };
    useAuthStore.setState({
      user: { id: 'user-1' } as User,
      isAuthenticated: true,
      isGuest: false,
    });
    useRunStore.setState({
      isActive: true,
      runId: 'completed-run',
      saveStatus: 'error',
      saveError: 'network unavailable',
      completedRunSnapshot: completedSnapshot(summary, ['Garen']),
      serverProgression: null,
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/game-over', state: { summary } }]}>
        <GameOverPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('network unavailable');
    expect(screen.queryByText(/Candies/)).not.toBeInTheDocument();
  });
});

describe('application error fallback', () => {
  it('renders a recoverable fallback when a route crashes', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const BrokenRoute = () => {
      throw new Error('route failed');
    };

    render(
      <AppErrorBoundary>
        <BrokenRoute />
      </AppErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Une erreur inattendue est survenue');
    expect(screen.getByRole('button', { name: 'Retour au menu' })).toBeInTheDocument();
    consoleError.mockRestore();
  });
});
