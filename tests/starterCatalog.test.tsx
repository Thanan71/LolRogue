// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, expect, it, vi } from 'vitest';
import {
  normalizeChampionSearch,
  STARTER_PAGE_SIZE,
  starterCatalogPage,
} from '@/pages/starter/catalogView';

vi.mock('@/audio', () => ({ playUIClick: vi.fn() }));
vi.mock('@/data/champion', async (original) => {
  const actual = await original<typeof import('@/data/champion')>();
  return {
    ...actual,
    implementedChampions: Array.from({ length: 180 }, (_, index) => ({
      ...actual.implementedChampions[0],
      id: `Fixture${String(index + 1).padStart(3, '0')}`,
      name: `Champion${String(index + 1).padStart(3, '0')}`,
    })),
  };
});

afterEach(cleanup);

it('bounds a large catalogue, clamps expired pages and searches accents consistently', () => {
  const entries = Array.from({ length: 180 }, (_, index) => index);
  expect(starterCatalogPage(entries, 1).champions).toHaveLength(STARTER_PAGE_SIZE);
  expect(starterCatalogPage(entries, 15).champions).toEqual(entries.slice(168));
  expect(starterCatalogPage(entries.slice(0, 2), 15)).toEqual({
    page: 1,
    pageCount: 1,
    champions: [0, 1],
  });
  expect(normalizeChampionSearch('  ÉLECTROCUTION  ')).toBe('electrocution');
});

it('keeps choices across pages and search, and submits the visible team in selection order', async () => {
  const [
    { StarterSelectPage },
    { useAuthStore },
    { useRunStore },
    { RUN_INITIAL_STATE },
    { useChampionEconomyStore },
  ] = await Promise.all([
    import('@/pages/StarterSelectPage'),
    import('@/stores/authStore'),
    import('@/stores/runStore'),
    import('@/stores/runInitialState'),
    import('@/stores/championEconomyStore'),
  ]);
  useAuthStore.setState({
    user: null,
    isGuest: true,
    isAuthenticated: true,
    isInitialized: true,
    isLoading: false,
  });
  const startRun = vi.fn(async () => ({
    success: false as const,
    code: 'start_failed' as const,
    error: 'fixture',
    retryable: true,
  }));
  useRunStore.setState({ ...RUN_INITIAL_STATE, startRun });
  useChampionEconomyStore.setState({
    snapshot: {
      enabled: true,
      economyVersion: 1,
      catalogVersion: 1,
      gameplayRulesetVersion: 21,
      serverNow: '2026-10-09T12:00:00Z',
      rotation: null,
      wallet: null,
      ownedChampionIds: [],
      firstWinChampionIds: [],
      catalog: Array.from({ length: 180 }, (_, index) => ({
        championId: `Fixture${String(index + 1).padStart(3, '0')}`,
        priceShards: 0,
        permanentFree: true,
      })),
    },
    status: 'ready',
    refresh: vi.fn(async () => undefined),
  });
  render(
    <MemoryRouter>
      <StarterSelectPage />
    </MemoryRouter>,
  );
  expect(screen.getAllByRole('button', { name: /^Choisir / })).toHaveLength(12);
  fireEvent.click(screen.getByRole('button', { name: 'Choisir Champion001' }));
  fireEvent.click(screen.getByRole('button', { name: 'Page suivante' }));
  fireEvent.click(screen.getByRole('button', { name: 'Choisir Champion013' }));
  fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher un champion' }), {
    target: { value: 'Champion150' },
  });
  expect(screen.getAllByRole('button', { name: /^Choisir / })).toHaveLength(1);
  expect(
    screen.getByRole('button', { name: 'Retirer Champion001 de l’équipe' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Retirer Champion013 de l’équipe' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Confirmer le choix' }));
  expect(startRun).toHaveBeenCalledWith(
    ['Fixture001', 'Fixture013'],
    expect.objectContaining({ runeIds: [] }),
  );

  const removeFirst = screen.getByRole('button', { name: 'Retirer Champion001 de l’équipe' });
  removeFirst.focus();
  fireEvent.click(removeFirst);
  const removeRemaining = screen.getByRole('button', {
    name: 'Retirer Champion013 de l’équipe',
  });
  await waitFor(() => expect(removeRemaining).toHaveFocus());
  fireEvent.click(removeRemaining);
  await waitFor(() =>
    expect(screen.getByRole('searchbox', { name: 'Rechercher un champion' })).toHaveFocus(),
  );
});
