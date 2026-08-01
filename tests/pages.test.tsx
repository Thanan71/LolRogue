// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { playSFX } from '@/audio/AudioManager';
import type { User } from '@supabase/supabase-js';
import { generateRunMap } from '@/game/map/MapGenerator-core';
import { NodeType, type NodeMap } from '@/game/map/types';
import { calculateRunCandyRewards } from '@/game/run/runRewards';
import { createRunLedger } from '@/game/run/runLedger';
import { AuthPage } from '@/pages/AuthPage';
import { EventPage } from '@/pages/EventPage';
import { GameOverPage } from '@/pages/GameOverPage';
import { MenuPage } from '@/pages/MenuPage';
import { RestPage } from '@/pages/RestPage';
import { ShopPage } from '@/pages/ShopPage';
import { StarterSelectPage } from '@/pages/StarterSelectPage';
import { TreasurePage } from '@/pages/TreasurePage';
import { RunMapScreen } from '@/components/RunMapScreen';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { useAuthStore } from '@/stores/authStore';
import { useRunStore } from '@/stores/runStore';
import {
  MAX_INVENTORY_ITEMS,
  type CompletedRunSnapshot,
  type ChampionRunStats,
  type InventoryEntry,
  type Item,
  type RunSummary,
} from '@/types/run';

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
  const ledger = createRunLedger(championIds);
  ledger.gold.earned = summary.goldEarned;
  ledger.gold.spent = summary.goldSpent;
  return {
    mode: 'normal',
    runId: 'completed-run',
    won: summary.won,
    runLevel: summary.runLevel,
    wavesCompleted: summary.wavesCompleted,
    biomesVisited: summary.biomesVisited,
    goldEarned: summary.goldEarned,
    goldSpent: summary.goldSpent,
    goldBalance: summary.goldBalance,
    ledger,
    summary,
    teamMembers: championIds.map((championId) => ({
      championId,
      level: 1,
      currentHp: 100,
      currentMp: 100,
    })),
    startedAt: '2026-07-23T12:00:00.000Z',
    seed: 42,
    runeIds: [],
    augmentIds: [],
    daily: null,
  };
}

