/**
 * BattleManager — core combat engine for 5v5 battles.
 *
 * Phase 2: Initiative & turn-by-turn system.
 */

import { createBuff } from '@/game/effects/BuffDebuffEffect';
import { CCEffect } from '@/game/effects/CCEffect';
import { DamageEffect } from '@/game/effects/DamageEffect';
import { EffectManager } from '@/game/effects/EffectManager';
import { normalizePercent, normalizeTurnDuration } from '@/game/effects/effectUnits';
import { HealEffect } from '@/game/effects/HealEffect';
import { ShieldEffect } from '@/game/effects/ShieldEffect';
import { CCType, DamageType, type StatKey } from '@/game/effects/types';
import type { CombatRuleRuntime } from '@/game/rules/CombatRuleRuntime';
import type {
  CombatRuleActor,
  CombatRuleInstantEffect,
  CombatRuleResolution,
} from '@/game/rules/types';
import type { SpellEffect } from '@/types/champion';
import {
  calculateADDamage,
  calculateAPDamage,
  calculateTrueDamage,
  critDamage,
} from '@/utils/damage';
import type { ChampionInstance } from '../ChampionInstance';
import type { CombatActionTrace } from './actionTrace';
import {
  getBattleActionDefinition,
  type ResolvableCombatant,
  type ValidatedBattleAction,
  validateBattleAction,
} from './BattleActionValidator';
import { type BattleEventCallback, BattleEventJournal } from './BattleEventJournal';
import { BattleSpellEffectResolver } from './BattleSpellEffectResolver';
import { isPassiveCombatReady } from './combatContentSupport';
import { resolveBattleTargets } from './targetResolver';
import {
  ActionType,
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
  /** Map of championId -> initial MP (for persisting mana between combats). */
  initialMpOverrides?: Record<string, number>;
  /** Injectable random source so a seeded run can reproduce combat exactly. */
  random?: () => number;
  /** Combat-local rule bus for runes, augments, items and enhancements. */
  rules?: CombatRuleRuntime;
}

export class BattleManager {
  private _phase: BattlePhase = BattlePhase.Idle;
  private _round = 0;
  private _turnIndex = 0;
  private _turnOrder: TurnEntry[] = [];
  private _playerCombatants: CombatantState[] = [];
  private _enemyCombatants: CombatantState[] = [];
  private readonly _events = new BattleEventJournal();
  private readonly _autoActions: boolean;
  private readonly _maxRounds: number;
  private readonly _maxTeamSize: number;
  private readonly _initialHpOverrides: Record<string, number> | undefined;
  private readonly _initialMpOverrides: Record<string, number> | undefined;
  private readonly _random: () => number;
  private readonly _rules: CombatRuleRuntime | null;
  private _activeActionType: ActionType | null = null;
  private _actionCallback: ActionCallback | null = null;
  private _playerActionTrace: CombatActionTrace = [];
  private readonly _lastDamagedRound = new Map<string, number>();
  private readonly _passiveCounters = new Map<string, number>();
  private readonly _preserveHpOnRuleInitialization = new Set<string>();
  private readonly _passiveMarks = new Map<
    string,
    {
      luxSourceId?: string;
      luxExpiresRound?: number;
      leonaSourceId?: string;
      leonaExpiresRound?: number;
    }
  >();

