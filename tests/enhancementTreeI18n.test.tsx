// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EnhancementTree } from '@/components/EnhancementTree';
import { garen } from '@/data/champion/Garen';
import { type Language, useSettingsStore } from '@/stores/settingsStore';
import type { ChampionTag } from '@/types/champion';

function renderTree(language: Language, role: ChampionTag = 'Fighter'): HTMLElement {
  useSettingsStore.setState({ language });
  return render(
    <EnhancementTree
      champion={{ ...garen, tags: [role] }}
      playerCandies={0}
      masteryLevel={0}
      enhancementState={{ unlockedNodes: {}, totalCandiesSpent: 0 }}
      onUnlockNode={async () => undefined}
    />,
  ).container;
}

function statBonusTexts(tree: HTMLElement): string[] {
  return [...tree.querySelectorAll('.node-stat-bonus')].map((node) => node.textContent ?? '');
}

function selectBranch(tree: HTMLElement, name: string): void {
  const branch = [...tree.querySelectorAll<HTMLButtonElement>('.branch-tab')].find((button) =>
    button.textContent?.includes(name),
  );
  if (!branch) throw new Error(`Unable to find enhancement branch: ${name}`);
  fireEvent.click(branch);
}

afterEach(() => {
  useSettingsStore.setState({ language: 'fr-FR' });
});

describe('EnhancementTree i18n', () => {
  it('renders the complete visible tree state and ARIA copy in French', () => {
    const tree = renderTree('fr-FR');

    expect(tree).toHaveTextContent('Maîtrise: Niveau 0');
    expect(tree).toHaveTextContent('⚡ Nœuds de Base');
    expect(tree).toHaveTextContent('Force');
    expect(tree).toHaveTextContent('Brute');
    expect(tree).toHaveTextContent('Frappe Lourde');
    expect(tree).toHaveTextContent('Dégâts et résistance');
    expect(tree).toHaveTextContent('Bonbons insuffisants');
    expect(tree).toHaveTextContent('Débloquer');
    expect(
      tree.querySelector('[aria-label="Aperçu des statistiques après déblocage"]'),
    ).not.toBeNull();
  });

  it('renders the same visible tree state and ARIA copy in English', () => {
    const tree = renderTree('en-US');

    expect(tree).toHaveTextContent('Enhancement Tree - Garen');
    expect(tree).toHaveTextContent('Mastery: Level 0');
    expect(tree).toHaveTextContent('⚡ Core Nodes');
    expect(tree).toHaveTextContent('Strength');
    expect(tree).toHaveTextContent('Bruiser');
    expect(tree).toHaveTextContent('Heavy Strike');
    expect(tree).toHaveTextContent('Damage and durability');
    expect(tree).toHaveTextContent('Not enough candies');
    expect(tree).toHaveTextContent('Unlock');
    expect(tree.querySelector('[aria-label="Stat preview after unlocking"]')).not.toBeNull();
    expect(tree).not.toHaveTextContent('Nœuds de Base');
    expect(tree).not.toHaveTextContent('Frappe Lourde');
  });

  it('localizes every secondary stat badge in French', () => {
    const assassin = renderTree('fr-FR', 'Assassin');
    expect(statBonusTexts(assassin)).toContain("+4 Pénétration d'armure");

    selectBranch(assassin, 'Survie');
    expect(statBonusTexts(assassin)).toEqual(
      expect.arrayContaining(['+5 Vol de vie', '+3 Omnivampirisme']),
    );

    const mage = renderTree('fr-FR', 'Mage');
    expect(statBonusTexts(mage)).toEqual(
      expect.arrayContaining(['+5 Hâte de compétence', '+4 Pénétration magique']),
    );

    const tank = renderTree('fr-FR', 'Tank');
    expect(statBonusTexts(tank)).toContain('+10 Ténacité');
  });

  it('localizes every secondary stat badge in English', () => {
    const assassin = renderTree('en-US', 'Assassin');
    expect(statBonusTexts(assassin)).toContain('+4 Armor Penetration');

    selectBranch(assassin, 'Survival');
    expect(statBonusTexts(assassin)).toEqual(
      expect.arrayContaining(['+5 Lifesteal', '+3 Omnivamp']),
    );

    const mage = renderTree('en-US', 'Mage');
    expect(statBonusTexts(mage)).toEqual(
      expect.arrayContaining(['+5 Ability Haste', '+4 Magic Penetration']),
    );

    const tank = renderTree('en-US', 'Tank');
    expect(statBonusTexts(tank)).toContain('+10 Tenacity');
  });
});