function championStats(
  championId: string,
  kills: number,
  totalDamage: number,
  survived: boolean,
): ChampionRunStats {
  return {
    championId,
    kills,
    assists: 0,
    totalDamage,
    damageToShields: 0,
    damageReceived: 0,
    healingDone: 0,
    healingReceived: 0,
    overhealing: 0,
    shieldingDone: 0,
    shieldingAbsorbed: 0,
    deaths: survived ? 0 : 1,
    itemsCollected: [],
    survived,
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
      frontierNodeIds: [],
      chosenPathNodeIds: [],
      completedNodeIds: [],
      claimedEncounterNodeIds: [],
      shopNodeStates: {},
      currentBiome: null,
      pendingEncounter: null,
      currentEncounter: null,
      team: [],
      inventory: [],
      gold: 0,
      saveStatus: 'idle',
      saveError: null,
      saveFailureKind: null,
      completedRunSnapshot: null,
      serverProgression: null,
      pendingAuthorityStart: null,
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

  it('resumes an active Daily without asking to abandon it', async () => {
    const confirm = vi.spyOn(window, 'confirm');
    useRunStore.setState({
      isActive: true,
      mode: 'daily',
      runId: 'daily-active',
      team: [{ championId: 'Garen' }],
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<MenuPage />} />
          <Route path="/run" element={<div>Daily run resumed</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Daily Run/i }));

    expect(await screen.findByText('Daily run resumed')).toBeInTheDocument();
    expect(confirm).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it('keeps a Normal run when the Daily switch confirmation is cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    useRunStore.setState({
      isActive: true,
      mode: 'normal',
      runId: 'normal-active',
      team: [{ championId: 'Garen' }],
    });
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<MenuPage />} />
          <Route path="/daily-run" element={<div>Daily destination</div>} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /Daily Run/i }));

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Daily destination')).not.toBeInTheDocument();
    expect(useRunStore.getState()).toMatchObject({
      isActive: true,
      runId: 'normal-active',
    });
    confirm.mockRestore();
  });

  it('renders an active run map', () => {
    const maps = generateRunMap(12345);
    useRunStore.setState({
      isActive: true,
      biomeMaps: maps,
      currentBiomeIndex: 0,
      currentBiome: maps[0].biome,
      currentNodeId: null,
      frontierNodeIds: [maps[0].startNodeId],
    });
    renderAt(<RunMapScreen />, '/run');
    expect(screen.getByRole('button', { name: /aide/i })).toBeInTheDocument();
    expect(screen.getByText('Top_lane')).toBeInTheDocument();
    expect(document.querySelector('svg')).toBeInTheDocument();
  });

  it('never auto-selects the first child of a structural start node', () => {
    const map: NodeMap = {
      biome: 'top_lane',
      startNodeId: 'start',
      exitNodeId: 'left',
      columns: 2,
      rows: 2,
      nodes: [
        {
          id: 'start',
          type: NodeType.Start,
          column: 0,
          row: 0,
          nextNodeIds: ['left', 'right'],
          prevNodeIds: [],
          biome: 'top_lane',
          completed: false,
          accessible: true,
          encounter: null,
          metadata: { title: 'Start', description: 'Start', icon: '▶' },
        },
        {
          id: 'left',
          type: NodeType.Exit,
          column: 1,
          row: 0,
          nextNodeIds: [],
          prevNodeIds: ['start'],
          biome: 'top_lane',
          completed: false,
          accessible: false,
          encounter: null,
          metadata: { title: 'Left', description: 'Left', icon: '■' },
        },
        {
          id: 'right',
          type: NodeType.Exit,
          column: 1,
          row: 1,
          nextNodeIds: [],
          prevNodeIds: ['start'],
          biome: 'top_lane',
          completed: false,
          accessible: false,
          encounter: null,
          metadata: { title: 'Right', description: 'Right', icon: '■' },
        },
      ],
    };
    useRunStore.setState({
      isActive: true,
      biomeMaps: [map],
      currentBiomeIndex: 0,
      currentBiome: 'top_lane',
      currentNodeId: null,
      frontierNodeIds: ['start'],
    });

    renderAt(<RunMapScreen />, '/run');
    fireEvent.click(screen.getByRole('button', { name: /start, départ du biome/i }));

    expect(useRunStore.getState()).toMatchObject({
      currentNodeId: 'start',
      frontierNodeIds: ['left', 'right'],
      chosenPathNodeIds: ['start'],
      completedNodeIds: ['start'],
      pendingEncounter: null,
    });
  });

  it('shows a persisted verified start as an explicit locked recovery choice', () => {
    useAuthStore.setState({
      user: { id: 'user-1' } as User,
      isAuthenticated: true,
      isGuest: false,
    });
    useRunStore.setState({
      pendingAuthorityStart: {
        commandId: '44444444-4444-4444-8444-444444444444',
        ownerUserId: 'user-1',
        mode: 'normal',
        team: ['Garen'],
        runeIds: ['press_the_attack'],
        difficulty: 'hard',
      },
    });

    renderAt(<StarterSelectPage />, '/starter-select');

    expect(screen.getByText(/tentative vérifiée interrompue/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reprendre la run vérifiée/i })).toBeEnabled();
    const rune = screen.getByRole('checkbox', { name: /press the attack/i });
    expect(rune).toBeChecked();
    expect(rune).toBeDisabled();
  });

  it('keeps starter and rune selection explicit and enforces the three-rune limit', () => {
    renderAt(<StarterSelectPage />, '/starter-select');

    const confirm = screen.getByRole('button', { name: /confirmer le choix/i });
    expect(confirm).toBeDisabled();

    fireEvent.click(screen.getAllByRole('button', { name: /^Choisir /i })[0]);
    expect(confirm).toBeEnabled();
    expect(screen.getByText(/sélectionné$/i)).toBeInTheDocument();

    const runes = screen.getAllByRole('checkbox');
    fireEvent.click(runes[0]);
    fireEvent.click(runes[1]);
    fireEvent.click(runes[2]);

    expect(screen.getByText('3/3 sélectionnées')).toBeInTheDocument();
    expect(runes[3]).toBeDisabled();

    fireEvent.click(runes[0]);
    expect(screen.getByText('2/3 sélectionnées')).toBeInTheDocument();
    expect(runes[3]).toBeEnabled();
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

  it('does not announce a treasure item that a full inventory could not receive', async () => {
    const item: Item = {
      id: 'long_sword',
      name: 'Long Sword',
      description: 'Sword',
      iconUrl: '',
      stats: { atk: 10 },
      goldValue: 100,
    };
    const inventory: InventoryEntry[] = Array.from({ length: MAX_INVENTORY_ITEMS }, (_, index) => ({
      instanceId: `existing-${index}`,
      item: { ...item, id: `existing-${index}` },
      equippedToChampionId: null,
    }));
    const treasureNode = {
      id: 'treasure',
      type: NodeType.Treasure,
      column: 0,
      row: 0,
      prevNodeIds: [],
      nextNodeIds: [],
      biome: 'top_lane' as const,
      completed: false,
      accessible: true,
      metadata: { title: 'Treasure', description: 'Treasure', icon: '?' },
      encounter: {
        id: 'treasure-encounter',
        name: 'Treasure',
        description: 'Treasure',
        type: 'treasure' as const,
        minRunLevel: 1,
        gold: 25,
        item: {
          itemId: item.id,
          name: item.name,
          description: item.description,
          price: item.goldValue,
          iconUrl: item.iconUrl,
          stats: item.stats,
        },
      },
    };
    useRunStore.setState({
      isActive: true,
      seed: 42,
      inventory,
      gold: 0,
      biomeMaps: [
        {
          biome: 'top_lane',
          startNodeId: treasureNode.id,
          exitNodeId: treasureNode.id,
          columns: 1,
          rows: 1,
          nodes: [treasureNode],
        },
      ],
      currentBiomeIndex: 0,
      currentNodeId: treasureNode.id,
      chosenPathNodeIds: [treasureNode.id],
      pendingEncounter: { nodeId: treasureNode.id, nodeType: 'treasure' },
    });

    renderAt(<TreasurePage />, '/treasure');

    await waitFor(() => expect(screen.getByText('Item left behind')).toBeInTheDocument());
    expect(screen.queryByText('Item Received')).not.toBeInTheDocument();
    expect(useRunStore.getState().inventory).toHaveLength(MAX_INVENTORY_ITEMS);
    expect(useRunStore.getState().gold).toBe(25);
    expect(useRunStore.getState().claimedEncounterNodeIds).toEqual([treasureNode.id]);
  });

  it('renders the game over summary supplied by the router', () => {
    const summary: RunSummary = {
      won: false,
      runLevel: 3,
      wavesCompleted: 8,
      biomesVisited: ['top_lane'],
      goldEarned: 200,
      goldSpent: 0,
      goldBalance: 200,
      itemEvents: [],
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
    expect(screen.getByRole('heading', { name: 'Game Over' })).toHaveClass(
      'game-over-title--defeat',
    );
    expect(playSFX).toHaveBeenCalledWith('defeat');
    expect(screen.getByText('8')).toBeInTheDocument();
  });

  it('restores Game Over from the persisted snapshot without router state', () => {
    const summary: RunSummary = {
      won: true,
      runLevel: 4,
      wavesCompleted: 12,
      biomesVisited: ['top_lane', 'jungle'],
      goldEarned: 320,
      goldSpent: 0,
      goldBalance: 320,
      itemEvents: [],
      totalKills: 9,
      totalDamage: 2400,
      championStats: [],
    };
    useRunStore.setState({
      saveStatus: 'saved',
      completedRunSnapshot: completedSnapshot(summary, ['Garen']),
    });

    renderAt(<GameOverPage />, '/game-over');

    expect(screen.getByRole('heading', { name: 'Victory!' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Victory!' })).toHaveClass(
      'game-over-title--victory',
    );
    expect(playSFX).toHaveBeenCalledWith('victory');
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Run saved.')).toBeInTheDocument();
  });

  it('uses canonical server rewards and the snapshot team for an authenticated run', () => {
    const summary: RunSummary = {
      won: true,
      runLevel: 2,
      wavesCompleted: 7,
      biomesVisited: ['top_lane'],
      goldEarned: 180,
      goldSpent: 0,
      goldBalance: 180,
      itemEvents: [],
      totalKills: 3,
      totalDamage: 900,
      // Lux did not emit a combat statistic, but was still part of the saved team.
      championStats: [championStats('Garen', 3, 900, true)],
    };
    useAuthStore.setState({
      user: { id: 'user-1' } as User,
      isAuthenticated: true,
      isGuest: false,
    });
    useRunStore.setState({
      saveStatus: 'saved',
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
      goldSpent: 0,
      goldBalance: 80,
      itemEvents: [],
      totalKills: 1,
      totalDamage: 250,
      championStats: [championStats('Garen', 1, 250, false)],
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
      goldSpent: 0,
      goldBalance: 80,
      itemEvents: [],
      totalKills: 1,
      totalDamage: 250,
      championStats: [championStats('Garen', 1, 250, false)],
    };
    useAuthStore.setState({
      user: { id: 'user-1' } as User,
      isAuthenticated: true,
      isGuest: false,
    });
    useRunStore.setState({
      isActive: true,
      runId: 'completed-run',
      saveStatus: 'failed',
      saveError: 'network unavailable',
      saveFailureKind: 'retryable',
      completedRunSnapshot: completedSnapshot(summary, ['Garen']),
      serverProgression: null,
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/game-over', state: { summary } }]}>
        <GameOverPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('network unavailable');
    expect(screen.getByRole('button', { name: 'Retry Verification' })).toBeInTheDocument();
    expect(screen.queryByText(/Candies/)).not.toBeInTheDocument();
  });

  it('allows leaving a terminally rejected run without offering a retry', () => {
    const summary: RunSummary = {
      won: false,
      runLevel: 1,
      wavesCompleted: 2,
      biomesVisited: ['top_lane'],
      goldEarned: 50,
      goldSpent: 0,
      goldBalance: 50,
      itemEvents: [],
      totalKills: 0,
      totalDamage: 100,
      championStats: [],
    };
    useAuthStore.setState({
      user: { id: 'user-1' } as User,
      isAuthenticated: true,
      isGuest: false,
    });
    useRunStore.setState({
      isActive: false,
      saveStatus: 'failed',
      saveError: 'illegal trace',
      saveFailureKind: 'terminal',
      completedRunSnapshot: completedSnapshot(summary, ['Garen']),
      serverProgression: null,
    });

    render(
      <MemoryRouter initialEntries={[{ pathname: '/game-over', state: { summary } }]}>
        <GameOverPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No authenticated progression was awarded');
    expect(screen.queryByRole('button', { name: /Retry/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New Run' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Main Menu' })).toBeEnabled();
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
