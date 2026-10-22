import { describe, expect, it, vi } from 'vitest';
import { championDB } from '@/data/championDatabase';
import { replayAuthorityRun } from '@/game/authority';
import { encodeCombatActionTrace } from '@/game/battle/actionTrace';
import { BattleManager } from '@/game/battle/BattleManager';
import { resolveBattleRuleEffect } from '@/game/battle/BattleRuleEffectResolver';
import { ActionType } from '@/game/battle/types';
import { ChampionInstance } from '@/game/ChampionInstance';
import { DamageEffect } from '@/game/effects/DamageEffect';
import { ShieldEffect } from '@/game/effects/ShieldEffect';
import { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import {
  enhancementCooldownMultiplier,
  enhancementCrowdControlMultiplier,
  getEnhancementSecondaryStats,
} from '@/game/rules/enhancementStats';
import type { CombatRuleInstantEffect, CombatRuleLoadout } from '@/game/rules/types';
import { COMBAT_ENHANCEMENT_EFFECT_IDS, combatContent } from '@/i18n/combatContent';
import { getEnhancementNodeContent } from '@/i18n/enhancementContent';
import {
  ENHANCEMENT_PARITY_CHAMPIONS,
  enhancementFirstBattle,
  enhancementParityAttempt,
  enhancementResources,
  finishEnhancementBattle,
} from './helpers/enhancementParityFixtures';

function mirror() {
  const garen = championDB.getById('Garen')!;
  const battle = new BattleManager(
    { side: 'player', champions: [new ChampionInstance(garen)] },
    { side: 'enemy', champions: [new ChampionInstance(garen), new ChampionInstance(garen)] },
    { autoActions: false, random: () => 0.5 },
  );
  battle.startBattle();
  const combatants = [...battle.getPlayerCombatants(), ...battle.getEnemyCombatants()];
  return {
    player: combatants[0],
    enemy: combatants[2],
    host: {
      findCombatantByTargetId: (id: string, side: 'player' | 'enemy') =>
        combatants.find((entry) => entry.targetId === id && entry.side === side),
      applyHeal: vi.fn(),
      applyDamageToTarget: vi.fn(),
      syncEffectState: vi.fn(),
      emit: vi.fn(),
    },
  };
}

describe('TREE-04: side-scoped combat identities and shared secondary formulas', () => {
  it.each(['heal', 'damage', 'mana', 'shield', 'dot', 'slow', 'snare'] as const)(
    'resolves %s on the exact enemy occurrence, never its mirrored player',
    (type) => {
      const { player, enemy, host } = mirror();
      const playerMp = player.currentMp;
      const enemyMp = enemy.currentMp;
      enemy.currentMp = enemyMp - 30;
      resolveBattleRuleEffect(host, {
        type,
        sourceId: player.targetId,
        targetId: enemy.targetId,
        sourceSide: player.side,
        targetSide: enemy.side,
        amount: type === 'slow' ? 0.15 : 20,
        duration: 2,
      });
      if (type === 'heal') expect(host.applyHeal).toHaveBeenCalledWith(player, enemy, 20);
      if (type === 'damage')
        expect(host.applyDamageToTarget).toHaveBeenCalledWith(
          player,
          enemy,
          20,
          expect.anything(),
          false,
          false,
          false,
        );
      if (type === 'mana') {
        expect(enemy.currentMp).toBe(enemyMp - 10);
        expect(player.currentMp).toBe(playerMp);
      }
      if (type === 'shield') {
        expect(enemy.effectManager.shields).toHaveLength(1);
        expect(player.effectManager.shields).toHaveLength(0);
      }
      if (type === 'dot') {
        const dot = enemy.effectManager.effects.find((effect) => effect instanceof DamageEffect)!;
        expect(dot.sourceSide).toBe('player');
        expect(player.effectManager.dots).toHaveLength(0);
      }
      if (type === 'slow' || type === 'snare') {
        expect(enemy.effectManager.ccEffects).toHaveLength(1);
        expect(player.effectManager.ccEffects).toHaveLength(0);
      }
    },
  );

  it('refuses missing camp identities rather than choosing the first mirrored actor', () => {
    const { player, enemy, host } = mirror();
    resolveBattleRuleEffect(host, {
      type: 'damage',
      sourceId: player.targetId,
      targetId: enemy.targetId,
      amount: 20,
    } as CombatRuleInstantEffect);
    expect(host.applyDamageToTarget).not.toHaveBeenCalled();
  });

  it('attributes an enemy shield absorption to the enemy camp in a mirrored match', () => {
    const garen = championDB.getById('Garen')!;
    const battle = new BattleManager(
      {
        side: 'player',
        champions: [new ChampionInstance({ ...garen, stats: { ...garen.stats, moveSpeed: 1000 } })],
      },
      {
        side: 'enemy',
        champions: [new ChampionInstance({ ...garen, stats: { ...garen.stats, moveSpeed: 1 } })],
      },
      { autoActions: false, random: () => 0.5 },
    );
    battle.startBattle();
    const enemy = battle.getEnemyCombatants()[0];
    enemy.effectManager.apply(
      new ShieldEffect({
        sourceId: enemy.targetId,
        targetId: enemy.targetId,
        magnitude: 200,
        duration: 2,
      }),
    );
    expect(battle.submitAction({ type: ActionType.BasicAttack, targetId: enemy.targetId })).toBe(
      true,
    );
    const hit = battle.log.find((event) => event.type === 'damage')!;
    expect(hit.shieldDamage).toBeGreaterThan(0);
    expect(hit.shieldAbsorbedBySide).toEqual({ enemy: hit.shieldDamage });
  });

  it('does not lend player rune stats, haste, tenacity, heals or shields to a mirrored enemy', () => {
    const loadout: CombatRuleLoadout = {
      runeIds: [],
      runeAssignments: {},
      inventory: [],
      augmentIds: [],
      enhancementStats: {
        Garen: { flat: { abilityHaste: 100, tenacity: 50 }, percent: {}, effects: [] },
      },
      enhancementEffects: {
        Garen: [
          { type: 'cc_extension', description: '', value: 0.1 },
          { type: 'heal_amp', description: '', value: 0.1 },
          { type: 'shield_amp', description: '', value: 0.15 },
        ],
      },
    };
    const runtime = new CombatRuleRuntime(loadout);
    expect(runtime.getCooldownMultiplier('Garen', false, 'player')).toBe(0.5);
    expect(runtime.getCooldownMultiplier('Garen', false, 'enemy')).toBe(1);
    expect(runtime.getControlDurationMultiplier('Garen', 'enemy')).toBe(1);
    expect(runtime.getAppliedControlDurationMultiplier('Garen', 'enemy')).toBe(1);
    expect(runtime.getStatBonuses('Garen', 'enemy')).toEqual([]);
    const actor = {
      id: 'Garen',
      side: 'enemy' as const,
      currentHp: 100,
      maxHp: 100,
      currentMp: 0,
      maxMp: 100,
      isDefeated: false,
      isBuffed: false,
      isCCd: false,
    };
    expect(
      runtime.dispatch({ type: 'before_heal', source: actor, target: actor, amount: 100 })
        .healMultiplier,
    ).toBe(1);
    expect(
      runtime.dispatch({ type: 'before_shield', source: actor, target: actor, amount: 100 })
        .shieldMultiplier,
    ).toBe(1);
  });

  it('uses exactly the runtime secondary contributions for UI projections, with no fictitious percent conversions', () => {
    const stats = getEnhancementSecondaryStats({
      flat: { armorPen: 4, magicPen: 3, lifesteal: 5, omnivamp: 3, tenacity: 10, abilityHaste: 5 },
      percent: { armorPen: 0.9, lifesteal: 0.2, abilityHaste: 0.1 },
      effects: [],
    });
    expect(stats).toEqual({
      armorPen: 4,
      magicPen: 3,
      lifesteal: 5,
      omnivamp: 3,
      tenacity: 10,
      abilityHaste: 15,
    });
    expect(enhancementCooldownMultiplier(stats)).toBeCloseTo(100 / 115);
    expect(enhancementCrowdControlMultiplier(stats)).toBe(0.9);
    expect(enhancementCooldownMultiplier({ ...stats, abilityHaste: 10000 })).toBe(0.1);
    expect(enhancementCrowdControlMultiplier({ ...stats, tenacity: 10000 })).toBe(0.2);
    expect(getEnhancementSecondaryStats(undefined)).toEqual({
      armorPen: 0,
      magicPen: 0,
      lifesteal: 0,
      omnivamp: 0,
      tenacity: 0,
      abilityHaste: 0,
    });
  });

  it('uses the same localized numerical descriptions in the tree and combat UI', () => {
    for (const locale of ['fr-FR', 'en-US'] as const)
      for (const id of COMBAT_ENHANCEMENT_EFFECT_IDS) {
        expect(combatContent[locale].presenter.effects[id]).toBe(
          getEnhancementNodeContent(locale, id.split(':')[0]).description,
        );
      }
  });
});

describe('TREE-04: manual, autoplay, deterministic replay and restored command parity', () => {
  it.each(ENHANCEMENT_PARITY_CHAMPIONS)(
    'preserves the same %s build and outcomes across all execution paths',
    (championId) => {
      const attempt = enhancementParityAttempt(championId);
      const automatic = enhancementFirstBattle(attempt, true);
      const autoResult = finishEnhancementBattle(automatic.battle);
      const automaticActions = automatic.battle.getPlayerActionTrace();
      expect(automaticActions.length).toBeGreaterThan(0);
      const manual = enhancementFirstBattle(attempt, false);
      let cursor = 0;
      manual.battle.setActionCallback(() => automaticActions[cursor++] ?? null);
      const manualResult = finishEnhancementBattle(manual.battle);
      expect(manualResult).toEqual(autoResult);
      const manualTrace = manual.battle.getPlayerActionTrace();
      expect(manualTrace.every((action) => !action.automatic)).toBe(true);
      const command = {
        sequence: 2,
        kind: 'resolve_combat' as const,
        payload: { node_id: manual.nodeId, actions_json: encodeCombatActionTrace(manualTrace) },
      };
      const replay = replayAuthorityRun(attempt, [manual.move, command]);
      expect(replay.combatSummaries[0].metrics).toEqual(manualResult.metrics);
      expect(replay.combatSummaries[0].rounds).toBe(manualResult.totalRounds);
      expect(replay.combatSummaries[0].playerTeam.final).toEqual(
        enhancementResources(manual.battle.getPlayerCombatants()),
      );
      expect(replay.combatSummaries[0].enemyTeam.final).toEqual(
        enhancementResources(manual.battle.getEnemyCombatants()),
      );
      const restored = JSON.parse(JSON.stringify({ attempt, commands: [manual.move, command] }));
      expect(replayAuthorityRun(restored.attempt, restored.commands)).toEqual(replay);
      const canonicalAuto = replayAuthorityRun(attempt, [
        automatic.move,
        { ...command, payload: { node_id: automatic.nodeId, actions_json: 'auto' } },
      ]);
      expect(canonicalAuto.combatSummaries[0].metrics).toEqual(replay.combatSummaries[0].metrics);
      expect(canonicalAuto.snapshot.team).toEqual(replay.snapshot.team);
      // Engine identity comes from the version registry; this assertion follows the future release.
      expect(replay.engineVersion).toMatch(/^run-engine-\d+\.\d+\.\d+$/);
    },
  );
});
