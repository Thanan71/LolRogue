import type { ActionType, TeamSide } from '@/game/battle/types';
import type { DamageType, StatKey } from '@/game/effects/types';
import type { EnhancementEffect, EnhancementStatBonuses } from '@/types/enhancementTree';
import type { InventoryEntry } from '@/types/run';

export interface CombatRuleActor {
  id: string;
  side: TeamSide;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  isDefeated: boolean;
  isBuffed: boolean;
  isCCd: boolean;
}

export type CombatRuleEvent =
  | { type: 'battle_start'; actors: CombatRuleActor[] }
  | { type: 'turn_start'; actor: CombatRuleActor; actors: CombatRuleActor[]; turn: number }
  | { type: 'turn_end'; actor: CombatRuleActor }
  | { type: 'ability_cast'; actor: CombatRuleActor; action: ActionType }
  | {
      type: 'before_damage';
      source: CombatRuleActor;
      target: CombatRuleActor;
      amount: number;
      damageType: DamageType;
      action: ActionType | null;
      isCrit: boolean;
      actors: CombatRuleActor[];
    }
  | {
      type: 'damage_dealt';
      source: CombatRuleActor;
      target: CombatRuleActor;
      amount: number;
      damageType: DamageType;
      action: ActionType | null;
      isCrit: boolean;
      actors: CombatRuleActor[];
    }
  | { type: 'kill'; source: CombatRuleActor; target: CombatRuleActor; actors: CombatRuleActor[] }
  | {
      type: 'before_heal';
      source: CombatRuleActor;
      target: CombatRuleActor;
      amount: number;
    }
  | {
      type: 'before_shield';
      source: CombatRuleActor;
      target: CombatRuleActor;
      amount: number;
    }
  | {
      type: 'before_defeat';
      source: CombatRuleActor;
      target: CombatRuleActor;
      actors: CombatRuleActor[];
    }
  | { type: 'battle_end'; winner: TeamSide | 'draw'; actors: CombatRuleActor[] };

export interface CombatRuleStatBonus {
  stat: StatKey;
  flat: number;
  percent: number;
}

export interface CombatRuleInstantEffect {
  type: 'heal' | 'damage' | 'shield' | 'mana' | 'dot' | 'slow' | 'snare';
  sourceId: string;
  targetId: string;
  amount: number;
  duration?: number;
}

export interface CombatRuleResolution {
  damageMultiplier: number;
  damageReduction: number;
  healMultiplier: number;
  shieldMultiplier: number;
  preventDefeatHp: number;
  instantEffects: CombatRuleInstantEffect[];
  consumedItemInstanceIds: string[];
}

export interface CombatRuleLoadout {
  runeIds: string[];
  runeStacks?: Record<string, Record<string, number>>;
  augmentIds: string[];
  inventory: InventoryEntry[];
  enhancementEffects: Record<string, EnhancementEffect[]>;
  enhancementStats: Record<string, EnhancementStatBonuses>;
}

export const EMPTY_COMBAT_RULE_LOADOUT: CombatRuleLoadout = {
  runeIds: [],
  augmentIds: [],
  inventory: [],
  enhancementEffects: {},
  enhancementStats: {},
};
