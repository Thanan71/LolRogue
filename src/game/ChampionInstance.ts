/**
 * ChampionInstance — runtime wrapper around a Champion definition.
 *
 * Tracks the current level, exposes spells keyed by slot (Q/W/E/R),
 * and computes level-scaled stats using the LoL growth formula.
 * Also supports enhancement bonuses from the enhancement tree system.
 */

import { localizeChampion } from '@/i18n/content';
import type { Champion, ChampionStats, ChampionTag, Passive, Spell } from '@/types';
import type { EnhancementStatBonuses } from '@/types/enhancementTree';
import { type CalculatedStats, calculateStats } from '@/utils/champion';
import {
  applyMasteryBonus,
  applyEnhancementBonuses as applySharedEnhancementBonuses,
} from '@/utils/statCalculator';

/** Valid spell slots matching LoL key bindings. */
export type SpellSlot = 'Q' | 'W' | 'E' | 'R';

/** Ordered list of spell slots for iteration. */
export const SPELL_SLOTS: readonly SpellSlot[] = ['Q', 'W', 'E', 'R'] as const;

/** Map of spell slot → Spell definition (or undefined if not enough spells). */
export type SpellMap = Partial<Record<SpellSlot, Spell>>;

export class ChampionInstance {
  // ── Immutable base data ──────────────────────────────────────────────────
  readonly id: string;
  readonly key: string;
  readonly name: string;
  readonly title: string;
  readonly tags: ChampionTag[];
  readonly resourceType: string;
  readonly baseStats: ChampionStats;
  readonly passive: Passive;
  readonly iconUrl: string;

  // ── Mutable state ────────────────────────────────────────────────────────
  private _level: number;
  private readonly _spells: SpellMap;
  /** Remaining cooldown turns per spell slot (0 = ready). */
  private readonly _cooldowns: Record<SpellSlot, number>;
  private readonly _spellRanks: Record<SpellSlot, number>;
  /** Enhancement bonuses from the enhancement tree system */
  private _enhancementBonuses: EnhancementStatBonuses | null = null;
  private readonly _statMultiplier: number;
  private _masteryLevel = 0;

  constructor(champion: Champion, startingLevel = 1, statMultiplier = 1) {
    champion = localizeChampion(champion);
    this.id = champion.id;
    this.key = champion.key;
    this.name = champion.name;
    this.title = champion.title;
    this.tags = [...champion.tags] as ChampionTag[];
    this.resourceType = champion.resourceType;
    this.baseStats = { ...champion.stats };
    this.passive = { ...champion.passive };
    this.iconUrl = champion.iconUrl;

    this._level = clampLevel(startingLevel);
    this._statMultiplier = Math.max(0.1, statMultiplier);

    // Map the spells array [Q, W, E, R] to the slot keys.
    // Data Dragon always provides 4 spells in order: Q, W, E, R.
    this._spells = {};
    for (let i = 0; i < SPELL_SLOTS.length && i < champion.spells.length; i++) {
      this._spells[SPELL_SLOTS[i]] = { ...champion.spells[i] };
    }

    // Initialize all cooldowns to 0 (ready)
    this._cooldowns = { Q: 0, W: 0, E: 0, R: 0 };
    this._spellRanks = { Q: 1, W: 1, E: 1, R: 1 };
  }

  // ── Level ────────────────────────────────────────────────────────────────

  /** Current champion level (1–18). */
  get level(): number {
    return this._level;
  }

  /** Whether the champion can still level up (hasn't reached 18). */
  get canLevelUp(): boolean {
    return this._level < 18;
  }

  /**
   * Increment the champion's level by 1.
   * @returns The new level (or current level if already at 18).
   */
  levelUp(): number {
    if (this._level < 18) {
      this._level += 1;
    }
    return this._level;
  }

  /**
   * Set the level directly (for dev tools / special effects).
   * @param level — desired level (1–18), clamped automatically.
   */
  setLevel(level: number): void {
    this._level = clampLevel(level);
  }

  // ── Stats ────────────────────────────────────────────────────────────────

  /** Compute stats scaled to the current level. */
  getStats(): CalculatedStats {
    return applyMasteryBonus(
      ChampionInstance.applyStatMultiplier(
        calculateStats(this.baseStats, this._level),
        this._statMultiplier,
      ),
      this._masteryLevel,
    );
  }

  /** Compute stats at an arbitrary level without changing current level. */
  getStatsAtLevel(level: number): CalculatedStats {
    return applyMasteryBonus(
      ChampionInstance.applyStatMultiplier(
        calculateStats(this.baseStats, clampLevel(level)),
        this._statMultiplier,
      ),
      this._masteryLevel,
    );
  }

  /** Freeze the permanent mastery level used by this combat instance. */
  setMasteryLevel(level: number): void {
    this._masteryLevel = Math.max(0, Math.min(4, Math.floor(level)));
  }

  /**
   * Compute stats with enhancement bonuses applied.
   * Uses the shared _applyEnhancementBonuses method to apply bonuses to base stats.
   * @param bonuses - Enhancement stat bonuses to apply.
   * @returns Stats with both level scaling and enhancement bonuses.
   */
  getStatsWithEnhancements(bonuses: EnhancementStatBonuses): CalculatedStats {
    const baseStats = this.getStats();
    return ChampionInstance.applyEnhancementBonuses(baseStats, bonuses);
  }

  /**
   * Set enhancement bonuses for this champion instance.
   * @param bonuses - Enhancement stat bonuses from the enhancement tree.
   */
  setEnhancementBonuses(bonuses: EnhancementStatBonuses): void {
    this._enhancementBonuses = bonuses;
  }

