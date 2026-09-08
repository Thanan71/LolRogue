// @vitest-environment jsdom

import { render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { EnhancementTree } from '@/components/EnhancementTree';
import { garen } from '@/data/champion/Garen';
import { type Language, useSettingsStore } from '@/stores/settingsStore';

function renderTree(language: Language): HTMLElement {
  useSettingsStore.setState({ language });
  return render(
    <EnhancementTree
      champion={garen}
      playerCandies={0}
      masteryLevel={0}
      enhancementState={{ unlockedNodes: {}, totalCandiesSpent: 0 }}
      onUnlockNode={async () => undefined}
    />,
  ).container;
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
});
