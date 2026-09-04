import { describe, expect, it } from 'vitest';
import { getEnhancementTreeForRole } from '../src/data/enhancementTrees';
import { getEnhancementNodeUnavailableReasons } from '../src/game/rules/catalogSupport';
import {
  applyCanonicalModifiers,
  CANONICAL_STAT_KEYS,
  normalizeGameplayStatKey,
  normalizeStatKey,
} from '../src/game/stats/statContract';
import { enhancementService } from '../src/services/enhancementService';
import { getStatBonusForLevel } from '../src/services/masteryService';
import type { ChampionTag } from '../src/types';
import type { CalculatedStats } from '../src/utils/champion';
import { applyMasteryBonus } from '../src/utils/statCalculator';

const base: CalculatedStats = {
  hp: 100,
  mp: 100,
  moveSpeed: 300,
  armor: 30,
  magicResist: 30,
  attackDamage: 60,
  attackSpeed: 0.6,
  attackRange: 500,
  abilityPower: 20,
  hpRegen: 5,
  mpRegen: 5,
  crit: 0,
};

describe('canonical stat contract', () => {
  it('uses a stable calculation order and applies caps once', () => {
    const result = applyCanonicalModifiers(base, [
      { stat: 'hp', kind: 'flat', value: 20 },
      { stat: 'hp', kind: 'additivePercent', value: 0.1 },
      { stat: 'hp', kind: 'additivePercent', value: 0.2 },
      { stat: 'hp', kind: 'multiplier', value: 2 },
      { stat: 'crit', kind: 'flat', value: 150 },
    ]);
    expect(result.hp).toBeCloseTo((100 + 20) * 1.3 * 2);
    expect(result.crit).toBe(100);
  });

  it('normalizes catalog aliases at the boundary, never in the combat schema', () => {
    expect(normalizeGameplayStatKey('atk')).toBe('attackDamage');
    expect(normalizeGameplayStatKey('armor_pen')).toBe('armorPen');
    expect(normalizeStatKey('armorPen')).toBeNull();
    expect(new Set(CANONICAL_STAT_KEYS).size).toBe(CANONICAL_STAT_KEYS.length);
  });

  it('authors no spatial-range bonus while the combat model has no positions', () => {
    for (const role of [
      'Assassin',
      'Tank',
      'Mage',
      'Marksman',
      'Fighter',
      'Support',
    ] as ChampionTag[]) {
      const tree = getEnhancementTreeForRole(role);
      const nodes = [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)];
      for (const node of nodes) {
        expect(node.statBonuses?.attackRange, `${role}/${node.id}`).toBeUndefined();
        expect(node.percentBonuses?.attackRange, `${role}/${node.id}`).toBeUndefined();
      }
    }
  });

  it.each([0, 1, 2, 3, 4])('applies mastery tier %i exactly once', (level) => {
    const result = applyMasteryBonus(base, level);
    const expectedMultiplier = 1 + getStatBonusForLevel(level);
    for (const stat of CANONICAL_STAT_KEYS) {
      expect(result[stat]).toBeCloseTo(base[stat] * expectedMultiplier);
    }
  });

  const roles: ChampionTag[] = ['Assassin', 'Tank', 'Mage', 'Marksman', 'Fighter', 'Support'];
  for (const role of roles) {
    const tree = getEnhancementTreeForRole(role);
    const nodes = [...tree.coreNodes, ...tree.branches.flatMap((branch) => branch.nodes)];
    for (const node of nodes.filter(
      (candidate) => getEnhancementNodeUnavailableReasons(candidate).length === 0,
    )) {
      it(`${role}/${node.id} contributes every authored bonus exactly once per rank`, () => {
        const bonuses = enhancementService.calculateStatBonuses(tree, { [node.id]: 1 });
        for (const [rawStat, value] of Object.entries(node.statBonuses ?? {})) {
          const stat = normalizeGameplayStatKey(rawStat);
          expect(stat).not.toBeNull();
          expect(bonuses.flat[stat!]).toBe(value);
        }
        for (const [rawStat, value] of Object.entries(node.percentBonuses ?? {})) {
          const stat = normalizeGameplayStatKey(rawStat);
          expect(stat).not.toBeNull();
          expect(bonuses.percent[stat!]).toBe(value);
        }
      });
    }
  }
});
