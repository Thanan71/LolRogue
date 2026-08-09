import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { isSpellCombatReady } from '@/game/battle/combatContentSupport';
import type { Champion } from '@/types/champion';
import clientCatalogJson from '@/data/generated/champions-client.json';
import fullCatalogJson from '@/data/generated/champions-parsed.json';

const clientCatalog = clientCatalogJson as Champion[];
const fullCatalog = fullCatalogJson as Champion[];

describe('client champion catalog', () => {
  it('preserves every visible Database field and spell availability', () => {
    expect(clientCatalog.map(({ id }) => id)).toEqual(fullCatalog.map(({ id }) => id));

    for (const [index, fullChampion] of fullCatalog.entries()) {
      const clientChampion = clientCatalog[index];
      expect(clientChampion).toMatchObject({
        id: fullChampion.id,
        key: fullChampion.key,
        name: fullChampion.name,
        title: fullChampion.title,
        tags: fullChampion.tags,
        resourceType: fullChampion.resourceType,
        stats: fullChampion.stats,
        iconUrl: fullChampion.iconUrl,
      });
      expect(clientChampion.spells.map(({ name }) => name)).toEqual(
        fullChampion.spells.map(({ name }) => name),
      );
      for (const [spellIndex, fullSpell] of fullChampion.spells.entries()) {
        const clientSpell = clientChampion.spells[spellIndex];
        expect(isSpellCombatReady(clientSpell)).toBe(isSpellCombatReady(fullSpell));
        if (isSpellCombatReady(fullSpell)) {
          expect(clientSpell.description).toBe(fullSpell.description);
        }
      }
    }
  });

  it('keeps all champions addressable while shipping a smaller runtime source', () => {
    expect(championDB.count()).toBe(fullCatalog.length);
    for (const champion of fullCatalog) {
      expect(championDB.getById(champion.id)?.name).toBe(champion.name);
    }

    const clientBytes = readFileSync(
      new URL('../src/data/generated/champions-client.json', import.meta.url),
    ).length;
    const fullBytes = readFileSync(
      new URL('../src/data/generated/champions-parsed.json', import.meta.url),
    ).length;
    expect(clientBytes).toBeLessThan(fullBytes * 0.4);
  });
});
