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
}
