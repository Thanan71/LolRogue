/**
 * ChampionInstance — runtime wrapper around a Champion definition.
 *
 * Tracks the current level, exposes spells keyed by slot (Q/W/E/R),
 * and computes level-scaled stats using the LoL growth formula.
 */

import type { Champion, ChampionStats, Spell, Passive, ChampionTag, ResourceType } from '@/types';
import { calculateStats, type CalculatedStats } from '@/utils/champion';

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

  constructor(champion: Champion, startingLevel = 1) {
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

    // Map the spells array [Q, W, E, R] to the slot keys.
    // Data Dragon always provides 4 spells in order: Q, W, E, R.
    this._spells = {};
    for (let i = 0; i < SPELL_SLOTS.length && i < champion.spells.length; i++) {
      this._spells[SPELL_SLOTS[i]] = { ...champion.spells[i] };
    }

    // Initialize all cooldowns to 0 (ready)
    this._cooldowns = { Q: 0, W: 0, E: 0, R: 0 };
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
    return calculateStats(this.baseStats, this._level);
  }

  /** Compute stats at an arbitrary level without changing current level. */
  getStatsAtLevel(level: number): CalculatedStats {
    return calculateStats(this.baseStats, clampLevel(level));
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
   * Whether a spell slot is ready to use (cooldown is 0).
   * @param slot — spell slot to check.
   */
  isSpellReady(slot: SpellSlot): boolean {
    return this._cooldowns[slot] === 0;
  }

  /**
   * Get the remaining cooldown turns for a spell slot.
   * @param slot — spell slot to check.
   */
  getCooldown(slot: SpellSlot): number {
    return this._cooldowns[slot];
  }

  /**
   * Get the cooldown map (readonly snapshot).
   */
  getCooldowns(): Readonly<Record<SpellSlot, number>> {
    return { ...this._cooldowns };
  }

  /**
   * Use a spell: set its cooldown from the spell data (rank 0 index).
   * @param slot — spell slot to use.
   * @returns true if the spell was used (was ready), false if on cooldown.
   */
  useSpell(slot: SpellSlot): boolean {
    const spell = this._spells[slot];
    if (!spell) return false;
    if (!this.isSpellReady(slot)) return false;

    // Set cooldown from the first cooldown value (rank 0)
    // If cooldown array is empty or missing, set to 0
    const cooldownValue = spell.cooldown[0] ?? 0;
    this._cooldowns[slot] = cooldownValue;
    return true;
  }

  /**
   * Decrement all cooldowns by 1 (call at end of each turn).
   * Never goes below 0.
   */
  tickCooldowns(): void {
    for (const slot of SPELL_SLOTS) {
      if (this._cooldowns[slot] > 0) {
        this._cooldowns[slot] -= 1;
      }
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
