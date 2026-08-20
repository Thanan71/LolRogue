import { describe, expect, it } from 'vitest';
import { championDB } from '../src/data';
import { ITEM_DATABASE } from '../src/data/items';
import { BattleManager } from '../src/game/battle/BattleManager';
import { ActionType, BattlePhase } from '../src/game/battle/types';
import { ChampionInstance } from '../src/game/ChampionInstance';
import { validateItemAddition } from '../src/game/inventory/inventoryRules';
import { CombatRuleRuntime } from '../src/game/rules/CombatRuleRuntime';
import {
  getUnavailableEnhancementEffects,
  OFFICIALLY_SUPPORTED_RULE_TRIGGERS,
} from '../src/game/rules/catalogSupport';
import { validateRuleCatalogs } from '../src/game/rules/catalogValidation';
import type { CombatRuleActor, CombatRuleLoadout } from '../src/game/rules/types';
import type { InventoryEntry, Item } from '../src/types/run';

function actor(overrides: Partial<CombatRuleActor> = {}): CombatRuleActor {
  return {
    id: 'Garen',
    side: 'player',
    currentHp: 800,
    maxHp: 1000,
    currentMp: 100,
    maxMp: 100,
    isDefeated: false,
    isBuffed: false,
    isCCd: false,
    ...overrides,
  };
}

function item(id: string): Item {
  const definition = ITEM_DATABASE[id];
  return {
    id,
    name: definition.name,
    description: definition.description,
    iconUrl: definition.iconUrl,
    stats: {},
    passiveId: definition.passive?.id,
    goldValue: definition.goldValue,
  };
}

function entry(id: string, championId = 'Garen'): InventoryEntry {
  return {
    instanceId: `instance:${id}`,
    item: item(id),
    equippedToChampionId: championId,
  };
}

function loadout(overrides: Partial<CombatRuleLoadout> = {}): CombatRuleLoadout {
  return {
    runeIds: [],
    augmentIds: [],
    inventory: [],
    enhancementEffects: {},
    enhancementStats: {},
    ...overrides,
  };
}

describe('catalogue de règles', () => {
  it('refuse toute entrée disponible sans handler', () => {
    expect(validateRuleCatalogs()).toEqual([]);
    expect(OFFICIALLY_SUPPORTED_RULE_TRIGGERS.runes).toContain('on_kill');
    expect(OFFICIALLY_SUPPORTED_RULE_TRIGGERS.items).toContain('combat_start');
  });

  it('classe explicitement les améliorations spatiales indisponibles', () => {
    expect(
      getUnavailableEnhancementEffects([
        { type: 'bush_vision', description: 'Vision dans les broussailles' },
      ]),
    ).toHaveLength(1);
  });
});

