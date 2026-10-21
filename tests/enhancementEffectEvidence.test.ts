import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { ENHANCEMENT_TREES_BY_ROLE } from '@/data/enhancementTrees';
import { BattleManager } from '@/game/battle/BattleManager';
import { resolveBattleRuleEffect } from '@/game/battle/BattleRuleEffectResolver';
import { ActionType } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { DamageEffect } from '@/game/effects/DamageEffect';
import { DamageType } from '@/game/effects/types';
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import {
  SUPPORTED_ENHANCEMENT_EFFECTS,
  UNAVAILABLE_ENHANCEMENT_EFFECTS,
} from '@/game/rules/catalogSupport';
import type { CombatRuleActor, CombatRuleLoadout } from '@/game/rules/types';
import { getEnhancementNodeContent } from '@/i18n/enhancementContent';
import { enhancementService } from '@/services/enhancementService';
import { calculateStats } from '@/utils/champion';
import { applyEnhancementBonuses } from '@/utils/statCalculator';
import {
  ENHANCEMENT_EFFECT_EVIDENCE,
  ENHANCEMENT_SHARED_EFFECT_CONTRACTS,
  getNodeEffectEvidence,
} from '../tooling/enhancements/effectEvidence';

const trees = Object.values(ENHANCEMENT_TREES_BY_ROLE);
const nodes = trees.flatMap((tree) => [
  ...tree.coreNodes,
  ...tree.branches.flatMap((branch) => branch.nodes),
]);

function node(id: string) {
  const found = nodes.find((entry) => entry.id === id);
  if (!found) throw new Error(`Missing audit fixture: ${id}`);
  return found;
}

function actor(overrides: Partial<CombatRuleActor> = {}): CombatRuleActor {
  return {
    id: 'Garen',
    side: 'player',
    currentHp: 800,
    maxHp: 1000,
    currentMp: 10,
    maxMp: 100,
    isDefeated: false,
    isBuffed: false,
    isCCd: false,
    ...overrides,
  };
}

function runtimeFor(id: string, random = () => 0.999) {
  const loadout: CombatRuleLoadout = {
    runeIds: [],
    runeAssignments: {},
    augmentIds: [],
    inventory: [],
    enhancementStats: {},
    enhancementEffects: { Garen: node(id).effects ?? [] },
  };
  return new CombatRuleRuntime(loadout, random);
}

function damageEvent(action = ActionType.BasicAttack, amount = 10) {
  const source = actor();
  const target = actor({ id: 'Darius', side: 'enemy', maxHp: 500 });
  return {
    type: 'damage_dealt' as const,
    source,
    target,
    actors: [source, target],
    action,
    amount,
    damageType: DamageType.AD,
    isCrit: false,
  };
}

function resolverFixture() {
  const battle = new BattleManager(
    { side: 'player', champions: [new ChampionInstance(championDB.getById('Garen')!)] },
    { side: 'enemy', champions: [new ChampionInstance(championDB.getById('Darius')!)] },
    { autoActions: false, random: () => 0.5 },
  );
  battle.startBattle();
  const combatants = [...battle.getPlayerCombatants(), ...battle.getEnemyCombatants()];
  return {
    target: battle.getEnemyCombatants()[0],
    host: {
      findCombatantByChampionId: (id: string) =>
        combatants.find((entry) => entry.champion.id === id),
      applyHeal: vi.fn(),
      applyDamageToTarget: vi.fn(),
      syncEffectState: vi.fn(),
      emit: vi.fn(),
    },
  };
}

describe('TREE-01: effect evidence completeness', () => {
  it('qualifies all 72 nodes, independently of structural reachability', () => {
    expect(nodes).toHaveLength(72);
    for (const entry of nodes) {
      const evidence = getNodeEffectEvidence(entry);
      expect(evidence.contributions.length, entry.id).toBeGreaterThan(0);
      expect(evidence.runtimeConsumers.length, entry.id).toBeGreaterThan(0);
      expect(evidence.owner.length, entry.id).toBeGreaterThan(0);
      expect(evidence.followUp, entry.id).toContain('TREE-04');
      if (evidence.status !== 'implemented') {
        expect(evidence.discrepancies.length, entry.id).toBeGreaterThan(0);
        expect(evidence.followUp, entry.id).toContain('TREE-03');
      }
    }
  });

  it('has neither missing effect types nor stale entries outside the catalogue', () => {
    const types = [
      ...new Set(nodes.flatMap((entry) => (entry.effects ?? []).map(({ type }) => type))),
    ].sort();
    expect(Object.keys(ENHANCEMENT_EFFECT_EVIDENCE).sort()).toEqual(types);
    for (const type of types) {
      const evidence = ENHANCEMENT_EFFECT_EVIDENCE[type];
      expect(
        SUPPORTED_ENHANCEMENT_EFFECTS.has(type) || UNAVAILABLE_ENHANCEMENT_EFFECTS.has(type),
        type,
      ).toBe(true);
      expect(evidence.status === 'descriptive', type).toBe(
        UNAVAILABLE_ENHANCEMENT_EFFECTS.has(type),
      );
    }
  });

  it('fails explicitly for an unaudited effect, stat, non-finite value or empty node', () => {
    expect(() => getNodeEffectEvidence({ id: 'new', effects: [{ type: 'unknown' }] })).toThrow(
      'Unaudited enhancement effect',
    );
    expect(() => getNodeEffectEvidence({ id: 'new', statBonuses: { unknown: 1 } })).toThrow(
      'Unaudited enhancement stat',
    );
    expect(() => getNodeEffectEvidence({ id: 'new', statBonuses: { hp: Number.NaN } })).toThrow(
      'Unaudited enhancement stat',
    );
    expect(() => getNodeEffectEvidence({ id: 'new' })).toThrow('without audited contribution');
  });

  it('keeps every evidence path and symbol tied to a physical source', () => {
    const sources = [
      ...nodes.flatMap((entry) => getNodeEffectEvidence(entry).runtimeConsumers),
      ...ENHANCEMENT_SHARED_EFFECT_CONTRACTS.flatMap((entry) => [...entry.evidence]),
    ];
    for (const { path, symbol } of sources) {
      const absolute = resolve(process.cwd(), path);
      expect(existsSync(absolute), path).toBe(true);
      const source = readFileSync(absolute, 'utf8');
      // A class-qualified member is checked by its member identifier; full behavior is probed below.
      const member = symbol.split('.').pop()!;
      expect(source.includes(member), `${path}#${symbol}`).toBe(true);
    }
  });
});

