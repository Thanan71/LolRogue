// @vitest-environment jsdom

import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GameOverPage } from '@/pages/GameOverPage';
import { useAuthStore } from '@/stores/authStore';
import { useRunStore } from '@/stores/runStore';
import type { ChampionRunStats, RunSummary } from '@/types/run';

vi.mock('@/audio', () => ({
  playSFX: vi.fn(),
  playUIClick: vi.fn(),
}));

function championStats(championId: string, totalDamage: number): ChampionRunStats {
  return {
    championId,
    kills: championId === 'Garen' ? 4 : 1,
    assists: 2,
    totalDamage,
    damageToShields: 0,
    damageReceived: 100,
    healingDone: 25,
    healingReceived: 0,
    overhealing: 0,
    shieldingDone: 10,
    shieldingAbsorbed: 0,
    deaths: 0,
    itemsCollected: [],
    survived: true,
  };
}

describe('Game Over champion presentation', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: null,
      player: null,
      isGuest: true,
      isAuthenticated: false,
    });
    useRunStore.setState({
      saveStatus: 'idle',
      saveError: null,
      saveFailureKind: null,
      saveDiagnostic: null,
      completedRunSnapshot: null,
      serverProgression: null,
    });
  });

  it('shows champion portraits, the damage MVP and contribution to team damage', () => {
    const summary: RunSummary = {
      won: true,
      runLevel: 5,
      wavesCompleted: 16,
      biomesVisited: ['top_lane', 'jungle'],
      goldEarned: 500,
      goldSpent: 300,
      goldBalance: 200,
      itemEvents: [],
      totalKills: 5,
      totalDamage: 1_200,
      championStats: [championStats('Garen', 900), championStats('Lux', 300)],
    };

    const { container } = render(
      <MemoryRouter initialEntries={[{ pathname: '/game-over', state: { summary } }]}>
        <GameOverPage />
      </MemoryRouter>,
    );

    const garenContribution = screen.getByRole('progressbar', {
      name: 'Contribution aux dégâts de Garen',
    });
    const luxContribution = screen.getByRole('progressbar', {
      name: 'Contribution aux dégâts de Lux',
    });
    expect(garenContribution).toHaveAttribute('max', '1200');
    expect(garenContribution).toHaveAttribute('value', '900');
    expect(garenContribution).toHaveAttribute('aria-valuetext', "75 % des dégâts de l'équipe");
    expect(luxContribution).toHaveAttribute('max', '1200');
    expect(luxContribution).toHaveAttribute('value', '300');
    expect(luxContribution).toHaveAttribute('aria-valuetext', "25 % des dégâts de l'équipe");

    const garenRow = garenContribution.closest('.game-over-champion-breakdown');
    const luxRow = luxContribution.closest('.game-over-champion-breakdown');
    expect(garenRow).not.toBeNull();
    expect(luxRow).not.toBeNull();
    expect(within(garenRow as HTMLElement).getByText('MVP du run')).toBeVisible();
    expect(within(luxRow as HTMLElement).queryByText('MVP du run')).not.toBeInTheDocument();
    expect(garenRow?.querySelector('img')).toHaveAttribute(
      'src',
      '/assets/riot/16.6.1/champions/Garen.png',
    );
    expect(luxRow?.querySelector('img')).toHaveAttribute(
      'src',
      '/assets/riot/16.6.1/champions/Lux.png',
    );
    expect(container.querySelectorAll('.game-over-celebration__spark')).toHaveLength(12);
  });
});
