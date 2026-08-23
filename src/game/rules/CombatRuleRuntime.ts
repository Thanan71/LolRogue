import { AUGMENT_DATABASE, ITEM_DATABASE, RUNE_DATABASE } from '@/data/items';
import { ActionType } from '@/game/battle/types';
import { DamageType, type StatKey } from '@/game/effects/types';
import { type RuneContext, type RuneEvaluationEvent, RuneManager } from '@/game/runes/RuneManager';
import { AugmentEffectType, ItemCategory } from '@/types/inventory';
import { SUPPORTED_ENHANCEMENT_EFFECTS } from './catalogSupport';
import type {
  CombatRuleActor,
  CombatRuleEvent,
  CombatRuleInstantEffect,
  CombatRuleLoadout,
  CombatRuleResolution,
  CombatRuleStatBonus,
} from './types';

export {
  OFFICIALLY_SUPPORTED_RULE_TRIGGERS,
  UNAVAILABLE_ENHANCEMENT_EFFECTS,
} from './catalogSupport';

interface RuneMetrics {
  damageDealt: number;
  damageTaken: number;
  damageEventsDealt: number;
  damageEventsTaken: number;
  kills: number;
  abilitiesCast: number;
  turn: number;
  lastCrit: boolean;
}

function emptyResolution(): CombatRuleResolution {
  return {
    damageMultiplier: 1,
    damageReduction: 0,
    healMultiplier: 1,
    shieldMultiplier: 1,
    preventDefeatHp: 0,
    instantEffects: [],
    consumedItemInstanceIds: [],
  };
}

function defaultMetrics(): RuneMetrics {
  return {
    damageDealt: 0,
    damageTaken: 0,
    damageEventsDealt: 0,
    damageEventsTaken: 0,
    kills: 0,
    abilitiesCast: 0,
    turn: 0,
    lastCrit: false,
  };
}

function mergeBonus(
  result: Map<StatKey, { flat: number; percent: number }>,
  stat: StatKey,
  flat: number,
  percent: number,
): void {
  const current = result.get(stat) ?? { flat: 0, percent: 0 };
  current.flat += flat;
  current.percent += percent;
  result.set(stat, current);
}

/**
 * Typed, deterministic rule bus shared by runes, augments, items and enhancement effects.
 * It owns combat-local stacks, durations, cooldown usage and consumable state.
 */
export class CombatRuleRuntime {
  private readonly runeManagers = new Map<string, RuneManager>();
  private readonly runeMetrics = new Map<string, RuneMetrics>();
  private readonly consumedItems = new Set<string>();
  private readonly potionTurns = new Map<string, number>();
  private readonly usedRevives = new Set<string>();
  private readonly usedEnhancementCooldowns = new Set<string>();
  private readonly temporaryStats = new Map<
    string,
    Map<StatKey, { flat: number; percent: number; turns: number }>
  >();
  private readonly pendingRuneDamage = new Map<string, number>();
  private readonly damageTaken = new Map<string, number>();

  constructor(
    private readonly loadout: CombatRuleLoadout,
    private readonly random: () => number = Math.random,
  ) {}

  reset(): void {
    this.runeManagers.clear();
    this.runeMetrics.clear();
    this.consumedItems.clear();
    this.potionTurns.clear();
    this.usedRevives.clear();
    this.usedEnhancementCooldowns.clear();
    this.temporaryStats.clear();
    this.pendingRuneDamage.clear();
    this.damageTaken.clear();
  }

  get consumedItemInstanceIds(): string[] {
    return [...this.consumedItems];
  }

