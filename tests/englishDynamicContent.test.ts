import { beforeEach, describe, expect, it, vi } from 'vitest';

const FRENCH_CONTENT =
  /[àâäçéèêëîïôöùûüÿœæ]|\b(?:dégâts|dégât|équipe|inventaire|niveau|maîtrise|soin|bouclier|armure|puissance|vitesse|objet|objets|recrutement|repos|trésor|boutique|inconnu|disponible|verrouillé|terminé|récompense|vague|cible|gagne|inflige|réduit|augmente|ennemi|proches|manquants)\b/iu;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', {
    localStorage: { getItem: () => JSON.stringify({ state: { language: 'en-US' } }) },
  });
});

describe('contenu dynamique anglais', () => {
  it('localise les catalogues, champions, arbres et rencontres générées', async () => {
    const {
      augmentDescription,
      augmentName,
      itemDescription,
      itemName,
      localizeChampion,
      localizeUserCopy,
    } = await import('@/i18n/content');
    const { implementedChampions } = await import('@/data/champion');
    const { getEnhancementTreeForRole } = await import('@/data/enhancementTrees');
    const { getRuneDefinition } = await import('@/data/items/runeDatabase');
    const { generateMap } = await import('@/game/map/MapGenerator-core');

    expect(itemName('long_sword', 'Épée longue')).toBe('Long Sword');
    expect(itemDescription('health_potion', 'Potion de soin')).toContain('Restores 150 HP');
    expect(augmentName('brute_force', 'Force brute')).toBe('Brute Force');
    expect(augmentDescription('brute_force', 'Tous les champions gagnent +7 dégâts.')).toContain(
      'All champions gain',
    );
    for (const [french, english] of [
      ["Initiative d'attaque", 'Attack initiative'],
      ['Initiative ATQ', 'Attack initiative'],
      ['I. ATQ', 'ATK INIT'],
      ['Profil de portée', 'Range profile'],
      ['Canalisation', 'Channeling'],
      ['Tir tactique', 'Tactical shot'],
      ["Initiative d'attaque après élimination", 'Attack initiative after a takedown'],
    ] as const) {
      expect(localizeUserCopy(french)).toBe(english);
    }

    for (const champion of implementedChampions) {
      const localized = localizeChampion(champion);
      expect(localized.title).not.toMatch(FRENCH_CONTENT);
      expect(localized.spells.flatMap((spell) => [spell.name, spell.description])).not.toEqual(
        expect.arrayContaining([expect.stringMatching(FRENCH_CONTENT)]),
      );
      expect(localized.passive.name).not.toMatch(FRENCH_CONTENT);
      expect(localized.passive.description).not.toMatch(FRENCH_CONTENT);
    }

    const tree = getEnhancementTreeForRole('Assassin');
    const treeCopy = [
      ...tree.coreNodes,
      ...tree.branches.flatMap((branch) => [branch, ...branch.nodes]),
    ];
    for (const entry of treeCopy) {
      expect(localizeUserCopy(entry.name)).not.toMatch(FRENCH_CONTENT);
      expect(localizeUserCopy(entry.description)).not.toMatch(FRENCH_CONTENT);
    }

    const rune = getRuneDefinition('press_the_attack');
    expect(rune).toBeDefined();
    expect(localizeUserCopy(rune?.description ?? '')).not.toMatch(FRENCH_CONTENT);

    const map = generateMap('jungle', 1, 12345);
    const generatedCopy = map.nodes.flatMap((node) => [
      node.metadata.title,
      node.metadata.description,
    ]);
    expect(generatedCopy).not.toEqual(
      expect.arrayContaining([expect.stringMatching(FRENCH_CONTENT)]),
    );
  });
});
