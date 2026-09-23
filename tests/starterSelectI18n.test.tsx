// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type RunPreparationContentCatalog,
  runPreparationContent,
} from '@/i18n/runPreparationContent';
import type { DailyChallenge } from '@/types/dailyRun';
import type { RunStartResult } from '@/types/run';
import { scanUserCopyFile } from './helpers/userCopyScanner';

const preparationMocks = vi.hoisted(() => ({
  getDailyChallenge: vi.fn(),
}));

vi.mock('@/audio', () => ({
  playUIClick: vi.fn(),
  playUIHover: vi.fn(),
  playSFX: vi.fn(),
}));

vi.mock('@/services/repositories/SupabaseDailyRunRepository', () => ({
  SupabaseDailyRunRepository: class {
    getDailyChallenge = preparationMocks.getDailyChallenge;
  },
}));

vi.mock('@/services/supabaseClient', () => ({
  supabase: {},
  isSupabaseConfigured: true,
}));

const challenge: DailyChallenge = {
  dailyDate: '2026-09-08',
  seed: 424_242,
  startsAt: '2026-09-08T00:00:00.000Z',
  expiresAt: '2026-09-09T00:00:00.000Z',
  difficulty: 'normal',
  dailyRulesetVersion: 1,
  gameplayRulesetVersion: 1,
  engineVersion: 'run-engine-v18',
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

function catalogShape(value: unknown): unknown {
  if (typeof value === 'function') return 'function';
  if (Array.isArray(value)) return value.map(catalogShape);
  if (!value || typeof value !== 'object') return typeof value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right, 'en'))
      .map(([key, child]) => [key, catalogShape(child)]),
  );
}

function setStoredLocale(locale: 'fr-FR' | 'en-US'): void {
  window.localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: locale } }));
}

async function prepareStarterState() {
  const [{ useAuthStore }, { useDailyRunStore }, { RUN_INITIAL_STATE }, { useRunStore }] =
    await Promise.all([
      import('@/stores/authStore'),
      import('@/stores/dailyRunStore'),
      import('@/stores/runInitialState'),
      import('@/stores/runStore'),
    ]);

  useAuthStore.setState({
    user: null,
    player: null,
    isAuthenticated: true,
    isGuest: true,
    isInitialized: true,
    isLoading: false,
    error: null,
  });
  useRunStore.setState({ ...RUN_INITIAL_STATE });
  useDailyRunStore.setState({
    dateKey: '2026-09-08',
    seed: challenge.seed,
    hasCompletedToday: false,
    expiresAt: challenge.expiresAt,
  });

  return { useRunStore };
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  vi.clearAllMocks();
  vi.resetModules();
});

describe('starter selection i18n', () => {
  it('keeps strict catalog parity and locale-aware counts', () => {
    const french: RunPreparationContentCatalog = runPreparationContent['fr-FR'];
    const english: RunPreparationContentCatalog = runPreparationContent['en-US'];

    expect(catalogShape(english)).toEqual(catalogShape(french));
    expect(french.starter.normalSubtitle(1_234, true)).toContain(
      new Intl.NumberFormat('fr-FR').format(1_234),
    );
    expect(english.starter.normalSubtitle(1_234, true)).toContain('1,234 champions');
    expect(french.starter.selectedChampionBadge).toBe('Dans l’équipe');
    expect(english.starter.selectedChampionBadge).toBe('On the team');
    expect(french.spellUpgrade.turns('1')).toBe('1 tour');
    expect(english.spellUpgrade.turns('2')).toBe('2 turns');
  });

  it('renders the starter journey and champion cards in English', async () => {
    setStoredLocale('en-US');
    vi.resetModules();
    await prepareStarterState();
    const { StarterSelectPage } = await import('@/pages/StarterSelectPage');

    const view = render(
      <MemoryRouter>
        <StarterSelectPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('heading', { name: 'Build your team' })).toBeInTheDocument();
    expect(screen.getByLabelText('Preparation steps')).toHaveTextContent('Team');
    expect(screen.getByText(/saved on this device only/i)).toBeInTheDocument();
    const firstChampion = screen.getAllByRole('button', { name: /^Choose / })[0];
    if (!firstChampion) throw new Error('An English starter champion is required.');
    fireEvent.click(firstChampion);
    expect(firstChampion).toHaveAttribute('data-selected-label', 'On the team');
    expect(screen.getByRole('button', { name: 'Confirm selection' })).toBeDisabled();
    expect(view.container).not.toHaveTextContent('Compose ton équipe');
    expect(view.container).not.toHaveTextContent('Sélectionne un champion');
  });

  it('refreshes a stale Daily offer from its stable code without parsing server prose', async () => {
    setStoredLocale('fr-FR');
    vi.resetModules();
    const { useRunStore } = await prepareStarterState();
    const startResult: RunStartResult = {
      success: false,
      code: 'daily_starter_not_offered',
      error: 'opaque backend failure',
      retryable: false,
    };
    const startRun = vi.fn(async () => startResult);
    useRunStore.setState({ startRun });
    preparationMocks.getDailyChallenge.mockResolvedValue({ data: challenge, error: null });
    const { StarterSelectPage } = await import('@/pages/StarterSelectPage');

    render(
      <MemoryRouter initialEntries={['/starter-select?mode=daily']}>
        <StarterSelectPage />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getAllByRole('button', { name: /^Choisir / })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer le choix' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      runPreparationContent['fr-FR'].starter.dailyOfferChanged,
    );
    expect(screen.queryByText('opaque backend failure')).not.toBeInTheDocument();
    expect(preparationMocks.getDailyChallenge).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Confirmer le choix' })).toBeDisabled(),
    );
  });

  it('contains no raw user copy in the starter selection page', () => {
    expect(scanUserCopyFile(`${process.cwd()}/src/pages/StarterSelectPage.tsx`)).toEqual([]);
  });
});