  constructor(
    private readonly _playerTeam: BattleTeam,
    private readonly _enemyTeam: BattleTeam,
    options: BattleManagerOptions = {},
  ) {
    this._autoActions = options.autoActions ?? true;
    this._maxRounds = options.maxRounds ?? 50;
    this._maxTeamSize = options.maxTeamSize ?? 5;
    this._initialHpOverrides = options.initialHpOverrides;
    this._initialMpOverrides = options.initialMpOverrides;
    this._random = options.random ?? Math.random;
    this._rules = options.rules ?? null;
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
    return this._events.read();
  }
  getPlayerActionTrace(): CombatActionTrace {
    return this._playerActionTrace.map((action) => ({ ...action }));
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

  /** Get final persistent resources for each player champion. */
  getFinalPlayerStates(): {
    championId: string;
    currentHp: number;
    maxHp: number;
    currentMp: number;
    maxMp: number;
  }[] {
    return this._playerCombatants.map((c) => ({
      championId: c.champion.id,
      currentHp: c.isDefeated ? 0 : c.currentHp,
      maxHp: c.maxHp,
      currentMp: c.currentMp,
      maxMp: c.maxMp,
    }));
  }

  getConsumedItemInstanceIds(): string[] {
    return this._rules?.consumedItemInstanceIds ?? [];
  }

  getRuneStacks(): Record<string, Record<string, number>> {
    return this._rules?.getRuneStacks() ?? {};
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

  on(event: string, cb: BattleEventCallback): void {
    if (event === 'event') this._events.subscribe(cb);
  }

  off(event: string, cb: BattleEventCallback): void {
    if (event === 'event') this._events.unsubscribe(cb);
  }

  private _emit(event: BattleEvent): void {
    this._events.append(event);
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
      !combatant.effectManager.canAct()
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
      const definition = getBattleActionDefinition(combatant, type);
      if (!definition) return [];
      if (type === ActionType.BasicAttack && !combatant.effectManager.canMove()) return [];
      if (
        definition.spellSlot &&
        (!champion.isSpellReady(definition.spellSlot) ||
          combatant.currentMp < definition.cost ||
          !combatant.effectManager.canCast())
      ) {
        return [];
      }
      const resolution = resolveBattleTargets(
        this._getTargetableCombatants(),
        combatant.targetId,
        combatant.side,
        definition.targeting,
        undefined,
        { includeDefeated: definition.includeDefeatedTargets },
      );
      if (resolution.legalTargets.length === 0) return [];
      return [
        {
          type,
          cost: definition.cost,
          cooldownTurns: definition.cooldownTurns,
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
    this._events.reset();
    this._playerActionTrace = [];
    this._initCombatants();
    this._rules?.reset();
    const battleStart = this._rules?.dispatch({
      type: 'battle_start',
      actors: this._getRuleActors(),
    });
    if (battleStart) this._resolveRuleEffects(battleStart);
    this._initializePassives();
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

    const turnEffectIds = attackerState.effectManager.effects.map((effect) => effect.id);

    // Canonical turn cycle:
    // start → controls → command → cast/attack → effects/deaths → end → duration ticks.
    if (!attackerState.effectManager.canAct()) {
      this._applyTurnEndPassives(attackerState);
      this._dispatchTurnEnd(attackerState);
      this._tickTurnEffects(attackerState, turnEffectIds);
      if (this._checkVictory()) return;
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
    let automaticAction = false;
    if (!this._autoActions && entry.side === 'player' && this._actionCallback) {
      action = this._actionCallback(entry.champion, entry.side, enemies, allies);
    }
    let validated = action ? this._validateAction(attackerState, action) : null;
    if (!validated) {
      action = this._selectAIAction(attackerState);
      automaticAction = true;
      validated = action ? this._validateAction(attackerState, action) : null;
    }
    if (!action || !validated) {
      this._applyTurnEndPassives(attackerState);
      this._dispatchTurnEnd(attackerState);
      this._tickTurnEffects(attackerState, turnEffectIds);
      if (this._checkVictory()) return;
      this._nextTurn();
      return;
    }
    if (entry.side === 'player') {
      this._playerActionTrace.push({ ...action, automatic: automaticAction });
    }

    this._emit({
      type: 'action_select',
      champion: entry.champion.id,
      side: entry.side,
      action: action.type,
    });

    this._executeAction(attackerState, validated);
    if (this._checkVictory()) return;
    this._applyTurnEndPassives(attackerState);
    this._dispatchTurnEnd(attackerState);
    this._tickTurnEffects(attackerState, turnEffectIds);
    if (this._checkVictory()) return;
    this._nextTurn();
  }

  submitAction(action: BattleAction): boolean {
    if (this._phase !== BattlePhase.TurnActive) return false;
    const entry = this._turnOrder[this._turnIndex];
    if (!entry || entry.side !== 'player') return false;

    const attackerState = this._findCombatantForChampion(entry.champion);
    if (!attackerState) return false;
    const turnEffectIds = attackerState.effectManager.effects.map((effect) => effect.id);
    const validated = this._validateAction(attackerState, action);
    if (!validated) return false;
    this._playerActionTrace.push({ ...action, automatic: false });

    this._emit({
      type: 'action_select',
      champion: entry.champion.id,
      side: entry.side,
      action: action.type,
    });

    this._executeAction(attackerState, validated);
    if (this._checkVictory()) return true;
    this._applyTurnEndPassives(attackerState);
    this._dispatchTurnEnd(attackerState);
    this._tickTurnEffects(attackerState, turnEffectIds);
    if (this._checkVictory()) return true;
    this._nextTurn();
    return true;
  }

  checkVictory(): boolean {
    return this._checkVictory();
  }

  getResult(): BattleResult | null {
    return this._events.result(this._phase);
  }

  private _initCombatants(): void {
    this._lastDamagedRound.clear();
    this._passiveCounters.clear();
    this._passiveMarks.clear();
    this._preserveHpOnRuleInitialization.clear();
    const hpOverrides = this._initialHpOverrides;
    const mpOverrides = this._initialMpOverrides;
    const playerChampions = this._playerTeam.champions.slice(0, this._maxTeamSize);
    this._playerCombatants = playerChampions.map((c, index) => {
      // Use enhanced stats if available, otherwise fall back to base stats
      const stats = c.getEnhancedStats ? c.getEnhancedStats() : c.getStats();
      const overriddenHp = hpOverrides?.[c.id];
      const initHp =
        overriddenHp !== undefined
          ? this._rules
            ? Math.max(0, overriddenHp)
            : Math.min(overriddenHp, stats.hp)
          : stats.hp;
      const targetId = getUniqueTargetId(playerChampions, index);
      const overriddenMp = mpOverrides?.[c.id];
      const initMp =
        overriddenMp === undefined || !Number.isFinite(overriddenMp)
          ? stats.mp
          : Math.min(stats.mp, Math.max(0, overriddenMp));
      if (overriddenHp !== undefined && this._rules) {
        this._preserveHpOnRuleInitialization.add(targetId);
      }
      return {
        targetId,
        champion: c,
        side: 'player' as TeamSide,
        currentHp: initHp,
        maxHp: stats.hp,
        currentMp: initMp,
        maxMp: stats.mp,
        isDefeated: initHp <= 0,
        currentShield: 0,
        ccTurnsLeft: 0,
        effectManager: new EffectManager(targetId),
      };
    });
    const enemyChampions = this._enemyTeam.champions.slice(0, this._maxTeamSize);
    this._enemyCombatants = enemyChampions.map((c, index) => {
      // Use enhanced stats if available, otherwise fall back to base stats
      const stats = c.getEnhancedStats ? c.getEnhancedStats() : c.getStats();
      const targetId = getUniqueTargetId(enemyChampions, index);
      return {
        targetId,
        champion: c,
        side: 'enemy' as TeamSide,
        currentHp: stats.hp,
        maxHp: stats.hp,
        currentMp: stats.mp,
        maxMp: stats.mp,
        isDefeated: false,
        currentShield: 0,
        ccTurnsLeft: 0,
        effectManager: new EffectManager(targetId),
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
          speedValue: this._calcSpeedPriority(c),
        });
      }
    }
    for (const c of this._enemyCombatants) {
      if (!c.isDefeated) {
        all.push({
          champion: c.champion,
          side: 'enemy',
          speedValue: this._calcSpeedPriority(c),
        });
      }
    }
    all.sort((a, b) => b.speedValue - a.speedValue);
    this._turnOrder = all;
  }

  private _calcSpeedPriority(combatant: CombatantState): number {
    const stats = this._getCombatStats(combatant);
    const jitter = this._random() * SPEED_JITTER_MAX;
    return stats.moveSpeed + stats.attackSpeed * 10 + jitter;
  }

  private _startCurrentTurn(): void {
    const entry = this._turnOrder[this._turnIndex];
    if (!entry) return;
    const combatant = this._findCombatantForChampion(entry.champion);
    if (combatant && this._rules) {
      const resolution = this._rules.dispatch({
        type: 'turn_start',
        actor: this._toRuleActor(combatant),
        actors: this._getRuleActors(),
        turn: this._round,
      });
      this._resolveRuleEffects(resolution);
      if (this._checkVictory()) return;
    }
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
    return validateBattleAction({
      phase: this._phase,
      currentTurnEntry: this.currentTurnEntry,
      attacker,
      action,
      combatants: this._getTargetableCombatants(),
    });
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
    this._activeActionType = action.type;
    this._applyBeforeActionPassives(attacker, action);

    // ── Basic Attack: keep existing AD-only logic ──
    if (action.type === ActionType.BasicAttack) {
      const target = action.targets[0];
      this._performBasicAttack(attacker, target);
      this._applyAfterBasicAttackPassives(attacker, target);
      this._activeActionType = null;
      return;
    }

    // ── Spell Action: read spell definition and process effects ──
    const spellSlot = action.spellSlot;
    if (!spellSlot) {
      this._activeActionType = null;
      return;
    }
    const spell = attacker.champion.getSpell(spellSlot);
    if (!spell) {
      this._activeActionType = null;
      return;
    }

    // Validation has completed before either resource is mutated.
    if (
      !attacker.champion.useSpell(
        spellSlot,
        this._rules?.getCooldownMultiplier(attacker.champion.id, spellSlot === 'R') ?? 1,
      )
    ) {
      this._activeActionType = null;
      return;
    }
    attacker.currentMp = Math.max(0, attacker.currentMp - action.cost);
    this._rules?.dispatch({
      type: 'ability_cast',
      actor: this._toRuleActor(attacker),
      action: action.type,
    });

    // Use enhanced stats for spell damage calculation (getEnhancedStats always returns valid stats)
    const atkStats = this._getCombatStats(attacker);

    for (const effect of spell.effects) {
      this._applySpellEffect(effect, attacker, action.targets, atkStats, action.rankIndex);
    }
    this._applyAfterSpellPassives(attacker, action);
    this._activeActionType = null;
  }

  /** Resolve every published spell-effect family against validated targets. */
  private _applySpellEffect(
    effect: SpellEffect,
    attacker: CombatantState,
    targets: CombatantState[],
    attackerStats: ReturnType<ChampionInstance['getStats']>,
    rankIndex: number,
  ): void {
    new BattleSpellEffectResolver({
      rules: this._rules,
      applyDamageToTarget: this._applyDamageToTarget.bind(this),
      calculateEffectDamage: this._calculateEffectDamage.bind(this),
      applyHeal: this._applyHeal.bind(this),
      toRuleActor: this._toRuleActor.bind(this),
      syncEffectState: this._syncEffectState.bind(this),
      emit: this._emit.bind(this),
    }).resolve(effect, attacker, targets, attackerStats, rankIndex);
  }
  private _applyDamageToTarget(
    attacker: CombatantState,
    target: CombatantState,
    damage: number,
    triggerPassives = true,
    isCrit = false,
    triggerRules = true,
  ): void {
    if (damage <= 0 || target.isDefeated) return;
    const wasDefeated = target.isDefeated;
    const beforeRules =
      triggerRules && this._rules
        ? this._rules.dispatch({
            type: 'before_damage',
            source: this._toRuleActor(attacker),
            target: this._toRuleActor(target),
            amount: damage,
            action: this._activeActionType,
            isCrit,
            actors: this._getRuleActors(),
          })
        : null;
    const ruledDamage = Math.max(
      0,
      Math.round(
        damage * (beforeRules?.damageMultiplier ?? 1) * (1 - (beforeRules?.damageReduction ?? 0)),
      ),
    );
    if (ruledDamage <= 0) return;
    this._lastDamagedRound.set(target.targetId, this._round);
    const previousHp = target.currentHp;
    const {
      finalDamage: remaining,
      totalAbsorbed,
      absorbedBySource,
    } = target.effectManager.absorbWithShields(ruledDamage);
    this._syncEffectState(target);
    if (remaining > 0) {
      target.currentHp = Math.max(0, target.currentHp - remaining);
    }
    const hpDamage = previousHp - target.currentHp;
    const effectiveDamage = totalAbsorbed + hpDamage;
    const shieldAbsorbedBySource = Object.fromEntries(
      Object.entries(absorbedBySource).map(([sourceId, amount]) => [
        this._findCombatantByTargetId(sourceId)?.champion.id ?? sourceId,
        amount,
      ]),
    );
    this._emit({
      type: 'damage',
      source: attacker.champion.id,
      target: target.champion.id,
      amount: effectiveDamage,
      hpDamage,
      shieldDamage: totalAbsorbed,
      overkillDamage: Math.max(0, ruledDamage - effectiveDamage),
      sourceCombatantId: attacker.targetId,
      targetCombatantId: target.targetId,
      shieldAbsorbedBySource,
      isCrit,
      sourceSide: attacker.side,
      targetSide: target.side,
    });
    if (triggerPassives && remaining > 0) {
      this._applyOnDamagePassives(attacker, target);
    }
    const afterRules =
      triggerRules && remaining > 0 && this._rules
        ? this._rules.dispatch({
            type: 'damage_dealt',
            source: this._toRuleActor(attacker),
            target: this._toRuleActor(target),
            amount: remaining,
            action: this._activeActionType,
            isCrit,
            actors: this._getRuleActors(),
          })
        : null;
    if (target.currentHp <= 0 && !wasDefeated) {
      const defeatRules = this._rules
        ? this._rules.dispatch({
            type: 'before_defeat',
            source: this._toRuleActor(attacker),
            target: this._toRuleActor(target),
            actors: this._getRuleActors(),
          })
        : null;
      if ((defeatRules?.preventDefeatHp ?? 0) > 0) {
        target.currentHp = Math.min(target.maxHp, Math.round(defeatRules!.preventDefeatHp));
        this._emit({
          type: 'revive',
          source: target.champion.id,
          target: target.champion.id,
          amount: target.currentHp,
          sourceSide: target.side,
          targetSide: target.side,
        });
      } else {
        target.isDefeated = true;
        this._emit({
          type: 'defeat',
          champion: target.champion.id,
          combatantId: target.targetId,
          side: target.side,
          defeatedBy: attacker.champion.id,
        });
        this._applyOnKillPassives(attacker);
        if (this._rules) {
          this._resolveRuleEffects(
            this._rules.dispatch({
              type: 'kill',
              source: this._toRuleActor(attacker),
              target: this._toRuleActor(target),
              actors: this._getRuleActors(),
            }),
          );
        }
      }
    }
    if (afterRules) this._resolveRuleEffects(afterRules);
  }

  /** Basic attack: AD-only with crit, mitigated by armor. */
  private _performBasicAttack(attacker: CombatantState, target: CombatantState): void {
    const atkStats = this._getCombatStats(attacker);
    const defStats = this._getCombatStats(target);

    const baseRaw = atkStats.attackDamage;
    const critChance = Math.min(100, atkStats.crit) / 100;
    const isCrit = this._random() < critChance;
    const rawDmg = isCrit ? critDamage(baseRaw) : baseRaw;
    const finalDmg = calculateADDamage(rawDmg, 1.0, defStats.armor);

    this._applyDamageToTarget(attacker, target, finalDmg, true, isCrit);
  }

  private _getCombatStats(
    combatant: CombatantState,
  ): ReturnType<ChampionInstance['getEnhancedStats']> {
    const stats = { ...combatant.champion.getEnhancedStats() };
    const aliases: Partial<Record<StatKey, keyof typeof stats>> = {
      hp: 'hp',
      atk: 'attackDamage',
      attackDamage: 'attackDamage',
      def: 'armor',
      armor: 'armor',
      ap: 'abilityPower',
      spd: 'moveSpeed',
      moveSpeed: 'moveSpeed',
      magicResist: 'magicResist',
      attackSpeed: 'attackSpeed',
      crit: 'crit',
    };
    const grouped = new Map<keyof typeof stats, { flat: number; percent: number }>();
    for (const [stat, modifier] of combatant.effectManager.getStatModifiers()) {
      const key = aliases[stat];
      if (!key) continue;
      const entry = grouped.get(key) ?? { flat: 0, percent: 0 };
      entry.flat += modifier.flat;
      entry.percent += modifier.percent;
      grouped.set(key, entry);
    }
    for (const [key, modifier] of grouped) {
      const value = stats[key];
      if (typeof value === 'number') {
        (stats[key] as number) = Math.max(0, (value + modifier.flat) * (1 + modifier.percent));
      }
    }
    for (const modifier of this._rules?.getStatBonuses(combatant.champion.id) ?? []) {
      const key = aliases[modifier.stat];
      if (!key) continue;
      const value = stats[key];
      if (typeof value === 'number') {
        (stats[key] as number) = Math.max(0, (value + modifier.flat) * (1 + modifier.percent));
      }
    }

    if (
      combatant.champion.id === 'Soraka' &&
      isPassiveCombatReady(combatant.champion.id, combatant.champion.getPassive()) &&
      this.getAliveCombatants(combatant.side).some(
        (ally) => ally !== combatant && ally.currentHp / ally.maxHp < 0.4,
      )
    ) {
      stats.moveSpeed *= 1.7;
    }
    stats.moveSpeed *= combatant.effectManager.getSpeedMultiplier();
    return stats;
  }

  private _calculateEffectDamage(
    effect: SpellEffect,
    attackerStats: ReturnType<ChampionInstance['getEnhancedStats']>,
    target: CombatantState,
    rankIndex: number,
  ): number {
    const baseDamage =
      effect.baseDamage?.[rankIndex] ?? effect.baseDamage?.[effect.baseDamage.length - 1] ?? 0;
    const rawDamage =
      baseDamage +
      attackerStats.attackDamage * (effect.adRatio ?? 0) +
      attackerStats.abilityPower * (effect.apRatio ?? 0);
    const defense = this._getCombatStats(target);
    if (effect.damageType === 'magical' || effect.damageType === 'ap') {
      return calculateAPDamage(rawDamage, 1, defense.magicResist);
    }
    if (effect.damageType === 'true') return calculateTrueDamage(rawDamage);
    return calculateADDamage(rawDamage, 1, defense.armor);
  }

  private _applyHeal(source: CombatantState, target: CombatantState, amount: number): void {
    if (amount <= 0 || target.isDefeated) return;
    const healRules = this._rules?.dispatch({
      type: 'before_heal',
      source: this._toRuleActor(source),
      target: this._toRuleActor(target),
      amount,
    });
    const finalAmount = Math.round(amount * (healRules?.healMultiplier ?? 1));
    const previousHp = target.currentHp;
    target.currentHp = Math.min(target.maxHp, target.currentHp + finalAmount);
    const applied = target.currentHp - previousHp;
    this._emit({
      type: 'heal',
      source: source.champion.id,
      target: target.champion.id,
      amount: applied,
      overheal: Math.max(0, finalAmount - applied),
      sourceCombatantId: source.targetId,
      targetCombatantId: target.targetId,
      sourceSide: source.side,
      targetSide: target.side,
    });
  }

  private _syncEffectState(combatant: CombatantState): void {
    combatant.currentShield = combatant.effectManager.shields.reduce(
      (sum, shield) => sum + shield.remainingShield,
      0,
    );
    combatant.ccTurnsLeft = combatant.effectManager.ccEffects
      .filter((effect) => effect.isHardCC())
      .reduce((max, effect) => Math.max(max, effect.remainingRounds), 0);
  }

  private _tickTurnEffects(combatant: CombatantState, effectIds: readonly string[]): void {
    const results = combatant.effectManager.tickSelected(effectIds);
    for (const { effect, event } of results) {
      const source = this._findCombatantByTargetId(effect.sourceId) ?? combatant;
      const value = event.value ?? 0;
      if (effect instanceof DamageEffect && value > 0 && !combatant.isDefeated) {
        this._applyDamageToTarget(source, combatant, value, false);
      } else if (effect instanceof HealEffect && value > 0) {
        this._applyHeal(source, combatant, value);
      }
    }
    this._syncEffectState(combatant);
  }

  private _initializePassives(): void {
    for (const combatant of [...this._playerCombatants, ...this._enemyCombatants]) {
      if (
        combatant.isDefeated ||
        !isPassiveCombatReady(combatant.champion.id, combatant.champion.getPassive())
      ) {
        continue;
      }
      this._lastDamagedRound.set(combatant.targetId, Number.NEGATIVE_INFINITY);
      this._passiveCounters.set(combatant.targetId, 0);
      if (combatant.champion.id === 'Malphite') {
        this._applyMalphiteShield(combatant);
      }
    }
  }

  private _applyBeforeActionPassives(
    attacker: CombatantState,
    action: ValidatedBattleAction,
  ): void {
    if (
      attacker.champion.id !== 'Annie' ||
      action.type === ActionType.BasicAttack ||
      (this._passiveCounters.get(attacker.targetId) ?? 0) < 4 ||
      !action.targets.some((target) => target.side !== attacker.side && !target.isDefeated)
    ) {
      return;
    }
    const passiveEffect = attacker.champion
      .getPassive()
      .effects.find((effect) => effect.type === 'cc');
    if (passiveEffect) {
      this._applySpellEffect(
        passiveEffect,
        attacker,
        action.targets,
        this._getCombatStats(attacker),
        attacker.champion.level - 1,
      );
    }
    this._passiveCounters.set(attacker.targetId, -1);
  }

  private _applyAfterSpellPassives(attacker: CombatantState, action: ValidatedBattleAction): void {
    if (!isPassiveCombatReady(attacker.champion.id, attacker.champion.getPassive())) return;

    if (attacker.champion.id === 'Annie') {
      const counter = this._passiveCounters.get(attacker.targetId) ?? 0;
      this._passiveCounters.set(attacker.targetId, counter === -1 ? 0 : counter + 1);
    }

    const hostileTargets = action.targets.filter(
      (target) => target.side !== attacker.side && !target.isDefeated,
    );
    if (attacker.champion.id === 'Lux') {
      for (const target of hostileTargets) {
        const mark = this._passiveMarks.get(target.targetId) ?? {};
        mark.luxSourceId = attacker.targetId;
        mark.luxExpiresRound = this._round + 3;
        this._passiveMarks.set(target.targetId, mark);
      }
    }
    if (attacker.champion.id === 'Leona') {
      for (const target of hostileTargets) {
        const mark = this._passiveMarks.get(target.targetId) ?? {};
        mark.leonaSourceId = attacker.targetId;
        mark.leonaExpiresRound = this._round + 2;
        this._passiveMarks.set(target.targetId, mark);
      }
    }
  }

  private _applyAfterBasicAttackPassives(attacker: CombatantState, target: CombatantState): void {
    if (!isPassiveCombatReady(attacker.champion.id, attacker.champion.getPassive())) return;
    const passive = attacker.champion.getPassive();
    const rankIndex = attacker.champion.level - 1;

    if (attacker.champion.id === 'Ashe' && !target.isDefeated) {
      const slow = passive.effects.find((effect) => effect.type === 'cc');
      if (slow) {
        this._applySpellEffect(slow, attacker, [target], this._getCombatStats(attacker), rankIndex);
      }
    }

    if (attacker.champion.id === 'Warwick' && !target.isDefeated) {
      const damageEffect = passive.effects.find((effect) => effect.type === 'damage');
      if (damageEffect) {
        const amount = this._calculateEffectDamage(
          damageEffect,
          this._getCombatStats(attacker),
          target,
          rankIndex,
        );
        this._applyDamageToTarget(attacker, target, amount, false);
        if (attacker.currentHp / attacker.maxHp < 0.5) {
          this._applyHeal(
            attacker,
            attacker,
            amount * (attacker.currentHp / attacker.maxHp < 0.25 ? 3 : 1),
          );
        }
      }
    }

    const mark = this._passiveMarks.get(target.targetId);
    if (
      attacker.champion.id === 'Lux' &&
      mark?.luxSourceId === attacker.targetId &&
      (mark.luxExpiresRound ?? 0) >= this._round &&
      !target.isDefeated
    ) {
      const effect = passive.effects.find((candidate) => candidate.type === 'damage');
      if (effect) {
        this._applyDamageToTarget(
          attacker,
          target,
          this._calculateEffectDamage(effect, this._getCombatStats(attacker), target, rankIndex),
          false,
        );
      }
      delete mark.luxSourceId;
      delete mark.luxExpiresRound;
    }
  }

  private _applyOnDamagePassives(attacker: CombatantState, target: CombatantState): void {
    if (
      attacker.champion.id === 'Darius' &&
      isPassiveCombatReady(attacker.champion.id, attacker.champion.getPassive()) &&
      !target.isDefeated
    ) {
      const passiveDamage = attacker.champion
        .getPassive()
        .effects.find((effect) => effect.type === 'damage');
      const stackName = `${attacker.targetId}_hemorrhage`;
      const stacks = target.effectManager.dots.filter(
        (effect) => effect.name === stackName && effect.sourceId === attacker.targetId,
      ).length;
      if (passiveDamage && stacks < 5) {
        const totalDamage = this._calculateEffectDamage(
          passiveDamage,
          this._getCombatStats(attacker),
          target,
          attacker.champion.level - 1,
        );
        target.effectManager.apply(
          new DamageEffect({
            name: stackName,
            sourceId: attacker.targetId,
            targetId: target.targetId,
            magnitude: totalDamage,
            damageType: DamageType.True,
            duration: 5,
            canCrit: false,
          }),
        );
        if (stacks + 1 === 5) {
          const buff = attacker.champion
            .getPassive()
            .effects.find((effect) => effect.type === 'buff');
          const value = normalizePercent(buff?.values?.[attacker.champion.level - 1] ?? 0);
          if (buff && value > 0) {
            attacker.effectManager.apply(
              createBuff(
                `${attacker.targetId}_noxian_might`,
                attacker.targetId,
                attacker.targetId,
                'attackDamage',
                value,
                'percent',
                normalizeTurnDuration(buff.buffDuration, 5),
              ),
            );
          }
        }
      }
    }

    const mark = this._passiveMarks.get(target.targetId);
    if (
      mark?.leonaSourceId &&
      (mark.leonaExpiresRound ?? 0) >= this._round &&
      attacker.targetId !== mark.leonaSourceId
    ) {
      const leona = this._findCombatantByTargetId(mark.leonaSourceId);
      if (leona && leona.side === attacker.side) {
        const effect = leona.champion
          .getPassive()
          .effects.find((candidate) => candidate.type === 'damage');
        if (effect) {
          this._applyDamageToTarget(
            leona,
            target,
            this._calculateEffectDamage(
              effect,
              this._getCombatStats(leona),
              target,
              leona.champion.level - 1,
            ),
            false,
          );
        }
        delete mark.leonaSourceId;
        delete mark.leonaExpiresRound;
      }
    }
  }

  private _applyOnKillPassives(attacker: CombatantState): void {
    if (
      attacker.champion.id !== 'Jinx' ||
      !isPassiveCombatReady(attacker.champion.id, attacker.champion.getPassive())
    ) {
      return;
    }
    for (const effect of attacker.champion
      .getPassive()
      .effects.filter((candidate) => candidate.type === 'buff')) {
      const value = effect.values?.[attacker.champion.level - 1] ?? 0;
      const modifierType = effect.modifierType ?? 'flat';
      attacker.effectManager.apply(
        createBuff(
          `${attacker.targetId}_get_excited_${effect.stat}`,
          attacker.targetId,
          attacker.targetId,
          (effect.stat ?? 'moveSpeed') as StatKey,
          modifierType === 'percent' ? normalizePercent(value) : value,
          modifierType,
          normalizeTurnDuration(effect.buffDuration, 6),
        ),
      );
    }
  }

  private _applyTurnEndPassives(combatant: CombatantState): void {
    if (
      combatant.isDefeated ||
      !isPassiveCombatReady(combatant.champion.id, combatant.champion.getPassive())
    ) {
      return;
    }
    const roundsSinceDamage =
      this._round - (this._lastDamagedRound.get(combatant.targetId) ?? Number.NEGATIVE_INFINITY);
    if (combatant.champion.id === 'Garen' && roundsSinceDamage >= 2) {
      const heal = combatant.champion.getPassive().effects.find((effect) => effect.type === 'heal');
      const percent = normalizePercent(heal?.baseValue?.[combatant.champion.level - 1] ?? 0);
      this._applyHeal(combatant, combatant, combatant.maxHp * percent);
    }
    if (
      combatant.champion.id === 'Malphite' &&
      combatant.currentShield <= 0 &&
      roundsSinceDamage >= 2
    ) {
      this._applyMalphiteShield(combatant);
    }
  }

  private _applyMalphiteShield(combatant: CombatantState): void {
    const effect = combatant.champion
      .getPassive()
      .effects.find((candidate) => candidate.type === 'shield');
    const percent = normalizePercent(effect?.baseValue?.[combatant.champion.level - 1] ?? 10);
    const amount = Math.round(combatant.maxHp * percent);
    combatant.effectManager.apply(
      new ShieldEffect({
        name: `${combatant.targetId}_granite_shield`,
        sourceId: combatant.targetId,
        targetId: combatant.targetId,
        magnitude: amount,
        duration: 999,
      }),
    );
    this._syncEffectState(combatant);
  }

  private _findCombatantByTargetId(targetId: string): CombatantState | undefined {
    return [...this._playerCombatants, ...this._enemyCombatants].find(
      (combatant) => combatant.targetId === targetId,
    );
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
      this._rules?.dispatch({ type: 'battle_end', winner, actors: this._getRuleActors() });
      this._emit({ type: 'battle_end', winner, rounds: this._round });
      return true;
    }

    if (this._round >= this._maxRounds) {
      this._phase = BattlePhase.Finished;
      this._resetAllCooldowns();
      this._rules?.dispatch({ type: 'battle_end', winner: 'draw', actors: this._getRuleActors() });
      this._emit({ type: 'battle_end', winner: 'draw', rounds: this._round });
      return true;
    }
    return false;
  }

  private _dispatchTurnEnd(combatant: CombatantState): void {
    this._rules?.dispatch({ type: 'turn_end', actor: this._toRuleActor(combatant) });
  }

  private _toRuleActor(combatant: CombatantState): CombatRuleActor {
    return {
      id: combatant.champion.id,
      side: combatant.side,
      currentHp: combatant.currentHp,
      maxHp: combatant.maxHp,
      currentMp: combatant.currentMp,
      maxMp: combatant.maxMp,
      isDefeated: combatant.isDefeated,
      isBuffed: combatant.effectManager.buffDebuffs.some((effect) => !effect.isDebuff),
      isCCd: combatant.effectManager.ccEffects.length > 0,
    };
  }

  private _getRuleActors(): CombatRuleActor[] {
    return [...this._playerCombatants, ...this._enemyCombatants].map((combatant) =>
      this._toRuleActor(combatant),
    );
  }

  private _resolveRuleEffects(resolution: CombatRuleResolution): void {
    this._refreshRuleMaxHp();
    for (const effect of resolution.instantEffects) this._resolveRuleEffect(effect);
    this._refreshRuleMaxHp();
  }

  private _refreshRuleMaxHp(): void {
    if (!this._rules) return;
    for (const combatant of this._playerCombatants) {
      const nextMaxHp = Math.max(1, Math.round(this._getCombatStats(combatant).hp));
      const preserveCurrentHp = this._preserveHpOnRuleInitialization.delete(combatant.targetId);
      if (nextMaxHp === combatant.maxHp) continue;
      const delta = nextMaxHp - combatant.maxHp;
      combatant.maxHp = nextMaxHp;
      if (!preserveCurrentHp && !combatant.isDefeated && delta > 0) {
        combatant.currentHp += delta;
      }
      combatant.currentHp = Math.min(combatant.currentHp, combatant.maxHp);
    }
  }

  private _resolveRuleEffect(effect: CombatRuleInstantEffect): void {
    const source = this._findCombatantByChampionId(effect.sourceId);
    const target = this._findCombatantByChampionId(effect.targetId);
    if (!source || !target || effect.amount <= 0) return;
    if (effect.type === 'heal') {
      this._applyHeal(source, target, effect.amount);
    } else if (effect.type === 'damage') {
      this._applyDamageToTarget(source, target, effect.amount, false, false, false);
    } else if (effect.type === 'mana') {
      target.currentMp = Math.min(target.maxMp, target.currentMp + effect.amount);
    } else if (effect.type === 'shield' && !target.isDefeated) {
      target.effectManager.apply(
        new ShieldEffect({
          name: 'Rule shield',
          sourceId: source.targetId,
          targetId: target.targetId,
          magnitude: effect.amount,
          duration: 2,
        }),
      );
      this._syncEffectState(target);
      this._emit({
        type: 'shield',
        source: source.champion.id,
        target: target.champion.id,
        amount: effect.amount,
        countsAsShield: true,
        sourceCombatantId: source.targetId,
        targetCombatantId: target.targetId,
        sourceSide: source.side,
        targetSide: target.side,
      });
    } else if (effect.type === 'dot' && !target.isDefeated) {
      target.effectManager.apply(
        new DamageEffect({
          name: 'Rule damage over time',
          sourceId: source.targetId,
          targetId: target.targetId,
          magnitude: effect.amount,
          damageType: DamageType.True,
          duration: Math.max(1, Math.round(effect.duration ?? 1)),
          canCrit: false,
        }),
      );
    } else if ((effect.type === 'slow' || effect.type === 'snare') && !target.isDefeated) {
      target.effectManager.apply(
        new CCEffect({
          name: `Rule ${effect.type}`,
          sourceId: source.targetId,
          targetId: target.targetId,
          ccType: effect.type === 'slow' ? CCType.Slow : CCType.Snare,
          duration: Math.max(1, Math.round(effect.duration ?? 1)),
          slowAmount: effect.type === 'slow' ? effect.amount : undefined,
        }),
      );
      this._syncEffectState(target);
    }
  }

  private _findCombatantByChampionId(championId: string): CombatantState | undefined {
    return [...this._playerCombatants, ...this._enemyCombatants].find(
      (combatant) => combatant.champion.id === championId,
    );
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

function getUniqueTargetId(champions: readonly ChampionInstance[], index: number): string {
  const championId = champions[index].id;
  if (champions.filter((champion) => champion.id === championId).length === 1) return championId;
  const occurrence = champions
    .slice(0, index + 1)
    .filter((champion) => champion.id === championId).length;
  return `${championId}#${occurrence}`;
}
