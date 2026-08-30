// @vitest-environment jsdom

import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { RunTeamStatsPanel } from '@/components/RunTeamStatsPanel';
import { championDB } from '@/data/championDatabase';
import { enhancementService, enhancementTreeProvider } from '@/services/enhancementService';
import { buildChampionMastery } from '@/services/masteryService';
import { useEnhancementStore } from '@/stores/enhancementStore';
import { useMasteryStore } from '@/stores/masteryStore';
import { useRunStore } from '@/stores/runStore';
import type { InventoryEntry, TeamMember } from '@/types/run';
import { calculateFullStats } from '@/utils/statCalculator';

function equippedItem(
  instanceId: string,
  name: string,
  iconUrl: string,
  stats: InventoryEntry['item']['stats'],
): InventoryEntry {
  return {
    instanceId,
    equippedToChampionId: 'Garen',
    item: {
      id: instanceId,
      name,
      description: `${name} de test`,
      iconUrl,
      stats,
      goldValue: 100,
    },
  };
}

function formatted(value: number, maximumFractionDigits = 0): string {
  return value.toLocaleString('fr-FR', { maximumFractionDigits });
}

describe('RunTeamStatsPanel', () => {
  beforeEach(() => {
    useRunStore.setState({ authorityAttempt: null });
    useEnhancementStore.setState({ enhancements: {} });
    useMasteryStore.setState({ champions: {} });
  });

  it('sélectionne un champion et expose sa fiche complète avec des commandes accessibles', () => {
    const team: TeamMember[] = [
      { championId: 'Garen', level: 3, currentHp: 410, currentXp: 25 },
      { championId: 'Lux', level: 2, currentHp: 360, currentXp: 10 },
    ];
    render(<RunTeamStatsPanel team={team} inventory={[]} />);

    const garen = screen.getByRole('button', { name: /Garen/ });
    const lux = screen.getByRole('button', { name: /Lux/ });
    expect(garen).toHaveAttribute('aria-pressed', 'true');
    expect(lux).toHaveAttribute('aria-pressed', 'false');
    expect(garen).toHaveAccessibleName(
      expect.stringMatching(
        /^Sélectionner Garen, niveau 3, 410 sur \d+ PV, expérience 25\/190 XP$/,
      ),
    );
    expect(within(garen).queryByRole('progressbar')).not.toBeInTheDocument();
    expect(garen.querySelectorAll('.run-team-stats__progress[aria-hidden="true"]')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Garen' })).toBeVisible();

    fireEvent.click(lux);

    expect(lux).toHaveAttribute('aria-pressed', 'true');
    expect(garen).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('heading', { name: 'Lux' })).toBeVisible();
    for (const label of [
      'PV actuels / maximum',
      'Attaque',
      'Puissance',
      'Armure',
      'Résistance magique',
      "Initiative d'attaque",
      'Vitesse de déplacement',
      'Critique',
    ]) {
      expect(screen.getByText(label)).toBeVisible();
    }
  });

  it('calcule la fiche avec le snapshot authority, les objets, boosts et multiplicateur', () => {
    const champion = championDB.getById('Garen');
    if (!champion) throw new Error('Garen is required by this test.');
    const authorityNodes = { fighter_core_1: 1 };
    const localNodes = { fighter_core_1: 1, fighter_core_2: 1 };
    useEnhancementStore.setState({
      enhancements: {
        Garen: { unlockedNodes: localNodes, totalCandiesSpent: 100 },
      },
    });
    useMasteryStore.setState({
      champions: { Garen: buildChampionMastery('Garen', 700, []) },
    });
    useRunStore.setState({
      authorityAttempt: {
        enhancementSnapshot: { garen: authorityNodes },
        masterySnapshot: { garen: 2 },
      } as never,
    });

    const inventory = [
      equippedItem('local-sword', 'Épée locale', '/assets/riot/16.6.1/items/1036.png', {
        hp: 150,
        atk: 10,
      }),
      equippedItem('fallback-orb', 'Orbe mystique', 'https://example.test/orb.png', {
        ap: 20,
        crit: 5,
      }),
    ];
    const member: TeamMember = {
      championId: 'Garen',
      level: 5,
      currentHp: 600,
      currentXp: 42,
      statBoosts: { armor: 7, spd: 4 },
      statMultiplier: 1.1,
    };
    const bonuses = enhancementService.calculateStatBonuses(
      enhancementTreeProvider.getTreeForChampion(champion),
      authorityNodes,
    );
    const expected = calculateFullStats(
      champion,
      5,
      bonuses,
      inventory,
      'Garen',
      2,
      member.statBoosts,
      member.statMultiplier,
    );
    const view = render(<RunTeamStatsPanel team={[member]} inventory={inventory} />);

    expect(view.container.querySelector('[data-stat="hp"] dd')).toHaveTextContent(
      `600 / ${Math.round(expected.hp)}`,
    );
    expect(view.container.querySelector('[data-stat="attackDamage"] dd')).toHaveTextContent(
      formatted(expected.attackDamage),
    );
    expect(view.container.querySelector('[data-stat="abilityPower"] dd')).toHaveTextContent(
      formatted(expected.abilityPower),
    );
    expect(view.container.querySelector('[data-stat="armor"] dd')).toHaveTextContent(
      formatted(expected.armor),
    );
    expect(view.container.querySelector('[data-stat="magicResist"] dd')).toHaveTextContent(
      formatted(expected.magicResist),
    );
    expect(view.container.querySelector('[data-stat="attackSpeed"] dd')).toHaveTextContent(
      formatted(expected.attackSpeed, 2),
    );
    expect(view.container.querySelector('[data-stat="moveSpeed"] dd')).toHaveTextContent(
      formatted(expected.moveSpeed),
    );
    expect(view.container.querySelector('[data-stat="crit"] dd')).toHaveTextContent(
      `${formatted(expected.crit)} %`,
    );

    const slots = screen.getAllByRole('listitem');
    expect(slots).toHaveLength(6);
    expect(
      screen.getByLabelText('Emplacement 1 : Épée locale').querySelector('img'),
    ).toHaveAttribute('src', '/assets/riot/16.6.1/items/1036.png');
    expect(screen.getByLabelText('Emplacement 2 : Orbe mystique').querySelector('img')).toBeNull();
    expect(view.container.querySelectorAll('.run-team-stats__item-slot--empty')).toHaveLength(4);
  });

  it('retombe sur le premier champion si la sélection disparaît et gère une équipe vide', () => {
    const { rerender } = render(
      <RunTeamStatsPanel team={[{ championId: 'Garen' }, { championId: 'Lux' }]} inventory={[]} />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Lux/ }));
    rerender(<RunTeamStatsPanel team={[{ championId: 'Garen' }]} inventory={[]} />);
    expect(screen.getByRole('button', { name: /Garen/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('heading', { name: 'Garen' })).toBeVisible();

    rerender(<RunTeamStatsPanel team={[]} inventory={[]} />);
    expect(screen.getByText('Aucun champion')).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
