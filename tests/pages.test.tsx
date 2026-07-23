// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { AuthPage } from '@/pages/AuthPage';
import { EventPage } from '@/pages/EventPage';
import { GameOverPage } from '@/pages/GameOverPage';
import { MenuPage } from '@/pages/MenuPage';
import { RestPage } from '@/pages/RestPage';
import { ShopPage } from '@/pages/ShopPage';
import { TreasurePage } from '@/pages/TreasurePage';
import { RunMapScreen } from '@/components/RunMapScreen';
import { useAuthStore } from '@/stores/authStore';
import { useRunStore } from '@/stores/runStore';
import type { RunSummary } from '@/types/run';

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
});
