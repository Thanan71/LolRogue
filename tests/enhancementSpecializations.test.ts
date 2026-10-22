import { describe, expect, it } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { CHAMPION_ENHANCEMENT_SPECIALIZATIONS } from '@/data/enhancementSpecializations';
import { ENHANCEMENT_TREES_BY_ROLE } from '@/data/enhancementTrees';
import { ActionType } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { DamageType } from '@/game/effects/types';
import {
  extendEnhancementTreeForChampion,
  getEnhancementContractForChampion,
  getEnhancementTreeForChampion,
} from '@/game/enhancements/catalog';
import { validateEnhancementContract } from '@/game/enhancements/contract';
import {
  getActiveEnhancementRanks,
  planEnhancementPurchase,
  previewEnhancementPurchase,
} from '@/game/enhancements/eligibility';
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import { getEnhancementNodeUnavailableReasons } from '@/game/rules/catalogSupport';
import { type CombatRuleActor, EMPTY_COMBAT_RULE_LOADOUT } from '@/game/rules/types';
import {
  enhancementSpecializationContent,
  getSpecializationBranchContent,
  getSpecializationNodeContent,
} from '@/i18n/enhancementSpecializations';
import { enhancementService } from '@/services/enhancementService';
import type { Champion } from '@/types/champion';

const enabledGates = ['champion_specializations'];
const context = {
  unlockedNodes: {},
  masteryLevel: 4,
  availableCandies: 1_000,
  totalCandiesSpent: 0,
  enabledGates,
};
const champions = Object.keys(CHAMPION_ENHANCEMENT_SPECIALIZATIONS);

function champion(id: string): Champion {
  const definition = championDB.getById(id);
  if (!definition) throw new Error(`Missing maintained champion ${id}`);
  return definition;
}

function pathBonuses(championId: string, branchId: string) {
  const tree = getEnhancementTreeForChampion(champion(championId));
  const branch = tree.branches.find(({ id }) => id === branchId);
  if (!branch) throw new Error(`Missing path ${branchId}`);
  return enhancementService.calculateStatBonuses(
    tree,
    Object.fromEntries(branch.nodes.map(({ id }) => [id, 1])),
  );
}

function actor(id: string, extra: Partial<CombatRuleActor> = {}): CombatRuleActor {
  return {
    id,
    side: 'player',
    currentHp: 500,
    maxHp: 1_000,
    currentMp: 100,
    maxMp: 100,
    isDefeated: false,
    isBuffed: false,
    isCCd: false,
    ...extra,
  };
}

