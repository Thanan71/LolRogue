import { beforeEach, describe, expect, it, vi } from 'vitest';

const FRENCH_CONTENT =
  /[àâäçéèêëîïôöùûüÿœæ]|\b(?:dégâts|dégât|équipe|inventaire|niveau|maîtrise|soin|bouclier|armure|puissance|vitesse|objet|objets|recrutement|repos|trésor|boutique|inconnu|disponible|verrouillé|terminé|récompense|vague|cible|gagne|inflige|réduit|augmente|ennemi|proches|manquants)\b/iu;

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('window', {
    localStorage: { getItem: () => JSON.stringify({ state: { language: 'en-US' } }) },
  });
});

describe('contenu dynamique anglais explicite', () => {
  it('localise les inventaires et champions depuis leurs catalogues', async () => {
    const content = await import('@/i18n/content');
    const { implementedChampions } = await import('@/data/champion');

    expect(content).not.toHaveProperty('localizeUserCopy');
    expect(content.itemName('long_sword', 'Épée longue')).toBe('Long Sword');
    expect(content.itemName('', 'Épée longue')).toBe('Long Sword');
    expect(content.itemDescription('health_potion', 'Potion de soin')).toContain('Restores 150 HP');
    expect(content.augmentName('brute_force', 'Force brute')).toBe('Brute Force');
    expect(
      content.augmentDescription('brute_force', 'Tous les champions gagnent +7 dégâts.'),
    ).toContain('All champions gain');
    expect(content.runeName('press_the_attack', 'Attaque soutenue')).toBe('Press the Attack');
    expect(content.runeDescription('press_the_attack', 'Description française')).not.toMatch(
      FRENCH_CONTENT,
    );

    for (const champion of implementedChampions) {
      const localized = content.localizeChampion(champion);
      expect(localized.title).not.toMatch(FRENCH_CONTENT);
      expect(localized.spells.flatMap((spell) => [spell.name, spell.description])).not.toEqual(
        expect.arrayContaining([expect.stringMatching(FRENCH_CONTENT)]),
      );
      expect(localized.passive.name).not.toMatch(FRENCH_CONTENT);
      expect(localized.passive.description).not.toMatch(FRENCH_CONTENT);
    }
  });

  it('expose des arbres d’amélioration anglais sans traduction à la volée', async () => {
    const { enhancementContent } = await import('@/i18n/enhancementContent');
    const catalog = enhancementContent['en-US'];
    const copy = [
      ...Object.values(catalog.roles).map(({ name }) => name),
      ...Object.values(catalog.masteryUnlocks).flatMap(({ name, description }) => [
        name,
        description,
      ]),
      ...Object.values(catalog.branches).flatMap(({ name, description }) => [name, description]),
      ...Object.values(catalog.coreNodes).flatMap(({ name, description }) => [name, description]),
      ...Object.values(catalog.nodes).flatMap(({ name, description }) => [name, description]),
    ];

    expect(copy).not.toEqual(expect.arrayContaining([expect.stringMatching(FRENCH_CONTENT)]));
  });

  it('génère les rencontres anglaises depuis leur catalogue', async () => {
    const { generateMap } = await import('@/game/map/MapGenerator-core');
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
