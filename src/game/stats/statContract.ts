import type { CalculatedStats } from '@/utils/champion';

/** The only stat vocabulary used by the combat model and UI. */
export type CanonicalStatKey = keyof CalculatedStats;
export type SecondaryStatKey =
  | 'armorPen'
  | 'magicPen'
  | 'lifesteal'
  | 'omnivamp'
  | 'tenacity'
  | 'abilityHaste';
export type GameplayStatKey = CanonicalStatKey | SecondaryStatKey;

export type StatModifierKind = 'flat' | 'additivePercent' | 'multiplier';

export interface CanonicalStatModifier {
  stat: CanonicalStatKey;
  kind: StatModifierKind;
  value: number;
}

export const CANONICAL_STAT_KEYS = [
  'hp',
  'mp',
  'moveSpeed',
  'armor',
  'magicResist',
  'attackDamage',
  'attackSpeed',
  'attackRange',
  'abilityPower',
  'hpRegen',
  'mpRegen',
  'crit',
] as const satisfies readonly CanonicalStatKey[];

const STAT_ALIASES: Readonly<Record<string, GameplayStatKey>> = {
  hp: 'hp',
  mp: 'mp',
  spd: 'moveSpeed',
  movespeed: 'moveSpeed',
  def: 'armor',
  armor: 'armor',
  mr: 'magicResist',
  magicresist: 'magicResist',
  atk: 'attackDamage',
  ad: 'attackDamage',
  attackdamage: 'attackDamage',
  as: 'attackSpeed',
  attackspeed: 'attackSpeed',
  attackrange: 'attackRange',
  ap: 'abilityPower',
  abilitypower: 'abilityPower',
  hpregen: 'hpRegen',
  mpregen: 'mpRegen',
  crit: 'crit',
  armorpen: 'armorPen',
  magicpen: 'magicPen',
  lifesteal: 'lifesteal',
  omnivamp: 'omnivamp',
  tenacity: 'tenacity',
  abilityhaste: 'abilityHaste',
};

export const STAT_LABELS: Readonly<Record<CanonicalStatKey, string>> = {
  hp: 'Points de vie',
  mp: 'Points de mana',
  moveSpeed: 'Vitesse de déplacement',
  armor: 'Armure',
  magicResist: 'Résistance magique',
  attackDamage: "Dégâts d'attaque",
  attackSpeed: "Initiative d'attaque",
  attackRange: 'Profil de portée',
  abilityPower: 'Puissance',
  hpRegen: 'Régénération PV',
  mpRegen: 'Régénération PM',
  crit: 'Chance de critique',
};

/** Legacy names are accepted only while decoding authored/persisted catalog data. */
export function normalizeGameplayStatKey(value: string): GameplayStatKey | null {
  return STAT_ALIASES[value.replace(/_/g, '').toLowerCase()] ?? null;
}

export function normalizeStatKey(value: string): CanonicalStatKey | null {
  const stat = normalizeGameplayStatKey(value);
  return stat && (CANONICAL_STAT_KEYS as readonly string[]).includes(stat)
    ? (stat as CanonicalStatKey)
    : null;
}

export function capStat(stat: CanonicalStatKey, value: number): number {
  if (!Number.isFinite(value)) return 0;
  switch (stat) {
    case 'hp':
      return Math.max(1, value);
    case 'mp':
    case 'abilityPower':
    case 'hpRegen':
    case 'mpRegen':
    case 'attackRange':
      return Math.max(0, value);
    case 'attackSpeed':
      return Math.max(0.1, Math.min(10, value));
    case 'moveSpeed':
      return Math.max(1, Math.min(1000, value));
    case 'crit':
      return Math.max(0, Math.min(100, value));
    case 'armor':
    case 'magicResist':
    case 'attackDamage':
      return value;
  }
}

/**
 * Stable order: sum flats, apply summed additive percentages once, then multiply.
 * A cap is applied exactly once at the end.
 */
export function applyCanonicalModifiers(
  base: CalculatedStats,
  modifiers: readonly CanonicalStatModifier[],
): CalculatedStats {
  const result = { ...base };
  const flat = Object.fromEntries(CANONICAL_STAT_KEYS.map((stat) => [stat, 0])) as Record<
    CanonicalStatKey,
    number
  >;
  const additivePercent = { ...flat };
  const multiplier = Object.fromEntries(CANONICAL_STAT_KEYS.map((stat) => [stat, 1])) as Record<
    CanonicalStatKey,
    number
  >;
  for (const modifier of modifiers) {
    if (modifier.kind === 'flat') flat[modifier.stat] += modifier.value;
    else if (modifier.kind === 'additivePercent') additivePercent[modifier.stat] += modifier.value;
    else multiplier[modifier.stat] *= modifier.value;
  }
  for (const stat of CANONICAL_STAT_KEYS) {
    result[stat] = capStat(
      stat,
      (base[stat] + flat[stat]) * (1 + additivePercent[stat]) * multiplier[stat],
    );
  }
  return result;
}

export function formatStatValue(stat: CanonicalStatKey, value: number): string {
  const digits = stat === 'attackSpeed' ? 2 : 0;
  return value.toLocaleString('fr-FR', { maximumFractionDigits: digits });
}
