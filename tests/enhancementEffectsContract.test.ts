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
import type { CombatRuleActor, CombatRuleEvent, CombatRuleLoadout } from '@/game/rules/types';
import { getEnhancementNodeContent } from '@/i18n/enhancementContent';
import { enhancementService } from '@/services/enhancementService';
import type { EnhancementEffect } from '@/types/enhancementTree';
import { calculateStats } from '@/utils/champion';
import { applyEnhancementBonuses } from '@/utils/statCalculator';

const actor = (id = 'Garen', side: 'player' | 'enemy' = 'player'): CombatRuleActor => ({
  id,
  side,
  currentHp: 800,
  maxHp: 1000,
  currentMp: 10,
  maxMp: 100,
  isDefeated: false,
  isBuffed: false,
  isCCd: false,
});
const loadout = (
  effects: EnhancementEffect[],
  overrides: Partial<CombatRuleLoadout> = {},
): CombatRuleLoadout => ({
  runeIds: [],
  runeAssignments: {},
  inventory: [],
  augmentIds: [],
  enhancementStats: {},
  enhancementEffects: { Garen: effects },
  ...overrides,
});
const hit = (
  source = actor(),
  target = actor('Darius', 'enemy'),
  action: ActionType | null = ActionType.BasicAttack,
): Extract<CombatRuleEvent, { type: 'damage_dealt' }> => ({
  type: 'damage_dealt',
  source,
  target,
  actors: [source, target],
  amount: 100,
  damageType: DamageType.AD,
  action,
  isCrit: false,
});

function phoenixBattle(attackDamage: number, amplified = false) {
  const garen = championDB.getById('Garen')!;
  const darius = championDB.getById('Darius')!;
  const effects: EnhancementEffect[] = [
    { type: 'survival_shield', description: '', value: 200, duration: 2 },
  ];
  if (amplified) effects.push({ type: 'shield_amp', description: '', value: 0.15 });
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
          stats: { ...darius.stats, moveSpeed: 1000, attackDamage, crit: 0 },
        }),
      ],
    },
    { autoActions: false, rules: new CombatRuleRuntime(loadout(effects)), random: () => 0.5 },
  );
  battle.startBattle();
  const player = battle.getPlayerCombatants()[0];
  player.currentHp = Math.floor(player.maxHp * 0.15);
  return { battle, player };
}

