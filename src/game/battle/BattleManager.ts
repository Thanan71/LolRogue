/**
 * BattleManager — core combat engine for 5v5 battles.
 *
 * Phase 2: Initiative & turn-by-turn system.
 */

import { createBuff, createDebuff } from '@/game/effects/BuffDebuffEffect';
import { EffectManager } from '@/game/effects/EffectManager';
import type { StatKey } from '@/game/effects/types';
import { TargetingType, type SpellEffect } from '@/types/champion';
import {
  calculateADDamage,
  calculateAPDamage,
  calculateTrueDamage,
  critDamage,
} from '@/utils/damage';
import type { ChampionInstance, SpellSlot } from '../ChampionInstance';
import { actionToSpellSlot } from './actionSlots';
import { isActionTargeting, resolveBattleTargets } from './targetResolver';
import {
  ActionType,
  type ActionTargeting,
  type BattleAction,
  type BattleActionOption,
  type BattleEvent,
  BattlePhase,
  type BattleResult,
  type BattleTeam,
  type CombatantState,
  type TeamSide,
  type TurnEntry,
} from './types';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Maximum random speed jitter added to turn order calculation (in speed units) */
const SPEED_JITTER_MAX = 0.5;

type EventCallback = (event: BattleEvent) => void;
type ActionCallback = (
  champion: ChampionInstance,
  side: TeamSide,
  availableEnemies: CombatantState[],
  availableAllies: CombatantState[],
) => BattleAction | null;

export interface BattleManagerOptions {
  autoActions?: boolean;
  turnDelay?: number;
  maxRounds?: number;
  maxTeamSize?: number;
  /** Map of championId -> initial HP (for persisting HP between combats). */
  initialHpOverrides?: Record<string, number>;
  /** Injectable random source so a seeded run can reproduce combat exactly. */
  random?: () => number;
}

interface ActionDefinition {
  type: ActionType;
  cost: number;
  cooldown: number;
  targeting: ActionTargeting;
  spellSlot?: SpellSlot;
  rankIndex: number;
}

interface ValidatedBattleAction extends ActionDefinition {
  targets: CombatantState[];
}

interface ResolvableCombatant {
  id: string;
  side: TeamSide;
  isDefeated: boolean;
  state: CombatantState;
}

export class BattleManager {
  private _phase: BattlePhase = BattlePhase.Idle;
  private _round = 0;
  private _turnIndex = 0;
  private _turnOrder: TurnEntry[] = [];
  private _playerCombatants: CombatantState[] = [];
  private _enemyCombatants: CombatantState[] = [];
  private _log: BattleEvent[] = [];
  private _listeners: Map<string, EventCallback[]> = new Map();
  private readonly _autoActions: boolean;
  private readonly _maxRounds: number;
  private readonly _maxTeamSize: number;
  private readonly _initialHpOverrides: Record<string, number> | undefined;
  private readonly _random: () => number;
  private _actionCallback: ActionCallback | null = null;

  constructor(
    private readonly _playerTeam: BattleTeam,
    private readonly _enemyTeam: BattleTeam,
    options: BattleManagerOptions = {},
  ) {
    this._autoActions = options.autoActions ?? true;
    this._maxRounds = options.maxRounds ?? 50;
    this._maxTeamSize = options.maxTeamSize ?? 5;
    this._initialHpOverrides = options.initialHpOverrides;
    this._random = options.random ?? Math.random;
    this._initCombatants();
  }

  get phase(): BattlePhase {
    return this._phase;
  }
  get round(): number {
    return this._round;
  }
  get turnIndex(): number {
    return this._turnIndex;
  }
  get turnOrder(): ReadonlyArray<TurnEntry> {
    return this._turnOrder;
  }
  get log(): ReadonlyArray<BattleEvent> {
    return this._log;
  }

  get state() {
    return {
      phase: this._phase,
      round: this._round,
      turnIndex: this._turnIndex,
      playerAlive: this._playerCombatants.filter((c) => !c.isDefeated).length,
      enemyAlive: this._enemyCombatants.filter((c) => !c.isDefeated).length,
    };
  }

  get currentTurnEntry(): TurnEntry | null {
    return this._turnOrder[this._turnIndex] ?? null;
  }

