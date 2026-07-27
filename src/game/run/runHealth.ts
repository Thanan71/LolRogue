/** Missing persisted HP always means that the champion is healthy at maximum HP. */
export function getEffectiveRunHp(currentHp: number | undefined, maxHp: number): number {
  return Math.min(maxHp, Math.max(0, currentHp ?? maxHp));
}

/** Positive healing events intentionally revive KO champions, matching the authority engine. */
export function applyRunHeal(
  currentHp: number | undefined,
  maxHp: number,
  healPercent: number,
): number {
  const effectiveHp = getEffectiveRunHp(currentHp, maxHp);
  return Math.min(maxHp, effectiveHp + Math.floor(maxHp * Math.max(0, healPercent)));
}

/** A stat change materializes implicit full HP but preserves explicit wounds and KO state. */
export function materializeRunHpAfterStatChange(
  currentHp: number | undefined,
  newMaxHp: number,
): number {
  return getEffectiveRunHp(currentHp, newMaxHp);
}
