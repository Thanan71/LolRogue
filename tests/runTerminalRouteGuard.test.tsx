// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { EncounterRoute } from '@/components/EncounterRoute';
import { RunLifecycleRoute } from '@/components/RunLifecycleRoute';
import { RunPage } from '@/pages/RunPage';
import { createRunLedger } from '@/game/run/runLedger';
import { RUN_INITIAL_STATE } from '@/stores/runInitialState';
import { useRunStore } from '@/stores/runStore';
import type { CompletedRunSnapshot, RunSummary } from '@/types/run';

vi.mock('@/audio', () => ({
  playUIClick: vi.fn(),
}));

vi.mock('@/hooks/useRunImagePreload', () => ({
  useRunImagePreload: vi.fn(),
}));

vi.mock('@/components/RunMapScreen', () => ({
  RunMapScreen: () => <div>Run map content</div>,
}));

const RUN_ID = 'attempt_22222222-2222-4222-8222-222222222222';

function completedSnapshot(runId = RUN_ID): CompletedRunSnapshot {
  const summary: RunSummary = {
    won: false,
    runLevel: 2,
    wavesCompleted: 3,
    biomesVisited: ['top_lane'],
    goldEarned: 100,
    goldSpent: 25,
    goldBalance: 75,
    itemEvents: [],
    totalKills: 1,
    totalDamage: 250,
    championStats: [],
  };
  return {
    mode: 'normal',
    runId,
    won: false,
    runLevel: 2,
    wavesCompleted: 3,
    biomesVisited: ['top_lane'],
    goldEarned: 100,
    goldSpent: 25,
    goldBalance: 75,
    ledger: createRunLedger(['Garen']),
    summary,
    teamMembers: [{ championId: 'Garen', level: 1, currentHp: 0, currentMp: 0 }],
    startedAt: '2026-07-23T12:00:00.000Z',
    seed: 42,
    runeIds: [],
    augmentIds: [],
    daily: null,
  };
}

function setRetryableTerminalRun(): void {
  useRunStore.setState({
    ...RUN_INITIAL_STATE,
    isActive: true,
    runId: RUN_ID,
    completedRunSnapshot: completedSnapshot(),
    saveStatus: 'failed',
    saveError: 'Failed to fetch',
    saveFailureKind: 'retryable',
    currentNodeId: 'fight',
    pendingEncounter: { nodeId: 'fight', nodeType: 'combat' },
  });
}

describe('terminal run route guards', () => {
  beforeEach(() => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
  });

  afterEach(() => {
    useRunStore.setState({ ...RUN_INITIAL_STATE });
  });

  it('redirects RunPage to Game Over before reopening a pending encounter after a retryable save failure', async () => {
    setRetryableTerminalRun();

    const view = render(
      <MemoryRouter initialEntries={['/run']}>
        <Routes>
          <Route path="/run" element={<RunPage />} />
          <Route path="/combat" element={<div>Combat content</div>} />
          <Route path="/game-over" element={<div>Terminal Game Over</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Terminal Game Over')).toBeInTheDocument();
    expect(screen.queryByText('Combat content')).not.toBeInTheDocument();
    expect(screen.queryByText('Run map content')).not.toBeInTheDocument();
    view.unmount();
  });

  it('redirects EncounterRoute before rendering a terminal combat', async () => {
    setRetryableTerminalRun();

    const view = render(
      <MemoryRouter initialEntries={['/combat']}>
        <Routes>
          <Route
            path="/combat"
            element={
              <EncounterRoute expectedTypes={['combat', 'elite', 'boss']}>
                <div>Combat content</div>
              </EncounterRoute>
            }
          />
          <Route path="/game-over" element={<div>Terminal Game Over</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Terminal Game Over')).toBeInTheDocument();
    expect(screen.queryByText('Combat content')).not.toBeInTheDocument();
    view.unmount();
  });

  it('does not block a different active run because of a stale completion snapshot', () => {
    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      isActive: true,
      runId: 'new-active-run',
      completedRunSnapshot: completedSnapshot('old-completed-run'),
    });

    const view = render(
      <MemoryRouter initialEntries={['/run']}>
        <Routes>
          <Route path="/run" element={<RunPage />} />
          <Route path="/game-over" element={<div>Terminal Game Over</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Run map content')).toBeInTheDocument();
    expect(screen.queryByText('Terminal Game Over')).not.toBeInTheDocument();
    view.unmount();
  });

  it.each([
    ['/starter-select', 'start' as const],
    ['/daily-run', 'daily' as const],
    ['/game-over', 'game-over' as const],
  ])('redirects direct %s access back to the active run', async (path, intent) => {
    useRunStore.setState({
      ...RUN_INITIAL_STATE,
      isActive: true,
      runId: 'active-run',
      team: [{ championId: 'Garen' }],
    });

    const view = render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route
            path={path}
            element={
              <RunLifecycleRoute intent={intent}>
                <div>Protected lifecycle content</div>
              </RunLifecycleRoute>
            }
          />
          <Route path="/run" element={<div>Existing active run</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Existing active run')).toBeInTheDocument();
    expect(screen.queryByText('Protected lifecycle content')).not.toBeInTheDocument();
    view.unmount();
  });

  it('redirects start routes to Game Over while finalization recovery is pending', async () => {
    setRetryableTerminalRun();

    const view = render(
      <MemoryRouter initialEntries={['/starter-select']}>
        <Routes>
          <Route
            path="/starter-select"
            element={
              <RunLifecycleRoute intent="start">
                <div>Starter content</div>
              </RunLifecycleRoute>
            }
          />
          <Route path="/game-over" element={<div>Recover finalization first</div>} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Recover finalization first')).toBeInTheDocument();
    expect(screen.queryByText('Starter content')).not.toBeInTheDocument();
    view.unmount();
  });
});
