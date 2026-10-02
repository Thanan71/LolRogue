// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Player } from '@/types/models';

const repositories = vi.hoisted(() => ({
  getPlayerRuns: vi.fn(),
  getRunDetails: vi.fn(),
  getPlayerRunStats: vi.fn(),
}));

vi.mock('@/services/supabaseClient', () => ({ supabase: {}, isSupabaseConfigured: true }));
vi.mock('@/services/container', () => ({
  RepositoryContainerFactory: {
    create: () => ({
      run: { getPlayerRuns: repositories.getPlayerRuns },
      runStats: {
        getRunDetails: repositories.getRunDetails,
        getPlayerRunStats: repositories.getPlayerRunStats,
      },
    }),
  },
}));

async function loadMessages(locale: 'fr-FR' | 'en-US') {
  window.localStorage.setItem('lolrogue-settings', JSON.stringify({ state: { language: locale } }));
  vi.resetModules();
  const [{ localizeAuthError }, runService] = await Promise.all([
    import('@/stores/authStore'),
    import('@/services/runService'),
  ]);
  return { localizeAuthError, runService };
}

describe('localized auth and profile service messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps known and unknown auth failures to controlled French messages', async () => {
    const { localizeAuthError, runService } = await loadMessages('fr-FR');

    const knownFailures = [
      ['invalid login credentials', 'Identifiants incorrects.'],
      ['invalid email', 'E-mail ou mot de passe invalide.'],
      ['Email not confirmed', 'Confirme ton adresse e-mail avant de te connecter.'],
      ['User already registered', 'Un compte existe déjà pour cette adresse e-mail.'],
      [
        'Password should be at least 6 characters',
        'Le mot de passe ne respecte pas les exigences de sécurité.',
      ],
      ['email rate limit exceeded', 'Trop de tentatives. Réessaie dans quelques instants.'],
      [
        'duplicate key value violates unique constraint players_username_key',
        'Ce nom d’utilisateur est déjà utilisé.',
      ],
      ['Failed to fetch', 'Erreur réseau. Vérifie ta connexion et réessaie.'],
    ] as const;

    for (const [message, expected] of knownFailures) {
      expect(localizeAuthError(new Error(message))).toBe(expected);
    }

    expect(localizeAuthError(new Error('opaque upstream English response'))).toBe(
      'Une erreur est survenue lors de la connexion.',
    );
    expect(await runService.getPlayerRunHistory(null)).toEqual({
      data: [],
      error: 'Authentification requise.',
    });
  });

  it('maps auth and run-service failures to controlled English messages', async () => {
    const { localizeAuthError, runService } = await loadMessages('en-US');
    repositories.getPlayerRuns.mockRejectedValue(new Error('réponse serveur brute'));
    repositories.getRunDetails.mockResolvedValue({
      data: null,
      error: new Error('réponse serveur brute'),
    });
    repositories.getPlayerRunStats.mockResolvedValue({
      data: null,
      error: new Error('réponse serveur brute'),
    });

    expect(localizeAuthError(new Error('invalid login credentials'))).toBe(
      'Incorrect credentials.',
    );
    expect(localizeAuthError(new Error('réponse serveur brute'))).toBe(
      'An error occurred while logging in.',
    );
    expect(await runService.getPlayerRunHistory(null)).toEqual({
      data: [],
      error: 'Authentication required.',
    });
    expect(await runService.getPlayerRunHistory({ id: 'player-1' } as Player)).toEqual({
      data: [],
      error: 'Unable to load run history.',
    });
    expect(await runService.getRunDetails('run-1')).toEqual({
      run: null,
      teamMembers: [],
      error: 'Unable to load run details.',
    });
    expect(await runService.getPlayerRunStats({ id: 'player-1' } as Player)).toMatchObject({
      error: 'Unable to load run statistics.',
    });
  });
});