describe('TREE-03: explicit numerical effect contracts', () => {
  it.each([
    [0, true],
    [0.149999, true],
    [0.15, false],
    [0.9999, false],
  ])('uses a strict 15%% threshold with RNG %s', (roll, triggers) => {
    const random = vi.fn(() => roll);
    const runtime = new CombatRuleRuntime(
      loadout([{ type: 'bleed', description: '', value: 0.05, duration: 3, chance: 0.15 }]),
      random,
    );
    expect(runtime.dispatch(hit()).instantEffects.length > 0).toBe(triggers);
    expect(random).toHaveBeenCalledTimes(1);
  });

  it.each([undefined, 1])('does not consume RNG for a guaranteed bleed (%s)', (chance) => {
    const random = vi.fn(() => 0.999);
    const runtime = new CombatRuleRuntime(
      loadout([{ type: 'bleed', description: '', value: 0.03, duration: 2, chance }]),
      random,
    );
    expect(runtime.dispatch(hit()).instantEffects).toHaveLength(1);
    expect(random).not.toHaveBeenCalled();
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.01])(
    'rejects a zero or invalid chance %s without consuming RNG',
    (chance) => {
      const random = vi.fn();
      const runtime = new CombatRuleRuntime(
        loadout([{ type: 'bleed', description: '', value: 0.05, duration: 3, chance }]),
        random,
      );
      expect(runtime.dispatch(hit()).instantEffects).toEqual([]);
      expect(random).not.toHaveBeenCalled();
    },
  );

  it.each([1, 19, 500, 15000])(
    'preserves exactly round(5%% × %s) damage across three ticks',
    (maxHp) => {
      const runtime = new CombatRuleRuntime(
        loadout([{ type: 'bleed', description: '', value: 0.05, duration: 3, chance: 0.15 }]),
        () => 0.1,
      );
      const event = hit();
      event.target.maxHp = maxHp;
      const emitted = runtime.dispatch(event).instantEffects[0];
      const dot = new DamageEffect({
        sourceId: emitted.sourceId,
        targetId: emitted.targetId,
        magnitude: emitted.amount,
        duration: emitted.duration,
        damageType: DamageType.True,
        preserveTotal: true,
      });
      const ticks = [dot.tick().value!, dot.tick().value!, dot.tick().value!];
      expect(ticks.reduce((total, tick) => total + tick, 0)).toBe(Math.round(maxHp * 0.05));
      expect(ticks.every((tick) => Number.isSafeInteger(tick) && tick >= 0)).toBe(true);
    },
  );

  it.each([0.199, 0.2, 0.5])(
    'Phénix checks HP strictly below 20%% before the incoming hit (%s)',
    (fraction) => {
      const target = actor();
      target.currentHp = target.maxHp * fraction;
      const source = actor('Darius', 'enemy');
      const runtime = new CombatRuleRuntime(
        loadout([{ type: 'survival_shield', description: '', value: 200, duration: 2 }]),
      );
      const result = runtime.dispatch({ ...hit(source, target), type: 'before_damage' });
      expect(result.instantEffects.length).toBe(fraction < 0.2 ? 1 : 0);
      if (fraction < 0.2)
        expect(result.instantEffects[0]).toMatchObject({
          type: 'shield',
          amount: 200,
          duration: 2,
        });
    },
  );

  it('applies Phénix before a weak hit and lets its remaining shield absorb later damage', () => {
    const { battle, player } = phoenixBattle(50);
    const hp = player.currentHp;
    battle.processCurrentTurn();
    expect(player.currentHp).toBe(hp);
    const hit = battle.log.find((event) => event.type === 'damage')!;
    expect(hit.hpDamage).toBe(0);
    expect(hit.shieldDamage).toBeGreaterThan(0);
    expect(player.effectManager.shields[0].remainingShield).toBe(200 - hit.shieldDamage!);
    expect(battle.log.findIndex((event) => event.type === 'shield')).toBeLessThan(
      battle.log.findIndex((event) => event.type === 'damage'),
    );
  });

  it('amplifies a rule shield exactly once and a lethal hit can still exhaust it', () => {
    const amplified = phoenixBattle(50, true);
    amplified.battle.processCurrentTurn();
    const hit = amplified.battle.log.find((event) => event.type === 'damage')!;
    expect(amplified.player.effectManager.shields[0].remainingShield).toBe(230 - hit.shieldDamage!);
    expect(amplified.battle.log.find((event) => event.type === 'shield')?.amount).toBe(230);
    const lethal = phoenixBattle(1000);
    lethal.battle.processCurrentTurn();
    expect(lethal.player.isDefeated).toBe(true);
    expect(lethal.player.effectManager.shields).toEqual([]);
  });

  it.each([0, 100, 1000])(
    'Combustion modifies %s AP once after flat AP, without multiplying AD',
    (abilityPower) => {
      const base = { ...calculateStats(championDB.getById('Veigar')!.stats, 1), abilityPower };
      const bonuses = enhancementService.calculateStatBonuses(ENHANCEMENT_TREES_BY_ROLE.Mage, {
        mage_core_1: 1,
        mage_burst_1: 1,
        mage_burst_2: 1,
      });
      const result = applyEnhancementBonuses(base, bonuses);
      expect(result.abilityPower).toBeCloseTo((abilityPower + 13) * 1.15);
      expect(result.attackDamage).toBe(base.attackDamage);
      expect(bonuses.effects).toEqual([]);
    },
  );

  it.each([0, 5, 10000])(
    'Canalisation adds ten points to existing haste %s with the same cap and R reduction order',
    (otherHaste) => {
      const bonuses = enhancementService.calculateStatBonuses(ENHANCEMENT_TREES_BY_ROLE.Mage, {
        mage_control_2: 1,
      });
      bonuses.flat.abilityHaste = (bonuses.flat.abilityHaste ?? 0) + otherHaste;
      const runtime = new CombatRuleRuntime(
        loadout([{ type: 'cdr_ultimate', description: '', value: 0.2 }], {
          enhancementStats: { Garen: bonuses },
        }),
      );
      expect(runtime.getCooldownMultiplier('Garen', false)).toBeCloseTo(
        Math.max(0.1, 100 / (110 + otherHaste)),
      );
      expect(runtime.getCooldownMultiplier('Garen', true)).toBeCloseTo(
        Math.max(0.1, (100 / (110 + otherHaste)) * 0.8),
      );
    },
  );

  it('uses only living aura owners and includes the owner among the beneficiaries', () => {
    const garen = actor();
    const soraka = actor('Soraka');
    const enemy = actor('Darius', 'enemy');
    const runtime = new CombatRuleRuntime(
      loadout([], {
        enhancementEffects: {
          Soraka: [
            { type: 'damage_aura', description: '', value: 0.1 },
            { type: 'ally_damage_reduction', description: '', value: 0.1 },
          ],
        },
      }),
    );
    const outgoing = {
      ...hit(garen, enemy),
      type: 'before_damage' as const,
      actors: [garen, soraka, enemy],
    };
    expect(runtime.dispatch(outgoing).damageMultiplier).toBeCloseTo(1.1);
    expect(runtime.dispatch({ ...outgoing, source: soraka }).damageMultiplier).toBeCloseTo(1.1);
    expect(
      runtime.dispatch({ ...outgoing, source: enemy, target: garen }).damageReduction,
    ).toBeCloseTo(0.1);
    soraka.currentHp = 0;
    soraka.isDefeated = true;
    expect(runtime.dispatch(outgoing).damageMultiplier).toBe(1);
    expect(runtime.dispatch({ ...outgoing, source: enemy, target: garen }).damageReduction).toBe(0);
  });

  it('keeps lifesteal on basic attacks and omnivamp on attacks, spells and DoT', () => {
    const runtime = new CombatRuleRuntime(
      loadout([], {
        enhancementStats: {
          Garen: { flat: { lifesteal: 5, omnivamp: 3 }, percent: {}, effects: [] },
        },
      }),
    );
    expect(runtime.dispatch(hit()).instantEffects[0]?.amount).toBe(8);
    expect(
      runtime.dispatch(hit(undefined, undefined, ActionType.SpellQ)).instantEffects[0]?.amount,
    ).toBe(3);
    expect(runtime.dispatch(hit(undefined, undefined, null)).instantEffects[0]?.amount).toBe(3);
  });

  it('applies extension and tenacity to rule controls with the same upward rounding as spell controls', () => {
    const { battle } = phoenixBattle(1);
    const source = battle.getEnemyCombatants()[0];
    const target = battle.getPlayerCombatants()[0];
    const host = {
      findCombatantByTargetId: (id: string) => (id === source.champion.id ? source : target),
      applyHeal: vi.fn(),
      applyDamageToTarget: vi.fn(),
      syncEffectState: vi.fn(),
      emit: vi.fn(),
      getAppliedControlDurationMultiplier: () => 1.1,
      getControlDurationMultiplier: () => 1,
    };
    resolveBattleRuleEffect(host, {
      type: 'snare',
      sourceId: source.champion.id,
      targetId: target.champion.id,
      sourceSide: source.side,
      targetSide: target.side,
      amount: 1,
      duration: 1,
    });
    expect(target.effectManager.ccEffects[0].duration).toBe(2);
  });

  it('has matching FR/EN units and does not advertise fictitious seconds or magical damage multipliers', () => {
    for (const locale of ['fr-FR', 'en-US'] as const) {
      const phoenix = getEnhancementNodeContent(locale, 'assassin_sustain_3').description;
      expect(phoenix).toMatch(/200/);
      expect(phoenix).toMatch(/2/);
      expect(phoenix).not.toMatch(/60|second|cooldown|récupération/);
      expect(getEnhancementNodeContent(locale, 'mage_burst_2').description).toMatch(/15/);
      expect(getEnhancementNodeContent(locale, 'mage_control_2').description).toMatch(/10/);
      expect(getEnhancementNodeContent(locale, 'marksman_dps_3').description).toMatch(/15\s*%/);
    }
  });
});
