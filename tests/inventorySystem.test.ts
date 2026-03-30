/**
 * Inventory System — comprehensive unit tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { InventoryManager } from '../src/game/inventory/InventoryManager';
import { RuneManager, type RuneContext } from '../src/game/runes/RuneManager';
import { AugmentManager } from '../src/game/augments/AugmentManager';
import {
  ITEM_DATABASE, getItemDefinition, getStackableItems, getItemsByCategory,
} from '../src/data/items/itemDatabase';
import {
  RUNE_DATABASE, getRuneDefinition, getKeystoneRunes, getRunesByPath,
} from '../src/data/items/runeDatabase';
import {
  AUGMENT_DATABASE, getAugmentDefinition, getAugmentsByTier,
} from '../src/data/items/augmentDatabase';
import {
  ItemCategory, ItemRarity, RunePath, RuneConditionType,
  AugmentTier, AugmentEffectType, DEFAULT_MAX_ITEMS_PER_CHAMPION,
  DEFAULT_MAX_RUNES_PER_CHAMPION, DEFAULT_MAX_AUGMENTS,
} from '../src/types/inventory';

describe('Item Database', () => {
  it('should have items registered', () => {
    expect(Object.keys(ITEM_DATABASE).length).toBeGreaterThan(0);
  });
  it('should retrieve item by ID', () => {
    const ls = getItemDefinition('long_sword');
    expect(ls).toBeDefined();
    expect(ls!.name).toBe('Long Sword');
    expect(ls!.category).toBe(ItemCategory.Weapon);
    expect(ls!.rarity).toBe(ItemRarity.Common);
    expect(ls!.stackable).toBe(true);
    expect(ls!.maxStacks).toBe(5);
  });
  it('should filter stackable items', () => {
    const s = getStackableItems();
    expect(s.length).toBeGreaterThan(0);
    expect(s.every((i) => i.stackable)).toBe(true);
  });
  it('should filter items by category', () => {
    const w = getItemsByCategory(ItemCategory.Weapon);
    expect(w.length).toBeGreaterThan(0);
    expect(w.every((i) => i.category === ItemCategory.Weapon)).toBe(true);
  });
  it('should have passives on completed items', () => {
    const ie = getItemDefinition('infinity_edge');
    expect(ie!.passive).toBeDefined();
    expect(ie!.passive!.trigger).toBe('on_hit');
    expect(ie!.tier).toBe(2);
  });
  it('should have components on crafted items', () => {
    const ie = getItemDefinition('infinity_edge');
    expect(ie!.components).toContain('long_sword');
    expect(ie!.components).toContain('dagger');
  });
  it('should return undefined for unknown item', () => {
    expect(getItemDefinition('nonexistent')).toBeUndefined();
  });
});


describe('InventoryManager', () => {
  let manager: InventoryManager;
  const longsword = ITEM_DATABASE['long_sword'];
  const boots = ITEM_DATABASE['boots'];
  const healthPotion = ITEM_DATABASE['health_potion'];

  beforeEach(() => {
    manager = new InventoryManager(6, 20);
  });

  describe('addItem', () => {
    it('should add a non-stackable item', () => {
      const id = manager.addItem(boots);
      expect(id).toBeTruthy();
      expect(manager.items.length).toBe(1);
      expect(manager.items[0].stacks).toBe(1);
    });
    it('should add a stackable item and stack with existing', () => {
      const id1 = manager.addItem(longsword, 2);
      expect(id1).toBeTruthy();
      expect(manager.items.length).toBe(1);
      expect(manager.items[0].stacks).toBe(2);
      const id2 = manager.addItem(longsword, 3);
      expect(id2).toBe(id1);
      expect(manager.items.length).toBe(1);
      expect(manager.items[0].stacks).toBe(5);
    });
    it('should create new stack when existing is full', () => {
      manager.addItem(longsword, 5);
      expect(manager.items[0].stacks).toBe(5);
      manager.addItem(longsword, 3);
      expect(manager.items.length).toBe(2);
      expect(manager.items[1].stacks).toBe(3);
    });
    it('should not exceed maxStacks per entry', () => {
      manager.addItem(longsword, 10);
      expect(manager.items.length).toBe(2);
      expect(manager.items[0].stacks).toBe(5);
      expect(manager.items[1].stacks).toBe(5);
    });
    it('should add consumables with high stack limit', () => {
      manager.addItem(healthPotion, 7);
      expect(manager.items.length).toBe(1);
      expect(manager.items[0].stacks).toBe(7);
      manager.addItem(healthPotion, 5);
      expect(manager.items.length).toBe(2);
      expect(manager.items[0].stacks).toBe(10);
      expect(manager.items[1].stacks).toBe(2);
    });
  });

  describe('removeStacks', () => {
    it('should remove stacks from a stackable item', () => {
      const id = manager.addItem(longsword, 5)!;
      const removed = manager.removeStacks(id, 2);
      expect(removed).toBe(false);
      expect(manager.items[0].stacks).toBe(3);
    });
    it('should remove entry when stacks reach 0', () => {
      const id = manager.addItem(longsword, 3)!;
      const removed = manager.removeStacks(id, 3);
      expect(removed).toBe(true);
      expect(manager.items.length).toBe(0);
    });
    it('should return false for unknown instance', () => {
      expect(manager.removeStacks('unknown')).toBe(false);
    });
  });

  describe('equip/unequip', () => {
    it('should equip an item to a champion', () => {
      const id = manager.addItem(longsword)!;
      const result = manager.equipItem(id, 'champ-1');
      expect(result).toBe(true);
      expect(manager.items[0].equippedToChampionId).toBe('champ-1');
    });
    it('should not equip if already equipped to same champion', () => {
      const id = manager.addItem(longsword)!;
      manager.equipItem(id, 'champ-1');
      expect(manager.equipItem(id, 'champ-1')).toBe(false);
    });
    it('should respect max items per champion', () => {
      const mgr = new InventoryManager(2, 20);
      const id1 = mgr.addItem(longsword)!;
      const id2 = mgr.addItem(boots)!;
      const id3 = mgr.addItem(healthPotion)!;
      mgr.equipItem(id1, 'champ-1');
      mgr.equipItem(id2, 'champ-1');
      expect(mgr.equipItem(id3, 'champ-1')).toBe(false);
      expect(mgr.getEquippedItems('champ-1').length).toBe(2);
    });
    it('should unequip an item to bag', () => {
      const id = manager.addItem(longsword)!;
      manager.equipItem(id, 'champ-1');
      const result = manager.unequipItem(id);
      expect(result).toBe(true);
      expect(manager.items[0].equippedToChampionId).toBeNull();
    });
    it('should return false when unequipping non-equipped item', () => {
      const id = manager.addItem(longsword)!;
      expect(manager.unequipItem(id)).toBe(false);
    });
  });

  describe('getEquippedStatBonuses', () => {
    it('should aggregate flat bonuses from multiple items', () => {
      const id1 = manager.addItem(longsword)!;
      const id2 = manager.addItem(longsword)!;
      manager.equipItem(id1, 'champ-1');
      manager.equipItem(id2, 'champ-1');
      const bonuses = manager.getEquippedStatBonuses('champ-1');
      expect(bonuses.atk.flat).toBe(20);
    });
    it('should multiply flat bonuses by stack count', () => {
      const id = manager.addItem(longsword, 3)!;
      manager.equipItem(id, 'champ-1');
      const bonuses = manager.getEquippedStatBonuses('champ-1');
      expect(bonuses.atk.flat).toBe(30);
    });
    it('should aggregate percent bonuses separately', () => {
      const rabadons = ITEM_DATABASE['rabaddons_deathcap'];
      const id = manager.addItem(rabadons)!;
      manager.equipItem(id, 'champ-1');
      const bonuses = manager.getEquippedStatBonuses('champ-1');
      expect(bonuses.ap.flat).toBe(120);
      expect(bonuses.ap.percent).toBe(0.35);
    });
  });

  describe('splitStack', () => {
    it('should split a stack into two entries', () => {
      const id = manager.addItem(longsword, 4)!;
      const newId = manager.splitStack(id, 2);
      expect(newId).toBeTruthy();
      expect(manager.items.length).toBe(2);
      expect(manager.items[0].stacks).toBe(2);
      expect(manager.items[1].stacks).toBe(2);
    });
    it('should not split non-stackable items', () => {
      const id = manager.addItem(boots)!;
      expect(manager.splitStack(id, 1)).toBeNull();
    });
    it('should not split if count is invalid', () => {
      const id = manager.addItem(longsword, 3)!;
      expect(manager.splitStack(id, 0)).toBeNull();
      expect(manager.splitStack(id, 3)).toBeNull();
      expect(manager.splitStack(id, 5)).toBeNull();
    });
  });

  describe('queries', () => {
    it('should get bag items only', () => {
      const id1 = manager.addItem(longsword)!;
      const id2 = manager.addItem(boots)!;
      manager.equipItem(id1, 'champ-1');
      expect(manager.bagItems.length).toBe(1);
      expect(manager.bagItems[0].instanceId).toBe(id2);
    });
    it('should count total item stacks', () => {
      manager.addItem(longsword, 3);
      manager.addItem(boots);
      expect(manager.getTotalItemCount()).toBe(4);
    });
    it('should get items with specific trigger', () => {
      const ie = ITEM_DATABASE['infinity_edge'];
      const id = manager.addItem(ie)!;
      manager.equipItem(id, 'champ-1');
      expect(manager.getItemsWithTrigger('champ-1', 'on_hit').length).toBe(1);
    });
  });

  it('should clear all items', () => {
    manager.addItem(longsword, 3);
    manager.addItem(boots);
    manager.clear();
    expect(manager.items.length).toBe(0);
  });
});


describe('Rune Database', () => {
  it('should have runes registered for all 5 paths', () => {
    const paths = [RunePath.Precision, RunePath.Domination, RunePath.Sorcery, RunePath.Resolve, RunePath.Inspiration];
    for (const path of paths) {
      const runes = getRunesByPath(path);
      expect(runes.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('should identify keystone runes (row 0)', () => {
    const keystones = getKeystoneRunes();
    expect(keystones.length).toBe(5);
    expect(keystones.every((r) => r.row === 0)).toBe(true);
  });

  it('should retrieve rune by ID', () => {
    const ls = getRuneDefinition('last_stand');
    expect(ls).toBeDefined();
    expect(ls!.name).toBe('Last Stand');
    expect(ls!.condition.type).toBe(RuneConditionType.HpBelowPercent);
    expect(ls!.condition.threshold).toBe(40);
  });

  it('should return undefined for unknown rune', () => {
    expect(getRuneDefinition('nonexistent')).toBeUndefined();
  });
});

describe('RuneManager', () => {
  let runeManager: RuneManager;

  const makeContext = (overrides: Partial<import('../src/game/runes/RuneManager').RuneContext> = {}) => ({
    currentHp: 1000, maxHp: 1000, turnNumber: 1,
    totalDamageDealt: 0, totalDamageTaken: 0,
    killsThisBattle: 0, abilitiesCastThisBattle: 0,
    isBuffed: false, isCCd: false,
    alliesAlive: 5, totalAllies: 5, lastActionWasCrit: false,
    ...overrides,
  });

  beforeEach(() => {
    runeManager = new RuneManager(3);
  });

  it('should equip a rune', () => {
    const rune = RUNE_DATABASE['last_stand'];
    expect(runeManager.equipRune(rune)).toBe(true);
    expect(runeManager.slotCount).toBe(1);
  });

  it('should not exceed max slots', () => {
    const mgr = new RuneManager(1);
    mgr.equipRune(RUNE_DATABASE['last_stand']);
    expect(mgr.equipRune(RUNE_DATABASE['triumph'])).toBe(false);
  });

  it('should not equip duplicate rune', () => {
    runeManager.equipRune(RUNE_DATABASE['last_stand']);
    expect(runeManager.equipRune(RUNE_DATABASE['last_stand'])).toBe(false);
  });

  it('should unequip a rune', () => {
    runeManager.equipRune(RUNE_DATABASE['last_stand']);
    expect(runeManager.unequipRune('last_stand')).toBe(true);
    expect(runeManager.slotCount).toBe(0);
  });

  it('should activate Last Stand when HP is below 40%', () => {
    runeManager.equipRune(RUNE_DATABASE['last_stand']);
    runeManager.evaluateConditions(makeContext({ currentHp: 300, maxHp: 1000 }));
    expect(runeManager.runes[0].isActive).toBe(true);
  });

  it('should not activate Last Stand when HP is above 40%', () => {
    runeManager.equipRune(RUNE_DATABASE['last_stand']);
    runeManager.evaluateConditions(makeContext({ currentHp: 500, maxHp: 1000 }));
    expect(runeManager.runes[0].isActive).toBe(false);
  });

  it('should activate Scorch when HP is above 70%', () => {
    runeManager.equipRune(RUNE_DATABASE['scorch']);
    runeManager.evaluateConditions(makeContext({ currentHp: 800, maxHp: 1000 }));
    expect(runeManager.runes[0].isActive).toBe(true);
  });

  it('should activate on battle start (turn 1)', () => {
    runeManager.equipRune(RUNE_DATABASE['summon_aery']);
    runeManager.evaluateConditions(makeContext({ turnNumber: 1 }));
    expect(runeManager.runes[0].isActive).toBe(true);
    expect(runeManager.runes[0].turnsRemaining).toBe(2);
  });

  it('should activate on kill', () => {
    runeManager.equipRune(RUNE_DATABASE['triumph']);
    runeManager.evaluateConditions(makeContext({ killsThisBattle: 1 }));
    expect(runeManager.runes[0].isActive).toBe(true);
  });

  it('should activate while buffed', () => {
    runeManager.equipRune(RUNE_DATABASE['cosmic_insight']);
    runeManager.evaluateConditions(makeContext({ isBuffed: true }));
    expect(runeManager.runes[0].isActive).toBe(true);
  });

  it('should activate while CCd', () => {
    runeManager.equipRune(RUNE_DATABASE['time_warp_tonic']);
    runeManager.evaluateConditions(makeContext({ isCCd: true }));
    expect(runeManager.runes[0].isActive).toBe(true);
  });

  it('should accumulate stacks for stacking runes', () => {
    runeManager.equipRune(RUNE_DATABASE['eyeball_collection']);
    for (let i = 0; i < 3; i++) {
      runeManager.evaluateConditions(makeContext({ killsThisBattle: 1 }));
    }
    expect(runeManager.runes[0].currentStacks).toBe(3);
  });

  it('should cap stacks at maxStacks', () => {
    runeManager.equipRune(RUNE_DATABASE['eyeball_collection']);
    for (let i = 0; i < 15; i++) {
      runeManager.evaluateConditions(makeContext({ killsThisBattle: 1 }));
    }
    expect(runeManager.runes[0].currentStacks).toBe(10);
  });

  it('should aggregate active stat bonuses', () => {
    runeManager.equipRune(RUNE_DATABASE['eyeball_collection']);
    for (let i = 0; i < 3; i++) {
      runeManager.evaluateConditions(makeContext({ killsThisBattle: 1 }));
    }
    const bonuses = runeManager.getActiveStatBonuses();
    expect(bonuses.ap.flat).toBe(6); // 2 * 3 stacks
  });

  it('should aggregate percent bonuses', () => {
    runeManager.equipRune(RUNE_DATABASE['last_stand']);
    runeManager.evaluateConditions(makeContext({ currentHp: 300, maxHp: 1000 }));
    const bonuses = runeManager.getActiveStatBonuses();
    expect(bonuses.atk.percent).toBe(0.12);
  });

  it('should decrement turn timers on tickTurn', () => {
    runeManager.equipRune(RUNE_DATABASE['summon_aery']);
    runeManager.evaluateConditions(makeContext({ turnNumber: 1 }));
    expect(runeManager.runes[0].turnsRemaining).toBe(2);
    runeManager.tickTurn();
    expect(runeManager.runes[0].turnsRemaining).toBe(1);
    runeManager.tickTurn();
    expect(runeManager.runes[0].isActive).toBe(false);
  });

  it('should reset battle state', () => {
    runeManager.equipRune(RUNE_DATABASE['last_stand']);
    runeManager.evaluateConditions(makeContext({ currentHp: 300, maxHp: 1000 }));
    expect(runeManager.runes[0].isActive).toBe(true);
    runeManager.resetBattleState();
    expect(runeManager.runes[0].isActive).toBe(false);
  });
});

describe('Augment Database', () => {
  it('should have augments for all tiers', () => {
    expect(getAugmentsByTier(AugmentTier.Silver).length).toBeGreaterThan(0);
    expect(getAugmentsByTier(AugmentTier.Gold).length).toBeGreaterThan(0);
    expect(getAugmentsByTier(AugmentTier.Prismatic).length).toBeGreaterThan(0);
  });

  it('should retrieve augment by ID', () => {
    const brute = getAugmentDefinition('brute_force');
    expect(brute).toBeDefined();
    expect(brute!.tier).toBe(AugmentTier.Silver);
    expect(brute!.stackable).toBe(true);
    expect(brute!.maxStacks).toBe(3);
  });

  it('should return undefined for unknown augment', () => {
    expect(getAugmentDefinition('nonexistent')).toBeUndefined();
  });
});

describe('AugmentManager', () => {
  let augManager: AugmentManager;

  beforeEach(() => {
    augManager = new AugmentManager(4);
  });

  it('should acquire an augment', () => {
    expect(augManager.acquireAugment(AUGMENT_DATABASE['brute_force'])).toBe(true);
    expect(augManager.slotCount).toBe(1);
  });

  it('should stack a stackable augment', () => {
    augManager.acquireAugment(AUGMENT_DATABASE['brute_force']);
    augManager.acquireAugment(AUGMENT_DATABASE['brute_force']);
    expect(augManager.slotCount).toBe(1);
    expect(augManager.augments[0].stacks).toBe(2);
  });

  it('should not exceed max stacks', () => {
    for (let i = 0; i < 5; i++) augManager.acquireAugment(AUGMENT_DATABASE['brute_force']);
    expect(augManager.augments[0].stacks).toBe(3);
  });

  it('should not add non-stackable augment twice', () => {
    augManager.acquireAugment(AUGMENT_DATABASE['divine_blessing']);
    expect(augManager.acquireAugment(AUGMENT_DATABASE['divine_blessing'])).toBe(false);
  });

  it('should not exceed max augment slots', () => {
    const mgr = new AugmentManager(2);
    mgr.acquireAugment(AUGMENT_DATABASE['brute_force']);
    mgr.acquireAugment(AUGMENT_DATABASE['iron_skin']);
    expect(mgr.acquireAugment(AUGMENT_DATABASE['arcane_mind'])).toBe(false);
  });

  it('should remove an augment', () => {
    augManager.acquireAugment(AUGMENT_DATABASE['brute_force']);
    const id = augManager.augments[0].instanceId;
    expect(augManager.removeAugment(id)).toBe(true);
    expect(augManager.slotCount).toBe(0);
  });

  it('should compute bonus gold', () => {
    expect(augManager.getBonusGold()).toBe(0);
    augManager.acquireAugment(AUGMENT_DATABASE['golden_touch']);
    expect(augManager.getBonusGold()).toBe(50);
    augManager.acquireAugment(AUGMENT_DATABASE['golden_touch']);
    expect(augManager.getBonusGold()).toBe(100);
  });

  it('should compute damage multiplier', () => {
    expect(augManager.getDamageMultiplier()).toBe(1.0);
    augManager.acquireAugment(AUGMENT_DATABASE['hyper_carry']);
    expect(augManager.getDamageMultiplier()).toBe(1.25);
  });

  it('should compute damage reduction capped at 80%', () => {
    augManager.acquireAugment(AUGMENT_DATABASE['unstoppable']);
    expect(augManager.getDamageReduction()).toBe(0.20);
  });

  it('should detect extra revive augment', () => {
    expect(augManager.hasExtraRevive()).toBe(false);
    augManager.acquireAugment(AUGMENT_DATABASE['phoenix_heart']);
    expect(augManager.hasExtraRevive()).toBe(true);
  });

  it('should aggregate team stat bonuses (flat)', () => {
    augManager.acquireAugment(AUGMENT_DATABASE['brute_force']);
    const bonuses = augManager.getTeamStatBonuses();
    expect(bonuses.atk.flat).toBe(15);
  });

  it('should aggregate team stat bonuses (percent)', () => {
    augManager.acquireAugment(AUGMENT_DATABASE['warlord']);
    const bonuses = augManager.getTeamStatBonuses();
    expect(bonuses.atk.percent).toBe(0.10);
  });

  it('should handle scaling stat bonuses based on biomes cleared', () => {
    augManager.acquireAugment(AUGMENT_DATABASE['battle_hardened']);
    augManager.biomesCleared = 3;
    const bonuses = augManager.getTeamStatBonuses();
    expect(bonuses.atk.flat).toBe(15); // 5 * 3
    expect(bonuses.def.flat).toBe(15);
  });

  it('should combine multiple augments', () => {
    augManager.acquireAugment(AUGMENT_DATABASE['brute_force']);
    augManager.acquireAugment(AUGMENT_DATABASE['iron_skin']);
    const bonuses = augManager.getTeamStatBonuses();
    expect(bonuses.atk.flat).toBe(15);
    expect(bonuses.def.flat).toBe(12);
  });

  it('should handle prismatic augments with mixed stats', () => {
    augManager.acquireAugment(AUGMENT_DATABASE['divine_blessing']);
    const bonuses = augManager.getTeamStatBonuses();
    expect(bonuses.atk.percent).toBe(0.15);
    expect(bonuses.def.percent).toBe(0.15);
    expect(bonuses.ap.percent).toBe(0.15);
  });

  it('should clear all augments', () => {
    augManager.acquireAugment(AUGMENT_DATABASE['brute_force']);
    augManager.biomesCleared = 5;
    augManager.clear();
    expect(augManager.slotCount).toBe(0);
    expect(augManager.biomesCleared).toBe(0);
  });
});

describe('Integration: Items + Runes + Augments', () => {
  it('should compute combined stat bonuses across all systems', () => {
    const inv = new InventoryManager(6, 20);
    const runes = new RuneManager(3);
    const augments = new AugmentManager(4);

    // Equip items: 3 longswords + rabadons
    const ls1 = inv.addItem(ITEM_DATABASE['long_sword'], 3)!;
    const rd = inv.addItem(ITEM_DATABASE['rabaddons_deathcap'])!;
    inv.equipItem(ls1, 'champ-1');
    inv.equipItem(rd, 'champ-1');

    // Equip rune and trigger it 3 times
    runes.equipRune(RUNE_DATABASE['eyeball_collection']);
    for (let i = 0; i < 3; i++) {
      runes.evaluateConditions({
        currentHp: 1000, maxHp: 1000, turnNumber: 5,
        totalDamageDealt: 0, totalDamageTaken: 0,
        killsThisBattle: 1, abilitiesCastThisBattle: 0,
        isBuffed: false, isCCd: false,
        alliesAlive: 5, totalAllies: 5, lastActionWasCrit: false,
      });
    }

    // Acquire augments
    augments.acquireAugment(AUGMENT_DATABASE['arcane_mind']);
    augments.acquireAugment(AUGMENT_DATABASE['warlord']);

    // Verify item bonuses
    const itemBonuses = inv.getEquippedStatBonuses('champ-1');
    expect(itemBonuses.atk.flat).toBe(30); // 10 * 3 stacks
    expect(itemBonuses.ap.flat).toBe(120);
    expect(itemBonuses.ap.percent).toBe(0.35);

    // Verify rune bonuses
    const runeBonuses = runes.getActiveStatBonuses();
    expect(runeBonuses.ap.flat).toBe(6); // 2 * 3 stacks

    // Verify augment bonuses
    const augmentBonuses = augments.getTeamStatBonuses();
    expect(augmentBonuses.ap.flat).toBe(20);
    expect(augmentBonuses.atk.percent).toBe(0.10);
  });
});
