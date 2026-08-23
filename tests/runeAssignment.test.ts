import { describe, expect, it } from 'vitest';
import { RUNE_DATABASE } from '@/data/items';
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import { buildCombatRuleLoadout } from '@/game/rules/loadout';
import type { CombatRuleActor } from '@/game/rules/types';
import { assignTeamRuneBudget, TEAM_RUNE_BUDGET_VERSION } from '@/game/runes/runeAssignment';

function actor(id: string): CombatRuleActor {
  return {
    id,
    side: 'player',
    currentHp: 1_000,
    maxHp: 1_000,
    currentMp: 100,
    maxMp: 100,
    isDefeated: false,
    isBuffed: false,
    isCCd: false,
  };
}

describe('shared team rune budget', () => {
  it('assigns three runes exactly once across one, two and three starters', () => {
    expect(TEAM_RUNE_BUDGET_VERSION).toBe(1);
    const runes = ['press_the_attack', 'electrocute', 'grasp_of_the_undying'];
    expect(assignTeamRuneBudget(['Garen'], runes)).toEqual({ Garen: runes });
    expect(assignTeamRuneBudget(['Garen', 'Lux'], runes)).toEqual({
      Garen: ['press_the_attack', 'grasp_of_the_undying'],
      Lux: ['electrocute'],
    });
    expect(assignTeamRuneBudget(['Garen', 'Lux', 'Ashe'], runes)).toEqual({
      Garen: ['press_the_attack'],
      Lux: ['electrocute'],
      Ashe: ['grasp_of_the_undying'],
    });
  });

  it('does not grant the starter budget to a later recruit', () => {
    const runeIds = ['conditioning', 'scorch', 'overgrowth'];
    for (const runeId of runeIds) expect(RUNE_DATABASE[runeId]).toBeDefined();
    const loadout = buildCombatRuleLoadout({
      championIds: ['Garen', 'Lux', 'Ashe'],
      runeOwnerChampionIds: ['Garen', 'Lux'],
      runeIds,
      augmentIds: [],
      inventory: [],
      getUnlockedEnhancements: () => ({}),
    });
    expect(loadout.runeAssignments).toEqual({
      Garen: ['conditioning', 'overgrowth'],
      Lux: ['scorch'],
    });

    const runtime = new CombatRuleRuntime(loadout);
    const actors = [actor('Garen'), actor('Lux'), actor('Ashe')];
    runtime.dispatch({ type: 'battle_start', actors });
    expect(runtime.getStatBonuses('Garen')).toContainEqual({ stat: 'def', flat: 10, percent: 0 });
    expect(runtime.getStatBonuses('Lux')).toContainEqual({ stat: 'ap', flat: 18, percent: 0 });
    expect(runtime.getStatBonuses('Ashe')).toEqual([]);
  });

  it('rejects duplicate owners and duplicate rune spending', () => {
    expect(() => assignTeamRuneBudget(['Garen', 'Garen'], ['conditioning'])).toThrow(
      'unique starter champions',
    );
    expect(() => assignTeamRuneBudget(['Garen'], ['conditioning', 'conditioning'])).toThrow(
      'duplicate runes',
    );
  });
});