  getRuneStacks(): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    for (const [championId, manager] of this.runeManagers) {
      for (const equipped of manager.runes) {
        if (equipped.rune.bonus.duration !== 0) continue;
        const value = equipped.rune.bonus.stacks
          ? equipped.currentStacks
          : equipped.isActive
            ? 1
            : 0;
        if (value <= 0) continue;
        result[championId] ??= {};
        result[championId][equipped.rune.id] = value;
      }
    }
    return result;
  }

  getCooldownMultiplier(championId: string, isUltimate: boolean): number {
    const stats = this.loadout.enhancementStats[championId];
    const haste = (stats?.flat.abilityHaste ?? 0) + (stats?.percent.abilityHaste ?? 0) * 100;
    const ultimateReduction = isUltimate
      ? this.getEnhancements(championId)
          .filter((effect) => effect.type === 'cdr_ultimate')
          .reduce((sum, effect) => sum + (effect.value ?? 0), 0)
      : 0;
    return Math.max(0.1, (100 / (100 + Math.max(0, haste))) * (1 - ultimateReduction));
  }

  getControlDurationMultiplier(championId: string): number {
    const tenacity = this.loadout.enhancementStats[championId]?.flat.tenacity ?? 0;
    return Math.max(0.2, 1 - Math.max(0, tenacity) / 100);
  }

  getAppliedControlDurationMultiplier(championId: string): number {
    const extension = this.getEnhancements(championId)
      .filter((effect) => effect.type === 'cc_extension')
      .reduce((sum, effect) => sum + (effect.value ?? 0), 0);
    return 1 + extension;
  }

  getStatBonuses(championId: string): CombatRuleStatBonus[] {
    const result = new Map<StatKey, { flat: number; percent: number }>();
    const runeBonuses: Record<StatKey, { flat: number; percent: number }> =
      this.runeManagers.get(championId)?.getActiveStatBonuses() ??
      ({} as Record<StatKey, { flat: number; percent: number }>);
    for (const [stat, bonus] of Object.entries(runeBonuses)) {
      mergeBonus(result, stat as StatKey, bonus.flat, bonus.percent);
    }
    for (const bonus of this.temporaryStats.get(championId)?.entries() ?? []) {
      mergeBonus(result, bonus[0], bonus[1].flat, bonus[1].percent);
    }
    return [...result].map(([stat, value]) => ({ stat, ...value }));
  }

  dispatch(event: CombatRuleEvent): CombatRuleResolution {
    const resolution = emptyResolution();
    switch (event.type) {
      case 'battle_start':
        this.onBattleStart(event.actors, resolution);
        break;
      case 'turn_start':
        this.onTurnStart(event.actor, event.actors, event.turn, resolution);
        break;
      case 'turn_end':
        this.onTurnEnd(event.actor);
        break;
      case 'ability_cast':
        this.onAbilityCast(event.actor);
        break;
      case 'before_damage':
        this.beforeDamage(event, resolution);
        break;
      case 'damage_dealt':
        this.afterDamage(event, resolution);
        break;
      case 'kill':
        this.onKill(event.source, event.actors, resolution);
        break;
      case 'before_heal':
        resolution.healMultiplier = this.getHealMultiplier(event.source.id, event.target.id);
        break;
      case 'before_shield':
        resolution.shieldMultiplier = this.getShieldMultiplier(event.source.id, event.target.id);
        break;
      case 'before_defeat':
        this.beforeDefeat(event.target, resolution);
        break;
      case 'battle_end':
        break;
    }
    resolution.consumedItemInstanceIds = this.consumedItemInstanceIds;
    return resolution;
  }

  private onBattleStart(actors: CombatRuleActor[], resolution: CombatRuleResolution): void {
    for (const actor of actors.filter((candidate) => candidate.side === 'player')) {
      const assignedRuneIds = this.loadout.runeAssignments[actor.id] ?? [];
      const manager = new RuneManager(assignedRuneIds.length);
      for (const runeId of assignedRuneIds) {
        const rune = RUNE_DATABASE[runeId];
        if (rune) manager.equipRune(rune);
      }
      for (const equipped of manager.runes) {
        const saved = this.loadout.runeStacks?.[actor.id]?.[equipped.rune.id] ?? 0;
        if (saved <= 0 || equipped.rune.bonus.duration !== 0) continue;
        equipped.currentStacks = equipped.rune.bonus.stacks
          ? Math.min(saved, equipped.rune.bonus.maxStacks)
          : 0;
        equipped.isActive = true;
      }
      this.runeManagers.set(actor.id, manager);
      this.runeMetrics.set(actor.id, defaultMetrics());
      this.evaluateRunes(actor, actors, 'battle_start');

      for (const entry of this.getItems(actor.id)) {
        const definition = ITEM_DATABASE[entry.item.id];
        if (definition?.category !== ItemCategory.Consumable) continue;
        this.consumedItems.add(entry.instanceId);
        if (definition.id === 'health_potion') this.potionTurns.set(actor.id, 3);
        if (definition.id === 'elixir_of_wrath') {
          this.setTemporaryStat(actor.id, 'atk', 30, 0, Number.POSITIVE_INFINITY);
        }
      }
    }
    resolution.consumedItemInstanceIds = this.consumedItemInstanceIds;
  }

  private onTurnStart(
    actor: CombatRuleActor,
    actors: CombatRuleActor[],
    turn: number,
    resolution: CombatRuleResolution,
  ): void {
    if (actor.side !== 'player') return;
    const metrics = this.getMetrics(actor.id);
    metrics.turn = turn;
    this.evaluateRunes(actor, actors, 'turn_start');

    const potionTurns = this.potionTurns.get(actor.id) ?? 0;
    if (potionTurns > 0) {
      resolution.instantEffects.push(this.effect('heal', actor.id, actor.id, 50));
      this.potionTurns.set(actor.id, potionTurns - 1);
    }
    for (const entry of this.getItems(actor.id)) {
      if (entry.item.id !== 'sunfire_aegis') continue;
      for (const enemy of actors.filter(
        (candidate) => candidate.side !== actor.side && !candidate.isDefeated,
      )) {
        resolution.instantEffects.push(this.effect('damage', actor.id, enemy.id, 15));
      }
    }

    const regen = this.loadout.enhancementStats[actor.id]?.flat.hpRegen ?? 0;
    if (regen > 0) {
      resolution.instantEffects.push(this.effect('heal', actor.id, actor.id, regen));
    }
    const manaRegen = this.loadout.enhancementStats[actor.id]?.flat.mpRegen ?? 0;
    if (manaRegen > 0) {
      resolution.instantEffects.push(this.effect('mana', actor.id, actor.id, manaRegen));
    }
  }

  private onTurnEnd(actor: CombatRuleActor): void {
    if (actor.side !== 'player') return;
    this.runeManagers.get(actor.id)?.tickTurn();
    const stats = this.temporaryStats.get(actor.id);
    if (!stats) return;
    for (const [stat, bonus] of stats) {
      if (Number.isFinite(bonus.turns)) bonus.turns--;
      if (bonus.turns <= 0) stats.delete(stat);
    }
  }

  private onAbilityCast(actor: CombatRuleActor): void {
    if (actor.side !== 'player') return;
    const metrics = this.getMetrics(actor.id);
    metrics.abilitiesCast++;
    const manager = this.runeManagers.get(actor.id);
    const electrocute = manager?.runes.find((entry) => entry.rune.id === 'electrocute');
    const wasActive = electrocute?.isActive ?? false;
    this.evaluateRunes(actor, [actor], 'ability_cast');
    const electrocuteThreshold = Math.max(
      1,
      Math.floor(electrocute?.rune.condition.threshold ?? 1),
    );
    // Electrocute is armed once per battle, by the threshold-crossing cast.
    // The damage produced by that cast is the first hit eligible to consume it.
    if (metrics.abilitiesCast === electrocuteThreshold && !wasActive && electrocute?.isActive) {
      this.pendingRuneDamage.set(actor.id, electrocute.rune.bonus.triggeredEffect?.value ?? 0);
    }
  }

  private beforeDamage(
    event: Extract<CombatRuleEvent, { type: 'before_damage' }>,
    resolution: CombatRuleResolution,
  ): void {
    if (event.source.side === 'player') {
      resolution.damageMultiplier *= this.getAugmentDamageMultiplier();
      const penetration =
        event.damageType === DamageType.AD
          ? (this.loadout.enhancementStats[event.source.id]?.flat.armorPen ?? 0)
          : event.damageType === DamageType.AP
            ? (this.loadout.enhancementStats[event.source.id]?.flat.magicPen ?? 0)
            : 0;
      resolution.damageMultiplier *= 1 + Math.max(0, penetration) / 200;
      if (
        event.isCrit &&
        this.getItems(event.source.id).some((entry) => entry.item.id === 'infinity_edge')
      ) {
        resolution.damageMultiplier *= 1.35;
      }
      for (const effect of this.getEnhancements(event.source.id)) {
        if (effect.type === 'execute_damage' && event.target.currentHp / event.target.maxHp < 0.4) {
          resolution.damageMultiplier *= 1 + (effect.value ?? 0);
        } else if (effect.type === 'burst_amplify' && event.action === ActionType.SpellR) {
          resolution.damageMultiplier *= 1 + (effect.value ?? 0);
        } else if (effect.type === 'champion_damage') {
          resolution.damageMultiplier *= 1 + (effect.value ?? 0);
        } else if (
          effect.type === 'duelist' &&
          event.actors.filter((actor) => actor.side === event.source.side && !actor.isDefeated)
            .length === 1 &&
          event.actors.filter((actor) => actor.side !== event.source.side && !actor.isDefeated)
            .length === 1
        ) {
          resolution.damageMultiplier *= 1 + (effect.value ?? 0);
        } else if (
          effect.type === 'berserker' &&
          event.source.currentHp / event.source.maxHp < 0.5
        ) {
          resolution.damageMultiplier *= 1 + (effect.value ?? 0);
        }
      }
      resolution.damageMultiplier *=
        1 + this.getAllTeamEnhancements(event.source.side, 'damage_aura');
    }
    if (event.target.side === 'player') {
      resolution.damageReduction += this.getAugmentDamageReduction();
      for (const effect of this.getEnhancements(event.target.id)) {
        if (
          effect.type === 'duelist' &&
          event.actors.filter((actor) => actor.side === event.target.side && !actor.isDefeated)
            .length === 1 &&
          event.actors.filter((actor) => actor.side !== event.target.side && !actor.isDefeated)
            .length === 1
        ) {
          resolution.damageReduction += 0.15;
        }
        if (effect.type === 'dodge' && event.action === ActionType.BasicAttack) {
          if (this.random() < (effect.value ?? 0)) resolution.damageReduction = 1;
        }
      }
      const survivalShield = this.getEnhancements(event.target.id).find(
        (effect) => effect.type === 'survival_shield',
      );
      const shieldKey = `${event.target.id}:survival_shield`;
      if (
        survivalShield &&
        !this.usedEnhancementCooldowns.has(shieldKey) &&
        event.target.currentHp > 0 &&
        event.target.currentHp / event.target.maxHp < 0.2
      ) {
        this.usedEnhancementCooldowns.add(shieldKey);
        resolution.instantEffects.push(
          this.effect('shield', event.target.id, event.target.id, survivalShield.value ?? 0),
        );
      }
      const allyReduction = this.getAllTeamEnhancements(event.target.side, 'ally_damage_reduction');
      resolution.damageReduction += allyReduction;
    }
    resolution.damageReduction = Math.min(1, resolution.damageReduction);
  }

  private afterDamage(
    event: Extract<CombatRuleEvent, { type: 'damage_dealt' }>,
    resolution: CombatRuleResolution,
  ): void {
    if (event.source.side === 'player') {
      const metrics = this.getMetrics(event.source.id);
      metrics.damageDealt += event.amount;
      metrics.damageEventsDealt++;
      metrics.lastCrit = event.isCrit;
      this.evaluateRuneEvents(
        event.source,
        event.actors,
        event.isCrit ? ['crit', 'damage_dealt'] : ['damage_dealt'],
      );

      const lifesteal = this.getItems(event.source.id).some(
        (entry) => entry.item.id === 'bloodthirster',
      )
        ? 0.18
        : 0;
      const enhancedLifesteal =
        ((this.loadout.enhancementStats[event.source.id]?.flat.lifesteal ?? 0) +
          (this.loadout.enhancementStats[event.source.id]?.flat.omnivamp ?? 0)) /
        100;
      if (lifesteal + enhancedLifesteal > 0) {
        resolution.instantEffects.push(
          this.effect(
            'heal',
            event.source.id,
            event.source.id,
            event.amount * (lifesteal + enhancedLifesteal),
          ),
        );
      }
      const pendingDamage = this.pendingRuneDamage.get(event.source.id) ?? 0;
      if (pendingDamage > 0) {
        this.pendingRuneDamage.delete(event.source.id);
        resolution.instantEffects.push(
          this.effect('damage', event.source.id, event.target.id, pendingDamage),
        );
      }
      if (event.action === ActionType.BasicAttack) {
        for (const effect of this.getEnhancements(event.source.id)) {
          if (effect.type === 'bleed') {
            resolution.instantEffects.push({
              ...this.effect(
                'dot',
                event.source.id,
                event.target.id,
                event.target.maxHp * (effect.value ?? 0),
              ),
              duration: Math.max(1, Math.round(effect.duration ?? 1)),
            });
          }
        }
      } else if (event.action) {
        for (const effect of this.getEnhancements(event.source.id)) {
          if (effect.type === 'slow') {
            resolution.instantEffects.push({
              type: 'slow',
              sourceId: event.source.id,
              targetId: event.target.id,
              amount: effect.value ?? 0,
              duration: effect.duration,
            });
          } else if (effect.type === 'root_chance' && this.random() < (effect.value ?? 0)) {
            resolution.instantEffects.push({
              ...this.effect('snare', event.source.id, event.target.id, 1),
              duration: effect.duration,
            });
          }
        }
      }
    }

    if (event.target.side === 'player') {
      const metrics = this.getMetrics(event.target.id);
      metrics.damageTaken += event.amount;
      metrics.damageEventsTaken++;
      this.damageTaken.set(
        event.target.id,
        (this.damageTaken.get(event.target.id) ?? 0) + event.amount,
      );
      this.evaluateRunes(event.target, event.actors, 'damage_taken');
      for (const effect of this.getEnhancements(event.target.id)) {
        if (effect.type === 'thornmail') {
          resolution.instantEffects.push(
            this.effect(
              'damage',
              event.target.id,
              event.source.id,
              event.amount * (effect.value ?? 0),
            ),
          );
        } else if (effect.type === 'burn_reflect' && event.action === ActionType.BasicAttack) {
          resolution.instantEffects.push(
            this.effect(
              'damage',
              event.target.id,
              event.source.id,
              event.source.maxHp * (effect.value ?? 0),
            ),
          );
        } else if (
          effect.type === 'vengeance_burst' &&
          (this.damageTaken.get(event.target.id) ?? 0) >= 500 &&
          !this.usedEnhancementCooldowns.has(`${event.target.id}:${effect.type}`)
        ) {
          this.usedEnhancementCooldowns.add(`${event.target.id}:${effect.type}`);
          for (const enemy of event.actors.filter(
            (candidate) => candidate.side !== event.target.side && !candidate.isDefeated,
          )) {
            resolution.instantEffects.push(
              this.effect('damage', event.target.id, enemy.id, effect.value ?? 0),
            );
          }
        }
      }
    }
  }

  private onKill(
    source: CombatRuleActor,
    actors: CombatRuleActor[],
    resolution: CombatRuleResolution,
  ): void {
    if (source.side !== 'player') return;
    const metrics = this.getMetrics(source.id);
    metrics.kills++;
    this.evaluateRunes(source, actors, 'kill');
    if (this.hasRune(source.id, 'triumph')) {
      resolution.instantEffects.push(
        this.effect('heal', source.id, source.id, source.maxHp * 0.12),
      );
    }
    for (const effect of this.getEnhancements(source.id)) {
      if (effect.type === 'heal_on_kill') {
        resolution.instantEffects.push(
          this.effect('heal', source.id, source.id, source.maxHp * (effect.value ?? 0)),
        );
      } else if (effect.type === 'mana_restore') {
        resolution.instantEffects.push(
          this.effect('mana', source.id, source.id, effect.value ?? 0),
        );
      } else if (effect.type === 'attack_speed_on_kill') {
        this.setTemporaryStat(
          source.id,
          'attackSpeed',
          0,
          effect.value ?? 0,
          Math.max(1, Math.round(effect.duration ?? 1)),
        );
      }
    }
  }

  private beforeDefeat(actor: CombatRuleActor, resolution: CombatRuleResolution): void {
    if (actor.side !== 'player') return;
    if (this.hasRune(actor.id, 'e2e_assured_victory')) {
      resolution.preventDefeatHp = actor.maxHp;
      return;
    }
    if (
      this.loadout.augmentIds.includes('phoenix_heart') &&
      !this.usedRevives.has('augment:phoenix_heart')
    ) {
      this.usedRevives.add('augment:phoenix_heart');
      resolution.preventDefeatHp = actor.maxHp * 0.5;
      return;
    }
    const ga = this.getItems(actor.id).find((entry) => entry.item.id === 'guardian_angel');
    if (ga && !this.usedRevives.has(ga.instanceId)) {
      this.usedRevives.add(ga.instanceId);
      resolution.preventDefeatHp = actor.maxHp * 0.3;
      return;
    }
    for (const effect of this.getEnhancements(actor.id)) {
      const key = `${actor.id}:${effect.type}`;
      if (effect.type === 'revive' && !this.usedEnhancementCooldowns.has(key)) {
        this.usedEnhancementCooldowns.add(key);
        resolution.preventDefeatHp = 1;
        return;
      }
    }
  }

  private evaluateRunes(
    actor: CombatRuleActor,
    actors: CombatRuleActor[],
    event: RuneEvaluationEvent,
  ): void {
    this.evaluateRuneEvents(actor, actors, [event]);
  }

  private hasRune(championId: string, runeId: string): boolean {
    return (
      this.runeManagers.get(championId)?.runes.some((equipped) => equipped.rune.id === runeId) ??
      false
    );
  }

  private evaluateRuneEvents(
    actor: CombatRuleActor,
    actors: CombatRuleActor[],
    events: readonly RuneEvaluationEvent[],
  ): void {
    const manager = this.runeManagers.get(actor.id);
    if (!manager) return;
    const context = this.getRuneContext(actor, actors);
    for (const event of events) manager.evaluateConditions(context, event);
    if (!events.includes('state_change')) manager.evaluateConditions(context, 'state_change');
  }

  private getRuneContext(actor: CombatRuleActor, actors: CombatRuleActor[]): RuneContext {
    const metrics = this.getMetrics(actor.id);
    const allies = actors.filter((candidate) => candidate.side === actor.side);
    return {
      currentHp: actor.currentHp,
      maxHp: actor.maxHp,
      turnNumber: Math.max(1, metrics.turn),
      totalDamageDealt: metrics.damageDealt,
      totalDamageTaken: metrics.damageTaken,
      damageEventsDealt: metrics.damageEventsDealt,
      damageEventsTaken: metrics.damageEventsTaken,
      killsThisBattle: metrics.kills,
      abilitiesCastThisBattle: metrics.abilitiesCast,
      isBuffed: actor.isBuffed,
      isCCd: actor.isCCd,
      alliesAlive: allies.filter((candidate) => !candidate.isDefeated).length,
      totalAllies: allies.length,
      lastActionWasCrit: metrics.lastCrit,
    };
  }

  private getMetrics(id: string): RuneMetrics {
    const current = this.runeMetrics.get(id) ?? defaultMetrics();
    this.runeMetrics.set(id, current);
    return current;
  }

  private getItems(championId: string) {
    return this.loadout.inventory.filter(
      (entry) => entry.equippedToChampionId === championId && ITEM_DATABASE[entry.item.id],
    );
  }

  private getEnhancements(championId: string) {
    return (this.loadout.enhancementEffects[championId] ?? []).filter((effect) =>
      SUPPORTED_ENHANCEMENT_EFFECTS.has(effect.type),
    );
  }

  private getAllTeamEnhancements(side: 'player' | 'enemy', type: string): number {
    if (side !== 'player') return 0;
    return Object.values(this.loadout.enhancementEffects)
      .flat()
      .filter((effect) => effect.type === type)
      .reduce((sum, effect) => sum + (effect.value ?? 0), 0);
  }

  private getAugmentDamageMultiplier(): number {
    return this.loadout.augmentIds.reduce((multiplier, id) => {
      const augment = AUGMENT_DATABASE[id];
      return (
        multiplier +
        (augment?.effects
          .filter((effect) => effect.type === AugmentEffectType.DamagePercent)
          .reduce((sum, effect) => sum + (effect.percentValue ?? 0), 0) ?? 0)
      );
    }, 1);
  }

  private getAugmentDamageReduction(): number {
    return Math.min(
      0.8,
      this.loadout.augmentIds.reduce((reduction, id) => {
        const augment = AUGMENT_DATABASE[id];
        return (
          reduction +
          (augment?.effects
            .filter((effect) => effect.type === AugmentEffectType.DamageReduction)
            .reduce((sum, effect) => sum + (effect.percentValue ?? 0), 0) ?? 0)
        );
      }, 0),
    );
  }

  private getHealMultiplier(sourceId: string, targetId: string): number {
    let multiplier = 1;
    if (this.getItems(targetId).some((entry) => entry.item.id === 'spirit_visage')) {
      multiplier += 0.25;
    }
    for (const effect of this.getEnhancements(sourceId)) {
      if (effect.type === 'heal_amp') multiplier += effect.value ?? 0;
    }
    return multiplier;
  }

  private getShieldMultiplier(sourceId: string, targetId: string): number {
    let multiplier = 1;
    if (this.getItems(targetId).some((entry) => entry.item.id === 'spirit_visage')) {
      multiplier += 0.25;
    }
    for (const effect of this.getEnhancements(sourceId)) {
      if (effect.type === 'shield_amp') multiplier += effect.value ?? 0;
    }
    return multiplier;
  }

  private setTemporaryStat(
    id: string,
    stat: StatKey,
    flat: number,
    percent: number,
    turns: number,
  ): void {
    const stats = this.temporaryStats.get(id) ?? new Map();
    stats.set(stat, { flat, percent, turns });
    this.temporaryStats.set(id, stats);
  }

  private effect(
    type: CombatRuleInstantEffect['type'],
    sourceId: string,
    targetId: string,
    amount: number,
  ): CombatRuleInstantEffect {
    return { type, sourceId, targetId, amount: Math.max(0, Math.round(amount)) };
  }
}
