/** Convert either a fraction (0.3) or a human percentage (30) to a fraction. */
export function normalizePercent(value: number | undefined, fallback = 0): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  const fraction = Math.abs(value) > 1 ? value / 100 : value;
  return Math.max(-1, Math.min(10, fraction));
}

/** Durations from champion data are seconds; combat resolves them as whole owner turns. */
export function normalizeTurnDuration(value: number | undefined, fallback = 1): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  if (value <= 0) return 0;
  return Math.max(1, Math.ceil(value));
}

/** Thresholds are always constrained to a valid HP fraction. */
export function normalizeThreshold(value: number | undefined, fallback = 0): number {
  return Math.max(0, Math.min(1, normalizePercent(value, fallback)));
}
