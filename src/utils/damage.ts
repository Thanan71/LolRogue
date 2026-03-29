/**
 * Damage Calculation Utilities
 *
 * Implements LoL-style damage formulas:
 *   AD damage    = AD × ratio − armor_reduction
 *   AP damage    = AP × ratio − mr_reduction
 *   True damage  = ignores all defenses
 *
 * Armor / MR reduction uses the standard LoL formula:
 *   reduction = rawDamage × (armor / (armor + 100))
 *   effective  = rawDamage − reduction
 *            = rawDamage × (100 / (100 + armor))
 */

// ─── Reduction Formulas ─────────────────────────────────────────────────────

/**
 * Calculate how much damage is **absorbed** by armor.
 *
 * @param rawDamage  Unmitigated physical damage
 * @param armor      Target's armor value
 * @returns          Amount of damage reduced (≥ 0)
 *
 * @example
 *   calculArmorReduction(100, 50) // → 33.33  (50 / 150 × 100)
 */
export function calculArmorReduction(rawDamage: number, armor: number): number {
  if (armor <= 0) return 0;
  return rawDamage * (armor / (armor + 100));
}

/**
 * Calculate how much damage is **absorbed** by magic resistance.
 *
 * @param rawDamage   Unmitigated magic damage
 * @param magicResist Target's magic resistance value
 * @returns           Amount of damage reduced (≥ 0)
 *
 * @example
 *   calculMReduction(100, 30) // → 23.08  (30 / 130 × 100)
 */
export function calculMReduction(rawDamage: number, magicResist: number): number {
  if (magicResist <= 0) return 0;
  return rawDamage * (magicResist / (magicResist + 100));
}

/**
 * Apply critical strike multiplier to a damage value.
 *
 * @param baseDamage     Base damage before crit
 * @param critMultiplier Damage multiplier on crit (default 2.0 = 200%)
 * @returns              Damage after crit multiplier
 *
 * @example
 *   critDamage(100)      // → 200
 *   critDamage(100, 1.75) // → 175
 */
export function critDamage(baseDamage: number, critMultiplier: number = 2.0): number {
  return baseDamage * critMultiplier;
}

// ─── Damage Type Formulas ───────────────────────────────────────────────────

/**
 * Calculate final AD (physical) damage after armor mitigation.
 *
 * Formula: (AD × ratio) − armor_reduction
 *        = AD × ratio × (100 / (100 + armor))
 *
 * @param ad     Attacker's attack damage
 * @param ratio  Ability/scaling ratio (e.g. 1.0 for basic attack, 1.3 for spell)
 * @param armor  Target's armor value
 * @returns      Final damage dealt (rounded, ≥ 0)
 */
export function calculateADDamage(ad: number, ratio: number, armor: number): number {
  const rawDamage = ad * ratio;
  const reduction = calculArmorReduction(rawDamage, armor);
  return Math.max(0, Math.round(rawDamage - reduction));
}

/**
 * Calculate final AP (magic) damage after magic resistance mitigation.
 *
 * Formula: (AP × ratio) − mr_reduction
 *        = AP × ratio × (100 / (100 + magicResist))
 *
 * @param ap          Ability power
 * @param ratio       Ability/scaling ratio
 * @param magicResist Target's magic resistance value
 * @returns           Final damage dealt (rounded, ≥ 0)
 */
export function calculateAPDamage(ap: number, ratio: number, magicResist: number): number {
  const rawDamage = ap * ratio;
  const reduction = calculMReduction(rawDamage, magicResist);
  return Math.max(0, Math.round(rawDamage - reduction));
}

/**
 * Calculate true damage — ignores all defenses (armor, MR, shields).
 *
 * @param damage Raw damage amount
 * @returns      Final damage (rounded, ≥ 0)
 */
export function calculateTrueDamage(damage: number): number {
  return Math.max(0, Math.round(damage));
}
