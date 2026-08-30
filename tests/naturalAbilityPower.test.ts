import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { implementedChampions } from '@/data/champion';
import { BattleManager } from '@/game/battle/BattleManager';
import { ActionType } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import type { Champion } from '@/types/champion';
import {
  NATURAL_ABILITY_POWER_BASE,
  NATURAL_ABILITY_POWER_PER_LEVEL,
  calculateStats,
  naturalAbilityPowerAtLevel,
} from '@/utils/champion';
import { gameStatsAtLevel } from '@/utils/statConversion';

function luxAtLevel(level: number): ChampionInstance {
  const source = championDB.getById('Lux');
  if (!source) throw new Error('Missing Lux.');
  return new ChampionInstance({ ...source, stats: { ...source.stats, moveSpeed: 500 } }, level);
}

function harmlessTarget(): ChampionInstance {
  const source = championDB.getById('Garen');
  if (!source) throw new Error('Missing target fixture.');
  const definition: Champion = {
    ...source,
    id: 'Target',
    key: 'target',
    name: 'Target',
    stats: {
      ...source.stats,
      hp: 5_000,
      magicResist: 0,
      magicResistPerLevel: 0,
      moveSpeed: 100,
      attackSpeed: 0,
    },
    spells: source.spells.map((spell) => ({ ...spell, effects: [] })),
  };
  return new ChampionInstance(definition);
}

function luxQDamage(level: number): number {
  const lux = luxAtLevel(level);
  const battle = new BattleManager(
    { side: 'player', champions: [lux] },
    { side: 'enemy', champions: [harmlessTarget()] },
    { autoActions: false, random: () => 0.5 },
  );
  battle.startBattle();
  const target = battle.getCombatantState('Target', 'enemy')!;
  const before = target.currentHp;
  expect(battle.submitAction({ type: ActionType.SpellQ, targetId: 'Target' })).toBe(true);
  return before - target.currentHp;
}

describe('natural ability power', () => {
  it('gives all maintained champions 25 AP at level 1 and 127 AP at level 18', () => {
    expect(NATURAL_ABILITY_POWER_BASE).toBe(25);
    expect(NATURAL_ABILITY_POWER_PER_LEVEL).toBe(6);
    expect(naturalAbilityPowerAtLevel(1)).toBe(25);
    expect(naturalAbilityPowerAtLevel(18)).toBe(127);

    for (const champion of implementedChampions) {
      expect(calculateStats(champion.stats, 1).abilityPower, `${champion.id} level 1`).toBe(25);
      expect(calculateStats(champion.stats, 18).abilityPower, `${champion.id} level 18`).toBe(127);
      expect(gameStatsAtLevel(champion.stats, 1).ap, `${champion.id} display level 1`).toBe(25);
      expect(gameStatsAtLevel(champion.stats, 18).ap, `${champion.id} display level 18`).toBe(127);
    }
  });

  it('applies the level 1 and level 18 values to a real AP-scaled combat effect', () => {
    // Lux Q rank 1 is 80 + 60% AP against zero MR.
    expect(luxQDamage(1)).toBe(95);
    expect(luxQDamage(18)).toBe(156);
  });
});