describe('TREE-01: observed description/calculation discrepancies (no gameplay repair)', () => {
  it('Tir Déchirant emits a true DoT at every eligible hit without its advertised 15% roll', () => {
    const random = vi.fn(() => 0.999);
    const runtime = runtimeFor('marksman_dps_3', random);
    const event = damageEvent();
    const first = runtime.dispatch(event);
    const second = runtime.dispatch(event);
    for (const result of [first, second]) {
      expect(result.instantEffects).toEqual([
        { type: 'dot', sourceId: 'Garen', targetId: 'Darius', amount: 25, duration: 3 },
      ]);
    }
    expect(random).not.toHaveBeenCalled();
    const { host, target } = resolverFixture();
    resolveBattleRuleEffect(host, first.instantEffects[0]);
    resolveBattleRuleEffect(host, second.instantEffects[0]);
    const dots = target.effectManager.effects.filter((entry) => entry instanceof DamageEffect);
    expect(dots).toHaveLength(2);
    const dot = dots[0];
    expect(dot.damageType).toBe(DamageType.True);
    expect(dot.canCrit).toBe(false);
    expect([dot.tick().value, dot.tick().value, dot.tick().value]).toEqual([8, 8, 8]);
    expect(dot.maxStacks).toBe(1);
    expect(getNodeEffectEvidence(node('marksman_dps_3')).status).toBe('partial');
    for (const locale of ['fr-FR', 'en-US'] as const) {
      expect(getEnhancementNodeContent(locale, 'marksman_dps_3').description).toMatch(/15\s*%/);
    }
  });

  it('Phénix emits once per combat, ignores elapsed turns and can emit again after reset', () => {
    const runtime = runtimeFor('assassin_sustain_3');
    const target = actor({ currentHp: 150 });
    const source = actor({ id: 'Darius', side: 'enemy' });
    const event = {
      ...damageEvent(),
      type: 'before_damage' as const,
      source,
      target,
      actors: [source, target],
    };
    expect(runtime.dispatch(event).instantEffects).toContainEqual(
      expect.objectContaining({ type: 'shield', amount: 200 }),
    );
    for (let turn = 1; turn <= 61; turn++)
      runtime.dispatch({ type: 'turn_start', actor: target, actors: [source, target], turn });
    expect(runtime.dispatch(event).instantEffects).toEqual([]);
    runtime.reset();
    expect(runtime.dispatch(event).instantEffects).toContainEqual(
      expect.objectContaining({ type: 'shield', amount: 200 }),
    );
    expect(getNodeEffectEvidence(node('assassin_sustain_3')).discrepancies.join(' ')).toContain(
      'beforeRules.instantEffects',
    );
  });

  it('a mirrored champion receives its own emitted bleed because rule effects lose the target side', () => {
    const garen = championDB.getById('Garen')!;
    const runtime = runtimeFor('marksman_dps_3');
    const battle = new BattleManager(
      {
        side: 'player',
        champions: [new ChampionInstance({ ...garen, stats: { ...garen.stats, moveSpeed: 1000 } })],
      },
      {
        side: 'enemy',
        champions: [new ChampionInstance({ ...garen, stats: { ...garen.stats, moveSpeed: 1 } })],
      },
      { autoActions: false, rules: runtime, random: () => 0.5 },
    );
    battle.startBattle();
    expect(battle.currentCombatant?.side).toBe('player');
    const attack = battle
      .getAvailableActions(battle.currentCombatant!.champion)
      .find((entry) => entry.type === ActionType.BasicAttack)!;
    expect(
      battle.submitAction({ type: ActionType.BasicAttack, targetId: attack.validTargetIds[0] }),
    ).toBe(true);
    const player = battle.getPlayerCombatants()[0];
    const enemy = battle.getEnemyCombatants()[0];
    expect(
      player.effectManager.effects.filter((entry) => entry instanceof DamageEffect),
    ).toHaveLength(1);
    expect(
      enemy.effectManager.effects.filter((entry) => entry instanceof DamageEffect),
    ).toHaveLength(0);
  });

  it('Phénix has a bus handler but its before_damage shield is lost in an actual BattleManager turn', () => {
    const garen = championDB.getById('Garen')!;
    const darius = championDB.getById('Darius')!;
    const runtime = runtimeFor('assassin_sustain_3');
    const dispatch = vi.spyOn(runtime, 'dispatch');
    const battle = new BattleManager(
      {
        side: 'player',
        champions: [
          new ChampionInstance({ ...garen, stats: { ...garen.stats, moveSpeed: 1, armor: 0 } }),
        ],
      },
      {
        side: 'enemy',
        champions: [
          new ChampionInstance({
            ...darius,
            stats: { ...darius.stats, moveSpeed: 1000, attackDamage: 1 },
          }),
        ],
      },
      { autoActions: false, rules: runtime, random: () => 0.5 },
    );
    battle.startBattle();
    const player = battle.getPlayerCombatants()[0];
    player.currentHp = Math.floor(player.maxHp * 0.15);
    expect(battle.currentCombatant?.side).toBe('enemy');
    battle.processCurrentTurn();
    const beforeDamageIndex = dispatch.mock.calls.findIndex(
      ([event]) => event.type === 'before_damage',
    );
    expect(beforeDamageIndex).toBeGreaterThanOrEqual(0);
    expect(dispatch.mock.results[beforeDamageIndex].value.instantEffects).toContainEqual(
      expect.objectContaining({ type: 'shield', amount: 200 }),
    );
    expect(player.effectManager.shields).toEqual([]);
    expect(battle.log.some((event) => event.type === 'shield')).toBe(false);
  });

  it('Combustion changes AP only, while Canalisation converts a fraction into ten haste points', () => {
    const base = { ...calculateStats(championDB.getById('Veigar')!.stats, 1), abilityPower: 100 };
    const combustion = enhancementService.calculateStatBonuses(ENHANCEMENT_TREES_BY_ROLE.Mage, {
      mage_burst_2: 1,
    });
    const result = applyEnhancementBonuses(base, combustion);
    expect(combustion.percent).toEqual({ abilityPower: 0.15 });
    expect(combustion.effects).toEqual([]);
    expect(result.abilityPower).toBeCloseTo(base.abilityPower * 1.15);
    expect(result.attackDamage).toBe(base.attackDamage);
    const channeling = enhancementService.calculateStatBonuses(ENHANCEMENT_TREES_BY_ROLE.Mage, {
      mage_control_2: 1,
    });
    const runtime = new CombatRuleRuntime({
      runeIds: [],
      runeAssignments: {},
      augmentIds: [],
      inventory: [],
      enhancementEffects: {},
      enhancementStats: { Garen: channeling },
    });
    expect(channeling.percent).toEqual({ abilityHaste: 0.1 });
    expect(runtime.getCooldownMultiplier('Garen', false)).toBeCloseTo(100 / 110);
    expect(applyEnhancementBonuses(base, channeling)).toEqual(base);
    expect(getNodeEffectEvidence(node('mage_burst_2')).status).toBe('partial');
    expect(getNodeEffectEvidence(node('mage_control_2')).status).toBe('partial');
  });

  it('Immortel prevents defeat once without applying the advertised immunity', () => {
    const runtime = runtimeFor('tank_defense_3');
    const source = actor({ id: 'Darius', side: 'enemy' });
    const target = actor({ currentHp: 0 });
    const event = { type: 'before_defeat' as const, source, target, actors: [source, target] };
    expect(runtime.dispatch(event)).toMatchObject({ preventDefeatHp: 1, instantEffects: [] });
    expect(runtime.dispatch(event).preventDefeatHp).toBe(0);
  });

  it('Brûlure is emitted as untyped rule damage; Épines accepts a magical hit too', () => {
    const source = actor({ id: 'Darius', side: 'enemy' });
    const target = actor();
    const event = {
      ...damageEvent(),
      source,
      target,
      actors: [source, target],
      damageType: DamageType.AP,
    };
    expect(runtimeFor('tank_thorn_1').dispatch(event).instantEffects).toContainEqual({
      type: 'damage',
      sourceId: 'Garen',
      targetId: 'Darius',
      amount: 1,
    });
    const reflection = runtimeFor('tank_thorn_2').dispatch(event).instantEffects;
    expect(reflection).toContainEqual({
      type: 'damage',
      sourceId: 'Garen',
      targetId: 'Darius',
      amount: 20,
    });
    const { host } = resolverFixture();
    resolveBattleRuleEffect(host, reflection[0]);
    expect(host.applyDamageToTarget).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      20,
      DamageType.True,
      false,
      false,
      false,
    );
  });
});