  get currentCombatant(): CombatantState | null {
    const entry = this.currentTurnEntry;
    if (!entry) return null;
    return this._findCombatantForChampion(entry.champion) ?? null;
  }

  getPlayerCombatants(): CombatantState[] {
    return this._playerCombatants;
  }
  getEnemyCombatants(): CombatantState[] {
    return this._enemyCombatants;
  }

  /** Get final HP state for each player champion (for persistence between combats). */
  getFinalPlayerStates(): { championId: string; currentHp: number; maxHp: number }[] {
    return this._playerCombatants.map((c) => ({
      championId: c.champion.id,
      currentHp: c.isDefeated ? 0 : c.currentHp,
      maxHp: c.maxHp,
    }));
  }

  getCombatantState(id: string, side: TeamSide): CombatantState | undefined {
    return this._getCombatant(id, side);
  }

  getAliveCombatants(side: TeamSide): CombatantState[] {
    const list = side === 'player' ? this._playerCombatants : this._enemyCombatants;
    return list.filter((c) => !c.isDefeated);
  }

  getAliveEnemies(side: TeamSide): CombatantState[] {
    return this.getAliveCombatants(side === 'player' ? 'enemy' : 'player');
  }

  on(event: string, cb: EventCallback): void {
    if (!this._listeners.has(event)) this._listeners.set(event, []);
    this._listeners.get(event)!.push(cb);
  }