  /**
   * Get stats with currently set enhancement bonuses.
   * @returns Stats with enhancements applied, or base stats if none set.
   */
  getEnhancedStats(): CalculatedStats {
    if (!this._enhancementBonuses) {
      return this.getStats();
    }
    return this.getStatsWithEnhancements(this._enhancementBonuses);
  }

  /**
   * Clear enhancement bonuses.
   */
  clearEnhancementBonuses(): void {
    this._enhancementBonuses = null;
  }

  setSpellRank(slot: SpellSlot, rank: number): void {
    const maxRank = this._spells[slot]?.maxRank ?? (slot === 'R' ? 3 : 5);
    this._spellRanks[slot] = Math.max(1, Math.min(maxRank, Math.floor(rank)));
  }

  getSpellRank(slot: SpellSlot): number {
    return this._spellRanks[slot];
  }

  /**
   * Apply enhancement bonuses to a stats object.
   * This is a static utility method that can be used independently of champion instances.
   * @param baseStats - The base stats to enhance.
   * @param bonuses - Enhancement stat bonuses to apply.
   * @returns A new stats object with bonuses applied.
   */
  static applyEnhancementBonuses(
    baseStats: CalculatedStats,
    bonuses: EnhancementStatBonuses,
  ): CalculatedStats {
    return applySharedEnhancementBonuses(baseStats, bonuses);
  }

  private static applyStatMultiplier(stats: CalculatedStats, multiplier: number): CalculatedStats {
    if (multiplier === 1) return stats;
    return Object.fromEntries(
      Object.entries(stats).map(([key, value]) => [key, value * multiplier]),
    ) as unknown as CalculatedStats;
  }

  // ── Spells ───────────────────────────────────────────────────────────────

  /** Map of spell slots to their spell definitions. */
  get spells(): Readonly<SpellMap> {
    return this._spells;
  }

  /** Retrieve the spell in a specific slot. */
  getSpell(slot: SpellSlot): Spell | undefined {
    return this._spells[slot];
  }

  /** Retrieve the passive. */
  getPassive(): Passive {
    return this.passive;
  }

  // ── Cooldowns ────────────────────────────────────────────────────────────

  /**
   * Whether a spell slot is ready to use (cooldown is exhausted).
   * @param slot — spell slot to check.
   */
  isSpellReady(slot: SpellSlot): boolean {
    return this._cooldowns[slot] <= 0;
  }

  /**
   * Get the remaining cooldown turns for a spell slot.
   * @param slot — spell slot to check.
   */
  getCooldown(slot: SpellSlot): number {
    return this._cooldowns[slot];
  }

  /**
   * Get the base cooldown for a spell slot at its current rank.
   * @param slot — spell slot to check.
   * @returns The base cooldown value, or 0 if spell doesn't exist.
   */
  getMaxCooldown(slot: SpellSlot): number {
    const spell = this._spells[slot];
    if (!spell || spell.cooldownTurns.length === 0) return 0;
    return getRankValue(spell.cooldownTurns, this._spellRanks[slot]);
  }

  /**
   * Get the cooldown map (readonly snapshot).
   */
  getCooldowns(): Readonly<Record<SpellSlot, number>> {
    return { ...this._cooldowns };
  }

  /**
   * Use a spell: set its cooldown from the spell data at the current rank.
   * @param slot — spell slot to use.
   * @returns true if the spell was used (was ready), false if on cooldown.
   */
  useSpell(slot: SpellSlot, cooldownMultiplier = 1): boolean {
    const spell = this._spells[slot];
    if (!spell) return false;
    if (!this.isSpellReady(slot)) return false;

    const cooldownValue = getRankValue(spell.cooldownTurns, this._spellRanks[slot]);
    const scaledCooldown = cooldownValue * Math.max(0, cooldownMultiplier);
    this._cooldowns[slot] = cooldownValue <= 0 ? 0 : Math.max(1, Math.ceil(scaledCooldown));
    return true;
  }

  /**
   * Decrement all cooldowns by 1 (call at end of each turn).
   * Never goes below 0.
   */
  tickCooldowns(): void {
    for (const slot of SPELL_SLOTS) {
      this._cooldowns[slot] = Math.max(0, this._cooldowns[slot] - 1);
    }
  }

  /**
   * Reset all cooldowns to 0 (call at end of combat).
   */
  resetCooldowns(): void {
    for (const slot of SPELL_SLOTS) {
      this._cooldowns[slot] = 0;
    }
  }

  // ── Convenience ──────────────────────────────────────────────────────────

  /** Return a plain-object snapshot (useful for serialization / debugging). */
  toSnapshot(): ChampionSnapshot {
    return {
      id: this.id,
      name: this.name,
      title: this.title,
      level: this._level,
      tags: [...this.tags],
      stats: this.getStats(),
      spellIds: {
        Q: this._spells.Q?.id,
        W: this._spells.W?.id,
        E: this._spells.E?.id,
        R: this._spells.R?.id,
      },
      passiveName: this.passive.name,
      cooldowns: { ...this._cooldowns },
    };
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function clampLevel(level: number): number {
  return Math.max(1, Math.min(18, Math.floor(level)));
}

function getRankValue(values: readonly number[], rank: number): number {
  if (values.length === 0) return 0;
  return values[rank - 1] ?? values[values.length - 1] ?? 0;
}

// ── Supporting types ───────────────────────────────────────────────────────

export interface ChampionSnapshot {
  id: string;
  name: string;
  title: string;
  level: number;
  tags: ChampionTag[];
  stats: CalculatedStats;
  spellIds: Record<SpellSlot, string | undefined>;
  passiveName: string;
  cooldowns: Record<SpellSlot, number>;
}
