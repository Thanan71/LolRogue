import type { EnhancementStatBonuses } from '@/types/enhancementTree';

/** Tree contributions in points, before battle state and temporary effects. */
export interface EnhancementSecondaryStats {
  armorPen: number;
  magicPen: number;
  lifesteal: number;
  omnivamp: number;
  tenacity: number;
  abilityHaste: number;
}

const points = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) ? Math.max(0, value) : 0;

/** Other secondary percentages are intentionally ignored: the runtime never consumed them. */
export function getEnhancementSecondaryStats(
  bonuses: EnhancementStatBonuses | undefined,
): EnhancementSecondaryStats {
  return {
    armorPen: points(bonuses?.flat.armorPen),
    magicPen: points(bonuses?.flat.magicPen),
    lifesteal: points(bonuses?.flat.lifesteal),
    omnivamp: points(bonuses?.flat.omnivamp),
    tenacity: points(bonuses?.flat.tenacity),
    abilityHaste: points(
      (bonuses?.flat.abilityHaste ?? 0) + (bonuses?.percent.abilityHaste ?? 0) * 100,
    ),
  };
}

export function enhancementCooldownMultiplier(
  stats: EnhancementSecondaryStats,
  ultimateReduction = 0,
): number {
  const reduction = Number.isFinite(ultimateReduction)
    ? Math.max(0, Math.min(1, ultimateReduction))
    : 0;
  return Math.max(0.1, (100 / (100 + points(stats.abilityHaste))) * (1 - reduction));
}

export function enhancementCrowdControlMultiplier(stats: EnhancementSecondaryStats): number {
  return Math.max(0.2, 1 - points(stats.tenacity) / 100);
}