  off(event: string, cb: EventCallback): void {
    const arr = this._listeners.get(event);
    if (arr) {
      const idx = arr.indexOf(cb);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  private _emit(event: BattleEvent): void {
    this._log.push(event);
    const cbs = this._listeners.get('event');
    if (cbs) cbs.forEach((cb) => cb(event));
  }

  setActionCallback(cb: ActionCallback): void {
    this._actionCallback = cb;
  }

  getAvailableActions(champion: ChampionInstance): BattleActionOption[] {
    const combatant = this._findCombatantForChampion(champion);
    if (
      !combatant ||
      this._phase !== BattlePhase.TurnActive ||
      this.currentCombatant !== combatant ||
      combatant.isDefeated ||
      combatant.ccTurnsLeft > 0
    ) {
      return [];
    }

    const actionTypes = [
      ActionType.BasicAttack,
      ActionType.SpellQ,
      ActionType.SpellW,
      ActionType.SpellE,
      ActionType.SpellR,
    ];

    return actionTypes.flatMap((type) => {
      const definition = this._getActionDefinition(combatant, type);
      if (!definition) return [];
      if (
        definition.spellSlot &&
        (!champion.isSpellReady(definition.spellSlot) || combatant.currentMp < definition.cost)
      ) {
        return [];
      }
      const resolution = resolveBattleTargets(
        this._getTargetableCombatants(),
        combatant.targetId,
        combatant.side,
        definition.targeting,
      );
      if (resolution.legalTargets.length === 0) return [];
      return [
        {
          type,
          cost: definition.cost,
          cooldown: definition.cooldown,
          targeting: definition.targeting,
          requiresTarget: resolution.requiresTarget,
          validTargetIds: resolution.legalTargets.map((target) => target.id),
        },
      ];
    });
  }

  /** Valid target ids for the current actor and action, sourced from the canonical resolver. */
  getAvailableTargets(type: ActionType): string[] {
    const attacker = this.currentCombatant;
    if (!attacker || attacker.isDefeated) return [];
    return (
      this.getAvailableActions(attacker.champion).find((action) => action.type === type)
        ?.validTargetIds ?? []
    );
  }

  startBattle(): void {
    if (this._phase !== BattlePhase.Idle) return;
    this._phase = BattlePhase.Starting;
    this._round = 0;
    this._log = [];
    this._initCombatants();
    this._nextRound();
  }

  processCurrentTurn(): void {
    if (this._phase !== BattlePhase.TurnActive) return;
    const entry = this._turnOrder[this._turnIndex];
    if (!entry) {
      this._nextTurn();
      return;
    }

    const attackerState = this._findCombatantForChampion(entry.champion);
    if (!attackerState || attackerState.isDefeated) {
      this._nextTurn();
      return;
    }

    // CC check: if stunned, skip this turn and decrement counter
    if (attackerState.ccTurnsLeft > 0) {
      attackerState.ccTurnsLeft--;
      this._nextTurn();
      return;
    }

    const enemies = this.getAliveEnemies(entry.side);
    const allies = this.getAliveCombatants(entry.side);
    if (enemies.length === 0) {
      this._nextTurn();
      return;
    }

    let action: BattleAction | null = null;
    if (!this._autoActions && entry.side === 'player' && this._actionCallback) {
      action = this._actionCallback(entry.champion, entry.side, enemies, allies);
    }
    let validated = action ? this._validateAction(attackerState, action) : null;
    if (!validated) {
      action = this._selectAIAction(attackerState);
      validated = action ? this._validateAction(attackerState, action) : null;
    }
    if (!action || !validated) {
      this._nextTurn();
      return;
    }

    this._emit({
      type: 'action_select',
      champion: entry.champion.id,
      side: entry.side,
      action: action.type,
    });

    this._executeAction(attackerState, validated);
    if (this._checkVictory()) return;
    this._nextTurn();
  }

  submitAction(action: BattleAction): boolean {
    if (this._phase !== BattlePhase.TurnActive) return false;
    const entry = this._turnOrder[this._turnIndex];
    if (!entry || entry.side !== 'player') return false;

    const attackerState = this._findCombatantForChampion(entry.champion);
    if (!attackerState) return false;
    const validated = this._validateAction(attackerState, action);
    if (!validated) return false;

    this._emit({
      type: 'action_select',
      champion: entry.champion.id,
      side: entry.side,
      action: action.type,
    });

    this._executeAction(attackerState, validated);
    if (this._checkVictory()) return true;
    this._nextTurn();
    return true;
  }

  checkVictory(): boolean {
    return this._checkVictory();
  }

  getResult(): BattleResult | null {
    if (this._phase !== BattlePhase.Finished) return null;
    const last = this._log[this._log.length - 1];
    if (last?.type !== 'battle_end') return null;
    return { winner: last.winner, totalRounds: last.rounds, log: [...this._log] };
  }

  private _initCombatants(): void {
    const hpOverrides = this._initialHpOverrides;
    const playerChampions = this._playerTeam.champions.slice(0, this._maxTeamSize);
    this._playerCombatants = playerChampions.map((c, index) => {
      // Use enhanced stats if available, otherwise fall back to base stats
      const stats = c.getEnhancedStats ? c.getEnhancedStats() : c.getStats();
      const overriddenHp = hpOverrides?.[c.id];
      const initHp = overriddenHp !== undefined ? Math.min(overriddenHp, stats.hp) : stats.hp;
      return {
        targetId: getUniqueTargetId(playerChampions, index),
        champion: c,
        side: 'player' as TeamSide,
        currentHp: initHp,
        maxHp: stats.hp,
        currentMp: stats.mp,
        maxMp: stats.mp,
        isDefeated: initHp <= 0,
        currentShield: 0,
        ccTurnsLeft: 0,
        effectManager: new EffectManager(c.id),
      };
    });
    const enemyChampions = this._enemyTeam.champions.slice(0, this._maxTeamSize);
    this._enemyCombatants = enemyChampions.map((c, index) => {
      // Use enhanced stats if available, otherwise fall back to base stats
      const stats = c.getEnhancedStats ? c.getEnhancedStats() : c.getStats();
      return {
        targetId: getUniqueTargetId(enemyChampions, index),
        champion: c,
        side: 'enemy' as TeamSide,
        currentHp: stats.hp,
        maxHp: stats.hp,
        currentMp: stats.mp,
        maxMp: stats.mp,
        isDefeated: false,
        currentShield: 0,
        ccTurnsLeft: 0,
        effectManager: new EffectManager(c.id),
      };
    });
    // Reset all cooldowns at battle start
    this._resetAllCooldowns();
  }

  private _nextRound(): void {
    this._round++;
    this._turnIndex = 0;
    this._buildTurnOrder();
    if (this._checkVictory()) return;

    this._emit({
      type: 'round_start',
      round: this._round,
      turnOrder: this._turnOrder.map((e) => ({
        champion: this._findCombatantForChampion(e.champion)?.targetId ?? e.champion.id,
        side: e.side,
        speedValue: e.speedValue,
      })),
    });

    this._phase = BattlePhase.TurnActive;
    this._startCurrentTurn();
  }

  private _nextTurn(): void {
    this._turnIndex++;
    if (this._turnIndex >= this._turnOrder.length) {
      // Tick cooldowns at the END of the round, after all turns have completed
      this._tickAllCooldowns();
      this._nextRound();
    } else {
      this._startCurrentTurn();
    }
  }

  private _buildTurnOrder(): void {
    const all: TurnEntry[] = [];
    for (const c of this._playerCombatants) {
      if (!c.isDefeated) {
        all.push({
          champion: c.champion,
          side: 'player',
          speedValue: this._calcSpeedPriority(c.champion),
        });
      }
    }
    for (const c of this._enemyCombatants) {
      if (!c.isDefeated) {
        all.push({
          champion: c.champion,
          side: 'enemy',
          speedValue: this._calcSpeedPriority(c.champion),
        });
      }
    }
    all.sort((a, b) => b.speedValue - a.speedValue);
    this._turnOrder = all;
  }

  private _calcSpeedPriority(champion: ChampionInstance): number {
    // Use enhanced stats (getEnhancedStats always returns valid stats, falling back to base stats if no bonuses)
    const stats = champion.getEnhancedStats();
    const jitter = this._random() * SPEED_JITTER_MAX;
    return stats.moveSpeed + jitter;
  }

  private _startCurrentTurn(): void {
    const entry = this._turnOrder[this._turnIndex];
    if (!entry) return;
    const combatant = this._findCombatantForChampion(entry.champion);
    this._emit({
      type: 'turn_start',
      champion: combatant?.targetId ?? entry.champion.id,
      side: entry.side,
      turnIndex: this._turnIndex,
    });
  }

  private _validateAction(
    attacker: CombatantState,
    action: BattleAction,
  ): ValidatedBattleAction | null {
    const entry = this.currentTurnEntry;
    if (
      this._phase !== BattlePhase.TurnActive ||
      !entry ||
      entry.champion !== attacker.champion ||
      entry.side !== attacker.side ||
      attacker.isDefeated ||
      attacker.ccTurnsLeft > 0 ||
      !Object.values(ActionType).includes(action.type)
    ) {
      return null;
    }

    const definition = this._getActionDefinition(attacker, action.type);
    if (!definition) return null;
    if (
      definition.spellSlot &&
      (!attacker.champion.isSpellReady(definition.spellSlot) ||
        attacker.currentMp < definition.cost)
    ) {
      return null;
    }

    const resolution = resolveBattleTargets(
      this._getTargetableCombatants(),
      attacker.targetId,
      attacker.side,
      definition.targeting,
      action.targetId,
    );
    if (!resolution.ok || resolution.targets.length === 0) return null;
    return {
      ...definition,
      targets: resolution.targets.map((target) => target.state),
    };
  }

  private _getActionDefinition(
    attacker: CombatantState,
    type: ActionType,
  ): ActionDefinition | null {
    if (type === ActionType.BasicAttack) {
      return {
        type,
        cost: 0,
        cooldown: 0,
        targeting: TargetingType.Enemy,
        rankIndex: 0,
      };
    }

    const spellSlot = actionToSpellSlot(type);
    if (!spellSlot) return null;
    const spell = attacker.champion.getSpell(spellSlot);
    if (!spell || !isActionTargeting(spell.targeting)) return null;
    const rank = attacker.champion.getSpellRank(spellSlot);
    if (!Number.isInteger(rank) || rank < 1 || rank > spell.maxRank) return null;

    return {
      type,
      cost: getRankValue(spell.cost, rank),
      cooldown: getRankValue(spell.cooldown, rank),
      targeting: spell.targeting,
      spellSlot,
      rankIndex: rank - 1,
    };
  }

  private _getTargetableCombatants(): ResolvableCombatant[] {
    return [...this._playerCombatants, ...this._enemyCombatants].map((state) => ({
      id: state.targetId,
      side: state.side,
      isDefeated: state.isDefeated,
      state,
    }));
  }

  private _selectAIAction(attacker: CombatantState): BattleAction | null {
    const priority = [
      ActionType.SpellR,
      ActionType.SpellE,
      ActionType.SpellW,
      ActionType.SpellQ,
      ActionType.BasicAttack,
    ];
    const available = this.getAvailableActions(attacker.champion);
    for (const type of priority) {
      const option = available.find((candidate) => candidate.type === type);
      if (!option) continue;
      const targetId = option.requiresTarget
        ? option.validTargetIds[Math.floor(this._random() * option.validTargetIds.length)]
        : undefined;
      return { type, targetId };
    }
    return null;
  }

  private _executeAction(attacker: CombatantState, action: ValidatedBattleAction): void {
    // ── Basic Attack: keep existing AD-only logic ──
    if (action.type === ActionType.BasicAttack) {
      this._performBasicAttack(attacker, action.targets[0]);
      return;
    }

    // ── Spell Action: read spell definition and process effects ──
    const spellSlot = action.spellSlot;
    if (!spellSlot) return;
    const spell = attacker.champion.getSpell(spellSlot);
    if (!spell) return;

    // Validation has completed before either resource is mutated.
    if (!attacker.champion.useSpell(spellSlot)) return;
    attacker.currentMp = Math.max(0, attacker.currentMp - action.cost);

    // Use enhanced stats for spell damage calculation (getEnhancedStats always returns valid stats)
    const atkStats = attacker.champion.getEnhancedStats();

    for (const effect of spell.effects) {
      this._applySpellEffect(effect, attacker, action.targets, atkStats, action.rankIndex);
    }
  }

  /**
   * Apply a single SpellEffect. Handles damage, heal, shield, cc.
   */
  private _applySpellEffect(
    effect: SpellEffect,
    attacker: CombatantState,
    primaryTargets: CombatantState[],
    atkStats: ReturnType<ChampionInstance['getStats']>,
    rankIdx: number,
  ): void {
    const hostileTargets = primaryTargets.filter(
      (candidate) => candidate.side !== attacker.side && !candidate.isDefeated,
    );
    const alliedTargets = primaryTargets.filter(
      (candidate) => candidate.side === attacker.side && !candidate.isDefeated,
    );
    // An offensive spell with a secondary positive effect (for example Soraka Q)
    // applies that positive effect to its caster.
    const positiveTargets = alliedTargets.length > 0 ? alliedTargets : [attacker];

    switch (effect.type) {
      case 'damage': {
        for (const target of hostileTargets) {
          // Use enhanced stats for defense calculation (getEnhancedStats always returns valid stats)
          const defStats = target.champion.getEnhancedStats();

          const baseDmg = effect.baseDamage?.[rankIdx] ?? 0;
          const adRatio = effect.adRatio ?? 0;
          const apRatio = effect.apRatio ?? 0;
          const statDmg = atkStats.attackDamage * adRatio + atkStats.abilityPower * apRatio;
          const rawDmg = baseDmg + statDmg;

          let finalDmg: number;
          const dmgType = effect.damageType ?? 'physical';
          // Handle both 'magical'/'ap' for magic damage and 'true' for true damage
          if (dmgType === 'magical' || dmgType === 'ap') {
            finalDmg = calculateAPDamage(rawDmg, 1.0, defStats.magicResist);
          } else if (dmgType === 'true') {
            finalDmg = calculateTrueDamage(rawDmg);
          } else {
            // Default to physical/AD damage
            finalDmg = calculateADDamage(rawDmg, 1.0, defStats.armor);
          }
          this._applyDamageToTarget(attacker, target, finalDmg);
        }
        break;
      }
      case 'heal': {
        for (const healTarget of positiveTargets) {
          const baseHeal = effect.baseValue?.[rankIdx] ?? 0;
          const apRatio = effect.apRatio ?? 0;
          const healAmount = Math.round(baseHeal + atkStats.abilityPower * apRatio);
          if (healAmount <= 0) continue;
          healTarget.currentHp = Math.min(healTarget.maxHp, healTarget.currentHp + healAmount);
          this._emit({
            type: 'heal',
            source: attacker.champion.id,
            target: healTarget.champion.id,
            amount: healAmount,
            sourceSide: attacker.side,
            targetSide: healTarget.side,
          });
        }
        break;
      }
      case 'shield': {
        for (const shieldTarget of positiveTargets) {
          const baseShield = effect.baseValue?.[rankIdx] ?? 0;
          const apRatio = effect.apRatio ?? 0;
          const shieldAmount = Math.round(baseShield + atkStats.abilityPower * apRatio);
          if (shieldAmount <= 0) continue;
          shieldTarget.currentShield += shieldAmount;
          this._emit({
            type: 'shield',
            source: attacker.champion.id,
            target: shieldTarget.champion.id,
            amount: shieldAmount,
            sourceSide: attacker.side,
            targetSide: shieldTarget.side,
          });
        }
        break;
      }
      case 'cc': {
        for (const ccTarget of hostileTargets) {
          // Hard CC (stun, knockup, charm) sets ccTurnsLeft so processCurrentTurn skips the turn
          const ccDuration = effect.ccDuration ?? 1;
          const ccTurns = Math.max(1, Math.round(ccDuration));
          const ccType = (effect.ccType ?? '').toLowerCase();
          const hardCC = ['stun', 'knockup', 'charm'].includes(ccType);
          if (hardCC) {
            ccTarget.ccTurnsLeft = Math.max(ccTarget.ccTurnsLeft, ccTurns);
          }
          this._emit({
            type: 'damage',
            source: attacker.champion.id,
            target: ccTarget.champion.id,
            amount: 0,
            isCrit: false,
            sourceSide: attacker.side,
            targetSide: ccTarget.side,
          });
        }
        break;
      }
      case 'buff': {
        for (const buffTarget of positiveTargets) {
          const stat = (effect.stat ?? 'atk') as StatKey;
          const modifierType = effect.modifierType ?? 'flat';
          const rawValue = effect.values?.[rankIdx] ?? 0;
          if (rawValue === 0) continue;
          const duration = Math.max(1, Math.round(effect.buffDuration ?? 3));
          const bdEffect = createBuff(
            `${attacker.champion.id}_buff_${stat}`,
            attacker.champion.id,
            buffTarget.champion.id,
            stat,
            rawValue,
            modifierType,
            duration,
          );
          buffTarget.effectManager.apply(bdEffect);
          this._emit({
            type: 'shield', // reuse existing event type for UI feedback
            source: attacker.champion.id,
            target: buffTarget.champion.id,
            amount: rawValue,
            sourceSide: attacker.side,
            targetSide: buffTarget.side,
          });
        }
        break;
      }
      case 'debuff': {
        for (const debuffTarget of hostileTargets) {
          const stat = (effect.stat ?? 'def') as StatKey;
          const modifierType = effect.modifierType ?? 'flat';
          const rawValue = effect.values?.[rankIdx] ?? 0;
          if (rawValue === 0) continue;
          const duration = Math.max(1, Math.round(effect.buffDuration ?? 3));
          const bdEffect = createDebuff(
            `${attacker.champion.id}_debuff_${stat}`,
            attacker.champion.id,
            debuffTarget.champion.id,
            stat,
            rawValue,
            modifierType,
            duration,
          );
          debuffTarget.effectManager.apply(bdEffect);
          this._emit({
            type: 'shield', // reuse existing event type for UI feedback
            source: attacker.champion.id,
            target: debuffTarget.champion.id,
            amount: rawValue,
            sourceSide: attacker.side,
            targetSide: debuffTarget.side,
          });
        }
        break;
      }
      default:
        break;
    }
  }

  /** Apply damage to a target, absorbing into shield first. */
  private _applyDamageToTarget(
    attacker: CombatantState,
    target: CombatantState,
    damage: number,
  ): void {
    let remaining = damage;
    if (target.currentShield > 0 && remaining > 0) {
      if (target.currentShield >= remaining) {
        target.currentShield -= remaining;
        remaining = 0;
      } else {
        remaining -= target.currentShield;
        target.currentShield = 0;
      }
    }
    if (remaining > 0) {
      target.currentHp = Math.max(0, target.currentHp - remaining);
    }
    if (damage > 0) {
      this._emit({
        type: 'damage',
        source: attacker.champion.id,
        target: target.champion.id,
        amount: damage,
        isCrit: false,
        sourceSide: attacker.side,
        targetSide: target.side,
      });
    }
    if (target.currentHp <= 0) {
      target.isDefeated = true;
      this._emit({
        type: 'defeat',
        champion: target.champion.id,
        side: target.side,
        defeatedBy: attacker.champion.id,
      });
    }
  }

  /** Basic attack: AD-only with crit, mitigated by armor. */
  private _performBasicAttack(attacker: CombatantState, target: CombatantState): void {
    // Use enhanced stats for both attack and defense (getEnhancedStats always returns valid stats)
    const atkStats = attacker.champion.getEnhancedStats();
    const defStats = target.champion.getEnhancedStats();

    const baseRaw = atkStats.attackDamage;
    const critChance = Math.min(100, atkStats.crit) / 100;
    const isCrit = this._random() < critChance;
    const rawDmg = isCrit ? critDamage(baseRaw) : baseRaw;
    const finalDmg = calculateADDamage(rawDmg, 1.0, defStats.armor);

    let remaining = finalDmg;
    if (target.currentShield > 0 && remaining > 0) {
      if (target.currentShield >= remaining) {
        target.currentShield -= remaining;
        remaining = 0;
      } else {
        remaining -= target.currentShield;
        target.currentShield = 0;
      }
    }
    target.currentHp = Math.max(0, target.currentHp - remaining);

    this._emit({
      type: 'damage',
      source: attacker.champion.id,
      target: target.champion.id,
      amount: finalDmg,
      isCrit,
      sourceSide: attacker.side,
      targetSide: target.side,
    });
    if (target.currentHp <= 0) {
      target.isDefeated = true;
      this._emit({
        type: 'defeat',
        champion: target.champion.id,
        side: target.side,
        defeatedBy: attacker.champion.id,
      });
    }
  }

  /** Tick cooldowns for all alive combatants at end of round (after all turns complete). */
  private _tickAllCooldowns(): void {
    for (const c of [...this._playerCombatants, ...this._enemyCombatants]) {
      if (!c.isDefeated) {
        c.champion.tickCooldowns();
      }
    }
  }

  /** Reset cooldowns for all combatants (end of battle). */
  private _resetAllCooldowns(): void {
    for (const c of [...this._playerCombatants, ...this._enemyCombatants]) {
      c.champion.resetCooldowns();
    }
  }

  private _checkVictory(): boolean {
    const playerAlive = this._playerCombatants.some((c) => !c.isDefeated);
    const enemyAlive = this._enemyCombatants.some((c) => !c.isDefeated);

    if (!playerAlive || !enemyAlive) {
      this._phase = BattlePhase.Finished;
      this._resetAllCooldowns();
      const winner: TeamSide | 'draw' =
        !playerAlive && !enemyAlive ? 'draw' : playerAlive ? 'player' : 'enemy';
      this._emit({ type: 'battle_end', winner, rounds: this._round });
      return true;
    }

    if (this._round >= this._maxRounds) {
      this._phase = BattlePhase.Finished;
      this._resetAllCooldowns();
      this._emit({ type: 'battle_end', winner: 'draw', rounds: this._round });
      return true;
    }
    return false;
  }

  private _findCombatantForChampion(champion: ChampionInstance): CombatantState | undefined {
    return [...this._playerCombatants, ...this._enemyCombatants].find(
      (combatant) => combatant.champion === champion,
    );
  }

  private _getCombatant(id: string, side: TeamSide): CombatantState | undefined {
    const list = side === 'player' ? this._playerCombatants : this._enemyCombatants;
    return list.find((c) => c.targetId === id || c.champion.id === id);
  }
}

function getRankValue(values: readonly number[], rank: number): number {
  if (values.length === 0) return 0;
  return values[rank - 1] ?? values[values.length - 1] ?? 0;
}

function getUniqueTargetId(champions: readonly ChampionInstance[], index: number): string {
  const championId = champions[index].id;
  if (champions.filter((champion) => champion.id === championId).length === 1) return championId;
  const occurrence = champions
    .slice(0, index + 1)
    .filter((champion) => champion.id === championId).length;
  return `${championId}#${occurrence}`;
}