describe('bus commun de combat', () => {
  it('arms Electrocute on the third cast and deals its bonus exactly once', () => {
    const runtime = new CombatRuleRuntime(loadout({ runeIds: ['electrocute'] }), () => 0.5);
    const source = actor();
    const target = actor({ id: 'Darius', side: 'enemy' });
    const actors = [source, target];
    runtime.dispatch({ type: 'battle_start', actors });

    for (let cast = 1; cast <= 4; cast++) {
      runtime.dispatch({ type: 'ability_cast', actor: source, action: ActionType.SpellQ });
      const damage = runtime.dispatch({
        type: 'damage_dealt',
        source,
        target,
        amount: 10,
        action: ActionType.SpellQ,
        isCrit: false,
        actors,
      });
      expect(
        damage.instantEffects.filter((effect) => effect.type === 'damage' && effect.amount === 40),
        `cast ${cast}`,
      ).toHaveLength(cast === 3 ? 1 : 0);
      runtime.dispatch({ type: 'turn_end', actor: source });
    }
  });

  it('déclenche, stacke puis expire une rune au bon événement', () => {
    const runtime = new CombatRuleRuntime(loadout({ runeIds: ['press_the_attack'] }), () => 0.5);
    const source = actor();
    const target = actor({ id: 'Darius', side: 'enemy' });
    const actors = [source, target];
    runtime.dispatch({ type: 'battle_start', actors });

    for (let hit = 0; hit < 3; hit++) {
      runtime.dispatch({
        type: 'damage_dealt',
        source,
        target,
        amount: 10,
        action: ActionType.BasicAttack,
        isCrit: false,
        actors,
      });
    }
    expect(runtime.getStatBonuses(source.id)).toContainEqual({
      stat: 'atk',
      flat: 0,
      percent: 0.15,
    });

    for (let turn = 0; turn < 3; turn++) runtime.dispatch({ type: 'turn_end', actor: source });
    expect(runtime.getStatBonuses(source.id)).toEqual([]);
  });

  it('conserve les stacks permanentes entre deux combats de la run', () => {
    const source = actor();
    const target = actor({ id: 'Darius', side: 'enemy' });
    const actors = [source, target];
    const first = new CombatRuleRuntime(loadout({ runeIds: ['eyeball_collection'] }));
    first.dispatch({ type: 'battle_start', actors });
    for (let kill = 0; kill < 3; kill++) {
      first.dispatch({ type: 'kill', source, target, actors });
    }

    const second = new CombatRuleRuntime(
      loadout({
        runeIds: ['eyeball_collection'],
        runeStacks: first.getRuneStacks(),
      }),
    );
    second.dispatch({ type: 'battle_start', actors });
    expect(second.getStatBonuses(source.id)).toContainEqual({
      stat: 'ap',
      flat: 6,
      percent: 0,
    });
  });

  it('résout on-hit, réduction, soin et consommables sans snapshot fictif', () => {
    const runtime = new CombatRuleRuntime(
      loadout({
        augmentIds: ['hyper_carry', 'unstoppable'],
        inventory: [
          entry('infinity_edge'),
          entry('bloodthirster'),
          entry('sunfire_aegis'),
          entry('health_potion'),
          entry('elixir_of_wrath'),
        ],
      }),
      () => 0.5,
    );
    const source = actor();
    const target = actor({ id: 'Darius', side: 'enemy' });
    const actors = [source, target];
    const start = runtime.dispatch({ type: 'battle_start', actors });
    expect(start.consumedItemInstanceIds).toEqual([
      'instance:health_potion',
      'instance:elixir_of_wrath',
    ]);
    expect(runtime.getStatBonuses(source.id)).toContainEqual({
      stat: 'atk',
      flat: 30,
      percent: 0,
    });

    const turn = runtime.dispatch({ type: 'turn_start', actor: source, actors, turn: 1 });
    expect(turn.instantEffects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'heal', amount: 50 }),
        expect.objectContaining({ type: 'damage', amount: 15, targetId: 'Darius' }),
      ]),
    );
    const outgoing = runtime.dispatch({
      type: 'before_damage',
      source,
      target,
      amount: 100,
      action: ActionType.BasicAttack,
      isCrit: true,
      actors,
    });
    expect(outgoing.damageMultiplier).toBeCloseTo(1.25 * 1.35);

    const incoming = runtime.dispatch({
      type: 'before_damage',
      source: target,
      target: source,
      amount: 100,
      action: ActionType.BasicAttack,
      isCrit: false,
      actors,
    });
    expect(incoming.damageReduction).toBeCloseTo(0.2);

    const hit = runtime.dispatch({
      type: 'damage_dealt',
      source,
      target,
      amount: 100,
      action: ActionType.BasicAttack,
      isCrit: false,
      actors,
    });
    expect(hit.instantEffects).toContainEqual(
      expect.objectContaining({ type: 'heal', sourceId: 'Garen', amount: 18 }),
    );
  });

  it('n’autorise chaque source de revive qu’une fois par combat', () => {
    const source = actor({ id: 'Darius', side: 'enemy' });
    const target = actor();
    const actors = [source, target];
    const runtime = new CombatRuleRuntime(
      loadout({
        augmentIds: ['phoenix_heart'],
        inventory: [entry('guardian_angel')],
      }),
    );
    runtime.dispatch({ type: 'battle_start', actors });
    const first = runtime.dispatch({ type: 'before_defeat', source, target, actors });
    const second = runtime.dispatch({ type: 'before_defeat', source, target, actors });
    const third = runtime.dispatch({ type: 'before_defeat', source, target, actors });
    expect(first.preventDefeatHp).toBe(500);
    expect(second.preventDefeatHp).toBe(300);
    expect(third.preventDefeatHp).toBe(0);
  });
});

describe('intégration BattleManager', () => {
  it('consomme les usages uniques et applique Guardian Angel sur un dégât létal', () => {
    const garen = championDB.getById('Garen');
    const darius = championDB.getById('Darius');
    expect(garen && darius).toBeTruthy();
    const player = new ChampionInstance(garen!, 1);
    const enemy = new ChampionInstance(darius!, 18, 10);
    const rules = new CombatRuleRuntime(
      loadout({
        inventory: [entry('guardian_angel'), entry('health_potion')],
      }),
      () => 0,
    );
    const battle = new BattleManager(
      { side: 'player', champions: [player] },
      { side: 'enemy', champions: [enemy] },
      { rules, random: () => 0, maxRounds: 20 },
    );
    battle.startBattle();
    for (let guard = 0; battle.phase !== BattlePhase.Finished && guard < 100; guard++) {
      battle.processCurrentTurn();
    }

    expect(battle.getConsumedItemInstanceIds()).toEqual(['instance:health_potion']);
    expect(battle.log.some((event) => event.type === 'revive' && event.target === 'Garen')).toBe(
      true,
    );
  });
});

describe('règles d’inventaire de run', () => {
  it('applique unique, stackable et maxStacks avant la mutation', () => {
    expect(validateItemAddition([entry('guardian_angel')], item('guardian_angel'))).toMatchObject({
      valid: false,
      code: 'unique_item',
    });
    const potions = Array.from({ length: 10 }, (_, index) => ({
      ...entry('health_potion'),
      instanceId: `potion:${index}`,
    }));
    expect(validateItemAddition(potions, item('health_potion'))).toMatchObject({
      valid: false,
      code: 'max_stacks',
    });
  });
});
