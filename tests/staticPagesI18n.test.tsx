// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { scanUserCopyFile } from './helpers/userCopyScanner';

const STATIC_I18N_SOURCE_FILES = [
  'src/pages/AuthPage.tsx',
  'src/pages/CreditsPage.tsx',
  'src/pages/DatabasePage.tsx',
  'src/pages/database/DatabaseChampionDetail.tsx',
  'src/pages/ProfilePage.tsx',
  'src/stores/authStore.ts',
  'src/services/runService.ts',
] as const;

const mocks = vi.hoisted(() => ({
  history: vi.fn(),
  authState: {
    player: null as null | {
      id: string;
      username: string;
      display_name: string;
      level: number;
      total_candies: number;
      total_runs_completed: number;
      total_wins: number;
    },
    isGuest: true,
    isAuthenticated: false,
    isLoading: false,
    error: null as string | null,
    successMessage: null as string | null,
    login: vi.fn(),
    signUp: vi.fn(),
    clearError: vi.fn(),
    clearSuccessMessage: vi.fn(),
    enterGuestMode: vi.fn(),
  },
}));

vi.mock('@/audio', () => ({ playUIClick: vi.fn() }));
vi.mock('@/components/ParticleBackground', () => ({ ParticleBackground: () => null }));
vi.mock('@/components/EnhancementTree', () => ({ EnhancementTree: () => null }));
vi.mock('@/services/supabaseClient', () => ({ supabase: {}, isSupabaseConfigured: true }));
vi.mock('@/services/container', () => ({
  RepositoryContainerFactory: {
    create: () => ({ run: { getPlayerRunHistory: mocks.history } }),
  },
}));
vi.mock('@/stores/settingsStore', () => ({
  useSettingsStore: () => ({ language: 'en-US', setLanguage: vi.fn() }),
}));
vi.mock('@/stores/authStore', () => {
  const useAuthStore = (selector?: (state: typeof mocks.authState) => unknown) =>
    selector ? selector(mocks.authState) : mocks.authState;
  return {
    useAuthStore: Object.assign(useAuthStore, {
      getState: () => mocks.authState,
      setState: (next: Partial<typeof mocks.authState>) => Object.assign(mocks.authState, next),
    }),
  };
});
vi.mock('@/stores/enhancementStore', () => ({
  useEnhancementStore: (selector: (state: { setAvailableCandies: () => void }) => unknown) =>
    selector({ setAvailableCandies: vi.fn() }),
  useChampionEnhancements: () => ({
    state: null,
    availableCandies: 0,
    masteryLevel: 0,
    isLoading: false,
    error: null,
    statusMessage: null,
    unlockNode: vi.fn().mockResolvedValue(true),
  }),
}));

const FRENCH_COPY =
  /[àâäçéèêëîïôöùûüÿœæ]|\b(?:connexion|crédits|champion trouvé|progression synchronisée|historique récent|réessayer|retour à la liste)\b/iu;

function expectEnglishOnly(container: HTMLElement): void {
  expect(container.textContent).not.toMatch(FRENCH_COPY);
}

beforeEach(() => {
  window.localStorage.setItem(
    'lolrogue-settings',
    JSON.stringify({ state: { language: 'en-US' } }),
  );
  vi.resetModules();
  mocks.history.mockReset().mockResolvedValue({ data: [], error: null });
  Object.assign(mocks.authState, {
    player: null,
    isGuest: true,
    isAuthenticated: false,
    isLoading: false,
    error: null,
    successMessage: null,
  });
});

describe('English static pages', () => {
  it('contains no raw user copy in the static-page and auth/profile service scope', () => {
    const findings = STATIC_I18N_SOURCE_FILES.flatMap((path) =>
      scanUserCopyFile(`${process.cwd()}/${path}`, {
        additionalCopyBearingNames: ['error', 'saveError', 'detail', 'emptyMessage'],
      }),
    );

    expect(findings).toEqual([]);
  });

  it('renders the authentication experience without French copy', async () => {
    const { AuthPage } = await import('@/pages/AuthPage');
    const view = render(
      <MemoryRouter>
        <AuthPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'Build your squad. Adapt your build. Survive every turn.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Log in' })).toBeInTheDocument();
    expectEnglishOnly(view.container);
  });

  it('renders the full credits content without French copy', async () => {
    const { CreditsPage } = await import('@/pages/CreditsPage');
    const view = render(
      <MemoryRouter>
        <CreditsPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole('navigation', { name: 'Browse credits' })).toBeInTheDocument();
    expect(screen.getByText('Interface and interactive components.')).toBeInTheDocument();
    expectEnglishOnly(view.container);
  });

  it('renders database search, empty state and champion details without French copy', async () => {
    const { DatabasePage } = await import('@/pages/DatabasePage');
    const view = render(
      <MemoryRouter>
        <DatabasePage />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'no-match' } });
    expect(screen.getByText('No champion found')).toBeInTheDocument();
    expectEnglishOnly(view.container);

    const { DatabaseChampionDetail } = await import('@/pages/database/DatabaseChampionDetail');
    const { championDB } = await import('@/data/championDatabase');
    const garen = championDB.getById('Garen');
    expect(garen).toBeDefined();
    const detail = render(<DatabaseChampionDetail champion={garen!} />);
    expect(screen.getByText('Stats (level 1)')).toBeInTheDocument();
    expectEnglishOnly(detail.container);
  });

  it('renders the connected profile empty state without French copy', async () => {
    Object.assign(mocks.authState, {
      player: {
        id: 'player-1',
        username: 'player',
        display_name: 'Player',
        level: 4,
        total_candies: 1,
        total_runs_completed: 2,
        total_wins: 1,
      },
      isGuest: false,
      isAuthenticated: true,
    });
    const { ProfilePage } = await import('@/pages/ProfilePage');
    const view = render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('No recorded runs')).toBeInTheDocument());
    expect(
      screen.getByText('Your synced progress and the results of your latest expeditions.'),
    ).toBeInTheDocument();
    expectEnglishOnly(view.container);
  });
});