describe('four targeted champion specializations', () => {
  it('adds exactly sixteen stable nodes without editing or duplicating any shared role tree', () => {
    const before = JSON.stringify(ENHANCEMENT_TREES_BY_ROLE);
    const nodes = Object.values(CHAMPION_ENHANCEMENT_SPECIALIZATIONS).flatMap(({ branches }) =>
      branches.flatMap(({ nodes }) => nodes),
    );
    expect(champions).toEqual(['Garen', 'Annie', 'Soraka', 'Jinx']);
    expect(nodes).toHaveLength(16);
    expect(new Set(nodes.map(({ id }) => id)).size).toBe(16);
    expect(
      nodes.every((node) => node.gate === 'champion_specializations' && node.maxRanks === 1),
    ).toBe(true);
    expect(nodes.every((node) => getEnhancementNodeUnavailableReasons(node).length === 0)).toBe(
      true,
    );
    expect(
      Object.values(ENHANCEMENT_TREES_BY_ROLE).flatMap((tree) => [
        ...tree.coreNodes,
        ...tree.branches.flatMap(({ nodes }) => nodes),
      ]),
    ).toHaveLength(72);
    expect(JSON.stringify(ENHANCEMENT_TREES_BY_ROLE)).toBe(before);
  });

  it.each(champions)(
    '%s keeps its base role, publishes two optional exclusive paths, and defaults to a closed purchase gate',
    (id) => {
      const definition = champion(id);
      const base = ENHANCEMENT_TREES_BY_ROLE[definition.tags[0]];
      const tree = getEnhancementTreeForChampion(definition);
      const contract = getEnhancementContractForChampion(definition);
      expect(tree.coreNodes).toBe(base.coreNodes);
      expect(tree.branches.slice(0, base.branches.length)).toEqual(base.branches);
      expect(contract.id).toBe(`champion:${id}`);
      expect(contract.nodes).toHaveLength(16);
      expect(validateEnhancementContract(JSON.parse(JSON.stringify(contract))).valid).toBe(true);
      const paths = CHAMPION_ENHANCEMENT_SPECIALIZATIONS[id].branches;
      expect(paths).toHaveLength(2);
      for (const path of paths) {
        expect(
          path.nodes.map(({ candyCost, requiredMasteryLevel }) => [
            candyCost,
            requiredMasteryLevel,
          ]),
        ).toEqual([
          [80, 2],
          [120, 3],
        ]);
        expect(
          previewEnhancementPurchase(path.nodes[0], { ...context, contract, enabledGates: [] })
            .reason?.code,
        ).toBe('gated');
        expect(
          previewEnhancementPurchase(path.nodes[0], { ...context, contract, masteryLevel: 2 })
            .eligible,
        ).toBe(true);
        expect(
          previewEnhancementPurchase(path.nodes[1], { ...context, contract }).reason?.code,
        ).toBe('prerequisite');
        expect(planEnhancementPurchase(contract, path.nodes[1].id, context)).toMatchObject({
          reachable: true,
          requiredCandies: 200,
        });
        const other = paths.find(({ id }) => id !== path.id)!;
        const owned = { [path.nodes[0].id]: 1 };
        for (const candidate of other.nodes)
          expect(
            previewEnhancementPurchase(candidate, { ...context, contract, unlockedNodes: owned })
              .reason?.code,
          ).toBe('exclusive');
        const active = getActiveEnhancementRanks(
          contract,
          { unlockedNodes: owned, totalCandiesSpent: 80 },
          context,
        );
        expect(active).toEqual(owned);
      }
      // A role-only build remains valid and gains no specialized ownership automatically.
      expect(
        getActiveEnhancementRanks(
          contract,
          {
            unlockedNodes: { [base.coreNodes[0].id]: 1 },
            totalCandiesSpent: base.coreNodes[0].candyCost,
          },
          context,
        ),
      ).toEqual({ [base.coreNodes[0].id]: 1 });
    },
  );

  it('keeps first-tag order and the explicit Fighter fallback, extending only the canonical role', () => {
    expect(getEnhancementTreeForChampion({ id: 'Garen', tags: ['Mage', 'Fighter'] })).toBe(
      ENHANCEMENT_TREES_BY_ROLE.Mage,
    );
    expect(getEnhancementTreeForChampion({ id: 'Annie', tags: ['Tank', 'Mage'] })).toBe(
      ENHANCEMENT_TREES_BY_ROLE.Tank,
    );
    expect(getEnhancementTreeForChampion({ id: 'Veigar', tags: ['Mage'] })).toBe(
      ENHANCEMENT_TREES_BY_ROLE.Mage,
    );
    expect(extendEnhancementTreeForChampion(ENHANCEMENT_TREES_BY_ROLE.Assassin, 'Katarina')).toBe(
      ENHANCEMENT_TREES_BY_ROLE.Assassin,
    );
    expect(getEnhancementTreeForChampion({ id: 'Unknown', tags: [] })).toBe(
      ENHANCEMENT_TREES_BY_ROLE.Fighter,
    );
    expect(
      getEnhancementTreeForChampion({ id: 'Unknown', tags: ['Unknown'] } as unknown as Champion),
    ).toBe(ENHANCEMENT_TREES_BY_ROLE.Fighter);
  });

  it('provides complete FR/EN copies for exactly the authored branches and nodes', () => {
    const branches = Object.values(CHAMPION_ENHANCEMENT_SPECIALIZATIONS).flatMap(
      ({ branches }) => branches,
    );
    for (const locale of ['fr-FR', 'en-US'] as const) {
      const catalog = enhancementSpecializationContent[locale];
      expect(Object.keys(catalog.branches).sort()).toEqual(branches.map(({ id }) => id).sort());
      expect(Object.keys(catalog.nodes).sort()).toEqual(
        branches.flatMap(({ nodes }) => nodes.map(({ id }) => id)).sort(),
      );
      for (const branch of branches) {
        expect(getSpecializationBranchContent(locale, branch.id)?.name).toBeTruthy();
        for (const node of branch.nodes) {
          const copy = getSpecializationNodeContent(locale, node.id);
          expect(copy?.name).toBeTruthy();
          expect(copy?.description).toBeTruthy();
          const normalizedNumbers = (text: string) =>
            (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((number) => number.replace(',', '.'));
          expect(normalizedNumbers(copy!.description)).toEqual(normalizedNumbers(node.description));
        }
      }
      expect(getSpecializationNodeContent(locale, 'unknown')).toBeNull();
      expect(getSpecializationBranchContent(locale, 'unknown')).toBeNull();
    }
  });

  it('uses actual additive stat formulas and leaves champion kits, execution thresholds and Pyromania unchanged', () => {
    const kitBefore = JSON.stringify(champions.map((id) => champion(id).spells));
    const garen = new ChampionInstance(champion('Garen'), 5);
    const garenBase = garen.getStats();
    const durability = garen.getStatsWithEnhancements(pathBonuses('Garen', 'garen_durability'));
    expect(durability.hp).toBeCloseTo(garenBase.hp * 1.05);
    expect(durability.armor).toBeCloseTo(garenBase.armor + 6);
    const annie = new ChampionInstance(champion('Annie'), 5);
    const control = annie.getStatsWithEnhancements(pathBonuses('Annie', 'annie_control'));
    expect(control.magicResist).toBeCloseTo(annie.getStats().magicResist + 6);
    expect(control.mpRegen).toBeCloseTo(annie.getStats().mpRegen + 1);
    expect(pathBonuses('Annie', 'annie_control').flat.abilityHaste).toBe(4);
    const jinx = new ChampionInstance(champion('Jinx'), 5);
    expect(
      jinx.getStatsWithEnhancements(pathBonuses('Jinx', 'jinx_sustained')).attackSpeed,
    ).toBeCloseTo(jinx.getStats().attackSpeed * 1.04);
    expect(jinx.getStatsWithEnhancements(pathBonuses('Jinx', 'jinx_finisher')).crit).toBeCloseTo(
      Math.min(100, jinx.getStats().crit + 3),
    );
    expect(JSON.stringify(champions.map((id) => champion(id).spells))).toBe(kitBefore);
  });

  it.each([
    ['Garen', 'garen_execution'],
    ['Jinx', 'jinx_finisher'],
  ] as const)(
    '%s adds exactly 6%% damage strictly below 40%% HP, without granting resets',
    (championId, branchId) => {
      const bonuses = pathBonuses(championId, branchId);
      const source = actor(championId);
      const target = actor('Target', { side: 'enemy', currentHp: 399 });
      const rules = new CombatRuleRuntime(
        {
          ...EMPTY_COMBAT_RULE_LOADOUT,
          enhancementEffects: { [championId]: bonuses.effects },
          enhancementStats: { [championId]: bonuses },
        },
        () => 0.5,
      );
      const event = {
        type: 'before_damage' as const,
        source,
        target,
        amount: 100,
        damageType: DamageType.AD,
        action: ActionType.BasicAttack,
        isCrit: false,
        actors: [source, target],
      };
      expect(rules.dispatch(event).damageMultiplier).toBeCloseTo(1.06);
      expect(
        rules.dispatch({ ...event, target: { ...target, currentHp: 400 } }).damageMultiplier,
      ).toBe(1);
      expect(bonuses.effects.map(({ type }) => type)).toEqual(['execute_damage']);
    },
  );

  it('keeps Annie amplification scoped to R and Soraka healing at the declared additive rate', () => {
    const annieBonus = pathBonuses('Annie', 'annie_burst');
    const source = actor('Annie');
    const target = actor('Target', { side: 'enemy' });
    const rules = new CombatRuleRuntime({
      ...EMPTY_COMBAT_RULE_LOADOUT,
      enhancementEffects: { Annie: annieBonus.effects },
      enhancementStats: { Annie: annieBonus },
    });
    const event = {
      type: 'before_damage' as const,
      source,
      target,
      amount: 100,
      damageType: DamageType.AP,
      action: ActionType.SpellR,
      isCrit: false,
      actors: [source, target],
    };
    expect(rules.dispatch(event).damageMultiplier).toBeCloseTo(1.06);
    expect(rules.dispatch({ ...event, action: ActionType.SpellQ }).damageMultiplier).toBe(1);
    const healing = pathBonuses('Soraka', 'soraka_healing');
    const healRules = new CombatRuleRuntime({
      ...EMPTY_COMBAT_RULE_LOADOUT,
      enhancementEffects: { Soraka: healing.effects },
      enhancementStats: { Soraka: healing },
    });
    expect(
      healRules.dispatch({
        type: 'before_heal',
        source: actor('Soraka'),
        target: actor('Garen'),
        amount: 100,
      }).healMultiplier,
    ).toBeCloseTo(1.05);
  });
});
