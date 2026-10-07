import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { implementedChampions } from '@/data/champion';
import { AUGMENT_DATABASE } from '@/data/items/augmentDatabase';
import { ITEM_DATABASE } from '@/data/items/itemDatabase';
import { RUNE_DATABASE } from '@/data/items/runeDatabase';
import { isPassiveCombatReady, isSpellCombatReady } from '@/game/battle/combatContentSupport';
import { ENCOUNTER_POOLS } from '@/game/map/encounters';
import { validateRuleCatalogs } from '@/game/rules/catalogValidation';
import { RuneConditionType } from '@/types/inventory';

afterEach(() => vi.restoreAllMocks());

describe('content admission engine support gate', () => {
  it('requires every playable passive and every spell rank to be implemented', () => {
    // Hawkshot is spatial vision: the existing UI explicitly disables it.
    // Pin that exception so adding any other unsupported spell fails this gate.
    const explicitlyUnavailable = new Set(['Ashe:AsheSpiritOfTheHawk']);
    const observedUnavailable = new Set<string>();
    for (const champion of implementedChampions) {
      expect(isPassiveCombatReady(champion.id, champion.passive), champion.id).toBe(true);
      for (const spell of champion.spells) {
        const id = `${champion.id}:${spell.id}`;
        if (explicitlyUnavailable.has(id)) {
          expect(isSpellCombatReady(spell), id).toBe(false);
          observedUnavailable.add(id);
          continue;
        }
        for (let rank = 1; rank <= spell.maxRank; rank++) {
          expect(isSpellCombatReady(spell, rank), `${champion.id}:${spell.id}:${rank}`).toBe(true);
        }
      }
    }
    expect(observedUnavailable).toEqual(explicitlyUnavailable);
  });

  it('requires all published combat encounters to reference supported opponents', () => {
    const roster = new Set(implementedChampions.map(({ id }) => id));
    const ids = new Set<string>();
    for (const encounter of Object.values(ENCOUNTER_POOLS).flat()) {
      expect(ids.has(encounter.id), encounter.id).toBe(false);
      ids.add(encounter.id);
      expect(encounter.enemies.length, encounter.id).toBeGreaterThan(0);
      for (const enemy of encounter.enemies) {
        expect(roster.has(enemy.championId), `${encounter.id}:${enemy.championId}`).toBe(true);
        expect(enemy.statMultiplier, encounter.id).toBeGreaterThan(0);
      }
    }
  });

  it('requires real RuneManager branches for every catalog condition', () => {
    const source = readFileSync(
      new URL('../src/game/runes/RuneManager.ts', import.meta.url),
      'utf8',
    );
    const conditionBody =
      source.split('switch (condition.type)')[1]?.split('private _matchesEvent')[0] ?? '';
    for (const rune of Object.values(RUNE_DATABASE)) {
      const key = Object.entries(RuneConditionType).find(
        ([, value]) => value === rune.condition.type,
      )?.[0];
      expect(key, rune.id).toBeDefined();
      expect(conditionBody, rune.id).toContain(`case RuneConditionType.${key}:`);
    }
  });

  it('fails when an item or augment introduces an unknown handler', () => {
    const item = Object.values(ITEM_DATABASE).find((value) => value.passive)!;
    const augment = Object.values(AUGMENT_DATABASE)[0];
    const originalPassive = item.passive;
    const originalEffects = augment.effects;
    try {
      item.passive = { ...originalPassive!, id: 'unsupported-sprint-g-passive' };
      augment.effects = [
        {
          ...originalEffects[0],
          type: 'unsupported-sprint-g-effect' as (typeof originalEffects)[number]['type'],
        },
      ];
      const issues = validateRuleCatalogs();
      expect(issues.some((issue) => issue.includes('unsupported-sprint-g-passive'))).toBe(true);
      expect(issues.some((issue) => issue.includes('unsupported-sprint-g-effect'))).toBe(true);
    } finally {
      item.passive = originalPassive;
      augment.effects = originalEffects;
    }
    expect(validateRuleCatalogs()).toEqual([]);
  });
});
