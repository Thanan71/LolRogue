/** Shared display snapshots; no hooks, store state or runtime dependencies. */
import type { ActionTargeting } from '@/game/battle/types';
import type { CCType } from '@/game/effects/types';
import type { SpellImpactPreview } from '@/game/presentation/spellPreview';
import type { RunProgressionDefinition } from './champion';

export type BattleSpeed = 1 | 2 | 3;

export interface SpellInfo {
  slot: 'Q' | 'W' | 'E' | 'R';
  name: string;
  cooldownMax: number;
  cooldownCurrent: number;
  cost: number;
  isReady: boolean;
  targeting: ActionTargeting;
  iconUrl?: string;
  impacts?: SpellImpactPreview[];
}

export interface CombatStatusInfo {
  id: string;
  kind: CCType | 'shield' | 'buff' | 'debuff' | 'dot' | 'hot' | 'revive';
  turnsRemaining: number;
  amount?: number;
  stacks?: number;
}

export interface CombatantInfo {
  targetId: string;
  id: string;
  name: string;
  level: number;
  currentHp: number;
  maxHp: number;
  currentMp: number;
  maxMp: number;
  iconUrl: string;
  isDefeated: boolean;
  side: 'player' | 'enemy';
  spells: SpellInfo[];
  /** Immutable display snapshot of active engine effects. */
  statuses?: CombatStatusInfo[];
  /** Immutable engine data for declared counters retained during this run. */
  runProgression?: readonly RunProgressionDefinition[];
  runProgress?: Readonly<Record<string, number>>;
}
